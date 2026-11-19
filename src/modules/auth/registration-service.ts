import { activationRegistrationOperational, readActivationDispatchConfig } from "./registration-activation-config";
import { enqueuePendingActivationMailInTransaction } from "./registration-activation-outbox-issue";
import { needsSecurePendingActivation } from "./registration-activation-policy";
import { canIssueEmailVerification } from "./email-verification-policy";
import {
  eq, and, gte, sql,
} from "drizzle-orm";

import {
  db,
} from "@/db";

import {
  users, activationMailDispatchControl, emailVerificationTokens,
} from "@/db/schema";

import {
  normalizeLoginIdentifier,
} from "./login-identifier";

import {
  hashPassword,
} from "./password";

const REGISTRATION_PASSWORD_MIN_CHARACTERS =
  10;

const REGISTRATION_PASSWORD_MAX_BYTES =
  256;

export function normalizeRegistrationEmail(
  value: string,
): string | null {
  const email =
    normalizeLoginIdentifier(
      value,
    );

  if (
    !email ||
    email.length > 320 ||
    !/^[^\s@]+@[^\s@]+$/.test(
      email,
    )
  ) {
    return null;
  }

  return email;
}

export function isRegistrationPasswordAllowed(
  password: string,
): boolean {
  if (
    password.length <
      REGISTRATION_PASSWORD_MIN_CHARACTERS ||
    password.trim().length ===
      0
  ) {
    return false;
  }

  return (
    Buffer.byteLength(
      password,
      "utf8",
    ) <=
    REGISTRATION_PASSWORD_MAX_BYTES
  );
}

/** Public composition: CONTROL -> USER -> TOKEN -> OUTBOX, one atomic commit.
 * Generic acknowledgement for existing identities. Never replace their password.
 * A manual fresh issuance is distinct from retrying any old dispatch attempt.
 */
export async function registerPasswordUser(
  rawEmail: string, password: string | null,
): Promise<{ ok: true } | { ok: false; kind: "invalid_email" | "weak_password" | "registration_unavailable" }> {
  const email = normalizeRegistrationEmail(rawEmail);
  if (!email) return { ok: false, kind: "invalid_email" };
  if (password !== null && !isRegistrationPasswordAllowed(password)) return { ok: false, kind: "weak_password" };
  if (!activationRegistrationOperational(process.env)) return { ok: false, kind: "registration_unavailable" };
  const config = readActivationDispatchConfig(process.env);
  if (!config) return { ok: false, kind: "registration_unavailable" };
  try {
    // Equal work for new and existing registration addresses; no duplicate fast path.
    const passwordHash = password === null ? null : await hashPassword(password);
    return await db.transaction(async tx => {
      const [gate] = await tx.select().from(activationMailDispatchControl)
        .where(eq(activationMailDispatchControl.id, 1)).for("share");
      if (!gate?.enabled || gate.generation <= 0) return { ok: false, kind: "registration_unavailable" } as const;
      if (passwordHash) {
        await tx.insert(users).values({ email, passwordHash, role: "USER", isActive: true,
          verificationRequiredAt: new Date() }).onConflictDoNothing({ target: users.email });
      }
      const [account] = await tx.select().from(users).where(eq(users.email, email)).for("update");
      if (!account || !needsSecurePendingActivation(account) || !canIssueEmailVerification(account)) return { ok: true } as const;
      // Serialize per account. Suppress bursts without invalidating the first email.
      const recent = await tx.select({ count: sql<number>`count(*)::int`, newest: sql<Date | null>`max(${emailVerificationTokens.createdAt})` })
        .from(emailVerificationTokens).where(and(eq(emailVerificationTokens.userId, account.id),
          gte(emailVerificationTokens.createdAt, new Date(Date.now() - 3600_000))));
      if (recent[0].count >= 5 || (recent[0].newest && Date.now() - new Date(recent[0].newest).getTime() < 60_000)) return { ok: true } as const;
      const queued = await enqueuePendingActivationMailInTransaction(tx, {
        userId: account.id, publicOrigin: config.publicOrigin, key: config.key,
      });
      if (!queued.ok) throw new Error("Activation issuance unavailable");
      return { ok: true } as const;
    });
  } catch { return { ok: false, kind: "registration_unavailable" }; }
  finally { config.key.bytes.fill(0); }
}
