# Codex and Cloud Codex adapter

Codex should enter RAAS through `AGENTS.md` and then use the same repository/GitHub state as every other client.

## Start

1. fetch current remote `main` and remote branches;
2. read `AGENTS.md`, `.raas/BOOTSTRAP.md` and `.raas/CLIENTS.md`;
3. inspect issue #364, the target issue/comments and open PR overlap;
4. use `node scripts/raas-task.mjs` when a raw request needs deterministic routing or splitting;
5. post and re-check the machine-readable claim before implementation;
6. use one branch for one claimed lane;
7. execute the complete `.raas/EXECUTION.md` lifecycle.

## Do not create a Codex-only memory layer

Local notes, worktrees and session context may help execution, but they cannot replace GitHub issue claims, current repository files or merge/production evidence.

A Cloud Codex session and a local Codex session should be able to hand the same lane between them by reading GitHub state, without copying a private prompt history.

## Long-running backlog work

After one issue is merged, verified and released, fetch current state again before selecting another issue. Never reuse the previous branch or assume the next issue is still unowned.

Use `.raas/CLIENTS.md` for progress updates and operator interruption handling.