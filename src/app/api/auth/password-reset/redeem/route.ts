import { type NextRequest, NextResponse } from "next/server";

import { consumeAuthRateLimit } from "@/modules/auth/auth-rate-limit";
import { readTrustedClientIp } from "@/modules/auth/client-ip";
import {
  PASSWORD_RESET_REDEEM_IP_MAX_REQUESTS,
  PASSWORD_RESET_REDEEM_IP_SCOPE,
  PASSWORD_RESET_REDEEM_IP_WINDOW_MS,
  parsePasswordResetBody,
  passwordResetRedeemEnabled,
  readPasswordResetBody,
} from "@/modules/auth/password-reset-http";
import { redeemPasswordResetToken } from "@/modules/auth/password-reset-service";
import { isSameOriginRequest } from "@/modules/auth/request-origin";
import { clearSessionCookie } from "@/modules/auth/session-cookie";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const secureHeaders = {
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
};

function errorResponse(error: string, status: number, retryAfter?: number) {
  return NextResponse.json(
    { error },
    {
      status,
      headers: {
        ...secureHeaders,
        ...(retryAfter === undefined ? {} : { "Retry-After": String(retryAfter) }),
      },
    },
  );
}

/**
 * AUTH-01C1: redemption ONLY. Deliberately no request-link endpoint here:
 * legacy accounts have unverified email, and no approved transport exists.
 * Explicit operator opt-in is required before this endpoint accepts requests.
 */
export async function POST(request: NextRequest) {
  if (!passwordResetRedeemEnabled(process.env.PASSWORD_RESET_REDEEM_ENABLED)) {
    return errorResponse("recovery_unavailable", 503);
  }

  if (!isSameOriginRequest(request)) {
    return errorResponse("forbidden_origin", 403);
  }

  const clientIp = readTrustedClientIp(request.headers);
  if (!clientIp) {
    return errorResponse("rate_limit_identity_unavailable", 503);
  }

  let decision;
  try {
    decision = await consumeAuthRateLimit({
      scope: PASSWORD_RESET_REDEEM_IP_SCOPE,
      identity: clientIp,
      maxRequests: PASSWORD_RESET_REDEEM_IP_MAX_REQUESTS,
      windowMs: PASSWORD_RESET_REDEEM_IP_WINDOW_MS,
    });
  } catch {
    return errorResponse("rate_limit_unavailable", 503);
  }

  if (!decision.allowed) {
    return errorResponse("rate_limited", 429, decision.retryAfterSeconds);
  }

  if (request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() !== "application/json") {
    return errorResponse("unsupported_media_type", 415);
  }

  const body = await readPasswordResetBody(request);
  if (!body.ok) {
    return errorResponse(body.reason, body.reason === "request_too_large" ? 413 : 400);
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(body.raw);
  } catch {
    return errorResponse("invalid_json", 400);
  }

  const fields = parsePasswordResetBody(parsedJson);
  if (!fields.ok) {
    return errorResponse(fields.reason, 400);
  }

  try {
    const result = await redeemPasswordResetToken(fields.token, fields.newPassword);
    if (!result.ok) {
      // Do not expose account identity, token hashes or DB state.
      return errorResponse(result.kind === "weak_password" ? "weak_password" : "invalid_or_expired_token", 400);
    }

    const response = NextResponse.json({ ok: true }, { status: 200, headers: secureHeaders });
    // Existing cookie, if any, now references a revoked session.
    clearSessionCookie(response);
    return response;
  } catch {
    // Fail closed and avoid leaking SQL/crypto details in HTTP responses.
    return errorResponse("recovery_unavailable", 503);
  }
}
