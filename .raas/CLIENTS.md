# RAAS client compatibility

RAAS belongs to the repository, not to an AI product.

ChatGPT Chat, Cloud Codex, local Codex, Cursor and other agents may expose different tools, but they must read the same PlayGarba context and use the same GitHub ownership state. Switching clients must not reset the project rules, create a second work registry or require the operator to reconstruct what another agent was doing.

## Canonical state

Every client uses these sources in this order:

1. current operator instruction;
2. current remote repository state;
3. `AGENTS.md` and `.raas/BOOTSTRAP.md`;
4. issue #364 and the target issue comment history for ownership;
5. the target branch/PR and current CI/review state;
6. `.raas/RAAS.md`, `.raas/PROJECT-CONTEXT.md`, `.raas/EXECUTION.md` and task-specific repository sources;
7. `.raas/LANGUAGE.md` for user-facing language.

Chat history is not canonical repository state.

## Capability levels

A client should adapt the lifecycle to what it can actually do.

### Full executor

The client can read and write the repository/GitHub, create branches, run or inspect tests, open PRs and verify merge/deployment state.

It may execute the full RAAS lifecycle end-to-end.

### Repository-aware operator

The client can inspect current repository/GitHub state but cannot perform every write or shell action.

It may understand, compile, review, coordinate and perform the actions its tools support. It must stop at the exact unsupported action rather than claiming that action happened.

### Context-only client

The client cannot access the current repository.

It may reason from supplied RAAS files or a supplied issue snapshot, but it must not claim ownership, current branch state, test results, PR state, merge state or production verification without evidence.

## Operator progress contract

For work that takes multiple steps, keep the operator informed at meaningful phase boundaries:

- ownership/preflight confirmed;
- implementation materially changed or a significant finding changes the approach;
- validation result;
- PR/review/CI state;
- merge and production verification result when applicable;
- blocker or next-lane selection.

Do not narrate every command or tool call.

## Operator interruption contract

The newest operator instruction takes precedence over an older interpretation of the task.

When a new instruction arrives during an active lane:

1. acknowledge and apply it immediately when it fits the existing claimed scope;
2. if it changes expected files or expands into another owned area, update or split the GitHub issue/claim before editing that area;
3. preserve work already safely completed unless the operator explicitly changes that decision;
4. never abandon an active claim silently;
5. never start a second overlapping implementation merely because the new instruction arrived in a different chat/client.

## Continuous backlog contract

When the operator asks an agent to keep fixing issues, the loop is:

`fresh preflight -> select safe issue -> claim -> implement -> validate -> PR -> review/CI -> merge -> production verification if applicable -> release -> fresh preflight`

The loop is instruction-driven, not runaway autonomy. A new operator instruction can redirect the next lane or modify the current one subject to ownership boundaries.

Stop only when there is no safe actionable unowned issue, a real blocker requires owner input/evidence, tools cannot perform a required action, or the operator changes the objective.

## Cross-client handoff

A new client or new chat should reconstruct state from GitHub rather than asking the operator to repeat the implementation history.

At minimum it should inspect:

- issue #364;
- the target issue and comments;
- active branch and PR;
- current `main`;
- current CI/review state;
- RAAS files on current `main`.

If a prior client stopped mid-lane and left an active claim, the new client must treat that claim as occupied unless it is explicitly the same continuing agent identity/branch or the owner performs a valid handoff/override.

## Minimal universal instruction

For a repository-aware agent, the operator should only need something as short as:

> Use the RAAS harness in `ruddvz/garba`. Work from current GitHub state and carry this request end-to-end: <request>

The agent then loads the repository instructions itself. Do not require the operator to paste the whole harness into every new client.