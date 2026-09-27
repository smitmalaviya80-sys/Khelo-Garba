# UI/UX validation and evidence

Load this module for audits, implementation completion, visual regression, release review, or deciding whether a UI claim is verified.

## Evidence hierarchy

Use the strongest available evidence for the claim: observed user-task behaviour; real device/browser or accurate engine execution; accessibility tree/keyboard/screen-reader behaviour; automated interaction/regression tests; performance measurements; visual screenshots/diffs; code inspection; static specification.

Different evidence answers different questions. A screenshot cannot prove keyboard behaviour. A typecheck cannot prove responsive layout.

## Before/after contract

For a defect fix capture route/surface, initial state, data condition, viewport/device, browser/engine, input mode, reproduction steps, observed failure, and expected behaviour. After the fix rerun the same conditions before broader regression checks.

## Responsive matrix

Choose representative tests from the supported range: narrow phone, common phone, tablet/narrow window, laptop/desktop, large width when material, 400 percent zoom on a primary flow, and orientation when relevant. Add real Safari/WebKit and Chrome/Chromium coverage when engine behaviour can change the outcome.

Do not claim physical-device verification from emulation when device-specific capability matters.

## Input matrix

Check relevant mouse/pointer, touch, keyboard, screen reader for custom/critical flows, and implications for other assistive input supported by the product. Hover is enhancement, never the only route to a critical action.

## State matrix

Mark each reachable changed state as verified, partially verified, blocked, failed, not applicable, or not inspected. Do not present untested states as implicitly green.

## Accessibility stack

Layer automated checks, keyboard, zoom/text, visual preferences such as reduced motion/high contrast/forced colours/dark mode/reduced transparency when relevant, and manual screen-reader checks for custom/critical interactions. Automated zero violations does not equal accessible.

## Visual regression

Visual regression is useful for layout, typography, spacing, colour, icon placement, breakpoints, and unexpected chrome. It is weak for interaction sequence, focus, announcements, performance, hidden state, and touch ergonomics.

Use stable fixtures. Never fabricate user-visible production claims to create a screenshot. Separate tolerated rendering noise from real layout change.

## Browser interaction tests

Automate durable user-visible contracts when the repository supports them: route entry, primary action, navigation, overlays, validation, recovery, back/forward, responsive critical controls, focus where reliable, and important offline/PWA behaviour. Avoid brittle assertions on incidental DOM structure.

## Performance evidence

Record environment, route/task, device profile if simulated, cache state, metric, and run count when variance matters. Distinguish lab from field. Do not declare field-dependent performance fixed from one local run.

## Severity

- **P0:** core task blocked, severe data loss/privacy/safety risk, or critical path unusable.
- **P1:** major task failure, frequent severe friction, or widespread accessibility/responsive failure.
- **P2:** meaningful friction, inconsistency, incomplete state, or repeated system debt.
- **P3:** craft improvement with limited task impact.

Severity is consequence, not visual prominence.

## Finding template

**ID:**
**Severity:**
**Lens:**
**Surface:**
**Observed:**
**Evidence:**
**User impact:**
**Diagnosis:**
**Recommendation:**
**Acceptance:**
**Evidence state:**

Group symptoms under one root cause when appropriate.

## Completion checklist

For requested scope check primary task, important states, responsive sizes, keyboard/focus, accessibility, project tokens/components, content, performance implications, trust/safety when relevant, automated project checks, rendered behaviour where tooling permits, exact-failure retest, nearby regressions, critique pass, and explicit remaining work.

A UI/UX task is not complete because code compiles or one screenshot looks correct.

## Independent review

For medium/high-consequence changes prefer a second reviewer when the repository supports it. The reviewer should try to disprove the result from another route, size/input mode, error state, keyboard/assistive technology, changed content length, stale/offline/expired state, and system-drift angle.

## Report format

Finish with Result, Verified, Critique resolved, Remaining, and Next when the project requires a next-step handoff. Never hide missing evidence behind confident language.
