# PlayGarba execution ledger

This file is a human-readable execution snapshot for agents and reviewers. It is **not** an ownership registry. Issue #364 remains the only authoritative source for active agent claims, file ownership and conflict state.

Refresh this file before using it to select work. This repository is moving minute by minute and a merge, claim, release, research handoff or catalogue import can make any snapshot row stale.

## Snapshot

- Snapshot time: **2026-09-12 21:37 UTC / 17:37 America/Toronto**
- Repository: `ruddvz/garba`
- Exact `main`: `252f074b7ad534af1e77170165cb946de6d2b8f8`
- Main head: `Fail closed when RAAS ownership comments are edited or deleted (#1431)`
- Open issues: **100**
- Open pull requests: **32**
- Machine-labelled open `agent:claimed` issues: **37**
- Ledger refresh lane: **#1452** / `chatgpt-sol-execution-ledger-refresh-1452` / `coordination/issue-1452-execution-ledger-refresh`
- #1452 ownership comment is valid and posted; at snapshot time the derived registry label/board acknowledgement had not yet caught up, so it is not silently added to the 37 machine-labelled count above.
- Cross-issue file conflicts reported by #364: **none** at the snapshot.

Counts above are point-in-time GitHub search/board values, not durable metrics. The target issue comments, #364 and open PR state must be re-read immediately before implementation or merge.

## YouTube coverage control panel

### Merged current-main truth

At exact main `252f074b7ad534af1e77170165cb946de6d2b8f8` the last merged exact coverage baseline remains:

- Canonical songs: **1,706**
- Executable truthful YouTube routes: **1,030**
- Playable YouTube coverage: **60.4%**
- Remaining migration / no-executable-YouTube backlog: **676**
- Remaining share without a playable YouTube route: **39.6%**

Do **not** add routes from an open PR to these numbers. Open-PR coverage deltas are proposals until the exact diff lands on current main and the coverage report is recalculated there.

### What 100% means

The optimisation target is maximum truthful YouTube coverage, not a manufactured percentage.

Track two outcomes separately:

1. **Playable coverage:** canonical rows with an executable exact YouTube route.
2. **Adjudication coverage:** canonical rows that have been checked and are either exact-YouTube playable or carry a release-specific fail-closed evidence boundary.

Playable coverage should be pushed as high as source evidence permits. Adjudication coverage should reach 100%. A canonical row may legitimately remain non-playable when the exact recording cannot be proven.

Never increase coverage with a title-only match, different performance, later re-recording, fan upload without independent master proof, inferred sibling video ID or calculated chapter timestamp.

## Shared release blocker: #969 desktop WebKit Search

Issue #969 currently owns `.github/browser/browser-smoke.spec.mjs` through agent `chatgpt-sol-webkit-viewport-969-v2` on `fix/issue-969-webkit-viewport-page-side`. PR #1260 is the owning browser-gate lane.

The shared Browser viewport smoke matrix is currently capable of blocking otherwise-clean manifest-only YouTube PRs on the existing desktop-WebKit Search path. Do not fix that from a playback manifest issue and do not weaken, skip or arbitrarily inflate the browser gate to get unrelated route PRs merged.

Observed exact evidence from the reconciled Re Lol PR #1407:

- `Validate GARBA`: green
- all applicable RAAS ownership/diff/hygiene/drift gates: green
- Browser viewport smoke: **43 passed / 12 skipped / 1 failed**
- sole failure: `[desktop-webkit] Search opens without clipping and closing restores focus to the opener`
- timeout occurred while waiting for `#sheetClose` visibility in `.github/browser/browser-smoke.spec.mjs`
- this is the same shared browser lane owned by #969, not a playback-source assertion

Until #969 is resolved and the required browser gate is green, route agents should preserve completed one-file diffs, document the blocker, release implementation ownership when no further in-scope work exists, and avoid editing the shared browser file.

## Parked exact-route PRs already implemented

These routes are **not counted** in current-main coverage.

| PR / issue | Proposed delta | Exact scope | Current state |
| --- | ---: | --- | --- |
| #1407 / #1401 Re Lol Vol. 7 | +2 | `data/playback-sources-re-lol-exact.json` | Rebuilt on repaired main, full validator and RAAS gates green; sole red is shared #969 browser failure. Reconciliation claim released and PR preserved. |
| #1427 / #1423 Trupti Gadhvi `Nagar Nandji Na Lal` | +1 | `data/playback-sources-trupti-kaushal.json` | One-file exact Topic/OAC route `w1yvFRfALbc`; implementation complete and parked behind the same desktop-WebKit Search gate. |
| #1359 / #946 `Tara Vina Shyam` track 4 | +1 | `data/playback-sources-atul-tara-vina-shyam-exact.json` | Exact Soor Mandir route `Sbl8ChSqf0M`; older one-file PR remains open and must be reconciled against fresh main/gates before merge. |

