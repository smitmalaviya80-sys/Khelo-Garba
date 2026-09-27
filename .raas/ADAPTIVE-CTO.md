---
name: raas-adaptive-cto
version: 1.0.0
project: PlayGarba
status: executable-v1
issue: 776
---

# RAAS Adaptive CTO

## Mandate

RAAS is PlayGarba's repository CTO layer. It should spend the smallest amount of context, tool work, agent work and verification that can safely prove the requested outcome, then escalate only when new evidence can change a decision.

Efficiency never outranks source truth, ownership safety, rights, current-head evidence or the user's requested delivery stop.

## Runtime

The first executable classifier is:

```bash
node scripts/raas-adaptive.mjs --text "<request or issue text>"
node scripts/raas-adaptive.mjs --json --text "<request or issue text>"
node scripts/raas-adaptive.test.mjs
```

It wraps the existing `scripts/raas-task.mjs` compiler rather than replacing it. The existing compiler still owns domain routing and source/file hints. The adaptive layer adds execution depth and work ceilings.

## Decision axes

Every actionable task is classified independently on:

- mode;
- risk;
- blast radius;
- reversibility;
- uncertainty;
- requested delivery stop;
- truth sensitivity.

These axes matter separately. A tiny code diff can still be deep or critical when it touches source identity, rights, PWA state or production. A question about a critical subsystem does not itself authorise a critical mutation.

## Tiers

The runtime currently emits `fast`, `standard`, `deep` or `critical`.

Tier configuration lives in `.raas/adaptive-cto.json`.

Every number in that file is a **ceiling, not a consumption target**. An agent does not earn quality points by exhausting a budget. It should stop below the ceiling as soon as the required decision and proof are complete.

Critical work may exceed a soft context/tool ceiling only when the extra work is needed for protected truth or proof, and the reason must remain visible.

## Value-of-information gate

Before spending another significant unit of work, ask:

> Can this additional source, tool call, method or agent plausibly change the implementation, source truth, ownership decision, verification requirement or final recommendation?

If the answer is no, skip it.

This applies to:

- reading another large document;
- repeating a repository/provider search;
- dispatching another research agent;
- adding another reviewer beyond the required tier;
- running a broader validator or browser pass;
- continuing critique after the acceptance criteria are already proven.

Protected evidence is different. If source identity, rights, ownership, deployment or current production behaviour still requires proof, that work has decision value even when it is expensive.

## Context order

Prefer, in order:

1. the exact canonical record, symbol or changed file;
2. the current issue and live ownership state;
3. the narrow authoritative domain source;
4. the bounded graph slice from `.raas/GRAPH.md` when implemented and current;
5. broader repository search;
6. a full long document only when the narrower paths cannot answer the task.

Do not inject the same rule repeatedly from `AGENTS.md`, `RAAS.md`, project context and a domain document. Preserve the highest-authority representation and pointers to deeper sources.

## Source-first exception to cheapness

Catalogue and playback facts are not optimised by 'close enough'.

Do not save tokens by:

- guessing an artist, release, edition or year;
- accepting a playable URL as exact recording identity;
- using a neighbouring release's route for an unknown track;
- inferring redistribution rights from availability;
- converting discovery/presentation metadata into canonical truth.

When exact truth cannot be proven inside the allowed lane, keep the state fail-closed and report the blocker.

## Tool routing

Choose tools by proof capability, not prestige.

Prefer:

- deterministic/local validation when it proves the claim;
- direct repository/API/source evidence over browser automation when equivalent;
- browser/manual verification only when visual, interaction or live behaviour cannot be proven statically;
- stronger reasoning only when architecture, ambiguity or coupled state actually benefits from it.

Do not dispatch multiple agents to rediscover the same evidence.

## Parallelism

The default mutation budget is one lane per claimed issue.

Parallel work is useful when it is:

- read-only and independent;
- isolated behind different accepted issue claims;
- independently verifiable;
- able to converge into one compact evidence packet before shared mutation.

Cancel or redirect redundant research once decisive evidence exists. More agents are not a substitute for a missing source or owner decision.

GitHub issue comments and issue #364 remain ownership authority. Adaptive classification cannot claim, release or override work.

## Verification frontier

The adaptive layer selects a starting frontier, not a replacement for RAAS gates:

`focused -> affected subsystem -> repository/CI -> current-head proof -> live production`

Domain-specific proof is added when needed, including:

- exact source/runtime route checks for playback;
- canonical source/generated-output checks for catalogue changes;
- rights provenance checks;
- browser/manual checks for visual/interaction acceptance;
- live production verification when that is the requested delivery stop.

Stop at the requested delivery point once the required proof is green. Do not stop at an open PR when the user requested merge/live completion, and do not deploy when the user requested only a plan.

## Adaptive escalation

Raise the tier when new evidence shows:

- the task needs multiple independent lanes;
- source/rights truth is more sensitive than expected;
- the PWA/player/runtime blast radius is wider than expected;
- the final diff exceeds the planned impact envelope;
- current ownership conflicts appear;
- verification exposes a new coupled failure;
- the requested stop moves to production.

Graph sparsity or a small diff never lowers protected source, rights or production requirements.

## Stop rules

Stop consuming work when:

- acceptance is proven at the requested stop point;
- another source/tool has low expected decision value;
- the same repair is repeating without new diagnosis;
- the task must split before safe mutation;
- a source/owner blocker is the real missing input;
- the next action exceeds the requested delivery stop.

## Learning without prompt bloat

Reusable local/federated lessons should contain only concise failure modes, decisions and evidence references, never hidden chain-of-thought.

An active lesson should have:

- trigger;
- exclusion/non-applicable case;
- evidence/source revision;
- confidence;
- last validation/use;
- supersession or archive state.

Stale or duplicate lessons should leave the active context budget rather than accumulating forever.

## Efficiency telemetry

Only privacy-safe aggregate metrics should be retained for optimisation. Do not retain raw private prompts, hidden reasoning, credentials or unrelated personal data.

Useful aggregates include tier, routes, context size, source/tool count, cache reuse, agent count, validation count, repair rounds, escalation reasons and completion state.

The optimisation target is **quality per unit of work**, not lowest token count.

## Current integration boundary

This v1 is deliberately additive.

It does not modify:

- `.raas/RAAS.md` or autonomy files owned by issue #662;
- `.raas/GRAPH.md` owned by issue #738;
- `scripts/raas-task.mjs`;
- `package.json`;
- production runtime.

After v1 tests and review are proven, the adaptive result can be integrated into the normal RAAS preflight/compiler path under a separately reconciled ownership scope.

## Completion rule

The classifier and tests are only the first executable layer. Issue #776 is complete only after tests actually execute, review resolves misclassifications, integration is wired into RAAS preflight, representative tasks demonstrate lower redundant work, and source/ownership/completion correctness does not regress.
