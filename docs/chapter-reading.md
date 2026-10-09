# Chapter reading and revisions

Chapter identity is `chapters.id`; display code/title/order are editable metadata.
`kind` distinguishes MAIN from SPECIAL. Released MAIN entries define progress;
specials are tracked separately. Read-through adds marks up to the selected MAIN
entry in current sort-order/id order, without clearing existing marks, touching
specials or reading archive entries. A per-entry unread action removes that mark.

`user_chapter_reads` stores individual marks and their recorded timestamps.
Archive/reorder/rename do not delete marks. Completion is an explicit diary status;
catching up with available main chapters is derived and does not auto-complete.
Choosing COMPLETED does not fabricate reading history.

A content revision is a NEW chapter with `supersedesChapterId`, not metadata editing.
The admin create form can replace one released entry with one new released entry
of the same kind, atomically archiving its predecessor and writing both audit events.
Active entries may reuse the predecessor's display code. A predecessor has at most
one successor; repeated revisions form a chain. Changes across several chapters
are represented by replacing those entries separately. Alternate simultaneous
continuities / branching editions are not implemented by this change.
Unread successors of read predecessors (including ancestors) are shown as updated
chapters; the old read mark remains in the archive history. Title/URL edits alone
do not imply a content revision. Imports must use explicit revision identity when
content changes; do not silently overwrite a chapter to represent a redraw.

Migration 0016 backfills marks for the first N released entries in the pre-migration
registry, using the previous sort-order/id interpretation of `currentChapter`.
Marks have `origin=MIGRATED`; their timestamp is the old diary updatedAt, not a
claimed exact historical reading time. All old chapter kinds default to MAIN;
admins can classify existing specials afterwards without losing read marks.
Ratings, notes, explicit status and original numeric fallback are preserved.

For titles with NO registry, an integer counter remains editable in one operation.
If a registry is added later, we do not guess which chapters that legacy counter
meant. The detail page explains the old count and asks the reader to select a
read-through target. Registered progress always derives from stable marks.

## Validation

`node --import tsx scripts/chapter-reading-probe.ts` uses DATABASE_URL and creates
uniquely named temporary users/comics/chapters, then cleans up its own fixtures.
Run against the LOCAL development database after migration. It covers read-through,
special exclusion, metadata/reorder stability, repeated revisions, idempotency,
private/cross-comic access denial, scheduled chapter rejection, legacy counters,
explicit completion and preservation of ratings/notes.
