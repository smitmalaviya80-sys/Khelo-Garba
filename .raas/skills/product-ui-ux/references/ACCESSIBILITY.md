# Accessibility and input

Load this module for interactive elements, forms, navigation, media, motion, custom controls, or meaningful visual state.

WCAG 2.2 AA is the minimum web baseline unless the project requires more. Passing WCAG is not the same as delivering a usable experience.

## Accessibility is a workflow

Check accessibility during information architecture, component design, content, implementation, automated tests, keyboard testing, assistive-technology testing for important/custom interactions, visual QA, and regression testing.

An automated scanner cannot verify task comprehension, correct announcements, sensible focus movement, or screen-reader usability.

## Native semantics first

Use native HTML or platform controls when they fit. Custom controls must reproduce the full contract: name, role, value/state, keyboard operation, focus, disabled state, pointer/touch behaviour, announcements, and high-contrast behaviour.

Use ARIA for semantics native HTML cannot express, not to repair poor element choice.

## Structure and reading order

Verify logical hierarchy, landmarks, headings, source order, skip navigation when useful, descriptive view titles, unique labels, decorative-content hiding, meaningful image alternatives, and appropriate text/data alternatives for essential visualisations.

Visual CSS reordering must not contradict keyboard or screen-reader order.

## Keyboard

Every pointer action needs an appropriate keyboard path unless it is inherently pointer-specific and an equivalent alternative exists.

Verify predictable Tab order; Enter/Space behaviour; arrow-key patterns for composite widgets; Escape for dismissible overlays where appropriate; no keyboard trap; safe shortcuts; and shortcut discoverability when they materially help expert users.

## Focus

Focus must be visible, sufficiently contrasted, not hidden by sticky/floating UI, moved deliberately on context changes, restored after temporary surfaces, and preserved during validation where possible.

For modal dialogs/sheets: move focus in, provide a meaningful name, remove background from the active focus order, and restore focus logically on close.

## Text, zoom, and reflow

For web interfaces support at least 200 percent text resize without loss of content/function and the WCAG 2.2 reflow reference condition equivalent to 320 CSS pixels for ordinary two-dimensional content, with allowed exceptions. Test representative flows at 400 percent browser zoom. Avoid fixed heights around text and clipping when text spacing changes.

Do not shrink text to preserve a desktop composition.

## Contrast and non-colour cues

WCAG 2.2 AA generally requires 4.5:1 for ordinary text, 3:1 for large text, and 3:1 for meaningful non-text UI boundaries/graphics where applicable. Verify actual backgrounds, including images or moving content.

State must not rely on colour alone. Support forced-colour/high-contrast environments where the platform exposes them.

## Target size and spacing

WCAG 2.2 Target Size (Minimum) uses 24 by 24 CSS pixels with defined exceptions. Platform guidance may require larger comfortable targets. Do not force every desktop control to one arbitrary size, but make touch targets easy to hit and separate destructive neighbours.

## Dragging and gestures

If dragging is not essential, provide a non-drag alternative such as reorder buttons, numeric slider input, menu actions, or explicit controls. Multi-point/path gestures need simpler alternatives unless essential.

## Motion, flashing, and transparency

Respect reduced motion, increased contrast, reduced transparency where available, forced colours, text size, and display scaling. Reduced motion should preserve state feedback while removing unnecessary translation, zoom, parallax, elastic movement, or large-area motion.

Avoid unsafe flashing and uncontrollable autoplay motion where accessibility requirements demand a stop mechanism.

## Forms and authentication

Use persistent labels. Placeholder text is not a label. Keep necessary instructions visible. Identify errors in text and associate them programmatically. Preserve valid input after failure. Avoid redundant entry when information is already available unless verification or security requires it.

Follow WCAG 2.2 accessible authentication principles. Support password managers, paste, and appropriate autofill where relevant. Do not block paste just to force manual entry.

## Screen-reader verification

For critical/custom flows, use a relevant real screen reader when tooling permits, such as VoiceOver, NVDA/JAWS, or TalkBack. Verify names, roles, states, reading order, dynamic announcements, modal entry/exit, errors, selection, loading completion, and dynamically inserted content.

Manual assistive-technology testing complements automated checks.

## Cognitive and language accessibility

Use clear direct language, visible context, explained abbreviations, meaningful grouping, and error prevention. Avoid dense simultaneous choices or decorative motion that raises cognitive load without helping the task.

## Media

Where relevant provide captions, transcripts/equivalents, audio description/text alternatives for essential visuals, keyboard-accessible controls, and non-audio-only status. Do not rely on hover-only media controls on touch devices.

## Evidence state

Report accessibility evidence by layer, for example automated scan verified, keyboard verified, VoiceOver not inspected, high contrast partially verified, reduced motion verified. Do not collapse this into a single unsupported green label.
