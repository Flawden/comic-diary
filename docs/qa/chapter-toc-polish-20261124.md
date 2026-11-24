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
