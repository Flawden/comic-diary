import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const service = readFileSync("src/modules/auth/password-reset-service.ts", "utf8");
const ownChange = readFileSync("src/modules/auth/password-change-service.ts", "utf8");
const ci = readFileSync(".github/workflows/ci.yml", "utf8");
const probe = readFileSync("scripts/auth-password-reset-probe.ts", "utf8");

test("issuance locks the user before revoking old open records and inserting", () => {
  const locking = service.indexOf('.for("update")');
  const revoking = service.indexOf('.set({ revokedAt: now })');
  const inserting = service.indexOf('.insert(passwordResetTokens)');
  assert.ok(locking > 0 && revoking > locking && inserting > revoking);
  assert.match(service, /return db\.transaction/);
});

test("redeeming is atomic with locked user and token, password change, and session deletion", () => {
  assert.match(service, /const candidates = await tx[\s\S]+?const accounts = await tx/);
  assert.match(service, /\.for\("update"\)[\s\S]+\.for\("update"\)/);
  assert.match(service, /isPasswordResetTokenExpired/);
  assert.match(service, /\.set\(\{ consumedAt: now \}\)/);
  assert.match(service, /\.set\(\{ passwordHash, updatedAt: now \}\)/);
  assert.match(service, /\.delete\(sessions\)/);
});

test("ordinary password changes revoke outstanding recovery tokens", () => {
  assert.match(ownChange, /\.update\(passwordResetTokens\)/);
  assert.match(ownChange, /isNull\(passwordResetTokens\.consumedAt\)/);
  assert.match(ownChange, /isNull\(passwordResetTokens\.revokedAt\)/);
});

test("CI explicitly runs token, schema, B2 contract and disposable PostgreSQL probes", () => {
  assert.match(ci, /node --import tsx --test src\/modules\/auth\/password-reset-token\.test\.ts/);
  assert.match(ci, /node --test scripts\/auth-password-reset-schema-contract\.test\.mjs/);
  assert.match(ci, /node --test scripts\/auth-password-reset-b2-contract\.test\.mjs/);
  assert.match(ci, /node --import tsx scripts\/auth-password-reset-probe\.ts/);
  assert.match(probe, /GITHUB_ACTIONS.*"true"/);
  assert.match(probe, /comic_diary_release/);
  assert.match(probe, /Promise\.all/);
});
