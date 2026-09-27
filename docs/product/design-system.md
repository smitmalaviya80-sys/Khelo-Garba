# Design system

This document is the product-quality contract for PlayGarba. It applies to the canonical player, Explore/catalogue, supporting culture/help pages and the installable PWA.

The goal is not to copy a generic music app or a fashionable design reference. PlayGarba should feel culturally specific, calm, tactile and deliberate. The artwork carries the atmosphere. Interface chrome exists only when it helps someone listen, discover or understand.

## Design read by surface

| Surface | Primary job | Design behaviour |
| --- | --- | --- |
| Canonical player / entry | Operate + experience | The courtyard is the world. Transport is obvious, stable and visually light. |
| Explore/catalogue | Operate + read | Fast scanning, clear metadata hierarchy, one-tap playback and preserved context. |
| Garba guide / About / FAQ / Install | Read | Editorial hierarchy, restrained imagery and minimal decorative chrome. |

When a design decision helps one surface but harms its primary job, the primary job wins.

The product should not require a separate marketing homepage to explain the player. The player can be the primary entry experience, with Explore and supporting culture/help routes carrying the rest of the information architecture.

## Core visual idea

One Gujarati courtyard, multiple listening moods. Architecture, camera and player placement stay stable. Genre changes alter approved artwork, lighting and atmosphere instead of rebuilding the interface.

The current high-resolution courtyard library is the visual source of truth. Retired lightweight world artwork may remain as runtime fallback material, but visible first paint should use the current approved artwork wherever the loading contract allows it.

## Music worlds

The six presentation worlds are:

| Genre | Direction |
| --- | --- |
| Traditional | warm amber, maroon, antique-brass detail |
| Dandiya | restrained violet and magenta rhythm accents |
| Devotional | crimson, marigold and candle/brass warmth |
| Folk | earthy plaster, indigo textiles and peripheral percussion |
| Sanedo | playful but restrained Gujarati craft colour |
| Fusion | contemporary light, lavender accents and modern geometry |

Nonstop is a listening mode, not a seventh visual world.

## Visual hierarchy

1. Current artwork and song identity.
2. Primary Play/Pause action.
3. Previous/Next and truthful progress.
4. Genre and Explore navigation.
5. Secondary utilities such as search, favourite, queue/share and the explicit YouTube video control.

Do not give secondary utilities more visual weight than the current song or transport.

## Colour

- Use one stable dark interface palette across genres.
- Warm ivory is the primary text colour. Avoid harsh white for large bodies of text.
- Brass/gold is a restrained accent, not a surface fill.
- Genre artwork can be colourful. The interface itself should not recolour wholesale when genre changes.
- Never introduce a new accent colour just to make a control look important.
- Text, buttons, fields and focus states must meet WCAG AA contrast.

## Typography

- Song and cultural/editorial display text may use the established editorial serif where it reinforces the heritage character.
- Controls, metadata, navigation and dense discovery UI use the system sans stack so the PWA has no font-network dependency.
- Keep title width and line count bounded. A long verified title must not move transport, progress, genre navigation or Explore.
- Use sentence case for product copy. Avoid decorative all-caps except short eyebrows/kickers.
- Body copy should remain readable at roughly 60-70 characters per line on editorial pages.
- Do not mix font families merely to emphasise one word. Use weight or italic from the same family.

## Shape and materiality

PlayGarba is not a collection of floating cards.

- Use elevation only when it communicates a real layer, such as a sheet or modal.
- Player transport should remain open over the artwork rather than sitting inside a large opaque card.
- Buttons can use compact geometry when they need a boundary, but avoid mixed pill/card/circle chrome without a reason.
- Keep one corner-radius rule per surface. Do not alternate square, soft, pill and circular containers arbitrarily.
- Prefer spacing, typography and thin dividers over extra card containers.
- Large blur is expensive and visually muddy. Use backdrop blur only for surfaces that genuinely overlap artwork.

## Player composition

### Stable anchors

The following positions are structural anchors and must not jump when the track, artist, duration, provider state or genre changes:

- song title block;
- artist/meta block;
- Previous / Play-Pause / Next transport;
- progress rail and time labels;
- genre rail;
- Explore affordance.

