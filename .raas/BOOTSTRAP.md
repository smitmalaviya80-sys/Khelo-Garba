# RAAS universal bootstrap

Use this entry point from any capable agent environment: ChatGPT Chat with repository/GitHub access, Cloud Codex, local Codex, Cursor, Claude-style agents, CI agents or another tool that can read repository files and GitHub state.

The client is not the source of truth. The repository and GitHub issue state are.

## Bootstrap contract

When starting work on PlayGarba:

1. Read `AGENTS.md`, `.raas/RAAS.md`, `.raas/PROJECT-CONTEXT.md` and `.raas/EXECUTION.md`.
2. Read `.raas/LANGUAGE.md` if any user-facing words, metadata presentation, docs, SEO or public copy may change.
3. Fetch current remote `main` and current GitHub issue/PR state. Do not rely on chat memory, a stale local checkout or an old copied SHA.
4. Read issue #364, the target issue, all recent target comments and open PRs that may overlap by feature or files.
5. If the raw request is broad, compile it into a bounded task brief before implementation. Use `node scripts/raas-task.mjs --text "<request>"` when the script is available, or apply the same contract manually from `.raas/RAAS.md`.
6. Claim one safe implementation lane using the repository's machine-readable claim format. Refresh comments and confirm the claim is still the first active valid owner before coding.
7. Execute the full lifecycle in `.raas/EXECUTION.md`. Do not stop at code written or PR opened.
8. For long-running work, keep the operator informed at meaningful phase boundaries: ownership confirmed, implementation materially changed, validation result, PR/review state, merge state, production verification result and blocker/next-lane selection. Do not narrate every command.
9. If the operator sends new instructions while work is in progress, apply them immediately if they are compatible with the active lane. If they materially change scope or files, update/split the issue and claim before editing outside the owned boundary.
10. If the operator asked for ongoing backlog work, finish and release the current lane, then repeat preflight from fresh GitHub state before claiming the next issue.

## ChatGPT Chat

When ChatGPT Chat has GitHub/repository tools, it should fetch the live repository and issue state directly. It should not answer repository-specific implementation questions from remembered context alone when current repo state matters.

If ChatGPT Chat does not have repository access, provide this file or the repository URL plus the relevant issue. The agent can still follow RAAS, but it must not claim that repository writes, tests, PRs, merges or production checks happened unless it can actually perform or verify them.

## Codex and Cloud Codex

`AGENTS.md` is the normal entry point. It routes into canonical `.raas/` files. Codex-specific capabilities may execute the lifecycle, but they must not create a separate ownership or memory system.

## Cursor and other IDE agents

A thin client rule may point to this bootstrap and `.raas/RAAS.md`. The rule should not copy the full product context or language doctrine. If the client has no automatic repository-rule mechanism, paste the bootstrap instruction once and direct the agent to the canonical files.

## Vendor-neutral invariant

No client adapter may become authoritative for:

- issue ownership;
- current product truth;
- catalogue facts;
- release/artist identity;
- completion state;
- learned project doctrine.

Those stay in GitHub and the repository so switching clients does not reset or fork the harness.