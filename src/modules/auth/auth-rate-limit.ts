import {
  createHash,
} from "node:crypto";

import {
  and,
  eq,
  sql,
} from "drizzle-orm";

import {
  db,
} from "@/db";

import {
  authRateLimits,
} from "@/db/schema";

export const REGISTRATION_RATE_LIMIT_SCOPE =
  "registration-ip-v1";

export const REGISTRATION_RATE_LIMIT_MAX_REQUESTS =
  10;

export const REGISTRATION_RATE_LIMIT_WINDOW_MS =
  15 * 60 * 1000;

export const LOGIN_RATE_LIMIT_SCOPE =
  "login-ip-v1";

export const LOGIN_RATE_LIMIT_MAX_REQUESTS =
  20;

export const LOGIN_RATE_LIMIT_WINDOW_MS =
  15 * 60 * 1000;

export type AuthRateLimitDecision = {
  allowed: boolean;
  requestCount: number;
  remaining: number;
  retryAfterSeconds: number;
  windowEndsAt: Date;
};

type ConsumeAuthRateLimitInput = {
  scope: string;
  identity: string;
  maxRequests: number;
  windowMs: number;
  now?: Date;
};

function assertRateLimitInput(
  input:
    ConsumeAuthRateLimitInput,
): void {
  if (
    input.scope.trim() ===
      "" ||
    input.scope.length >
      80
  ) {
    throw new Error(
      "Invalid rate-limit scope",
    );
  }

  if (
    input.identity.trim() ===
      ""
  ) {
    throw new Error(
      "Invalid rate-limit identity",
    );
  }

  if (
    !Number.isInteger(
      input.maxRequests,
    ) ||
    input.maxRequests <
      1
  ) {
    throw new Error(
      "Invalid rate-limit maximum",
    );
  }

  if (
    !Number.isInteger(
      input.windowMs,
    ) ||
    input.windowMs <
      1
  ) {
    throw new Error(
      "Invalid rate-limit window",
    );
  }
}

export function hashRateLimitIdentity(
  scope: string,
  identity: string,
): string {
  return createHash(
    "sha256",
  )
    .update(
      `${scope}\0${identity}`,
      "utf8",
    )
    .digest(
      "hex",
    );
}

function decision(
  requestCount: number,
  maxRequests: number,
  windowEndsAt: Date,
  now: Date,
): AuthRateLimitDecision {
  const allowed =
    requestCount <=
    maxRequests;

  const remaining =
    Math.max(
      0,
      maxRequests -
        requestCount,
    );

  const retryAfterSeconds =
    allowed
      ? 0
      : Math.max(
          1,
          Math.ceil(
            (
              windowEndsAt.getTime() -
              now.getTime()
            ) /
              1000,
          ),
        );

  return {
    allowed,
    requestCount,
    remaining,
    retryAfterSeconds,
    windowEndsAt,
  };
}

/**
 * Shared persistent fixed-window limiter.
 *
 * Concurrency for one logical bucket is serialized by a
 * PostgreSQL transaction-scoped advisory lock. The durable
 * row is then selected and updated while the lock is held.
 *
 * The database stores only a SHA-256 key derived from scope
 * and identity. Raw client IP values are not persisted here.
 */
export async function consumeAuthRateLimit(
  input:
    ConsumeAuthRateLimitInput,
): Promise<AuthRateLimitDecision> {
  assertRateLimitInput(
    input,
  );

  const now =
    input.now ??
    new Date();

  const scope =
    input.scope.trim();

  const keyHash =
    hashRateLimitIdentity(
      scope,
      input.identity,
    );

  return db.transaction(
    async (
      tx,
    ): Promise<AuthRateLimitDecision> => {
      await tx.execute(
        sql`
          SELECT pg_advisory_xact_lock(
            hashtext(${scope}),
            hashtext(${keyHash})
          )
        `,
      );

      const rows =
        await tx
          .select({
            id:
              authRateLimits.id,

            windowStartedAt:
              authRateLimits.windowStartedAt,

            requestCount:
              authRateLimits.requestCount,
          })
          .from(
            authRateLimits,
          )
          .where(
            and(
              eq(
                authRateLimits.scope,
                scope,
              ),
              eq(
                authRateLimits.keyHash,
                keyHash,
              ),
            ),
          )
          .limit(
            1,
          );

      const current =
        rows[0];

      if (!current) {
        await tx
          .insert(
            authRateLimits,
          )
          .values({
            scope,
            keyHash,
            windowStartedAt:
              now,
            requestCount:
              1,
            updatedAt:
              now,
          });

        return decision(
          1,
          input.maxRequests,
          new Date(
            now.getTime() +
              input.windowMs,
          ),
          now,
        );
      }

      const currentWindowEndsAt =
        new Date(
          current.windowStartedAt.getTime() +
            input.windowMs,
        );

      if (
        now.getTime() >=
        currentWindowEndsAt.getTime()
      ) {
        await tx
          .update(
            authRateLimits,
          )
          .set({
            windowStartedAt:
              now,
            requestCount:
              1,
            updatedAt:
              now,
          })
          .where(
            eq(
              authRateLimits.id,
              current.id,
            ),
          );

        return decision(
          1,
          input.maxRequests,
          new Date(
            now.getTime() +
              input.windowMs,
          ),
          now,
        );
      }

      const nextRequestCount =
        current.requestCount +
        1;

      await tx
        .update(
          authRateLimits,
        )
        .set({
          requestCount:
            nextRequestCount,
          updatedAt:
            now,
        })
        .where(
          eq(
            authRateLimits.id,
            current.id,
          ),
        );

      return decision(
        nextRequestCount,
        input.maxRequests,
        currentWindowEndsAt,
        now,
      );
    },
  );
}

export async function consumeRegistrationRateLimit(
  clientIp: string,
  now?: Date,
): Promise<AuthRateLimitDecision> {
  return consumeAuthRateLimit({
    scope:
      REGISTRATION_RATE_LIMIT_SCOPE,
    identity:
      clientIp,
    maxRequests:
      REGISTRATION_RATE_LIMIT_MAX_REQUESTS,
    windowMs:
      REGISTRATION_RATE_LIMIT_WINDOW_MS,
    now,
  });
}


export async function consumeLoginRateLimit(
  clientIp: string,
  now?: Date,
): Promise<AuthRateLimitDecision> {
  return consumeAuthRateLimit({
    scope:
      LOGIN_RATE_LIMIT_SCOPE,
    identity:
      clientIp,
    maxRequests:
      LOGIN_RATE_LIMIT_MAX_REQUESTS,
    windowMs:
      LOGIN_RATE_LIMIT_WINDOW_MS,
    now,
  });
}
