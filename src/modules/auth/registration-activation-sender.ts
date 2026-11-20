/**
 * AUTH-01C2B4D2B1: validate a plain-text activation email envelope before
 * passing it to a FUTURE, explicitly chosen transactional mail provider.
 *
 * This module does not verify DNS or domain ownership. The operator MUST
 * separately verify the sender domain, DKIM and aligned SPF/DMARC at the
 * selected provider before any transport is connected.
 *
 * Pure function; no network, provider SDK, secrets, environment, or database.
 */

import type { PendingActivationMail } from "./registration-activation-mail";

export type ActivationSenderConfiguration = Readonly<{
  /** Bare ASCII mailbox; never a display-name or arbitrary header. */
  fromAddress: string;
  /** Exact pre-authorized sender domain (ownership verified OUT OF BAND). */
  senderDomain: string;
  /** Exact canonical HTTPS origin configured at deployment, not request Host. */
  publicOrigin: string;
}>;

export type ActivationSenderEnvelope = Readonly<{
  from: string;
  to: string;
  subject: string;
  text: string;
}>;

function safeDomain(value: string): boolean {
  if (typeof value !== "string" || value.length > 253 || value.length < 4) return false;
  if (value !== value.toLowerCase() || !/^[a-z0-9.-]+$/.test(value) || !value.includes(".")) return false;
  const labels = value.split(".");
  if (labels.some((label) => label.length < 1 || label.length > 63 || !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label))) return false;
  const tld = labels[labels.length - 1];
  return /^[a-z]{2,63}$/.test(tld) || /^xn--[a-z0-9-]{2,59}$/.test(tld);
}

function safeSenderAddress(value: string, domain: string): boolean {
  if (typeof value !== "string" || value.length > 254) return false;
  const parts = value.split("@");
  if (parts.length !== 2 || parts[1] !== domain) return false;
  const local = parts[0];
  return local.length >= 1 && local.length <= 64 &&
    /^[A-Za-z0-9](?:[A-Za-z0-9._+%-]*[A-Za-z0-9])?$/.test(local) &&
    !local.includes("..");
}

function safeRecipient(value: string): boolean {
  return typeof value === "string" && value.length > 3 && value.length <= 320 &&
    !/[\x00-\x20\x7f\s<>,;:()\[\]"\\]/.test(value) &&
    /^[^@]+@[^@]+$/.test(value);
}

function canonicalOrigin(value: string): string | null {
  if (typeof value !== "string" || value !== value.trim()) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !!url.hostname && !url.username && !url.password &&
      url.pathname === "/" && !url.search && !url.hash && value === url.origin
      ? url.origin : null;
  } catch { return null; }
}

/**
 * Fail-closed syntax/content preflight, NOT proof of provider or DNS readiness.
 * The returned object has ONLY four fields, for a future text-only transport.
 */
export function prepareActivationSenderEnvelope(
  config: ActivationSenderConfiguration,
  message: PendingActivationMail,
): ActivationSenderEnvelope | null {
  if (!config || !message || typeof message !== "object") return null;
  if (!safeDomain(config.senderDomain) || !safeSenderAddress(config.fromAddress, config.senderDomain)) return null;
  const origin = canonicalOrigin(config.publicOrigin);
  if (!origin) return null;

  // Reject extra properties: no caller-provided headers, HTML, cc, bcc, files.
  if (Object.keys(message).sort().join(",") !== "activationPageUrl,subject,text,to") return null;
  if (!safeRecipient(message.to)) return null;
  if (typeof message.subject !== "string" || message.subject.length < 1 ||
      message.subject.length > 150 || /[\x00-\x1f\x7f\u2028\u2029]/.test(message.subject)) return null;
  if (typeof message.text !== "string" || message.text.length < 1 ||
      message.text.length > 8192 || /[\x00-\x09\x0b-\x1f\x7f\r]/.test(message.text)) return null;

  const url = `${origin}/activate`;
  if (message.activationPageUrl !== url || !message.text.includes(url)) return null;
  const links = message.text.match(/https?:\/\/[^\s]+/g) ?? [];
  if (links.length !== 1 || links[0] !== url) return null;

  return Object.freeze({
    from: config.fromAddress,
    to: message.to,
    subject: message.subject,
    text: message.text,
  });
}
