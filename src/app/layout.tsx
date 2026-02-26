import type { Metadata } from "next";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import { getCurrentUser } from "@/lib/auth";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "my spaces",
  description: "Личный интеллект-помощник с пространствами и памятью",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const user = await getCurrentUser();

  return (
    <html lang="ru">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-ivory text-ocean`}
      >
        <div className="min-h-screen">
          <header className="border-b border-ocean/10 bg-white shadow-[0_2px_16px_var(--shadow-card)]">
            <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
              <Link href="/threads" className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-[16px] bg-mint text-xs font-semibold text-ocean shadow-[0_4px_12px_var(--shadow-mint)]">
                  ms
                </span>
                <span className="text-sm font-semibold text-ocean">
                  my spaces
                </span>
              </Link>
              <div className="flex items-center gap-3">
                {user ? (
                  <>
                    <Link
                      href="/profile"
                      className="flex items-center gap-2 rounded-[16px] border-2 border-ocean bg-transparent px-3 py-2 text-sm font-medium text-ocean transition hover:bg-ocean/5"
                    >
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-ocean/15 text-xs font-medium text-ocean">
                        {user.name.slice(0, 1).toUpperCase()}
                      </span>
                      <span>{user.name}</span>
                    </Link>
                    <form action="/api/auth/logout" method="post">
                      <button type="submit" className="rounded-[16px] px-3 py-1.5 text-sm font-medium text-ocean/80 transition hover:bg-ocean/10 hover:text-ocean">
                        Выйти
                      </button>
                    </form>
                  </>
                ) : (
                  <>
                    <Link href="/login" className="rounded-[16px] px-3 py-1.5 text-sm font-medium text-ocean/80 transition hover:bg-ocean/10 hover:text-ocean">
                      Войти
                    </Link>
                    <Link href="/register" className="rounded-[16px] bg-mint px-4 py-2 text-sm font-medium text-white shadow-[0_4px_12px_var(--shadow-mint)] transition hover:bg-mint-hover active:bg-mint-active">
                      Регистрация
                    </Link>
                  </>
                )}
              </div>
            </div>
          </header>
          <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
        </div>
      </body>
    </html>
  );
}
