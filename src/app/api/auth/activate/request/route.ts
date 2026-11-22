import { type NextRequest, NextResponse } from "next/server";
import { isSameOriginRequest } from "@/modules/auth/request-origin";
import { readTrustedClientIp } from "@/modules/auth/client-ip";
import { consumeRegistrationRateLimit } from "@/modules/auth/auth-rate-limit";
import { registerPasswordUser } from "@/modules/auth/registration-service";
import { publicRegistrationOperational } from "@/modules/auth/site-access-service";
import { readRegistrationActivationBody } from "@/modules/auth/registration-activation-http";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const headers = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff" };
function error(kind: string, status: number) { return NextResponse.json({ error: kind }, { status, headers }); }
export async function POST(request: NextRequest) {
  if (!isSameOriginRequest(request)) return error("forbidden_origin", 403);
  if (!await publicRegistrationOperational()) return error("registration_unavailable", 503);
  if (request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() !== "application/json") return error("unsupported_media_type", 415);
  const read = await readRegistrationActivationBody(request);
  if (!read.ok) return error(read.reason, read.reason === "request_too_large" ? 413 : 400);
  let value: unknown;
  try { value = JSON.parse(read.raw); } catch { return error("invalid_json", 400); }
  if (!value || typeof value !== "object" || Array.isArray(value)) return error("invalid_request", 400);
  const body = value as Record<string, unknown>;
  if (Object.keys(body).join() !== "email" || typeof body.email !== "string") return error("invalid_request", 400);
  const ip = readTrustedClientIp(request.headers);
  if (!ip) return error("rate_limit_identity_unavailable", 503);
  try {
    // Shared registration/resend IP quota; per-account cooldown is locked in PG.
    const limit = await consumeRegistrationRateLimit(ip);
    if (!limit.allowed) return NextResponse.json({ error: "rate_limited" }, {
      status: 429, headers: { ...headers, "Retry-After": String(limit.retryAfterSeconds) },
    });
    const result = await registerPasswordUser(body.email as string, null);
    if (!result.ok) return error(result.kind, result.kind === "registration_unavailable" ? 503 : 400);
    // Same acknowledgement for new, pending, verified, disabled and absent addresses.
    return NextResponse.json({ ok: true, activationRequired: true }, { status: 202, headers });
  } catch { return error("registration_unavailable", 503); }
}
