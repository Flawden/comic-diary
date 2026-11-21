import test from 'node:test';
import assert from 'node:assert/strict';
import {
  invitationEmail,
  invitationHash,
  newInvitationSecret,
  invitationStatus,
  liveInvitation,
  betaDispatchEnabled,
  betaIntakeEnabled,
  betaPilotCompatible,
  INVITATION_LIFETIME_MS,
} from './beta-invitation-policy';
test('256-bit canonical secrets are domain-separated hashes and not recoverable list data', () => {
  const a = newInvitationSecret(),
    b = newInvitationSecret();
  assert.equal(a.secret.length, 43);
  assert.equal(a.hash.length, 64);
  assert.notEqual(a.secret, b.secret);
  assert.equal(invitationHash(a.secret), a.hash);
  for (const v of [null, '', a.secret + 'x', 'a'.repeat(43), {}, 1])
    assert.equal(invitationHash(v), null);
  assert.equal(INVITATION_LIFETIME_MS, 604800000);
});
test('normalized email and all lifecycle states; expiry boundary is closed', () => {
  assert.equal(invitationEmail(' Tester@Example.COM '), 'tester@example.com');
  for (const e of ['', null, 'bad', 'a@b', 'a\n@example.com'])
    assert.equal(invitationEmail(e), null);
  const now = new Date(),
    base = {
      pendingUserId: null,
      claimedAt: null,
      activatedAt: null,
      revokedAt: null,
      expiresAt: new Date(now.getTime() + 1000),
    };
  assert.equal(invitationStatus(base, now), 'ACTIVE');
  assert.equal(
    invitationStatus({ ...base, pendingUserId: 2, claimedAt: now }, now),
    'PENDING',
  );
  assert.equal(
    invitationStatus({ ...base, activatedAt: now }, now),
    'ACTIVATED',
  );
  assert.equal(invitationStatus({ ...base, revokedAt: now }, now), 'REVOKED');
  assert.equal(invitationStatus({ ...base, expiresAt: now }, now), 'EXPIRED');
  assert.equal(liveInvitation({ ...base, expiresAt: now }, now), false);
});
test('beta gates default OFF, exact true only, and unfinished pilot is never bypassed', () => {
  for (const v of [undefined, 'false', 'TRUE', '1', ' true ', 'bad']) {
    assert.equal(
      betaDispatchEnabled({ AUTH_BETA_INVITATION_DISPATCH_ENABLED: v }),
      false,
    );
    assert.equal(
      betaIntakeEnabled({ AUTH_BETA_INVITATION_REGISTRATION_ENABLED: v }),
      false,
    );
  }
  assert.equal(
    betaDispatchEnabled({ AUTH_BETA_INVITATION_DISPATCH_ENABLED: 'true' }),
    true,
  );
  assert.equal(
    betaIntakeEnabled({ AUTH_BETA_INVITATION_REGISTRATION_ENABLED: 'true' }),
    true,
  );
  assert.equal(
    betaPilotCompatible({ pilotId: 'pilot', pilotClosedAt: null }),
    false,
  );
  assert.equal(
    betaPilotCompatible({ pilotId: 'pilot', pilotClosedAt: new Date() }),
    true,
  );
});
