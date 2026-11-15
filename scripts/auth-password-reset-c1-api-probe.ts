/**
 * AUTH-01C1 HTTP integration smoke. CI-only, disposable PostgreSQL 17 database.
 * No mailbox, production database or live server is contacted.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { NextRequest } from "next/server";
import { Pool } from "pg";

import { POST } from "../src/app/api/auth/password-reset/redeem/route";
import { issuePasswordResetForUser } from "../src/modules/auth/password-reset-service";
import { hashPassword, verifyPassword } from "../src/modules/auth/password";

const ORIGIN = "https://auth01-ci.example.invalid";
const PATH = `${ORIGIN}/api/auth/password-reset/redeem`;

function makeRequest(value: unknown, options: { origin?: string; ip?: string; contentType?: string } = {}): NextRequest {
  return new NextRequest(PATH, {
    method: "POST",
    headers: {
      host: new URL(ORIGIN).host,
      origin: options.origin ?? ORIGIN,
      "x-real-ip": options.ip ?? "192.0.2.101",
      "content-type": options.contentType ?? "application/json",
    },
    body: typeof value === "string" ? value : JSON.stringify(value),
  });
}

async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString || process.env.GITHUB_ACTIONS !== "true") {
    throw new Error("REFUSED: CI database required");
  }
  const target = new URL(connectionString);
  if (
    target.hostname !== "127.0.0.1" ||
    target.port !== "5432" ||
    target.pathname !== "/comic_diary_release" ||
    target.username !== "comic_diary_ci"
  ) {
    throw new Error("REFUSED: non-disposable database");
  }

  const pool = new Pool({ connectionString });
  const email = `auth01c1-${randomUUID()}@example.invalid`;
  const oldPassword = "Strong-Original-Password-123!";
  const newPassword = "Strong-Changed-Password-456!";
  let userId: number | null = null;
  const previousGate = process.env.PASSWORD_RESET_REDEEM_ENABLED;
  const previousOrigin = process.env.COMIC_DIARY_PUBLIC_ORIGIN;

  try {
    const created = await pool.query<{ id: number }>(
      "INSERT INTO users (email, password_hash, role, is_active) VALUES ($1, $2, 'USER', true) RETURNING id",
      [email, await hashPassword(oldPassword)],
    );
    userId = created.rows[0].id;

    const issued = await issuePasswordResetForUser(userId);
    assert.equal(issued.ok, true);
    if (!issued.ok) throw new Error("token issuance failed");

    const body = { token: issued.token, newPassword, newPasswordConfirm: newPassword };
    process.env.COMIC_DIARY_PUBLIC_ORIGIN = ORIGIN;

    delete process.env.PASSWORD_RESET_REDEEM_ENABLED;
    const disabled = await POST(makeRequest(body));
    assert.equal(disabled.status, 503);
    assert.equal(disabled.headers.get("cache-control"), "no-store");
    assert.equal((await disabled.json()).error, "recovery_unavailable");

    process.env.PASSWORD_RESET_REDEEM_ENABLED = "true";
    assert.equal((await POST(makeRequest(body, { origin: "https://forged.example.invalid" }))).status, 403);
    assert.equal((await POST(makeRequest(body, { contentType: "text/plain" }))).status, 415);
    assert.equal((await POST(makeRequest("not json"))).status, 400);
    assert.equal((await POST(makeRequest({ ...body, ignored: true }))).status, 400);
    assert.equal((await POST(makeRequest({ ...body, newPasswordConfirm: "wrong" }))).status, 400);

    const success = await POST(makeRequest(body));
    assert.equal(success.status, 200);
    assert.deepEqual(await success.json(), { ok: true });
    assert.equal(success.headers.get("cache-control"), "no-store");
    assert.equal(success.headers.get("referrer-policy"), "no-referrer");
    assert.match(success.headers.get("set-cookie") ?? "", /comic_diary_session=/);

    const changed = await pool.query<{ password_hash: string }>(
      "SELECT password_hash FROM users WHERE id = $1", [userId],
    );
    assert.equal(await verifyPassword(changed.rows[0].password_hash, newPassword), true);
    assert.equal(await verifyPassword(changed.rows[0].password_hash, oldPassword), false);

    const reused = await POST(makeRequest(body));
    assert.equal(reused.status, 400);
    assert.equal((await reused.json()).error, "invalid_or_expired_token");

    // Separate bucket: 12 attempts allowed, subsequent attempts fail with 429.
    for (let i = 0; i < 12; i += 1) {
      const invalid = await POST(makeRequest({ ...body, token: "x".repeat(43) }, { ip: "192.0.2.102" }));
      assert.equal(invalid.status, 400);
    }
    const throttled = await POST(makeRequest(body, { ip: "192.0.2.102" }));
    assert.equal(throttled.status, 429);
    assert.ok(Number(throttled.headers.get("retry-after")) > 0);
    console.log("AUTH01C1_HTTP_DISABLED_BY_DEFAULT=PASS");
    console.log("AUTH01C1_HTTP_SECURITY_AND_INPUT=PASS");
    console.log("AUTH01C1_HTTP_REDEEM_AND_ONE_TIME=PASS");
    console.log("AUTH01C1_HTTP_RATE_LIMIT=PASS");
  } finally {
    if (previousGate === undefined) delete process.env.PASSWORD_RESET_REDEEM_ENABLED;
    else process.env.PASSWORD_RESET_REDEEM_ENABLED = previousGate;
    if (previousOrigin === undefined) delete process.env.COMIC_DIARY_PUBLIC_ORIGIN;
    else process.env.COMIC_DIARY_PUBLIC_ORIGIN = previousOrigin;
    try {
      if (userId !== null) await pool.query("DELETE FROM users WHERE id = $1 AND email = $2", [userId, email]);
    } finally {
      await pool.end();
    }
  }
}

main().then(
  () => process.exit(0),
  (error: unknown) => {
    console.error("AUTH01C1_API_PROBE_FAILED", error);
    process.exit(1);
  },
);
