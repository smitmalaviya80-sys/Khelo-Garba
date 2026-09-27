# RAAS compact kernel

Machine contract: `.raas/kernel.json`.

This is the smallest cross-cutting RAAS context. It points to current authority instead of copying the full project, autonomy, graph, catalogue or execution doctrine. Load deeper sources only when the compiled task's `context_queries` show that they can change scope, truth, ownership, implementation or verification.

Required invariant IDs:

- `source-first-truth` -> `.raas/RAAS.md`
- `no-invented-catalogue-facts` -> `.raas/PROJECT-CONTEXT.md`
- `claim-before-code` -> `AGENTS.md`
- `canonical-inputs-before-generated` -> `.raas/RAAS.md`
- `pr-is-not-completion` -> `.raas/EXECUTION.md`
- `verified-results-only` -> `.raas/RAAS.md`
- `client-neutral-truth` -> `.raas/BOOTSTRAP.md`

The JSON contract stores an exact anchor for each invariant. Adaptive RAAS validation must fail closed when a required invariant disappears, its source path becomes invalid, or the controlling source no longer contains that anchor.

This kernel is not ownership evidence. Before repository mutation, refresh the target implementation issue, recent comments, issue #364 and overlapping open pull requests. It is also not a replacement for route-specific source truth. Catalogue, playback, rights, visual, PWA and deployment work must load the narrow current sources selected for that lane.
