import {
  isIP,
} from "node:net";

export type HeaderReader = {
  get(
    name: string,
  ): string | null;
};

function normalizeIp(
  value: string,
): string | null {
  const normalized =
    value
      .trim()
      .toLowerCase();

  if (
    !normalized ||
    isIP(
      normalized,
    ) === 0
  ) {
    return null;
  }

  return normalized;
}

/**
 * Production trust contract:
 *
 * - the public app is reachable only through the host nginx;
 * - nginx overwrites X-Real-IP with $remote_addr;
 * - the app port is bound to 127.0.0.1 on the host.
 *
 * Therefore production trusts X-Real-IP and deliberately
 * does not derive identity from client-supplied X-Forwarded-For.
 *
 * Development falls back to loopback so direct `next dev`
 * remains usable without reproducing the production proxy.
 */
export function readTrustedClientIp(
  headers: HeaderReader,
  options: {
    production?: boolean;
  } = {},
): string | null {
  const production =
    options.production ??
    process.env.NODE_ENV ===
      "production";

  const trustedProxyIp =
    normalizeIp(
      headers.get(
        "x-real-ip",
      ) ?? "",
    );

  if (trustedProxyIp) {
    return trustedProxyIp;
  }

  if (!production) {
    return "127.0.0.1";
  }

  return null;
}
