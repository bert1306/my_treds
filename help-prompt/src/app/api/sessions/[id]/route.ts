import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionIfOwned } from "@/lib/session";

/** PATCH /api/sessions/[id] — переименовать или избранное. Body: { deviceId, title?, isFavorite? }. 404/403 если не владелец. */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json().catch(() => null);
    if (!body || (typeof body.title !== "string" && typeof body.isFavorite !== "boolean")) {
      return NextResponse.json({ error: "title or isFavorite required" }, { status: 400 });
    }
    const deviceId = (body.deviceId as string)?.trim() || null;
    const owned = await getSessionIfOwned(id, deviceId);
    if (owned.status === "not_found") {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }
    if (owned.status === "forbidden") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const data: { title?: string | null; isFavorite?: boolean } = {};
    if (typeof body.title === "string") data.title = body.title.trim() || null;
    if (typeof body.isFavorite === "boolean") data.isFavorite = body.isFavorite;
    if (Object.keys(data).length === 0) {
      return NextResponse.json({ ok: true });
    }
    await prisma.session.update({ where: { id }, data });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

/** DELETE /api/sessions/[id]?deviceId=xxx — удалить диалог. 404/403 если не владелец. */
export async function DELETE(
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
    await prisma.session.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
