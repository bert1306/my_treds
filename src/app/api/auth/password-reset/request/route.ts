import { NextRequest, NextResponse } from "next/server";
import { createPasswordResetToken } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);

  if (!body || typeof body.email !== "string") {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const email = body.email.trim();
  if (!email) {
    return NextResponse.json({ error: "Email is required" }, { status: 400 });
  }

  const result = await createPasswordResetToken(email);

  // В проде мы не раскрываем, существует ли email, и не возвращаем токен.
  // Здесь для локальной разработки можно вернуть токен, чтобы протестировать поток.
  if (!result) {
    return NextResponse.json({ ok: true }, { status: 200 });
  }

  const resetUrlBase =
    process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const resetUrl = `${resetUrlBase}/reset-password?token=${encodeURIComponent(
    result.token,
  )}`;

  // TODO: интегрировать реальную отправку email.
  // Сейчас просто возвращаем ссылку в ответе для разработки.

  return NextResponse.json(
    {
      ok: true,
      resetUrl,
    },
    { status: 200 },
  );
}

