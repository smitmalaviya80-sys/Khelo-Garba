# RAAS

RAAS is the PlayGarba implementation harness. It gives every agent the smallest useful set of context needed to make correct product decisions, execute one issue safely, and carry that issue all the way to a verified result.

RAAS is client-agnostic. ChatGPT Chat, Cloud Codex, local Codex, Cursor and other repository-capable agents should all use the same repository doctrine and GitHub ownership state. Client-specific instruction files may point into RAAS, but they must not fork its product truth or issue state.

RAAS does not replace repository documentation, issue ownership, CI, review, or product evidence. It routes agents to the right source and makes the execution lifecycle explicit.

## Load order

Before implementation, read in this order:

1. `AGENTS.md`
2. `.raas/BOOTSTRAP.md`
3. `.raas/RAAS.md`
4. `.raas/PROJECT-CONTEXT.md`
5. `.raas/LANGUAGE.md` when user-facing words, metadata presentation, onboarding, docs, SEO, social preview text or UI labels may change
6. `.raas/skills/product-ui-ux/SKILL.md` when visual, UI, UX, accessibility, responsive, interaction, motion, layout, or design-system work is in scope
7. `.raas/EXECUTION.md`
8. the target issue, all recent issue comments, issue #364, open PR overlap, and the repository docs relevant to the claimed files

Read `.raas/AUTONOMY.md` and `.raas/autonomy.json` for harness federation, cross-repository learning, graph-protocol adoption, or any proposal that could make RAAS depend on another harness. Do not load them for ordinary product work.

Do not preload the whole repository. Load deeper docs only for the lane being implemented. The product UI/UX skill is a review method, not a replacement for `.raas/PROJECT-CONTEXT.md`, `docs/product/design-system.md`, or current implementation truth.

## What RAAS protects

RAAS exists to prevent six common failures:

- **context drift:** an agent solves the literal prompt but damages what PlayGarba is trying to become;
- **fact drift:** plausible-looking artist, release, rights, playback or catalogue claims are invented instead of sourced;
- **voice drift:** product copy becomes generic, promotional, culturally sloppy or inconsistent;
- **coordination drift:** multiple agents solve the same issue or edit the same lane in parallel;
- **completion drift:** an agent stops at code written or PR opened instead of reaching merge and production verification where applicable;
- **client drift:** switching from Codex to ChatGPT, Cursor or another agent silently changes the rules or loses repository truth.

## Source authority

Use the narrowest authoritative source available.

1. The current user request defines intent and desired outcome.
2. The claimed GitHub issue defines the bounded implementation contract.
3. `AGENTS.md` and `docs/operations/agent-coordination.md` define ownership and concurrency rules.
4. Canonical repository data and domain docs define factual truth.
5. Existing production code defines current behaviour, not necessarily desired behaviour.
6. Discovery leads, old branches, old screenshots, comments and external sources are evidence inputs, not automatic canonical truth.

When sources conflict, do not average them. Identify the conflict and prefer the more authoritative, current source. If the conflict affects product behaviour or factual claims and cannot be resolved from repository evidence, keep the uncertainty visible.

## Request to execution contract

A raw request is often broader than one safe implementation lane. Before coding, rewrite it into this contract:

- **Outcome:** what should be measurably better for the user?
- **Scope:** the smallest reviewable lane that can deliver that outcome.
- **Non-goals:** adjacent work that must not leak into this lane.
- **Truth sources:** files, docs, issue evidence or provider evidence that control factual decisions.
- **Likely files:** paths or globs expected to change.
- **Risks:** playback, catalogue identity, rights, PWA, navigation, accessibility, mobile layout, SEO, deployment or coordination risks.
- **Validation:** exact commands and manual checks that prove the change.
- **Completion:** PR merged, deployment/live behaviour verified when applicable, issue state reconciled, claim released.

When available, compile the request deterministically before implementation:

```bash
node scripts/raas-task.mjs --text "<request or issue text>"
```

Use `--json` for machine-readable output. The compiler only routes context and identifies likely scope/risk. It never claims an issue, invents product facts, or replaces inspection of current GitHub state.

If the request spans multiple independent lanes, create or select child issues. Never use one broad master issue as permission for parallel overlapping implementation.

## Core invariants

- PlayGarba is a Garba music discovery and listening product backed by a source-first catalogue.
- Unknown catalogue facts stay unknown until evidence supports them.
- Do not copy commercial audio into the repository without documented redistribution rights.
- Playback routes must be truthful to recording/release identity. A playable link is not automatically the correct link.
- Long-form, nonstop and live material are first-class, not edge cases to flatten into ordinary tracks.
- Generated catalogue/runtime aggregates are outputs. Edit their canonical inputs and rebuild through repository scripts.
- Preserve the user's current product direction even when older code or docs reflect a previous direction. Resolve material conflicts explicitly instead of silently restoring old behaviour.
- Do not create duplicate work. Issue comments and the active claim board control ownership.
- Do not report a test, build, merge, deploy or production result that did not actually run or get verified.
- Do not depend on hidden chat memory for current repository truth.

## Done means done

For an implementation issue, "done" normally means:

`understand -> claim -> implement -> validate -> reconcile current main -> open/update PR -> review/CI -> merge -> verify production when applicable -> close/reconcile issue -> release claim`

A PR URL alone is not completion.

After a lane is fully completed and released, an agent asked to work through the backlog should return to preflight and select the next open, unowned, non-overlapping implementation issue. The next issue gets a fresh claim and fresh branch. Never carry ownership forward implicitly.

## Local harness autonomy

RAAS may learn reviewed generic harness techniques from sibling repositories, but ordinary PlayGarba execution has zero runtime dependency on those repositories. Product truth, issue ownership, graph vocabulary, context routing, UI/UX rules, validation and release authority remain local to RAAS.

If federation or graph intelligence is unavailable, fall back to the canonical RAAS lifecycle. Never weaken claim, catalogue truth, rights or validation rules merely to keep a cross-repository integration running. Full boundary: `.raas/AUTONOMY.md`.

## Keep RAAS small

RAAS is a routing layer, not a second copy of the repository. Add a rule here only when it prevents recurring cross-cutting mistakes. Put detailed domain knowledge in the existing canonical docs and point to it from RAAS.
