/** Offline source contract for AUTH-01C2B3. No PostgreSQL connection. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();
const ci = readFileSync(join(root, ".github/workflows/ci.yml"), "utf8");
const probe = readFileSync(join(root, "scripts/auth-email-verification-c2b3-probe.ts"), "utf8");
const service = readFileSync(join(root, "src/modules/auth/email-verification-service.ts"), "utf8");

const verifyJob = ci.split("  verify:\n")[1]?.split("  windows-backup-client:\n")[0] ?? "";
const databaseJob = ci.split("  database:\n")[1]?.split("  publish:\n")[0] ?? "";

test("new verification tests run in Verify and real integration runs in disposable database job", () => {
  assert.match(verifyJob, /auth-email-verification-c2b1-contract\.test\.mjs/);
  assert.match(verifyJob, /auth-email-verification-c2b2-contract\.test\.mjs/);
  assert.match(verifyJob, /auth-email-verification-c2b3-contract\.test\.mjs/);
  assert.match(verifyJob, /email-verification-token\.test\.ts/);
  assert.match(verifyJob, /email-verification-policy\.test\.ts/);
  assert.match(databaseJob, /postgres:17-alpine/);
  assert.match(databaseJob, /node scripts\/migrate-production\.mjs/);
  assert.match(databaseJob, /node --import tsx scripts\/auth-email-verification-c2b3-probe\.ts/);
  assert.ok(databaseJob.indexOf("node scripts/migrate-production.mjs") < databaseJob.indexOf("auth-email-verification-c2b3-probe.ts"));
  assert.doesNotMatch(verifyJob, /auth-email-verification-c2b3-probe\.ts/);
});

test("probe refuses non-CI or non-disposable database before importing service", () => {
  assert.match(probe, /GITHUB_ACTIONS !== "true"/);
  assert.match(probe, /GITHUB_REPOSITORY !== "Flawden\/comic-diary"/);
  assert.match(probe, /GITHUB_WORKFLOW !== "CI"/);
  assert.match(probe, /parsed\.hostname !== "127\.0\.0\.1"/);
  assert.match(probe, /parsed\.port !== "5432"/);
  assert.match(probe, /parsed\.pathname !== "\/comic_diary_release"/);
  assert.match(probe, /parsed\.username !== "comic_diary_ci"/);
  assert.ok(probe.indexOf("const connectionString = assertDisposableCiTarget()") < probe.indexOf('await import("../src/modules/auth/email-verification-service")'));
  assert.doesNotMatch(probe, /^import (?!type ).*from ["']\.\.\/src\/modules\/auth\/email-verification-service["']/m);
});

test("integration probe covers serializability, rollback, account gates and fixture cleanup", () => {
  assert.match(probe, /Promise\.all\(\[\s*redeemEmailVerificationToken/);
  assert.match(probe, /Promise\.all\(\[\s*issueEmailVerificationForUser/);
  assert.match(probe, /addAccount\("changed-email"\)/);
  assert.match(probe, /interval '31 minutes'/);
  assert.match(probe, /password_hash = NULL/);
  assert.match(probe, /is_active = false/);
  assert.match(probe, /CREATE TRIGGER comic_diary_c2b3_block_verify_trigger/);
  assert.match(probe, /assert\.rejects\(/);
  assert.match(probe, /DROP TRIGGER IF EXISTS/);
  assert.match(probe, /DELETE FROM users WHERE id = ANY\(\$1::int\[\]\)/);
  assert.match(probe, /await pool\.end\(\)/);
  assert.match(service, /return db\.transaction/);
});
