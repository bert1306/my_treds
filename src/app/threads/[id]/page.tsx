import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { ThreadDetailShell } from "./thread-detail-shell";
import { prisma } from "@/lib/prisma";

type PageProps = { params: Promise<{ id: string }> };

export default async function ThreadDetailPage({ params }: PageProps) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { id } = await params;
  const thread = await prisma.thread.findFirst({
    where: { id, userId: user.id },
  });
  if (!thread) redirect("/threads");

  return (
    <div className="min-h-[calc(100vh-8rem)]">
      <ThreadDetailShell threadId={thread.id} />
    </div>
  );
}
