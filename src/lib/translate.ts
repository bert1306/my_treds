/**
 * Перевод текста на язык пользователя. Сейчас через LLM (Ollama).
 * Позже можно заменить на отдельный API перевода.
 */

import { completeChat } from "./llm";

const LANGUAGE_NAMES: Record<string, string> = {
  ru: "русский",
  en: "английский",
  de: "немецкий",
  fr: "французский",
  es: "испанский",
};

export async function translateToLanguage(
  text: string,
  targetLanguageCode: string
): Promise<string> {
  const langName = LANGUAGE_NAMES[targetLanguageCode] ?? targetLanguageCode;
  const system = `Ты переводчик. Переведи следующий текст на язык: ${langName}. Сохраняй структуру (абзацы, списки). Отвечай только переведённым текстом, без пояснений.`;
  const reply = await completeChat([
    { role: "system", content: system },
    { role: "user", content: text.slice(0, 30000) },
  ]);
  return reply || text;
}
