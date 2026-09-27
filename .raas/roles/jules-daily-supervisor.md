Audit the current PlayGarba GitHub backlog and agent coordination state.

Do not modify product code during this task.

Fetch current `main` and inspect:

- AGENTS.md
- issue #364
- open implementation issues
- open pull requests
- active claims
- stale claims
- branch drift
- file ownership
- issue dependencies
- CI state

Classify open issues into:

READY_FOR_JULES
ACTIVE_ELSEWHERE
BLOCKED
RESEARCH_ONLY
MANUAL_OR_EXTERNAL
MASTER_OR_COORDINATION

For READY_FOR_JULES, rank candidates using this order:

1. P0 correctness/security/reliability
2. P1 user-facing defects
3. failing CI or regressions
4. performance
5. accessibility
6. contained catalogue work with complete evidence
7. maintenance
8. P2 enhancements

Prefer:

- small bounded issues
- clear acceptance criteria
- available files
- no unresolved dependencies
- fixes that reduce user-visible defects
- work that can be completely validated in the Jules environment

Reject anything that requires guessing, external legal judgement, physical-device certification, repository administration, DNS changes or unresolved factual music research.

Return the best three candidates, but recommend starting only the highest-ranked safe candidate.

For each candidate report:

Issue:
Priority:
Why now:
Files likely involved:
Ownership status:
Dependencies:
Validation available:
Risk:
Jules suitability:

Also report stale claims and PRs that need human/owner reconciliation.

Do not automatically release another agent's claim merely because it appears stale.
