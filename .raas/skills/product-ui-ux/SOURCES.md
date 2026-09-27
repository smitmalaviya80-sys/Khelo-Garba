# Product UI/UX v2 research baseline

Research date: 2026-09-09.

This file records external reference families used to shape the reusable method. Project-specific rules remain authoritative. The goal is triangulation: no single company, design system, or guideline is universal.

## Apple

- Human Interface Guidelines, Design principles: https://developer.apple.com/design/human-interface-guidelines/design-principles
- WWDC26, Principles of great design: https://developer.apple.com/videos/play/wwdc2026/250/
- WWDC26 Design guide: https://developer.apple.com/wwdc26/guides/design/
- What’s new in Design: https://developer.apple.com/design/whats-new/
- WWDC26, Design intuitive search experiences: https://developer.apple.com/videos/play/wwdc2026/292/
- WWDC26, Craft clear names for features and labels in your app: https://developer.apple.com/videos/play/wwdc2026/290/
- HIG Accessibility: https://developer.apple.com/design/human-interface-guidelines/accessibility
- HIG Generative AI, updated 2026-06-08: https://developer.apple.com/design/human-interface-guidelines/generative-ai
- Liquid Glass overview: https://developer.apple.com/documentation/technologyoverviews/liquid-glass
- WWDC26 Platforms State of the Union recap: https://developer.apple.com/videos/play/wwdc2026/122/

Lessons used include Apple's eight 2026 principles, current search/naming guidance, resizable/adaptive platform direction, selective Liquid Glass with accessibility adaptation, UI validation across appearance/orientation/text/localisation states, and AI transparency/control/refine/retry/revert/feedback guidance.

## W3C / WAI

- WCAG 2.2: https://www.w3.org/TR/WCAG22/
- WAI-ARIA: https://www.w3.org/WAI/standards-guidelines/aria/
- WAI Authoring Practices Guide: https://www.w3.org/WAI/ARIA/apg/

Used for WCAG 2.2 AA, focus not obscured, dragging alternatives, target size minimum, redundant entry, accessible authentication, semantic state, and keyboard patterns.

## Nielsen Norman Group

- 10 Usability Heuristics: https://www.nngroup.com/articles/ten-usability-heuristics/

## Google Material and Android

- Material 3: https://m3.material.io/
- Android adaptive layouts: https://developer.android.com/develop/ui/compose/layouts/adaptive
- Material design evolution: https://design.google/library/material-design-eras

Used for adaptive reflow/reveal/panes, canonical list-detail/feed/supporting-pane patterns, flexible component systems, accessibility, expressive hierarchy, and scale/space used intentionally rather than decoratively.

## Microsoft Fluent

- Fluent 2 accessibility: https://fluent2.microsoft.design/accessibility
- Fluent 2 design principles: https://fluent2.microsoft.design/design-principles
- Fluent 2: https://fluent2.microsoft.design/

Used for accessibility through design and implementation, high-zoom/narrow-layout checks, persistent labels/helper text, focus management, inclusive design, platform-natural behaviour, and action hierarchy.

## GitHub Primer

- Primer Accessibility: https://primer.style/accessibility/
- Primer: https://primer.style/

Used for ongoing accessibility practice, responsive behaviour without lost function, user preference features, multimodal input, and stable primitives.

## Atlassian Design System

- Foundations: https://atlassian.design/foundations/
- Components: https://atlassian.design/components/

Used for semantic tokens and system foundations across colour, typography, spacing, grid, iconography, elevation, borders, radius, and component accessibility.

## Adobe Spectrum

- Accessibility: https://spectrum.adobe.com/page/accessibility/

Used for inclusive mouse, keyboard, pen, touch, voice, and accessibility-API support, error prevention, and target usability.

## IBM Carbon

- Accessibility overview: https://carbondesignsystem.com/guidelines/accessibility/overview/
- Accessibility for developers: https://carbondesignsystem.com/guidelines/accessibility/developers/
- UI shell accessibility: https://carbondesignsystem.com/components/UI-shell-header/accessibility/

Current August/September 2026 guidance reinforces semantic HTML, keyboard/screen-reader behaviour as component contracts, and combined automated/manual validation.

## GOV.UK

- Design System accessibility: https://design-system.service.gov.uk/accessibility/
- Service Manual, helping people use your service: https://www.gov.uk/service-manual/helping-people-to-use-your-service

Used for continuous accessibility work and real keyboard, zoom, speech-recognition, and screen-reader testing.

## U.S. Web Design System

- Design principles: https://designsystem.digital.gov/design-principles/
- Accessibility: https://designsystem.digital.gov/documentation/accessibility/

Used for starting from real user needs, promoting continuity without forced conformity, testing on real devices, supporting multi-session tasks, treating accessibility as continuous work, and combining automated scans with keyboard, touch, zoom, screen-reader, cross-browser, and specialist testing.

## Core Web Vitals

- https://web.dev/articles/vitals

Unless a project is stricter, use current good field thresholds at the 75th percentile: LCP <= 2.5 s, INP <= 200 ms, CLS <= 0.1.

## Upstream acknowledgement

Interaction and motion guidance also draws from Emil Kowalski's `apple-design` skill in `emilkowalski/skills`, distributed under the MIT License.

MIT License

Copyright (c) 2026 Emil Kowalski

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
