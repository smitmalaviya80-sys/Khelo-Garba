# Generic repository-agent adapter

Any agent that can read repository files can use RAAS. Vendor-specific features are optional.

## Minimum bootstrap

Read:

1. `AGENTS.md`
2. `.raas/BOOTSTRAP.md`
3. `.raas/CLIENTS.md`
4. `.raas/RAAS.md`
5. `.raas/PROJECT-CONTEXT.md`
6. `.raas/EXECUTION.md`
7. `.raas/LANGUAGE.md` when user-facing language may change

Then inspect current GitHub ownership and task state before implementation.

## Required behaviour

- use current repository/GitHub state rather than model memory;
- convert broad requests into bounded reviewable lanes;
- claim before editing when the agent can write GitHub state;
- never overlap an active issue/branch/file lane;
- preserve source uncertainty instead of inventing facts;
- run/verify the tests or checks it claims to have run;
- treat PR creation as an intermediate state;
- verify merge and production behaviour when applicable;
- release ownership at completion/handoff;
- repeat a fresh preflight before the next backlog issue;
- surface meaningful progress and obey new operator instructions without silently expanding ownership.

If the client cannot perform a required action, stop at that gate and state what remains. The harness is still usable for context and review, but incomplete tool access does not turn an unperformed action into a completed one.