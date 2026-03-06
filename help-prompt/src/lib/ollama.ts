/**
 * Вызов Ollama API для чата. Используется в API /api/chat (этап 4).
 */

const OLLAMA_URL = (process.env.OLLAMA_URL ?? "http://localhost:11434").replace(/\/$/, "");
const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? "llama3.2";
const OLLAMA_TIMEOUT_MS = Math.max(5000, parseInt(process.env.OLLAMA_TIMEOUT_MS ?? "60000", 10) || 60000);

export type OllamaMessage = { role: "system" | "user" | "assistant"; content: string };

export type OllamaErrorCode =
  | "timeout"
  | "connection"
  | "model_not_found"
  | "server_error"
  | "unknown";

export type OllamaResult =
  | { ok: true; content: string }
  | { ok: false; code: OllamaErrorCode; message: string };

/**
 * Отправляет запрос в Ollama /api/chat (без стриминга). Возвращает ответ ассистента или ошибку.
 */
export async function chatWithOllama(messages: OllamaMessage[]): Promise<OllamaResult> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), OLLAMA_TIMEOUT_MS);

  try {
    const res = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        messages,
        stream: false,
        options: {
          temperature: 0.7,
          num_predict: 2048,
        },
      }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!res.ok) {
      const text = await res.text();
      if (res.status === 404 || text.toLowerCase().includes("not found")) {
        return { ok: false, code: "model_not_found", message: `Модель не найдена. Выполните: ollama pull ${OLLAMA_MODEL}` };
      }
      return {
        ok: false,
        code: "server_error",
        message: text || `Ollama вернула ${res.status}`,
      };
    }

    const data = (await res.json()) as { message?: { content?: string }; error?: string };
    if (data.error) {
      return { ok: false, code: "server_error", message: data.error };
    }
    const content = data.message?.content ?? "";
    return { ok: true, content };
  } catch (e) {
    clearTimeout(timeoutId);
    if (e instanceof Error) {
      if (e.name === "AbortError") {
        return { ok: false, code: "timeout", message: "Превышено время ожидания ответа. Попробуйте короче сообщение или повторите позже." };
      }
      const msg = e.message || "";
      if (msg.includes("ECONNREFUSED") || msg.includes("fetch failed") || msg.includes("network")) {
        return {
          ok: false,
          code: "connection",
          message: `Ollama недоступна. Запустите: ollama serve, затем ollama run ${OLLAMA_MODEL}`,
        };
      }
      return { ok: false, code: "unknown", message: msg || "Ошибка при запросе к ИИ." };
    }
    return { ok: false, code: "unknown", message: "Ошибка при запросе к ИИ." };
  }
}

export function getOllamaModel(): string {
  return OLLAMA_MODEL;
}
