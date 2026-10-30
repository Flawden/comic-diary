# WD05 — compact diary and reading progress

Baseline: WD04 commit 2aa64b2. Operator reported CI 40984732450 success and supplied mobile screenshots confirming draft note feedback and saved notes.

The library header now shows the shelf and reading counts with a compact catalog link. Removed decorative eyebrow and long introduction. Search, status filters, sorting and view switching retain their existing behavior.

Reading status controls wrap within the panel. Status explanations are available in a native disclosure. The progress count and unread main chapter count stay visible; last marked chapter, specials and revision details are expandable. A new revision count remains visible in the disclosure summary. Legacy progress input and unresolved migration guidance stay visible. Journal summary text aligns next to its disclosure marker, with tracking state retained on the right.

No mutation endpoints, completion confirmation, snapshot checks, reading counters, tracking, permissions or ratings logic changed. Status and chapter marks remain distinct. Uses existing theme variables and native keyboard-accessible details controls; minimum 44px summary targets.

Validation: TypeScript, ESLint and webpack production build (build-only DATABASE_URL); installer application and repeat application against a disposable Git baseline. Production CI and mobile visual acceptance remain pending. Check paper/tea/night, narrow and enlarged text layouts, status confirmation/cancel, disclosure toggling, legacy progress and lower navigation clearance. No local browser validation claimed.
