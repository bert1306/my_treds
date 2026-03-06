import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrCreateUserByDeviceId } from "@/lib/user";
import { getSessionIfOwned } from "@/lib/session";
import { generatePromptForSession } from "@/lib/prompt-service";
import { chatWithOllama, type OllamaMessage } from "@/lib/ollama";

const MAX_HISTORY_MESSAGES = 24;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body.message !== "string") {
      return NextResponse.json({ error: "message required" }, { status: 400 });
    }
    const text = body.message.trim();
    if (!text) return NextResponse.json({ error: "message empty" }, { status: 400 });

    const deviceId = (body.deviceId as string)?.trim() || null;
    let sessionId = body.sessionId as string | undefined;
    if (sessionId) {
      const owned = await getSessionIfOwned(sessionId, deviceId);
      if (owned.status === "not_found") {
        return NextResponse.json({ error: "Session not found" }, { status: 404 });
      }
      if (owned.status === "forbidden") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      if (owned.session.deviceId === null && deviceId) {
        await prisma.session.update({
          where: { id: sessionId },
          data: { deviceId },
        });
      }
    } else {
      const user = await getOrCreateUserByDeviceId(deviceId ?? "");
      const title = text.length > 60 ? `${text.slice(0, 57)}...` : text;
      const session = await prisma.session.create({
        data: { userId: user.id, channel: "web", deviceId, title },
      });
      sessionId = session.id;
    }

    await prisma.message.create({
      data: { sessionId, role: "user", content: text },
    });

    const ollamaMessages: OllamaMessage[] = [];

    if (sessionId) {
      try {
        const systemPrompt = await generatePromptForSession(sessionId);
        if (systemPrompt.trim()) {
          ollamaMessages.push({ role: "system", content: systemPrompt });
        }
      } catch {
        // Нет CollectedData или ошибка — продолжаем без системного промпта
      }
    }

    const history = await prisma.message.findMany({
      where: { sessionId },
      orderBy: { createdAt: "asc" },
      select: { role: true, content: true },
      take: MAX_HISTORY_MESSAGES + 1,
    });
    const lastN = history.slice(-MAX_HISTORY_MESSAGES);
    for (const m of lastN) {
      const role = m.role.toLowerCase() as "user" | "assistant";
      if (role === "user" || role === "assistant") {
        ollamaMessages.push({ role, content: m.content });
      }
    }

    const result = await chatWithOllama(ollamaMessages);
    const replyText = result.ok ? result.content : `[Ошибка] ${result.message}`;

    await prisma.message.create({
      data: { sessionId, role: "assistant", content: replyText },
    });

    return NextResponse.json({
      reply: replyText,
      sessionId,
      ...(result.ok ? {} : { error: result.message }),
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
