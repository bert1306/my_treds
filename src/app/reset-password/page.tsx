"use client";

import { FormEvent, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function ResetPasswordPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialToken = searchParams.get("token") ?? "";

  const [step, setStep] = useState<"request" | "confirm">(initialToken ? "confirm" : "request");
  const [email, setEmail] = useState("");
  const [token, setToken] = useState(initialToken);
  const [newPassword, setNewPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    setIsSubmitting(true);

    try {
      const res = await fetch("/api/auth/password-reset/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Не удалось отправить ссылку для восстановления");
        setIsSubmitting(false);
        return;
      }

      if (typeof data.resetUrl === "string") {
        setMessage(
          "Для локальной разработки ссылка на сброс пароля сгенерирована ниже. В проде она будет приходить по email.",
        );
        setToken(new URL(data.resetUrl).searchParams.get("token") ?? "");
        setStep("confirm");
      } else {
        setMessage("Если такой email существует, мы отправили на него письмо с дальнейшими инструкциями.");
      }

      setIsSubmitting(false);
    } catch {
      setError("Произошла ошибка. Попробуйте еще раз.");
      setIsSubmitting(false);
    }
  }

  async function handleConfirm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    setIsSubmitting(true);

    try {
      const res = await fetch("/api/auth/password-reset/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, newPassword }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Не удалось изменить пароль");
        setIsSubmitting(false);
        return;
      }

      setMessage("Пароль успешно изменен. Теперь можно войти.");
      setIsSubmitting(false);
      router.push("/login");
    } catch {
      setError("Произошла ошибка. Попробуйте еще раз.");
      setIsSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-md rounded-2xl border border-zinc-200 bg-white/80 p-8 shadow-sm">
      <h1 className="text-xl font-semibold text-zinc-900">
        Восстановление пароля
      </h1>
      {step === "request" ? (
        <>
          <p className="mt-2 text-sm text-zinc-600">
            Укажите email, на который отправить ссылку для восстановления доступа.
          </p>
          <form onSubmit={handleRequest} className="mt-6 space-y-4">
            <div className="space-y-1.5">
              <label
                htmlFor="email"
                className="text-sm font-medium text-zinc-800"
              >
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/10"
              />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            {message && <p className="text-sm text-zinc-700">{message}</p>}
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex w-full items-center justify-center rounded-full bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
            >
              {isSubmitting ? "Отправляем ссылку..." : "Отправить ссылку"}
            </button>
          </form>
        </>
      ) : (
        <>
          <p className="mt-2 text-sm text-zinc-600">
            Введите новый пароль. Если вы пришли по ссылке из письма, токен уже
            подставлен автоматически.
          </p>
          <form onSubmit={handleConfirm} className="mt-6 space-y-4">
            <div className="space-y-1.5">
              <label
                htmlFor="token"
                className="text-sm font-medium text-zinc-800"
              >
                Токен
              </label>
              <input
                id="token"
                name="token"
                type="text"
                required
                value={token}
                onChange={(e) => setToken(e.target.value)}
                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/10"
              />
            </div>
            <div className="space-y-1.5">
              <label
                htmlFor="newPassword"
                className="text-sm font-medium text-zinc-800"
              >
                Новый пароль
              </label>
              <input
                id="newPassword"
                name="newPassword"
                type="password"
                required
                minLength={8}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/10"
              />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            {message && <p className="text-sm text-zinc-700">{message}</p>}
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex w-full items-center justify-center rounded-full bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
            >
              {isSubmitting ? "Сохраняем пароль..." : "Сохранить новый пароль"}
            </button>
          </form>
        </>
      )}
    </div>
  );
}

