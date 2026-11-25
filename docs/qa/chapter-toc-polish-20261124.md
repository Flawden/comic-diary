# Chapter table of contents polish — 2026-11-24

Scope: remove the obsolete bulk-read testing panel and redundant introduction card; keep visible chapter search, scheduled chapters, read history and ratings. A built-in reader and page uploads are explicitly out of scope.

Specials and bonuses have their own always-discoverable section and independent pagination. They do not contribute to main-story progress. Numbered volumes retain their accordion behavior. Stories without assigned volumes get an “Основная история” summary without inventing a volume number.

Page progress sums metadata of fully marked-read released MAIN chapters. Scheduled chapters and archived editions do not inflate totals. Missing page counts suppress total-page percentages; known metadata coverage is shown instead. Zero read chapters is a valid zero, not missing data. Search and pagination never narrow the aggregate denominator.

Group ratings use the existing public/private visibility and review-withdrawal policy: average each reader’s chapter scores, then average between readers. The new null-volume aggregate follows the same rule. No user scores are rewritten.

No schema migration, production configuration change or AUTH change is required.

## Verification

- Unit suite: 343 passed.
- PostgreSQL 17 presentation integration: 14 passed, including null-volume equal-reader weighting, isolation, hidden/withdrawn reviews and legacy fallback.
- Compiled standalone browser regression: Tea/Paper/Night at 320/390/1440; actual synthetic read mutations, specials isolation, search, planned chapters, archive retention, incomplete metadata and independent pagination.
- Existing presentation, reader, permissions and release regressions remain required in PR CI.
- TypeScript, ESLint, production build and canonical Docker smoke are release gates.

Browser fixtures run only against the guarded disposable database. AUTH is OFF, provider credentials are absent and nonlocal HTTP is blocked. Screenshots are emitted to the CI chapter-toc-browser artifact.

## Follow-up — 2026-11-25

The hero uses one main-story chapter bar. Pages are a numeric sum of fully read chapters, not a claim that a reader has reached a particular page. Bonuses have a separate compact hero count and a section progress bar, and never reduce completion of the main story when new bonuses appear.

A single numbered volume or an unassigned story retains its summary without a duplicate progress bar. Multiple editorial groups keep individual chapter bars; page measurements stay numeric. The decision uses full chapter membership, not the current search/pagination subset. Scheduled items and archived editions stay excluded from completed/released totals.

Chapter-title external-arrow decoration is removed. Links, destinations, new-tab behavior and accessible new-tab descriptions are preserved.

New browser cases cover explicit one-volume and multi-volume layouts, bonus-only registries, bonus insertion after main-story completion, and absent arrow decoration. Missing local font/script/image responses fail the regression. Standalone CI copies public directory contents into the existing traced public directory, avoiding an accidental public/public nesting. Production Docker asset copying is unchanged.

No built-in reader, per-page marks, stickers, schema changes or production configuration changes are introduced.
