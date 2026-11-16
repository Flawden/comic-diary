/**
 * AUTH-01C2B4D2A: provider-neutral, side-effect-free activation mail contract.
 * No sender is configured here; caller MUST supply an explicitly enabled sender.
 * The code is intentionally NOT put in a URL (including its fragment): email
 * clients and link scanners may rewrite, prefetch or report links.
 */
export type PendingActivationMail = Readonly<{
  to: string;
  subject: string;
  text: string;
  activationPageUrl: string;
}>;

export type PendingActivationMailInput = Readonly<{
  /** Exact mailbox snapshot read from the locked account, not request input. */
  email: string;
  /** Sensitive raw one-time code. Never log or return to a public API. */
  token: string;
  expiresAt: Date;
  /** Explicit trusted deployment config, NEVER request Host/forwarded headers. */
  publicOrigin: string;
}>;

export type ActivationMailTransport = (
  message: PendingActivationMail,
) => Promise<{ accepted: boolean }>;

export type ActivationMailDeliveryStatus =
  | "disabled"
  | "unavailable"
  | "accepted";

/** Strict operator opt-in. No public route may enable this on its own. */
export function activationMailDeliveryEnabled(value: string | undefined): boolean {
  return value === "true";
}

/** Production mail must use an exact canonical HTTPS origin, never HTTP. */
export function canonicalActivationMailOrigin(value: string): string | null {
  if (typeof value !== "string" || value !== value.trim()) return null;
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      !url.hostname ||
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash ||
      value !== url.origin
    ) {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
}

/** Reject header/control characters and clearly invalid recipient values. */
function safeRecipient(value: string): boolean {
  return (
    typeof value === "string" &&
    value.length > 3 &&
    value.length <= 320 &&
    !/[\x00-\x1f\x7f\s<>,;:()\[\]"\\]/.test(value) &&
    /^[^@]+@[^@]+$/.test(value)
  );
}

/** Canonical 32-byte base64url code; shares token format with C2B1. */
function safeToken(value: string): boolean {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(value)) return false;
  const decoded = Buffer.from(value, "base64url");
  return decoded.byteLength === 32 && decoded.toString("base64url") === value;
}

export function buildPendingActivationMail(
  input: PendingActivationMailInput,
  now: Date = new Date(),
): PendingActivationMail | null {
  if (!input || !safeRecipient(input.email) || !safeToken(input.token)) return null;
  const origin = canonicalActivationMailOrigin(input.publicOrigin);
  const expiresMs = input.expiresAt instanceof Date ? input.expiresAt.getTime() : NaN;
  const nowMs = now instanceof Date ? now.getTime() : NaN;
  // Never hand a delivery provider an expired or essentially-expired code.
  if (!origin || !Number.isFinite(expiresMs) || !Number.isFinite(nowMs) || expiresMs - nowMs <= 60_000 || expiresMs - nowMs > 30 * 60_000) {
    return null;
  }

  const activationPageUrl = `${origin}/activate`;
  const text = [
    "Comic Diary — подтверждение регистрации",
    "",
    "Кто-то указал этот адрес электронной почты при регистрации в Comic Diary.",
    "Если это были вы, откройте страницу:",
    activationPageUrl,
    "",
    "Введите на странице одноразовый код:",
    input.token,
    "",
    "Затем задайте НОВЫЙ пароль. Пароль, указанный при регистрации, не будет действовать после активации.",
    `Код действителен до ${new Date(expiresMs).toISOString()} (UTC).`,
    "Никому не пересылайте этот код.",
    "",
    "Если вы не регистрировались, проигнорируйте письмо. Аккаунт не активируется автоматически.",
  ].join("\n");

  return {
    to: input.email,
    subject: "Comic Diary — подтверждение регистрации",
    text,
    activationPageUrl,
  };
}

/**
 * Intentionally only a transport BOUNDARY, not a mail implementation.
 * No provider, credentials, retries, queue or DB side effects are included.
 * Fail closed; never log sender exceptions or echo raw recipient/code.
 * "accepted" means transport accepted the request, NOT delivered-to-inbox.
 */
export async function deliverPendingActivationMail(input: {
  enabled: string | undefined;
  transport: ActivationMailTransport | undefined;
  message: PendingActivationMailInput;
  now?: Date;
}): Promise<ActivationMailDeliveryStatus> {
  if (!activationMailDeliveryEnabled(input.enabled)) return "disabled";
  if (!input.transport) return "unavailable";
  const mail = buildPendingActivationMail(input.message, input.now);
  if (!mail) return "unavailable";
  try {
    return (await input.transport(mail)).accepted === true ? "accepted" : "unavailable";
  } catch {
    return "unavailable";
  }
}
