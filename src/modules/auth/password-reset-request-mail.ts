/**
 * AUTH-01 / R1B1 — provider-neutral password recovery mail contract.
 * PURE: no DB, outbox, provider, HTTP endpoint, secret loading or mail dispatch.
 * A caller must obtain the mailbox from a locked, verified account row, never
 * trust the requested email as the destination, and enqueue atomically later.
 */
export type PasswordResetRecoveryMail = Readonly<{
  to: string;
  subject: string;
  text: string;
  recoveryPageUrl: string;
}>;

export type PasswordResetRecoveryMailInput = Readonly<{
  /** Snapshot of the verified mailbox from a locked account row. */
  verifiedEmail: string;
  /** Sensitive one-time reset code; never log, put in URL, or store in plaintext. */
  token: string;
  expiresAt: Date;
  /** Trusted deployment configuration, NEVER request Host/forwarded headers. */
  publicOrigin: string;
}>;

const TOKEN = /^[A-Za-z0-9_-]{43}$/;
const MAX_RESET_LIFETIME_MS = 20 * 60 * 1000;

export function canonicalPasswordResetMailOrigin(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 2048 || value !== value.trim()) return null;
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" || !url.hostname || url.username || url.password ||
      url.pathname !== "/" || url.search || url.hash || value !== url.origin
    ) return null;
    return url.origin;
  } catch { return null; }
}

function safeVerifiedEmail(value: unknown): value is string {
  return typeof value === "string" && value.length >= 4 && value.length <= 320 &&
    Buffer.byteLength(value, "utf8") <= 320 &&
    !/[\x00-\x1f\x7f\s<>,;:()\[\]"\\]/.test(value) &&
    /^[^@]+@[^@]+$/.test(value);
}

function safeResetToken(value: unknown): value is string {
  if (typeof value !== "string" || !TOKEN.test(value)) return false;
  const bytes = Buffer.from(value, "base64url");
  return bytes.length === 32 && bytes.toString("base64url") === value;
}

/** No dispatch, no token URL, no recipient information from untrusted input. */
export function buildPasswordResetRecoveryMail(
  input: PasswordResetRecoveryMailInput,
  now: Date = new Date(),
): PasswordResetRecoveryMail | null {
  if (!input || !safeVerifiedEmail(input.verifiedEmail) || !safeResetToken(input.token)) return null;
  const origin = canonicalPasswordResetMailOrigin(input.publicOrigin);
  const expiresMs = input.expiresAt instanceof Date ? input.expiresAt.getTime() : NaN;
  const nowMs = now instanceof Date ? now.getTime() : NaN;
  const remaining = expiresMs - nowMs;
  // Do not enqueue stale or implausibly long-lived reset credentials.
  if (!origin || !Number.isFinite(remaining) || remaining <= 60_000 || remaining > MAX_RESET_LIFETIME_MS) return null;

  const recoveryPageUrl = `${origin}/reset-password`;
  const text = [
    "Comic Diary — восстановление пароля",
    "",
    "Кто-то запросил восстановление пароля для вашего аккаунта Comic Diary.",
    "Если это были вы, откройте страницу:",
    recoveryPageUrl,
    "",
    "Введите на странице одноразовый код:",
    input.token,
    "",
    `Код действителен до ${new Date(expiresMs).toISOString()} (UTC).`,
    "Не сообщайте код другим людям.",
    "",
    "Если вы не запрашивали восстановление, проигнорируйте это письмо.",
    "Пароль не изменится без ввода действующего кода.",
  ].join("\n");

  return {
    to: input.verifiedEmail,
    subject: "Comic Diary — восстановление пароля",
    text,
    recoveryPageUrl,
  };
}
