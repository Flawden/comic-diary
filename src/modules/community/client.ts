export class CommunityRequestError extends Error {
  constructor(readonly status: number, readonly retryAfter = 0, readonly code = "") { super("community_request_failed"); }
}
export async function communityRequest<T>(url: string, method = "GET", body?: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { method, credentials: "same-origin", cache: "no-store", signal,
    ...(body === undefined ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }) });
  if (!response.ok) {
    const payload: unknown = await response.json().catch(() => null);
    const code = payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string" ? payload.error : "";
    throw new CommunityRequestError(response.status, Math.max(0, Number(response.headers.get("Retry-After")) || 0), code);
  }
  return response.json() as Promise<T>;
}
export function communityErrorMessage(error: unknown): string {
  if (error instanceof CommunityRequestError) {
    if (error.code === "reply_depth") return "Можно ответить только на корневой комментарий.";
    if (error.code === "invalid_expiry") return "Укажите дату в будущем, не более 30 дней.";
    if (error.code === "own_report") return "Нельзя пожаловаться на собственный комментарий.";
    if (error.status === 401) return "Войдите в аккаунт, чтобы продолжить.";
    if (error.status === 403) return "Действие запрещено. Возможно, публикация временно ограничена.";
    if (error.status === 404) return "Обсуждение недоступно.";
    if (error.status === 409) return "Сообщение изменилось или повторный запрос отличается. Обновите обсуждение.";
    if (error.status === 429) return `Слишком часто. Повторите через ${error.retryAfter || 15} сек.`;
    if (error.status === 400) return "Проверьте текст и параметры запроса.";
    if (error.status === 413) return "Запрос слишком большой. Сократите текст.";
    if (error.status === 415) return "Неподдерживаемый формат запроса.";
  }
  return "Не удалось выполнить запрос. Попробуйте ещё раз.";
}
