import { prisma } from "@/lib/prisma";

/** Найти или создать пользователя по deviceId (один пользователь на устройство). */
export async function getOrCreateUserByDeviceId(deviceId: string) {
  let user = await prisma.user.findUnique({ where: { deviceId } });
  if (!user) {
    user = await prisma.user.create({
      data: { deviceId, name: "Гость" },
    });
  }
  return user;
}
