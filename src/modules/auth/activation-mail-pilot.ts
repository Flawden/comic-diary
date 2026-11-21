/** Durable one-shot policy. Never a transport permit; HTTP still requires start commit. */
export type ActivationPilot = {
  pilotId: string | null;
  pilotUserId: number | null;
  pilotOutboxId: number | null;
  pilotArmedAt: Date | null;
  pilotDispatchUsedAt: Date | null;
  pilotClosedAt: Date | null;
};

export function pilotAllowsIssue(control: ActivationPilot, userId: number): boolean {
  if (control.pilotId === null) return true;
  return control.pilotUserId === 1 && userId === 1 && control.pilotClosedAt === null &&
    control.pilotOutboxId === null && control.pilotDispatchUsedAt === null;
}

export function pilotAllowsDispatch(
  control: ActivationPilot, userId: number, purpose: string, outboxId: number,
): boolean {
  if (control.pilotId === null) return true;
  return control.pilotUserId === 1 && userId === 1 && purpose === "legacy_email_verification" &&
    control.pilotOutboxId === outboxId && control.pilotClosedAt === null &&
    control.pilotDispatchUsedAt === null;
}
