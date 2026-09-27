# Issue #157 Ramzat 2 YouTube burn-down

Date: 2026-09-08

Scope: `ramzat-2-tran-taali-2018` / **Ramzat 2 - Non Stop Trantaali Garba** (Sur Sagar, 2018).

## Verified release identity

The canonical release contains 36 split tracks plus one continuous full-set track. Current catalogue metadata identifies the 2018 Sur Sagar release and the canonical split-track durations/performers.

Sur Sagar Music publishes the verified full-set YouTube master:

- `https://www.youtube.com/watch?v=xMaP8SrV2TI`
- title: `RAMZAT-2 Nonstop Trantali Garba`
- label/channel: Sur Sagar Music
- vocals: Pamela Jain, Jigardan Gadhavi, Aditya Gadhvi, Abhita Patel
- release date: 2018-09-29

The label description publishes the full chapter programme and performer names. That evidence is retained in the canonical discovery set.

## Continuous master safety boundary

The Sur Sagar master is a continuous listening edit. It is not used as a blanket exact route for the 36 split catalogue tracks.

The published chapter boundaries do not consistently equal the canonical split-track durations. The clearest example is `Rame Ambe Maa Chachar Na`: the label chapter begins at 02:42 and the next chapter begins at 02:45, while the canonical split recording is 2:14. Treating that three-second continuous-set phrase as the exact 2:14 split recording would be false.

Therefore:

- the existing full-set route stays exact for canonical track 37;
- the discovery set keeps `segmentRouting: metadata-only`;
- no split track is mapped to a continuous-master timestamp merely because its title appears in the label chapter list;
- no chapter boundary is calculated from split-track durations.

## Exact individual YouTube tracks recovered

Nine split tracks were independently recovered as YouTube auto-generated tracks from the original 2018 Sur Sagar album. Each upload identifies the exact song title, `Ramzat 2 - Non Stop Trantaali Garba`, 2018 Sur Sagar rights and the original release date.

| Track | Canonical song | YouTube ID |
| ---: | --- | --- |
| 4 | Rame Ambe Maa Chachar Na | `vE5m0oiuOdI` |
| 5 | Maa No Garbo Re | `EuBsrm3Ga84` |
| 10 | Mogal Aavo Maa Ramva | `5hyxotBnxn8` |
| 16 | Rudi Ne Rangili Re Vala Tari | `0gU5yZCE6Iw` |
| 17 | Garbe Ramo Tran Taali | `35jL-M67wiM` |
| 24 | Hun To Vari Re Girdhari Laal | `sY49RkpCoAw` |
| 29 | Vari Jau E Balihari Jau Re | `-kHE1FqYEYo` |
| 34 | Latke Halo Ne Nandlal | `kAQyWHniTRc` |
| 35 | Vijali Ne Chamkare | `rzbAKtrrZ28` |

These routes are exact full-song YouTube selections with `startSeconds: 0`. They are added to the already-indexed current playback manifest, so they override non-YouTube fallback evidence without changing canonical song IDs.

## Deliberately unresolved split tracks

The other 27 split tracks remain non-playable under the YouTube-only runtime until an exact individual YouTube recording is directly recovered. The official continuous-set chapter list is useful discovery evidence but is not sufficient to pretend those split recordings are exact-playable.

No same-title alternate performance, later reissue, calculated timestamp or continuous-edit substitution is accepted.

## Result

- exact split-track YouTube routes added: 9
- existing exact full-set YouTube route preserved: 1
- unresolved split tracks after this pass: 27
- guessed timestamps: 0
- title-only performer substitutions: 0
- continuous-set chapter routes promoted to split recordings: 0

This is a partial burn-down under #157. The remaining 27 rows stay in the ranked backlog for exact individual-track research.
