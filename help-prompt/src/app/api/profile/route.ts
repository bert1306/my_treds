import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrCreateUserByDeviceId } from "@/lib/user";

/** GET /api/profile?deviceId=xxx — профиль текущего пользователя (без пароля) */
export async function GET(req: NextRequest) {
  try {
    const deviceId = req.nextUrl.searchParams.get("deviceId");
    if (!deviceId) {
      return NextResponse.json({ error: "deviceId required" }, { status: 400 });
    }
    const user = await getOrCreateUserByDeviceId(deviceId);
    return NextResponse.json({
      name: user.name ?? "",
      email: user.email ?? "",
      login: user.login ?? "",
      telegram: user.telegram ?? "",
      role: user.role ?? "",
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

/** PATCH /api/profile — обновить профиль. Body: { deviceId, name?, email?, login?, telegram?, role? } */
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const deviceId = (body?.deviceId as string)?.trim() || null;
    if (!deviceId) {
      return NextResponse.json({ error: "deviceId required" }, { status: 400 });
    }
    const user = await getOrCreateUserByDeviceId(deviceId);
    const updates: { name?: string; email?: string; login?: string; telegram?: string; role?: string } = {};
    if (typeof body.name === "string") updates.name = body.name.trim() || null;
    if (typeof body.email === "string") updates.email = body.email.trim() || null;
    if (typeof body.login === "string") updates.login = body.login.trim() || null;
    if (typeof body.telegram === "string") updates.telegram = body.telegram.trim() || null;
    if (typeof body.role === "string") updates.role = body.role.trim() || null;
    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ name: user.name ?? "", email: user.email ?? "", login: user.login ?? "", telegram: user.telegram ?? "", role: user.role ?? "" });
    }
    const updated = await prisma.user.update({
      where: { id: user.id },
      data: updates,
    });
    return NextResponse.json({
      name: updated.name ?? "",
      email: updated.email ?? "",
      login: updated.login ?? "",
      telegram: updated.telegram ?? "",
      role: updated.role ?? "",
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
