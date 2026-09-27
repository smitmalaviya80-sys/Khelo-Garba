---
name: product-ui-ux
version: 2.0.0
research_baseline: 2026-09-09
description: Evidence-driven product UI/UX operating method for auditing, designing, implementing, and verifying interfaces across web, mobile, PWA, desktop, and adaptive surfaces. Load only the reference modules that can change the result. Project product truth and safety rules always outrank this method.
---

# Product UI/UX v2

Treat an interface as a working product, not a screenshot. Visual craft matters, but it never substitutes for task completion, accessibility, responsiveness, truthful state, performance, recovery, or trust.

This skill is a method layer. It is not a brand system and it does not make products look like Apple, Google, Microsoft, IBM, GitHub, Atlassian, Adobe, or any other reference product.

## 1. Authority

Before making a UI/UX decision, load the narrowest project sources that govern the surface:

1. current user outcome and bounded issue or task;
2. product and domain truth;
3. safety, privacy, legal, clinical, financial, or data rules;
4. current design tokens, components, content rules, and platform support;
5. live rendered behaviour and current implementation;
6. this skill and only the reference modules relevant to the task;
7. external design references.

When guidance conflicts, the more specific authoritative project rule wins. Never average conflicting rules.

## 2. Choose the smallest mode

- **Audit:** inspect and report. Do not mutate.
- **Focused fix:** reproduce one problem, fix its root cause, retest.
- **Flow review:** trace one task from entry through completion, recovery, and return.
- **Component review:** inspect one reusable component across variants, states, inputs, and sizes.
- **System review:** inspect primitives, tokens, interaction contracts, and repeated patterns.
- **Whole-product review:** inventory the few primary tasks, routes, components, and system primitives, then work in bounded priority batches.

Do not turn a focused request into an unsolicited redesign.

## 3. Load references on demand

Do not preload every module.

- For product direction, hierarchy, visual language, heuristics, or design-system decisions, load `references/FOUNDATIONS.md`.
- For accessibility, keyboard, screen readers, focus, contrast, zoom, or multimodal input, load `references/ACCESSIBILITY.md`.
- For mobile, tablet, desktop, PWA, safe areas, orientation, foldables, resizing, or offline behaviour, load `references/ADAPTIVE-PWA.md`.
- For controls, gestures, motion, search, forms, navigation, dialogs, feedback, or content, load `references/INTERACTION-CONTENT.md`.
- For tokens, components, dense data, perceived performance, AI, privacy, or trust, load `references/SYSTEMS-PERFORMANCE-AI.md`.
- For audit evidence, browser/device matrices, visual regression, severity, or completion, load `references/VALIDATION.md`.
- For source provenance and research maintenance, load `SOURCES.md`.

## 4. Operating sequence

### A. Frame the user task

State the user or audience, desired outcome, primary action, entry point, completion state, important constraints, high-consequence steps, supported platforms, and input methods. If the interface serves more than one audience, do not merge their goals into one generic flow.

### B. Inspect before judging

1. Use the rendered product when available.
2. Walk the task before studying implementation details deeply.
3. Record the actual route, state, viewport, device/browser, input mode, and data condition inspected.
4. Inspect the implementation only after observing behaviour.
5. Identify the project token, component, state, data, navigation, and content contracts responsible for what you observed.

Code-only review cannot prove visual quality. Screenshot-only review cannot prove interaction quality. One happy path cannot prove flow quality.

### C. Test the reachable state space

For important flows and components, inspect reachable default, hover where applicable, focus, pressed, selected, disabled, pending, loading, empty, partial-data, long-content, validation-failure, service-failure, stale, offline, permission-denied, capability-unavailable, auth-expired, interrupted, cancelled, retry, success, and recovery states as relevant.

Do not invent product data to fill a screenshot. Do not skip a reachable state because test data is convenient.

### D. Diagnose root causes

Group duplicate symptoms under the smallest responsible contract: information architecture, flow/state model, component API, token/styling rule, content, data timing, performance, routing, event handling, platform adaptation, or accessibility semantics.

Do not layer another workaround on top of conflicting implementations when the underlying contract can be repaired.

### E. Prioritise

Use severity, frequency, user consequence, affected audience, confidence in diagnosis, recurrence, and effort. Do not use fake numerical precision when evidence is qualitative.

### F. Implement only when authorised

Reuse project primitives and tokens first. Remove obsolete or unnecessary UI when subtraction solves the problem. Preserve user input and state when recovery is reasonable. Do not silently broaden scope.

