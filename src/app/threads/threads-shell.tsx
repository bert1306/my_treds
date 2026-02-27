"use client";

import { useEffect, useRef, useState } from "react";

type ThreadStatus = "ACTIVE" | "ARCHIVED" | "DELETED";

type Thread = {
  id: string;
  title: string;
  status: ThreadStatus;
  createdAt: string;
  updatedAt: string;
};

type ContentItem = {
  id: string;
  title?: string | null;
  originalText: string;
  createdAt: string;
};

type SearchResult = {
  id: string;
  threadId: string;
  threadTitle: string;
  title?: string | null;
  snippet: string;
  createdAt: string;
};

type ChatMessage = {
  id: string;
  role: string;
  content: string;
  createdAt: string;
  jobId?: string;
  needConfirmationJobId?: string;
};

type Filter = "active" | "archived" | "deleted";

const FILTER_TO_STATUS: Record<Filter, ThreadStatus> = {
  active: "ACTIVE",
  archived: "ARCHIVED",
  deleted: "DELETED",
};

export function ThreadsShell() {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [filter, setFilter] = useState<Filter>("active");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState("");
   const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
   const [contentItems, setContentItems] = useState<ContentItem[]>([]);
   const [contentLoading, setContentLoading] = useState(false);
   const [contentError, setContentError] = useState<string | null>(null);
   const [newContentText, setNewContentText] = useState("");
   const [savingContent, setSavingContent] = useState(false);
   const [searchQuery, setSearchQuery] = useState("");
   const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
   const [searchLoading, setSearchLoading] = useState(false);
   const [searchDone, setSearchDone] = useState(false);
   const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
   const [chatLoading, setChatLoading] = useState(false);
   const [chatInput, setChatInput] = useState("");
   const [urlInput, setUrlInput] = useState("");
   const [urlLoading, setUrlLoading] = useState(false);
   const [translateUrl, setTranslateUrl] = useState(true);
   const [fetchNestedUrl, setFetchNestedUrl] = useState(false);
   const [deletingId, setDeletingId] = useState<string | null>(null);
   const [threadToDelete, setThreadToDelete] = useState<Thread | null>(null);
   const [ollamaStatus, setOllamaStatus] = useState<"checking" | "available" | "unavailable">("checking");
  const [backgroundRunningCount, setBackgroundRunningCount] = useState(0);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const chatMessagesRef = useRef<ChatMessage[]>([]);

  async function loadThreads(nextFilter: Filter = filter) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/threads?status=${nextFilter}`, {
        method: "GET",
      });
      if (!res.ok) {
        setError("Не удалось загрузить пространства");
        setThreads([]);
        setLoading(false);
        return;
      }
      const data = (await res.json()) as { threads: Thread[] };
      setThreads(
        data.threads.map((t) => ({
          ...t,
          createdAt: String(t.createdAt),
          updatedAt: String(t.updatedAt),
        })),
      );
      setLoading(false);
    } catch {
      setError("Произошла ошибка при загрузке пространств");
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadThreads("active");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
        setError(data.error ?? "Не удалось создать пространство");
        setCreating(false);
        return;
      }
      setNewTitle("");
      await loadThreads(filter);
      setCreating(false);
    } catch {
      setError("Произошла ошибка при создании пространства");
      setCreating(false);
    }
  }

  async function loadContent(threadId: string) {
    setContentLoading(true);
    setContentError(null);
    try {
      const res = await fetch(`/api/threads/${threadId}/content`, {
        method: "GET",
      });
      if (!res.ok) {
        setContentError("Не удалось загрузить контент пространства");
        setContentItems([]);
        setContentLoading(false);
        return;
      }
      const data = (await res.json()) as { items: ContentItem[] };
      setContentItems(
        data.items.map((i) => ({
          ...i,
          createdAt: String(i.createdAt),
        })),
      );
      setContentLoading(false);
    } catch {
      setContentError("Произошла ошибка при загрузке контента");
      setContentLoading(false);
    }
  }

  async function loadMessages(threadId: string) {
    try {
      const res = await fetch(`/api/threads/${threadId}/messages`);
      if (!res.ok) return;
      const data = (await res.json()) as { messages: ChatMessage[] };
      setChatMessages(
        (data.messages ?? []).map((m) => ({
          ...m,
          createdAt: String(m.createdAt),
        }))
      );
    } catch {
      setChatMessages([]);
    }
  }

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

  useEffect(() => {
    chatMessagesRef.current = chatMessages;
  }, [chatMessages]);

  useEffect(() => {
    if (!selectedThreadId) return;
    const hasBackground = chatMessages.some((m) => m.jobId || m.needConfirmationJobId);
    if (!hasBackground) {
      setBackgroundRunningCount(0);
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
      return;
    }
    const tid = selectedThreadId;
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
        const countRes = await fetch(`/api/threads/${tid}/chat/jobs`);
        if (countRes.ok) {
          const countData = (await countRes.json()) as { running?: number };
          setBackgroundRunningCount(countData.running ?? 0);
        }
      } catch {
        // ignore
      }
      for (const jobId of jobIds) {
        try {
          const res = await fetch(`/api/threads/${tid}/chat/jobs/${jobId}`);
          const data = (await res.json()) as { status: string; reply?: string; error?: string };
          if (data.status === "done") {
            setChatMessages((prev) =>
              prev.map((m) =>
                (m.jobId === jobId || m.needConfirmationJobId === jobId)
                  ? { ...m, content: data.reply ?? "", jobId: undefined, needConfirmationJobId: undefined }
                  : m
              )
            );
            // Не вызываем loadMessages() — перезапись с сервера убирает другие фоновые сообщения
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
          // keep polling
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
  }, [selectedThreadId, chatMessages]);

  async function handleSelectThread(id: string) {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
    setBackgroundRunningCount(0);
    setSelectedThreadId(id);
    setNewContentText("");
    setSearchQuery("");
    setSearchResults([]);
    setChatMessages([]);
    await Promise.all([loadContent(id), loadMessages(id), checkOllama()]);
  }

  async function handleAddContent() {
    if (!selectedThreadId) return;
    const text = newContentText.trim();
    if (!text) return;
    setSavingContent(true);
    setContentError(null);
    try {
      const res = await fetch(`/api/threads/${selectedThreadId}/content`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const message: string =
          data.reason === "duplicate"
            ? "Этот контент уже есть в пространстве."
            : data.error ?? "Не удалось сохранить контент";
        setContentError(message);
        setSavingContent(false);
        return;
      }
      setNewContentText("");
      await loadContent(selectedThreadId);
      setSavingContent(false);
    } catch {
      setContentError("Произошла ошибка при сохранении контента");
      setSavingContent(false);
    }
  }

  async function handleDeleteContent(contentId: string) {
    if (!selectedThreadId) return;
    setDeletingId(contentId);
    setContentError(null);
    try {
      const res = await fetch(
        `/api/threads/${selectedThreadId}/content/${contentId}`,
        { method: "DELETE" }
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setContentError(data.error ?? "Не удалось удалить контент");
        setDeletingId(null);
        return;
      }
      await loadContent(selectedThreadId);
      setDeletingId(null);
    } catch {
      setContentError("Ошибка при удалении");
      setDeletingId(null);
    }
  }

  async function handleAddByUrl() {
    if (!selectedThreadId) return;
    const url = urlInput.trim();
    if (!url) return;
    setUrlLoading(true);
    setContentError(null);
    try {
      const res = await fetch(`/api/threads/${selectedThreadId}/content/url`, {
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
      await loadContent(selectedThreadId);
      setUrlLoading(false);
    } catch {
      setContentError("Ошибка при загрузке по ссылке");
      setUrlLoading(false);
    }
  }

  const CLARIFICATION_MARKER = "Уточните, пожалуйста";

  async function sendMessage(text: string, intent?: "summary" | "search" | "general") {
    if (!selectedThreadId) return;
    setChatLoading(true);
    const userMsg: ChatMessage = {
      id: `temp-${Date.now()}`,
      role: "USER",
      content: text,
      createdAt: new Date().toISOString(),
    };
    setChatMessages((prev) => [...prev, userMsg]);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 35_000);
    try {
      const res = await fetch(`/api/threads/${selectedThreadId}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, ...(intent && { intent }) }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      const data = (await res.json()) as {
        jobId?: string;
        reply?: string;
        message?: string;
        error?: string;
        needConfirmation?: boolean;
      };
      const ensureUserAndAssistant = (
        prev: ChatMessage[],
        assistantMsg: ChatMessage,
      ): ChatMessage[] => {
        const hasUser =
          prev.some((x) => x.id === userMsg.id) ||
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
        const errText = data.error ?? "Не удалось получить ответ. Запустите Ollama: ollama run llama3.2";
        setChatMessages((prev) => [
          ...prev,
          {
            id: `err-${Date.now()}`,
            role: "ASSISTANT",
            content: errText,
            createdAt: new Date().toISOString(),
          },
        ]);
        setChatLoading(false);
        return;
      }
      const reply = data.reply ?? data.message ?? "";
      setChatMessages((prev) => [
        ...prev,
        {
          id: `assistant-${Date.now()}`,
          role: "ASSISTANT",
          content: reply,
          createdAt: new Date().toISOString(),
        },
      ]);
      // Не вызываем loadMessages() — иначе затираются фоновые задания, которые ещё не в БД
      setChatLoading(false);
    } catch (err) {
      clearTimeout(timeoutId);
      const isTimeout = err instanceof Error && err.name === "AbortError";
      const msg = isTimeout
        ? "Запрос отменён по таймауту. Долгие запросы обрабатываются в фоне — проверьте чат через минуту."
        : "Не удалось получить ответ (сеть или сервер). Попробуйте снова.";
      setChatMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          role: "ASSISTANT",
          content: msg,
          createdAt: new Date().toISOString(),
        },
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
    if (!selectedThreadId) return;
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
    if (chatMessages.length <= 1) return null;
    const prev = chatMessages[chatMessages.length - 2];
    return prev.role === "USER" ? prev.content : null;
  })();

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    const q = searchQuery.trim();
    if (!q) {
      setSearchResults([]);
      setSearchDone(false);
      return;
    }
    setSearchLoading(true);
    setSearchDone(false);
    try {
      const params = new URLSearchParams({ q });
      if (selectedThreadId) {
        params.set("threadId", selectedThreadId);
      }
      const res = await fetch(`/api/search?${params.toString()}`, {
        method: "GET",
      });
      const data = (await res.json()) as { results?: SearchResult[]; error?: string };
      if (!res.ok) {
        setSearchResults([]);
        setSearchLoading(false);
        setSearchDone(true);
        return;
      }
      const results = data.results ?? [];
      setSearchResults(
        results.map((r: SearchResult) => ({
          ...r,
          createdAt: String(r.createdAt),
        })),
      );
      setSearchDone(true);
      setSearchLoading(false);
    } catch {
      setSearchResults([]);
      setSearchDone(true);
      setSearchLoading(false);
    }
  }

  async function handleChangeStatus(id: string, status: ThreadStatus) {
    setError(null);
    try {
      const res = await fetch(`/api/threads/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Не удалось обновить пространство");
        return;
      }
      if (status === "DELETED" && id === selectedThreadId) {
        setSelectedThreadId(null);
        setContentItems([]);
        setChatMessages([]);
      }
      await loadThreads(filter);
    } catch {
      setError("Произошла ошибка при обновлении пространства");
    }
  }

  const emptyTextByFilter: Record<Filter, string> = {
    active: "Пока нет активных пространств. Создайте первое.",
    archived: "В архиве пока пусто.",
    deleted: "Корзина пуста.",
  };

  return (
    <div className="grid gap-6 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
      <section className="rounded-2xl border border-zinc-200 bg-white/80 p-6 shadow-sm">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
            Пространства
          </h2>
          <div className="inline-flex items-center gap-1 rounded-full bg-zinc-100 p-1 text-xs font-medium text-zinc-700">
            {(["active", "archived", "deleted"] as Filter[]).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => {
                  setFilter(key);
                  void loadThreads(key);
                }}
                className={`rounded-full px-3 py-1 transition ${
                  filter === key
                    ? "bg-white shadow-sm text-zinc-900"
                    : "text-zinc-600 hover:bg-white/60"
                }`}
              >
                {key === "active"
                  ? "Активные"
                  : key === "archived"
                    ? "Архив"
                    : "Удаленные"}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-4 flex gap-2">
          <input
            type="text"
            placeholder="Название нового пространства"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            className="flex-1 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/10"
          />
          <button
            type="button"
            onClick={handleCreateThread}
            disabled={creating}
            className="inline-flex items-center justify-center rounded-full bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            {creating ? "Создаем..." : "Создать"}
          </button>
        </div>
        {error && (
          <p className="mt-3 text-sm text-red-600">
            {error}
          </p>
        )}
        <div className="mt-4 border-t border-zinc-100 pt-4">
          {loading ? (
            <p className="text-sm text-zinc-600">Загружаем пространства…</p>
          ) : threads.length === 0 ? (
            <p className="text-sm text-zinc-600">{emptyTextByFilter[filter]}</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {threads.map((thread) => (
                <li
                  key={thread.id}
                  className={`flex items-center justify-between rounded-lg border px-3 py-2 ${
                    selectedThreadId === thread.id
                      ? "border-zinc-900 bg-zinc-50"
                      : "border-zinc-200 bg-white"
                  }`}
                  onClick={() => void handleSelectThread(thread.id)}
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium text-zinc-900">
                      {thread.title}
                    </p>
                    <p className="mt-0.5 text-xs text-zinc-500">
                      Обновлен{" "}
                      {new Date(thread.updatedAt).toLocaleString(undefined, {
                        dateStyle: "short",
                        timeStyle: "short",
                      })}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    {filter !== "active" && (
                      <button
                        type="button"
                        onClick={() =>
                          handleChangeStatus(thread.id, FILTER_TO_STATUS.active)
                        }
                        className="rounded-full px-3 py-1 text-xs text-zinc-700 hover:bg-zinc-100"
                      >
                        В активные
                      </button>
                    )}
                    {filter !== "archived" && (
                      <button
                        type="button"
                        onClick={() =>
                          handleChangeStatus(
                            thread.id,
                            FILTER_TO_STATUS.archived,
                          )
                        }
                        className="rounded-full px-3 py-1 text-xs text-zinc-700 hover:bg-zinc-100"
                      >
                        В архив
                      </button>
                    )}
                    {filter !== "deleted" && (
                      <button
                        type="button"
                        onClick={() => setThreadToDelete(thread)}
                        className="rounded-full px-3 py-1 text-xs text-zinc-700 hover:bg-zinc-100"
                      >
                        В удаленные
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
      <section className="hidden rounded-2xl border border-zinc-200 bg-white/60 p-6 text-sm text-zinc-600 shadow-sm md:block">
        {selectedThreadId ? (
          <>
            <p className="font-medium text-zinc-800">
              Контент выбранного пространства
            </p>
            <div className="mt-3 space-y-3">
              <textarea
                value={newContentText}
                onChange={(e) => setNewContentText(e.target.value)}
                placeholder="Добавьте сюда текст — конспект, заметку или фрагмент документа."
                rows={4}
                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/10"
              />
              <button
                type="button"
                onClick={handleAddContent}
                disabled={savingContent}
                className="inline-flex items-center justify-center rounded-full bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
              >
                {savingContent ? "Сохраняем..." : "Сохранить в пространство"}
              </button>
              {contentError && (
                <p className="text-sm text-red-600">
                  {contentError}
                </p>
              )}
            </div>
            <div className="mt-4 border-t border-zinc-100 pt-4">
              <p className="font-medium text-zinc-800">
                Добавить по ссылке
              </p>
              <div className="mt-2 flex flex-col gap-2">
                <input
                  type="url"
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  placeholder="https://..."
                  className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/10"
                />
                <label className="flex items-center gap-2 text-sm text-zinc-700">
                  <input
                    type="checkbox"
                    checked={translateUrl}
                    onChange={(e) => setTranslateUrl(e.target.checked)}
                    className="h-4 w-4 rounded border-zinc-300 text-zinc-900"
                  />
                  Перевести на мой язык
                </label>
                <label className="flex items-center gap-2 text-sm text-zinc-700">
                  <input
                    type="checkbox"
                    checked={fetchNestedUrl}
                    onChange={(e) => setFetchNestedUrl(e.target.checked)}
                    className="h-4 w-4 rounded border-zinc-300 text-zinc-900"
                  />
                  Загрузить вложенные ссылки с этой страницы
                </label>
                <button
                  type="button"
                  onClick={handleAddByUrl}
                  disabled={urlLoading}
                  className="inline-flex items-center justify-center rounded-full bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
                >
                  {urlLoading ? "Загружаем…" : "Добавить по ссылке"}
                </button>
              </div>
            </div>
            <div className="mt-4 border-t border-zinc-100 pt-4">
              <p className="font-medium text-zinc-800">
                Последний контент
              </p>
              {contentLoading ? (
                <p className="mt-2 text-sm text-zinc-600">
                  Загружаем содержимое пространства…
                </p>
              ) : contentItems.length === 0 ? (
                <p className="mt-2 text-sm text-zinc-600">
                  В этом пространстве пока нет сохранённого текста.
                </p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {contentItems.map((item) => (
                    <li
                      key={item.id}
                      className="flex items-start justify-between gap-2 rounded-lg border border-zinc-200 bg-white p-3"
                    >
                      <div className="min-w-0 flex-1">
                        {item.title && (
                          <p className="text-xs font-medium text-zinc-800 truncate">
                            {item.title}
                          </p>
                        )}
                        <p className="mt-1 text-xs text-zinc-700 whitespace-pre-wrap">
                          {item.originalText.length > 400
                            ? `${item.originalText.slice(0, 400)}…`
                            : item.originalText}
                        </p>
                        <p className="mt-1 text-[11px] text-zinc-400">
                          {new Date(item.createdAt).toLocaleString(undefined, {
                            dateStyle: "short",
                            timeStyle: "short",
                          })}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          void handleDeleteContent(item.id);
                        }}
                        disabled={deletingId === item.id}
                        className="shrink-0 rounded px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                        title="Удалить контент из пространства"
                      >
                        {deletingId === item.id ? "…" : "Удалить"}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="mt-4 border-t border-zinc-100 pt-4">
              <p className="font-medium text-zinc-800">
                Поиск
              </p>
              <form onSubmit={handleSearch} className="mt-2 flex gap-2">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Поиск по этому пространству или по всем пространствам"
                  className="flex-1 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/10"
                />
                <button
                  type="submit"
                  className="inline-flex items-center justify-center rounded-full bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
                  disabled={searchLoading}
                >
                  {searchLoading ? "Ищем..." : "Искать"}
                </button>
              </form>
              {searchLoading && (
                <p className="mt-3 text-sm text-zinc-500">Ищем…</p>
              )}
              {searchDone && !searchLoading && searchResults.length > 0 && (
                <ul className="mt-3 space-y-2">
                  {searchResults.map((r) => (
                    <li
                      key={r.id}
                      className="rounded-lg border border-zinc-200 bg-white p-3"
                    >
                      <p className="text-xs font-medium text-zinc-800">
                        {r.threadTitle}
                      </p>
                      <p className="mt-1 text-xs text-zinc-700">
                        {r.snippet}
                        {r.snippet.length === 240 && "…"}
                      </p>
                      <p className="mt-1 text-[11px] text-zinc-400">
                        {new Date(r.createdAt).toLocaleString(undefined, {
                          dateStyle: "short",
                          timeStyle: "short",
                        })}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
              {searchDone && !searchLoading && searchResults.length === 0 && searchQuery.trim() && (
                <p className="mt-3 text-sm text-zinc-500">
                  По запросу «{searchQuery.trim()}» ничего не найдено.
                </p>
              )}
            </div>
            <div className="mt-4 border-t border-zinc-100 pt-4">
              <div className="flex items-center justify-between gap-2">
                <p className="font-medium text-zinc-800">
                  Чат с помощником
                </p>
                {backgroundRunningCount > 0 && (
                  <div className="shrink-0 flex flex-col items-end gap-1">
                    <span
                      className="rounded-full bg-zinc-200 px-2.5 py-0.5 text-xs font-medium text-zinc-700"
                      title={pendingBackgroundTasks.length > 0 ? pendingBackgroundTasks.map((t) => t.text.slice(0, 80)).join("\n") : "Фоновых заданий"}
                    >
                      В фоне: {backgroundRunningCount}
                    </span>
                    {pendingBackgroundTasks.length > 0 && (
                      <div className="max-w-[260px] rounded-lg border border-zinc-200 bg-zinc-50 px-2 py-1.5 text-[11px] text-zinc-700 shadow-sm">
                        <p className="font-medium text-zinc-600">Обрабатывается:</p>
                        {pendingBackgroundTasks.map((t, idx) => (
                          <p key={t.id} className="mt-0.5 truncate" title={t.text}>
                            {idx + 1}. «{t.text.length > 45 ? `${t.text.slice(0, 45)}…` : t.text}»
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
              {ollamaStatus === "checking" && (
                <p className="mt-1 text-xs text-zinc-500">Проверка подключения к Ollama…</p>
              )}
              {ollamaStatus === "unavailable" && (
                <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  <strong>Ollama не запущена.</strong> Чтобы чат отвечал, в терминале выполните:
                  <code className="mt-1 block rounded bg-amber-100 px-2 py-1 font-mono text-xs">ollama run llama3.2</code>
                  Оставьте терминал открытым и обновите страницу или нажмите «Отправить» снова.
                </div>
              )}
              {ollamaStatus === "available" && (
                <p className="mt-1 text-xs text-green-700">Ollama подключена, можно задавать вопросы.</p>
              )}
              <p className="mt-1 text-xs text-zinc-500">
                Задайте вопрос по контенту пространства: краткое изложение, пересказ, ответ по смыслу.
              </p>
              <div className="mt-2 max-h-64 overflow-y-auto space-y-2 rounded-lg border border-zinc-200 bg-zinc-50/50 p-2">
                {chatMessages.length === 0 && !chatLoading && (
                  <p className="text-xs text-zinc-500">Пока нет сообщений. Напишите вопрос или «сделай краткое изложение».</p>
                )}
                {chatMessages.map((m, msgIndex) => {
                  const requestText = m.role === "ASSISTANT" && msgIndex > 0 && chatMessages[msgIndex - 1].role === "USER"
                    ? chatMessages[msgIndex - 1].content
                    : null;
                  return (
                  <div
                    key={m.id}
                    className={`rounded-lg px-3 py-2 text-sm ${
                      m.role === "USER"
                        ? "ml-4 bg-zinc-900 text-white"
                        : "mr-4 bg-white border border-zinc-200 text-zinc-800"
                    }`}
                  >
                    <p className="whitespace-pre-wrap">{m.content}</p>
                    {m.role === "ASSISTANT" && requestText && (m.jobId || m.needConfirmationJobId) && (
                      <p className="mt-1 text-xs text-zinc-500">Запрос: «{requestText.length > 50 ? `${requestText.slice(0, 50)}…` : requestText}»</p>
                    )}
                    {m.role === "ASSISTANT" && m.needConfirmationJobId && (
                      <>
                        <p className="mt-1 text-xs font-medium text-zinc-600">
                          Статус: задание в фоне. Нажмите кнопку — результат подставится сюда.
                        </p>
                        <div className="mt-2">
                          <button
                            type="button"
                            onClick={() => confirmBackgroundJob(m.needConfirmationJobId!)}
                            className="rounded border border-zinc-400 bg-white px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
                          >
                            Да, запустить обработку в фоне
                          </button>
                        </div>
                      </>
                    )}
                    {m.role === "ASSISTANT" && m.jobId && (
                      <p className="mt-1 text-xs font-medium text-zinc-600">Статус: выполняется в фоне…</p>
                    )}
                  </div>
                ); })}
                {isLastClarification && !chatLoading && (
                  <div className="mr-4 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => sendMessage("сделай краткое изложение")}
                      className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 transition hover:bg-zinc-50"
                    >
                      Краткое изложение
                    </button>
                    <button
                      type="button"
                      onClick={() => sendMessage("найди в контенте")}
                      className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 transition hover:bg-zinc-50"
                    >
                      Поиск по контенту
                    </button>
                    {clarificationTriggerMessage && (
                      <button
                        type="button"
                        onClick={() => sendMessage(clarificationTriggerMessage, "general")}
                        className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 transition hover:bg-zinc-50"
                      >
                        Общий вопрос
                      </button>
                    )}
                  </div>
                )}
                {chatLoading && (
                  <p className="text-xs text-zinc-500">Помощник печатает…</p>
                )}
              </div>
              <form onSubmit={handleSendChat} className="mt-2 flex gap-2">
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder="Вопрос или «сделай краткое изложение»…"
                  className="flex-1 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/10"
                />
                <button
                  type="submit"
                  disabled={chatLoading}
                  className="inline-flex items-center justify-center rounded-full bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
                >
                  Отправить
                </button>
              </form>
            </div>
          </>
        ) : (
          <>
            <p className="font-medium text-zinc-800">
              Выберите пространство слева
            </p>
            <p className="mt-2">
              Здесь будет контент выбранного пространства, быстрый поиск и в будущем —
              локальный чат по этому пространству.
            </p>
          </>
        )}
      </section>

      {threadToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ocean/20 p-4" onClick={() => setThreadToDelete(null)} role="dialog" aria-modal="true" aria-labelledby="delete-thread-title-shell">
          <div className="w-full max-w-md rounded-[20px] border-2 border-ocean/10 bg-white p-6 shadow-[0_2px_16px_rgba(42,91,111,0.08)]" onClick={(e) => e.stopPropagation()}>
            <h2 id="delete-thread-title-shell" className="text-lg font-semibold text-ocean">Удалить пространство?</h2>
            <p className="mt-2 text-sm text-ocean/80">
              Пространство «{threadToDelete.title}», весь контент и диалог будут безвозвратно удалены. Это действие нельзя отменить.
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
                  await handleChangeStatus(id, FILTER_TO_STATUS.deleted);
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

