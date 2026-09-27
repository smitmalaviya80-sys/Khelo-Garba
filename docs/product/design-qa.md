# Design QA: warm editorial guide pages

**Result: passed**

Reviewed the user-selected Garba guide reference against the working implementation in the Codex in-app browser. The browser captures were inspected at the routes and viewport sizes below; captures are shown in the task conversation and were not written to image files.

| Surface | Viewport | Result |
| --- | --- | --- |
| Garbo player, “What is Garba?” guide sheet | Desktop, 1440 × 1000 | Centered PlayGarba Guide label and title, parchment background, folk border, two-column content, unboxed leading icons and bottom attribution all read clearly. |
| Garbo player, “What is Garba?” guide sheet | Phone, 390 × 844 | Content becomes one column, title and close control fit, icons remain beside section titles, and the sheet can scroll vertically. |
| What is Garba? reading page | Desktop, 1440 × 1000 | Centered hero, readable lead, warm wordmark and border-only link cards; no image behind the heading. |
| Learn hub | Desktop, 1440 × 1000 | Editorial hero and two-column link list are coherent and readable. |
| FAQ | Phone, 390 × 844 | Hero actions stack cleanly, topic links fit two columns and the topic divider no longer crowds its label; answer text remains readable. |
| Homepage | Phone, 390 × 844 | Listening hero and dark image-led treatment remain intact; only the shared PlayGarba mark changes. |
| Navratri 2026 campaign | Phone, 390 × 844 | Campaign image, dark palette and page composition remain distinct; shared brand mark renders. |

Shared editorial styling also targets About, FAQ, Learn, Guide, Install, Live, What is Garba?, history, Navratri and Garba, Dandiya Raas, Garba music, Garba vs Dandiya, Garba attire and craft, and Garbo. The homepage and the immersive player are outside that page selector. The Navratri 2026 campaign is explicitly excluded from the warm page theme. Playback controls and playback behavior were not changed.

The site logo was confirmed at the public-site root (`/assets/garbo-mark.svg`); the repository-root static preview uses a nested path and therefore is not a valid check for that production-root asset URL.
