import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { completeChat } from "@/lib/llm";
import { getCurrentTimeInTimezone } from "@/lib/datetime";

type RouteParams = { params: Promise<{ id: string }> };

const CONTEXT_MAX_CHARS = 40000;
const HISTORY_MESSAGES = 20;

export async function POST(req: NextRequest, { params }: RouteParams) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body.message !== "string") {
    return NextResponse.json({ error: "Invalid payload: message required" }, { status: 400 });
  }

  const userMessage = body.message.trim();
  if (!userMessage) {
    return NextResponse.json({ error: "Message is empty" }, { status: 400 });
  }

  const { id } = await params;

  const thread = await prisma.thread.findFirst({
    where: { id, userId: user.id, status: { not: "DELETED" } },
    include: { contentItems: { orderBy: { createdAt: "desc" }, take: 50 } },
  });

  if (!thread) {
    return NextResponse.json({ error: "Thread not found" }, { status: 404 });
  }

  const searchItems = await prisma.contentItem.findMany({
    where: {
      threadId: thread.id,
      originalText: { contains: userMessage },
    },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  const sources = searchItems.map((i) => ({
    id: i.id,
    threadId: i.threadId,
    threadTitle: thread.title,
    title: i.title,
    snippet: i.originalText.slice(0, 300),
  }));

  let context: string;
  if (searchItems.length > 0) {
    const blocks = searchItems.map((i) => {
      const title = i.title ? `[${i.title}]\n` : "";
      return title + i.originalText.slice(0, 4000);
    });
    context = blocks.join("\n\n---\n\n").slice(0, CONTEXT_MAX_CHARS);
    if (blocks.join("").length > CONTEXT_MAX_CHARS) context += "\n\n[... обрезано ...]";
  } else {
    const contentBlocks = thread.contentItems
      .map((i) => {
        const title = i.title ? `[${i.title}]\n` : "";
        return title + i.originalText;
      })
      .join("\n\n---\n\n");
    context = contentBlocks.slice(0, CONTEXT_MAX_CHARS);
    if (contentBlocks.length > CONTEXT_MAX_CHARS) context += "\n\n[... текст обрезан ...]";
  }

  const styleHint =
    user.style === "CASUAL"
      ? "Отвечай разговорно, дружелюбно."
      : "Отвечай строго и по делу, без лишних слов.";

  const nowInTz = getCurrentTimeInTimezone(user.timezone, user.language === "ru" ? "ru" : "en");
  const tzLine = `Часовой пояс пользователя: ${user.timezone}. Текущие дата и время у пользователя (используй только их): ${nowInTz}. На вопросы о текущем времени или дате отвечай только по этим данным.`;
  const langRule = user.language === "ru" ? "Только кириллица и латиница, без иероглифов и слов на других языках." : "Use only Latin/Cyrillic, no ideographic characters.";
  const systemContent = `Ты помощник пользователя в приложении «my spaces». У пользователя выбрано пространство с сохранённым контентом (статьи, заметки, ссылки). Отвечай на вопросы по этому контенту: делай выжимки, пересказывай, ищи по смыслу, сравнивай. Если в контексте нет подходящего материала — честно скажи об этом. ${tzLine} Язык ответа: ${user.language === "ru" ? "русский" : "user's language"}. ${langRule} ${styleHint}

Контекст пространства (источники):
${context || "(пока нет загруженного контента в пространстве)"}`;

  const history = await prisma.threadMessage.findMany({
    where: { threadId: thread.id },
    orderBy: { createdAt: "desc" },
    take: HISTORY_MESSAGES,
  });
  history.reverse();

  const messages: { role: "system" | "user" | "assistant"; content: string }[] = [
    { role: "system", content: systemContent },
    ...history.map((m) => ({
      role: (m.role === "USER" ? "user" : "assistant") as "user" | "assistant",
      content: m.content,
    })),
    { role: "user", content: userMessage },
  ];

  let reply: string;
  try {
    reply = await completeChat(messages);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Ошибка LLM";
    let hint = ` ${msg}`;
    if (msg.toLowerCase().includes("fetch") || msg.toLowerCase().includes("econnrefused")) {
      hint = " Запустите в терминале: ollama serve, затем ollama run llama3.2 (или установите Ollama с https://ollama.ai).";
    } else if (msg.includes("404") || msg.toLowerCase().includes("model") && msg.toLowerCase().includes("not found")) {
      hint = " Модель не найдена. В терминале выполните: ollama pull llama3.2 (дождитесь загрузки), затем попробуйте снова.";
    } else if (msg.toLowerCase().includes("memory") || msg.toLowerCase().includes("system memory")) {
      hint = " Не хватает памяти на сервере. Добавьте swap (см. инструкцию в чате) или в .env укажите модель поменьше: OLLAMA_MODEL=llama3.2:1b.";
    }
    return NextResponse.json(
      { error: "Не удалось получить ответ." + hint },
      { status: 502 }
    );
  }

  await prisma.threadMessage.createMany({
    data: [
      { threadId: thread.id, role: "USER", content: userMessage },
      { threadId: thread.id, role: "ASSISTANT", content: reply },
    ],
  });

  return NextResponse.json(
    { reply, message: reply, sources },
    { status: 200 }
  );
}
