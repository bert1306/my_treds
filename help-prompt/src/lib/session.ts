import { prisma } from "@/lib/prisma";

/**
 * Проверяет, что сессия существует и принадлежит устройству (deviceId).
 * Возвращает сессию или null. Используется для 404 (сессия не найдена) и 403 (чужой диалог).
 */
export async function getSessionIfOwned(
  sessionId: string,
  deviceId: string | null
): Promise<{ session: { id: string; deviceId: string | null }; status: "ok" } | { status: "not_found" } | { status: "forbidden" }> {
  if (!deviceId) {
    return { status: "forbidden" };
  }
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    select: { id: true, deviceId: true },
  });
  if (!session) {
    return { status: "not_found" };
  }
  if (session.deviceId !== deviceId) {
    return { status: "forbidden" };
  }
  return { session, status: "ok" };
}
