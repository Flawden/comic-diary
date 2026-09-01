export function normalizeLoginIdentifier(
  value: string,
): string {
  return value
    .trim()
    .toLowerCase();
}
