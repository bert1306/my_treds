import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

const STATUS_VALUES = new Set(["ACTIVE", "ARCHIVED", "DELETED"]);

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: RouteParams) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const thread = await prisma.thread.findFirst({
    where: { id, userId: user.id },
  });
  if (!thread) {
    return NextResponse.json({ error: "Thread not found" }, { status: 404 });
  }
  return NextResponse.json({
    thread: {
      id: thread.id,
      title: thread.title,
      status: thread.status,
      createdAt: thread.createdAt,
      updatedAt: thread.updatedAt,
    },
  });
}

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const body = await req.json().catch(() => null);

  if (!body || (typeof body.title !== "string" && typeof body.status !== "string")) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const data: Record<string, unknown> = {};

  if (typeof body.title === "string") {
    const title = body.title.trim();
    if (!title) {
      return NextResponse.json({ error: "Title cannot be empty" }, { status: 400 });
    }
    data.title = title;
  }

  if (typeof body.status === "string") {
    const upper = body.status.toUpperCase();
    if (!STATUS_VALUES.has(upper)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }
    data.status = upper;
  }

  const existing = await prisma.thread.findFirst({
    where: { id, userId: user.id },
  });
  if (!existing) {
    return NextResponse.json({ error: "Thread not found" }, { status: 404 });
  }

  if (data.status === "DELETED") {
    await prisma.threadMessage.deleteMany({ where: { threadId: id } });
    await prisma.contentItem.deleteMany({ where: { threadId: id } });
    await prisma.thread.delete({ where: { id } });
    return NextResponse.json(
      { thread: { id: existing.id, title: existing.title, status: "DELETED", createdAt: existing.createdAt, updatedAt: existing.updatedAt } },
      { status: 200 },
    );
  }

  const thread = await prisma.thread.update({
    where: { id },
    data,
  });

  return NextResponse.json(
    {
      thread: {
        id: thread.id,
        title: thread.title,
        status: thread.status,
        createdAt: thread.createdAt,
        updatedAt: thread.updatedAt,
      },
    },
    { status: 200 },
  );
}