Outgoing and incoming text may animate inside a fixed measure. The surrounding player geometry must remain stable.

### Transport

- Play/Pause is the focal action.
- Previous and Next are visually quieter but remain easy to hit.
- Visual icon size and hit-target size are separate. Aim for at least about 44px of touch area for important controls.
- Every pressable control gets tactile `:active` feedback using transform/opacity, never layout movement.
- Do not duplicate transport in decorative wrappers.
- Unknown duration remains unknown. Never present invented `0:00` progress.

### Genre rail

- Genre navigation is text-led and horizontally scrollable when space is constrained.
- Selection must not change item dimensions or move neighbouring labels.
- The current selected-state treatment uses the restrained dandiya-style marker. Do not add a second underline, pill, glow or card around the same state.
- Preserve the shallow courtyard-aligned arc only where it remains legible and does not reduce touch usability.

### Explore

- Explore is a directional affordance, not another primary CTA competing with Play.
- Its position stays stable while the current title changes.
- Opening Explore preserves listening state.
- Closing or backing out of Explore restores the listener to the previous filter/search/scroll context whenever possible.
- A dedicated `/explore/` route may carry deeper discovery while preserving player continuity.

### YouTube surface

- Runtime playback is YouTube-only according to the current playback contract.
- Keep the video surface collapsed until the listener explicitly opens it.
- The explicit YouTube control should be discoverable without turning the video into permanent visual clutter.
- Never imitate, hide or bypass required YouTube player behaviour.

### Views and the More card

- **Simple view** (the courtyard artwork) is the default. **Immersive view** replaces the Simple renderer with the complete Garbo prototype, including its venue scene and controls, with live song, time, playback, genre and mode state supplied by the production player. A visible Simple/Immersive switch sits below More in either view, and the choice is remembered on that device.
- The prototype loads only after Immersive is chosen. The production player remains mounted and authoritative; prototype controls call its existing actions. If the prototype cannot load, Simple view remains available.
- The More card holds the less-used top-bar actions, so the bar stays short at every size:
  - phone and tablet (up to 1023px): the bar shows Search, Up next and More;
  - desktop (1024px and up): Garba Circle and My Garba also stay in the bar.
- Each More row acts through the original button, so every feature keeps its own behaviour and pressed state.

## Explore and catalogue

Explore is a listening interface, not a dashboard.

- One tap on a song row plays it.
- Title is primary, artist is secondary, release/context is tertiary.
- Descriptions and source context use progressive disclosure rather than expanding every row by default.
- Keep Nonstop sets visibly and behaviourally distinct from ordinary songs.
- Avoid duplicate catalogue objects to create presentation-only playlists.
- Favourites/My Garba and manual queue state should use canonical song IDs.
- Search, empty, loading and error states are product states, not afterthoughts.
- Secondary row actions must remain reachable on touch. Do not depend on hover-only disclosure.
- Preserve source truth. Do not invent dates, credits, popularity, ratings, play counts, descriptions or durations.

## Supporting pages

Culture, help and installation pages support the listening product. They should not recreate a second marketing shell around the player.

- `What is Garba?`, Guide, Install, FAQ and About should use editorial composition and strong reading hierarchy.
- Use full-bleed approved imagery only where the image adds cultural or instructional meaning.
- Prefer spacing, dividers and typography over repeated equal card grids.
- Keep calls to the player consistent. One action intent should use one label.
- Avoid implementation-facing copy that explains internal hosting, framework or runtime decisions to ordinary listeners.
- Visible artwork should use the current approved visual system without a retired-art first-paint flash.

## Motion system

Animation is permitted only when it provides feedback, explains a state change, preserves spatial continuity or prevents a jarring visual swap.

### Timing

- Frequent control feedback should normally finish within about 120-220ms.
- Sheets/popovers and larger UI state changes should normally finish within about 180-300ms.
- Environmental background crossfades may remain slower, around 700-900ms, because they are atmosphere rather than direct control feedback.
- Do not slow down repeated actions merely to make them feel more cinematic.

### Easing

- Entering/press feedback uses a strong ease-out curve.
- Movement that stays on screen can use ease-in-out.
- Avoid plain ease-in for UI entry because it makes interfaces feel delayed.
- Rapid interactions must be interruptible and retarget cleanly.

