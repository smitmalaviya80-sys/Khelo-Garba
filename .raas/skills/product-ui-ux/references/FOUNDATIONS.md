# Foundations, heuristics, and visual systems

Load this module for product direction, information architecture, hierarchy, visual-system decisions, or broad UI critique.

## Start with the job, not the surface

Define the user's job before choosing a layout. Ask why the surface exists, who it is for, which decision or action it should make easier, what must be understood before acting, what can be removed, and what happens if the interface is wrong.

A screen that looks refined but adds decisions, hides state, or misstates consequences is a regression.

## Apple 2026 principles as decision tools

Use Purpose, Agency, Responsibility, Familiarity, Flexibility, Simplicity, Craft, and Delight as questions, not a required aesthetic.

- **Purpose:** spend attention on what matters to the user.
- **Agency:** let people control, escape, undo, and understand commitment.
- **Responsibility:** make permissions, data use, safety, and consequences transparent.
- **Familiarity:** build on learned concepts and consistent behaviour.
- **Flexibility:** support relevant abilities, devices, sizes, inputs, expertise, and content lengths.
- **Simplicity:** remove unnecessary steps, controls, modes, labels, and branches.
- **Craft:** make type, spacing, alignment, iconography, state, motion, and feedback coherent.
- **Delight:** let satisfaction emerge from clarity, speed, control, and craft.

## Nielsen Norman cross-check

Use the ten heuristics when they change the diagnosis: system status; real-world match; control/freedom; consistency/standards; error prevention; recognition over recall; flexibility/efficiency; restrained presentation; error recovery; useful help.

## Information architecture

A user should be able to answer: Where am I? What is here? What can I do? What changed? Where can I go? How do I get back or out?

Check navigation labels, hierarchy, active state, back/forward, refresh, deep links, direct entry, return points, dead ends, duplicate destinations, and whether search/filter scope is clear.

Tabs switch peer views. Links navigate. Buttons act. Do not blur those roles.

## Visual hierarchy

Build hierarchy from a small set of deliberate signals: position, size, type weight, spacing, contrast, grouping, colour, depth, and necessary motion. Do not use all signals at once.

Similar things should align and behave similarly. Different importance should look different. Avoid giving every section its own container, heading, icon, background, and shadow.

Whitespace is structural. Too little merges unrelated information. Too much breaks relationships and pushes core actions away.

## Typography

Treat typography as a system: family, size, weight, line height, measure, tracking, hierarchy, emphasis, and numeric treatment where relevant.

Legibility outranks novelty. Body text needs comfortable measure and line height. Text scaling must not clip or overlap. Do not use low-contrast text as the default signal for secondary content. Use stable numeral alignment in dense numeric interfaces where comparison matters.

## Colour, materials, and depth

Colour needs a job: semantic state, selection, hierarchy, category, data encoding, or brand expression. Do not rely on colour alone.

Blur, glass, translucency, and strong elevation are optional. Apple's Liquid Glass is an Apple platform material, not a generic web aesthetic. On Apple platforms prefer standard components and system accessibility adaptation. Elsewhere, use translucent materials only for a concrete product reason and verify readability, performance, and accessibility across actual backgrounds.

## Icons and symbols

Prefer familiar platform or product symbols. Give icon-only controls accessible names. Use tooltips where pointer users need help. Keep optical weight consistent. Avoid ambiguous icons for destructive or high-consequence actions. Pair unfamiliar icons with text.

## Design-system discipline

Before adding a primitive, search tokens, variants, existing component APIs, interaction states, accessibility behaviour, responsive rules, and content conventions.

Prefer semantic tokens over raw values. A component contract includes structure, content slots, variants, states, interaction, keyboard, focus, responsive behaviour, semantics, loading/error behaviour, and theming.

Do not fork a component merely to avoid fixing its API.

## Brand versus platform

Preserve brand in content, imagery, typography, colour, and composition. Preserve learned platform behaviour in navigation, controls, input, focus, keyboard, pointer, touch, and system affordances where appropriate.

Native familiarity and brand identity are not opposites. Do not assemble a collage of unrelated design-system aesthetics.

## Cognitive load

Keep necessary context visible. Prefer recognition to recall. Do not ask twice for information already available. Group related decisions. Reveal advanced controls when needed without hiding the primary task. Keep instructions close to the decision they affect.

## Localisation and content expansion

When supported by the product, design for longer strings, local number/date/time/currency/name/address formats, bidirectional layout, and content expansion. Avoid fixed-width text containers, text baked into images, and concatenated translation fragments. Project language rules always win.
