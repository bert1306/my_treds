import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { completeChat } from "@/lib/llm";
import { getCurrentTimeInTimezone } from "@/lib/datetime";

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body.message !== "string") {
    return NextResponse.json({ error: "Invalid payload: message required" }, { status: 400 });
  }

  const message = body.message.trim();
  if (!message) {
    return NextResponse.json({ error: "Message is empty" }, { status: 400 });
  }

  const styleHint =
    user.style === "CASUAL"
      ? "Отвечай разговорно, дружелюбно."
      : "Отвечай строго и по делу, без лишних слов.";

  const nowInTz = getCurrentTimeInTimezone(user.timezone, user.language === "ru" ? "ru" : "en");
  const tzLine = `Часовой пояс пользователя: ${user.timezone}. Текущие дата и время у пользователя (используй только их, не выдумывай): ${nowInTz}. На вопросы «который час», «какое время», «текущая дата» отвечай только по этим данным.`;
  const langRule =
    user.language === "ru"
      ? "КРИТИЧНО: весь ответ только по-русски. Латинскими буквами только: названия организаций, аббревиатуры (AML, KYC), термины. Глаголы и связки — по-русски. Запрещено: Exist/need a/must have/Additionally/It's worth noting и любые английские фразы вместо русских. Без иероглифов."
      : "Use only Latin/Cyrillic, no ideographic characters.";
  const systemContent = `Ты помощник пользователя в приложении «my spaces». Отвечай на общие вопросы. ${tzLine} Язык ответа: ${user.language === "ru" ? "русский" : "язык пользователя"}. ${langRule} ${styleHint}`;

  let reply: string;
  try {
    reply = await completeChat([
      { role: "system", content: systemContent },
      { role: "user", content: message },
    ]);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Ошибка LLM";
    let hint = ` ${msg}`;
    if (msg.toLowerCase().includes("fetch") || msg.toLowerCase().includes("econnrefused")) {
      hint = " Запустите: ollama serve, затем ollama run llama3.2";
    } else if (msg.includes("404") || (msg.toLowerCase().includes("model") && msg.toLowerCase().includes("not found"))) {
      hint = " Выполните: ollama pull llama3.2";
    }
    return NextResponse.json(
      { error: "Не удалось получить ответ." + hint },
      { status: 502 }
    );
  }

  return NextResponse.json({ reply }, { status: 200 });
}
