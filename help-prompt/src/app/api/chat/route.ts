import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrCreateUserByDeviceId } from "@/lib/user";
import { getSessionIfOwned } from "@/lib/session";

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
      data: { sessionId, role: "USER", content: text },
    });

    const reply = `Вы написали: «${text}». Это заглушка — позже здесь будет ответ ИИ.`;
    await prisma.message.create({
      data: { sessionId, role: "ASSISTANT", content: reply },
    });

    return NextResponse.json({ reply, sessionId });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
