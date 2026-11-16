/**
 * AUTH-01C2B4D2C2: INERT AES-256-GCM envelope for ONE activation-mail issuance.
 * NO database/worker/provider/HTTP integration, NO environment or key loading.
 *
 * Caller supplies a 32-byte secret key OUTSIDE the database and an immutable
 * binding from the same locked issuance. Secret code and mailbox may ONLY be
 * persisted inside payloadCiphertext; never log inputs or decrypted outputs.
 *
 * This primitive does NOT implement key lifecycle, durable atomic issuance,
 * authorization, retries, or delivery. Recheck expiry before any future send.
 */
import {
  createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual,
} from "node:crypto";

export type ActivationMailOutboxBinding = Readonly<{
  verificationTokenId: number;
  idempotencyKey: string;
  expiresAt: Date;
}>;

export type ActivationMailOutboxKey = Readonly<{
  keyId: string;
  /** Exactly 32 cryptographically random bytes supplied by trusted key management. */
  bytes: Uint8Array;
}>;

export type ActivationMailOutboxEnvelope = Readonly<{
  payloadCiphertext: string;
  payloadNonce: string;
  payloadKeyId: string;
  payloadDigest: string;
}>;

export type ActivationMailOutboxMailInput = Readonly<{
  /** Locked database mailbox snapshot, NOT client-submitted recipient. */
  email: string;
  /** Raw one-time activation code: NEVER persist or log outside AEAD. */
  token: string;
  /** Explicit operator-configured canonical HTTPS origin. */
  publicOrigin: string;
  expiresAt: Date;
}>;

const DOMAIN = "comic-diary:auth-activation-mail-outbox:aes-256-gcm:v1";
const KEY_ID = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const IDEM = /^[A-Za-z0-9_-]{22,64}$/;
const TOKEN = /^[A-Za-z0-9_-]{43}$/;
const B64URL = /^[A-Za-z0-9_-]+$/;
const HEX64 = /^[a-f0-9]{64}$/;

function plainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype;
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const keys = Object.keys(value).sort();
  const sorted = [...expected].sort();
  return keys.length === sorted.length && keys.every((key, i) => key === sorted[i]);
}

function validBinding(value: unknown): value is ActivationMailOutboxBinding {
  if (!plainObject(value) || !exactKeys(value, ["verificationTokenId", "idempotencyKey", "expiresAt"])) return false;
  return typeof value.verificationTokenId === "number" && Number.isSafeInteger(value.verificationTokenId) &&
    (value.verificationTokenId as number) > 0 &&
    (value.verificationTokenId as number) <= 2147483647 &&
    typeof value.idempotencyKey === "string" && IDEM.test(value.idempotencyKey) &&
    value.expiresAt instanceof Date && Number.isFinite(value.expiresAt.getTime());
}

