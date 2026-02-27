"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

type ContentItem = {
  id: string;
  title?: string | null;
  originalText: string;
  createdAt: string;
};

type RagSource = {
  id: string;
  threadId: string;
  threadTitle: string;
  title?: string | null;
  snippet: string;
};

type ChatMessage = {
  id: string;
  role: string;
  content: string;
  createdAt: string;
  sources?: RagSource[];
  /** Фоновый запрос: пока выполняется, в чате показывается placeholder */
  jobId?: string;
  /** Запрос подтверждения перехода в фон: jobId уже есть, показываем кнопку «Продолжить» */
  needConfirmationJobId?: string;
};

export function ThreadDetailShell({ threadId }: { threadId: string }) {
  const [threadTitle, setThreadTitle] = useState<string>("");
  const [contentItems, setContentItems] = useState<ContentItem[]>([]);
  const [contentTotal, setContentTotal] = useState(0);
  const [contentPage, setContentPage] = useState(1);
  const contentLimit = 5;
  const [contentLoading, setContentLoading] = useState(true);
  const [contentError, setContentError] = useState<string | null>(null);
  const [newContentText, setNewContentText] = useState("");
  const [savingContent, setSavingContent] = useState(false);
  const [urlInput, setUrlInput] = useState("");
  const [urlLoading, setUrlLoading] = useState(false);
  const [translateUrl, setTranslateUrl] = useState(true);
  const [fetchNestedUrl, setFetchNestedUrl] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [ollamaStatus, setOllamaStatus] = useState<"checking" | "available" | "unavailable">("checking");
  const [backgroundRunningCount, setBackgroundRunningCount] = useState(0);
  const [dueReminders, setDueReminders] = useState<{ id: string; content: string; dueAt: string }[]>([]);
  const chatFormRef = useRef<HTMLFormElement>(null);
  const chatMessagesScrollRef = useRef<HTMLDivElement>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const chatMessagesRef = useRef<ChatMessage[]>([]);

  async function loadDueReminders() {
    try {
      const res = await fetch("/api/reminders/due");
      if (!res.ok) return;
      const data = (await res.json()) as { reminders: { id: string; content: string; dueAt: string }[] };
      setDueReminders(data.reminders ?? []);
    } catch {
      setDueReminders([]);
    }
  }

  async function markReminderDone(id: string) {
    try {
      const res = await fetch(`/api/reminders/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "DONE" }),
      });
      if (res.ok) setDueReminders((prev) => prev.filter((r) => r.id !== id));
    } catch {
      // ignore
    }
  }

  async function loadThread() {
    try {
      const res = await fetch(`/api/threads/${threadId}`);
      if (!res.ok) return;
      const data = (await res.json()) as { thread: { title: string } };
      setThreadTitle(data.thread?.title ?? "");
    } catch {
      setThreadTitle("");
    }
  }

  async function loadContent(page = 1) {
    setContentLoading(true);
    setContentError(null);
    try {
      const res = await fetch(`/api/threads/${threadId}/content?page=${page}&limit=${contentLimit}`);
      if (!res.ok) {
        setContentItems([]);
        setContentTotal(0);
        setContentLoading(false);
        return;
      }
      const data = (await res.json()) as { items: ContentItem[]; total: number; page: number };
      setContentItems((data.items ?? []).map((i) => ({ ...i, createdAt: String(i.createdAt) })));
      setContentTotal(data.total ?? 0);
      setContentPage(data.page ?? 1);
      setContentLoading(false);
    } catch {
      setContentError("Не удалось загрузить контент");
      setContentLoading(false);
    }
  }

  async function loadMessages() {
    try {
      const res = await fetch(`/api/threads/${threadId}/messages`);
      if (!res.ok) return;
      const data = (await res.json()) as { messages: ChatMessage[] };
      setChatMessages((data.messages ?? []).map((m) => ({ ...m, createdAt: String(m.createdAt) })));
    } catch {
      setChatMessages([]);
    }
  }

  async function checkOllama() {
    try {
      const res = await fetch("/api/ollama/status");
      const data = (await res.json()) as { available?: boolean };
      setOllamaStatus(data.available ? "available" : "unavailable");
    } catch {
      setOllamaStatus("unavailable");
    }
  }

  useEffect(() => {
    setChatMessages([]);
    setBackgroundRunningCount(0);
    void loadThread();
    void loadContent();
    void loadMessages();
    void loadDueReminders();
    void checkOllama();
    const reminderInterval = setInterval(loadDueReminders, 60_000);
    return () => {
      clearInterval(reminderInterval);
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [threadId]);

  useEffect(() => {
    chatMessagesRef.current = chatMessages;
  }, [chatMessages]);

  useEffect(() => {
    const hasBackground = chatMessages.some((m) => m.jobId || m.needConfirmationJobId);
    if (!hasBackground) {
      setBackgroundRunningCount(0);
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
      return;
    }
    const tick = async () => {
      const current = chatMessagesRef.current;
      const jobIds = current
        .filter((m) => m.jobId || m.needConfirmationJobId)
        .map((m) => (m.jobId ?? m.needConfirmationJobId)!);
      if (jobIds.length === 0) {
        setBackgroundRunningCount(0);
        if (pollingRef.current) {
          clearInterval(pollingRef.current);
          pollingRef.current = null;
        }
        return;
      }
      try {
        const countRes = await fetch(`/api/threads/${threadId}/chat/jobs`);
        if (countRes.ok) {
          const countData = (await countRes.json()) as { running?: number };
          setBackgroundRunningCount(countData.running ?? 0);
        }
      } catch {
        // ignore
      }
      for (const jobId of jobIds) {
        try {
          const res = await fetch(`/api/threads/${threadId}/chat/jobs/${jobId}`);
          const data = (await res.json()) as { status: string; reply?: string; error?: string; sources?: RagSource[] };
          if (data.status === "done") {
            setChatMessages((prev) =>
              prev.map((m) =>
                (m.jobId === jobId || m.needConfirmationJobId === jobId)
                  ? { ...m, content: data.reply ?? "", sources: data.sources, jobId: undefined, needConfirmationJobId: undefined }
                  : m
              )
            );
            // Не вызываем loadMessages() — он перезаписывает чат с сервера и убирает другие фоновые сообщения
          } else if (data.status === "error") {
            setChatMessages((prev) =>
              prev.map((m) =>
                (m.jobId === jobId || m.needConfirmationJobId === jobId)
                  ? { ...m, content: data.error ?? "Ошибка", jobId: undefined, needConfirmationJobId: undefined }
                  : m
              )
            );
          }
        } catch {
          // keep polling this job next time
        }
      }
    };
    void tick();
    pollingRef.current = setInterval(tick, 2000);
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [threadId, chatMessages]);

  useEffect(() => {
    const el = chatMessagesScrollRef.current;
    if (!el) return;
    const scrollToBottom = () => {
      el.scrollTop = el.scrollHeight;
    };
    requestAnimationFrame(scrollToBottom);
    const t = setTimeout(scrollToBottom, 50);
    return () => clearTimeout(t);
  }, [threadId, chatMessages]);

  async function handleAddContent() {
    const text = newContentText.trim();
    if (!text) return;
    setSavingContent(true);
    setContentError(null);
    try {
      const res = await fetch(`/api/threads/${threadId}/content`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setContentError(data.reason === "duplicate" ? "Этот контент уже есть в пространстве." : data.error ?? "Не удалось сохранить");
        setSavingContent(false);
        return;
      }
      setNewContentText("");
      await loadContent();
      setSavingContent(false);
    } catch {
      setContentError("Ошибка при сохранении");
      setSavingContent(false);
    }
  }

  async function handleDeleteContent(contentId: string) {
    setDeletingId(contentId);
    setContentError(null);
    try {
      const res = await fetch(`/api/threads/${threadId}/content/${contentId}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setContentError(data.error ?? "Не удалось удалить");
        setDeletingId(null);
        return;
      }
      const nextPage = contentItems.length <= 1 && contentPage > 1 ? contentPage - 1 : contentPage;
      await loadContent(nextPage);
      setDeletingId(null);
    } catch {
      setContentError("Ошибка при удалении");
      setDeletingId(null);
    }
  }

  async function handleAddByUrl() {
    const url = urlInput.trim();
    if (!url) return;
    setUrlLoading(true);
    setContentError(null);
    try {
      const res = await fetch(`/api/threads/${threadId}/content/url`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, translate: translateUrl, fetchNested: fetchNestedUrl }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setContentError(data.error ?? "Не удалось загрузить страницу");
        setUrlLoading(false);
        return;
      }
      if (data.reason === "duplicate") {
        setContentError("Контент с этой ссылки уже в пространстве.");
        setUrlLoading(false);
        return;
      }
      setUrlInput("");
      await loadContent(1);
      setUrlLoading(false);
    } catch {
      setContentError("Ошибка при загрузке по ссылке");
      setUrlLoading(false);
    }
  }

  const CLARIFICATION_MARKER = "Уточните, пожалуйста";

  async function sendMessage(text: string, intent?: "summary" | "search" | "general") {
    setChatLoading(true);
    const userMsg: ChatMessage = { id: `t-${Date.now()}`, role: "USER", content: text, createdAt: new Date().toISOString() };
    setChatMessages((prev) => [...prev, userMsg]);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 35_000);
    try {
      const res = await fetch(`/api/threads/${threadId}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, ...(intent && { intent }) }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      const data = await res.json().catch(() => ({}));
      const ensureUserAndAssistant = (
        prev: ChatMessage[],
        assistantMsg: ChatMessage,
      ): ChatMessage[] => {
        const hasUser = prev.some((x) => x.id === userMsg.id) ||
          (prev.length > 0 && prev[prev.length - 1].role === "USER" && prev[prev.length - 1].content === text);
        return hasUser ? [...prev, assistantMsg] : [...prev, userMsg, assistantMsg];
      };

      if (res.status === 202 && data.jobId) {
        setChatMessages((prev) =>
          ensureUserAndAssistant(prev, {
            id: `job-${data.jobId}`,
            role: "ASSISTANT",
            content: "Обрабатывается в фоне… Результат появится здесь.",
            createdAt: new Date().toISOString(),
            jobId: data.jobId,
          })
        );
        setChatLoading(false);
        return;
      }
      if (res.status === 200 && data.needConfirmation && data.jobId) {
        setChatMessages((prev) =>
          ensureUserAndAssistant(prev, {
            id: `confirm-${data.jobId}`,
            role: "ASSISTANT",
            content: data.message ?? data.reply ?? "",
            createdAt: new Date().toISOString(),
            needConfirmationJobId: data.jobId,
          })
        );
        setChatLoading(false);
        return;
      }
      if (!res.ok) {
        setChatMessages((prev) => [
          ...prev,
          { id: `e-${Date.now()}`, role: "ASSISTANT", content: data.error ?? "Ошибка ответа", createdAt: new Date().toISOString() },
        ]);
        setChatLoading(false);
        return;
      }
      setChatMessages((prev) => [
        ...prev,
        { id: `a-${Date.now()}`, role: "ASSISTANT", content: data.reply ?? data.message ?? "", createdAt: new Date().toISOString(), sources: data.sources ?? [] },
      ]);
      await loadMessages();
      setChatLoading(false);
    } catch (err) {
      clearTimeout(timeoutId);
      const isTimeout = err instanceof Error && err.name === "AbortError";
      const msg = isTimeout
        ? "Запрос отменён по таймауту. Долгие запросы обрабатываются в фоне — проверьте чат через минуту."
        : "Не удалось получить ответ (сеть или сервер). Попробуйте снова.";
      setChatMessages((prev) => [
        ...prev,
        { id: `e-${Date.now()}`, role: "ASSISTANT", content: msg, createdAt: new Date().toISOString() },
      ]);
      setChatLoading(false);
    }
  }

  function confirmBackgroundJob(jobId: string) {
    setChatMessages((prev) =>
      prev.map((m) =>
        m.needConfirmationJobId === jobId
          ? {
              ...m,
              content: "Обрабатывается в фоне… Результат появится здесь.",
              jobId,
              needConfirmationJobId: undefined,
            }
          : m
      )
    );
  }

  async function handleSendChat(e: React.FormEvent) {
    e.preventDefault();
    const text = chatInput.trim();
    if (!text) return;
    setChatInput("");
    await sendMessage(text);
  }

  const pendingBackgroundTasks = chatMessages.flatMap((m, i) => {
    if (!m.jobId && !m.needConfirmationJobId) return [];
    const userText = i > 0 && chatMessages[i - 1].role === "USER" ? chatMessages[i - 1].content : "";
    return [{ id: m.jobId ?? m.needConfirmationJobId!, text: userText || "…" }];
  });

  const lastMsg = chatMessages[chatMessages.length - 1];
  const isLastClarification = lastMsg?.role === "ASSISTANT" && lastMsg.content.includes(CLARIFICATION_MARKER);
  const clarificationTriggerMessage = (() => {
    if (!isLastClarification) return null;
    const idx = chatMessages.length - 1;
    if (idx <= 0) return null;
    const prev = chatMessages[idx - 1];
    return prev.role === "USER" ? prev.content : null;
  })();

  return (
    <div className="flex flex-col gap-6 lg:grid lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)] lg:items-stretch lg:h-[calc(100vh-18rem)]">
      <div className="flex items-center gap-4 lg:col-span-2">
        <Link
          href="/threads"
          className="rounded-[16px] border-2 border-ocean bg-transparent px-4 py-2 text-sm font-medium text-ocean transition hover:bg-ocean/5"
        >
          ← К пространствам
        </Link>
        <h1 className="truncate text-[28px] font-semibold text-ocean">{threadTitle || "Пространство"}</h1>
      </div>

      <aside className="flex min-h-0 flex-col rounded-[20px] bg-white p-5 shadow-[0_2px_16px_var(--shadow-card)] lg:h-[calc(100vh-18rem)]">
        <h2 className="text-base font-semibold text-ocean">Управление контентом</h2>

        <section className="mt-4">
          <h3 className="text-sm font-medium text-ocean/80">Текст заметки</h3>
          <textarea
            value={newContentText}
            onChange={(e) => setNewContentText(e.target.value)}
            placeholder="Текст заметки или конспекта…"
            rows={2}
            className="mt-1.5 w-full rounded-[12px] border-2 border-transparent bg-ivory px-3 py-2 text-sm text-ocean placeholder:text-ocean/50 outline-none transition focus:border-mint focus:bg-white focus:ring-2 focus:ring-mint/30"
          />
          <button
            type="button"
            onClick={handleAddContent}
            disabled={savingContent}
            className="mt-2 w-full rounded-[16px] bg-mint px-4 py-2 text-sm font-medium text-white shadow-[0_4px_12px_var(--shadow-mint)] transition hover:bg-mint-hover active:bg-mint-active disabled:opacity-50"
          >
            {savingContent ? "…" : "Сохранить в пространство"}
          </button>
        </section>

        {dueReminders.length > 0 && (
          <section className="mt-5 border-t border-ocean/10 pt-4">
            <h3 className="text-sm font-medium text-ocean/80">Напоминания</h3>
            <ul className="mt-2 space-y-2">
              {dueReminders.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-2 rounded-[12px] bg-amber-50 p-2 border border-amber-200">
                  <span className="min-w-0 flex-1 text-sm text-ocean">{r.content}</span>
                  <button
                    type="button"
                    onClick={() => void markReminderDone(r.id)}
                    className="shrink-0 rounded-[8px] bg-mint px-2 py-1 text-xs font-medium text-white hover:bg-mint-hover"
                  >
                    Выполнено
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
        <section className="mt-5 border-t border-ocean/10 pt-4">
          <h3 className="text-sm font-medium text-ocean/80">Добавить по ссылке</h3>
          <input
            type="url"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            placeholder="https://..."
            className="mt-1.5 w-full rounded-[12px] border-2 border-transparent bg-ivory px-3 py-2 text-sm text-ocean placeholder:text-ocean/50 outline-none transition focus:border-mint focus:bg-white focus:ring-2 focus:ring-mint/30"
          />
          <label className="mt-2 flex items-center gap-2 text-xs text-ocean">
            <input type="checkbox" checked={translateUrl} onChange={(e) => setTranslateUrl(e.target.checked)} className="h-3.5 w-3.5 rounded border-ocean/30 text-mint focus:ring-mint" />
            Перевести на мой язык
          </label>
          <label className="mt-2 flex items-center gap-2 text-xs text-ocean">
            <input type="checkbox" checked={fetchNestedUrl} onChange={(e) => setFetchNestedUrl(e.target.checked)} className="h-3.5 w-3.5 rounded border-ocean/30 text-mint focus:ring-mint" />
            Загрузить вложенные ссылки с этой страницы
          </label>
          <button
            type="button"
            onClick={handleAddByUrl}
            disabled={urlLoading}
            className="mt-2 w-full rounded-[16px] bg-mint px-4 py-2 text-sm font-medium text-white shadow-[0_4px_12px_var(--shadow-mint)] transition hover:bg-mint-hover disabled:opacity-50"
          >
            {urlLoading ? "Загружаем…" : "По ссылке"}
          </button>
        </section>

        <section className="mt-5 min-h-0 flex-1 overflow-hidden flex flex-col border-t border-ocean/10 pt-4">
          <h3 className="text-sm font-medium text-ocean/80">Контент в пространстве</h3>
          {contentError && <p className="mt-1 text-xs text-red-600">{contentError}</p>}
          {contentLoading ? (
            <p className="mt-2 text-sm text-ocean/70">Загружаем…</p>
          ) : contentItems.length === 0 ? (
            <p className="mt-2 text-sm text-ocean/70">Пока нет контента.</p>
          ) : (
            <>
              <ul className="mt-2 min-h-0 flex-1 space-y-2 overflow-y-auto">
                {contentItems.map((item) => (
                  <li key={item.id} className="flex items-start justify-between gap-2 rounded-[12px] bg-ivory p-3">
                    <div className="min-w-0 flex-1">
                      {item.title && <p className="truncate text-xs font-medium text-ocean">{item.title}</p>}
                      <p className="mt-0.5 line-clamp-2 text-xs text-ocean/90">
                        {item.originalText.length > 120 ? `${item.originalText.slice(0, 120)}…` : item.originalText}
                      </p>
                      <p className="mt-0.5 text-[11px] text-ocean/60">
                        {new Date(item.createdAt).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" })}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleDeleteContent(item.id)}
                      disabled={deletingId === item.id}
                      className="shrink-0 rounded-[10px] px-2 py-0.5 text-[11px] font-medium text-red-600 hover:bg-red-500/10 disabled:opacity-50"
                    >
                      {deletingId === item.id ? "…" : "✕"}
                    </button>
                  </li>
                ))}
              </ul>
              {contentTotal > contentLimit && (
                <div className="mt-3 flex items-center justify-between gap-2 border-t border-ocean/10 pt-3">
                  <button
                    type="button"
                    onClick={() => void loadContent(contentPage - 1)}
                    disabled={contentPage <= 1 || contentLoading}
                    className="rounded-[10px] px-2 py-1 text-xs font-medium text-ocean hover:bg-ocean/5 disabled:opacity-40"
                  >
                    ← Назад
                  </button>
                  <span className="text-[11px] text-ocean/70">
                    {contentPage} / {Math.ceil(contentTotal / contentLimit)}
                  </span>
                  <button
                    type="button"
                    onClick={() => void loadContent(contentPage + 1)}
                    disabled={contentPage >= Math.ceil(contentTotal / contentLimit) || contentLoading}
                    className="rounded-[10px] px-2 py-1 text-xs font-medium text-ocean hover:bg-ocean/5 disabled:opacity-40"
                  >
                    Вперёд →
                  </button>
                </div>
              )}
            </>
          )}
        </section>
      </aside>

      <section className="flex min-h-0 flex-col overflow-hidden rounded-[20px] bg-[var(--chat-surface)] p-6 shadow-[0_2px_16px_var(--shadow-card)] lg:h-full">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold text-[var(--chat-secondary)]">Чат по пространству</h2>
            <p className="mt-1 text-sm text-[var(--chat-secondary)]/70">Поиск по контенту пространства → ответ и источники.</p>
          </div>
          {backgroundRunningCount > 0 && (
            <div className="shrink-0 flex flex-col items-end gap-1">
              <span
                className="rounded-full bg-[var(--chat-secondary)]/15 px-3 py-1 text-xs font-medium text-[var(--chat-secondary)]"
                title={pendingBackgroundTasks.length > 0 ? pendingBackgroundTasks.map((t) => t.text.slice(0, 80)).join("\n") : "Фоновых заданий"}
              >
                В фоне: {backgroundRunningCount}
              </span>
              {pendingBackgroundTasks.length > 0 && (
                <div className="max-w-[280px] rounded-[10px] border border-[var(--chat-secondary)]/20 bg-[var(--chat-bg)] px-2 py-1.5 text-[11px] text-[var(--chat-secondary)]/90 shadow-sm">
                  <p className="font-medium text-[var(--chat-secondary)]/80">Обрабатывается:</p>
                  {pendingBackgroundTasks.map((t, idx) => (
                    <p key={t.id} className="mt-0.5 truncate" title={t.text}>
                      {idx + 1}. «{t.text.length > 50 ? `${t.text.slice(0, 50)}…` : t.text}»
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
        {ollamaStatus === "unavailable" && (
          <div className="mt-3 rounded-[16px] border border-[var(--chat-secondary)]/20 bg-[var(--chat-bg)] px-4 py-3 text-sm text-[var(--chat-secondary)]">
            Ollama не запущена. Запустите: <code className="rounded bg-[var(--chat-secondary)]/10 px-1.5 py-0.5 font-mono text-xs">ollama serve</code>, затем <code className="rounded bg-[var(--chat-secondary)]/10 px-1.5 py-0.5 font-mono text-xs">ollama run llama3.2</code>
          </div>
        )}
        <div ref={chatMessagesScrollRef} className="chat-messages-scroll mt-4 min-h-0 flex-1 overflow-y-auto overflow-x-hidden py-4 pr-2" style={{ paddingBottom: "80px", minHeight: 0 }}>
          {chatMessages.length === 0 && !chatLoading && (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <p className="max-w-[400px] text-[32px] font-semibold text-[var(--chat-secondary)]">Чем могу помочь?</p>
              <p className="mt-4 text-base text-[var(--chat-text-muted)]">Задайте вопрос — ответ по контенту пространства, с источниками.</p>
              <p className="mt-1 text-sm text-[var(--chat-text-muted)]/80">Первый ответ может занять 1–2 минуты, не закрывайте страницу.</p>
            </div>
          )}
          <div className="flex flex-col gap-4">
            {chatMessages.map((m, msgIndex) => {
              const isUser = m.role === "USER";
              const time = new Date(m.createdAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
              const requestText = !isUser && msgIndex > 0 && chatMessages[msgIndex - 1].role === "USER"
                ? chatMessages[msgIndex - 1].content
                : null;
              return (
                <div
                  key={m.id}
                  className={`flex items-end gap-3 transition-colors hover:bg-[rgba(42,91,111,0.02)] rounded-[var(--chat-radius-lg)] -mx-1 px-1 ${isUser ? "flex-row-reverse" : ""}`}
                >
                  <div
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-medium ${isUser ? "bg-[var(--chat-secondary)] text-white" : "bg-[var(--chat-primary)] text-white"}`}
                    aria-hidden
                  >
                    {isUser ? "В" : "◆"}
                  </div>
                  <div className="flex min-w-0 max-w-[85%] flex-col">
                    <div
                      className={`chat-bubble-appear rounded-[var(--chat-radius-lg)] px-5 py-4 text-base leading-relaxed shadow-[var(--chat-shadow-bubble)] ${isUser ? "bg-[var(--chat-primary)] text-white" : "bg-[var(--chat-surface)] text-[var(--chat-secondary)]"}`}
                    >
                      <p className="whitespace-pre-wrap">{m.content}</p>
                      {!isUser && requestText && (m.jobId || m.needConfirmationJobId) && (
                        <p className="mt-1.5 text-xs text-[var(--chat-secondary)]/70">
                          Запрос: «{requestText.length > 60 ? `${requestText.slice(0, 60)}…` : requestText}»
                        </p>
                      )}
                      {!isUser && m.needConfirmationJobId && (
                        <>
                          <p className="mt-2 text-xs font-medium text-[var(--chat-secondary)]/80">
                            Статус: задание выполняется в фоне. Нажмите кнопку — результат подставится сюда.
                          </p>
                          <div className="mt-3">
                            <button
                              type="button"
                              onClick={() => confirmBackgroundJob(m.needConfirmationJobId!)}
                              className="rounded-[12px] border-2 border-[var(--chat-primary)] bg-transparent px-4 py-2 text-sm font-medium text-[var(--chat-primary)] transition hover:bg-[var(--chat-primary)]/10"
                            >
                              Да, подставить в чат
                            </button>
                          </div>
                        </>
                      )}
                      {!isUser && m.jobId && (
                        <p className="mt-2 text-xs font-medium text-[var(--chat-secondary)]/80">
                          Статус: выполняется в фоне…
                        </p>
                      )}
                      {!isUser && m.sources && m.sources.length > 0 && (
                        <div className="mt-3 border-t border-[var(--chat-secondary)]/10 pt-3">
                          <p className="mb-1 text-xs font-medium text-[var(--chat-secondary)]/60">Источники</p>
                          <ul className="space-y-0.5 text-xs text-[var(--chat-secondary)]/80">
                            {m.sources.map((s) => (
                              <li key={s.id}>
                                {s.title ?? "Фрагмент"}
                                {s.snippet && <span className="block max-w-full truncate text-[var(--chat-secondary)]/70">{s.snippet.slice(0, 80)}…</span>}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                    <p className="mt-1 text-[11px] text-[var(--chat-text-muted)]">{time}</p>
                  </div>
                </div>
              );
            })}
            {isLastClarification && !chatLoading && (
              <div className="flex flex-wrap gap-2 pl-11">
                <button
                  type="button"
                  onClick={() => sendMessage("сделай выжимку")}
                  className="rounded-[12px] border-2 border-[var(--chat-primary)] bg-[var(--chat-bg)] px-4 py-2 text-sm font-medium text-[var(--chat-secondary)] transition hover:bg-[var(--chat-primary)]/10"
                >
                  Выжимка по контенту
                </button>
                <button
                  type="button"
                  onClick={() => sendMessage("найди в контенте")}
                  className="rounded-[12px] border-2 border-[var(--chat-primary)] bg-[var(--chat-bg)] px-4 py-2 text-sm font-medium text-[var(--chat-secondary)] transition hover:bg-[var(--chat-primary)]/10"
                >
                  Поиск по контенту
                </button>
                {clarificationTriggerMessage && (
                  <button
                    type="button"
                    onClick={() => sendMessage(clarificationTriggerMessage, "general")}
                    className="rounded-[12px] border-2 border-[var(--chat-primary)] bg-[var(--chat-bg)] px-4 py-2 text-sm font-medium text-[var(--chat-secondary)] transition hover:bg-[var(--chat-primary)]/10"
                  >
                    Общий вопрос
                  </button>
                )}
              </div>
            )}
            {chatLoading && (
              <div className="flex items-end gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--chat-primary)] text-white" aria-hidden>
                  ◆
                </div>
                <div className="flex gap-1 rounded-[var(--chat-radius-lg)] bg-[var(--chat-surface)] px-5 py-4 shadow-[var(--chat-shadow-bubble)]">
                  <span className="chat-typing-dot h-2 w-2 rounded-full bg-[var(--chat-primary)]" style={{ animationDelay: "0ms" }} />
                  <span className="chat-typing-dot h-2 w-2 rounded-full bg-[var(--chat-primary)]" style={{ animationDelay: "150ms" }} />
                  <span className="chat-typing-dot h-2 w-2 rounded-full bg-[var(--chat-primary)]" style={{ animationDelay: "300ms" }} />
                </div>
              </div>
            )}
          </div>
        </div>
        <form ref={chatFormRef} onSubmit={handleSendChat} className="mt-4 flex items-end gap-2 rounded-[var(--chat-radius-xl)] border-2 border-transparent bg-[var(--chat-bg)] p-1 pl-4 focus-within:border-[var(--chat-primary)]">
          <textarea
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                chatFormRef.current?.requestSubmit();
              }
            }}
            placeholder="Вопрос или «сделай выжимку»…"
            rows={1}
            className="min-h-[24px] max-h-[200px] min-w-0 flex-1 resize-none border-none bg-transparent py-3 text-base leading-normal text-[var(--chat-secondary)] outline-none placeholder:text-[var(--chat-text-muted)]"
          />
          <button
            type="submit"
            disabled={chatLoading}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--chat-primary)] text-white transition hover:scale-105 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100"
            aria-label="Отправить"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
            </svg>
          </button>
        </form>
      </section>
    </div>
  );
}
