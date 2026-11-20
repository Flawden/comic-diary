# AUTH legacy email verification — local review candidate (2026-11-20)

Independent-review blocker correction: historical issuer is now pending-only
with explicit purpose; historical bearer-only redemption rejects ALL tokens
without DB access. The former legacy/pending-purpose bypass was reproduced on
disposable PG17 before correction. Lifecycle/replay/race/rollback coverage moved
to the real pending activation path; secure legacy API dependency isolation and
both-purpose denial have explicit regressions. UI states the five-emails/hour cap.
See the separate local `.qa/legacy-bypass-review` evidence for this correction;
earlier review ZIP describes the pre-correction candidate and is superseded.
Correction checks: 652 unit/contracts, 28 AUTH PG17 commands; activation 33,
legacy 31 and recovery 59 integration tests passed. Typecheck, lint and build
passed; browser 3 themes x 320/390/1440 passed with provider HTTP blocked.

- Exact base: f7bf7a8c81134828a82641e2b38ee19fbc555806; tree
  89bb8b50c5dfdfcbff1aaf61a5772fec8cf6f8aa. Isolated branch:
  feature/auth-legacy-email-verification-20261120. No commit/push/deploy.
- Additive 0047 purpose foundation; safe own-account request/redeem with live
  session and current password on BOTH steps; Argon snapshot checked under USER
  lock. Password, ordinary sessions and verification_required_at stay unchanged.
- Shared activation outbox/worker with strict pending/legacy purpose isolation,
  pending v1 compatibility, purpose-bound legacy v2 AEAD, canonical profile mail,
  existing at-most-once/uncertain/start/finalization guarantees. No second sender.
- Two independent default-OFF legacy flags; Tea/Paper/Night profile UI. Existing
  public registration and recovery policies retained. Migration changes no users.
- Local checks: 651 unit/contracts; PG17 upgrade/replay foundation 4 assertions;
  legacy HTTP/concurrency/fault-injection/E2E 30 tests. Production build, ESLint,
  typecheck and Compose contracts passed. CI definitions include new tests and
  browser evidence; remote CI has NOT run because pushing is not authorized.
- Final PG17 AUTH rerun: activation 33/33, legacy 30/30, recovery 59/59. The broad
  disposable database regression passed all 41 commands. Drizzle metadata check
  and production npm audit passed (0 vulnerabilities); dependencies unchanged.
- Real browser/real account APIs on disposable PG17: enabled and disabled modes,
  3 themes x widths 320/390/1440, 18 screenshots; provider HTTP blocked in fixture.
  No production user data or secret files used. Other worktrees/UI edits preserved.
- Runbook: AUTH_LEGACY_EMAIL_VERIFICATION_RUNBOOK.md. Independent review and a
  separately authorized rollout remain required. Local QA is not production
  readiness, DNS validation or evidence of real mail delivery.

---

# RELEASE-01A — independent review checkpoint (2026-11-20)

- Draft PR: https://github.com/Flawden/comic-diary/pull/29, target master.
- Branch: codex/release01a-candidate-20261120. Candidate code checkpoint:
  433d4058d21d4f6dfc3725a5ce77ac6d03c2a57a.
- GREEN exact-code PR CI: https://github.com/Flawden/comic-diary/actions/runs/44664329802.
  Verify, PostgreSQL release checks and Windows backup client passed; publish/deploy
  are intentionally skipped for feature/PR. Final documentation HEAD and its exact
  CI conclusions are captured in the full review ZIP manifest and final report.
- Full release report: RELEASE01_REPORT_RU.md. Visual evidence/report:
  RELEASE01_VISUAL_REVIEW.md. Future deployment PLAN ONLY: RELEASE01_ROLLOUT_PLAN.md.
- Local 285 unit / 334 contracts; both PostgreSQL majors: activation 33, recovery 59,
  RATE 8, COMMUNITY 28; 11 reading/authorization/export probes each. Typecheck,
  ESLint, production build, Docker build/OFF smoke and production audit (0) PASS.
