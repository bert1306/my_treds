import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";

export default async function ProfilePage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  return (
    <div className="max-w-md space-y-6">
      <div className="flex items-center gap-4">
        <Link
          href="/threads"
          className="rounded-[16px] border-2 border-ocean bg-transparent px-4 py-2 text-sm font-medium text-ocean transition hover:bg-ocean/5"
        >
          ← К пространствам
        </Link>
        <h1 className="text-[28px] font-semibold text-ocean">Профиль</h1>
      </div>
      <div className="rounded-[20px] bg-white p-6 shadow-[0_2px_16px_var(--shadow-card)]">
        <div className="mb-6 flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-mint/30 text-lg font-medium text-ocean">
            {user.name.slice(0, 1).toUpperCase()}
          </span>
          <div>
            <p className="font-medium text-ocean">{user.name}</p>
            <p className="text-sm text-ocean/70">{user.email}</p>
          </div>
        </div>
        <dl className="space-y-3 text-sm">
          <div>
            <dt className="text-ocean/70">Часовой пояс</dt>
            <dd className="font-medium text-ocean">{user.timezone}</dd>
          </div>
          <div>
            <dt className="text-ocean/70">Язык</dt>
            <dd className="font-medium text-ocean">{user.language === "ru" ? "Русский" : user.language}</dd>
          </div>
        </dl>
      </div>
    </div>
  );
}
