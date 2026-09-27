# Adaptive layouts, mobile ergonomics, and PWA

Load this module for phone, tablet, desktop, PWA, standalone web app, multi-window, orientation, foldable, or cross-browser work.

## Adapt to available space, not device names

Do not design one desktop layout and stack it vertically on smaller screens. Use content/task pressure to choose reflow, reveal, replacement, relocation, or pane expansion. Breakpoints should occur where the interface stops working, not only at popular device widths.

## Representative size matrix

For broad responsive web/PWA work, choose representative narrow phone, common phone, large phone, tablet/narrow window, laptop, desktop, large desktop, 400 percent zoom, and portrait/landscape where relevant. Project matrices can be stricter.

Do not claim real-device verification from desktop resizing when the outcome depends on browser chrome, touch, virtual keyboard, safe area, media playback, install mode, or OS capability.

## Apple 2026 adaptivity lessons

Apple's 2026 direction makes iOS apps more resizable and present in more window contexts. The general lesson is cross-platform: layouts must tolerate resizing and must not assume one fixed phone canvas.

On Apple platforms prefer adaptive standard containers/controls, support system text/accessibility settings, check safe areas and keyboard, and respect supported multi-window contexts.

## Android adaptive lessons

Current Android guidance uses adaptive reflow/reveal and canonical list-detail, feed, and supporting-pane layouts. On wider windows reveal meaningful supporting content instead of stretching a single column. Do not lock orientation without a task reason. Consider fold posture/hinge only for device classes the project supports.

## Mobile ergonomics

Put frequent touch actions in reachable locations without covering content. Separate destructive actions from frequent taps. Avoid hover-dependent discovery. Keep fields, labels/errors, and completion controls reachable with the keyboard open. Maintain clear back/cancel paths. Do not make swipe the only discovery path.

Bottom controls can improve reachability but must respect browser/PWA chrome, safe areas, virtual keyboards, and the product navigation model.

## Viewport and safe areas

Use dynamic/small/large viewport units deliberately. Avoid `100vh` patterns that clip behind browser chrome or keyboards. Respect safe-area insets when content reaches screen edges.

Test fixed/sticky UI during scroll, keyboard open/close, orientation change, browser-bar collapse/expand, and standalone PWA mode.

## Virtual keyboard

Focused fields and their labels/errors must stay visible. Fixed footers must not cover input. Scroll must not jump unpredictably. Closing the keyboard should restore a sensible layout. Use appropriate input types and autocomplete values defined by project requirements.

## Browser and engine coverage

Use the project support matrix. For broad consumer PWAs pay close attention to current Chrome/Chromium and Safari/WebKit differences in viewport/safe areas, sticky/fixed positioning, scrolling, forms/autofill, media, standalone mode, service workers, share/clipboard/file APIs, storage, focus, back-forward cache, and user preference media queries.

Do not polyfill by default. Use the simplest supported platform behaviour.

## PWA navigation and standalone mode

Verify deep links, refresh/state restoration, browser back/forward, standalone back behaviour, internal/external link boundaries, install-mode alternatives, readable system bars, truthful manifest identity, and justified orientation rules.

## Offline and weak connectivity

Do not show stale content as fresh. Classify cached data by whether it is safe, useful if labelled stale, must be fresh, sensitive, or unavailable offline.

For offline-capable flows distinguish queued, local, syncing, synced, and failed. Prevent duplicate submissions after reconnect, preserve user work, provide retry, and resolve conflicts deliberately. Never imply server completion before it happened.

If meaningful offline operation is not supported, fail clearly rather than presenting a broken shell.

## Installation and updates

Installation should be optional unless app-like capability truly requires it. Avoid interrupting first use with aggressive install prompts.

For service-worker updates avoid incompatible mixed versions, reload only when safe, preserve unsaved work, and explain material user action if needed.

## Mobile performance

Watch oversized images, unnecessary fonts/JavaScript, eager off-screen work, large DOMs, layout thrashing, expensive blur, excessive animation, media preloads, and blocking third parties. Optimise the critical task, not only the landing route.

## Resize continuity

On resize/rotation do not lose selection, media position, draft input, scroll context, focus, or temporary state without a product reason. Adaptivity is state continuity plus layout change.
