import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error TS5097: direct Node strip-types requires .ts extension; CI uses tsx.
import { prepareRecoveryResendTestRequest as prepare, submitRecoveryResendTestOnce as send } from "./password-reset-request-resend-test-adapter.ts";

const token = Buffer.alloc(32, 51).toString("base64url");
const idem = Buffer.alloc(24, 83).toString("base64url");
const origin = "https://reader.example.invalid";
const config = { fromAddress: "no-reply@example.invalid", senderDomain: "example.invalid", publicOrigin: origin };
const mail = { to: "reader@example.invalid", subject: "Comic Diary — восстановление пароля", text: `Your code: ${token}\n${origin}/reset-password`, recoveryPageUrl: `${origin}/reset-password` };
const uuid = "22222222-aaaa-4444-8888-cccccccccccc";
const apiKey = "re_" + "a".repeat(32);
const candidate = prepare(config, mail, idem);
assert.ok(candidate);
const allowed = () => ({ operatorTestPermit: "EXPLICIT_ONE_TEST_EMAIL" as const, allowedTestRecipient: mail.to, expectedFromAddress: config.fromAddress, expectedPublicOrigin: origin, apiKey, request: candidate });
const accepted = { classification: "accepted", attempted: true, sendAuthorized: false, retryAuthorized: false };
const rejected = { classification: "rejected", attempted: true, sendAuthorized: false, retryAuthorized: false };
const uncertain = { classification: "uncertain", attempted: true, sendAuthorized: false, retryAuthorized: false };
const blocked = { classification: "blocked", attempted: false, sendAuthorized: false, retryAuthorized: false };
test("pure request: exact endpoint, one mailbox, text only, same outbox idempotency key", () => {
  assert.deepEqual(Object.keys(candidate).sort(), ["endpoint", "idempotencyKey", "method", "payload"]);
  assert.equal(candidate.endpoint, "https://api.resend.com/emails");
  assert.equal(candidate.method, "POST");
  assert.equal(candidate.idempotencyKey, idem);
  assert.deepEqual(candidate.payload.to, [mail.to]);
  assert.deepEqual(Object.keys(candidate.payload).sort(), ["from", "subject", "text", "to"]);
});
test("no code in URL, idempotency, from or subject", () => {
  assert.ok(candidate.payload.text.includes(token));
  for (const value of [candidate.endpoint, candidate.idempotencyKey, candidate.payload.from, candidate.payload.subject, mail.recoveryPageUrl])
    assert.ok(!value.includes(token));
});
test("invalid origin/sender/recipient/extra properties fail closed", () => {
  assert.equal(prepare({ ...config, publicOrigin: "http://reader.example.invalid" }, mail, idem), null);
  assert.equal(prepare({ ...config, fromAddress: "no-reply@evil.invalid" }, mail, idem), null);
  assert.equal(prepare(config, { ...mail, to: "evil@example.invalid\nBcc:evil@example.invalid" }, idem), null);
  assert.equal(prepare(config, { ...mail, bcc: "evil@example.invalid" } as never, idem), null);
  assert.equal(prepare(config, { ...mail, text: mail.text + "\rBcc:evil@example.invalid" }, idem), null);
});
test("wrong or remapped idempotency keys rejected", () => {
  for (const key of ["", token, "recovery/"+idem, idem+"=", Buffer.alloc(23).toString("base64url")]) assert.equal(prepare(config, mail, key), null);
});
test("recipient must match exact operator test mailbox, no network on blocked", async () => {
  let calls = 0;
  const http = async () => { calls++; return { status: 201, json: async () => ({ id: uuid }) }; };
  assert.deepEqual(await send({ ...allowed(), allowedTestRecipient: "another@example.invalid", http }), blocked);
  assert.equal(calls, 0);
});
test("missing exact operator permit blocks without network", async () => {
  let calls = 0;
  const http = async () => { calls++; return { status: 201, json: async () => ({ id: uuid }) }; };
  assert.deepEqual(await send({ ...allowed(), operatorTestPermit: "false" as never, http }), blocked);
  assert.equal(calls, 0);
});
test("sender and trusted origin pinned before network", async () => {
  let calls = 0;
  const http = async () => { calls++; return { status: 201, json: async () => ({ id: uuid }) }; };
  assert.deepEqual(await send({ ...allowed(), expectedFromAddress: "evil@invalid.example", http }), blocked);
  assert.deepEqual(await send({ ...allowed(), expectedPublicOrigin: "https://evil.example", http }), blocked);
  assert.equal(calls, 0);
});
test("missing credentials and absent injected HTTP block before network", async () => {
  let calls = 0;
  const http = async () => { calls++; return { status: 201, json: async () => ({ id: uuid }) }; };
  assert.deepEqual(await send({ ...allowed(), apiKey: "", http }), blocked);
  assert.deepEqual(await send({ ...allowed(), http: undefined as never }), blocked);
  assert.equal(calls, 0);
});
test("one mock HTTP call only; pinned endpoint, safe headers, no retries", async () => {
  let calls = 0;
  const http = async (url: string, init: { method: string; redirect: string; headers: Readonly<Record<string, string>>; body: string; signal: AbortSignal }) => {
    calls++;
    assert.equal(url, "https://api.resend.com/emails");
    assert.equal(init.method, "POST");
    assert.equal(init.redirect, "error");
    assert.equal(init.headers["Idempotency-Key"], idem);
    assert.equal(init.headers.Authorization, `Bearer ${apiKey}`);
    assert.deepEqual(JSON.parse(init.body), candidate.payload);
    assert.ok(init.signal instanceof AbortSignal);
    return { status: 201, json: async () => ({ id: uuid }) };
  };
  assert.deepEqual(await send({ ...allowed(), http }), accepted);
  assert.equal(calls, 1);
});
test("200 and 201 only with a valid id mean provider accepted request", async () => {
  for (const status of [200,201]) {
    const http = async () => ({ status, json: async () => ({ id: uuid }) });
    assert.deepEqual(await send({ ...allowed(), http }), accepted);
  }
});
test("definitive HTTP client errors are rejected without response body", async () => {
  for (const status of [400,401,403,404,422]) {
    const http = async () => ({ status, json: async () => { throw Error("body should not be read"); } });
    assert.deepEqual(await send({ ...allowed(), http }), rejected);
  }
});
test("429, 409, 5xx and other statuses are uncertain (no retries)", async () => {
  for (const status of [202,204,408,409,429,500,502,503,504]) {
    let calls = 0;
    const http = async () => {calls++; return { status, json: async () => ({id:uuid})};};
    assert.deepEqual(await send({ ...allowed(), http }), uncertain);
    assert.equal(calls, 1);
  }
});
test("timeout, malformed reply or JSON failure is uncertain and never retried", async () => {
  const transports = [
    async () => { throw Error("token or recipient appeared in provider error"); },
    async () => ({ status: 200, json: async () => ({ id: "bad" }) }),
    async () => ({ status: 200, json: async () => ({ id: uuid, extra: "bad" }) }),
    async () => ({ status: 200, json: async () => { throw Error("broken JSON"); } }),
  ];
  for (const http of transports) assert.deepEqual(await send({ ...allowed(), http }), uncertain);
});
test("no sensitive data, remote body or credential in function result", async () => {
  for (const http of [
    async () => ({ status: 201, json: async () => ({ id: uuid }) }),
    async () => { throw Error(apiKey + token + mail.to); },
  ]) {
    const result = await send({ ...allowed(), http });
    assert.equal(result.sendAuthorized, false);
    assert.equal(result.retryAuthorized, false);
    assert.equal(Object.isFrozen(result), true);
    assert.deepEqual(Object.keys(result).sort(), ["attempted", "classification", "retryAuthorized", "sendAuthorized"]);
    assert.ok(!JSON.stringify(result).includes(apiKey));
    assert.ok(!JSON.stringify(result).includes(token));
    assert.ok(!JSON.stringify(result).includes(mail.to));
  }
});
