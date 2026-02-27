import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { completeChat } from "@/lib/llm";
import { getCurrentTimeInTimezone } from "@/lib/datetime";
import {
  getBackgroundAfterMs,
  canAcceptBackground,
  createJob,
  getJob,
  setJobDone,
  setJobError,
  BACKGROUND_JOB_TIMEOUT_MS,
} from "@/lib/chat-jobs";

type RouteParams = { params: Promise<{ id: string }> };

const CONTEXT_MAX_CHARS = 40000;
const HISTORY_MESSAGES = 20;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Вопросы о времени/дате — отвечаем сразу без контекста пространства и без вызова LLM */
function isSimpleTimeDateQuestion(text: string): boolean {
  const t = text.toLowerCase().replace(/\s+/g, " ").trim();
  const timeDatePatterns = [
    /сколько\s+(сейчас\s+)?(времени|время)/,
    /который\s+час/,
    /какое\s+(сейчас\s+)?время/,
    /текущ(ее|ая)\s+(дата|время)/,
    /какая\s+(сейчас\s+)?дата/,
    /сегодняшн(яя|я)\s+дата/,
    /what\s+time|current\s+time|what\'?s\s+the\s+time/,
  ];
  return timeDatePatterns.some((p) => p.test(t)) || /^(время|дата|который час)\s*\?*$/i.test(t);
}

/** Мета-вопросы о помощнике — ответ сразу, без контекста и без LLM (чтобы не уходить в фон) */
function isSimpleMetaQuestion(text: string): boolean {
  const t = text.toLowerCase().replace(/\s+/g, " ").trim();
  const metaPatterns = [
    /как\s+тебя\s+зовут/,
    /как\s+тебя\s+звать/,
    /кто\s+ты\s*\?*$/,
    /что\s+ты\s+умеешь/,
    /тво[ёe]\s+имя/,
    /как\s+тебя\s*\?*$/,
    /what('s|\s+is)\s+your\s+name/,
    /who\s+are\s+you/,
  ];
  return metaPatterns.some((p) => p.test(t));
}

const META_REPLY_RU =
  "Я помощник в приложении «my spaces». Отвечаю на вопросы по контенту пространства (выжимки, поиск) и на общие вопросы. Можете спросить «сделай выжимку» или задать любой вопрос.";
const META_REPLY_EN =
  "I'm the assistant in «my spaces». I answer questions about your space content (summaries, search) and general questions. Try «make an excerpt» or ask anything.";

/** Неоднозначный запрос: короткий или без явного намерения — перед глубоким поиском уточняем */
function isAmbiguousQuestion(text: string): boolean {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length >= 35) return false; // развёрнутый вопрос — идём в поиск
  const lower = t.toLowerCase();
  const clearIntents = [
    "сделай выжимку",
    "выжимку",
    "выжимка",
    "кратко",
    "суть",
    "перескажи",
    "найди",
    "расскажи",
    "опиши",
    "сравни",
    "что сказано",
    "что в контенте",
    "что говорится",
    "как получить",
    "где указано",
    "зачем",
    "как тебя зовут",
    "как тебя звать",
    "кто ты",
    "что ты умеешь",
    "твоё имя",
    "как тебя",
  ];
  const looksClear = clearIntents.some((phrase) => lower.startsWith(phrase) || lower === phrase);
  if (looksClear) return false;
  const words = t.split(/\s+/).length;
  return words <= 2 || t.length < 25;
}

/** Короткий отказ («нет», «не надо») — не зацикливаем уточнение */
function isDeclineReply(text: string): boolean {
  const t = text.toLowerCase().replace(/\s+/g, " ").trim();
  const decline = ["нет", "не надо", "не нужно", "отмена", "no", "не хочу", "пропустить", "skip"];
  return decline.includes(t) || t.length <= 3 && /^н(ет|е)?\s*$/i.test(t);
}

const CLARIFICATION_REPLY_RU =
  "Уточните, пожалуйста: вам нужна выжимка по контенту пространства, поиск по теме или ответ на конкретный вопрос? Например: «сделай выжимку» или «что сказано про …».";
