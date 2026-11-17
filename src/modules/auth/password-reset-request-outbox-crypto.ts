/**
 * AUTH-01 / R1B2A: encrypted envelope for an inert password-recovery outbox.
 * PURE: no DB, provider, public route, environment/key loading or sending.
 * This is a DIFFERENT cryptographic domain from activation mail.
 * Only the encrypted envelope may reach persistent storage; keep secret keys
 * out of both the database and logs. A future worker MUST re-check token
 * validity, verified mailbox, dispatch controls and expiry before delivery.
 */
import {
  createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual,
} from "node:crypto";

export type PasswordResetMailOutboxBinding = Readonly<{
  passwordResetTokenId: number;
  idempotencyKey: string;
  expiresAt: Date;
}>;
export type PasswordResetMailOutboxKey = Readonly<{
  keyId: string;
  bytes: Uint8Array;
}>;
export type PasswordResetMailOutboxInput = Readonly<{
  /** Exact verified mailbox read under a database user-row lock. */
  email: string;
  token: string;
  /** Explicit configured HTTPS origin, NOT Host or X-Forwarded-Host. */
  publicOrigin: string;
  expiresAt: Date;
}>;
export type PasswordResetMailOutboxEnvelope = Readonly<{
  payloadCiphertext: string;
  payloadNonce: string;
  payloadKeyId: string;
  payloadDigest: string;
}>;

const DOMAIN = "comic-diary:password-reset-mail-outbox:aes-256-gcm:v1";
const KEY_ID = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const IDEM = /^[A-Za-z0-9_-]{22,64}$/;
const TOKEN = /^[A-Za-z0-9_-]{43}$/;
const B64URL = /^[A-Za-z0-9_-]+$/;
const HEX64 = /^[0-9a-f]{64}$/;
const TTL_MS = 20 * 60_000;

function plainRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype;
}
function exactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const a = Object.keys(value).sort();
  const b = [...expected].sort();
  return a.length === b.length && a.every((key, i) => key === b[i]);
}
function validBinding(value: unknown): value is PasswordResetMailOutboxBinding {
  return plainRecord(value) && exactKeys(value, ["passwordResetTokenId", "idempotencyKey", "expiresAt"]) &&
    typeof value.passwordResetTokenId === "number" && Number.isSafeInteger(value.passwordResetTokenId) &&
    value.passwordResetTokenId > 0 && value.passwordResetTokenId <= 2147483647 &&
    typeof value.idempotencyKey === "string" && IDEM.test(value.idempotencyKey) &&
    value.expiresAt instanceof Date && Number.isFinite(value.expiresAt.getTime());
}
function validKey(value: unknown): value is PasswordResetMailOutboxKey {
  return plainRecord(value) && exactKeys(value, ["keyId", "bytes"]) &&
    typeof value.keyId === "string" && KEY_ID.test(value.keyId) &&
    value.bytes instanceof Uint8Array && value.bytes.byteLength === 32;
}
function canonicalOrigin(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 2048 || value.trim() !== value) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !!url.hostname && !url.username && !url.password &&
      url.pathname === "/" && !url.search && !url.hash && url.origin === value;
  } catch { return false; }
}
function canonicalToken(value: unknown): value is string {
  if (typeof value !== "string" || !TOKEN.test(value)) return false;
  const bytes = Buffer.from(value, "base64url");
  return bytes.length === 32 && bytes.toString("base64url") === value;
}
function validInput(value: unknown, binding: PasswordResetMailOutboxBinding, now: Date): value is PasswordResetMailOutboxInput {
  if (!plainRecord(value) || !exactKeys(value, ["email", "token", "publicOrigin", "expiresAt"])) return false;
  if (typeof value.email !== "string" || value.email.length < 4 || value.email.length > 320 ||
      Buffer.byteLength(value.email, "utf8") > 320 ||
      /[\x00-\x1f\x7f\s<>,;:()\[\]"\\]/.test(value.email) || !/^[^@]+@[^@]+$/.test(value.email)) return false;
  if (!canonicalToken(value.token) || !canonicalOrigin(value.publicOrigin) ||
      !(value.expiresAt instanceof Date) || value.expiresAt.getTime() !== binding.expiresAt.getTime()) return false;
  const remaining = binding.expiresAt.getTime() - (now instanceof Date ? now.getTime() : NaN);
  return Number.isFinite(remaining) && remaining > 60_000 && remaining <= TTL_MS;
}
function aad(binding: PasswordResetMailOutboxBinding, keyId: string): Buffer {
  return Buffer.from(JSON.stringify([
    DOMAIN, binding.passwordResetTokenId, binding.idempotencyKey,
    binding.expiresAt.toISOString(), keyId,
  ]), "utf8");
}
function canonicalB64(value: unknown, min: number, max: number): value is string {
  return typeof value === "string" && value.length >= min && value.length <= max &&
    B64URL.test(value) && Buffer.from(value, "base64url").toString("base64url") === value;
}
function validEnvelope(value: unknown): value is PasswordResetMailOutboxEnvelope {
  return plainRecord(value) && exactKeys(value, ["payloadCiphertext", "payloadNonce", "payloadKeyId", "payloadDigest"]) &&
    canonicalB64(value.payloadCiphertext, 32, 20000) && canonicalB64(value.payloadNonce, 16, 16) &&
    Buffer.from(value.payloadNonce, "base64url").length === 12 &&
    typeof value.payloadKeyId === "string" && KEY_ID.test(value.payloadKeyId) &&
    typeof value.payloadDigest === "string" && HEX64.test(value.payloadDigest);
}

/** Never returns or stores the raw code outside the ephemeral encrypted input. */
export function sealPasswordResetMailOutboxPayload(
  input: PasswordResetMailOutboxInput,
  binding: PasswordResetMailOutboxBinding,
  key: PasswordResetMailOutboxKey,
  now: Date = new Date(),
): PasswordResetMailOutboxEnvelope | null {
  if (!validBinding(binding) || !validKey(key) || !validInput(input, binding, now)) return null;
  const nonce = randomBytes(12);
  const secret = Buffer.from(key.bytes);
  const plain = Buffer.from(JSON.stringify({
    email: input.email, token: input.token, publicOrigin: input.publicOrigin,
  }), "utf8");
  try {
    const cipher = createCipheriv("aes-256-gcm", secret, nonce, { authTagLength: 16 });
    cipher.setAAD(aad(binding, key.keyId));
    const encrypted = Buffer.concat([cipher.update(plain), cipher.final(), cipher.getAuthTag()]);
    const payloadCiphertext = encrypted.toString("base64url");
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

/** Fail closed: only a trusted future worker may invoke this after DB guards. */
export function unsealPasswordResetMailOutboxPayload(
  envelope: PasswordResetMailOutboxEnvelope,
  binding: PasswordResetMailOutboxBinding,
  keys: ReadonlyMap<string, Uint8Array>,
  now: Date = new Date(),
): PasswordResetMailOutboxInput | null {
  if (!validBinding(binding) || !validEnvelope(envelope) || !(keys instanceof Map)) return null;
  const bytes = keys.get(envelope.payloadKeyId);
  if (!(bytes instanceof Uint8Array) || bytes.byteLength !== 32) return null;
  const expected = createHash("sha256").update(envelope.payloadCiphertext, "ascii").digest();
  if (!timingSafeEqual(expected, Buffer.from(envelope.payloadDigest, "hex"))) return null;
  const nonce = Buffer.from(envelope.payloadNonce, "base64url");
  const combined = Buffer.from(envelope.payloadCiphertext, "base64url");
  if (combined.length <= 16) return null;
  const secret = Buffer.from(bytes);
  let plain: Buffer | undefined;
  try {
    const decipher = createDecipheriv("aes-256-gcm", secret, nonce, { authTagLength: 16 });
    decipher.setAAD(aad(binding, envelope.payloadKeyId));
    decipher.setAuthTag(combined.subarray(combined.length - 16));
    plain = Buffer.concat([decipher.update(combined.subarray(0, -16)), decipher.final()]);
    const parsed: unknown = JSON.parse(plain.toString("utf8"));
    if (!plainRecord(parsed) || !exactKeys(parsed, ["email", "token", "publicOrigin"])) return null;
    const input: PasswordResetMailOutboxInput = {
      email: parsed.email as string,
      token: parsed.token as string,
      publicOrigin: parsed.publicOrigin as string,
      expiresAt: new Date(binding.expiresAt.getTime()),
    };
    return validInput(input, binding, now) ? input : null;
  } catch { return null; }
  finally { plain?.fill(0); secret.fill(0); }
}
