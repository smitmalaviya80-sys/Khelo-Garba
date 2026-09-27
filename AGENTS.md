# GARBA agent rules

These rules apply to every automated or human implementation agent working in this repository.

## Load the RAAS harness first

RAAS is the compact PlayGarba context and execution harness. Before implementation, read:

1. `.raas/RAAS.md`
2. `.raas/PROJECT-CONTEXT.md`
3. `.raas/EXECUTION.md`
4. `.raas/LANGUAGE.md` whenever user-facing copy, labels, metadata presentation, docs, SEO or public text may change

RAAS does not replace the ownership protocol below. It explains the product, source authority, language system and end-to-end completion loop so an agent does not stop at a locally correct patch or an open PR.

When the user asks an agent to keep working through the backlog, finishing one lane means returning to preflight and selecting the next safe open, unowned, non-overlapping implementation issue. Every new lane requires a fresh claim and branch.

## Before touching code

Do not start implementation until the work is claimed.

1. Fetch current remote `main`. Never reset or overwrite newer work.
2. Read issue #364, **[Agent Board] Active work claims**.
3. Read the target issue and all recent comments.
4. Check open pull requests for the same issue, feature, release, artist, files or runtime area.
5. If the target is a broad `MASTER`, programme or multi-phase issue, do not use it as a shared implementation lane. Create or select a non-overlapping child issue first.
6. Post a machine-readable claim on that child/implementation issue before coding:

```text
<!-- agent-claim
agent: <agent-id>
branch: <branch-name>
scope: <short exact scope>
files: <paths/globs or "research-only">
-->
CLAIM: <agent-id> owns this lane on <branch-name>.
```

7. Re-read the issue comments after posting. The first valid claim that has not been released owns the lane. If another active claim is earlier than yours, stop and choose another issue or ask for the scope to be split.
8. Re-read #364 after the coordination workflows reconcile. If your issue is listed under **Cross-issue file ownership** or has the `agent:file-conflict` label, do not edit the overlapping files. Narrow the claim or wait for the earlier owner to release them.
9. Work only on the scope and files in your accepted claim. Expand scope only after updating coordination and confirming there is no overlap.

A GitHub assignee is not enough. Multiple agents can operate through the same GitHub account, so the issue comment claim and branch are the ownership identity.

## One lane, one owner

- One implementation issue has one active agent claim at a time.
- One active claim has one branch, and an active branch may belong to only one active issue claim at a time.
- Declared file ownership is serialized across issues. An earlier active claim owns an overlapping path before a later claim, even when the issue numbers differ.
- Legacy PRs that predate the claim system own the files already changed by those PRs until they merge or close.
- `research-only` does not reserve repository files.
- Parent/master issues coordinate children. They are not permission for several agents to edit the same area.
- Existing open PRs that predate this system count as active ownership even if they do not have a claim comment yet.
- Do not create a second PR for an already-owned issue or sub-scope.
- Do not take over an abandoned-looking lane by assumption. Claims do not expire automatically. The owner must release it, the PR/issue must close, or the project owner must explicitly override it.

## Claim hygiene without automatic expiry

Concrete file claims should not become silent permanent locks when implementation has stopped. The claim-hygiene workflow reviews active claims without changing ownership.

- A concrete claim with a matching open PR is considered actively implemented and is not aged into review.
- Recent commits on the claimed branch count as activity before a PR exists.
- `research-only` claims are exempt because they reserve no repository files.
- A concrete claim with no matching open PR and no observed claim, heartbeat or branch activity for the configured review window is labelled `agent:claim-review` and appears under **Claims needing review** on #364.
- `agent:claim-review` is a warning only. It does not release the claim and is not permission for another agent to take over the lane.
- To keep a legitimate long-running no-PR lane fresh, push current branch work, post a same-owner claim update, or post a heartbeat:

```text
<!-- agent-heartbeat
agent: <agent-id>
branch: <branch-name>
status: <short current progress or blocker>
-->
HEARTBEAT: lane is still active.
```

- A heartbeat changes no scope, files, ownership order or branch identity. It only confirms that the current owner is still actively holding the lane.
- If work has become evidence-only, narrow the claim to `research-only`. If implementation stopped, release the lane instead of posting empty heartbeats indefinitely.

## While working

- Rebase/reconcile from current `main` before opening or updating a reviewable PR.
- If newer `main` contains work that overlaps your claim, preserve the newer work and reduce your scope rather than restoring your old diff.
- If another PR starts touching your claimed files for a different issue, document the collision on both issues before continuing.
- If the file-conflict guard marks your claim as later ownership, stop editing those paths instead of racing the earlier branch.
- Keep catalogue/data research separate from UI, deployment and product lanes unless the issue explicitly requires both.

## Pull requests

Every new PR governed by this system must include:

```text
Agent-Claim: #<issue-number>
Agent-ID: <agent-id>
```

The PR head branch must match the branch in the active issue claim. The coordination checks reject a PR with no claim, a released claim, a conflicting claim, a branch mismatch, a reused active branch, a later claim that overlaps files already reserved by an earlier active claim or legacy PR, or actual changed paths that fall outside the active claim's declared file patterns.

## Release the lane

When the work is merged, abandoned or handed off, post:

```text
<!-- agent-release
agent: <agent-id>
branch: <branch-name>
-->
RELEASE: lane is available.
```

Do not leave a claim active after you stop working.

## Core UI & Experience Invariants (Do Not Revert)

These design decisions are locked and must not be reversed or compromised by any agent:
1. **Distinct Player Views**: The Simple player keeps the 2K royal palace courtyard artwork (`assets/backgrounds/library/`) and its existing controls. Immersive replaces that renderer with the complete Garbo prototype, including its venue scene and controls, while the production player remains mounted as the playback owner. A visible Simple/Immersive switch sits below More in each view; never combine the two visual renderers.
2. **Clean Topbar**: Do not add live presence counters, user count badges ("118 in the circle"), or extraneous badges to the topbar. The topbar contains only the brand link and utility controls.
3. **Explore Pure Text & Chevron**: The Explore control beneath the genres displays the "Explore" text stacked cleanly above the downward chevron (`<svg class="browse-chevron">`), without a pill button, border, or background box.
4. **Genre Strip Alignment**: The genre strip (`#genreStrip`) must remain tucked directly against the bottom perimeter of the round floor mandala (`margin: -24px auto clamp(2px, 0.5vh, 6px) !important;`).
5. **Sponsor Removed**: The inactive sponsor button is completely removed from the UI.
6. **Bilateral YouTube Attribution**: The "Streaming via YouTube" attribution is fixed at bottom-right as clean text and icon without a border, pill, or container box, symmetrically balancing `24/7 LIVE`.
7. **Packaging Contract**: Never import standalone scripts into `app.js` unless they are explicitly deployed in `.github/workflows/pages.yml` and validated in `validate-runtime-packaging.mjs`.

Full protocol and conflict examples: [`docs/operations/agent-coordination.md`](docs/operations/agent-coordination.md).
