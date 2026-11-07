/**
 * Unmarking a rated chapter deletes its read row (and the rating attached to it).
 * Require an explicit in-app confirmation before that destructive action.
 */
export function needsUnreadConfirmation(
  action: "read" | "unread" | "read-through",
  rating: number | null | undefined,
): boolean {
  return action === "unread" && typeof rating === "number" &&
    Number.isInteger(rating) && rating >= 1 && rating <= 5;
}