### Performance

- Prefer transform and opacity on hot interaction paths.
- Do not animate layout properties when a transform can communicate the same change.
- Never introduce `transition: all`.
- Avoid `scale(0)` for popovers/surfaces. Use a small visible starting scale when scaling is justified.
- Hover motion applies only to devices with true hover/fine-pointer capability.
- `prefers-reduced-motion` removes movement-heavy effects while preserving necessary state communication.
- Pause non-essential decorative work when the page is hidden.

## Interaction states

Every interactive component should account for the full state cycle when applicable:

- default;
- hover on hover-capable devices;
- focus-visible;
- active/pressed;
- selected/current;
- disabled;
- loading;
- empty;
- error.

Do not use colour alone to communicate selected or error state when another cue is needed.

## Accessibility and input

- Keyboard focus must remain visible and predictable.
- Escape closes the topmost dismissible surface. If search has a defined clear-first behaviour, it may clear before the sheet closes.
- Modal/sheet focus is trapped while open and restored to the opener when closed.
- Use semantic controls before custom clickable containers.
- No hover-only essential action on phones/tablets.
- Respect safe-area insets for notches, Dynamic Island, home indicator and landscape cut-outs.
- Test increased contrast and reduced motion as release conditions, not optional polish.

## Responsive principles

- Mobile is art-directed, not a compressed desktop layout.
- Use fluid measures first. Add breakpoints only when the interaction model needs to change.
- Prefer dynamic viewport units for full-screen composition, with deliberate fallbacks where older-browser support requires them.
- Avoid layout shifts caused by mobile browser chrome, long titles, late artwork promotion or sheet initialisation.
- iPad portrait and landscape are first-class layouts.
- Short landscape phones need a height-based layout, not just a width breakpoint.

See [`responsive-pwa.md`](responsive-pwa.md) for the detailed behaviour contract.

## CSS and source ownership

The production player already uses ordered semantic style layers. New work should strengthen that architecture rather than add another override island.

- `styles/00-foundation-and-player.css`: tokens, base player geometry and foundational components.
- `styles/10-browser-and-shell.css`: browser/sheet shell.
- `styles/20-responsive-and-accessibility.css`: breakpoint and accessibility layout behaviour.
- `styles/30-product-polish.css`: durable refinement that cannot live more semantically elsewhere.
- `styles/40-accessibility-states.css`: explicit accessibility states.
- `styles/50-discovery-and-performance.css`: discovery/performance surfaces.
- `styles/60-runtime-and-provider.css`: runtime/YouTube surfaces.
- `styles/70-mobile-playback-coordination.css`: mobile playback coordination.
- `styles/80-genre-icon-images.css`: genre icon image treatment.

Rules:

- Prefer editing the owning source layer over appending late inline `<style>` patches to `index.html`.
- Use `!important` only where a documented runtime specificity conflict genuinely requires it.
- If one new rule exists only to undo another current rule, fix ownership before adding the override.
- Do not introduce a new UI dependency for a tiny effect the existing stack can express cleanly.
- Keep catalogue/data changes separate from visual refactors unless the feature requires both.
- Domain/canonical-host changes should not fork the visual system. One product surface gets one source of presentation truth.

## Quality gate

Use bounded review passes rather than endless polish loops.

1. Capture desktop and mobile states in one review pass.
2. Record defects as one batch: hierarchy, spacing, contrast, overflow, touch, focus, motion and content stability.
3. Fix that batch at the owning source layer.
4. Run one confirmation pass and stop unless a new functional defect appears.

A visual change is not complete because one screenshot looks good. It is complete when the same interaction remains stable across the relevant phone, tablet, desktop, keyboard, reduced-motion and PWA states.

## Anti-patterns

Do not ship:

- generic glass cards around every section;
- decorative gradients that are unrelated to approved artwork;
- several competing accent colours;
- duplicated CTA intent;
- a separate marketing shell that competes with the canonical player;
- permanent YouTube video clutter;
- selected-state pills plus underline plus glow for the same genre;
- huge opaque player containers;
- hover-only controls;
- unbounded `!important` escalation;
- `transition: all`;
- animation that blocks fast repeated input;
- fake catalogue facts or social proof;
- layout that only works for one ideal title length or one phone size.
