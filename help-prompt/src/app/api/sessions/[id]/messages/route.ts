import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionIfOwned } from "@/lib/session";

/** GET /api/sessions/[id]/messages?deviceId=xxx — сообщения диалога. 404 если сессия не найдена, 403 если не владелец. */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const deviceId = req.nextUrl.searchParams.get("deviceId");
    const owned = await getSessionIfOwned(id, deviceId);
    if (owned.status === "not_found") {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }
    if (owned.status === "forbidden") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const messages = await prisma.message.findMany({
      where: { sessionId: id },
      orderBy: { createdAt: "asc" },
      select: { id: true, role: true, content: true, createdAt: true },
    });
    const list = messages.map((m) => ({
      id: m.id,
      role: m.role.toLowerCase() as "user" | "assistant",
      content: m.content,
      createdAt: m.createdAt.toISOString(),
    }));
    return NextResponse.json({ messages: list });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
