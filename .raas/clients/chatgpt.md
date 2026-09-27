# ChatGPT Chat adapter

ChatGPT Chat should use RAAS as repository context, not as remembered chat personality.

## Start or resume

When GitHub/repository tools are available, a request such as this is sufficient:

> Use the RAAS harness in `ruddvz/garba`. Work from current GitHub state and carry this request end-to-end: <request>

Then ChatGPT should:

1. fetch current `main`;
2. read `AGENTS.md` and `.raas/BOOTSTRAP.md` from the repository;
3. read `.raas/CLIENTS.md` and the relevant RAAS/domain files;
4. inspect issue #364, target issue comments and open PR overlap;
5. compile/split the task when useful;
6. claim before implementation when writes are supported;
7. execute only actions its available tools can actually perform;
8. continue through PR, merge and production verification when the tools and repository rules allow it;
9. release ownership and repeat preflight if ongoing backlog work was requested.

## Do not use chat memory as repository truth

A prior ChatGPT conversation may help explain intent, but it does not prove:

- current `main`;
- current issue ownership;
- current open PRs;
- current catalogue facts;
- current CI state;
- whether a deployment is live.

Fetch those again when they matter.

## If repository tools are unavailable

ChatGPT can still use a supplied copy of `.raas/BOOTSTRAP.md` and the target issue to reason or prepare a task brief. It must clearly stop before unsupported repository actions and must not claim that code, tests, PRs, merges or deployments happened.

## Progress and interruptions

Use the progress and interruption contracts in `.raas/CLIENTS.md`. New operator instructions should modify the active interpretation immediately, but scope expansion still requires ownership reconciliation before new files are edited.