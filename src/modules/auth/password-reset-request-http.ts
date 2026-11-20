/**
 * AUTH-01 / R1A: password-recovery REQUEST input contract (not delivery).
 * Pure module: no DB queries, token issuance, email sending or HTTP route.
 * Do not publish a request endpoint before durable mail delivery and the
 * verified-mailbox policy have been integrated and reviewed.
 */
export const PASSWORD_RESET_REQUEST_MAX_BODY_BYTES = 1024;
export const PASSWORD_RESET_REQUEST_IP_SCOPE = "password-reset-request-ip-v1";
export const PASSWORD_RESET_REQUEST_IP_MAX_REQUESTS = 5;
export const PASSWORD_RESET_REQUEST_IP_WINDOW_MS = 15 * 60 * 1000;
export const PASSWORD_RESET_REQUEST_ACCOUNT_SCOPE = "password-reset-request-account-v1";
export const PASSWORD_RESET_REQUEST_ACCOUNT_MAX_REQUESTS = 3;
export const PASSWORD_RESET_REQUEST_ACCOUNT_WINDOW_MS = 60 * 60 * 1000;

export const PASSWORD_RESET_REQUEST_GENERIC_ACK =
  "Если для этого адреса доступно восстановление, инструкции будут направлены на почту.";

export type ReadPasswordResetRequestBody =
  | { ok: true; raw: string }
  | { ok: false; reason: "request_too_large" | "invalid_request" };

export type ParsedPasswordResetRequestBody =
  | { ok: true; email: string }
  | { ok: false; reason: "invalid_request" };

/** Exact operator opt-in; not enough to enable live issuance or sending. */
export function passwordResetRequestEnabled(value: string | undefined): boolean {
  return value === "true";
}

/** Reject oversized request bodies before JSON parsing, independent of Content-Length. */
export async function readPasswordResetRequestBody(
  request: Request,
): Promise<ReadPasswordResetRequestBody> {
  const declared = request.headers.get("content-length");
  if (declared !== null) {
    if (!/^(0|[1-9][0-9]*)$/.test(declared)) {
      return { ok: false, reason: "invalid_request" };
    }
    if (Number(declared) > PASSWORD_RESET_REQUEST_MAX_BODY_BYTES) {
      return { ok: false, reason: "request_too_large" };
    }
  }

  if (!request.body) return { ok: false, reason: "invalid_request" };
  const reader = request.body.getReader();
  const chunks: Buffer[] = [];
  let size = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > PASSWORD_RESET_REQUEST_MAX_BODY_BYTES) {
        await reader.cancel().catch(() => {});
        return { ok: false, reason: "request_too_large" };
      }
      chunks.push(Buffer.from(part.value));
    }
  } catch {
    return { ok: false, reason: "invalid_request" };
  } finally {
    reader.releaseLock();
  }
  return { ok: true, raw: Buffer.concat(chunks).toString("utf8") };
}

/**
 * Canonicalisation mirrors registration (trim + lowercase + 320-char limit).
 * Callers must still apply their own origin check and durable rate limits.
 * Invalid and non-existent accounts must never produce distinguishable replies.
 */
export function parsePasswordResetRequestBody(
  value: unknown,
): ParsedPasswordResetRequestBody {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, reason: "invalid_request" };
  }
  const record = value as Record<string, unknown>;
  if (Object.keys(record).length !== 1 || !Object.hasOwn(record, "email")) {
    return { ok: false, reason: "invalid_request" };
  }
  if (typeof record.email !== "string") {
    return { ok: false, reason: "invalid_request" };
  }
  const email = record.email.trim().toLowerCase();
  if (
    email.length === 0 ||
    email.length > 320 ||
    Buffer.byteLength(email, "utf8") > 320 ||
    !/^[^\s@\x00-\x1F\x7F]+@[^\s@\x00-\x1F\x7F]+$/.test(email)
  ) {
    return { ok: false, reason: "invalid_request" };
  }
  return { ok: true, email };
}
