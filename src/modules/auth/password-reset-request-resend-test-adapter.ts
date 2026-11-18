/**
 * AUTH-01 / R1C2C5 — explicitly isolated ONE-SHOT TEST adapter for Resend.
 * No environment, DB, operator control, credentials lookup, real fetch default,
 * routes, logger, retries, background worker, or production delivery wiring.
 * A candidate or test permit is NOT proof of durable dispatch authorization.
 * Do not wire this to public auth routes. Real dispatch requires separately
 * reviewed operator orchestration and manually approved test destination.
 */
export type ResendRecoveryMail = Readonly<{
  to: string; subject: string; text: string; recoveryPageUrl: string;
}>;
export type ResendRecoverySender = Readonly<{
  fromAddress: string; senderDomain: string; publicOrigin: string;
}>;
export type ResendRecoveryTestRequest = Readonly<{
  endpoint: "https://api.resend.com/emails";
  method: "POST";
  idempotencyKey: string;
  payload: Readonly<{
    from: string; to: readonly [string]; subject: string; text: string;
  }>;
}>;
export type ResendRecoveryResult = Readonly<{
  classification: "blocked" | "accepted" | "rejected" | "uncertain";
  attempted: boolean;
  sendAuthorized: false;
  retryAuthorized: false;
}>;
export type ResendTestHttpResponse = Readonly<{
  status: number;
  json: () => Promise<unknown>;
}>;
export type ResendTestHttp = (
  url: string,
  init: Readonly<{
    method: "POST";
    redirect: "error";
    headers: Readonly<Record<string, string>>;
    body: string;
    signal: AbortSignal;
  }>,
) => Promise<ResendTestHttpResponse>;

const ENDPOINT = "https://api.resend.com/emails" as const;
const KEY_RE = /^[A-Za-z0-9_-]{32}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BLOCKED: ResendRecoveryResult = Object.freeze({ classification: "blocked", attempted: false, sendAuthorized: false, retryAuthorized: false });
const ACCEPTED: ResendRecoveryResult = Object.freeze({ classification: "accepted", attempted: true, sendAuthorized: false, retryAuthorized: false });
const REJECTED: ResendRecoveryResult = Object.freeze({ classification: "rejected", attempted: true, sendAuthorized: false, retryAuthorized: false });
const UNCERTAIN: ResendRecoveryResult = Object.freeze({ classification: "uncertain", attempted: true, sendAuthorized: false, retryAuthorized: false });

function exact(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value) ||
      Object.getPrototypeOf(value) !== Object.prototype) return false;
  const current = Object.keys(value).sort();
  const expected = [...keys].sort();
  return current.length === expected.length && current.every((x, i) => x === expected[i]);
}
function canonicalKey(value: unknown): value is string {
  if (typeof value !== "string" || !KEY_RE.test(value)) return false;
  const bytes = Buffer.from(value, "base64url");
  return bytes.length === 24 && bytes.toString("base64url") === value;
}
function domain(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 253 || value.length < 4 ||
      value !== value.toLowerCase() || !/^[a-z0-9.-]+$/.test(value)) return false;
  const parts = value.split(".");
  return parts.length >= 2 && parts.every((p) => p.length > 0 && p.length <= 63 &&
    /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(p)) &&
    (/^[a-z]{2,63}$/.test(parts[parts.length - 1]) || /^xn--[a-z0-9-]{2,59}$/.test(parts[parts.length - 1]));
}
function recipient(value: unknown): value is string {
  return typeof value === "string" && value.length >= 4 && value.length <= 320 &&
    Buffer.byteLength(value, "utf8") <= 320 &&
    !/[\x00-\x20\x7f\s<>,;:()\[\]"\\]/.test(value) &&
    /^[^@]+@[^@]+$/.test(value);
}
function origin(value: unknown): string | null {
  if (typeof value !== "string" || value !== value.trim() || value.length > 2048) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !!url.hostname && !url.username && !url.password &&
      url.pathname === "/" && !url.search && !url.hash && value === url.origin
      ? url.origin : null;
  } catch { return null; }
}
function fromAddress(value: unknown, senderDomain: string): value is string {
  if (typeof value !== "string" || value.length > 254) return false;
  const parts = value.split("@");
  return parts.length === 2 && parts[1] === senderDomain &&
    parts[0].length > 0 && parts[0].length <= 64 &&
    /^[A-Za-z0-9](?:[A-Za-z0-9._+%-]*[A-Za-z0-9])?$/.test(parts[0]) &&
    !parts[0].includes("..");
}

