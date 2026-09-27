# RAAS completion contract

RAAS must not confuse activity with completion. A local patch, passing narrow test, open PR or even a merge can still leave an implementation lane unfinished.

This contract is client-neutral. ChatGPT, Codex, Cursor or another agent fetches current GitHub/repository state with whatever tools it has, converts that evidence into the record below, and can then evaluate it deterministically with `scripts/lib/raas-completion.mjs`.

The evaluator does not call GitHub, merge PRs, claim issues or choose work by itself. GitHub issue comments and issue #364 remain ownership truth.

## Completion record

```json
{
  "issue": {
    "number": 484,
    "state": "closed"
  },
  "claim": {
    "active": false,
    "released": true,
    "agent": "chatgpt/example",
    "branch": "harness/example"
  },
  "validation": {
    "status": "passed",
    "evidence": ["Validate GARBA: success"]
  },
  "pr": {
    "required": true,
    "number": 500,
    "state": "closed",
    "merged": true,
    "head_branch": "harness/example"
  },
  "production": {
    "applicable": false,
    "verified": false,
    "reason": "Repository-internal harness documentation only"
  },
  "blockers": []
}
```

## Completion rules

A lane is `complete` only when all required gates are true:

- the implementation issue is closed/completed;
- the active claim has been released and is no longer active;
- validation passed on the final reconciled branch state;
- when a PR is required, it is merged and closed;
- production-facing work has a verified live result;
- when production verification is not applicable, the record says why;
- there are no unresolved blockers.

A lane is `blocked` when one or more explicit blockers prevent completion. Missing ordinary gates without a blocker are `incomplete`.

An open or unmerged PR can never produce `complete`. A merged production-facing change without live verification can never produce `complete`. A closed issue with an active unreleased claim can never produce `complete`.

## Production applicability

Use `production.applicable: true` for changes that alter deployed player behaviour, Explore/general pages, PWA assets, metadata served in production, hosting, DNS, runtime catalogue output or another live user-facing artefact.

Use `production.applicable: false` only when live verification genuinely does not apply, such as repository-internal harness doctrine or a research-only evidence document. A non-empty `reason` is required.

Do not use `applicable: false` as a shortcut because production verification is inconvenient.

## Validation evidence

`validation.status` is normally `passed` or `failed`. A lane with no relevant validation should use `not_applicable` only with a non-empty `reason`; the evaluator treats a reasoned `not_applicable` as satisfied. Do not claim `passed` unless the recorded checks actually ran.

## Safe next-issue snapshot

The same module can filter a fresh candidate snapshot after the current lane is fully released:

```json
{
  "candidates": [
    {
      "number": 501,
      "title": "Example implementation issue",
      "state": "open",
      "coordination_only": false,
      "actionable": true,
      "blocked": false,
      "active_claim": false,
      "open_pr_overlap": false,
      "priority": 50
    }
  ]
}
```

The client preparing this snapshot must first refresh issue #364, target issue comments and open PRs. The helper cannot infer ownership from stale data.

Candidates are excluded when they are closed, coordination-only, non-actionable, blocked, actively claimed or already represented by an overlapping open PR. Remaining candidates are sorted by higher numeric priority first, then lower issue number.

The helper only recommends. It never posts a claim, creates a branch or starts implementation. The chosen issue still requires the full RAAS preflight and claim sequence.

## Commands

Evaluate one lane:

```bash
node scripts/lib/raas-completion.mjs evaluate --file completion.json
node scripts/lib/raas-completion.mjs evaluate --json --file completion.json
```

Filter a fresh next-issue snapshot:

```bash
node scripts/lib/raas-completion.mjs candidates --file candidates.json
node scripts/lib/raas-completion.mjs candidates --json --file candidates.json
```

Run focused self-tests:

```bash
node scripts/lib/test-raas-completion.mjs
```

## Cross-client handoff

A new chat/client should rebuild this record from current GitHub state instead of trusting a previous chat summary. If the evidence cannot be fetched, the client should report the exact unverified gate rather than marking the lane complete.