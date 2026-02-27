import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

/** GET: список напоминаний пользователя, у которых dueAt <= сейчас и status = PENDING */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const list = await prisma.reminder.findMany({
    where: {
      userId: user.id,
      status: "PENDING",
      dueAt: { lte: now },
    },
    orderBy: { dueAt: "asc" },
    take: 50,
  });

  return NextResponse.json({
    reminders: list.map((r) => ({
      id: r.id,
      content: r.content,
      dueAt: r.dueAt.toISOString(),
      threadId: r.threadId,
    })),
  });
}
