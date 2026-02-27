import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getJob, getRunningCountForThread } from "@/lib/chat-jobs";

type RouteParams = { params: Promise<{ id: string; jobId: string }> };

export async function GET(_req: Request, { params }: RouteParams) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: threadId, jobId } = await params;
  const job = getJob(jobId);
  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }
  if (job.threadId !== threadId || job.userId !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const runningCount = getRunningCountForThread(threadId, user.id);

  return NextResponse.json({
    jobId: job.jobId,
    status: job.status,
    reply: job.reply,
    error: job.error,
    sources: job.sources,
    runningCount,
  });
}