- Actual public-server/candidate visual comparison: 3 themes x 1440/320/390 on the
  same public Mezolit metadata/assets, exact hero height match, plus full synthetic
  signed-in functionality. No prior demo design was used as the reference.
- src/, drizzle/, package.json and package-lock.json are byte-identical to accepted
  activation 8b6e78c. Release-only changes are test isolation/readiness and docs;
  no runtime workaround, schema alteration, test disabling or dependency upgrade.
- Only this new feature branch was pushed, non-force. Master/integrated branches
  and all original worktrees preserved; original two UI edits were not transferred.
- No production SQL/deploy/restart, no domain/DNS changes, no real Resend requests,
  no secret-file read/copy/injection or sending enablement. Review stop applies.

---

# RELEASE-01A — candidate verification (2026-11-20)

- Isolated worktree: C:/Users/Atell/IdeaProjects/comic-diary-release01a.
- Branch: codex/release01a-candidate-20261120, based directly on accepted activation
  8b6e78cbea7abcc4930ffc4f01ed61cf06b1afbb. Integrated a96eadd is its ancestor;
  published integration still points to a96eadd, master last read a5119b2.
- No merge/cherry-pick. Current UI, RATE, COMMUNITY, activation and recovery are
  inherited intact. Original two user UI edits remain in comic-diary-auth01.
- Reproduced baseline CI 44587303919 failure at reader lazy-cover naturalWidth check.
  Proof: lazy img top -2020, complete=false/naturalWidth=0 after unchanged 12s wait;
  local SVG HTTP 200; scroll into view -> complete=true/naturalWidth=113. Only the
  browser scenario now scrolls before the same load assertion; no test disabled,
  no timeout relaxed, no app image/network semantics changed. Full reader PASS.
- First feature CI runs 44661598610/44661644476 exposed activation-suite fixture
  leakage: its last enabled/generation row affected the subsequent default-OFF
  gate probe. The suite now snapshots/restores its original control row in after;
  the unchanged 33 activation tests followed by the unchanged historical gate
  probe pass in the SAME disposable PG17 database. Production code is unchanged.
- Runs 44662608869/44662612969 passed activation/gate isolation and the cover
  assertion, then exposed diary-test interference. Diagnostic run 44663715522
  and a fresh local cold app both prove after-fill note/dirty/document=true,
  then after visual setup note/dirty/document=false BEFORE chapter interactions.
  The visual SQL/reload scenario replaced the original document on cold dev.
  Draft setup now starts after visual fixtures; dirty-state handshake and all
  strict tab/failure/rating/refresh/save assertions remain. No app draft code changed.
- Full local release checks: 285 unit, 334 contracts; PG17/PG18 activation 33,
  recovery 59, RATE 8, COMMUNITY 28 each. Eleven reading/authorization/export
  probes on each major PASS. Typecheck, lint, production/Docker build and OFF
  smoke PASS; production npm audit 0. Visual comparison: 9 matching public hero
  cases, 9 signed-in cases; integrated UI 45 checks; community 63/99 negative;
  threading and activation each 9 theme/width cases. See RELEASE01_VISUAL_REVIEW.md.
