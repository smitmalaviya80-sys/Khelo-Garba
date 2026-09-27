# PlayGarba player release acceptance

Status: active release gate
Owner programme: #452
Design programme: #311

This document replaces subjective claims such as “perfect”, “looks good” or “works on mobile” with a finite, evidence-backed release gate for the canonical player at `https://playgarba.com/` and its listening handoffs.

It does not make unrun tests green. A row without an exact tested revision, environment and evidence is `NOT RUN` or `BLOCKED`.

## Result vocabulary

- `PASS` — acceptance was exercised on the stated revision/environment and evidence is linked.
- `FAIL` — the journey was exercised and one or more acceptance conditions failed. Link an issue before release.
- `BLOCKED` — the journey cannot be evaluated because a prerequisite, environment or test infrastructure is unavailable. Link the blocker.
- `NOT RUN` — the journey has not yet been exercised on the candidate revision.
- `N/A` — the row genuinely does not apply to that environment. Include a reason.

A release candidate is not accepted while any P0 journey is `FAIL`, any accessibility-critical journey is `FAIL`, any primary control is clipped/overlapped, or any exact playback identity is silently substituted.

## Evidence contract

Every executed row must record:

1. candidate commit SHA;
2. production/preview URL or local production-equivalent fixture;
3. device/browser and version;
4. viewport or physical device orientation;
5. result (`PASS` / `FAIL` / `BLOCKED` / `NOT RUN` / `N/A`);
6. screenshot, video, trace or log link where the row has visual/state acceptance;
7. linked issue for every failure or blocker that affects release.

Do not reuse evidence from an older SHA as sign-off for a newer candidate unless the row is explicitly source-only and the relevant files are byte-identical.

## Current programme blockers

These are dependencies, not blanket excuses to skip unrelated rows.

| Area | Current owner / blocker | Release consequence |
| --- | --- | --- |
| Truthful initial/restored playback and automatic continuation | #437 | P0 playback rows cannot be finally signed off until reconciled. |
| Browser smoke infrastructure | #415 | Automated browser matrix remains partially blocked until the runner is reliable. |
| Now Playing title geometry | #440 | Long-title and compact-layout rows need final pass after merge. |
| Mobile utilities / genre reachability | #441 | Mobile navigation rows remain open. |
| Keyboard, focus and screen-reader behaviour | #442 | Accessibility sign-off remains open. |
| PWA update/offline active-session behaviour | #451 | Update/reconnect rows remain open; bounded offline fallback work can land independently. |
| Explore interaction/runtime lanes | #390, #405, #638 | Explore return/search/detail rows need final pass after owning changes settle. |
| Cold mobile startup | #602 | Performance rows require the strict first-usable-shell harness; retired SVG preloads remain a blocker until the owning runtime fixes them. |

## Critical journey matrix

The `Status` column is intentionally initialized conservatively. Update it only with evidence from the candidate being signed off.

