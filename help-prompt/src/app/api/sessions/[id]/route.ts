import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/** PATCH /api/sessions/[id] — переименовать или избранное */
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
    const data: { title?: string; isFavorite?: boolean } = {};
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

/** DELETE /api/sessions/[id] — удалить диалог */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await prisma.session.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
