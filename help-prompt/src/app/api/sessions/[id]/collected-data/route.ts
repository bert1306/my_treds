import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionIfOwned } from "@/lib/session";

const EDITABLE_KEYS = ["role", "detailLevel", "context"];

function collectedMapFromDb(rows: { key: string; value: string }[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const r of rows) map[r.key] = r.value;
  return map;
}

/** GET /api/sessions/[id]/collected-data?deviceId=xxx — текущие данные мастера (для отображения и редактирования). 404/403 если не владелец. */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: sessionId } = await params;
    const deviceId = req.nextUrl.searchParams.get("deviceId");
    const owned = await getSessionIfOwned(sessionId, deviceId);
    if (owned.status === "not_found") {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }
    if (owned.status === "forbidden") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const rows = await prisma.collectedData.findMany({
      where: { sessionId },
      select: { key: true, value: true },
    });
    const collected = collectedMapFromDb(rows);
    return NextResponse.json({ collected });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

/** PATCH /api/sessions/[id]/collected-data — обновить часть данных мастера (роль, детализация, контекст). Body: { deviceId, collected: { role?, detailLevel?, context? } }. */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: sessionId } = await params;
    const body = await req.json().catch(() => null);
    const deviceId = (body?.deviceId as string)?.trim() || null;
    const owned = await getSessionIfOwned(sessionId, deviceId);
    if (owned.status === "not_found") {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }
    if (owned.status === "forbidden") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const updates = body?.collected;
    if (!updates || typeof updates !== "object") {
      return NextResponse.json({ error: "collected object required" }, { status: 400 });
    }
    for (const key of Object.keys(updates)) {
      if (!EDITABLE_KEYS.includes(key)) continue;
      const value = typeof updates[key] === "string" ? updates[key].trim() : "";
      await prisma.collectedData.upsert({
        where: { sessionId_key: { sessionId, key } },
        create: { sessionId, key, value },
        update: { value },
      });
    }
    const rows = await prisma.collectedData.findMany({
      where: { sessionId },
      select: { key: true, value: true },
    });
    const collected = collectedMapFromDb(rows);
    return NextResponse.json({ collected });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
