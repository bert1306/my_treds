import { NextRequest, NextResponse } from "next/server";
import { authenticateUser, createSession } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);

  if (!body || typeof body.email !== "string" || typeof body.password !== "string") {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const email = body.email.trim();
  const password = body.password;
  const rememberDevice = Boolean(body.rememberDevice);

  if (!email || !password) {
    return NextResponse.json({ error: "Email and password are required" }, { status: 400 });
  }

  const user = await authenticateUser(email, password);
  if (!user) {
    return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
  }

  await createSession({
    userId: user.id,
    rememberDevice,
    userAgent: req.headers.get("user-agent") ?? undefined,
    deviceName: body.deviceName,
  });

  return NextResponse.json(
    {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        language: user.language,
        style: user.style,
        timezone: user.timezone,
      },
    },
    { status: 200 },
  );
}

