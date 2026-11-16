import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();
const service = readFileSync(join(root, "src/modules/auth/email-verification-service.ts"), "utf8");
const policy = readFileSync(join(root, "src/modules/auth/email-verification-policy.ts"), "utf8");
const schema = readFileSync(join(root, "src/db/schema.ts"), "utf8");

test("C2B2 is internal-only: two service entrypoints, no routes/mail/sessions", () => {
  assert.match(service, /export async function issueEmailVerificationForUser\(/);
  assert.match(service, /export async function redeemEmailVerificationToken\(/);
  assert.equal((service.match(/export async function /g) ?? []).length, 2);
  assert.doesNotMatch(service, /\b(fetch|sendMail|sendEmail|createSession|cookies)\s*\(/);
  assert.doesNotMatch(service, /from ["']next\//);
  assert.doesNotMatch(service, /\.(insert|delete|update)\(sessions\)/);
  assert.match(schema, /export const emailVerificationTokens = pgTable/);
});

test("issuance uses a transaction, account lock, old revocation, then insertion", () => {
  const issue = service.split("export async function issueEmailVerificationForUser(")[1].split("export async function redeemEmailVerificationToken(")[0];
  assert.match(issue, /return db\.transaction\(/);
  assert.match(issue, /Number\.isSafeInteger\(userId\)/);
  assert.match(issue, /\.for\("update"\)/);
  assert.match(issue, /canIssueEmailVerification\(account\)/);
  assert.match(issue, /emailSnapshot:\s*account\.email/);
  assert.match(issue, /tokenHash:\s*issued\.tokenHash/);
  assert.ok(issue.indexOf(".set({ revokedAt: now })") < issue.indexOf(".insert(emailVerificationTokens)"));
});

test("redeem rechecks the secret after acquiring USER then TOKEN locks", () => {
  const redeem = service.split("export async function redeemEmailVerificationToken(")[1];
  assert.match(redeem, /hashEmailVerificationToken\(token\)/);
  assert.match(redeem, /return db\.transaction\(/);
  assert.match(redeem, /\.where\(eq\(users\.id, candidate\.userId\)\)/);
  assert.equal((redeem.match(/\.for\("update"\)/g) ?? []).length, 2);
  assert.ok(redeem.indexOf(".from(users)") < redeem.indexOf(".from(emailVerificationTokens)\n      .where(eq(emailVerificationTokens.tokenHash, tokenHash))\n      .limit(1)\n      .for(\"update\")"));
  assert.match(redeem, /canRedeemEmailVerification\(account, challenge, now\)/);
});

test("consumption and verification occur in the SAME transaction with guards", () => {
  const redeem = service.split("export async function redeemEmailVerificationToken(")[1];
  assert.match(redeem, /\.set\(\{ consumedAt: now \}\)/);
  assert.match(redeem, /\.set\(\{ emailVerifiedAt: now, updatedAt: now \}\)/);
  assert.match(redeem, /isNull\(users\.emailVerifiedAt\)/);
  assert.match(redeem, /eq\(users\.email, account\.email\)/);
  assert.match(redeem, /throw new Error\("Email-verification account update did not persist"\)/);
  assert.match(redeem, /return \{ ok: true \}/);
});

test("policy preserves password-only and exact-address gates", () => {
  assert.match(policy, /account\.emailVerifiedAt === null/);
  assert.match(policy, /account\.emailSnapshot === account\.email|challenge\.emailSnapshot === account\.email/);
  assert.match(policy, /account\.passwordHash/);
  assert.match(policy, /challenge\.consumedAt === null/);
  assert.match(policy, /challenge\.revokedAt === null/);
  assert.match(policy, /current < expires/);
});
