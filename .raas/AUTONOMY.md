# RAAS local autonomy contract

RAAS is the PlayGarba harness. It may learn from LEAPH, CLEO, ZEUS or another harness, but it is never controlled by them.

## Local authority

PlayGarba owns its own:

- product truth and cultural/catalogue semantics;
- GitHub issue claims, branch ownership and file ownership;
- graph vocabulary and graph freshness rules;
- context-routing and context-budget choices;
- UI/UX review rules;
- validation, CI, merge and production-verification rules;
- learned project doctrine.

No sibling repository, central service, shared graph database or shared claim registry may override those decisions at runtime.

## Federation boundary

Federation is reviewable knowledge exchange, not distributed mutable state.

RAAS may import a generic protocol idea, extractor pattern, failure mode, benchmark, context-compiler technique or test pattern only after local review. The adopted version becomes a RAAS rule with RAAS tests and RAAS provenance.

RAAS must not automatically import:

- another repository's active claims or locks;
- another project's product facts, requirements or evidence;
- private data, secrets or credentials;
- another harness's risk, reviewer, release or authority model;
- graph nodes or edges whose meaning is not valid for PlayGarba.

If a peer is unavailable, RAAS must still claim, route, validate and ship PlayGarba work correctly.

## RAAS-specific graph model

A future RAAS graph should prioritise relationships that help PlayGarba work:

`catalogue/release/track/artist -> genre and nonstop taxonomy -> provider/playback route -> player/queue -> Explore/search -> PWA/runtime -> artwork/background/media -> tests/issues`

Use PlayGarba-specific entities and source authority. Do not import LEAPH engineering requirements/interfaces, CLEO health/privacy entities or ZEUS CAD semantics merely because the generic graph protocol supports extension.

Deterministic and explicitly declared relationships may support hard checks when locally validated. Inferred relationships remain advisory.

## Context autonomy

RAAS compiles the smallest PlayGarba-specific context packet that is useful for the active lane. A peer harness may contribute a technique for context compilation, but never the project context itself.

The packet should favour current GitHub ownership state, current `main`, the target issue, canonical catalogue/product docs, relevant runtime files and exact validation paths. Do not load sibling repositories to execute an ordinary PlayGarba task.

## Operator and agent UX

A future RAAS status/doctor surface should use PlayGarba language and answer, concisely:

- what issue and branch is active;
- whether the claim is valid;
- whether any file/branch conflict exists;
- which PlayGarba domain is in scope;
- what direct files and review-only blast radius matter;
- what validation is relevant;
- what exact next action is safe.

Generic protocol fields may be shared, but user-facing wording and product-specific reasoning belong to RAAS.

## Failure rule

If federation, graph intelligence or another optional harness layer fails, degrade to RAAS's local canonical workflow. Never degrade ownership, source truth, rights handling or validation simply to keep cross-repository integration available.
