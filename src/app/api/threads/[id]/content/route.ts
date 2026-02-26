import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { addTextContentToThread } from "@/lib/content";

type RouteParams = {
  params: Promise<{ id: string }>;
};

const DEFAULT_LIMIT = 5;
const MAX_LIMIT = 100;

export async function GET(req: NextRequest, { params }: RouteParams) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const thread = await prisma.thread.findFirst({
    where: {
      id,
      userId: user.id,
    },
  });

  if (!thread) {
    return NextResponse.json({ error: "Thread not found" }, { status: 404 });
  }

  const { searchParams } = new URL(req.url);
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10) || 1);
  const limit = Math.min(MAX_LIMIT, Math.max(1, parseInt(searchParams.get("limit") ?? String(DEFAULT_LIMIT), 10) || DEFAULT_LIMIT));
  const skip = (page - 1) * limit;

  const [total, items] = await Promise.all([
    prisma.contentItem.count({ where: { threadId: thread.id } }),
    prisma.contentItem.findMany({
      where: { threadId: thread.id },
      orderBy: { createdAt: "desc" },
      take: limit,
      skip,
    }),
  ]);

  return NextResponse.json(
    {
      items: items.map((i) => ({
        id: i.id,
        title: i.title,
        source: i.source,
        language: i.language,
        createdAt: i.createdAt,
        originalText: i.originalText,
      })),
      total,
      page,
      limit,
    },
    { status: 200 },
  );
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);

  if (!body || typeof body.text !== "string") {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const text = body.text.trim();
  const title = typeof body.title === "string" ? body.title.trim() || undefined : undefined;

  if (!text) {
    return NextResponse.json({ error: "Content is empty" }, { status: 400 });
  }

  const { id } = await params;

  const thread = await prisma.thread.findFirst({
    where: {
      id,
      userId: user.id,
      status: {
        not: "DELETED",
      },
    },
  });

  if (!thread) {
    return NextResponse.json({ error: "Thread not found" }, { status: 404 });
  }

  const result = await addTextContentToThread({
    threadId: thread.id,
    text,
    language: user.language,
    title,
  });

  if (!result.created && result.reason === "duplicate") {
    return NextResponse.json(
      {
        ok: false,
        reason: "duplicate",
        message: "Этот фрагмент уже есть в пространстве",
      },
      { status: 409 },
    );
  }

  return NextResponse.json(
    {
      ok: true,
      item: {
        id: result.item.id,
        title: result.item.title,
        source: result.item.source,
        language: result.item.language,
        createdAt: result.item.createdAt,
        originalText: result.item.originalText,
      },
    },
    { status: 201 },
  );
}

