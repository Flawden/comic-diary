# Comic Diary — project status (2026-11-19)

## Preserved checkpoint

- Repository: Flawden/comic-diary. Local worktree: comic-diary-auth01-nightshift.
- Branch: codex/auth01-dispatch-nightshift-20261118.
- Verified parent HEAD: 96987060cbfe1f12cab2971ec78ab0b2ed8a56d7.
- This checkpoint preserves accepted AUTH rounds 1–3 as ONE local commit.
  Its SHA is available through git log; no synthetic historical commits are made.
- Accepted Round 3 review archive SHA-256:
  8bcc3d8dfb8ce40702d712b2c3491f55d1b839894c6955cd3ccfc9d341da7a72.
  All 42 changed/untracked project files matched its source snapshot byte for byte.

## Task states

| Task | Actual state |
| --- | --- |
| AUTH-01 password recovery | LOCALLY QA ACCEPTED, NOT PUBLISHED / NOT DEPLOYED; FROZEN by owner |
| Registration email activation | INCOMPLETE, DEFERRED until a separate owner decision |
| Production dependency remediation | LOCALLY VERIFIED: production npm audit 0 |
| Development dependency advisories | OPEN: 13 affected package nodes / 6 unique advisories; no blanket fixes authorized |
| RATE-01 public ratings | ACTIVE; implementation will use its own isolated branch/worktree |
| COMMUNITY-01 comments | NEXT, NOT STARTED; requires separate instruction |

## Verified evidence for this checkpoint

Round 3: clean npm ci; AUTH unit 199/199; contracts 334/334;
disposable PG17 and PG18 integrated dispatch 59/59 each;
typecheck, ESLint, production build, Docker build and network-isolated OFF smoke passed.
Browser QA: 48 page checks + 12 enabled/OFF form scenarios, 60 safe screenshots.
Remote GitHub CI was NOT run; no push, merge or deploy was performed.
No real Resend requests or real emails. Sender/domain/API-key setup remains pending.
Detailed local evidence stays outside Git in ignored .qa/round3 and its review ZIP.

## RATE-01 base and working assumptions

Verified non-AUTH base containing existing personal ratings:
feature/catalog-redesign at 7db3ae400bb09eddb9b7276ef8d45d19c89a6afb.
Prefer that base, rather than importing the frozen AUTH chain. Copy only the
already accepted Round 3 package manifest/lock security remediation into RATE-01;
record actual RATE branch/base/checkpoint SHAs in its status after setup.

Provisional work-score formula (not a previously approved owner policy): average
each reader's non-null criteria, then average those personal averages with equal
reader weight. Preserve raw ratings; isolate SQL so this policy can be replaced.
Chapter scores average non-null chapter ratings. No new rating tables or migrations
are planned. Existing visibility, ownership and read-before-rating guards remain.

## Boundaries / remaining risks

- AUTH at-most-once deliberately permits lost email and terminal uncertain;
  PostgreSQL commit and external HTTP are not atomic; provider accepted != delivery.
- Production sending requires domain/DNS, verified sender, protected real key,
  explicit readiness/gates and separately controlled delivery acceptance.
- Do not touch comic-diary-auth01: user globals.css and ChapterReadingPanel.tsx
  changes remain uncommitted there (verified +1/-15 and -1 respectively).
- No automatic COMMUNITY-01, AUTH continuation, dependency sweep or publication.
