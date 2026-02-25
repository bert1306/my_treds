import { NextRequest, NextResponse } from "next/server";
import { consumePasswordResetToken } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);

  if (!body || typeof body.token !== "string" || typeof body.newPassword !== "string") {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const token = body.token.trim();
  const newPassword = body.newPassword;

  if (!token || !newPassword) {
    return NextResponse.json({ error: "Token and new password are required" }, { status: 400 });
  }

  const user = await consumePasswordResetToken(token, newPassword);
  if (!user) {
    return NextResponse.json({ error: "Invalid or expired token" }, { status: 400 });
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}

