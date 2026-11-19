# Comic Diary — integrated local status (2026-11-19)

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
- Integration implementation SHA: recorded by the following local status commit.
- Other source worktrees unchanged; original two user UI edits remain separately
  in comic-diary-auth01 (globals.css +1/-15, ChapterReadingPanel.tsx -1).

## Actual task states

| Task | State |
| --- | --- |
| AUTH + RATE + COMMUNITY integration | DONE LOCALLY / AWAITING INDEPENDENT REVIEW / NOT PUBLISHED |
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

## Evidence on the actual integrated tree

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
  Remote CI not triggered. Existing CI service PG17, PG18 checked locally.
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
STOP for independent review. No push, merge, deploy or next stage.
