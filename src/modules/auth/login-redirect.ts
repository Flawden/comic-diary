const REDIRECT_BASE =
  new URL(
    "https://comic-diary.local",
  );

export function getSafeLoginRedirect(
  value:
    | string
    | null
    | undefined,
  fallback = "/",
): string {
  const candidate =
    value?.trim();

  if (
    !candidate ||
    !candidate.startsWith("/") ||
    candidate.startsWith("//")
  ) {
    return fallback;
  }

  try {
    const target =
      new URL(
        candidate,
        REDIRECT_BASE,
      );

    if (
      target.origin !==
      REDIRECT_BASE.origin
    ) {
      return fallback;
    }

    /*
     * Avoid a successful login redirecting
     * straight back into the login page.
     */
    if (
      target.pathname ===
      "/login"
    ) {
      return fallback;
    }

    return (
      target.pathname +
      target.search +
      target.hash
    );
  } catch {
    return fallback;
  }
}
