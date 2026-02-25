import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

const STATUS_MAP = {
  active: "ACTIVE",
  archived: "ARCHIVED",
  deleted: "DELETED",
} as const;

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const statusParam = searchParams.get("status") ?? "active";
  const status = STATUS_MAP[statusParam as keyof typeof STATUS_MAP] ?? "ACTIVE";
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
  const limit = Math.min(50, Math.max(1, parseInt(searchParams.get("limit") ?? "5", 10)));
  const skip = (page - 1) * limit;

  const [threads, total] = await Promise.all([
    prisma.thread.findMany({
      where: { userId: user.id, status },
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
      skip,
      take: limit,
    }),
    prisma.thread.count({ where: { userId: user.id, status } }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / limit));

  return NextResponse.json(
    {
      threads: threads.map((t) => ({
        id: t.id,
        title: t.title,
        status: t.status,
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
      })),
      total,
      page,
      totalPages,
    },
    { status: 200 },
  );
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body.title !== "string") {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const title = body.title.trim();
  if (!title) {
    return NextResponse.json({ error: "Title is required" }, { status: 400 });
  }

  const thread = await prisma.thread.create({
    data: {
      userId: user.id,
      title,
    },
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
    { status: 201 },
  );
}