function validMailInput(value: unknown, binding: ActivationMailOutboxBinding, now: Date): value is ActivationMailOutboxMailInput {
  if (!plainObject(value) || !exactKeys(value, ["email", "token", "publicOrigin", "expiresAt"])) return false;
  if (typeof value.email !== "string" || value.email.length < 4 || value.email.length > 320 ||
      /[\x00-\x1f\x7f\s<>,;:()\[\]"\\]/.test(value.email) || !/^[^@]+@[^@]+$/.test(value.email)) return false;
  if (typeof value.token !== "string" || !TOKEN.test(value.token)) return false;
  const decoded = Buffer.from(value.token, "base64url");
  if (decoded.length !== 32 || decoded.toString("base64url") !== value.token) return false;
  if (typeof value.publicOrigin !== "string" || value.publicOrigin.length > 2048) return false;
  try {
    const url = new URL(value.publicOrigin);
    if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" ||
        url.search || url.hash || value.publicOrigin !== url.origin) return false;
  } catch { return false; }
  if (!(value.expiresAt instanceof Date) || value.expiresAt.getTime() !== binding.expiresAt.getTime()) return false;
  const time = now instanceof Date ? now.getTime() : NaN;
  const delta = binding.expiresAt.getTime() - time;
  return Number.isFinite(time) && delta > 60_000 && delta <= 30 * 60_000;
}

function validKey(value: unknown): value is ActivationMailOutboxKey {
  return plainObject(value) && exactKeys(value, ["keyId", "bytes"]) &&
    typeof value.keyId === "string" && KEY_ID.test(value.keyId) &&
    value.bytes instanceof Uint8Array && value.bytes.byteLength === 32;
}

function aad(binding: ActivationMailOutboxBinding, keyId: string): Buffer {
  // JSON array prevents delimiter ambiguity; UTC ISO preserves the DB timestamp.
  return Buffer.from(JSON.stringify([
    DOMAIN, binding.verificationTokenId, binding.idempotencyKey,
    binding.expiresAt.toISOString(), keyId,
  ]), "utf8");
}

function canonicalBase64Url(value: unknown, min: number, max: number): value is string {
  if (typeof value !== "string" || value.length < min || value.length > max || !B64URL.test(value)) return false;
  return Buffer.from(value, "base64url").toString("base64url") === value;
}

function validEnvelope(value: unknown): value is ActivationMailOutboxEnvelope {
  return plainObject(value) && exactKeys(value, ["payloadCiphertext", "payloadNonce", "payloadKeyId", "payloadDigest"]) &&
    canonicalBase64Url(value.payloadCiphertext, 32, 20000) &&
    canonicalBase64Url(value.payloadNonce, 16, 16) &&
    Buffer.from(value.payloadNonce, "base64url").length === 12 &&
    typeof value.payloadKeyId === "string" && KEY_ID.test(value.payloadKeyId) &&
    typeof value.payloadDigest === "string" && HEX64.test(value.payloadDigest);
}

/** Prepare encrypted-only fields matching activation_mail_outbox schema 0035. */
export function sealActivationMailOutboxPayload(
  input: ActivationMailOutboxMailInput,
  binding: ActivationMailOutboxBinding,
  key: ActivationMailOutboxKey,
  now: Date = new Date(),
): ActivationMailOutboxEnvelope | null {
  if (!validBinding(binding) || !validKey(key) || !validMailInput(input, binding, now)) return null;
  const nonce = randomBytes(12); // NEW random nonce for EVERY encryption under a key.
  const secret = Buffer.from(key.bytes);
  const plain = Buffer.from(JSON.stringify({
    email: input.email, token: input.token, publicOrigin: input.publicOrigin,
  }), "utf8");
  try {
    const cipher = createCipheriv("aes-256-gcm", secret, nonce, { authTagLength: 16 });
    cipher.setAAD(aad(binding, key.keyId));
    const bytes = Buffer.concat([cipher.update(plain), cipher.final(), cipher.getAuthTag()]);
    const payloadCiphertext = bytes.toString("base64url");
    if (payloadCiphertext.length > 20000) return null;
    return {
      payloadCiphertext,
      payloadNonce: nonce.toString("base64url"),
      payloadKeyId: key.keyId,
      payloadDigest: createHash("sha256").update(payloadCiphertext, "ascii").digest("hex"),
    };
  } catch { return null; }
  finally { plain.fill(0); secret.fill(0); }
}

/** Fail-closed unsealing with explicit key lookup. No provider or DB actions. */
export function unsealActivationMailOutboxPayload(
  envelope: ActivationMailOutboxEnvelope,
  binding: ActivationMailOutboxBinding,
  keys: ReadonlyMap<string, Uint8Array>,
  now: Date = new Date(),
): ActivationMailOutboxMailInput | null {
  if (!validBinding(binding) || !validEnvelope(envelope) || !(keys instanceof Map)) return null;
  const keyBytes = keys.get(envelope.payloadKeyId);
  if (!(keyBytes instanceof Uint8Array) || keyBytes.byteLength !== 32) return null;
  const expectedDigest = createHash("sha256").update(envelope.payloadCiphertext, "ascii").digest();
  const suppliedDigest = Buffer.from(envelope.payloadDigest, "hex");
  if (!timingSafeEqual(expectedDigest, suppliedDigest)) return null;
  const nonce = Buffer.from(envelope.payloadNonce, "base64url");
  const combined = Buffer.from(envelope.payloadCiphertext, "base64url");
  if (combined.length <= 16) return null;
  const secret = Buffer.from(keyBytes);
  let plain: Buffer | undefined;
  try {
    const decipher = createDecipheriv("aes-256-gcm", secret, nonce, { authTagLength: 16 });
    decipher.setAAD(aad(binding, envelope.payloadKeyId));
    decipher.setAuthTag(combined.subarray(combined.length - 16));
    plain = Buffer.concat([decipher.update(combined.subarray(0, -16)), decipher.final()]);
    const parsed: unknown = JSON.parse(plain.toString("utf8"));
    if (!plainObject(parsed) || !exactKeys(parsed, ["email", "token", "publicOrigin"])) return null;
    const input: ActivationMailOutboxMailInput = {
      email: parsed.email as string,
      token: parsed.token as string,
      publicOrigin: parsed.publicOrigin as string,
      expiresAt: new Date(binding.expiresAt.getTime()),
    };
    return validMailInput(input, binding, now) ? input : null;
  } catch { return null; } // No exception details: crypto errors must not echo secrets.
  finally { plain?.fill(0); secret.fill(0); }
}
