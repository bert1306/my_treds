import { NextRequest, NextResponse } from "next/server";
import { createUser, authenticateUser, createSession } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);

  if (!body || typeof body.email !== "string" || typeof body.name !== "string" || typeof body.password !== "string") {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const email = body.email.trim();
  const name = body.name.trim();
  const password = body.password;
  const rememberDevice = Boolean(body.rememberDevice);
  const language = typeof body.language === "string" ? body.language : undefined;
  const style = body.style === "STRICT" || body.style === "CASUAL" ? body.style : undefined;
  const timezone = typeof body.timezone === "string" ? body.timezone : undefined;

  if (!email || !name || !password) {
    return NextResponse.json({ error: "Email, name and password are required" }, { status: 400 });
  }

  try {
    const existing = await authenticateUser(email, password);
    if (existing) {
      return NextResponse.json({ error: "User with this email already exists" }, { status: 409 });
    }
  } catch {
    // ignore, we'll handle unique constraint below
  }

  try {
    const user = await createUser({
      email,
      name,
      password,
      language,
      style,
      timezone,
    });

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
      { status: 201 },
    );
  } catch (error) {
    return NextResponse.json({ error: "Unable to register user" }, { status: 500 });
  }
}

