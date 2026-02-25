import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function isValidTimezone(tz: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export async function GET() {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ user: null }, { status: 200 });
  }

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

export async function PATCH(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body.timezone !== "string") {
    return NextResponse.json(
      { error: "Invalid payload: timezone (string) required" },
      { status: 400 },
    );
  }

  const timezone = body.timezone.trim();
  if (!timezone) {
    return NextResponse.json(
      { error: "Timezone cannot be empty" },
      { status: 400 },
    );
  }
  if (!isValidTimezone(timezone)) {
    return NextResponse.json(
      { error: "Invalid timezone (use IANA, e.g. Europe/Moscow)" },
      { status: 400 },
    );
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { timezone },
  });

  return NextResponse.json(
    { ok: true, timezone },
    { status: 200 },
  );
}

