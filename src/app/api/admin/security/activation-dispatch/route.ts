import { activationDispatchOperational } from "@/modules/auth/registration-activation-config";
import { readRegistrationActivationBody } from "@/modules/auth/registration-activation-http";
/**
 * B3B3C administrative control plane. No public client UI, scheduler, mail
 * provider or network dispatch. Operator enable is default disabled.
 */
import { type NextRequest, NextResponse } from "next/server";
import { getCurrentSession } from "@/modules/auth/request-identity";
import { isSameOriginRequest } from "@/modules/auth/request-origin";
import { hasPermission } from "@/modules/auth/permissions";
import { db } from "@/db";
import { activationMailDispatchControl } from "@/db/schema";
import { eq } from "drizzle-orm";
import { transitionActivationDispatchControl } from "@/modules/auth/registration-activation-operator-control";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const HEADERS = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" };
const MAX_BODY = 1024;
function json(value: unknown, status: number) { return NextResponse.json(value, { status, headers: HEADERS }); }
function error(kind: string, status: number) { return json({ ok: false, error: { kind }, sendAuthorized: false }, status); }

// Safe status-only read for future ADMIN_SECURITY UI; never creates reservations.
export async function GET() {
  try {
    const current = await getCurrentSession();
    if (!current) return error("unauthorized", 401);
    if (!hasPermission(current.user.role, "ADMIN_SECURITY")) return error("forbidden", 403);
    const [control] = await db.select({
      enabled: activationMailDispatchControl.enabled,
      generation: activationMailDispatchControl.generation,
    }).from(activationMailDispatchControl).where(eq(activationMailDispatchControl.id, 1)).limit(1);
    if (!control) return error("control-unavailable", 503);
    return json({ ok: true, enabled: control.enabled, generation: control.generation,
      canEnable: process.env.AUTH_ACTIVATION_OPERATOR_CONTROL_ENABLED === "true" && activationDispatchOperational(process.env),
      sendAuthorized: false }, 200);
  } catch { return error("control-unavailable", 503); }
}

export async function POST(request: NextRequest) {
  // Cross-origin requests fail before session/db or body consumption.
  if (!isSameOriginRequest(request)) return error("origin-not-allowed", 403);
  const current = await getCurrentSession();
  if (!current) return error("unauthorized", 401);
  if (!hasPermission(current.user.role, "ADMIN_SECURITY")) return error("forbidden", 403);
  if (request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() !== "application/json")
    return error("unsupported-media-type", 415);
  const length = request.headers.get("content-length");
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > MAX_BODY)) return error("request-too-large", 413);
  const read = await readRegistrationActivationBody(request);
  if (!read.ok) return error(read.reason, read.reason === "request_too_large" ? 413 : 400);
  const body = read.raw;
  if (Buffer.byteLength(body, "utf8") > MAX_BODY) return error("request-too-large", 413);
  let parsed: unknown;
  try { parsed = JSON.parse(body); } catch { return error("invalid-json", 400); }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return error("invalid-request", 400);
  const value = parsed as Record<string, unknown>;
  if (Object.keys(value).length !== 3 ||
      typeof value.enabled !== "boolean" ||
      !Number.isSafeInteger(value.expectedGeneration) ||
      (value.expectedGeneration as number) < 0 || (value.expectedGeneration as number) >= 2147483647 ||
      (value.confirm !== "ENABLE_ACTIVATION_DISPATCH" && value.confirm !== "DISABLE_ACTIVATION_DISPATCH") ||
      (value.enabled ? value.confirm !== "ENABLE_ACTIVATION_DISPATCH" : value.confirm !== "DISABLE_ACTIVATION_DISPATCH"))
    return error("invalid-request", 400);
  try {
    const result = await transitionActivationDispatchControl({
      actorUserId: current.user.id,
      actorSessionId: current.sessionId,
      expectedGeneration: value.expectedGeneration as number,
      enabled: value.enabled,
    });
    if (!result.ok) return error(result.kind, result.kind === "conflict" ? 409 : 403);
    return json(result, 200);
  } catch {
    // Never leak DB state or details to the client.
    return error("control-unavailable", 503);
  }
}
