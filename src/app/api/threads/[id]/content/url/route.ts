import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { fetchAndExtractText, fetchAndExtractTextWithLinks } from "@/lib/url-content";
import { translateToLanguage } from "@/lib/translate";
import { addUrlContentToThread } from "@/lib/content";

type RouteParams = { params: Promise<{ id: string }> };

function isValidUrl(s: string): boolean {
  try {
    const u = new URL(s);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body.url !== "string") {
    return NextResponse.json({ error: "Invalid payload: url required" }, { status: 400 });
  }

  const url = body.url.trim();
  const translate = Boolean(body.translate);
  const fetchNested = Boolean(body.fetchNested);

  if (!isValidUrl(url)) {
    return NextResponse.json({ error: "Некорректная ссылка" }, { status: 400 });
  }

  const { id } = await params;

  const thread = await prisma.thread.findFirst({
    where: {
      id,
      userId: user.id,
      status: { not: "DELETED" },
    },
  });

  if (!thread) {
    return NextResponse.json({ error: "Thread not found" }, { status: 404 });
  }

  const lang = user.language;

  try {
    if (fetchNested) {
      const { title: pageTitle, text, nestedLinks } = await fetchAndExtractTextWithLinks(url);
      let finalText = text;
      if (translate && lang !== "en") {
        try {
          finalText = await translateToLanguage(text.slice(0, 15000), lang);
        } catch {
          // оставляем оригинал
        }
      }
      const first = await addUrlContentToThread({
        threadId: thread.id,
        url,
        title: pageTitle,
        originalText: finalText,
        language: lang,
      });
      if (!first.created && first.reason === "duplicate") {
        return NextResponse.json(
          { ok: false, reason: "duplicate", message: "Контент с этой ссылки уже в пространстве" },
          { status: 409 }
        );
      }
      const items: Array<{ id: string; title: string; source: string; language: string; createdAt: Date; originalText: string }> = [
        { id: first.item.id, title: first.item.title ?? "", source: first.item.source, language: first.item.language, createdAt: first.item.createdAt, originalText: first.item.originalText },
      ];
      for (const link of nestedLinks) {
        try {
          const { title: nestedTitle, text: nestedText } = await fetchAndExtractText(link);
          let nestedFinal = nestedText;
          if (translate && lang !== "en") {
            try {
              nestedFinal = await translateToLanguage(nestedText.slice(0, 15000), lang);
            } catch {
              // оставляем оригинал
            }
          }
          const res = await addUrlContentToThread({
            threadId: thread.id,
            url: link,
            title: nestedTitle,
            originalText: nestedFinal,
            language: lang,
          });
          if (res.created) {
            items.push({
              id: res.item.id,
              title: res.item.title ?? "",
              source: res.item.source,
              language: res.item.language,
              createdAt: res.item.createdAt,
              originalText: res.item.originalText,
            });
          }
        } catch {
          // пропускаем одну ссылку при ошибке
        }
      }
      return NextResponse.json({ ok: true, items }, { status: 201 });
    }

    const { title: pageTitle, text } = await fetchAndExtractText(url);
    let finalText = text;
    if (translate && lang !== "en") {
      try {
        finalText = await translateToLanguage(text.slice(0, 15000), lang);
      } catch {
        // оставляем оригинал при ошибке перевода
      }
    }

    const result = await addUrlContentToThread({
      threadId: thread.id,
      url,
      title: pageTitle,
      originalText: finalText,
      language: lang,
    });

    if (!result.created && result.reason === "duplicate") {
      return NextResponse.json(
        { ok: false, reason: "duplicate", message: "Контент с этой ссылки уже в пространстве" },
        { status: 409 }
      );
    }

    return NextResponse.json(
      {
        ok: true,
        item: result.item,
      },
      { status: 201 }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Не удалось загрузить страницу";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
