import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { completeChat } from "@/lib/llm";
import { getCurrentTimeInTimezone } from "@/lib/datetime";

const CONTEXT_MAX_CHARS = 35000;
const SEARCH_TAKE = 25;

const STOPWORDS = new Set([
  "дай", "дайте", "покажи", "покажите", "найди", "найдите", "список", "все", "какие", "какой", "какая",
  "с", "со", "в", "во", "на", "по", "из", "к", "о", "об", "у", "я", "мы", "ты", "вы", "он", "она", "оно", "они",
  "и", "а", "но", "или", "как", "что", "что", "это", "тот", "та", "те", "его", "её", "их", "не", "ни",
  "give", "list", "show", "find", "me", "the", "a", "an", "of", "in", "on", "at", "to", "for",
]);

/** Русские и английские пары, чтобы находить контент на обоих языках (например, страницы centralbank.ae на английском). */
const QUERY_EXPANSIONS: Record<string, string[]> = {
  оаэ: ["оаэ", "uae", "u.a.e", "emirates"],
  регулирование: ["регулирование", "regulation", "regulatory", "regulations"],
  регулированием: ["регулированием", "regulation", "regulatory"],
  финанс: ["финанс", "financial"],
  учрежден: ["учрежден", "institution", "institutions"],
  юридическ: ["юридическ", "legal", "entities", "licensed"],
  банк: ["банк", "bank", "central bank"],
  центральный: ["центральный", "central"],
  cbuae: ["cbuae", "central bank", "uae", "centralbank", "licensed", "financial institutions"],
  cubae: ["cubae", "central bank", "uae", "centralbank", "licensed", "financial institutions"],
};

function extractSearchKeywords(query: string): string[] {
  const normalized = query
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .trim();
  const words = normalized.split(/\s+/).filter((w) => w.length >= 2 && !STOPWORDS.has(w));
  const base = [...new Set(words)].slice(0, 8);
  const expanded = new Set<string>();
  for (const w of base) {
    expanded.add(w);
    for (const [key, variants] of Object.entries(QUERY_EXPANSIONS)) {
      if (w === key || w.startsWith(key) || key.startsWith(w)) {
        variants.forEach((v) => expanded.add(v));
      }
    }
  }
  return [...expanded].slice(0, 20);
}

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

  const keywords = extractSearchKeywords(message);
  const searchCondition =
    keywords.length > 0
      ? {
          OR: [
            ...keywords.map((k) => ({ originalText: { contains: k } })),
            ...keywords.map((k) => ({ title: { contains: k } })),
          ],
        }
      : { originalText: { contains: message.slice(0, 100) } };

  const items = await prisma.contentItem.findMany({
    where: {
      thread: { userId: user.id, status: { not: "DELETED" } },
      ...searchCondition,
    },
    include: { thread: true },
    orderBy: { createdAt: "desc" },
    take: SEARCH_TAKE,
  });

  const sources = items.map((i) => ({
    id: i.id,
    threadId: i.threadId,
    threadTitle: i.thread.title,
    title: i.title,
    snippet: i.originalText.slice(0, 300),
  }));

  const uniqueThreads = Array.from(
    new Map(items.map((i) => [i.threadId, i.thread.title])).entries()
  ).map(([id, title]) => ({ threadId: id, threadTitle: title }));

  const contextBlocks = items.map((i) => {
    const head = `[Тред: ${i.thread.title}${i.title ? ` | ${i.title}` : ""}]\n`;
    return head + i.originalText.slice(0, 2000);
  });
  let context = contextBlocks.join("\n\n---\n\n").slice(0, CONTEXT_MAX_CHARS);
  if (contextBlocks.join("").length > CONTEXT_MAX_CHARS) {
    context += "\n\n[... обрезано ...]";
  }

  const styleHint =
    user.style === "CASUAL"
      ? "Отвечай разговорно, дружелюбно."
      : "Отвечай строго и по делу, без лишних слов.";
  const langRule =
    user.language === "ru"
      ? "Отвечай только на русском языке. Используй только кириллицу и при необходимости латиницу (для названий). Запрещено использовать иероглифы (китайские, японские и т.д.), слова на других языках (английском, немецком «andere», индонезийском «tidak» и т.п.) в теле ответа."
      : "Answer in the user's language only. Use only Latin/Cyrillic script. Do not use ideographic characters (Chinese, Japanese, etc.) or words in other languages.";

  const hasContext = context && !context.startsWith("(по запросу");
  const threadNames = uniqueThreads.map((t) => t.threadTitle).join(", ");
  const sourceInstruction = hasContext
    ? `КРИТИЧНО: В приложении «тред» — это папка с названием. Реально найденные треды (список полный, других нет): ${threadNames}.

В ответе перечисли ТОЛЬКО эти названия тредов. ЗАПРЕЩЕНО перечислять как треды: названия законов, документов, «Guidance for…», «Cabinet Decision…», «Procedures for…», «Central Bank & Organization…», «AML/CFT…» и т.п. — это фрагменты текста внутри треда, а не треды. Если найден один тред — напиши один пункт. Формат: «Найден тред: [название]. [Одним предложением — о чём.] Перейти в тред можно по ссылке в блоке «Найденные треды» ниже.» Не приводи URL и не нумеруй длинные списки документов.`
    : "Результатов поиска по тредам нет. Напиши коротко и чётко на русском, только кириллицей: «По запросу ничего не найдено в ваших тредах. Попробуйте другие слова или добавьте контент в треды.» Без иероглифов и слов на других языках.";

  const nowInTz = getCurrentTimeInTimezone(user.timezone, user.language === "ru" ? "ru" : "en");
  const tzLine = `Часовой пояс пользователя: ${user.timezone}. Текущие дата и время у пользователя (используй только их, не выдумывай): ${nowInTz}. На вопросы «который час», «какое время», «текущая дата» отвечай только по этим данным.`;

  const systemContent = `Ты помощник в приложении «my treds». У пользователя есть сохранённые треды с контентом. Ниже — фрагменты, найденные по запросу.
${tzLine}
${langRule} ${styleHint}

${hasContext ? "Контекст из тредов пользователя:" : "Результаты поиска:"}
${context || "(по запросу ничего не найдено в сохранённых тредах)"}

---
Инструкция: ${sourceInstruction}`;

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

  return NextResponse.json(
    { reply, sources },
    { status: 200 }
  );
}
