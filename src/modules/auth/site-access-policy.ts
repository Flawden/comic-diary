export const BETA_WAIT_MESSAGE =
  "Ваш аккаунт создан, но доступ пока открыт только участникам закрытого бета-тестирования. Дождитесь релиза или обратитесь к администратору.";
export function canEnterBeta(
  betaOnly: boolean,
  role: string | null,
  participant: boolean,
) {
  return !betaOnly || role === "ADMIN" || participant;
}
/** Only authentication and the waiting page bypass the content gate. */
export function accessGateExempt(path: string) {
  return (
    path === "/beta-wait" ||
    path === "/login" ||
    path === "/register" ||
    path === "/activate" ||
    path === "/forgot-password" ||
    path === "/reset-password" ||
    path === "/favicon.ico" ||
    path.startsWith("/_next/") ||
    path.startsWith("/images/") ||
    path.startsWith("/fonts/") ||
    path.startsWith("/avatar-frames/") ||
    path.startsWith("/api/auth/") ||
    path.startsWith("/api/health/") ||
    path === "/api/health" ||
    path === "/api/ready" ||
    path === "/api/readiness"
  );
}
