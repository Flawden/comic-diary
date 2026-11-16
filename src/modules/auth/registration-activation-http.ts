/**
 * AUTH-01C2B4D1: pure public redemption boundary contract.
 * Does not issue tokens, deliver mail, access a database or activate accounts.
 * The route is opt-in and MUST remain disabled until the complete D/E rollout.
 */
export const REGISTRATION_ACTIVATION_REDEEM_MAX_BODY_BYTES = 4096;
export const REGISTRATION_ACTIVATION_REDEEM_IP_SCOPE = "registration-activation-redeem-ip-v1";
export const REGISTRATION_ACTIVATION_REDEEM_IP_MAX_REQUESTS = 8;
export const REGISTRATION_ACTIVATION_REDEEM_IP_WINDOW_MS = 15 * 60 * 1000;

export type ActivationBodyRead =
  | { ok: true; raw: string }
  | { ok: false; reason: "invalid_request" | "request_too_large" };

export type ActivationBodyParse =
  | { ok: true; token: string; newPassword: string }
  | { ok: false; reason: "invalid_request" | "password_mismatch" };

const allowedKeys = new Set(["token", "newPassword", "newPasswordConfirm"]);

/** Explicit opt-in, not truthiness. Do not enable before mail/claim are ready. */
export function registrationActivationRedeemEnabled(setting: string | undefined): boolean {
  return setting === "true";
}

/** A declared length is never trusted; count actual streaming bytes as well. */
export async function readRegistrationActivationBody(request: Request): Promise<ActivationBodyRead> {
  const declared = request.headers.get("content-length");
  if (declared !== null) {
    if (!/^(0|[1-9][0-9]*)$/.test(declared)) {
      return { ok: false, reason: "invalid_request" };
    }
    if (Number(declared) > REGISTRATION_ACTIVATION_REDEEM_MAX_BODY_BYTES) {
      return { ok: false, reason: "request_too_large" };
    }
  }

  if (!request.body) return { ok: false, reason: "invalid_request" };
  const reader = request.body.getReader();
  const chunks: Buffer[] = [];
  let total = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      total += chunk.value.byteLength;
      if (total > REGISTRATION_ACTIVATION_REDEEM_MAX_BODY_BYTES) {
        await reader.cancel().catch(() => {});
        return { ok: false, reason: "request_too_large" };
      }
      chunks.push(Buffer.from(chunk.value));
    }
  } catch {
    return { ok: false, reason: "invalid_request" };
  } finally {
    reader.releaseLock();
  }
  return { ok: true, raw: Buffer.concat(chunks).toString("utf8") };
}

/** Exact payload keys; do not echo token or passwords in errors. */
export function parseRegistrationActivationBody(value: unknown): ActivationBodyParse {
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
    token.length !== 43 ||
    !/^[A-Za-z0-9_-]{43}$/.test(token) ||
    newPassword.length === 0 ||
    Buffer.byteLength(newPassword, "utf8") > 256 ||
    Buffer.byteLength(newPasswordConfirm, "utf8") > 256
  ) {
    return { ok: false, reason: "invalid_request" };
  }
  if (newPassword !== newPasswordConfirm) {
    return { ok: false, reason: "password_mismatch" };
  }
  return { ok: true, token, newPassword };
}