/** Pure builder; must receive the persisted 24-byte outbox idempotency key. */
export function prepareRecoveryResendTestRequest(
  config: ResendRecoverySender,
  message: ResendRecoveryMail,
  idempotencyKey: string,
): ResendRecoveryTestRequest | null {
  try {
    if (!exact(config, ["fromAddress", "senderDomain", "publicOrigin"]) ||
        !exact(message, ["to", "subject", "text", "recoveryPageUrl"]) ||
        !canonicalKey(idempotencyKey) || !domain(config.senderDomain) ||
        !fromAddress(config.fromAddress, config.senderDomain) || !recipient(message.to)) return null;
    const safeOrigin = origin(config.publicOrigin);
    if (!safeOrigin || message.recoveryPageUrl !== `${safeOrigin}/reset-password`) return null;
    if (typeof message.subject !== "string" || message.subject.length < 1 || message.subject.length > 150 ||
        /[\x00-\x1f\x7f\u2028\u2029]/.test(message.subject)) return null;
    if (typeof message.text !== "string" || message.text.length < 1 || message.text.length > 8192 ||
        /[\x00-\x09\x0b-\x1f\x7f\r]/.test(message.text)) return null;
    const links = message.text.match(/https?:\/\/[^\s]+/g) ?? [];
    if (links.length !== 1 || links[0] !== message.recoveryPageUrl) return null;
    return Object.freeze({
      endpoint: ENDPOINT,
      method: "POST" as const,
      idempotencyKey,
      payload: Object.freeze({
        from: config.fromAddress,
        to: Object.freeze([message.to]) as readonly [string],
        subject: message.subject,
        text: message.text,
      }),
    });
  } catch { return null; }
}

function validatedCandidate(
  request: unknown, expectedFromAddress: string, expectedPublicOrigin: string,
): request is ResendRecoveryTestRequest {
  try {
    if (!exact(request, ["endpoint", "method", "idempotencyKey", "payload"]) ||
        request.endpoint !== ENDPOINT || request.method !== "POST" ||
        !canonicalKey(request.idempotencyKey) ||
        !exact(request.payload, ["from", "to", "subject", "text"])) return false;
    const payload = request.payload;
    if (!Array.isArray(payload.to) || payload.to.length !== 1 || !recipient(payload.to[0]) ||
        typeof payload.from !== "string" || payload.from.length > 254 ||
        typeof payload.subject !== "string" || payload.subject.length < 1 ||
        payload.subject.length > 150 || /[\x00-\x1f\x7f]/.test(payload.subject) ||
        typeof payload.text !== "string" || payload.text.length < 1 ||
        payload.text.length > 8192 || /[\x00-\x09\x0b-\x1f\x7f\r]/.test(payload.text)) return false;
    const fromParts = payload.from.split("@");
    if (fromParts.length !== 2 || !domain(fromParts[1]) || !fromAddress(payload.from, fromParts[1]) ||
        payload.from !== expectedFromAddress) return false;
    const verifiedOrigin = origin(expectedPublicOrigin);
    if (!verifiedOrigin) return false;
    const links = payload.text.match(/https?:\/\/[^\s]+/g) ?? [];
    return links.length === 1 && links[0] === `${verifiedOrigin}/reset-password`;
  } catch { return false; }
}

/**
 * One operator-initiated HTTP attempt ONLY, restricted to ONE exact test mailbox.
 * No default fetch: the caller must explicitly supply a network implementation.
 * `operatorTestPermit` is NOT production authorization, and this function MUST
 * NOT be used by public endpoints or a worker. For a real test, approval of
 * the destination and credentials is required separately.
 */
export async function submitRecoveryResendTestOnce(input: Readonly<{
  operatorTestPermit: "EXPLICIT_ONE_TEST_EMAIL";
  allowedTestRecipient: string;
  expectedFromAddress: string;
  expectedPublicOrigin: string;
  apiKey: string;
  request: ResendRecoveryTestRequest;
  http: ResendTestHttp;
}>): Promise<ResendRecoveryResult> {
  try {
    if (!exact(input, ["operatorTestPermit", "allowedTestRecipient", "expectedFromAddress", "expectedPublicOrigin", "apiKey", "request", "http"]) ||
        input.operatorTestPermit !== "EXPLICIT_ONE_TEST_EMAIL" ||
        !recipient(input.allowedTestRecipient) ||
        !validatedCandidate(input.request, input.expectedFromAddress, input.expectedPublicOrigin) ||
        input.request.payload.to[0] !== input.allowedTestRecipient ||
        typeof input.apiKey !== "string" || !/^re_[A-Za-z0-9_-]{8,248}$/.test(input.apiKey) ||
        typeof input.http !== "function") return BLOCKED;

    // No logging or retry, including on all exceptions and timeouts.
    const res = await input.http(ENDPOINT, {
      method: "POST", redirect: "error",
      headers: Object.freeze({
        Authorization: `Bearer ${input.apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": input.request.idempotencyKey,
      }),
      body: JSON.stringify(input.request.payload),
      signal: AbortSignal.timeout(10000),
    });
    if (!res || !Number.isInteger(res.status)) return UNCERTAIN;
    if ([400, 401, 403, 404, 422].includes(res.status)) return REJECTED;
    if (res.status !== 200 && res.status !== 201) return UNCERTAIN;
    const data: unknown = await res.json();
    if (!exact(data, ["id"]) || typeof data.id !== "string" || !UUID_RE.test(data.id)) return UNCERTAIN;
    return ACCEPTED;
  } catch { return UNCERTAIN; }
}
