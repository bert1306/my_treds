import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";

export default async function Home() {
  const user = await getCurrentUser();

  if (user) {
    redirect("/threads");
  }

  return (
    <div className="grid gap-8 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
      <div className="rounded-2xl border border-zinc-200 bg-white/80 p-8 shadow-sm">
        <h1 className="text-2xl font-semibold text-zinc-900">
          my treds — спокойное место для твоих тредов и мыслей
        </h1>
        <p className="mt-3 text-sm text-zinc-600">
          Сохраняй информацию, структурируй ее в тредах и общайся с помощником,
          который подстраивается под твой стиль.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/register"
            className="inline-flex items-center justify-center rounded-full bg-zinc-900 px-4 py-2 text-sm font-medium text-white"
          >
            Создать аккаунт
          </Link>
          <Link
            href="/login"
            className="inline-flex items-center justify-center rounded-full border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
          >
            Войти
          </Link>
        </div>
      </div>
      <div className="rounded-2xl border border-zinc-200 bg-white/80 p-6 shadow-sm text-sm text-zinc-600">
        <p className="font-medium text-zinc-800">Что уже заложено:</p>
        <ul className="mt-3 space-y-1.5">
          <li>• Аутентификация по email, имени и паролю</li>
          <li>• Запоминание устройства при входе</li>
          <li>• Восстановление доступа по email</li>
          <li>• Задел под вход через Google/Apple и магические ссылки</li>
        </ul>
      </div>
    </div>
  );
}
