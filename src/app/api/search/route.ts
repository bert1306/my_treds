import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const query = (searchParams.get("q") ?? "").trim();
  const threadId = searchParams.get("threadId") ?? undefined;

  if (!query) {
    return NextResponse.json({ results: [] }, { status: 200 });
  }

  const whereBase = {
    thread: {
      userId: user.id,
      status: { not: "DELETED" },
    },
    originalText: {
      contains: query,
    },
  };

  const where =
    threadId != null
      ? {
          ...whereBase,
          threadId,
        }
      : whereBase;

  const items = await prisma.contentItem.findMany({
    where,
    include: {
      thread: true,
    },
    orderBy: {
      createdAt: "desc",
    },
    take: 30,
  });

  return NextResponse.json(
    {
      results: items.map((i) => ({
        id: i.id,
        threadId: i.threadId,
        threadTitle: i.thread.title,
        title: i.title,
        snippet: i.originalText.slice(0, 240),
        createdAt: i.createdAt,
      })),
    },
    { status: 200 },
  );
}

