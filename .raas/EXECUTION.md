# RAAS execution lifecycle

This is the default lifecycle for implementation agents working through the PlayGarba backlog.

## 0. Interpret the request

Turn the user's request into an outcome, not a literal patch instruction.

Before implementation, identify:

- what user-visible or repository-visible result should improve;
- whether the request contains one reviewable lane or several;
- which repository sources control product truth;
- what must not change;
- how success can be verified.

If a broad request contains independent work, create or select separate implementation issues. Do not claim a programme/master issue as a catch-all lane.

## 1. Synchronise and inspect ownership

Always start from the current remote state.

1. fetch current `main` and remote branches;
2. read `AGENTS.md`, `.raas/RAAS.md`, this file and the relevant RAAS/domain context;
3. read issue #364;
4. inspect the target issue and all recent comments;
5. inspect open PRs for the same issue, feature, files, artist, release or runtime area;
6. inspect likely changed files before claiming when overlap is unclear.

An issue number alone does not prove the lane is free.

## 2. Select one safe issue

Prefer an open implementation issue that is:

- unclaimed;
- not already covered by an open legacy PR;
- bounded enough to review;
- non-overlapping with active file/scope claims;
- actionable from current repository evidence.

Skip issues that are blocked, purely coordinative, duplicates, or require product-owner decisions before safe implementation.

Do not optimise only for issue number order. Choose the next safe, useful lane.

## 3. Claim before coding

Use the exact repository claim protocol in `AGENTS.md` and `docs/operations/agent-coordination.md`.

The claim must state:

- stable agent ID;
- unique branch;
- exact scope;
- expected files/globs or `research-only`.

Post the claim, then refresh the issue comments. If an earlier active claim owns the lane, stop and select another issue.

Do not create a branch of implementation work first and attempt to reserve it later.

## 4. Build the implementation contract

Before editing, make the task concrete:

### Outcome

One sentence describing what becomes better.

### Acceptance criteria

Observable behaviour or repository state that must be true.

### Non-goals

Adjacent areas that should remain untouched.

### Truth sources

The canonical data/docs/code/evidence governing factual decisions.

### File boundary

Expected files. If the implementation needs to expand beyond the active claim, update the claim before editing additional overlapping areas.

### Validation

Commands and manual checks that will prove success.

## 5. Implement from evidence

Follow the repository's existing architecture and source-of-truth boundaries.

- Change canonical inputs rather than generated outputs where the repository has a build step.
- Preserve newer unrelated work.
- Do not restore old behaviour merely because a stale branch or screenshot contains it.
- Do not invent missing catalogue facts or provider identity.
- Fix the root contract when practical instead of layering a cosmetic patch over a broken underlying state.
- Keep the diff inside the claimed lane.

If implementation reveals that the issue is materially different from its description, update the issue/claim rather than silently broadening scope.

## 6. Validate proportionately

Run the narrow tests for the changed area first, then the repository-level checks required by the lane.

For code/runtime work, inspect `package.json` and use the actual project scripts. For catalogue work, rebuild generated data through the repository tooling.

Do not claim a command passed unless it ran in the current branch state.

If a check fails because of a known main-branch baseline, compare against current `main` before declaring a regression or ignoring it.

For visual or interaction changes, static validation alone is not enough. Use the appropriate browser/manual verification path when available.

## 7. Reconcile current main before review

Before opening or materially updating a PR:

1. fetch the latest remote `main` again;
2. inspect changes landed since the branch started;
3. reconcile without overwriting newer work;
4. re-run relevant validation after reconciliation.

If `main` now contains overlapping work, reduce or rework the lane. Do not force the older interpretation back in.

## 8. Open a reviewable PR

The PR must:

- reference the implementation issue;
- include `Agent-Claim: #<issue>` and `Agent-ID: <agent-id>`;
- explain the problem, solution and non-goals;
- list validation actually run;
- call out unresolved risks or manual verification still required;
- contain only the claimed lane.

A PR is a review state, not a completion state.

## 9. Resolve review and CI

Read all review comments and checks.

- Fix valid findings in the same lane.
- Do not dismiss failures merely to make the PR green.
- Do not add unrelated cleanup while responding to review.
- Re-run affected validation after changes.
- Confirm the PR head still matches the active claimed branch.

## 10. Merge safely

Merge only when repository rules, CI and review state allow it.

Immediately before merging, confirm the PR head has not moved unexpectedly and that newer `main` has not introduced an unresolved collision.

Never force-push shared branches or bypass repository protections to finish faster.

## 11. Verify the live result

For production-facing work, merge is not the final proof.

Verify the deployed/live behaviour after the merge reaches production. The exact check depends on the lane, for example:

- player interaction works on the production domain;
- Explore route renders and returns correctly;
- PWA/manifest asset is actually served;
- social/SEO metadata is present in the deployed page;
- a catalogue/playback route appears in the built production data;
- deployment points at the intended canonical domain.

If production verification fails, the issue remains incomplete. Open or continue the appropriate repair lane instead of reporting success.

Documentation-only or repository-internal changes may not require a production check. State that explicitly rather than inventing one.

## 12. Close and release

When the issue outcome is truly complete:

1. reconcile/close the implementation issue if automation did not;
2. post the exact `agent-release` block from `AGENTS.md`;
3. confirm the lane no longer appears as active ownership;
4. leave any follow-up work as new bounded issues rather than hidden TODOs.

Do not leave stale claims behind.

## 13. Continue the backlog loop

When the user asked the agent to keep working through issues, successful completion triggers a new preflight cycle:

`refresh main -> refresh issue board -> inspect open issues/PRs -> select next safe lane -> claim -> execute`

Rules for the next issue are identical to the first:

- no inherited claim;
- no inherited branch;
- no assumption that an issue remains unowned;
- no duplicate work because it was mentioned earlier in the session;
- no continuing into a broad parent issue without a bounded child lane.

Stop the loop only when:

- there is no safe actionable unowned issue;
- remaining issues require owner decisions or unavailable evidence;
- repository access/tooling prevents safe execution;
- the user explicitly changes the objective.

When stopping, report the concrete blocker and the state of any current claim. Never pretend the backlog is finished merely because the current lane is finished.