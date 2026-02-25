"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type ThreadStatus = "ACTIVE" | "ARCHIVED" | "DELETED";

type Thread = {
  id: string;
  title: string;
  status: ThreadStatus;
  createdAt: string;
  updatedAt: string;
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
  sources?: RagSource[];
};

type Filter = "active" | "archived" | "deleted";

const FILTER_TO_STATUS: Record<Filter, ThreadStatus> = {
  active: "ACTIVE",
  archived: "ARCHIVED",
  deleted: "DELETED",
};

export function ThreadsHomeShell() {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [filter, setFilter] = useState<Filter>("active");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [ollamaStatus, setOllamaStatus] = useState<"checking" | "available" | "unavailable">("checking");
  const [userTimezone, setUserTimezone] = useState<string | null>(null);
  const [showTzPrompt, setShowTzPrompt] = useState(false);
  const [tzUpdating, setTzUpdating] = useState(false);
  const [threadToDelete, setThreadToDelete] = useState<Thread | null>(null);

  async function loadThreads(nextFilter: Filter = filter, nextPage: number = page) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/threads?status=${nextFilter}&page=${nextPage}&limit=5`);
      if (!res.ok) {
        setThreads([]);
        setLoading(false);
        return;
      }
      const data = (await res.json()) as {
        threads: Thread[];
        total: number;
        page: number;
        totalPages: number;
      };
      setThreads(
        data.threads.map((t) => ({
          ...t,
          createdAt: String(t.createdAt),
          updatedAt: String(t.updatedAt),
        }))
      );
      setTotalPages(data.totalPages ?? 1);
      setLoading(false);
    } catch {
      setError("Не удалось загрузить треды");
      setLoading(false);
    }
  }

  useEffect(() => {
    checkOllama();
    (async () => {
      try {
        const res = await fetch("/api/auth/me");
        const data = (await res.json()) as { user?: { timezone?: string } };
        const tz = data.user?.timezone ?? null;
        setUserTimezone(tz);
        const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
        if (tz != null && browserTz && tz !== browserTz) {
          setShowTzPrompt(true);
        }
      } catch {
        setUserTimezone(null);
      }
    })();
  }, []);

  useEffect(() => {
    void loadThreads(filter, page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, page]);

  async function checkOllama() {
    setOllamaStatus("checking");
    try {
      const res = await fetch("/api/ollama/status");
      const data = (await res.json()) as { available?: boolean };
      setOllamaStatus(data.available ? "available" : "unavailable");
    } catch {
      setOllamaStatus("unavailable");
    }
  }

  async function confirmTimezone() {
    const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!browserTz) return;
    setTzUpdating(true);
    try {
      const res = await fetch("/api/auth/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ timezone: browserTz }),
      });
      if (res.ok) {
        setUserTimezone(browserTz);
        setShowTzPrompt(false);
      }
    } finally {
      setTzUpdating(false);
    }
  }

  async function handleCreateThread() {
    const title = newTitle.trim();
    if (!title) return;
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/threads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Не удалось создать тред");
        setCreating(false);
        return;
      }
      setNewTitle("");
      setPage(1);
      await loadThreads(filter, 1);
      setCreating(false);
    } catch {
      setError("Ошибка при создании треда");
      setCreating(false);
    }
  }

  async function handleChangeStatus(threadId: string, status: ThreadStatus) {
    setError(null);
    try {
      const res = await fetch(`/api/threads/${threadId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Не удалось обновить тред");
        return;
      }
      await loadThreads(filter, page);
    } catch {
      setError("Ошибка при обновлении треда");
    }
  }

  async function handleRagChat(e: React.FormEvent) {
    e.preventDefault();
    const text = chatInput.trim();
    if (!text) return;
    setChatLoading(true);
    setChatInput("");
    const userMsg: ChatMessage = { id: `u-${Date.now()}`, role: "USER", content: text };
    setChatMessages((prev) => [...prev, userMsg]);
    try {
      const res = await fetch("/api/chat/rag", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setChatMessages((prev) => [
          ...prev,
          { id: `e-${Date.now()}`, role: "ASSISTANT", content: data.error ?? "Ошибка ответа" },
        ]);
        setChatLoading(false);
        return;
      }
      setChatMessages((prev) => [
        ...prev,
        { id: `a-${Date.now()}`, role: "ASSISTANT", content: data.reply ?? "", sources: data.sources ?? [] },
      ]);
      setChatLoading(false);
    } catch {
      setChatMessages((prev) => prev.filter((m) => m.id !== userMsg.id));
      setChatMessages((prev) => [...prev, { id: `e-${Date.now()}`, role: "ASSISTANT", content: "Ошибка при отправке." }]);
      setChatLoading(false);
    }
  }

  const emptyTextByFilter: Record<Filter, string> = {
    active: "Пока нет активных тредов. Создайте первый.",
    archived: "В архиве пусто.",
    deleted: "Корзина пуста.",
  };

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] lg:items-stretch">
      <section className="flex min-h-0 flex-col rounded-[20px] bg-white p-6 shadow-[0_2px_16px_var(--shadow-card)]">
        <h2 className="text-base font-semibold text-ocean">
          Треды
        </h2>
        <div className="mt-5 flex gap-2">
          <input
            type="text"
            placeholder="Название нового треда"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            className="min-w-0 flex-1 rounded-[12px] border-2 border-transparent bg-ivory px-4 py-2.5 text-base text-ocean placeholder:text-ocean/50 outline-none transition focus:border-mint focus:bg-white focus:ring-2 focus:ring-mint/30"
          />
          <button
            type="button"
            onClick={handleCreateThread}
            disabled={creating}
            className="shrink-0 rounded-[16px] bg-mint px-6 py-2.5 text-sm font-medium text-white shadow-[0_4px_12px_var(--shadow-mint)] transition hover:scale-[1.02] hover:shadow-[0_6px_16px_var(--shadow-mint)] active:scale-[0.98] active:bg-mint-active disabled:opacity-50 disabled:hover:scale-100"
          >
            {creating ? "…" : "Создать"}
          </button>
        </div>
        <div className="mt-3 inline-flex rounded-[16px] bg-ivory p-0.5">
          {(["active", "archived"] as Filter[]).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => {
                setFilter(key);
                setPage(1);
              }}
              className={`rounded-[12px] px-4 py-2 text-sm font-medium transition ${filter === key ? "bg-white text-ocean shadow-sm" : "text-ocean/70 hover:bg-ocean/5 hover:text-ocean"}`}
            >
              {key === "active" ? "Активные" : "Архив"}
            </button>
          ))}
        </div>
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        <div className="mt-5 flex min-h-0 flex-1 flex-col border-t border-ocean/10 pt-5">
          {loading ? (
            <p className="text-base text-ocean/70">Загружаем треды…</p>
          ) : threads.length === 0 ? (
            <p className="text-base text-ocean/70">{emptyTextByFilter[filter]}</p>
          ) : (
            <ul className="min-h-0 flex-1 space-y-3 overflow-y-auto text-base">
              {threads.map((thread) => (
                <li key={thread.id} className="overflow-hidden rounded-[16px] bg-ivory transition hover:bg-ivory/80">
                  <Link
                    href={`/threads/${thread.id}`}
                    className="flex items-center justify-between gap-3 px-4 py-3 transition hover:bg-ocean/5"
                  >
                    <span className="min-w-0 truncate font-medium text-ocean">{thread.title}</span>
                    <span className="shrink-0 text-ocean/50">→</span>
                  </Link>
                  <p className="px-4 pb-2 text-xs text-ocean/60">
                    Обновлён {new Date(thread.updatedAt).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" })}
                  </p>
                  <div className="flex flex-wrap gap-1.5 px-4 pb-3">
                    {filter !== "active" && (
                      <button type="button" onClick={(e) => { e.preventDefault(); void handleChangeStatus(thread.id, "ACTIVE"); }} className="rounded-[12px] px-2.5 py-1 text-xs font-medium text-ocean/80 hover:bg-ocean/10">
                        В активные
                      </button>
                    )}
                    {filter !== "archived" && (
                      <button type="button" onClick={(e) => { e.preventDefault(); void handleChangeStatus(thread.id, "ARCHIVED"); }} className="rounded-[12px] px-2.5 py-1 text-xs font-medium text-ocean/80 hover:bg-ocean/10">
                        В архив
                      </button>
                    )}
                    {filter !== "deleted" && (
                      <button type="button" onClick={(e) => { e.preventDefault(); setThreadToDelete(thread); }} className="rounded-[12px] px-2.5 py-1 text-xs font-medium text-ocean/80 hover:bg-ocean/10">
                        В удалённые
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
          {!loading && threads.length > 0 && totalPages > 1 && (
            <div className="mt-4 flex items-center justify-center gap-2 border-t border-ocean/10 pt-4">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="rounded-[16px] px-3 py-2 text-sm font-medium text-ocean/80 transition hover:bg-ocean/10 disabled:opacity-40 disabled:pointer-events-none"
              >
                ←
              </button>
              <span className="px-2 text-xs text-ocean/60">
                {page} из {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="rounded-[16px] px-3 py-2 text-sm font-medium text-ocean/80 transition hover:bg-ocean/10 disabled:opacity-40 disabled:pointer-events-none"
              >
                →
              </button>
            </div>
          )}
        </div>
      </section>

      <section className="flex min-h-0 flex-col rounded-[20px] bg-white p-6 shadow-[0_2px_16px_var(--shadow-card)]">
        <h2 className="text-base font-semibold text-ocean">
          Чат
        </h2>
        {showTzPrompt && (
          <div className="mt-4 rounded-[16px] border border-mint/40 bg-mint/10 px-4 py-3 text-sm text-ocean">
            <p className="font-medium">Часовой пояс</p>
            <p className="mt-1 text-ocean/90">
              Определён часовой пояс устройства: <strong>{Intl.DateTimeFormat().resolvedOptions().timeZone}</strong>. Использовать для ответов о времени?
            </p>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => void confirmTimezone()}
                disabled={tzUpdating}
                className="rounded-[16px] bg-mint px-4 py-2 text-sm font-medium text-white shadow-[0_4px_12px_var(--shadow-mint)] transition hover:bg-mint-hover disabled:opacity-60"
              >
                {tzUpdating ? "…" : "Да"}
              </button>
              <button
                type="button"
                onClick={() => setShowTzPrompt(false)}
                className="rounded-[16px] border-2 border-ocean bg-transparent px-4 py-2 text-sm font-medium text-ocean transition hover:bg-ocean/5"
              >
                Позже
              </button>
            </div>
          </div>
        )}
        {ollamaStatus === "unavailable" && (
          <div className="mt-4 rounded-[16px] border border-ocean/20 bg-ivory px-4 py-3 text-sm text-ocean">
            Ollama не запущена. Запустите: <code className="rounded bg-ocean/10 px-1.5 py-0.5 font-mono text-xs">ollama serve</code>, затем <code className="rounded bg-ocean/10 px-1.5 py-0.5 font-mono text-xs">ollama run llama3.2</code>
          </div>
        )}
        <div className="mt-4 min-h-0 flex-1 overflow-y-auto space-y-3 rounded-[12px] bg-ivory p-4">
          {chatMessages.length === 0 && !chatLoading && (
            <p className="text-base text-ocean/70">Задайте вопрос — ответ будет по контенту ваших тредов, с источниками.</p>
          )}
          {chatMessages.map((m) => (
            <div
              key={m.id}
              className={`rounded-[16px] px-4 py-2.5 text-base leading-snug ${m.role === "USER" ? "ml-6 bg-ivory text-ocean ring-1 ring-ocean/10 shadow-sm" : "mr-6 bg-white text-ocean shadow-[0_2px_16px_var(--shadow-card)] ring-1 ring-ocean/10"}`}
            >
              <p className="whitespace-pre-wrap">{m.content}</p>
              {m.role === "ASSISTANT" && m.sources && m.sources.length > 0 && (() => {
                const byThread = new Map<string, { threadTitle: string; items: typeof m.sources }>();
                for (const s of m.sources!) {
                  if (!byThread.has(s.threadId)) byThread.set(s.threadId, { threadTitle: s.threadTitle, items: [] });
                  byThread.get(s.threadId)!.items.push(s);
                }
                const threadList = Array.from(byThread.entries());
                return (
                  <div className="mt-3 space-y-2 border-t border-ocean/10 pt-3">
                    <div>
                      <p className="mb-1 text-xs font-medium text-ocean/60">Найденные треды</p>
                      <ul className="space-y-0.5 text-xs">
                        {threadList.map(([tid, { threadTitle }]) => (
                          <li key={tid}>
                            <Link href={`/threads/${tid}`} className="font-medium text-ocean underline-offset-2 hover:underline hover:text-ocean-hover">
                              {threadTitle}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <p className="mb-1 text-xs font-medium text-ocean/60">Фрагменты</p>
                      <ul className="space-y-0.5 text-xs text-ocean/80">
                        {m.sources!.map((s) => (
                          <li key={s.id}>
                            {s.title ? <span className="text-ocean/70">{s.threadTitle} — {s.title}: </span> : null}
                            {s.snippet ? <span className="block max-w-full truncate">{s.snippet.slice(0, 120)}…</span> : null}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                );
              })()}
            </div>
          ))}
          {chatLoading && <p className="py-1 text-base text-ocean/70">Ищем по тредам и готовим ответ…</p>}
        </div>
        <form onSubmit={handleRagChat} className="mt-4 flex gap-2">
          <input
            type="text"
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            placeholder="Вопрос или запрос по вашим тредам…"
            className="min-w-0 flex-1 rounded-[12px] border-2 border-transparent bg-ivory px-4 py-2.5 text-base text-ocean placeholder:text-ocean/50 outline-none transition focus:border-mint focus:bg-white focus:ring-2 focus:ring-mint/30"
          />
          <button
            type="submit"
            disabled={chatLoading}
            className="shrink-0 rounded-[16px] bg-mint px-6 py-2.5 text-sm font-medium text-white shadow-[0_4px_12px_var(--shadow-mint)] transition hover:scale-[1.02] hover:bg-mint-hover hover:shadow-[0_6px_16px_var(--shadow-mint)] active:scale-[0.98] active:bg-mint-active disabled:opacity-50 disabled:hover:scale-100"
          >
            {chatLoading ? "…" : "Отправить"}
          </button>
        </form>
      </section>

      {threadToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ocean/20 p-4" onClick={() => setThreadToDelete(null)} role="dialog" aria-modal="true" aria-labelledby="delete-thread-title">
          <div className="w-full max-w-md rounded-[20px] border-2 border-ocean/10 bg-white p-6 shadow-[0_2px_16px_var(--shadow-card)]" onClick={(e) => e.stopPropagation()}>
            <h2 id="delete-thread-title" className="text-lg font-semibold text-ocean">Удалить тред?</h2>
            <p className="mt-2 text-sm text-ocean/80">
              Тред «{threadToDelete.title}», весь контент и диалог будут безвозвратно удалены. Это действие нельзя отменить.
            </p>
            <p className="mt-1 text-sm font-medium text-ocean/70">Продолжить?</p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setThreadToDelete(null)}
                className="rounded-[16px] border-2 border-ocean/30 bg-transparent px-4 py-2 text-sm font-medium text-ocean transition hover:bg-ocean/5"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={async () => {
                  const id = threadToDelete.id;
                  setThreadToDelete(null);
                  await handleChangeStatus(id, "DELETED");
                }}
                className="rounded-[16px] bg-mint px-4 py-2 text-sm font-medium text-white shadow-[0_4px_12px_var(--shadow-mint)] transition hover:bg-mint-hover active:bg-mint-active"
              >
                Удалить
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
