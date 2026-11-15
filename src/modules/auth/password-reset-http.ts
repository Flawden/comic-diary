/**
 * Pure HTTP input contract for AUTH-01C1. No database or mail side effects.
 * Public redemption remains disabled unless explicitly enabled by an operator.
 */
export const PASSWORD_RESET_REDEEM_MAX_BODY_BYTES = 4096;
export const PASSWORD_RESET_REDEEM_IP_SCOPE = "password-reset-redeem-ip-v1";
export const PASSWORD_RESET_REDEEM_IP_MAX_REQUESTS = 12;
export const PASSWORD_RESET_REDEEM_IP_WINDOW_MS = 15 * 60 * 1000;

export type ReadPasswordResetBodyResult =
  | { ok: true; raw: string }
  | { ok: false; reason: "request_too_large" | "invalid_request" };

export type ParsedPasswordResetBody =
  | { ok: true; token: string; newPassword: string }
  | { ok: false; reason: "invalid_request" | "password_mismatch" };

const allowedKeys = new Set(["token", "newPassword", "newPasswordConfirm"]);

/** Exact opt-in, never infer enabled from non-empty env values. */
export function passwordResetRedeemEnabled(setting: string | undefined): boolean {
  return setting === "true";
}

/**
 * Stream and cap the incoming body BEFORE allocating a full string. A declared
 * Content-Length cannot be relied on, so enforce a second limit while reading.
 */
export async function readPasswordResetBody(
  request: Request,
): Promise<ReadPasswordResetBodyResult> {
  const declared = request.headers.get("content-length");
  if (declared !== null) {
    if (!/^(0|[1-9][0-9]*)$/.test(declared)) {
      return { ok: false, reason: "invalid_request" };
    }
    if (Number(declared) > PASSWORD_RESET_REDEEM_MAX_BODY_BYTES) {
      return { ok: false, reason: "request_too_large" };
    }
  }

  if (!request.body) {
    return { ok: false, reason: "invalid_request" };
  }

  const reader = request.body.getReader();
  const chunks: Buffer[] = [];
  let bytes = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      bytes += next.value.byteLength;
      if (bytes > PASSWORD_RESET_REDEEM_MAX_BODY_BYTES) {
        await reader.cancel().catch(() => {});
        return { ok: false, reason: "request_too_large" };
      }
      chunks.push(Buffer.from(next.value));
    }
  } catch {
    return { ok: false, reason: "invalid_request" };
  } finally {
    reader.releaseLock();
  }

  return { ok: true, raw: Buffer.concat(chunks).toString("utf8") };
}

export function parsePasswordResetBody(value: unknown): ParsedPasswordResetBody {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { ok: false, reason: "invalid_request" };
  }
  const fields = value as Record<string, unknown>;
  const keys = Object.keys(fields);
  if (keys.length !== 3 || keys.some((key) => !allowedKeys.has(key))) {
    return { ok: false, reason: "invalid_request" };
  }

  const { token, newPassword, newPasswordConfirm } = fields;
  if (
    typeof token !== "string" ||
    typeof newPassword !== "string" ||
    typeof newPasswordConfirm !== "string" ||
    token.length > 256 ||
    newPassword.length === 0
  ) {
    return { ok: false, reason: "invalid_request" };
  }

  if (newPassword !== newPasswordConfirm) {
    return { ok: false, reason: "password_mismatch" };
  }
  return { ok: true, token, newPassword };
}
