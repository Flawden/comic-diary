import { type NextRequest, NextResponse } from "next/server";
import { consumeAuthRateLimit } from "./auth-rate-limit";
import { readTrustedClientIp } from "./client-ip";
import { readRegistrationActivationBody } from "./registration-activation-http";
import { readSessionToken } from "./session-cookie-reader";
import { isSameOriginRequest } from "./request-origin";
import { legacyVerificationEnabled, legacyVerificationRequestEnabled } from "./verification-purpose";
import { requestOwnLegacyEmailVerification, redeemOwnLegacyEmailVerification, resolveLegacyVerificationSession } from "./legacy-email-verification-service";

const headers = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff" };
function error(kind: string, status: number, retry?: number) {
  return NextResponse.json({ error: kind }, { status, headers: { ...headers, ...(retry ? { "Retry-After": String(retry) } : {}) } });
}
export function parseLegacyVerificationBody(value: unknown, action: "request" | "redeem") {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;
  const keys = action === "request" ? ["currentPassword"] : ["currentPassword", "token"];
  if (Object.keys(body).length !== keys.length || Object.keys(body).some(key => !keys.includes(key)) ||
      typeof body.currentPassword !== "string" || !body.currentPassword.length || Buffer.byteLength(body.currentPassword, "utf8") > 1024 ||
      (action === "redeem" && (typeof body.token !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(body.token)))) return null;
  return { currentPassword: body.currentPassword, token: body.token };
}

export async function handleLegacyVerification(request: NextRequest, action: "request" | "redeem") {
  if (!(action === "request" ? legacyVerificationRequestEnabled(process.env) : legacyVerificationEnabled(process.env))) return error("verification_unavailable", 503);
  if (!isSameOriginRequest(request)) return error("forbidden_origin", 403);
  try {
    const sessionToken = readSessionToken(request.cookies);
    const session = sessionToken ? await resolveLegacyVerificationSession(sessionToken) : null;
    if (!session || !sessionToken) return error("unauthorized", 401);
    const ip = readTrustedClientIp(request.headers);
    if (!ip) return error("verification_unavailable", 503);
    for (const [scope, identity, maxRequests] of [
      ["legacy-email-verification-ip-v1", ip, 20],
      ["legacy-email-verification-user-v1", String(session.userId), 10],
    ] as const) {
      const limit = await consumeAuthRateLimit({ scope, identity, maxRequests, windowMs: 15 * 60_000 });
      if (!limit.allowed) return error("rate_limited", 429, limit.retryAfterSeconds);
    }
    if (request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() !== "application/json") return error("unsupported_media_type", 415);
    const read = await readRegistrationActivationBody(request);
    if (!read.ok) return error(read.reason, read.reason === "request_too_large" ? 413 : 400);
    let value: unknown;
    try { value = JSON.parse(read.raw); } catch { return error("invalid_request", 400); }
    const body = parseLegacyVerificationBody(value, action);
    if (!body) return error("invalid_request", 400);
    const result = action === "request" ? await requestOwnLegacyEmailVerification(sessionToken, body.currentPassword)
      : await redeemOwnLegacyEmailVerification(sessionToken, body.currentPassword, body.token);
    if (!result.ok) return error(result.kind, result.kind === "verification_unavailable" ? 503 : 400);
    return NextResponse.json({ ok: true }, { status: action === "request" ? 202 : 200, headers });
  } catch { return error("verification_unavailable", 503); }
}
