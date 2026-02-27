import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

type RouteParams = { params: Promise<{ id: string }> };

/** PATCH: отметить напоминание выполненным (status = DONE) или отменить (CANCELLED) */
export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const status = body?.status === "CANCELLED" ? "CANCELLED" : "DONE";

  const reminder = await prisma.reminder.findFirst({
    where: { id, userId: user.id },
  });
  if (!reminder) {
    return NextResponse.json({ error: "Reminder not found" }, { status: 404 });
  }

  await prisma.reminder.update({
    where: { id },
    data: { status },
  });

  return NextResponse.json({ ok: true, status });
}
