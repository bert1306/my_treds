/**
 * Абстракция LLM-провайдера. Сейчас — Ollama (локально).
 * Позже: облачные API, смена модели через env.
 */

const OLLAMA_URL = process.env.OLLAMA_URL ?? "http://localhost:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? "llama3.2";
const OLLAMA_LIGHT_MODEL = process.env.OLLAMA_LIGHT_MODEL ?? OLLAMA_MODEL;

export type LLMMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

function chatWithOptions(messages: LLMMessage[], options: { model: string; timeoutMs: number }): Promise<string> {
  const { model, timeoutMs } = options;
  return fetch(`${OLLAMA_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      stream: false,
    }),
    signal: AbortSignal.timeout(timeoutMs),
  }).then(async (res) => {
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Ollama error ${res.status}: ${err}`);
    }
    const data = (await res.json()) as { message?: { content?: string } };
    return data.message?.content?.trim() ?? "";
  });
}

/** Лёгкий вызов LLM (малый таймаут, опционально другая модель) — для быстрых ответов без контекста */
export async function completeChatLight(messages: LLMMessage[], timeoutMs = 10_000): Promise<string> {
  return chatWithOptions(messages, { model: OLLAMA_LIGHT_MODEL, timeoutMs });
}

/** Основной вызов LLM (полный контекст, длинный таймаут для фона) */
export async function completeChat(messages: LLMMessage[]): Promise<string> {
  return chatWithOptions(messages, { model: OLLAMA_MODEL, timeoutMs: 600_000 });
}

export async function isOllamaAvailable(): Promise<boolean> {
  try {
    const res = await fetch(`${OLLAMA_URL}/api/tags`, {
      signal: AbortSignal.timeout(3000),
    });
    return res.ok;
  } catch {
    return false;
  }
}
