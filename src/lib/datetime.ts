/**
 * Текущие дата и время в часовом поясе пользователя для подстановки в промпт LLM.
 * Модель не знает реальное время — передаём его с сервера.
 */
export function getCurrentTimeInTimezone(
  timezone: string,
  locale: string = "ru",
): string {
  const now = new Date();
  try {
    const datePart = now.toLocaleDateString(locale, {
      timeZone: timezone,
      day: "numeric",
      month: "long",
      year: "numeric",
    });
    const timePart = now.toLocaleTimeString(locale, {
      timeZone: timezone,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    return `${timePart}, ${datePart}`;
  } catch {
    return now.toLocaleString(locale, { timeZone: "UTC" });
  }
}
