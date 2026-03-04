import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

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
