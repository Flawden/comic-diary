# Avatars and exclusive beta frame

Migration `0052_user_appearance` adds two independent tables. Existing users,
credentials, roles, entitlements, sessions, journals, invitation and AUTH control
rows are not updated. Every account defaults to initials and no selected frame;
beta participation and beta-frame access both default to false. Registration
does not award either flag, including during the invitation-only beta.

## User and administrator workflow

- Account → Appearance → Avatar and frame: upload JPEG, PNG or WebP, adjust the
  square crop/zoom, save, replace or remove. Without an image, initials appear.
- “Без рамки” is always available and is the default. An ADMIN award makes the
  beta frame selectable; it does not select it. Opting out keeps access.
- ADMIN → Participants: mark a participant and separately grant/revoke the
  exclusive beta frame. Existing accounts are supported. USER and EDITOR cannot
  read this page or perform these writes. Roles and login sessions do not change.
- Revocation clears selection atomically. Regrant does not restore selection.
  Each actual membership/grant change has an audit event visible to ADMIN.
- This release has one exclusive frame. Later generally available frames need
  explicit catalogue support; they must not reuse the beta award or a staff role.

The same avatar component is used in profile, settings, public reviews, comment
threads/replies, historical comments, account administration and moderation.
Public DTOs expose only app-owned avatar/frame URLs, never entitlement records,
email addresses or internal account identifiers. Inactive authors have no public
avatar. Removed/hidden public comments retain the existing redaction policy.

## Image and request contract

`sharp` 0.35.5 is an explicit production dependency. Uploads are bounded while
streaming to 5 MiB, decoded with a 16-million-pixel limit, and limited to static
JPEG/PNG/WebP. Signature, decoder, dimensions and integer crop bounds are checked
on the server. SVG and animated images are rejected. EXIF orientation precedes
crop coordinates. Only a normalized 256×256 WebP is written; source bytes, EXIF,
GPS and original filenames are not stored. Processing follows the
[Sharp input](https://sharp.pixelplumbing.com/api-constructor/) and
[output](https://sharp.pixelplumbing.com/api-output/) contracts.

The owner supplied the final dragon asset and explicitly chose the “БЕТА” label.
The release asset is `public/avatar-frames/beta-dragon-2026.webp`, converted using
lossless/exact encoding. Its decoded RGBA pixels match the supplied PNG, including
transparent background/centre. Original PNG: 1,107,265 bytes; WebP: 731,326 bytes.
The original download is preserved. No screenshot or generated substitute ships.

Own writes derive the user ID from a verified server session; clients cannot set
membership, awards, another account ID or arbitrary file paths. Same-origin
checks precede session/body reads. A separate rate-limit scope allows 20 own
appearance mutations per hour; recovery/login quotas and flags are unchanged.
Revisions fence concurrent edits: stale requests return 409, including replay
after an acknowledged-or-unknown commit. Clients refresh instead of auto-retry.

## Lock and persistence contract

Cosmetic writes share the existing account-authority advisory lock with role and
active-state administration. The order is authority → USER (ascending IDs, SHARE)
→ SESSION (SHARE) → APPEARANCE (UPDATE). No SHARE-to-UPDATE promotion and no AUTH
control-row locks/writes are introduced. Actor activity, verification, role and
session expiry/revocation are rechecked inside the transaction. Appearance and
grant-audit writes commit together.

Avatars live under the existing `MEDIA_ROOT/avatars`, within the established
DB/media backup scope; no Compose/env changes or new volume is required. Serve
only a currently referenced, active-user filename; every response is no-store
and nosniff. Removal/replacement makes the previous URL return 404 immediately.

Normalized media files are append-only to preserve the existing backup order
(DB snapshot followed by media capture). Old versions and uncertain/orphaned
uploads remain inaccessible. This also prevents deleting a file after a lost
commit acknowledgement when its DB reference may already exist. Retention-aware
physical cleanup is deferred and must consider off-host backups; disk usage must
be included in normal operations. Original uploads are never retained.

## Deployment and rollback

Keep all live AUTH/recovery flags, both gate generations, closed pilot pin and
spent dispatch budget unchanged. No award is issued automatically by migration,
deployment, invitation redemption or signup. First real avatar/award assignment
is an ordinary owner/ADMIN action, not production SQL in the release process.

Rehearse restoring a current 0051 backup into disposable PG17, apply the normal
migrator and verify old-image readiness on 0052, migration replay and candidate
startup with all AUTH flags OFF/provider HTTP blocked. Old images can ignore the
new tables; do not run a down migration. If production deploy or external HTTPS
smoke fails, retain evidence and stop without retry/automatic rollback/DB restore.
