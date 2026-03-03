import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body.message !== "string") {
      return NextResponse.json({ error: "message required" }, { status: 400 });
    }
    const text = body.message.trim();
    if (!text) return NextResponse.json({ error: "message empty" }, { status: 400 });

    let sessionId = body.sessionId as string | undefined;
    if (!sessionId) {
      const user = await prisma.user.findFirst();
      let userId: string;
      if (user) {
        userId = user.id;
      } else {
        const u = await prisma.user.create({ data: { name: "Guest" } });
        userId = u.id;
      }
      const session = await prisma.session.create({
        data: { userId, channel: "web" },
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
