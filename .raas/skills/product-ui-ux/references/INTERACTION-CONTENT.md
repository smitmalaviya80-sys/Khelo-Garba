# Interaction, motion, navigation, search, forms, and content

Load this module for controls, gestures, motion, search, filters, forms, navigation, menus, dialogs, feedback, naming, or user-facing interface copy.

## Interaction must explain itself

Every control should make its affordance, action, state, registration, progress, result, and recovery understandable. Match feedback intensity to consequence. Passive status can stay in context. Data loss, privacy, money, health, or destructive consequences may need interruption. Do not confirm every ordinary reversible action.

## Immediate response and direct manipulation

For direct manipulation give immediate press/pointer feedback where safe, track gestures directly, respect grab offset, keep motion interruptible, continue from the presented value, preserve velocity when momentum belongs to the interaction, choose snap targets from position/momentum when appropriate, and provide non-drag alternatives when dragging is not essential.

A visually smooth animation that ignores new input is poor interaction.

## Motion

Use motion for continuity, causality, hierarchy, orientation, state change, or direct manipulation. Avoid movement added only for activity. Prefer compositor-friendly transform/opacity for frequent web animation when sufficient. Restrained critically damped motion is a useful ordinary default. Bounce belongs only when the gesture/object metaphor justifies it. Reduced-motion mode must retain feedback while removing unnecessary large translation, zoom, parallax, elastic, or decorative movement.

## Apple Liquid Glass, selectively

Liquid Glass is current Apple platform material, not a cross-platform visual requirement. On Apple platforms start with standard components, let accessibility settings adapt transparency/contrast/motion/borders, use tint for key actions selectively, verify legibility over complex backgrounds, and use stronger interactive glass effects sparingly. On web/Android/other products, do not copy it by default.

## Navigation

Tabs switch peer views. Links navigate. Buttons perform actions. Menus expose secondary choices/actions. Back returns to meaningful prior context. Cancel exits an in-progress commitment without applying it. Close dismisses temporary UI. Do not make one control serve these roles ambiguously.

Keep important destinations stable across sizes unless the mental model remains clear.

## Search

Define search scope before placement: local collection, section-global, or product-global. Placement must communicate scope.

Useful current patterns include recent searches when they reduce work, fast input-related suggestions when reliable, broad-first then narrowing, meaningful filters, visible/removable active filters, clear/cancel actions, removable history, preserved queries when returning from results, and useful zero-result recovery.

Do not suggest unrelated popular content merely because a query is incomplete. Suggestions should relate to input and scope.

Mobile bottom placement can improve reachability when it fits the navigation model. Larger layouts should follow established product structure instead of forcing phone placement everywhere.

## Filters and sorting

Filters reduce a result set. Sorting changes order. Search matches a query. Keep these roles clear. Show active filters, predictable reset, preserved comparison context, truthful defaults, and clear Apply/Cancel semantics on temporary mobile filter surfaces.

## Forms

Use persistent labels and necessary instructions near the decision. Placeholder text can show an example, not essential instruction. Ask only for needed information. Use the correct control, mobile input mode, autofill, and paste where safe. Preserve valid values after errors.

Validate when it helps, not before the user has a reasonable chance to interact. Explain the problem and recovery. Distinguish field errors from service/page errors.

Prevent accidental duplicate commits. Show pending state without freezing the interface. Do not claim success before the authoritative operation succeeds. Preserve agency during long operations when cancel/background execution is safe.

## Destructive and irreversible actions

Apply friction proportional to consequence. Undo can be better than a blocking confirmation for routine reversible removal. For irreversible/high-consequence actions name the object/action, state the consequence, separate the destructive choice, require deliberate confirmation where appropriate, avoid default focus on destruction, and provide recovery if possible. Never make cancel harder than commit.

## Dialogs, sheets, popovers, menus

Use temporary surfaces to preserve context or focus a bounded task, not by habit. Verify title/purpose, initial focus, keyboard, dismiss behaviour, modal background handling, scroll containment, mobile safe area/keyboard, focus restoration, and avoidance of unnecessary nested modals.

Menus suit compact choices/actions. Rich option comparison often needs a larger surface.

## Progressive disclosure

Hide complexity, not capability. Secondary disclosure can hold advanced settings or supporting metadata. Do not hide primary actions, status, error recovery, decision-changing consequence information, privacy implications, or required eligibility.

## Naming and labels

A name should belong in the product, set an accurate expectation, and work everywhere it appears. Write for what the audience should think, feel, and do. Prefer clear action verbs. Avoid internal terminology. Use one term per concept. Clarity and trust outrank clever naming.

## Loading and waiting

Use the smallest truthful feedback. Show determinate progress when real progress exists. For indeterminate work, specific status can reduce uncertainty. Avoid fake minimum spinner time. Use skeletons only when layout/content shape is predictable and the request is actually progressing. Let long tasks run without blocking unrelated work when safe.

## Empty and error states

Distinguish first use, no search results, filtered-out results, permission/access limits, offline, service failure, and true no-data states.

A useful error says what happened, what was preserved, and what the user can do next. Keep infrastructure diagnostics in operator channels rather than exposing raw failures to ordinary users.

## Density

Dense professional tools can be appropriate when users need comparison and throughput. Other tasks may need more space. Let task frequency, expertise, data volume, screen size, and error consequence decide density.
