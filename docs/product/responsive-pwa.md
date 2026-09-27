# Responsive and PWA behaviour

This document is the implementation contract for the live player shell and installable PWA. Catalogue collection remains separate so song/release work can continue without colliding with visual changes.

The product is fluid first. Breakpoints change behaviour only when the interaction model needs to change.

## Core invariants

These must remain true at every supported viewport:

- current song identity remains readable;
- Play/Pause remains the clearest action;
- Previous/Next, truthful progress, genre navigation and Explore remain reachable;
- long verified titles do not move the transport or surrounding layout anchors;
- the current high-resolution courtyard remains visually dominant when network conditions allow it;
- the YouTube video surface remains collapsed until explicitly opened;
- safe-area insets are respected;
- sheets and modals never trap the user behind browser or PWA chrome;
- touch targets remain large enough even when visual icons are small.

## Breakpoint strategy

### Desktop: above 1100px

- Show the full courtyard composition.
- Keep the player centred in the intended architectural opening.
- Search, share, My Garba/favourite, queue and other utilities remain compact. They do not become a second navigation bar.
- Explore/catalogue can use a centred translucent layer or dedicated catalogue route, but readable row width is capped on very wide monitors.
- Genre labels stay text-led.
- Hover refinements apply only inside a hover-capable media query.
- Keyboard focus is fully visible and is not hidden behind artwork effects.

### Tablet / compact desktop: 701-1100px

- Keep the same product, not a stretched phone layout.
- Typography and transport use fluid `clamp()` sizing.
- Explore/catalogue uses more of the available width while retaining readable row measures.
- Portrait tablets may use a higher artwork crop and narrower player measure.
- iPad portrait and landscape are first-class release layouts.
- Touch remains fully supported even when a tablet also reports pointer/hover capability.

### Phone: 700px and below

- Brand and essential utilities remain reachable at the top edge.
- Current song identity receives a fixed, bounded measure so title length cannot push transport vertically.
- Genre navigation scrolls horizontally instead of squeezing labels.
- Explore opens as a mobile bottom sheet where that is the current runtime behaviour.
- The explicit YouTube video surface opens only after the listener chooses the YouTube control.
- Bottom controls and sheets include home-indicator safe-area spacing.
- Avoid relying on browser `100vh` alone. Dynamic viewport sizing should prevent address-bar jumps.

### Short landscape screens

A height-based query handles rotated phones and short browser windows:

- reduce title scale and vertical gaps before removing useful controls;
- keep transport and genre navigation reachable;
- move Explore/secondary actions away from the architectural player centre when necessary;
- use sheet heights that preserve a useful song-list area without covering the whole interaction path;
- account for left/right landscape safe-area cut-outs.

## Stable player geometry

Track changes are expected to happen frequently, so track-dependent content must animate inside stable layout anchors.

- Reserve a bounded title area for the longest realistic verified title.
- Artist/meta text must not alter transport position.
- Time labels may appear/disappear only without changing the progress rail geometry.
- Genre selection may change colour/marker state but must not change item width, height or neighbouring positions.
- Explore keeps its placement across tracks and modes.
- Opening the YouTube surface must not permanently resize the base player after it closes.

## Mobile sheet states

The mobile browser can use four runtime states:

- `closed`: completely off-screen and non-interactive;
- `collapsed`: compact mini-player state where supported;
- `medium`: default browsing state;
- `full`: expanded search/browse state.

The drag handle, not the song list, owns sheet dragging so list scrolling and sheet dragging do not fight each other.

When the sheet acts as a modal surface:

- background player controls become inert;
- keyboard focus stays inside the sheet;
- closing restores focus to the control that opened it;
- Escape clears active search first only where that behaviour is deliberate, then closes the sheet;
- the sheet itself provides enough visual separation from the artwork without excessive blur.

## Input behaviour

### Touch

- Important controls target roughly 44px or more even when the visible icon is smaller.
- Do not hide essential actions behind hover.
- `:active` feedback uses a small transform/opacity response without layout shift.
- `touch-action` should prevent delayed/tangled gestures while preserving intended horizontal/vertical scrolling.

### Mouse and trackpad

- Hover is enhancement, not required discovery.
- Only run hover-specific transforms inside hover-capable media queries.
- Keep hover movement small so the pointer does not appear to chase a moving target.

### Keyboard

- Space/Enter activate the same underlying Play control logic as pointer/touch.
- Tab order follows visual/task order.
- Focus is restored after a modal/sheet closes.
- Escape behaviour is deterministic.
- No clickable non-semantic container should replace a button/link when native semantics work.

## Safe areas

Major edge controls use `env(safe-area-inset-*)` as appropriate for:

- iPhones with notch or Dynamic Island;
- home-indicator spacing;
- standalone PWA mode;
- landscape cut-outs;
- bottom sheets and the explicit YouTube video surface.

Safe-area padding is part of layout geometry, not a late visual patch.

