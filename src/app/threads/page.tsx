import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { ThreadsHomeShell } from "./threads-home-shell";

export default async function ThreadsPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  return (
    <div className="min-h-[calc(100vh-8rem)]">
      <div className="mb-8">
        <h1 className="text-[28px] font-semibold leading-tight text-ocean">
          Треды
        </h1>
        <p className="mt-1 text-base text-ocean/70">
          Ваши подборки и диалог с помощником
        </p>
      </div>
      <ThreadsHomeShell />
    </div>
  );
}

