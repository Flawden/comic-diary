# VK Catalog Review Artifact v1

## Purpose

R5.3.5 introduces the explicit human-review boundary between deterministic
candidate normalization and canonical import.

The review layer does not contact VK, write PostgreSQL, or mutate the canonical
catalog.

## Decisions

Every candidate has exactly one review decision:

- pending;
- accepted;
- skipped;
- postponed.

Accepted is a review decision only. It is not an import operation.

## Explicit confirmation

Every candidate also has reviewConfirmed.

Acceptance becomes import-ready only when:

- the decision is accepted;
- reviewConfirmed is true;
- the edited draft passes the canonical catalog validator;
- the candidate does not conflict with another active review slug.

This prevents selecting publicationStatus from silently turning a candidate
into an importable row without inspecting warnings and evidence.

## Editable draft

The review draft contains the canonical intake fields:

- categorySlug;
- slug;
- title;
- description;
- authorName;
- translatorName;
- translatorNote;
- sourceUrl;
- totalChapters;
- coverUrl;
- publicationStatus.

Blank optional text values normalize to null at the canonical boundary.

Blank totalChapters means unknown.

## Validation

R5.3.5 reuses the canonical Comic Diary validator.

The review layer additionally detects duplicate slugs between active review
entries.

Skipped and postponed candidates do not block another candidate through a
review-only slug collision.

## Existing catalog match

A valid draft is compared with the typed canonical catalog by stable comic
slug.

The preview classification is:

- create — no canonical comic has that slug;
- unchanged — a canonical comic has that slug and every canonical field is
  equal;
- update — a canonical comic has that slug but canonical fields differ;
- invalid — the draft does not currently satisfy review/canonical validation.

This classification is advisory. R5.3.6 must recompute validation and dry-run
results before any import.

## Review Artifact v1

The exported artifact records:

- candidate artifact identity and SHA-256;
- snapshot SHA-256;
- every human decision;
- edited drafts;
- explicit review confirmation;
- optional reviewer note;
- normalized canonical rows when valid;
- validation errors;
- duplicate-slug state;
- create/update/unchanged preview;
- acceptedReady.

## Persistence boundary

Review Console automatically persists Review Artifact-compatible state in
browser `localStorage`.

The storage key is versioned and includes the exact candidate artifact SHA-256.
A saved review therefore cannot be silently restored against a different
candidate set.

Browser restoration uses the same strict Review Artifact identity checks as
manual JSON restore. Imported canonical/validation/preview fields are not
trusted; they are recomputed from the restored draft.

Browser autosave is local to the browser origin. Manual Review JSON
download/upload remains the portable backup and transfer mechanism.

R5.3.5 does not persist review decisions in PostgreSQL.

R5.3.5 does not mutate source candidate artifacts or the canonical catalog.

R5.3.6 owns conversion of acceptedReady review entries into a canonical import
dataset and must run canonical validation plus a fresh dry-run before writes.
## Per-card approval UX

Review Console treats every candidate independently.

A reviewer may inspect, edit, and approve one candidate while every other
candidate remains `pending`.

The UI action `Утвердить карточку` is the explicit human confirmation for that
candidate. It atomically sets:

- `decision = "accepted"`;
- `reviewConfirmed = true`.

The separate confirmation checkbox is intentionally not exposed in the UI.
The two fields remain separate in Review Artifact v1 for contract stability,
strict restore validation, and compatibility with previously exported review
artifacts.

`Отложить` and `Пропустить` are also per-candidate decisions and do not require
the rest of the candidate set to be reviewed.

`Снять решение` returns only the decision state to `pending` and preserves the
reviewer's current draft edits.

Approval is blocked when the candidate canonical draft is invalid or when its
active slug conflicts with another active review entry.

An approved candidate becoming invalid after later editing stops being
`acceptedReady` until the blocking problem is corrected.

Per-card approval is still review only. It performs no PostgreSQL writes and no
canonical catalog writes. Import remains a later pipeline stage.
