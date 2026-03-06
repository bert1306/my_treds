"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  getTopPresetsForRole,
  getPresetIdFromCollected,
  getPresetById,
  getDetailLevelOptionsForPreset,
  getDetailLevelLabel,
  getRoleLabel,
  ROLE_OPTIONS,
} from "@/lib/wizard";

const DEVICE_ID_KEY = "help-prompt-device-id";

function getDeviceId(): string {
  if (typeof window === "undefined") return "";
  let id = localStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    id = crypto.randomUUID?.() ?? `dev-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    localStorage.setItem(DEVICE_ID_KEY, id);
  }
  return id;
}

type Message = { id: string; role: "user" | "assistant"; content: string; createdAt: string };
type SessionItem = { id: string; title: string; isFavorite: boolean; createdAt: string };

type WizardStepData = {
  stepIndex: number;
  totalSteps?: number;
  type: "choice" | "text";
  question: string;
  dataKey: string;
  options?: { label: string; value: string }[];
  optional?: boolean;
};

type WizardState =
  | null
  | { completed: true }
  | { completed: false; step: WizardStepData };

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [headerOpaque, setHeaderOpaque] = useState(false);
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [dialogsOpen, setDialogsOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deviceId, setDeviceId] = useState("");
  const [wizardStep, setWizardStep] = useState<WizardState>(null);
  const [wizardLoading, setWizardLoading] = useState(false);
  const [wizardInput, setWizardInput] = useState("");
  const [profileName, setProfileName] = useState("");
  const [profileRole, setProfileRole] = useState<string | null>(null);
  const [currentPresetId, setCurrentPresetId] = useState<string | null>(null);
  const [generatedPrompt, setGeneratedPrompt] = useState<string | null>(null);
  const [promptLoading, setPromptLoading] = useState(false);
  const [sessionCollected, setSessionCollected] = useState<Record<string, string> | null>(null);
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [editForm, setEditForm] = useState<{ role: string; detailLevel: string; context: string }>({ role: "", detailLevel: "", context: "" });
  const [copyFeedback, setCopyFeedback] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const promptTextRef = useRef<HTMLDivElement>(null);
  const areaRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setDeviceId(getDeviceId());
  }, []);

  const fetchSessions = useCallback(async () => {
    const id = deviceId || getDeviceId();
    if (!id) return;
    try {
      const res = await fetch(`/api/sessions?deviceId=${encodeURIComponent(id)}`);
      const data = (await res.json()) as { sessions?: SessionItem[] };
      setSessions(data.sessions ?? []);
    } catch {
      setSessions([]);
    }
  }, [deviceId]);

  useEffect(() => {
    if (deviceId) fetchSessions();
  }, [deviceId, fetchSessions]);

  useEffect(() => {
    if (!deviceId) return;
    fetch(`/api/profile?deviceId=${encodeURIComponent(deviceId)}`)
      .then((res) => res.json())
      .then((data: { name?: string; role?: string }) => {
        setProfileName(data.name?.trim() ?? "");
        setProfileRole(data.role?.trim() ?? null);
      })
      .catch(() => {});
  }, [deviceId]);

  // Мастер: загрузить текущий шаг, когда есть сессия и нет сообщений
  useEffect(() => {
    if (!sessionId || messages.length > 0) {
      setWizardStep(null);
      return;
    }
    const devId = deviceId || getDeviceId();
    if (!devId) {
      setWizardStep({ completed: true });
      return;
    }
    let cancelled = false;
    setWizardStep(null);
    (async () => {
      try {
        const res = await fetch(`/api/sessions/${sessionId}/wizard/step?deviceId=${encodeURIComponent(devId)}`);
        if (res.status === 403 || res.status === 404) {
          if (!cancelled) goToMainMenu();
          return;
        }
        const data = (await res.json()) as { completed?: boolean; step?: WizardStepData };
        if (cancelled) return;
        if (data.completed) {
          setWizardStep({ completed: true });
        } else if (data.step) {
          setWizardStep({ completed: false, step: data.step });
        } else {
          setWizardStep({ completed: true });
        }
      } catch {
        if (!cancelled) setWizardStep({ completed: true });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionId, messages.length, deviceId]);

  // После завершения мастера — загрузить сгенерированный промпт для предпросмотра
  useEffect(() => {
    if (!sessionId || !wizardStep?.completed || messages.length > 0) {
      setGeneratedPrompt(null);
      return;
    }
    const devId = deviceId || getDeviceId();
    if (!devId) return;
    let cancelled = false;
    setPromptLoading(true);
    const params = new URLSearchParams({ deviceId: devId });
    if (currentPresetId) params.set("presetId", currentPresetId);
    fetch(`/api/sessions/${sessionId}/prompt?${params}`)
      .then((res) => {
        if (res.status === 403 || res.status === 404) return null;
        return res.json();
      })
      .then((data: { prompt?: string } | null) => {
        if (!cancelled && data?.prompt) setGeneratedPrompt(data.prompt);
        else if (!cancelled) setGeneratedPrompt(null);
      })
      .catch(() => {
        if (!cancelled) setGeneratedPrompt(null);
      })
      .finally(() => {
        if (!cancelled) setPromptLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [sessionId, wizardStep?.completed, messages.length, deviceId, currentPresetId]);

  // Загрузить данные мастера для отображения «Параметры промпта» и редактирования (когда уже есть сообщения)
  useEffect(() => {
    if (!sessionId || !deviceId || messages.length === 0) {
      setSessionCollected(null);
      return;
    }
    let cancelled = false;
    fetch(`/api/sessions/${sessionId}/collected-data?deviceId=${encodeURIComponent(deviceId)}`)
      .then((res) => (res.status === 200 ? res.json() : null))
      .then((data: { collected?: Record<string, string> } | null) => {
        if (!cancelled && data?.collected) setSessionCollected(data.collected);
      })
      .catch(() => {
        if (!cancelled) setSessionCollected(null);
      });
    return () => { cancelled = true; };
  }, [sessionId, deviceId, messages.length]);

  const openSettingsModal = () => {
    if (sessionCollected) {
      setEditForm({
        role: sessionCollected.role ?? "",
        detailLevel: sessionCollected.detailLevel ?? "",
        context: sessionCollected.context ?? "",
      });
    }
    setSettingsModalOpen(true);
  };

  useEffect(() => {
    if (settingsModalOpen && sessionCollected) {
      setEditForm({
        role: sessionCollected.role ?? "",
        detailLevel: sessionCollected.detailLevel ?? "",
        context: sessionCollected.context ?? "",
      });
    }
  }, [settingsModalOpen, sessionCollected]);

  async function saveSettings() {
    if (!sessionId) return;
    const devId = deviceId || getDeviceId();
    setSettingsSaving(true);
    try {
      const res = await fetch(`/api/sessions/${sessionId}/collected-data`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deviceId: devId,
          collected: {
            role: editForm.role,
            detailLevel: editForm.detailLevel,
            context: editForm.context,
          },
        }),
      });
      if (res.status === 403 || res.status === 404) {
        setSettingsModalOpen(false);
        return;
      }
      const data = (await res.json()) as { collected?: Record<string, string> };
      if (data.collected) {
        setSessionCollected(data.collected);
        setSettingsModalOpen(false);
        setGeneratedPrompt(null);
        const params = new URLSearchParams({ deviceId: devId });
        if (currentPresetId) params.set("presetId", currentPresetId);
        const promptRes = await fetch(`/api/sessions/${sessionId}/prompt?${params}`);
        if (promptRes.ok) {
          const promptData = (await promptRes.json()) as { prompt?: string };
          if (promptData.prompt) setGeneratedPrompt(promptData.prompt);
        }
      }
    } finally {
      setSettingsSaving(false);
    }
  }

  const scrollToBottom = () => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });

  useEffect(() => {
    if (messages.length) scrollToBottom();
  }, [messages]);

  useEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    const onScroll = () => setHeaderOpaque(el.scrollTop > 24);
    onScroll();
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  const getInputMaxHeight = () => Math.min(typeof window !== "undefined" ? window.innerHeight * 0.5 : 400, 400);

  function adjustTextareaHeight() {
    const ta = textareaRef.current;
    if (!ta) return;
    const maxH = getInputMaxHeight();
    ta.style.maxHeight = `${maxH}px`;
    ta.style.height = "auto";
    const h = Math.min(ta.scrollHeight, maxH);
    ta.style.height = `${h}px`;
    ta.style.overflowY = h >= maxH ? "auto" : "hidden";
  }

  useEffect(() => {
    const t = requestAnimationFrame(() => adjustTextareaHeight);
    return () => cancelAnimationFrame(t);
  }, [input]);

  useEffect(() => {
    const onResize = () => adjustTextareaHeight();
    window.addEventListener("resize", onResize);
    const vv = typeof window !== "undefined" && window.visualViewport;
    if (vv) {
      vv.addEventListener("resize", onResize);
      vv.addEventListener("scroll", onResize);
    }
    return () => {
      window.removeEventListener("resize", onResize);
      if (vv) {
        vv.removeEventListener("resize", onResize);
        vv.removeEventListener("scroll", onResize);
      }
    };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || loading) return;
    const devId = deviceId || getDeviceId();
    setInput("");
    const userMsg: Message = {
      id: `u-${Date.now()}`,
      role: "user",
      content: text,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setLoading(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, sessionId, deviceId: devId }),
      });
      if (res.status === 403 || res.status === 404) {
        setMessages((prev) => prev.slice(0, -1));
        goToMainMenu();
        setLoading(false);
        return;
      }
      const data = (await res.json()) as { reply?: string; sessionId?: string };
      if (data.sessionId) {
        setSessionId(data.sessionId);
        fetchSessions();
      }
      const reply: Message = {
        id: `a-${Date.now()}`,
        role: "assistant",
        content: data.reply ?? "Нет ответа.",
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, reply]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { id: `e-${Date.now()}`, role: "assistant", content: "Ошибка сети.", createdAt: new Date().toISOString() },
      ]);
    } finally {
      setLoading(false);
    }
  }

  const hasMessages = messages.length > 0;

  function goToMainMenu() {
    setMessages([]);
    setSessionId(null);
    setWizardStep(null);
    setWizardInput("");
    setCurrentPresetId(null);
    setGeneratedPrompt(null);
    setDialogsOpen(false);
    areaRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }

  /** Создать пустую сессию и показать мастер (настройка перед чатом) */
  async function startWizard() {
    const devId = deviceId || getDeviceId();
    if (!devId) return;
    setWizardLoading(true);
    try {
      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceId: devId }),
      });
      const data = (await res.json()) as { sessionId?: string };
      if (data.sessionId) {
        setSessionId(data.sessionId);
        setMessages([]);
        setWizardInput("");
        setCurrentPresetId(null);
        setGeneratedPrompt(null);
        fetchSessions();
      }
    } finally {
      setWizardLoading(false);
    }
  }

  /** Топовый запрос: создать сессию, применить пресет (goal + goalDetail), показать мастер с оставшимися шагами */
  async function startWizardWithPreset(presetId: string) {
    const devId = deviceId || getDeviceId();
    if (!devId) return;
    setWizardLoading(true);
    try {
      const sessionRes = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceId: devId }),
      });
      const sessionData = (await sessionRes.json()) as { sessionId?: string };
      const sid = sessionData.sessionId;
      if (!sid) {
        setWizardLoading(false);
        return;
      }
      setSessionId(sid);
      setMessages([]);
      setWizardInput("");
      setCurrentPresetId(presetId);
      setGeneratedPrompt(null);
      fetchSessions();
      const presetRes = await fetch(`/api/sessions/${sid}/wizard/preset`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preset: presetId, deviceId: devId }),
      });
      if (presetRes.status === 403 || presetRes.status === 404) {
        goToMainMenu();
        setWizardLoading(false);
        return;
      }
      const presetData = (await presetRes.json()) as {
        completed?: boolean;
        step?: WizardStepData;
      };
      if (presetData.completed) {
        setWizardStep({ completed: true });
      } else if (presetData.step) {
        setWizardStep({ completed: false, step: presetData.step });
      } else {
        setWizardStep({ completed: true });
      }
    } finally {
      setWizardLoading(false);
    }
  }

  async function submitWizardStep(value: string) {
    if (!sessionId || !wizardStep || wizardStep.completed) return;
    const devId = deviceId || getDeviceId();
    setWizardLoading(true);
    try {
      const res = await fetch(`/api/sessions/${sessionId}/wizard/step`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value, deviceId: devId }),
      });
      if (res.status === 403 || res.status === 404) {
        goToMainMenu();
        return;
      }
      const data = (await res.json()) as { completed?: boolean; step?: WizardStepData };
      if (data.completed) {
        setWizardStep({ completed: true });
        setWizardInput("");
      } else if (data.step) {
        setWizardStep({ completed: false, step: data.step });
        setWizardInput("");
      }
    } finally {
      setWizardLoading(false);
    }
  }

  async function openDialog(id: string) {
    setDialogsOpen(false);
    const devId = deviceId || getDeviceId();
    try {
      const res = await fetch(`/api/sessions/${id}/messages?deviceId=${encodeURIComponent(devId)}`);
      if (res.status === 403 || res.status === 404) {
        goToMainMenu();
        fetchSessions();
        return;
      }
      const data = (await res.json()) as { messages?: Message[] };
      const list = (data.messages ?? []).map((m) => ({
        ...m,
        role: m.role as "user" | "assistant",
      }));
      setSessionId(id);
      setMessages(list);
    } catch {
      setMessages([]);
    }
  }

  async function toggleFavorite(s: SessionItem, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const devId = deviceId || getDeviceId();
    try {
      const res = await fetch(`/api/sessions/${s.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isFavorite: !s.isFavorite, deviceId: devId }),
      });
      if (res.status === 403 || res.status === 404) {
        fetchSessions();
        return;
      }
      fetchSessions();
    } catch {}
  }

  function startRename(s: SessionItem, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setEditingId(s.id);
    setEditTitle(s.title);
  }

  async function submitRename() {
    if (!editingId) return;
    const title = editTitle.trim() || "Без названия";
    const devId = deviceId || getDeviceId();
    try {
      const res = await fetch(`/api/sessions/${editingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, deviceId: devId }),
      });
      if (res.status === 403 || res.status === 404) {
        setEditingId(null);
        setEditTitle("");
        fetchSessions();
        return;
      }
      fetchSessions();
    } catch {}
    setEditingId(null);
    setEditTitle("");
  }

  function requestDeleteDialog(id: string, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setDeleteConfirmId(id);
  }

  async function confirmDelete() {
    const id = deleteConfirmId;
    if (!id) return;
    setDeleteConfirmId(null);
    const devId = deviceId || getDeviceId();
    try {
      const res = await fetch(`/api/sessions/${id}?deviceId=${encodeURIComponent(devId)}`, { method: "DELETE" });
      if (res.status === 403 || res.status === 404) {
        if (sessionId === id) goToMainMenu();
        fetchSessions();
        setDialogsOpen(false);
        return;
      }
      if (sessionId === id) goToMainMenu();
      fetchSessions();
      setDialogsOpen(false);
    } catch {}
  }

  const dialogsList = (
    <div className="flex flex-col h-full">
      <div className="p-2 border-b border-[rgba(42,91,111,0.1)] flex items-center justify-between shrink-0">
        <span className="font-semibold text-[var(--color-secondary)] text-sm">Диалоги</span>
        <button
          type="button"
          onClick={() => setDialogsOpen(false)}
          className="md:hidden p-2 rounded-lg text-[var(--color-secondary)] hover:bg-[rgba(42,91,111,0.08)]"
          aria-label="Закрыть"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
        </button>
      </div>
      <ul className="flex-1 overflow-y-auto p-2 space-y-1">
        <li className="mb-2">
          <button
            type="button"
            onClick={() => { setDialogsOpen(false); startWizard(); }}
            disabled={wizardLoading}
            className="w-full rounded-xl px-3 py-2.5 text-sm font-medium text-[var(--color-primary)] border-2 border-[var(--color-primary)] hover:bg-[var(--color-primary)]/10 transition disabled:opacity-60"
          >
            + Новый диалог
          </button>
        </li>
        {sessions.length === 0 && (
          <li className="text-sm text-[var(--color-text-muted)] py-4 text-center">Пока нет сохранённых диалогов</li>
        )}
        {sessions.map((s) => (
          <li key={s.id} className="group relative">
            {editingId === s.id ? (
              <div className="flex items-center gap-1 p-2 rounded-xl bg-[var(--color-bg)]">
                <input
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") submitRename(); if (e.key === "Escape") { setEditingId(null); setEditTitle(""); } }}
                  className="flex-1 min-w-0 text-sm border border-[var(--color-input-border)] rounded-lg px-2 py-1.5 outline-none focus:border-[var(--color-primary)]"
                  autoFocus
                />
                <button type="button" onClick={submitRename} className="text-xs px-2 py-1 rounded bg-[var(--color-primary)] text-white">Ок</button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => openDialog(s.id)}
                className={`w-full text-left p-3 rounded-xl transition flex items-center gap-2 ${sessionId === s.id ? "bg-[var(--color-primary)]/20 border border-[var(--color-primary)]" : "hover:bg-[rgba(42,91,111,0.06)]"}`}
              >
                <button
                  type="button"
                  onClick={(e) => toggleFavorite(s, e)}
                  className="shrink-0 p-0.5 rounded opacity-70 hover:opacity-100"
                  aria-label={s.isFavorite ? "Убрать из избранного" : "В избранное"}
                  title={s.isFavorite ? "Убрать из избранного" : "В избранное"}
                >
                  {s.isFavorite ? (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
                  ) : (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
                  )}
                </button>
                <span className="flex-1 min-w-0 truncate text-sm text-[var(--color-secondary)]">{s.title}</span>
                <span className="text-[10px] text-[var(--color-text-muted)] shrink-0">
                  {new Date(s.createdAt).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" })}
                </span>
                <div className="flex shrink-0 gap-0.5">
                  <button type="button" onClick={(e) => startRename(s, e)} className="p-1 rounded text-[var(--color-secondary)] hover:bg-[rgba(42,91,111,0.1)]" title="Переименовать" aria-label="Переименовать">✎</button>
                  <button type="button" onClick={(e) => requestDeleteDialog(s.id, e)} className="p-1 rounded text-red-600 hover:bg-red-50" title="Удалить" aria-label="Удалить">×</button>
                </div>
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );

  const inputBlock = (
    <div className="w-full min-w-0 bg-[var(--color-bg)] rounded-[24px] px-3 sm:px-4 py-2 flex items-end gap-2 border-2 border-[var(--color-input-border)] focus-within:border-[var(--color-primary)] transition-colors">
      <form onSubmit={handleSubmit} className="help-prompt-input-wrap flex-1 min-w-0 flex items-end gap-2">
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onFocus={() => setTimeout(adjustTextareaHeight, 100)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSubmit(e); } }}
          placeholder="Сообщение..."
          rows={1}
          className="help-prompt-textarea w-full min-w-0 min-h-[44px] resize-none border-0 bg-transparent py-3 text-base outline-none placeholder:opacity-50"
          disabled={loading}
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="h-10 w-10 shrink-0 rounded-full bg-[var(--color-primary)] flex items-center justify-center text-white disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[var(--color-primary-hover)] active:scale-95"
          aria-label="Отправить"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/></svg>
        </button>
      </form>
    </div>
  );

  return (
    <div className="h-dvh min-h-screen flex overflow-hidden">
      {/* Десктоп: боковая панель диалогов */}
      <aside
        className="dialogs-sidebar hidden md:flex flex-col w-60 shrink-0 h-dvh border-r border-[rgba(42,91,111,0.1)] bg-[var(--color-surface)]"
        style={{ paddingTop: "var(--header-height)" }}
      >
        {dialogsList}
      </aside>

      {/* Мобильный: оверлей со списком диалогов */}
      {dialogsOpen && (
        <div className="fixed inset-0 z-30 md:hidden bg-black/40" onClick={() => setDialogsOpen(false)} aria-hidden>
          <div
            className="absolute inset-y-0 left-0 w-[min(100%,320px)] bg-[var(--color-surface)] shadow-xl flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {dialogsList}
          </div>
        </div>
      )}

      {/* Модалка подтверждения удаления диалога */}
      {deleteConfirmId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30"
          onClick={() => setDeleteConfirmId(null)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-dialog-title"
        >
          <div
            className="confirm-modal w-full max-w-sm bg-[var(--color-surface)] rounded-[var(--radius-xl)] shadow-[var(--shadow-md)] border border-[rgba(42,91,111,0.1)] p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="delete-dialog-title" className="text-lg font-semibold text-[var(--color-secondary)] mb-2">
              Удалить диалог?
            </h2>
            <p className="text-sm text-[var(--color-text-muted)] mb-6">
              Это действие нельзя отменить.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                type="button"
                onClick={() => setDeleteConfirmId(null)}
                className="px-4 py-2.5 rounded-xl text-sm font-medium text-[var(--color-secondary)] bg-[var(--color-bg)] hover:bg-[rgba(42,91,111,0.08)] transition"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                className="px-4 py-2.5 rounded-xl text-sm font-medium text-white bg-[var(--color-danger)] hover:bg-[var(--color-danger-hover)] transition"
              >
                Удалить
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Модалка редактирования настроек промпта (роль, детализация, контекст) */}
      {settingsModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30"
          onClick={() => !settingsSaving && setSettingsModalOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="settings-dialog-title"
        >
          <div
            className="w-full max-w-md bg-[var(--color-surface)] rounded-2xl shadow-lg border border-[rgba(42,91,111,0.1)] p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="settings-dialog-title" className="text-lg font-semibold text-[var(--color-secondary)] mb-4">
              Изменить настройки промпта
            </h2>
            <p className="text-sm text-[var(--color-text-muted)] mb-4">
              Следующие сообщения в чате будут учитывать новые параметры.
            </p>
            {sessionCollected ? (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-[var(--color-secondary)] mb-1.5">Роль</label>
                  <select
                    value={editForm.role}
                    onChange={(e) => setEditForm((f) => ({ ...f, role: e.target.value }))}
                    className="w-full rounded-xl border-2 border-[var(--color-input-border)] bg-[var(--color-bg)] px-4 py-2.5 text-sm text-[var(--color-secondary)] focus:border-[var(--color-primary)] outline-none"
                  >
                    {ROLE_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-[var(--color-secondary)] mb-1.5">Уровень детализации</label>
                  <select
                    value={editForm.detailLevel}
                    onChange={(e) => setEditForm((f) => ({ ...f, detailLevel: e.target.value }))}
                    className="w-full rounded-xl border-2 border-[var(--color-input-border)] bg-[var(--color-bg)] px-4 py-2.5 text-sm text-[var(--color-secondary)] focus:border-[var(--color-primary)] outline-none"
                  >
                    {getDetailLevelOptionsForPreset(getPresetIdFromCollected(sessionCollected)).map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-[var(--color-secondary)] mb-1.5">Контекст (тема, текст)</label>
                  <textarea
                    value={editForm.context}
                    onChange={(e) => setEditForm((f) => ({ ...f, context: e.target.value }))}
                    placeholder="Необязательно"
                    rows={3}
                    className="w-full rounded-xl border-2 border-[var(--color-input-border)] bg-[var(--color-bg)] px-4 py-2.5 text-sm text-[var(--color-secondary)] placeholder:opacity-50 focus:border-[var(--color-primary)] outline-none resize-y"
                  />
                </div>
                <div className="flex gap-3 justify-end pt-2">
                  <button
                    type="button"
                    onClick={() => !settingsSaving && setSettingsModalOpen(false)}
                    disabled={settingsSaving}
                    className="px-4 py-2.5 rounded-xl text-sm font-medium text-[var(--color-secondary)] bg-[var(--color-bg)] hover:bg-[rgba(42,91,111,0.08)] transition disabled:opacity-60"
                  >
                    Отмена
                  </button>
                  <button
                    type="button"
                    onClick={saveSettings}
                    disabled={settingsSaving}
                    className="px-4 py-2.5 rounded-xl text-sm font-medium text-white bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] transition disabled:opacity-60"
                  >
                    {settingsSaving ? "Сохранение…" : "Сохранить"}
                  </button>
                </div>
              </div>
            ) : (
              <p className="text-sm text-[var(--color-text-muted)] py-4">Загрузка параметров…</p>
            )}
          </div>
        </div>
      )}

      <div className="flex-1 flex flex-col min-w-0">
        <header
          className={`header-bar fixed top-0 left-0 right-0 md:left-60 flex-shrink-0 flex items-center justify-between px-4 md:px-6 z-20 transition-[background-color,border-color] duration-200 ${headerOpaque ? "header-bar-opaque" : ""}`}
        >
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setDialogsOpen((o) => !o)}
              className="md:hidden p-2 rounded-xl text-[var(--color-secondary)] hover:bg-[rgba(42,91,111,0.08)]"
              aria-label="Диалоги"
              title="Диалоги"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
            </button>
            {hasMessages && (
              <button
                type="button"
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); goToMainMenu(); }}
                className="hidden md:flex items-center gap-2 rounded-xl px-2 py-2 text-sm font-medium text-[var(--color-secondary)] hover:bg-[rgba(42,91,111,0.08)] transition cursor-pointer"
                title="В главное меню"
                aria-label="В главное меню"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
                <span className="hidden sm:inline">В меню</span>
              </button>
            )}
            <button
              type="button"
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); goToMainMenu(); }}
              className="text-lg font-semibold text-[var(--color-secondary)] hover:opacity-80 transition-opacity cursor-pointer"
              title="На главную"
              aria-label="На главную"
            >
              Help Prompt
            </button>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/profile"
              className="rounded-xl px-3 py-1.5 text-sm font-medium text-[var(--color-secondary)] hover:bg-[rgba(42,91,111,0.08)]"
            >
              Профиль
            </Link>
            {hasMessages && (
              <button
                type="button"
                onClick={(e) => { e.preventDefault(); goToMainMenu(); }}
                className="rounded-xl px-3 py-1.5 text-sm font-medium text-[var(--color-secondary)] hover:bg-[rgba(42,91,111,0.08)] cursor-pointer"
              >
                Новый чат
              </button>
            )}
          </div>
        </header>

        <div ref={areaRef} className="messages-area flex-1 min-h-0">
          {/* Мастер: настройка перед чатом (5 шагов) */}
          {wizardStep && !wizardStep.completed && wizardStep.step && (
            <div className="max-w-[560px] mx-auto py-10 px-6">
              <div className="flex items-center justify-between gap-4 mb-4">
                <p className="text-sm text-[var(--color-text-muted)]">
                  Шаг {wizardStep.step.stepIndex + 1} из {wizardStep.step.totalSteps ?? 5}
                </p>
                <button
                  type="button"
                  onClick={goToMainMenu}
                  className="text-sm text-[var(--color-text-muted)] hover:text-[var(--color-secondary)]"
                >
                  Отменить
                </button>
              </div>
              <h2 className="text-xl font-semibold text-[var(--color-secondary)] mb-6">
                {wizardStep.step.question}
              </h2>
              {wizardStep.step.type === "choice" && wizardStep.step.options && (
                <div className="flex flex-col gap-2">
                  {wizardStep.step.options.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      disabled={wizardLoading}
                      onClick={() => submitWizardStep(opt.value)}
                      className="rounded-2xl bg-[var(--color-surface)] p-4 text-left text-sm font-medium text-[var(--color-secondary)] shadow-[var(--shadow-sm)] hover:border-2 hover:border-[var(--color-primary)] hover:-translate-y-0.5 transition disabled:opacity-60"
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              )}
              {wizardStep.step.type === "text" && (
                <div className="space-y-3">
                  <textarea
                    value={wizardInput}
                    onChange={(e) => setWizardInput(e.target.value)}
                    placeholder="Введите контекст или оставьте пустым"
                    rows={4}
                    className="w-full rounded-2xl border-2 border-[var(--color-input-border)] bg-[var(--color-bg)] px-4 py-3 text-base text-[var(--color-secondary)] placeholder:opacity-50 focus:border-[var(--color-primary)] outline-none resize-y min-h-[100px]"
                    disabled={wizardLoading}
                  />
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={wizardLoading}
                      onClick={() => submitWizardStep(wizardInput)}
                      className="rounded-xl px-4 py-2.5 text-sm font-medium bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary-hover)] disabled:opacity-60"
                    >
                      Далее
                    </button>
                    {wizardStep.step.optional && (
                      <button
                        type="button"
                        disabled={wizardLoading}
                        onClick={() => submitWizardStep("")}
                        className="rounded-xl px-4 py-2.5 text-sm font-medium text-[var(--color-secondary)] bg-[var(--color-bg)] hover:bg-[rgba(42,91,111,0.08)] disabled:opacity-60"
                      >
                        Пропустить
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {sessionId && wizardStep?.completed && !hasMessages && (
            <div className="max-w-[640px] mx-auto py-8 px-6">
              <h2 className="text-lg font-semibold text-[var(--color-secondary)] mb-3">
                Ваш промпт
              </h2>
              {promptLoading ? (
                <div className="rounded-2xl bg-[var(--color-surface)] p-5 text-sm text-[var(--color-text-muted)]">
                  Загрузка…
                </div>
              ) : generatedPrompt ? (
                <div className="space-y-3">
                  <div
                    ref={promptTextRef}
                    className="rounded-2xl bg-[var(--color-surface)] p-5 text-sm text-[var(--color-secondary)] whitespace-pre-wrap border border-[rgba(42,91,111,0.1)]"
                  >
                    {generatedPrompt}
                  </div>
                  <button
                    type="button"
                    onClick={async () => {
                      if (!generatedPrompt) return;
                      try {
                        if (navigator.clipboard?.writeText) {
                          await navigator.clipboard.writeText(generatedPrompt);
                        } else {
                          const ta = document.createElement("textarea");
                          ta.value = generatedPrompt;
                          ta.setAttribute("readonly", "");
                          ta.style.position = "absolute";
                          ta.style.left = "-9999px";
                          document.body.appendChild(ta);
                          ta.select();
                          document.execCommand("copy");
                          document.body.removeChild(ta);
                        }
                        setCopyFeedback(true);
                        setTimeout(() => setCopyFeedback(false), 2000);
                      } catch {
                        const ta = document.createElement("textarea");
                        ta.value = generatedPrompt;
                        ta.setAttribute("readonly", "");
                        ta.style.position = "absolute";
                        ta.style.left = "-9999px";
                        document.body.appendChild(ta);
                        ta.select();
                        try {
                          document.execCommand("copy");
                          setCopyFeedback(true);
                          setTimeout(() => setCopyFeedback(false), 2000);
                        } catch {}
                        document.body.removeChild(ta);
                      }
                    }}
                    className="rounded-xl px-4 py-2.5 text-sm font-medium text-[var(--color-primary)] bg-[var(--color-primary)]/10 hover:bg-[var(--color-primary)]/20 transition"
                  >
                    {copyFeedback ? "Скопировано" : "Скопировать"}
                  </button>
                </div>
              ) : (
                <div className="rounded-2xl bg-[var(--color-surface)] p-5 text-sm text-[var(--color-text-muted)]">
                  Не удалось загрузить промпт.
                </div>
              )}
              <p className="mt-6 text-sm text-[var(--color-text-muted)]">
                Промпт задаёт контекст для ответов ИИ. Напишите сообщение ниже — ответ придёт с учётом этого промпта.
              </p>
            </div>
          )}

          {!hasMessages && !loading && (!wizardStep || wizardStep.completed) && !sessionId && (
            <div className="max-w-[600px] mx-auto py-10 px-6 text-center">
              <h1 className="text-3xl font-semibold text-[var(--color-secondary)] mb-8">
                Чем могу помочь{profileName ? `, ${profileName}` : ""}?
              </h1>
              <button
                type="button"
                onClick={startWizard}
                disabled={wizardLoading}
                className="mb-6 rounded-2xl bg-[var(--color-primary)]/10 border-2 border-[var(--color-primary)] px-5 py-3 text-sm font-medium text-[var(--color-primary)] hover:bg-[var(--color-primary)]/20 transition disabled:opacity-60"
              >
                {wizardLoading ? "Создаём диалог…" : "Настроить параметры (мастер)"}
              </button>
              <p className="text-sm text-[var(--color-text-muted)] mb-3">
                {profileRole
                  ? "Топовые запросы для вашей роли — мастер донастроит под вас"
                  : "Топовые запросы — мастер донастроит под вас (останется выбрать роль и детализацию)"}
              </p>
              <div className="grid grid-cols-2 gap-3">
                {getTopPresetsForRole(profileRole).map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => startWizardWithPreset(p.id)}
                    disabled={wizardLoading}
                    className="rounded-2xl bg-[var(--color-surface)] p-4 text-left text-sm text-[var(--color-secondary)] shadow-[var(--shadow-sm)] hover:border-2 hover:border-[var(--color-primary)] hover:-translate-y-0.5 transition disabled:opacity-60"
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {hasMessages && sessionId && (
            <div className="max-w-[800px] mx-auto px-4 py-2 flex flex-wrap items-center gap-2 text-sm text-[var(--color-text-muted)]">
              <span className="font-medium text-[var(--color-secondary)]">Параметры промпта:</span>
              {sessionCollected ? (
                <>
                  <span>
                    {getPresetById(getPresetIdFromCollected(sessionCollected) ?? "")?.label ?? "—"}
                    {" · "}
                    {getDetailLevelLabel(sessionCollected.detailLevel || "")}
                    {sessionCollected.context ? " · контекст задан" : ""}
                  </span>
                  <button
                    type="button"
                    onClick={openSettingsModal}
                    className="rounded-lg px-3 py-1.5 text-[var(--color-primary)] hover:bg-[var(--color-primary)]/10 transition"
                  >
                    Изменить
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={openSettingsModal}
                  className="rounded-lg px-3 py-1.5 text-[var(--color-primary)] hover:bg-[var(--color-primary)]/10 transition"
                >
                  Изменить настройки
                </button>
              )}
            </div>
          )}

          {messages.map((m) => (
            <div
              key={m.id}
              className={`flex gap-3 max-w-[800px] mx-auto mb-4 ${m.role === "user" ? "flex-row-reverse" : ""}`}
            >
              <div
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-medium ${
                  m.role === "user" ? "bg-[var(--color-secondary)] text-white" : "bg-[var(--color-primary)] text-white"
                }`}
              >
                {m.role === "user" ? "Я" : "◆"}
              </div>
              <div className={`flex flex-col max-w-[85%] ${m.role === "user" ? "items-end" : "items-start"}`}>
                <div
                  className={`bubble rounded-[18px] px-5 py-4 shadow-[var(--shadow-sm)] ${
                    m.role === "user"
                      ? "bg-[var(--color-primary)] text-[var(--color-text-inverse)]"
                      : m.content.startsWith("[Ошибка]")
                        ? "bg-[var(--color-surface)] text-[var(--color-text-primary)] border border-red-300"
                        : "bg-[var(--color-surface)] text-[var(--color-text-primary)]"
                  }`}
                >
                  <p className="whitespace-pre-wrap text-base leading-relaxed">{m.content}</p>
                </div>
                <p className="mt-1 text-[11px] text-[var(--color-text-muted)]">
                  {new Date(m.createdAt).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}
                </p>
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex gap-3 max-w-[800px] mx-auto mb-4">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--color-primary)] text-white">◆</div>
              <div className="rounded-[18px] bg-[var(--color-surface)] px-5 py-4 shadow-[var(--shadow-sm)] flex gap-1.5">
                <span className="typing-dot h-2 w-2 rounded-full bg-[var(--color-primary)]" style={{ animationDelay: "0ms" }} />
                <span className="typing-dot h-2 w-2 rounded-full bg-[var(--color-primary)]" style={{ animationDelay: "150ms" }} />
                <span className="typing-dot h-2 w-2 rounded-full bg-[var(--color-primary)]" style={{ animationDelay: "300ms" }} />
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {(hasMessages || (sessionId && wizardStep?.completed)) && (
          <div className="input-area">
            <div className="max-w-[800px] mx-auto w-full">
              {inputBlock}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
