/** Operator-only audited gate transition. CONTROL -> USER -> SESSION -> AUDIT.
 * ON requires complete runtime readiness and current ADMIN_SECURITY authority.
 * OFF blocks new starts but cannot recall a start already committed before OFF.
 * The response is status only, never an HTTP permit or reservation receipt.
 */
import { and, eq, gt } from "drizzle-orm";
import { db } from "@/db";
import { activationMailDispatchControl, administrativeAuditEvents, sessions, users } from "@/db/schema";
import { hasPermission } from "./permissions";
import { canUseFullAccountSession } from "./registration-activation-policy";

import { activationDispatchOperational } from "./registration-activation-config";

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
  if (input.enabled && (process.env.AUTH_ACTIVATION_OPERATOR_CONTROL_ENABLED !== "true" || !activationDispatchOperational(process.env))) return DENIED;

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
