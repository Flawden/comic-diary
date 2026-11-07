import type {
  NextRequest,
} from "next/server";

/**
 * The public origin is a deployment setting, never a value inferred from
 * incoming X-Forwarded-* or Host headers. These headers can be supplied by
 * clients unless every ingress proxy explicitly sanitizes them.
 */
function configuredPublicOrigin(): string | null {
  const value = process.env.COMIC_DIARY_PUBLIC_ORIGIN;

  if (!value || value !== value.trim()) {
    return null;
  }

  try {
    const url = new URL(value);
    if (
      !url.hostname ||
      (url.protocol !== "https:" && url.protocol !== "http:") ||
      (process.env.NODE_ENV === "production" && url.protocol !== "https:") ||
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash ||
      value !== url.origin
    ) {
      return null;
    }

    return url.origin;
  } catch {
    return null;
  }
}

/**
 * Local development only. Unlike production, developers may use arbitrary
 * local HTTP ports. Do not trust forwarded hosts here either.
 */
function developmentRequestOrigin(request: NextRequest): string | null {
  const host = request.headers.get("host");
  const protocol = request.nextUrl.protocol.replace(":", "");

  if (!host || (protocol !== "http" && protocol !== "https")) {
    return null;
  }

  try {
    return new URL(`${protocol}://${host}`).origin;
  } catch {
    return null;
  }
}

export function isAllowedRequestOrigin(
  originHeader: string | null,
  expectedOrigin: string | null,
): boolean {
  if (!originHeader || !expectedOrigin) {
    return false;
  }

  try {
    const candidate = new URL(originHeader);
    // An Origin header identifies an origin, not a URL with a path or query.
    return candidate.origin === expectedOrigin && originHeader === candidate.origin;
  } catch {
    return false;
  }
}

export function isSameOriginRequest(request: NextRequest): boolean {
  const configuredOrigin = configuredPublicOrigin();

  if (process.env.NODE_ENV === "production") {
    // Fail closed on missing/invalid configuration. Requiring the canonical
    // Host also rejects host-header injection when the proxy routes requests
    // to this vhost based on TLS SNI despite a forged HTTP Host.
    if (!configuredOrigin) {
      return false;
    }

    const canonicalHost = new URL(configuredOrigin).host;
    if (request.headers.get("host")?.toLowerCase() !== canonicalHost.toLowerCase()) {
      return false;
    }

    return isAllowedRequestOrigin(
      request.headers.get("origin"),
      configuredOrigin,
    );
  }

  // Development can use localhost and arbitrary ports. A configured origin
  // still takes precedence, but untrusted X-Forwarded-* is never consulted.
  return isAllowedRequestOrigin(
    request.headers.get("origin"),
    configuredOrigin ?? developmentRequestOrigin(request),
  );
}
