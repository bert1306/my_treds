import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/** POST /api/sessions — создать пустую сессию (для мастера перед первым сообщением). Body: { deviceId } */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const deviceId = (body?.deviceId as string)?.trim() || null;
    if (!deviceId) {
      return NextResponse.json({ error: "deviceId required" }, { status: 400 });
    }
    let user = await prisma.user.findFirst();
    if (!user) {
      user = await prisma.user.create({ data: { name: "Guest" } });
    }
    const session = await prisma.session.create({
      data: { userId: user.id, channel: "web", deviceId, title: "Новый диалог" },
    });
    return NextResponse.json({ sessionId: session.id });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

/** GET /api/sessions?deviceId=xxx — список диалогов по deviceId, свежие сверху */
export async function GET(req: NextRequest) {
  try {
    const deviceId = req.nextUrl.searchParams.get("deviceId");
    if (!deviceId) {
      return NextResponse.json({ sessions: [] });
    }
    const sessions = await prisma.session.findMany({
      where: { deviceId },
      orderBy: [{ isFavorite: "desc" }, { createdAt: "desc" }],
      select: {
        id: true,
        title: true,
        isFavorite: true,
        createdAt: true,
      },
    });
    const list = sessions.map((s) => ({
      id: s.id,
      title: s.title ?? "Без названия",
      isFavorite: s.isFavorite,
      createdAt: s.createdAt.toISOString(),
    }));
    return NextResponse.json({ sessions: list });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
