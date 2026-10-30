# WD-04 diary flow — 2026-10-30

Baseline: WD03 commit 79ea8d9, CI 40885964572 successful including production deploy, per operator output. WD02 ratings save/clear/reload and chapter marking were confirmed by operator. WD03 mobile screenshots show compact catalog and chapter filter disclosure.

This increment keeps diary search and submit on one row, moves sort into a disclosure with the applied order visible, and adds a query reset link preserving status/sort. Native GET submits q/status/sort even when disclosure is closed. No new library query or mutation semantics.

Ratings and note now share draft-state comparison. The message reports unsaved changes for changed ratings OR note, reverts when originals are restored, and does not claim save success during submission. Native POST and field names are preserved. Average is shown once; redundant stored average and summary score removed. Empty draft has a neutral prompt. Editor is keyed by persisted fields to reset after refreshed server data. Rating rows use explicit grid groups, native labelled radios and 44px high touch controls, with stacked fallback below 250px container width. Save remains explicit and available.

Local validation: TypeScript, ESLint, webpack production build with build-only DATABASE_URL; React component interaction checks for setting/clearing, average, reverting, note-only edits, 30 native radio options and submit fields. Installer tested on disposable Git baseline for application and idempotence. No local browser screenshot or live database acceptance claimed. Production CI and mobile/desktop validation remain pending for WD04.

Acceptance: paper/tea/night; 320/360/390/768/1440 widths; keyboard radios; note-only changes; change/revert; clear all then save/reload; search Enter and button; sort apply; reset search preserves status; controls remain usable with enlarged text. This increment does not close full roadmap stages or implement next-chapter navigation.
