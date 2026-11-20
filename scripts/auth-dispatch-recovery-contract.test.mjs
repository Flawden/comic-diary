import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const source = readFileSync("src/modules/auth/password-reset-dispatch.ts", "utf8");
const recovery = source.slice(source.indexOf("export async function recoverAbandonedPasswordResetDispatches"), source.indexOf("export function startPasswordResetWorker"));
const integration = readFileSync("scripts/auth-dispatch-integration.test.ts", "utf8");
const ci = readFileSync(".github/workflows/ci.yml", "utf8");

test("abandoned discovery and conditional UPDATE share the start-aware SQL predicate", () => {
  assert.match(recovery, /const cutoff = new Date\(Date.now\(\) - 5 \* 60_000\)/);
  assert.match(recovery, /and\(isNull\(outboxTable.dispatchStartedAt\), lte\(outboxTable.claimedAt, cutoff\)\)/);
  assert.match(recovery, /and\(isNotNull\(outboxTable.dispatchStartedAt\), lte\(outboxTable.dispatchStartedAt, cutoff\)\)/);
  assert.equal((recovery.match(/eq\(outboxTable.state, "in_flight"\), abandoned/g) ?? []).length, 2);
  assert.match(recovery, /tx.update\(outboxTable\)[\s\S]*\.where\(and\(eq\(outboxTable.id, item.id\), eq\(outboxTable.state, "in_flight"\), abandoned\)\)/);
});

test("recovery preserves lock order and terminal-only accounting", () => {
  const control = recovery.indexOf("from(controlTable)");
  const user = recovery.indexOf("from(users)");
  const token = recovery.indexOf("from(passwordResetTokens)", recovery.indexOf("db.transaction"));
  const update = recovery.indexOf("tx.update(outboxTable)");
  assert.ok(control > 0 && control < user && user < token && token < update);
  assert.match(recovery, /set\(\{ state: "uncertain", finalizedAt:/);
  assert.doesNotMatch(recovery, /submitOnce|fetch\(|state: "ready"|attemptCount:/);
});

test("CI executes the recovery contract and full independent-connection mock integration suite", () => {
  assert.match(ci, /node --test scripts\/auth-dispatch-recovery-contract.test.mjs/);
  assert.match(ci, /run: node --import tsx --test scripts\/auth-dispatch-integration.test.ts/);
  for (const scenario of ["Round 2.3 A/G:", "Round 2.3 B/C/F:", "Round 2.3 D:", "Round 2.3 E:"]) assert.ok(integration.includes(scenario));
  assert.match(integration, /pg_blocking_pids/);
  assert.match(integration, /for \(const first of \["start", "recovery"\]/);
  assert.match(integration, /for \(const classification of \["accepted", "rejected", "uncertain"\]/);
});
