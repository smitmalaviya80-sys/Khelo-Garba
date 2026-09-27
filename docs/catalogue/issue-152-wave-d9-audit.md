# Issue #152 Catalogue Wave D9 audit

Date: 2026-09-08

Issue: #152, Falguni Pathak historical catalogue completeness.

## Outcome

Wave D9 adds the 2000 `Maadi Tara Mandiriye (Non Stop Dandiya Mix)` programme:

- 10 canonical songs
- 1 canonical release
- 10 exact Sony Music Bhakti YouTube chapter routes
- 1 verified YouTube Nonstop browser entry
- exact per-track performer ownership preserved, including three Sudesh Bhosle-only tracks

No audio is downloaded or redistributed. No YouTube ID, provider ID or chapter boundary is invented.

## Canonical provider edition

Amazon Music publishes `Maadi Tara Mandiriye (Non Stop Dandiya Mix)` as a 10-song Various Artists release. Regional Amazon pages show August 17 or August 18, 2000, and the displayed track durations total 59:44.

Apple Music independently places `Dholida Dhol Dhimo Dhimo` on `Maadi Tara Mandiriye` on August 17, 2000. The canonical release therefore uses `2000-08-17` while explicitly preserving the one-day regional variance.

Later Amazon track pages can surface September 1, 2008. Wave D9 treats that as a later digital/reissue surface, not as evidence that the programme was first released in 2008.

## Track ownership

The provider album is labelled `Various Artists`, and Wave D9 keeps that release-level truth instead of turning the entire programme into a Falguni-only album.

Provider performer credits are:

1. `Maadi Tara Mandiriya Maa` — Sudesh Bhosle
2. `Kukado Bole` — Sudesh Bhosle
3. `Kumkumna Pagla Padiya` — Falguni Pathak & Sudesh Bhosle
4. `Dholida Dhol Dhimo Dhimo` — Sudesh Bhosle & Falguni Pathak
5. `Pankhida Tu Udi Jaaye` — Sudesh Bhosle
6. `Gokulni Gwalan` — Falguni Pathak & Sudesh Bhosle
7. `Dhor Mari Anguthdino Chor` — Falguni Pathak
8. `Mein To Rangma Kapda Bodiya` — Falguni Pathak & Sudesh Bhosle
9. `Mhari Mahisagarni Chaare` — Falguni Pathak & Sudesh Bhosle
10. `Hoon To Gai Thi Mele` — Falguni Pathak & Sudesh Bhosle

Falguni therefore appears on seven of the ten tracks. The three Sudesh-only songs are still canonical parts of the programme but are not misattributed to Falguni.

## Exact YouTube chapter evidence

Sony Music Bhakti publishes the complete programme in one verified-label YouTube upload, `5OBEhHqrw1A`, and names all ten songs with exact singer credits.

Sony's published chapter strings are:

- `00:00:00` — Dholida Dhol Dhimo Dhimo
- `06:30:20` — Dhor Mari Anguthdino Chor
- `11:05:08` — Gokulni Gwalan
- `17:07:21` — Hoon To Gai Thi Mele
- `24:58:23` — Kukado Bole
- `29:45:23` — Kumkumna Pagla Padiya
- `36:26:22` — Maadi Tara Mandiriya Maa
- `43:03:14` — Mein To Rangma Kapda Bodiya
- `49:50:21` — Mhari Mahisagarni Chaare
- `54:37:08` — Pankhida Tu Udi Jaaye

The upload is a roughly 59-minute programme, so these strings cannot represent hours. More importantly, the successive gaps match the official provider song durations almost exactly: 6:30.20, 4:34.88, 6:02.13, 7:51.02, 4:47.00, 6:40.99, 6:36.92, 6:47.07 and 4:46.87. This establishes Sony's third field as sub-second precision in an `MM:SS:hundredths` presentation.

PlayGarba's runtime stores whole-second `startSeconds`, so Wave D9 drops only the published sub-second component. That conversion is deterministic and always under one second. No boundary is derived from neighbouring track durations.

The resulting whole-second starts are 0, 390, 665, 1027, 1498, 1785, 2186, 2583, 2990 and 3277 seconds, mapped by song title rather than by album track order.

## Separate shorter edition

A separate Sony `Maadi Tara Mandiriye` digital listing exists with the same ten titles but a total duration around 34:01 and much shorter individual tracks. It does not carry the `Non Stop Dandiya Mix` programme durations.

Wave D9 does not collapse that shorter edition into this 59:44 continuous-mix edition. It remains a separate recording/edition question for future review.

## Taxonomy

This release is a strong issue #152 fit because it is explicitly a Gujarati Non Stop Dandiya Mix and Sony's own current presentation describes it as Garba/Dandiya Navratri material.

The canonical release spans `traditional-garba`, `raas-dandiya`, `mataji-devotional`, `krishna-garba` and `folk-lokgeet`. Individual songs use narrower categories where the title and programme context support them.

## Rejected historical shortcuts

Wave D9 does not import marketing compilations merely because their titles contain `Garba`, `Dandiya` or `Dandiya Queen`.

Current Falguni catalogue surfaces include greatest-hits packages dominated by her Hindi/Indipop catalogue. Those need recording-level and taxonomy review before they can become PlayGarba releases.

## Remaining issue #152 backlog

After Wave D9, the next Falguni review should focus on genuine historical Garba programmes such as `90 Non Stop - Falguni Pathak`, `Dhaa Gujarati 21 Non Stop Dandiya`, older Dandiya releases and the 2023 continuous Music Nova set, with duplicate/master reconciliation before import.

The nine unresolved `Amber Gaje` YouTube migrations from Wave D8, remaining Geeta Rabari authoritative-release gaps, and any legitimate Kirtidan historical gaps also remain open work.

Issue #152 should stay open until those areas are reviewed or explicitly rejected with evidence.