- Next dev regenerated AGENTS heading level (# -> ##); instructions unchanged.
- Live reference captured by public GET only in Tea/Paper/Night at 1440/320/390.
  Remaining release visual/general checks and remote CI are in progress at this
  candidate checkpoint; final evidence belongs to the full review package.
- Plan only: RELEASE01_ROLLOUT_PLAN.md. No production mutation/deploy/SQL, no real
  Resend, no secret file read or injection. All AUTH sending stays default OFF.

---

# AUTH-01 email activation — local review (2026-11-19)

- Worktree: C:/Users/Atell/IdeaProjects/comic-diary-activation.
- Branch: codex/email-activation-complete-20261119.
- Exact integrated base: a96eadd05597e849d2f22d03f87c27f722c3e88f.
  This includes current Tea/Paper/Night UI, AUTH, RATE, COMMUNITY and threaded replies.
- New atomic registration/activation delivery is implemented with existing AEAD,
  claim, fence, reservation, redemption and Resend wire components. Default OFF.
- 0046 adds activation dispatch start; historical migrations including 0044 unchanged.
  Registration never creates a session. The account/queue transaction rolls back
  together, duplicate identities receive generic 202, explicit manual reissue is bounded.
- Latest local checks: 285 unit, 334 contracts; activation 33/33 on PG17 and PG18;
  recovery regression 59/59 on PG17 and PG18; five updated historical PG17 probes PASS;
  typecheck, ESLint, production build, Docker build/OFF smoke, browser 3 themes x 2 widths PASS.
  Production npm audit --omit=dev: zero advisories. No dependency updates.
- Browser manifest covers pending state, invalid code, activation, no automatic session,
  normal login, responsive overflow and zero page errors. Only synthetic users/mock HTTP.
- Current branch has no new push/CI/deployment. Parent remote CI run 44587303919 failed
  in an existing mobile reader cover-image load assertion; Verify passed. That separate
  failure was observed before this task and is not represented as resolved here.
- All other worktrees preserved. Original two UI edits remain in comic-diary-auth01:
  globals.css +1/-15 and ChapterReadingPanel.tsx -1. Owner demo was not changed.
- Resend Verified, API-ключ подготовлен на VPS, реальная интеграция и доставка ещё не проверены.
  This is owner-provided infrastructure context. No credential file was read, copied,
  changed or connected. No live provider requests or production operations occurred.
- Local implementation commit: 6b816a15c55e2731613aa2d580199df927666c43.
  Final documentation checkpoint and exact source hashes are in the review manifest.
- Rollout and accepted failure policy: [AUTH_ACTIVATION_RUNBOOK.md](AUTH_ACTIVATION_RUNBOOK.md).

## Remaining external steps

Independent review -> separately authorized Git integration -> deployment/migration 0046
-> protected existing-key/container configuration and durable AEAD key -> explicit
operator gate/readiness/public registration rollout -> controlled real receipt test.
At-most-once can lose mail on crash even before HTTP; uncertain is never retried.
Worker health monitoring and safe key rotation/retention remain operational requirements.

---

# Comic Diary — integrated status (2026-11-19)

## Verified baseline and source checkpoints

- Live public /api/health/ready returned 200, commit
  a5119b2d599fc9d9915e7bfeb71d6ba2b26f5f57. git ls-remote origin master matched.
- Integrated worktree: C:/Users/Atell/IdeaProjects/comic-diary-integration.
- Branch: codex/integration-auth-rate-community-20261119.
- Base: accepted AUTH a181412ea580adfb983a1cfea769bd821804d440, a descendant of
  the entire live commit. AUTH runtime is unchanged from that checkpoint.
- Imported RATE implementation: 8ba39b920ffe05dddc3dc659a116ce3bb19460b2;
  its old checkpoint 7443ea03ab9a94586f050db16e464212a8ccb824 is preserved.
- Imported COMMUNITY checkpoint: 23b8c18c3a55828fb8c05824bef4471069bddb97;
  old implementation c8c65cc37a8fd8f6f3e100d47ffc9c2ee7c2cda2 is preserved.
- Integration implementation SHA: e1ee86f39dc5a9f55bd7c9f80852e09e2b756609.
  This follow-up status commit records its identity without rewriting it.
- Other source worktrees unchanged; original two user UI edits remain separately
  in comic-diary-auth01 (globals.css +1/-15, ChapterReadingPanel.tsx -1).

## Feature branch publication (owner-authorized)

- Published branch: origin/codex/integration-auth-rate-community-20261119.
- Published code/review checkpoint: 8aff72ce98dc59017a2c000281b7f6c271ac40c4.
- First remote CI run: https://github.com/Flawden/comic-diary/actions/runs/44587045302
  was in progress when publication was recorded; no green result claimed.
- This status-only follow-up does not change runtime code or local test results.
- Remote master was independently rechecked and remains
  a5119b2d599fc9d9915e7bfeb71d6ba2b26f5f57. No merge or production deployment.
- Existing review ZIPs are immutable evidence of their recorded pre-push checkpoints.

## Actual task states

| Task | State |
| --- | --- |
| AUTH + RATE + COMMUNITY integration | FEATURE BRANCH PUSHED / AWAITING CI AND INDEPENDENT REVIEW / NOT DEPLOYED |
| Live interface | Preserved from verified live commit, no redesign rollback |
| AUTH recovery | Included unchanged, locally retested, sending OFF |
| RATE | Included and adapted to live chapter UI; old local acceptance preserved |
| COMMUNITY | Included and adapted to live UI/AUTH policy; review pending |
| Email activation rollout | Incomplete / deferred; existing policy preserved |
| Production dependency audit | 0 vulnerabilities; package/lock unchanged from AUTH |
| Dev dependency advisories | Open inherited findings; no upgrades performed |

## Integrated behavior and preserved design

The latest catalog, dragon art, themes/fonts, dashboard, Comic Studio wizard,
work hero with live reading progress, description modal, named volumes and chapter
cover art remain. 83 protected design files/assets match live Git blobs (CRLF
normalization only). Only three existing UI files gain additive feature wiring:
work page, illustrated chapter panel and management navigation. No global CSS,
existing dashboard/studio form or catalog component was overwritten.

Public rating summaries reuse saved private scores without exposing identities
or notes. Work and RELEASED-chapter discussions support create, one-level reply,
edit/delete own visible content, spoilers, reports, cursor pagination and quotas.
ADMIN_SECURITY gates hide/restore, report decisions, finite restrictions and audit.
PRIVATE/HIDDEN/ARCHIVED targets are denied at the server; removed/hidden body is
absent from public DTO. Lost-response create replays do not duplicate or recharge.
RSC refresh revalidates visibility and preserves the new-comment draft.

COMMUNITY now rechecks AUTH canUseFullAccountSession inside its locked transaction,
including activation changes while waiting. Pending activation cannot mutate or
moderate; existing legacy-account policy is retained. Two new PG tests cover this.
AUTH start/fence/reservation/finalizer, at-most-once and no-requeue rules unchanged.
Real Resend never called; server QA blocks all outbound HTTP, integration mocks it.

## Migration lineage / deployment gate

Live migrations 0000-0030 and AUTH 0031-0044 unchanged. New community migration:
0045_community_comments, four new tables only. Old COMMUNITY 0028 is not used.
The last historical snapshot was 0027; complete 0045 snapshot now describes all
existing AUTH plus new community schema. 0045 SQL does not replay AUTH DDL.
Repeat Drizzle generation: no changes. Actual community metadata matches on PG17/18:
44 columns, 10 FK, 10 CHECK, 2 UNIQUE, 4 PK, 6 explicit non-unique indexes.
Populated live 0030 -> full integrated 0045 migration and repeat passed on both;
existing rating/read/private-note rows unchanged.

Before publishing: independent review, remote CI, reviewed backup/migration and
rollback/roll-forward plan, owner approval. No production migration performed.
Do not automatically drop community tables containing user content as rollback.
No real email until separately configured domain/sender, key and explicit gates.

## Latest reply/style review follow-up

- Follow-up implementation SHA: 0f83b355af0e6016e14ecac871e7380982f3d031.
- Replies render directly beneath their parent, with an indented branch and inline
  reply composer. Root pages (20) and reply pages (20) are independent; the first
  three replies per visible root are loaded in one bounded batch, not N+1 calls.
  Response replyPages metadata and parentId query support thread-local paging.
- Long titles receive scoped sizing; short-title hero style is unchanged. New
  ratings/discussion headings use the existing display font and theme variables.
  Chapter extras share one compact line; score/read controls do not overlap.
  No global palette, fonts, assets, AUTH runtime, schema or migration changes.
- Current checks: 264/264 unit; 349/349 contracts; COMMUNITY 28/28 on EACH PG17/18;
  typecheck, lint, production build passed. AUTH/RATE SQL/runtime are unchanged;
  their initial integration results below are retained, not claimed as rerun.
- Current browser: 42 cases + 66 refusal checks, RSC refresh, lost response; six
  additional theme/size flows check 25 root comments, a long reply thread, late
  replies, independent paging/deduplication, second-page reply and reload.
  Long control title fits two desktop lines, chapter row <=150px in the direct-link
  fixture, rating/read controls never overlap. 74 current synthetic screenshots.
- New thread-model tests explicitly run in CI; two additional PG cases are included
  in the existing complete COMMUNITY suite. Remote CI was triggered by the owner-authorized feature push; result pending.
- PG17 follow-up used an exact copy of the suite with ONLY strict loopback port
  55503 changed to 55513 to avoid interrupting the owner demo. Owner/database and
  all assertions unchanged; normalized hashes recorded in QA evidence.
- Demo content, including owner-written comments, was not changed by test cleanup.
  Test users/comments were cleaned from separate review DBs. Demo remains on 3114.

## Initial integration evidence (e1ee86f)

- Clean npm ci passed. No package.json/package-lock.json changes.
- All src unit: 261/261; all script .test.mjs contracts: 348/348; no skips.
- On EACH PG17.11 and PG18.1: AUTH mock dispatch 59/59, RATE 8/8,
  COMMUNITY 26/26 (including two new activation concurrency tests).
- 11 existing probes passed on EACH version: chapter reading/batch/move,
  series publication, chapter rating, membership, collection progress,
  account reading stats/diary export, personal and shared authorization.
- Upgrade from populated live schema + repeat, metadata checks: PASS on both.
- Bounded list query count/EXPLAIN retained on both; 102 chapters/5100 comments.
- Browser PG18: 42 COMMUNITY matrix cases + 66 negative checks, lost response,
  real RSC refresh, draft retained and hidden edit body removed.
- Additional browser PG17: 30 design/login/progress/dashboard/wizard/recovery-OFF
  checks across tea/paper/night and 320/1440. Real password login and reading POST;
  wizard has category/form fields. 92 synthetic screenshots total.
- No page errors; no unexpected console errors in the COMMUNITY matrix. Protected
  design manifest and representative images visually inspected.
- Typecheck, ESLint, production build, Docker build/network-none smoke: PASS.
- npm audit --omit=dev: 0 production vulnerabilities. Diff/staged/secret scan PASS.
- CI retains AUTH and explicitly runs RATE, COMMUNITY, design/lineage contracts.
  Remote CI triggered by feature push; result pending. Existing CI service PG17; PG18 checked locally.
- Full diff from live + integration-only diff from AUTH, report, source and logs
  are included in ignored .qa/ review package with SHA-256 manifest.

## Local demo / remaining limits

Integrated demo: http://127.0.0.1:3114/ with separate integration_demo DB on
loopback 55503. Synthetic accounts/content only; verification fixtures are valid.
Demo deliberately left running for owner review; recovery/worker/dispatch OFF,
no provider key, outbound server HTTP blocked. No production data copied.
Owned PG17 container and QA HTTPS server stopped; temporary TLS key/cert removed.
Auth/rate PG18 clusters stopped. Community PG18 cluster remains for demo only;
review test databases were cleaned before demo creation.

Working policy assumptions (text length, quotas, rating formula, one-level replies)
remain subject to acceptance. Global community write mutex is a known capacity
tradeoff; no production-scale load benchmark. Minimal audit latest 20 events,
no realtime push, reactions/attachments/notifications/deep trees. Beta onboarding
and email activation remain separate. Original live service was not changed.
STOP for CI and independent review. Feature push authorized and completed; no merge, deploy or next stage.
