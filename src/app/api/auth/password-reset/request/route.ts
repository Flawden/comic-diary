/**
 * AUTH-01 / R1C1: inert-by-default HTTP request entrypoint.
 * No code, account ID, queue identity or encryption secret is returned to clients.
 * This route does NOT send email. Do not enable either flag before a reviewed
 * and separately authorized recovery-mail dispatcher is operational.
 */
import { eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";

import { db } from "@/db";
import { users } from "@/db/schema";
import { consumeAuthRateLimit } from "@/modules/auth/auth-rate-limit";
import { readTrustedClientIp } from "@/modules/auth/client-ip";
import {
  PASSWORD_RESET_REQUEST_ACCOUNT_MAX_REQUESTS,
  PASSWORD_RESET_REQUEST_ACCOUNT_SCOPE,
  PASSWORD_RESET_REQUEST_ACCOUNT_WINDOW_MS,
  PASSWORD_RESET_REQUEST_GENERIC_ACK,
  PASSWORD_RESET_REQUEST_IP_MAX_REQUESTS,
  PASSWORD_RESET_REQUEST_IP_SCOPE,
  PASSWORD_RESET_REQUEST_IP_WINDOW_MS,
  parsePasswordResetRequestBody,
  readPasswordResetRequestBody,
} from "@/modules/auth/password-reset-request-http";
import {
  isRecoveryRequestAllowed,
  readRecoveryRequestOutboxKey,
} from "@/modules/auth/password-reset-request-config";
import { canonicalPasswordResetMailOrigin } from "@/modules/auth/password-reset-request-mail";
import { enqueuePasswordResetMailForUser } from "@/modules/auth/password-reset-request-outbox-issue";
import { isSameOriginRequest } from "@/modules/auth/request-origin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const secureHeaders = {
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
};

function errorResponse(error: string, status: number, retryAfter?: number) {
  return NextResponse.json({ error }, {
    status, headers: {
      ...secureHeaders,
      ...(retryAfter === undefined ? {} : { "Retry-After": String(retryAfter) }),
    },
  });
}

function acknowledge() {
  return NextResponse.json({ ok: true, message: PASSWORD_RESET_REQUEST_GENERIC_ACK }, {
    status: 202, headers: secureHeaders,
  });
}

export async function POST(request: NextRequest) {
  // No public issuance until explicit readiness after mail-dispatch review.
  const recoveryConfig = {
    PASSWORD_RESET_REQUEST_ENABLED: process.env.PASSWORD_RESET_REQUEST_ENABLED,
    PASSWORD_RESET_REQUEST_MAIL_READY: process.env.PASSWORD_RESET_REQUEST_MAIL_READY,
    PASSWORD_RESET_OUTBOX_KEY_ID: process.env.PASSWORD_RESET_OUTBOX_KEY_ID,
    PASSWORD_RESET_OUTBOX_KEY_BASE64: process.env.PASSWORD_RESET_OUTBOX_KEY_BASE64,
  };
  if (!isRecoveryRequestAllowed(recoveryConfig)) return errorResponse("recovery_unavailable", 503);
  if (!isSameOriginRequest(request)) return errorResponse("forbidden_origin", 403);

  // Both pieces originate only from deployment configuration, never HTTP headers.
  const origin = canonicalPasswordResetMailOrigin(process.env.COMIC_DIARY_PUBLIC_ORIGIN);
  if (!origin) return errorResponse("recovery_unavailable", 503);
  const key = readRecoveryRequestOutboxKey(recoveryConfig);
  if (!key) return errorResponse("recovery_unavailable", 503);

  try {
    const clientIp = readTrustedClientIp(request.headers);
    if (!clientIp) return errorResponse("rate_limit_identity_unavailable", 503);
    let ipDecision;
    try {
      ipDecision = await consumeAuthRateLimit({
        scope: PASSWORD_RESET_REQUEST_IP_SCOPE,
        identity: clientIp,
        maxRequests: PASSWORD_RESET_REQUEST_IP_MAX_REQUESTS,
        windowMs: PASSWORD_RESET_REQUEST_IP_WINDOW_MS,
      });
    } catch {
      return errorResponse("rate_limit_unavailable", 503);
    }
    if (!ipDecision.allowed) return errorResponse("rate_limited", 429, ipDecision.retryAfterSeconds);

    if (request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() !== "application/json") {
      return errorResponse("unsupported_media_type", 415);
    }
    const body = await readPasswordResetRequestBody(request);
    if (!body.ok) {
      return errorResponse(body.reason, body.reason === "request_too_large" ? 413 : 400);
    }
    let json: unknown;
    try { json = JSON.parse(body.raw); }
    catch { return errorResponse("invalid_json", 400); }
    const parsed = parsePasswordResetRequestBody(json);
    if (!parsed.ok) return errorResponse(parsed.reason, 400);

    // Hash-identified durable limiter applies equally to known/unknown email.
    // Never expose an account-specific denial to the caller.
    try {
      const accountLimit = await consumeAuthRateLimit({
        scope: PASSWORD_RESET_REQUEST_ACCOUNT_SCOPE,
        identity: parsed.email,
        maxRequests: PASSWORD_RESET_REQUEST_ACCOUNT_MAX_REQUESTS,
        windowMs: PASSWORD_RESET_REQUEST_ACCOUNT_WINDOW_MS,
      });
      if (!accountLimit.allowed) return acknowledge();
    } catch {
      return errorResponse("rate_limit_unavailable", 503);
    }

    try {
      const rows = await db.select({ id: users.id })
        .from(users).where(eq(users.email, parsed.email)).limit(1);
      const account = rows[0];
      if (account) {
        // The issuer locks and rechecks the verified active account itself.
        // Its exceptions are deliberately not account-disclosing HTTP signals.
        await enqueuePasswordResetMailForUser({
          userId: account.id, publicOrigin: origin, key,
        });
      }
    } catch {
      // Generic acknowledgement, including on account-dependent failures.
      // No error detail or email is logged, and no token is returned.
    }
    return acknowledge();
  } finally {
    // Never retain the decoded encryption key beyond this request.
    key.bytes.fill(0);
  }
}