const CLARIFICATION_REPLY_EN =
  "Please clarify: do you need a summary of the space content, search by topic, or an answer to a specific question? For example: «make an excerpt» or «what does it say about…».";
const DECLINE_REPLY_RU =
  "Хорошо. Напишите свой вопрос — например, «сделай выжимку» или любой другой — и я отвечу.";
const DECLINE_REPLY_EN =
  "Sure. Type your question — e.g. «make an excerpt» or anything else — and I’ll answer.";

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
  const skipClarification = body.intent === "summary" || body.intent === "search" || body.intent === "general";
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

  // Простые вопросы (время/дата) — ответ сразу, без контекста и без LLM
  if (isSimpleTimeDateQuestion(userMessage)) {
    const nowInTz = getCurrentTimeInTimezone(user.timezone, user.language === "ru" ? "ru" : "en");
    const reply =
      user.language === "ru"
        ? `Сейчас у вас: ${nowInTz}.`
        : `Current time for you: ${nowInTz}.`;
    await prisma.threadMessage.createMany({
      data: [
        { threadId: thread.id, role: "USER", content: userMessage },
        { threadId: thread.id, role: "ASSISTANT", content: reply },
      ],
    });
    return NextResponse.json({ reply, message: reply, sources: [] }, { status: 200 });
  }

  // Мета-вопросы о помощнике — ответ сразу, без контекста и без LLM
  if (isSimpleMetaQuestion(userMessage)) {
    const reply = user.language === "ru" ? META_REPLY_RU : META_REPLY_EN;
    await prisma.threadMessage.createMany({
      data: [
        { threadId: thread.id, role: "USER", content: userMessage },
        { threadId: thread.id, role: "ASSISTANT", content: reply },
      ],
    });
    return NextResponse.json({ reply, message: reply, sources: [] }, { status: 200 });
  }

  // Неоднозначный вопрос — уточняем, без глубокого поиска и без вызова LLM (или пользователь нажал кнопку выбора — intent передан)
  if (!skipClarification && isAmbiguousQuestion(userMessage)) {
    if (isDeclineReply(userMessage)) {
      const reply = user.language === "ru" ? DECLINE_REPLY_RU : DECLINE_REPLY_EN;
      await prisma.threadMessage.createMany({
        data: [
          { threadId: thread.id, role: "USER", content: userMessage },
          { threadId: thread.id, role: "ASSISTANT", content: reply },
        ],
      });
      return NextResponse.json({ reply, message: reply, sources: [] }, { status: 200 });
    }
    const reply = user.language === "ru" ? CLARIFICATION_REPLY_RU : CLARIFICATION_REPLY_EN;
    await prisma.threadMessage.createMany({
      data: [
        { threadId: thread.id, role: "USER", content: userMessage },
        { threadId: thread.id, role: "ASSISTANT", content: reply },
      ],
    });
    return NextResponse.json({ reply, message: reply, sources: [] }, { status: 200 });
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
  const langRule =
    user.language === "ru"
      ? "Весь ответ пиши по-русски. В оригинале оставляй только термины и названия (например: card scheme license, Level 2 Acts, Central Bank). Обычные слова (your, you, suggested, actions, steps, text и т.п.) — только по-русски. Никаких иероглифов и вкраплений португальского/английского вместо русских слов."
      : "Use only Latin/Cyrillic, no ideographic characters.";
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

  const chatPromise = completeChat(messages);
  const timeoutMs = getBackgroundAfterMs();
  let winner: { type: "done"; reply: string } | { type: "timeout" };
  try {
    winner = await Promise.race([
      chatPromise.then((reply) => ({ type: "done" as const, reply })),
      sleep(timeoutMs).then(() => ({ type: "timeout" as const })),
    ]);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Ошибка LLM";
    let hint = ` ${msg}`;
    if (msg.toLowerCase().includes("fetch") || msg.toLowerCase().includes("econnrefused")) {
      hint = " Запустите в терминале: ollama serve, затем ollama run llama3.2 (или установите Ollama с https://ollama.ai).";
    } else if (msg.includes("404") || (msg.toLowerCase().includes("model") && msg.toLowerCase().includes("not found"))) {
      hint = " Модель не найдена. В терминале выполните: ollama pull llama3.2 (дождитесь загрузки), затем попробуйте снова.";
    } else if (msg.toLowerCase().includes("memory") || msg.toLowerCase().includes("system memory")) {
      hint = " Не хватает памяти на сервере. Добавьте swap или в .env укажите OLLAMA_MODEL=llama3.2:1b.";
    }
    return NextResponse.json(
      { error: "Не удалось получить ответ." + hint },
      { status: 502 }
    );
  }

  if (winner.type === "done") {
    await prisma.threadMessage.createMany({
      data: [
        { threadId: thread.id, role: "USER", content: userMessage },
        { threadId: thread.id, role: "ASSISTANT", content: winner.reply },
      ],
    });
    return NextResponse.json(
      { reply: winner.reply, message: winner.reply, sources },
      { status: 200 }
    );
  }

  if (!canAcceptBackground()) {
    try {
      const reply = await chatPromise;
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
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Ошибка LLM";
      let hint = ` ${msg}`;
      if (msg.toLowerCase().includes("fetch") || msg.toLowerCase().includes("econnrefused")) {
        hint = " Запустите в терминале: ollama serve, затем ollama run llama3.2 (или установите Ollama с https://ollama.ai).";
      } else if (msg.includes("404") || (msg.toLowerCase().includes("model") && msg.toLowerCase().includes("not found"))) {
        hint = " Модель не найдена. В терминале выполните: ollama pull llama3.2 (дождитесь загрузки), затем попробуйте снова.";
      } else if (msg.toLowerCase().includes("memory") || msg.toLowerCase().includes("system memory")) {
        hint = " Не хватает памяти на сервере. Добавьте swap или в .env укажите OLLAMA_MODEL=llama3.2:1b.";
      }
      return NextResponse.json(
        { error: "Не удалось получить ответ." + hint },
        { status: 502 }
      );
    }
  }

  const jobId = createJob(thread.id, user.id);
  const timeoutHandle = setTimeout(() => {
    const job = getJob(jobId);
    if (job?.status === "running") {
      setJobError(jobId, "Задание не выполнено по таймауту (12 мин). Попробуйте короче запрос или повторите позже.");
    }
  }, BACKGROUND_JOB_TIMEOUT_MS);

  chatPromise
    .then(async (reply) => {
      clearTimeout(timeoutHandle);
      await prisma.threadMessage.createMany({
        data: [
          { threadId: thread.id, role: "USER", content: userMessage },
          { threadId: thread.id, role: "ASSISTANT", content: reply },
        ],
      });
      setJobDone(jobId, reply, sources);
    })
    .catch((err) => {
      clearTimeout(timeoutHandle);
      const msg = err instanceof Error ? err.message : String(err);
      let userMessage = "Фоновое задание не выполнено.";
      if (msg.toLowerCase().includes("fetch") || msg.toLowerCase().includes("econnrefused")) {
        userMessage += " Ollama недоступна. Запустите ollama serve и ollama run llama3.2.";
      } else if (msg.toLowerCase().includes("memory") || msg.toLowerCase().includes("system memory")) {
        userMessage += " Не хватает памяти на сервере. Используйте OLLAMA_MODEL=llama3.2:1b или добавьте swap.";
      } else if (msg.includes("timeout") || msg.includes("abort")) {
        userMessage += " Превышено время ожидания ответа Ollama. Попробуйте позже.";
      } else if (msg.length < 200) {
        userMessage += ` ${msg}`;
      }
      setJobError(jobId, userMessage);
    });

  return NextResponse.json(
    { jobId, status: "processing", message: "Запрос обрабатывается в фоне. Результат появится в чате." },
    { status: 202 }
  );
}
