import { createHash, randomBytes } from 'node:crypto';
import { normalizeLoginIdentifier } from './login-identifier';
export const INVITATION_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;
export const INVITATION_MESSAGE =
  'Сейчас регистрация доступна только участникам закрытого бета-тестирования по персональным приглашениям';
export function invitationEmail(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const email = normalizeLoginIdentifier(value);
  return email &&
    email.length <= 320 &&
    !/[\x00-\x1f\x7f\s<>,;:()\[\]"\\]/.test(email) &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    ? email
    : null;
}
export function invitationHash(value: unknown): string | null {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(value))
    return null;
  const bytes = Buffer.from(value, 'base64url');
  if (bytes.length !== 32 || bytes.toString('base64url') !== value) return null;
  return createHash('sha256')
    .update('comic-diary:beta-invitation:v1:' + value)
    .digest('hex');
}
export function newInvitationSecret() {
  const secret = randomBytes(32).toString('base64url');
  return { secret, hash: invitationHash(secret)! };
}
export type InvitationFacts = {
  pendingUserId: number | null;
  claimedAt: Date | null;
  activatedAt: Date | null;
  revokedAt: Date | null;
  expiresAt: Date;
};
export function invitationStatus(
  row: InvitationFacts,
  now: Date,
): 'ACTIVE' | 'PENDING' | 'ACTIVATED' | 'REVOKED' | 'EXPIRED' {
  if (row.activatedAt) return 'ACTIVATED';
  if (row.revokedAt) return 'REVOKED';
  if (row.expiresAt.getTime() <= now.getTime()) return 'EXPIRED';
  return row.pendingUserId === null ? 'ACTIVE' : 'PENDING';
}
export function liveInvitation(
  row: InvitationFacts | undefined,
  now: Date,
): boolean {
  return (
    !!row &&
    row.revokedAt === null &&
    row.activatedAt === null &&
    row.expiresAt.getTime() > now.getTime()
  );
}
export function betaDispatchEnabled(
  env: Readonly<Record<string, string | undefined>>,
) {
  return env.AUTH_BETA_INVITATION_DISPATCH_ENABLED === 'true';
}
export function betaIntakeEnabled(
  env: Readonly<Record<string, string | undefined>>,
) {
  return env.AUTH_BETA_INVITATION_REGISTRATION_ENABLED === 'true';
}
export function betaPilotCompatible(control: {
  pilotId: string | null;
  pilotClosedAt: Date | null;
}) {
  return control.pilotId === null || control.pilotClosedAt !== null;
}
export function maskedInvitationEmail(email: string) {
  const at = email.lastIndexOf('@');
  return email.slice(0, 1) + '***' + email.slice(at);
}