### G. Retest the exact failure

Re-run the same route, state, viewport, input mode, and data condition that exposed the defect. Then test the nearest regression surfaces.

### H. Critique the result

Ask what became worse: task length, discoverability, density, legibility, accessibility, performance, brand coherence, state integrity, maintainability, privacy, or safety. Fix material regressions and retest.

## 5. Non-negotiable quality gates

For the requested scope, do not report verified unless the relevant gates have evidence.

1. **Purpose:** the primary user goal and action are clear.
2. **Flow:** the user can enter, complete, cancel, recover, and return as appropriate.
3. **State:** important reachable states are understandable and reversible where possible.
4. **System:** existing tokens and primitives are reused or a justified system change is made.
5. **Responsive:** the interface adapts rather than merely shrinking or stacking.
6. **Input:** pointer, touch, keyboard, and other supported input modes work coherently.
7. **Accessibility:** semantics, focus, contrast, text scaling, announcements, and motion preferences are addressed.
8. **Content:** labels describe actions and consequences; copy does not compensate for unclear controls.
9. **Performance:** interaction remains responsive and loading behaviour tells the truth.
10. **Trust:** permissions, personal data, money, health, AI output, destructive actions, and uncertainty receive proportionate safeguards.
11. **Evidence:** findings and completion claims point to inspected behaviour, tests, metrics, or code.
12. **Regression:** the exact defect and the nearest affected surfaces were retested.

## 6. Cross-industry reference principles

Use current external guidance as evidence, not as a visual template.

Apple's 2026 design principles are a useful decision framework: Purpose, Agency, Responsibility, Familiarity, Flexibility, Simplicity, Craft, and Delight. Apply the intent, not Apple surface styling.

Nielsen Norman's usability heuristics remain useful for checking system status, real-world language, user control, consistency, error prevention, recognition over recall, efficiency, restraint, error recovery, and help.

Material 3, Fluent, Primer, Atlassian, Spectrum, Carbon, GOV.UK, USWDS, and W3C/WAI provide additional evidence for adaptive layouts, components, tokens, content, accessibility, and validation. A mature method triangulates across sources rather than treating any one company as universal.

## 7. Anti-pattern filter

Challenge these patterns unless the product and task justify them:

- cards nested inside cards;
- excessive pills, badges, chips, shadows, or floating containers;
- gradients, blur, glass, or translucency used as decoration rather than hierarchy;
- giant introductory copy that delays the task;
- decorative icons with no information value;
- repeated sections with identical visual weight;
- animations on every state change;
- fabricated dashboards, metrics, reviews, prices, names, claims, or social proof;
- vague helper copy next to controls that should be self-explanatory;
- duplicated calls to action;
- unnecessary tabs, carousels, accordions, sheets, or modals;
- mobile layouts that merely stack the desktop interface;
- hidden core actions behind unlabeled icons;
- custom controls that duplicate a native semantic element without a real need;
- inaccessible drag-only, hover-only, colour-only, or gesture-only interactions;
- skeletons or spinners that conceal a stalled or avoidable wait;
- AI output presented as deterministic fact when the model can be wrong.

The reviewer is authorised to recommend removal. Simplicity is often subtractive.

## 8. Evidence format for findings

Every actionable finding should contain ID, severity, surface, observed problem, evidence, user impact, root cause or best current diagnosis, recommendation, acceptance check, and evidence state.

Evidence states: verified, partially verified, inferred, blocked, failed, or not inspected.

Severity:

- **P0:** core task blocked, severe safety/privacy/data-loss risk, or critical path unusable for an affected user.
- **P1:** major task failure or widespread high-consequence accessibility/responsive defect.
- **P2:** meaningful friction, inconsistency, state gap, or system debt.
- **P3:** craft improvement with limited task impact.

Do not inflate visual polish into P0/P1. Do not bury task blockers among polish notes.

## 9. Completion language

Never report "perfect." Use verified, partially verified, blocked, failed, or not inspected. A compile, lint pass, screenshot, or automated accessibility scan alone is never enough to verify an interaction change.

## 10. Research freshness

This version was researched on 2026-09-09. `SOURCES.md` records the baseline.

Recheck external guidance when the task depends on a current platform release, platform/accessibility/PWA/AI guidance has materially changed, a platform-specific component is being introduced, or more than six months have passed since the last research refresh.

Do not rewrite project UI just because an external design system changed.
