"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { ROLE_OPTIONS } from "@/lib/wizard";

const DEVICE_ID_KEY = "help-prompt-device-id";

function getDeviceId(): string {
  if (typeof window === "undefined") return "";
  let id = localStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    id = crypto.randomUUID?.() ?? `dev-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    localStorage.setItem(DEVICE_ID_KEY, id);
  }
  return id;
}

type Profile = {
  name: string;
  email: string;
  login: string;
  telegram: string;
  role: string;
};

export default function ProfilePage() {
  const [profile, setProfile] = useState<Profile>({
    name: "",
    email: "",
    login: "",
    telegram: "",
    role: "",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const deviceId = getDeviceId();
    if (!deviceId) {
      setLoading(false);
      return;
    }
    fetch(`/api/profile?deviceId=${encodeURIComponent(deviceId)}`)
      .then((res) => res.json())
      .then((data: Profile) => {
        setProfile({
          name: data.name ?? "",
          email: data.email ?? "",
          login: data.login ?? "",
          telegram: data.telegram ?? "",
          role: data.role ?? "",
        });
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const deviceId = getDeviceId();
    if (!deviceId) return;
    setSaving(true);
    setSaved(false);
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deviceId,
          name: profile.name.trim(),
          email: profile.email.trim(),
          login: profile.login.trim(),
          telegram: profile.telegram.trim(),
          role: profile.role.trim(),
        }),
      });
      const data = (await res.json()) as Profile;
      if (data) {
        setProfile({
          name: data.name ?? "",
          email: data.email ?? "",
          login: data.login ?? "",
          telegram: data.telegram ?? "",
          role: data.role ?? "",
        });
        setSaved(true);
      }
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--color-bg)] flex items-center justify-center">
        <p className="text-[var(--color-text-muted)]">Загрузка…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--color-bg)]">
      <header className="sticky top-0 z-10 bg-[var(--color-surface)] border-b border-[rgba(42,91,111,0.1)] px-4 py-3 flex items-center gap-4">
        <Link
          href="/"
          className="text-[var(--color-secondary)] hover:opacity-80 font-semibold"
        >
          ← Назад
        </Link>
        <h1 className="text-lg font-semibold text-[var(--color-secondary)]">
          Профиль
        </h1>
      </header>

      <main className="max-w-md mx-auto px-4 py-8">
        <p className="text-sm text-[var(--color-text-muted)] mb-6">
          Имя используется в диалогах для обращения. Роль из профиля подставляется в мастере (шаг «роль» можно не проходить). Остальные поля — заготовки под будущий вход.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-[var(--color-secondary)] mb-1">
              Имя
            </label>
            <input
              type="text"
              value={profile.name}
              onChange={(e) => setProfile((p) => ({ ...p, name: e.target.value }))}
              placeholder="Как к вам обращаться"
              className="w-full rounded-xl border-2 border-[var(--color-input-border)] bg-[var(--color-bg)] px-4 py-3 text-[var(--color-secondary)] placeholder:opacity-50 focus:border-[var(--color-primary)] outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-[var(--color-secondary)] mb-1">
              Логин
            </label>
            <input
              type="text"
              value={profile.login}
              onChange={(e) => setProfile((p) => ({ ...p, login: e.target.value }))}
              placeholder="Заготовка под логин"
              className="w-full rounded-xl border-2 border-[var(--color-input-border)] bg-[var(--color-bg)] px-4 py-3 text-[var(--color-secondary)] placeholder:opacity-50 focus:border-[var(--color-primary)] outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-[var(--color-secondary)] mb-1">
              Пароль
            </label>
            <input
              type="password"
              placeholder="Пока не используется"
              disabled
              className="w-full rounded-xl border-2 border-[var(--color-input-border)] bg-[var(--color-bg)] px-4 py-3 text-[var(--color-text-muted)] placeholder:opacity-50 opacity-70"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-[var(--color-secondary)] mb-1">
              Почта
            </label>
            <input
              type="email"
              value={profile.email}
              onChange={(e) => setProfile((p) => ({ ...p, email: e.target.value }))}
              placeholder="email@example.com"
              className="w-full rounded-xl border-2 border-[var(--color-input-border)] bg-[var(--color-bg)] px-4 py-3 text-[var(--color-secondary)] placeholder:opacity-50 focus:border-[var(--color-primary)] outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-[var(--color-secondary)] mb-1">
              Telegram
            </label>
            <input
              type="text"
              value={profile.telegram}
              onChange={(e) => setProfile((p) => ({ ...p, telegram: e.target.value }))}
              placeholder="@username"
              className="w-full rounded-xl border-2 border-[var(--color-input-border)] bg-[var(--color-bg)] px-4 py-3 text-[var(--color-secondary)] placeholder:opacity-50 focus:border-[var(--color-primary)] outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-[var(--color-secondary)] mb-1">
              Роль
            </label>
            <select
              value={profile.role}
              onChange={(e) => setProfile((p) => ({ ...p, role: e.target.value }))}
              className="w-full rounded-xl border-2 border-[var(--color-input-border)] bg-[var(--color-bg)] px-4 py-3 text-[var(--color-secondary)] focus:border-[var(--color-primary)] outline-none"
            >
              <option value="">Не выбрано</option>
              {ROLE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <p className="text-xs text-[var(--color-text-muted)] mt-1">
              Если задана — в мастере шаг «роль» не показывается
            </p>
          </div>

          <div className="flex items-center gap-3 pt-4">
            <button
              type="submit"
              disabled={saving}
              className="rounded-xl px-5 py-2.5 text-sm font-medium bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary-hover)] disabled:opacity-60"
            >
              {saving ? "Сохранение…" : "Сохранить"}
            </button>
            {saved && (
              <span className="text-sm text-[var(--color-primary)]">Сохранено</span>
            )}
          </div>
        </form>
      </main>
    </div>
  );
}
