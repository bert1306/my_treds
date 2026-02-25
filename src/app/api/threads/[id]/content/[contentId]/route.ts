import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

type RouteParams = { params: Promise<{ id: string; contentId: string }> };

export async function DELETE(_req: Request, { params }: RouteParams) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id, contentId } = await params;

  const thread = await prisma.thread.findFirst({
    where: { id, userId: user.id },
  });
  if (!thread) {
    return NextResponse.json({ error: "Thread not found" }, { status: 404 });
  }

  const item = await prisma.contentItem.findFirst({
    where: { id: contentId, threadId: thread.id },
  });
  if (!item) {
    return NextResponse.json({ error: "Content not found" }, { status: 404 });
  }

  await prisma.contentItem.delete({ where: { id: item.id } });

  return NextResponse.json({ ok: true }, { status: 200 });
}
