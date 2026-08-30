import {
  createHmac,
  timingSafeEqual,
} from "node:crypto";

export const ADMIN_IMPORT_SESSION_COOKIE =
  "comic_diary_admin_import";

export const ADMIN_IMPORT_SESSION_TTL_SECONDS =
  8 * 60 * 60;

const SESSION_PURPOSE =
  "comic-diary-admin-import-v1";

export type AdminImportAvailability =
  | "disabled"
  | "misconfigured"
  | "ready";

function getAdminImportSecret() {
  return (
    process.env.ADMIN_IMPORT_SECRET?.trim() ??
    ""
  );
}

export function getAdminImportAvailability(): AdminImportAvailability {
  if (
    process.env.ADMIN_IMPORT_ENABLED !==
    "true"
  ) {
    return "disabled";
  }

  if (!getAdminImportSecret()) {
    return "misconfigured";
  }

  return "ready";
}

function safeEqual(
  left: string,
  right: string,
) {
  const leftBuffer = Buffer.from(
    left,
    "utf8",
  );

  const rightBuffer = Buffer.from(
    right,
    "utf8",
  );

  if (
    leftBuffer.length !==
    rightBuffer.length
  ) {
    return false;
  }

  return timingSafeEqual(
    leftBuffer,
    rightBuffer,
  );
}

export function verifyAdminImportSecret(
  candidate: string,
) {
  const expected =
    getAdminImportSecret();

  if (!expected) {
    return false;
  }

  return safeEqual(
    candidate,
    expected,
  );
}

function signSessionExpiry(
  expiresAt: number,
) {
  const secret =
    getAdminImportSecret();

  return createHmac(
    "sha256",
    secret,
  )
    .update(
      `${SESSION_PURPOSE}:${expiresAt}`,
      "utf8",
    )
    .digest("hex");
}

export function createAdminImportSession() {
  const expiresAt =
    Math.floor(Date.now() / 1000) +
    ADMIN_IMPORT_SESSION_TTL_SECONDS;

  const signature =
    signSessionExpiry(expiresAt);

  return `${expiresAt}.${signature}`;
}

export function verifyAdminImportSession(
  value: string | undefined,
) {
  if (
    !value ||
    getAdminImportAvailability() !==
      "ready"
  ) {
    return false;
  }

  const separator =
    value.indexOf(".");

  if (separator <= 0) {
    return false;
  }

  const rawExpiry =
    value.slice(0, separator);

  const signature =
    value.slice(separator + 1);

  if (
    !/^\d+$/.test(rawExpiry) ||
    !/^[a-f0-9]{64}$/.test(signature)
  ) {
    return false;
  }

  const expiresAt =
    Number(rawExpiry);

  if (
    !Number.isSafeInteger(expiresAt) ||
    expiresAt <=
      Math.floor(Date.now() / 1000)
  ) {
    return false;
  }

  const expected =
    signSessionExpiry(expiresAt);

  return safeEqual(
    signature,
    expected,
  );
}