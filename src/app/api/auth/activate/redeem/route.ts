/**
 * AUTH-01C2B4D1: redemption ONLY, disabled by default.
 * D2-D5 must add the mail, claim and user-facing flows before operator opt-in.
 */
import { type NextRequest, NextResponse } from "next/server";

import { consumeAuthRateLimit } from "@/modules/auth/auth-rate-limit";
import { readTrustedClientIp } from "@/modules/auth/client-ip";
import {
  REGISTRATION_ACTIVATION_REDEEM_IP_MAX_REQUESTS,
  REGISTRATION_ACTIVATION_REDEEM_IP_SCOPE,
  REGISTRATION_ACTIVATION_REDEEM_IP_WINDOW_MS,
  parseRegistrationActivationBody,
  readRegistrationActivationBody,
  registrationActivationRedeemEnabled,
} from "@/modules/auth/registration-activation-http";
import { activatePendingRegistrationWithEmailToken } from "@/modules/auth/registration-activation-service";
import { isSameOriginRequest } from "@/modules/auth/request-origin";
import { clearSessionCookie } from "@/modules/auth/session-cookie";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const securityHeaders = {
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
};

function errorResponse(error: string, status: number, retryAfterSeconds?: number) {
  return NextResponse.json({ error }, {
    status,
    headers: {
      ...securityHeaders,
      ...(retryAfterSeconds === undefined ? {} : { "Retry-After": String(retryAfterSeconds) }),
    },
  });
}

export async function POST(request: NextRequest) {
  // No hidden enablement via default/nonempty env values.
  if (!registrationActivationRedeemEnabled(process.env.REGISTRATION_ACTIVATION_REDEEM_ENABLED)) {
    return errorResponse("activation_unavailable", 503);
  }
  if (!isSameOriginRequest(request)) return errorResponse("forbidden_origin", 403);

  const clientIp = readTrustedClientIp(request.headers);
  if (!clientIp) return errorResponse("rate_limit_identity_unavailable", 503);

  let limit;
  try {
    limit = await consumeAuthRateLimit({
      scope: REGISTRATION_ACTIVATION_REDEEM_IP_SCOPE,
      identity: clientIp,
      maxRequests: REGISTRATION_ACTIVATION_REDEEM_IP_MAX_REQUESTS,
      windowMs: REGISTRATION_ACTIVATION_REDEEM_IP_WINDOW_MS,
    });
  } catch {
    return errorResponse("rate_limit_unavailable", 503);
  }
  if (!limit.allowed) return errorResponse("rate_limited", 429, limit.retryAfterSeconds);

  if (request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() !== "application/json") {
    return errorResponse("unsupported_media_type", 415);
  }
  const read = await readRegistrationActivationBody(request);
  if (!read.ok) {
    return errorResponse(read.reason, read.reason === "request_too_large" ? 413 : 400);
  }
  let json: unknown;
  try {
    json = JSON.parse(read.raw);
  } catch {
    return errorResponse("invalid_json", 400);
  }
  const parsed = parseRegistrationActivationBody(json);
  if (!parsed.ok) return errorResponse(parsed.reason, 400);

  try {
    const result = await activatePendingRegistrationWithEmailToken(parsed.token, parsed.newPassword);
    if (!result.ok) {
      return errorResponse(result.kind === "weak_password" ? "weak_password" : "invalid_or_expired_token", 400);
    }
    const response = NextResponse.json({ ok: true }, { status: 200, headers: securityHeaders });
    // A successful activation never logs the user in; preexisting sessions were revoked.
    clearSessionCookie(response);
    return response;
  } catch {
    // No SQL, token or identity details in public errors.
    return errorResponse("activation_unavailable", 503);
  }
}
