# Cursor adapter

Cursor should use RAAS as a thin repository rule, not as a copied mega-prompt.

## Thin rule content

If the project is configured with a Cursor repository/project rule, keep that rule to a pointer such as:

> Follow `AGENTS.md`, `.raas/BOOTSTRAP.md` and `.raas/CLIENTS.md` for all PlayGarba implementation work. Treat GitHub issue comments and issue #364 as ownership truth. Do not edit outside an accepted claim. Carry claimed work through validation, PR, merge and required production verification before reporting completion.

Do not duplicate `.raas/PROJECT-CONTEXT.md`, `.raas/LANGUAGE.md` or `.raas/EXECUTION.md` inside a Cursor-specific rule. That would create two doctrines that can drift.

## Start or resume

Before editing:

1. refresh the repository from current remote `main`;
2. read the canonical RAAS files;
3. inspect the current target issue, issue #364 and overlapping PRs;
4. claim the lane through GitHub before implementation;
5. keep edits inside the accepted file/scope boundary.

If Cursor does not have the GitHub permissions needed for issue claims, PRs, merge or production checks, perform only the supported portion and leave the exact unsupported completion gate visible. Do not represent a local edit as an end-to-end completed issue.

## Switching from another client

Do not continue from a copied ChatGPT/Codex summary alone. Reconstruct the active lane from GitHub issue comments, branch, PR and current `main` first.

Use `.raas/CLIENTS.md` for progress updates and interruption handling.