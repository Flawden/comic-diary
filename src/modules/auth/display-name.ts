const DISPLAY_NAME_MAX_CHARACTERS =
  120;

const forbiddenDisplayNameCharacters =
  /[\u0000-\u001f\u007f]/u;

export type DisplayNameNormalizationResult =
  | {
      ok: true;
      displayName:
        string | null;
    }
  | {
      ok: false;
      kind:
        "invalid_display_name";
    };

/**
 * Normalize the authenticated user's optional
 * display name.
 *
 * Whitespace-only input clears the name.
 * Surrounding whitespace is removed; internal
 * whitespace is preserved.
 */
export function normalizeOwnDisplayNameInput(
  rawDisplayName: string,
): DisplayNameNormalizationResult {
  const displayName =
    rawDisplayName.trim();

  if (displayName.length === 0) {
    return {
      ok: true,
      displayName: null,
    };
  }

  if (
    forbiddenDisplayNameCharacters.test(
      displayName,
    ) ||
    Array.from(
      displayName,
    ).length >
      DISPLAY_NAME_MAX_CHARACTERS
  ) {
    return {
      ok: false,
      kind:
        "invalid_display_name",
    };
  }

  return {
    ok: true,
    displayName,
  };
}