| ID | Priority | Journey | Acceptance | Status | Revision | Environment | Evidence / issue |
| --- | --- | --- | --- | --- | --- | --- | --- |
| P-01 | P0 | Cold first visit, verified playable song | Player presents the exact selected recording; Play is enabled only for a truthful executable YouTube route; geometry is stable. | NOT RUN | — | — | #437 |
| P-02 | P0 | Restored playable session | Saved canonical identity restores without substituting another recording; route readiness matches hydrated state. | NOT RUN | — | — | #437 |
| P-03 | P0 | Restored unavailable recording | Exact unavailable identity stays visible; Play does not pretend to work; alternative is explicit rather than silent substitution. | NOT RUN | — | — | #437 |
| P-04 | P0 | Explicit unavailable/deep-linked recording | Identity remains exact before and after hydration; fail-closed playback state is understandable. | NOT RUN | — | — | #437 |
| P-05 | P0 | Ordinary automatic continuation | Next eligible recording is truthful/playable and canonical IDs remain stable. | NOT RUN | — | — | #437 |
| P-06 | P0 | Manual Previous / Next | Controls move through the intended context without duplicate identity, dead route or layout jump. | NOT RUN | — | — | #437 |
| P-07 | P0 | YouTube stage open / close | Stage opens only from explicit user intent, remains valid size, closes predictably, and base player geometry returns unchanged. | NOT RUN | — | — | #408 / #491 |
| P-08 | P0 | Background / resume during playback | Provider/player state remains truthful after tab/app backgrounding and return; no phantom playing state. | NOT RUN | — | — | #491 |
| N-01 | P0 | Nonstop set start | Selected continuous recording keeps its canonical set identity and exact verified route. | NOT RUN | — | — | — |
| N-02 | P0 | Nonstop verified chapter transition | Chapter movement remains within the same continuous recording and uses source-published boundaries only. | NOT RUN | — | — | — |
| N-03 | P1 | Nonstop resume | Resume position/chapter is truthful after reload/reopen and never becomes a different recording. | NOT RUN | — | — | — |
| N-04 | P1 | Two long-form sets end-to-end | Exercise at least two real verified long sets through multiple transitions; no stuck controls or false duration. | NOT RUN | — | — | #452 |
| E-01 | P1 | Open Explore from player | `/explore/` opens without stale song-sheet semantics and player state remains recoverable. | NOT RUN | — | — | #390 / #638 |
| E-02 | P1 | Search in Explore | Search keyboard/input state is usable, results are truthful and empty/error states are explicit. | NOT RUN | — | — | #390 |
| E-03 | P1 | Play a result from Explore | Exact selected recording reaches the player; no ID/edition substitution. | NOT RUN | — | — | #405 |
| E-04 | P1 | Explore detail / tracklist | Visible tracklist matches canonical imported data and uncertainty/incomplete imports remain explicit. | NOT RUN | — | — | #405 |
| E-05 | P1 | Return from detail/player | Search/filter/collection/scroll context is restored predictably. | NOT RUN | — | — | #390 / #638 |
| L-01 | P1 | Very long verified title + artist | Now Playing anchors do not shift controls, clip text unexpectedly or overlap progress/genre rail. | NOT RUN | — | — | #440 |
| L-02 | P1 | Unknown duration | Timeline does not invent duration or seekability; disabled state remains understandable. | NOT RUN | — | — | — |
| M-01 | P1 | Mobile utility reachability | Search, Save, My Garba, Queue and Share follow the current product contract and required actions are reachable within the accepted action count. | NOT RUN | — | — | #441 |
| M-02 | P1 | Six genres + Nonstop on narrow phone | Every destination is reachable without clipped actionable content; selected item remains discoverable. | NOT RUN | — | — | #441 |
| M-03 | P1 | Home-indicator / notch safe areas | Primary controls, sheet actions and provider stage avoid unsafe inset regions. | NOT RUN | — | — | #441 / #491 |
| A-01 | P0 | Keyboard-only primary player | Tab order is logical; Enter/Space activate only the focused control; no global shortcut fires behind a modal. | NOT RUN | — | — | #442 |
| A-02 | P0 | Focus through open/close sheet | Focus enters predictably, cannot disappear behind modal content, Escape/close works, and focus returns to the opener. | NOT RUN | — | — | #442 |
| A-03 | P0 | Focus through YouTube/provider stage | Dialog semantics/state are announced; focus and Escape/close are predictable; base player does not receive accidental actions. | NOT RUN | — | — | #442 / #491 |
| A-04 | P1 | Screen reader Now Playing | Title, artist, play state, unavailable state, progress truth and control names are understandable without visual context. | NOT RUN | — | — | #442 |
| A-05 | P1 | 200% text | Primary listening journey reflows without clipped controls or lost information. | NOT RUN | — | — | #442 |
| A-06 | P1 | 400% zoom / narrow reflow | Essential actions remain reachable; no two-dimensional scrolling is required for ordinary operation. | NOT RUN | — | — | #442 |
| A-07 | P1 | Reduced motion | State remains understandable with movement-heavy effects removed; no required transition becomes invisible. | NOT RUN | — | — | #311 |
| A-08 | P1 | Increased contrast | Text, focus rings and controls remain distinguishable. | NOT RUN | — | — | #311 |
| O-01 | P1 | Launch while offline | Cached interface/fallback is truthful: interface may be cached, but YouTube playback requires internet. | NOT RUN | — | — | #451 |
| O-02 | P1 | Lose network while open | Offline/network state is visible without generating a false playable state; reconnect path is recoverable. | NOT RUN | — | — | #451 |
| O-03 | P1 | Reconnect after offline | Refresh/retry returns to current product without stale identity or broken controls. | NOT RUN | — | — | #451 |
| U-01 | P1 | Service-worker update during idle session | New shell can become available without trapping the user on a broken mixed revision. | NOT RUN | — | — | #451 |
| U-02 | P0 | Service-worker update during active playback | Update does not unexpectedly destroy an active listening session; behaviour is explicit and tested. | NOT RUN | — | — | #451 |
| S-01 | P1 | Share current state | Shared URL/metadata refers to the intended canonical PlayGarba state and opens without a different recording. | NOT RUN | — | — | #441 |
| F-01 | P1 | Save current song vs My Garba | Labels/icons distinguish saving the current recording from opening the saved library; saved IDs remain canonical. | NOT RUN | — | — | #441 |
| Q-01 | P1 | Queue add/remove/reorder/next | Queue actions preserve canonical recording IDs; automatic movement never executes an unavailable route. | NOT RUN | — | — | #437 |
| R-01 | P1 | Recoverable catalogue/network error | Error is explicit, Retry is reachable by touch/keyboard, and recovery does not duplicate state. | NOT RUN | — | — | — |

