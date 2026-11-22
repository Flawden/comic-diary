export const BETA_FRAME = 'beta_dragon_2026' as const;
export type PublicAppearance = {
  avatarUrl: string | null;
  frameUrl: string | null;
};
export const EMPTY_APPEARANCE: PublicAppearance = {
  avatarUrl: null,
  frameUrl: null,
};
export const AVATAR_FILENAME =
  /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}\.webp$/;
export class AppearanceError extends Error {
  constructor(
    readonly status: number,
    readonly kind: string,
  ) {
    super(kind);
  }
}
export function revisionValue(value: unknown) {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0)
    throw new AppearanceError(400, 'invalid_revision');
  return value;
}
export function strictObject(value: unknown, keys: string[]) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).sort().join() !== keys.slice().sort().join()
  )
    throw new AppearanceError(400, 'invalid_request');
  return value as Record<string, unknown>;
}
export function initials(name: string) {
  return (
    Array.from(
      name
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map((x) => Array.from(x)[0] ?? '')
        .join('')
        .toLocaleUpperCase('ru'),
    )
      .slice(0, 2)
      .join('') || 'Ч'
  );
}
