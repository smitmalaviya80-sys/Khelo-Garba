# Components, data-dense UI, performance, trust, and AI

Load this module for reusable components, tokens, tables/charts, state/loading architecture, performance, privacy, money, health, personal data, destructive operations, or AI features.

## Components are behavioural contracts

Specify purpose, anatomy, content constraints, variants, density, interaction states, loading/pending/error, keyboard, focus, pointer/touch, accessibility semantics, responsive behaviour, theming/tokens, overflow, and relevant empty/partial-data states.

Two components that look the same but differ in keyboard, loading, or validation behaviour are not one coherent system.

## Token discipline

Treat semantic tokens as the shared source for repeated decisions when the project uses a token system: colour, typography, spacing, size, grid, radius, border, elevation, opacity, motion, z-layer, and icon sizing. Prefer semantic intent over raw values. Do not create tokens for one-off values without a repeated or themeable decision.

## Component selection

Before custom UI: find the existing product primitive, find the native semantic control, check whether a small extension solves the need, then create a new component only if interaction/structure is genuinely distinct. Visual novelty alone is not a reason.

## Tables and dense data

Use a table when users compare rows and columns. Do not convert comparison data to cards merely because responsiveness is difficult.

Verify headers, row/column association, numeric alignment, units, non-destructive truncation, sort state, selection vs hover, keyboard interaction where required, bulk-action scope, and loading/empty/partial/error/large-data states.

On narrow screens choose horizontal comparison, prioritised columns, list-detail, drill-down, or stacked key-value presentation based on the task. Preserve comparison semantics.

## Charts and visualisations

A chart should answer a question faster than raw data. Verify title/question, units, scale, labels, legend, honest axes, colour-independent distinctions, interactive keyboard/touch access where relevant, text/data alternatives, loading/empty/error, and responsive label collision. Use the simplest chart that preserves the decision.

## State architecture

For network-backed content distinguish relevant initial, loading, refreshing, loaded, empty, partial, stale, optimistic-pending, queued-offline, syncing, failed, retrying, permission-denied, and auth-expired states. Do not erase useful loaded content during background refresh unless stale content is unsafe.

## Optimistic UI

Use optimistic updates only when failure is uncommon, rollback is possible, pending state is understandable where consequence matters, and duplicate commits are controlled. For high-consequence operations, do not visually declare success before authoritative confirmation unless pending is explicit and safe.

## Core Web Vitals

Unless project rules are stricter, current good field thresholds at the 75th percentile remain useful baselines: LCP <= 2.5 s, INP <= 200 ms, CLS <= 0.1. Field and lab evidence are different.

Inspect main-thread blocking, delayed handlers, hydration, layout shifts, media, fonts, render-blocking work, eager off-screen work, repeated requests, large DOMs, expensive effects, long input tasks, memory pressure, and cache/service-worker behaviour. Measure the critical task, not only the home route.

## Perceived performance

Respond quickly, keep stable existing content during safe refresh, reserve space, show proportionate progress, reveal useful partial results when supported, allow safe background work, and preserve user input. Do not mask slow architecture with animation.

## Trust and reversibility

For personal data, permissions, uploads, money, health, identity, destruction, or sensitive AI use: explain what is happening and why; minimise collection; show scope; distinguish draft/pending/committed; provide cancel/undo/retry where possible; prevent accidental duplication; preserve provenance/auditability where required; avoid manipulative defaults.

## AI features, informed by Apple's June 2026 guidance

AI is not automatically the right interaction. Use it for specific user value. Preserve a useful non-AI path where practical when AI is optional.

- **Transparency:** identify where AI is used. Do not present generated output as deterministic fact.
- **Agency:** allow dismiss, edit, refine, retry, revert, or meaningful alternatives where the task permits. Acknowledge corrections.
- **Uncertainty:** design for wrong, incomplete, unavailable, or unsafe output. Expose verification/provenance when consequence requires it.
- **Generation state:** use specific status where useful, allow cancellation when feasible, preserve requests, and provide clear failure/retry.
- **Feedback:** make it voluntary, quick, non-blocking, and privacy-aware.
- **Model independence:** separate UX contract from one model when feasible and retest on model changes.
- **Safety/inclusion:** test vague, adversarial, sensitive, culturally varied, and out-of-scope inputs. Do not infer sensitive attributes when users can provide necessary information.
- **High consequence:** domain-specific safety rules always outrank generic AI convenience.

## Permissions and privacy

Ask at the moment users can understand why permission is needed. Do not request access just in case. Design a degraded path when denial is a normal choice and the product can still function.

## Security-sensitive UI

Do not expose secrets in UI, logs, screenshots, or errors. Show affected account/object for sensitive changes, require re-auth only when justified, prevent accidental repeat actions where relevant, and never weaken security for visual consistency.

## Maintainability reaches users

Flag duplicate primitives, raw values bypassing tokens, copied state logic, contradictory labels, inaccessible custom controls, DOM-accident CSS, one-off breakpoints, magic animation timings, and route-specific patches to system problems. Prefer one clear contract over many local fixes.