## Viewport and platform matrix

Each critical journey does not need every environment, but the candidate release must cover the representative combinations below. Platform-dependent rows must run on the real platform rather than being inferred from Chromium emulation.

| Environment | Required coverage | Status | Revision | Evidence / blocker |
| --- | --- | --- | --- | --- |
| 320px-wide phone browser | Player geometry, utility reachability, genre rail, sheet, 200% text | NOT RUN | — | #441 / #442 |
| 390×844 phone browser | Full ordinary player, Explore handoff, queue/save/search, YouTube stage | NOT RUN | — | #441 / #442 |
| Small iPhone Safari | Safe areas, address-bar changes, sheets, focus, playback handoff | BLOCKED | — | Real-device evidence required |
| Large iPhone Safari | Long title, provider stage, landscape rotation, installed PWA | BLOCKED | — | Real-device evidence required |
| Installed iOS PWA | Launch/resume, safe area, update/offline, keyboard where applicable | BLOCKED | — | Real-device evidence required |
| Android Chrome | Touch, browser chrome changes, provider stage, reconnect | BLOCKED | — | Real-device evidence required |
| Installed Android PWA | Shortcut launch, resume, offline/update, back behaviour | BLOCKED | — | Real-device evidence required |
| iPad portrait | Player geometry, Explore/detail, keyboard focus | NOT RUN | — | — |
| iPad landscape | Reflow, safe area, stage/sheet geometry | NOT RUN | — | — |
| Short phone landscape | Primary controls, genre rail, Explore entry, provider stage | NOT RUN | — | #441 |
| 1440px desktop Chrome | Full player, keyboard, Explore, stage, share/save/queue | NOT RUN | — | — |
| Desktop Safari | Playback handoff, keyboard, provider stage, layout | BLOCKED | — | Real Safari run required |
| Desktop Firefox | Keyboard, layout, media/provider handoff where supported | NOT RUN | — | — |
| Reduced motion | Player, sheet, artwork state, stage | NOT RUN | — | — |
| Increased contrast | Text, controls, focus and disabled progress | NOT RUN | — | — |
| Save-Data / constrained network | Cold shell, artwork requests, catalogue hydration, provider deferral | NOT RUN | — | #602 |

## Cold-start release budget

Performance sign-off uses request shape plus timing evidence. Runner speed alone is not a reliable hard gate.

Before the first usable player shell on a cold constrained-mobile run:

- full `data/songs.json` must not be required;
- no retired six-world SVG background should be requested;
- no more than one approved high-resolution background should start;
- the player shell must expose truthful identity and controls before full catalogue hydration;
- timing must be reported for the exact test profile and revision, not rounded into an unsupported “instant” claim.

The dedicated #602 startup harness is the source of truth for this boundary.

## Geometry assertions

Visual evidence should check stable anchors, not pixel-perfect screenshots across engines.

A release fails geometry acceptance if any tested critical viewport shows:

- Play, Previous, Next, Explore or a required close action clipped or covered;
- Now Playing title/artist changing the transport or progress baseline unexpectedly;
- a modal/sheet leaving actionable base-player controls reachable when they should be inert;
- YouTube/provider stage overlapping the home indicator or becoming smaller than its supported minimum;
- horizontal page overflow caused by player controls (the intentional genre rail scroll is not page overflow);
- focus ring clipped so the focused action cannot be identified.

## Release decision

Use this block for each candidate rather than editing historical results away.

### Candidate: pending

- Revision: `—`
- Date: `—`
- Production/preview: `—`
- Decision: `NOT RUN`
- P0 failures: `—`
- Accessibility-critical failures: `—`
- Blocked required environments: `—`
- Linked defects: `—`
- Sign-off evidence: `—`

A candidate can be marked `ACCEPTED` only when:

1. every P0 journey is `PASS` on the candidate or an explicitly byte-identical relevant revision;
2. accessibility-critical rows are `PASS`;
3. no primary-control geometry overlap remains in required viewports;
4. at least two verified long-form Nonstop recordings have been exercised through chapter transitions;
5. a representative mix of exact single-song YouTube routes has been exercised;
6. required real-device/platform-dependent rows are not silently substituted with emulation;
7. remaining non-blocking defects are linked and consciously deferred.
