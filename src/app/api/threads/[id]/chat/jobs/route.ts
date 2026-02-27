import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getRunningCountForThread } from "@/lib/chat-jobs";
import { prisma } from "@/lib/prisma";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: RouteParams) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: threadId } = await params;
  const thread = await prisma.thread.findFirst({
    where: { id: threadId, userId: user.id, status: { not: "DELETED" } },
  });
  if (!thread) {
    return NextResponse.json({ error: "Thread not found" }, { status: 404 });
  }

  const running = getRunningCountForThread(threadId, user.id);
  return NextResponse.json({ running });
}
