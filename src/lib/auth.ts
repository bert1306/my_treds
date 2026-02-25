import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";
import { addDays, addHours } from "date-fns";
import { prisma } from "./prisma";

const SESSION_COOKIE_NAME = "mt_session";
const SESSION_DEFAULT_DAYS = 1;
const SESSION_REMEMBER_DAYS = 30;
const PASSWORD_RESET_TOKEN_HOURS = 2;

export type CreateUserInput = {
  email: string;
  name: string;
  password: string;
  language?: string;
  style?: "STRICT" | "CASUAL";
  timezone?: string;
};

export async function createUser(input: CreateUserInput) {
  const passwordHash = await bcrypt.hash(input.password, 10);

  return prisma.user.create({
    data: {
      email: input.email.toLowerCase(),
      name: input.name,
      passwordHash,
      language: input.language,
      style: input.style,
      timezone: input.timezone,
    },
  });
}

export async function authenticateUser(email: string, password: string) {
  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
  });

  if (!user) return null;

  const isValid = await bcrypt.compare(password, user.passwordHash);
  if (!isValid) return null;

  return user;
}

function generateSessionToken() {
  return randomBytes(32).toString("hex");
}

export async function createSession(options: {
  userId: string;
  rememberDevice: boolean;
  userAgent?: string;
  deviceName?: string;
}) {
  const token = generateSessionToken();
  const now = new Date();
  const expiresAt = addDays(
    now,
    options.rememberDevice ? SESSION_REMEMBER_DAYS : SESSION_DEFAULT_DAYS,
  );

  const device =
    options.rememberDevice
      ? await prisma.device.create({
          data: {
            userId: options.userId,
            name: options.deviceName,
            userAgent: options.userAgent,
          },
        })
      : null;

  const session = await prisma.session.create({
    data: {
      userId: options.userId,
      sessionToken: token,
      persistent: options.rememberDevice,
      expiresAt,
      deviceId: device?.id,
    },
  });

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    expires: expiresAt,
  });

  return session;
}

export async function getCurrentUser() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;

  const session = await prisma.session.findUnique({
    where: { sessionToken: token },
    include: { user: true },
  });

  if (!session) return null;
  if (session.expiresAt < new Date()) {
    await prisma.session.delete({ where: { id: session.id } });
    cookieStore.delete(SESSION_COOKIE_NAME);
    return null;
  }

  await prisma.session.update({
    where: { id: session.id },
    data: { lastActiveAt: new Date() },
  });

  return session.user;
}

export async function destroySession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return;

  await prisma.session.deleteMany({
    where: { sessionToken: token },
  });

  cookieStore.delete(SESSION_COOKIE_NAME);
}

export async function createPasswordResetToken(email: string) {
  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
  });
  if (!user) {
    return null;
  }

  const token = randomBytes(32).toString("hex");
  const expiresAt = addHours(new Date(), PASSWORD_RESET_TOKEN_HOURS);

  const resetToken = await prisma.passwordResetToken.create({
    data: {
      userId: user.id,
      token,
      expiresAt,
    },
  });

  return {
    user,
    token: resetToken.token,
    expiresAt: resetToken.expiresAt,
  };
}

export async function consumePasswordResetToken(token: string, newPassword: string) {
  const dbToken = await prisma.passwordResetToken.findUnique({
    where: { token },
    include: { user: true },
  });

  if (!dbToken || dbToken.usedAt || dbToken.expiresAt < new Date()) {
    return null;
  }

  const passwordHash = await bcrypt.hash(newPassword, 10);

  await prisma.$transaction([
    prisma.user.update({
      where: { id: dbToken.userId },
      data: { passwordHash },
    }),
    prisma.passwordResetToken.update({
      where: { id: dbToken.id },
      data: { usedAt: new Date() },
    }),
  ]);

  return dbToken.user;
}

