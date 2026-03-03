"use client";

import { useState, useRef, useEffect } from "react";

type Message = { id: string; role: "user" | "assistant"; content: string; createdAt: string };

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const areaRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });

  useEffect(() => {
    if (messages.length) scrollToBottom();
  }, [messages]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || loading) return;
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
        body: JSON.stringify({ message: text, sessionId }),
      });
      const data = (await res.json()) as { reply?: string; sessionId?: string };
      if (data.sessionId) setSessionId(data.sessionId);
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

  const inputBlock = (
    <div className="w-full bg-[var(--color-bg)] rounded-[24px] px-4 py-2 flex items-end gap-2 border-2 border-transparent focus-within:border-[var(--color-primary)]">
      <form onSubmit={handleSubmit} className="flex-1 flex items-end gap-2">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSubmit(e); } }}
          placeholder="Сообщение..."
          rows={1}
          className="w-full min-h-[24px] max-h-[200px] resize-none border-0 bg-transparent py-3 text-base outline-none placeholder:opacity-50"
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
    <div className="min-h-screen flex flex-col">
      <header className="h-16 flex-shrink-0 flex items-center justify-between px-4 md:px-6 bg-[var(--color-surface)] border-b border-[rgba(42,91,111,0.1)]">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => { setMessages([]); setSessionId(null); }}
            className="flex items-center gap-2 rounded-xl px-2 py-2 text-sm font-medium text-[var(--color-secondary)] hover:bg-[rgba(42,91,111,0.08)] transition"
            title="В главное меню"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
            <span className="hidden sm:inline">В меню</span>
          </button>
          <span className="text-lg font-semibold text-[var(--color-secondary)]">Help Prompt</span>
        </div>
        <div className="flex items-center gap-2">
          {hasMessages && (
            <button
              type="button"
              onClick={() => { setMessages([]); setSessionId(null); }}
              className="rounded-xl px-3 py-1.5 text-sm font-medium text-[var(--color-secondary)] hover:bg-[rgba(42,91,111,0.08)]"
            >
              Новый чат
            </button>
          )}
        </div>
      </header>

      <div ref={areaRef} className="messages-area flex-1">
        {!hasMessages && !loading && (
          <div className="max-w-[600px] mx-auto py-10 px-6 text-center">
            <h1 className="text-3xl font-semibold text-[var(--color-secondary)] mb-8">Чем могу помочь?</h1>
            <div className="grid grid-cols-2 gap-3">
              {["Расскажи про тренды 2026", "Помоги сформулировать задачу", "Идеи для проекта", "Краткое резюме"].map((label) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => setInput(label)}
                  className="rounded-2xl bg-[var(--color-surface)] p-4 text-left text-sm text-[var(--color-secondary)] shadow-[var(--shadow-sm)] hover:border-2 hover:border-[var(--color-primary)] hover:-translate-y-0.5 transition"
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="mt-8 flex justify-center text-left w-full max-w-[600px] mx-auto">
              {inputBlock}
            </div>
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

      {hasMessages && (
        <div className="input-area">
          <div className="max-w-[800px] mx-auto w-full">
            {inputBlock}
          </div>
        </div>
      )}
    </div>
  );
}