For #1407 specifically, exact-head validation showed the proposed result would be **1,032 / 1,706 = 60.5%** if only those two routes landed against the same denominator. That is a PR delta, not current-main truth.

## Active/open YouTube implementation queue

The following lanes are already owned or have open implementation PRs. Do not duplicate them. Re-read #364 because this table can go stale quickly.

| Lane | Route work | Ownership / PR note |
| --- | --- | --- |
| #1377 | `Hu To Gayo No Goval` exact route | Active claim on `data/playback-sources-alpa-current.json`. |
| #1378 | `Shubhaarambh` exact route | Active claim on shared `data/playback-sources-current.json`. |
| #1383 / PR #1441 | Morli Vol. 6 | Proposes 17 exact source-published Soor Mandir chapters and owns `data/playback-sources-morli-v6-exact.json` plus `data/catalogue/index.json`. |
| #1391 | Purva `Vithal Vithala` | Active exact-route implementation claim. |
| #1395 | Taali Vol. 13 track 12 | Active final-track implementation claim. |
| #1399 / PR #1404 | Navdurgani Navratri | Open 19-chapter Sony Music India migration/reconciliation lane. |
| #1402 | Jordar DJ Garba Nonstop 2022 | Active bounded implementation of four research-verified routes. |
| #1406 | Garba Ni Ramzat 4.0 | Active bounded implementation of seven verified routes. |
| #1409 / PR #1415 | Maa Ashapura Na Garba track 2 | Open one-file exact Hemant Chauhan route `GyQpCs1SH5Q`. |
| #1432 | Rangili Ramzat 6 | Active implementation of five research-verified same-release tracks. |
| #1444 / PR #1454 | Ramzat 5 second-pass additions | New one-file PR proposes exactly +2 routes: `Arji Sunje Amari` and `Navarat Naveli Bani Albeli`; based on current main `252f074b...`. |

None of these proposed routes belongs in the merged 1,030 count until it lands and current-main coverage is rerun.

## Active YouTube research queue

Research-only lanes should make **zero production-file mutations**. Their job is to produce an implementation-ready exact-route subset and a precise fail-closed remainder.

Known active/recent research lanes include:

- #954: Tahukar 9 exact 12-track / long-form evidence boundary.
- #1059: `Garba No Rang Saajan Ne Sang, Vol. 1` exact 1993 programme evidence.
- #1351: Anand Vol. 8, 17 unresolved split tracks while preserving track 14.
- #1425: Rangoli Vol. 16, 23 canonical rows plus any authoritative exact full programme.
- #1434: Rangili Ramzat 8, 17 unresolved split tracks.
- #1439: Ramzat 5 second-pass research; it has already produced implementation child #1444 / PR #1454 for two proven routes.
- #1442: final three unresolved Killol 2.0 tracks.
- #1446: De Taali 1999, audit the 20 currently catalogued provider-backed playback rows without colliding with the separate 26-track catalogue-import lane.
- #1449: Amba No Darbar 2022, re-audit seven unresolved long album tracks while preserving the two exact routes already present.

Once a research lane proves routes, refresh current main, #364 and open PRs before creating the smallest possible implementation child. A research claim does not reserve the production manifest unless the follow-up implementation claim explicitly does so.

## Shared-file ownership constraints

Current file ownership matters more than issue priority. At this snapshot:

- `.github/browser/browser-smoke.spec.mjs` is owned by #969. Playback/catalogue agents must not edit it.
- `data/catalogue/index.json` is owned by #1383. New manifest-registration work that also needs the index must wait or be explicitly reconciled with that owner.
- `data/playback-sources-current.json` is owned by #1378. Other exact routes targeting that shared manifest must wait or narrow to a different unowned source file.
- `EXECUTION-LEDGER.md` is owned only by #1452 for this refresh.
- #364 reports no active cross-issue file conflicts at the snapshot. Same-issue rejected claims or later board changes still require direct inspection before coding.

