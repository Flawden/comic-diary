/**
 * B3B3C internal operator transition. No sender, worker, fetch, credentials,
 * or authority to start HTTP/mail delivery. No public route invokes this
 * without same-origin session authorization and an explicit opt-in for ON.
 *
 * Required lock order: CONTROL -> actor USER -> actor SESSION -> AUDIT.
 * Existing reservation code locks CONTROL first, so an OFF commit before a
 * reservation obtains that lock blocks new reservations. OFF does NOT undo
 * an earlier committed reservation or cancel future external HTTP; such a
 * guarantee requires a separately reviewed transport handoff protocol.
 */
import { and, eq, gt } from "drizzle-orm";
import { db } from "@/db";
import { activationMailDispatchControl, administrativeAuditEvents, sessions, users } from "@/db/schema";
import { hasPermission } from "./permissions";
import { canUseFullAccountSession } from "./registration-activation-policy";

const DENIED = Object.freeze({ ok: false, kind: "blocked", sendAuthorized: false } as const);
export type OperatorTransitionResult =
  | Readonly<{ ok: true; enabled: boolean; generation: number; sendAuthorized: false }>
  | Readonly<{ ok: false; kind: "blocked" | "conflict"; sendAuthorized: false }>;

export async function transitionActivationDispatchControl(input: Readonly<{
  actorUserId: number;
  actorSessionId: number;
  expectedGeneration: number;
  enabled: boolean;
}>): Promise<OperatorTransitionResult> {
  if (!input || typeof input !== "object" || Array.isArray(input) ||
      Object.keys(input).length !== 4 ||
      !Number.isSafeInteger(input.actorUserId) || input.actorUserId <= 0 ||
      !Number.isSafeInteger(input.actorSessionId) || input.actorSessionId <= 0 ||
      !Number.isSafeInteger(input.expectedGeneration) ||
      input.expectedGeneration < 0 || input.expectedGeneration >= 2147483647 ||
      typeof input.enabled !== "boolean") return DENIED;

  // An ON transition is disabled by default. OFF is always permitted for an
  // authorized operator, including when this explicit opt-in is absent.
  if (input.enabled && process.env.AUTH_ACTIVATION_OPERATOR_CONTROL_ENABLED !== "true") return DENIED;

  return db.transaction(async (tx): Promise<OperatorTransitionResult> => {
    // First lock CONTROL, never trust the separate preflight/UI read.
    const [control] = await tx.select({
      enabled: activationMailDispatchControl.enabled,
      generation: activationMailDispatchControl.generation,
    }).from(activationMailDispatchControl)
      .where(eq(activationMailDispatchControl.id, 1)).limit(1).for("update");
    if (!control || !Number.isSafeInteger(control.generation) ||
        control.generation !== input.expectedGeneration ||
        control.generation < 0 || control.generation >= 2147483647 ||
        control.enabled === input.enabled) return { ok: false, kind: "conflict", sendAuthorized: false };

    // Re-evaluate CURRENT authority under row locks; caller role is never trusted.
    // Account role changes lock USER then revoke SESSION in that same order.
    const [actor] = await tx.select({
      id: users.id, role: users.role, isActive: users.isActive,
      emailVerifiedAt: users.emailVerifiedAt,
      verificationRequiredAt: users.verificationRequiredAt,
    }).from(users).where(eq(users.id, input.actorUserId)).limit(1).for("update");
    if (!actor || !canUseFullAccountSession(actor) ||
        !hasPermission(actor.role, "ADMIN_SECURITY")) return DENIED;

    const now = new Date();
    const [session] = await tx.select({
      id: sessions.id,
    }).from(sessions).where(and(
      eq(sessions.id, input.actorSessionId),
      eq(sessions.userId, actor.id),
      gt(sessions.expiresAt, now),
    )).limit(1).for("update");
    if (!session) return DENIED;

    const generation = control.generation + 1;
    const rows = await tx.update(activationMailDispatchControl).set({
      enabled: input.enabled,
      generation,
      updatedAt: now,
    }).where(and(
      eq(activationMailDispatchControl.id, 1),
      eq(activationMailDispatchControl.enabled, control.enabled),
      eq(activationMailDispatchControl.generation, control.generation),
    )).returning({ id: activationMailDispatchControl.id });
    if (rows.length !== 1) return { ok: false, kind: "conflict", sendAuthorized: false };

    // Audit is committed atomically with the switch, never best-effort.
    await tx.insert(administrativeAuditEvents).values({
      actorUserId: actor.id,
      actorRole: actor.role,
      action: "ACTIVATION_DISPATCH_CONTROL_CHANGE",
      targetType: "ACTIVATION_DISPATCH_CONTROL",
      targetId: 1,
      targetKey: "activation-mail-dispatch:1",
      details: {
        previousEnabled: control.enabled,
        enabled: input.enabled,
        previousGeneration: control.generation,
        generation,
        sendAuthorized: false,
      },
      occurredAt: now,
    });
    return { ok: true, enabled: input.enabled, generation, sendAuthorized: false };
  });
}