## Motion

Motion follows the design-system contract:

- frequent control feedback generally completes in about 120-220ms;
- sheets/popovers generally complete in about 180-300ms;
- world/artwork crossfades can remain slower because they are environmental;
- track text exits before incoming text appears when transition is needed;
- controls do not crossfade or move just because metadata changes;
- movement-heavy effects prefer transform/opacity;
- rapid interactions are interruptible;
- `prefers-reduced-motion` removes non-essential movement while preserving useful state feedback;
- decorative work pauses while the page is hidden.

Never introduce `transition: all` on product controls.

## High-resolution courtyard loading

The production build contains the approved high-resolution courtyard visual library and lightweight fallbacks.

The visual loader should not preload the entire high-resolution pack at startup:

- promote only the currently visible/needed artwork during initial bootstrap;
- decode other high-resolution images on demand when the listener enters that context;
- deterministic song URLs may choose an approved alternate from the correct genre bucket;
- Save-Data and slow-connection signals keep lightweight fallbacks instead of forcing multi-megabyte downloads;
- failed high-resolution loads fall back without leaving a blank world;
- artwork promotion must not change player geometry.

If an adaptive 4K tier is added, it must remain optional, bandwidth-aware and on-demand. A high-DPI screen alone is not permission to preload every 4K image.

## PWA

`manifest.webmanifest` provides the installable app contract, including standalone display, launcher artwork, shortcuts and dark startup/background colours.

The service worker should separate content by update sensitivity:

- catalogue/discovery JSON: prefer fresh data so collection work becomes visible promptly;
- JavaScript, CSS and manifest: prefer fresh code so fixes are not trapped behind a stale installed shell;
- immutable artwork/icons: cache after first use;
- lightweight visual fallbacks: safe to retain with the shell where appropriate;
- high-resolution artwork: cache only when requested, not during install.

Navigation can fall back to the cached app shell/offline page when the network is unavailable. YouTube media itself is not silently downloaded for offline use.

## Installation UX

- Chromium-family browsers may use `beforeinstallprompt` where available.
- iOS Safari receives concise Add to Home Screen guidance.
- Installation nudges are suppressed after dismissal for a sensible interval.
- Install prompts never compete with an open Explore sheet, modal or YouTube surface.
- Standalone mode must be tested separately from Safari/Chrome browser mode because viewport and safe-area behaviour differ.

## Playback and OS media controls

One-tap in-app playback follows the current YouTube runtime contract. Other providers may remain as research/source evidence, but they are not presented as alternative executable runtime players.

Pointer, touch, keyboard and supported Media Session Play actions route through the same underlying player control state.

Media Session support should use browser-exposed actions where truthful and supported:

- play / pause;
- previous / next;
- seek backward / forward / to position only when the active source supports truthful seeking;
- lock-screen/control-centre metadata and approved PlayGarba artwork.

Unknown catalogue durations remain unknown instead of being shown as `0:00`.

## Explore and discovery resilience

The catalogue remains source-driven.

- Search begins with title/artist matching and may use taxonomy-aware discovery where implemented.
- Loading failure becomes an explicit retry state, not an indefinite spinner.
- Reconnection/stale-tab refresh must not wipe current playback or unexpectedly reset the listener's Explore context.
- Returning from song/release detail should preserve search/filter/scroll position.
- Nonstop sets keep their own transport/chooser behaviour rather than pretending to be ordinary single tracks.

## Performance checks

Before adding a visual effect, verify that it does not create interaction debt:

- no expensive full-screen blur on every state change;
- no high-frequency style changes that force unnecessary layout/repaint;
- no new high-resolution preload waterfall;
- no long animation blocking a second tap;
- no mobile first-paint jump after late runtime initialisation;
- no stale service-worker asset trapping after a release.

Visual richness is acceptable only when controls remain immediate.

## QA matrix before calling the product complete

Static CI covers deterministic document/runtime/data contracts. Real-device and real-browser visual/interaction QA remains a separate release gate.

Test at minimum:

- small iPhone in Safari;
- large iPhone in Safari;
- installed iOS PWA;
- Android Chrome and installed PWA;
- iPad portrait;
- iPad landscape;
- short phone landscape;
- desktop Safari;
- desktop Chrome;
- Firefox-class desktop browser;
- keyboard-only navigation;
- reduced-motion preference;
- increased-contrast preference where supported;
- offline, reconnect and stale-cache scenarios;
- Save-Data/slow-network behaviour;
- long verified title/artist combinations;
- ordinary song playback;
- Nonstop playback/chooser;
- opening and closing the explicit YouTube video surface.

Use bounded visual QA:

1. capture desktop and mobile states in one pass;
2. batch hierarchy, spacing, contrast, overflow, touch, focus, motion and stability defects;
3. fix the batch;
4. run one confirmation pass.

Do not mark a browser/device scenario as verified until it has actually been exercised in that environment.