Do not interpret an old issue saying “unclaimed” as permission to edit a file that #364 now assigns to a newer lane.

## Recent coordination hardening

### #1413 repository-structure validator repair

The original execution ledger exposed a repository-structure validator assumption that rejected the intentional root `EXECUTION-LEDGER.md`. #1413 updated that validator so the ledger is a supported repository artifact rather than a permanent unrelated CI failure.

### #1431 / #1405 RAAS ownership-history integrity

Merged current main `252f074b7ad534af1e77170165cb946de6d2b8f8` adds a fail-closed ownership-history mutation guard:

- watches accepted coordination comments for edits/deletions;
- records deterministic append-only integrity generations;
- ignores edits that do not change coordination meaning and mutations of originally rejected claims;
- neutralises ownership exposed by mutated history and installs a conservative machine-readable hold;
- requires explicit repository-owner reconciliation before reassignment;
- restores unresolved holds after close/reopen;
- serialises with the existing claim registry rather than replacing its proven state machine.

The focused integrity suite covered 11 scenarios and passed 11/11 before merge. The exact PR head also passed the repository validator and all applicable ownership, drift, hygiene and diff-scope checks.

This matters for the current high-concurrency YouTube programme: an accepted historical claim/release/override can no longer be silently rewritten into a different ownership outcome by editing or deleting its source comment.

## Burn-down method

Every remaining playback row should move through the same evidence funnel:

1. Prefer an exact full-song upload from the official label, official artist/OAC, Topic surface or authoritative distributor/rightsholder.
2. For long-form same-release uploads, accept a split route only when the source directly publishes the chapter start or the boundary is independently proven. Never calculate timestamps by adding track durations.
3. If the authoritative source proves only a continuous recording, model it as a continuous/Nonstop listening source. Do not manufacture 20–30 split-track routes.
4. Reject same-title performances, later re-recordings, covers, fan uploads and edition substitutions unless exact recording identity is independently proven.
5. Preserve stronger existing YouTube routes and separately authorised direct media governed by #976/#984/#985/#986.
6. For every unresolved row, record the rejected candidates and exact evidence gap. Fail closed.
7. After research proves routes, create the smallest unowned implementation child and keep the diff bounded to the claimed files.
8. Run focused source/route validation, repository validation and every required current-head gate. A red unrelated required gate is still a merge blocker until its owning lane resolves it.
9. Recalculate coverage after every route merge and every denominator-changing catalogue import.

## Integration order while #969 is active

1. Let #969 finish the shared desktop-WebKit Search/browser repair. Do not create competing browser patches.
2. Keep completed route PRs intact and documented rather than repeatedly rebuilding them while the shared gate remains red.
3. Continue non-mutating exact-recording research in independent release lanes.
4. Continue bounded route implementations whose files are unowned, but do not count or merge them around a required red gate.
5. Once #969 is green, reconcile parked route PRs against the then-current main one by one, rerun exact-head gates, merge only clean non-overlapping diffs, and recalculate coverage after each integration wave.
6. Run #355 final post-cluster reconciliation only after named research/implementation lanes and parked PRs settle.
7. Close #157/#221 only when every remaining consumer-provider gap is either exact-YouTube migrated or has a release-specific evidence boundary, with repository validation green.

## Agent task-selection checklist

Before taking any issue:

1. Fetch current `main` and record its SHA.
2. Read `AGENTS.md`, repository coordination instructions, #364, the target issue comments and open PRs touching the same paths.
3. Prefer finishing/reconciling existing bounded work over creating a duplicate route/research issue.
4. Claim exactly one implementation lane with exact semicolon-separated file paths.
5. If another active claim owns any required file, stop, narrow or wait. Do not broaden the claim to absorb the conflict.
6. Keep research-only work research-only until a separate production-file claim is accepted.
7. Do not state a route as merged coverage until it exists on current main.
8. Before PR readiness, reconcile against fresh main and prove the final diff contains only the claimed paths.
9. Keep the claim through integration unless the work is explicitly parked behind an external blocker; if parked, document the blocker and release the claim without deleting the completed PR.
10. After merge, verify issue closure/release and refresh #364 before selecting the next lane.

## Snapshot caveat

This ledger is deliberately descriptive, not authoritative. At this level of concurrency, issue/PR counts can change within seconds and the derived #364 board can lag a just-posted valid claim while its workflow is queued. Always use current #364 ownership history, current target-issue comments, current open PRs and fresh-main evidence for the actual decision.
