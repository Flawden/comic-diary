import type {
  NextRequest,
} from "next/server";

function firstForwardedValue(
  value: string | null,
): string | null {
  if (!value) {
    return null;
  }

  return (
    value
      .split(",")[0]
      ?.trim() ||
    null
  );
}

function requestPublicOrigin(
  request: NextRequest,
): string | null {
  const forwardedProto =
    firstForwardedValue(
      request.headers.get(
        "x-forwarded-proto",
      ),
    );

  const forwardedHost =
    firstForwardedValue(
      request.headers.get(
        "x-forwarded-host",
      ),
    );

  const host =
    forwardedHost ??
    request.headers.get("host");

  const protocol =
    forwardedProto ??
    request.nextUrl.protocol.replace(
      ":",
      "",
    );

  if (
    !host ||
    (
      protocol !== "http" &&
      protocol !== "https"
    )
  ) {
    return null;
  }

  try {
    return new URL(
      `${protocol}://${host}`,
    ).origin;
  } catch {
    return null;
  }
}

export function isAllowedRequestOrigin(
  originHeader: string | null,
  expectedOrigin: string | null,
): boolean {
  if (
    !originHeader ||
    !expectedOrigin
  ) {
    return false;
  }

  try {
    return (
      new URL(originHeader).origin ===
      expectedOrigin
    );
  } catch {
    return false;
  }
}

export function isSameOriginRequest(
  request: NextRequest,
): boolean {
  return isAllowedRequestOrigin(
    request.headers.get("origin"),
    requestPublicOrigin(request),
  );
}
