# Issue #152 Catalogue Wave D8 audit

Date: 2026-09-08

Issue: #152, Aditya Gadhvi follow-up catalogue completeness.

## Outcome

Wave D8 adds the 18-track 2024 `Amber Gaje` edition credited to Aditya Gadhvi and Shruti Ahir:

- 18 canonical songs
- 1 canonical release
- 9 exact official YouTube song routes that are executable under PlayGarba's production playback policy
- 9 songs deliberately left non-playable until an exact 2024-edition YouTube identity is verified

No audio is downloaded or redistributed. No YouTube ID, provider ID, timestamp or chapter boundary is inferred.

## 2024 provider edition

Amazon Music publishes `Amber Gaje` as an 18-track, 1-hour-4-minute release dated August 28, 2024. The displayed per-track durations sum to 64:45.

Apple Music independently exposes the same 18-track edition and August 28, 2024 album date.

The provider sequence is:

1. Sarar Sarar — 1:30
2. Khamma Mara Nandji Na Lal — 3:06
3. Hei Maru Vanravan Se Rudu — 3:16
4. Kanuda Na Baag Ma — 3:10
5. Kan Tari Morliye Mohine — 3:37
6. He Ubhali Re Ne Tu Govalani — 4:19
7. Ramva Aavo Ne Raas — 3:09
8. Ras Radhe Shyam Ghanshyam Rame — 9:18
9. He Sohe Radha Ne Kan Ola Gol — 2:02
10. Bhala Bhanejada Sarovar Javu — 2:55
11. Ho Rang Rasiya Kya Rami Avya — 4:18
12. Nand Kuvar Natvar — 3:35
13. Sad Karu Lya Aavje Sami — 4:29
14. Sava Basher Nu Maru Datradu — 3:25
15. Sharad Poonam Ni Ratadi — 3:11
16. Venu Ma Virado Galtiti — 3:54
17. Zilan Tara Pani — 2:20
18. Sukha Sarni Dholi Da — 3:11

## Exact YouTube execution coverage

Nine songs are independently verified on Aditya Gadhvi Official's YouTube distribution. Each returned video identifies `Amber Gaje`, credits Aditya Gadhavi and Shruti Ahir, and says it was provided to YouTube by Mars Inc.

1. Khamma Mara Nandji Na Lal — `AWe9rkzdjkA`
2. Hei Maru Vanravan Se Rudu — `cRHHpcDTe2Q`
3. Kan Tari Morliye Mohine — `HYllaj3vj3Y`
4. He Ubhali Re Ne Tu Govalani — `E8IxjnKc4L0`
5. Ramva Aavo Ne Raas — `KrThXzMm23Y`
6. Bhala Bhanejada Sarovar Javu — `15zoKaOESaY`
7. Ho Rang Rasiya Kya Rami Avya — `c-G03OXp-OM`
8. Nand Kuvar Natvar — `KWj3DqWSEGs`
9. Venu Ma Virado Galtiti — `1rMSbcVhb-k`

The remaining nine songs have no executable route in Wave D8. Search results containing an older same-title recording, a lofi remix, a community upload or another Aditya release are not accepted as recording proof.

## Expanded-edition and duplicate history

`Amber Gaje` is not a clean 2024-new-recordings-only package.

A five-track `Amber Gaje` listing from 2012 includes older versions of titles such as `Kan Tari Morliye Mohine`, `Sad Karu Lya Aavje Sami` and `Hei Maru Vanravan Se Rudu`. The 2014 `Krishan Kanaiyo` release contains nine overlapping Krishna titles.

The overlap cannot be collapsed by title alone:

- 2014 `Khamma Mara Nandji Na Lal` is displayed as 3:15, while the 2024 `Amber Gaje` track is 3:06.
- 2014 `Kanuda Na Baag Ma` is 3:00, while the 2024 edition is 3:10.
- 2014 `Ras Radhe Shyam Ghanshyam Rame` is 3:45, while the 2024 edition is 9:18.
- some other titles, including `Hei Maru Vanravan Se Rudu` and `Sharad Poonam Ni Ratadi`, have equal displayed durations across older catalogues, so exact master identity remains unresolved rather than assumed.

Wave D8 therefore models the 2024 18-track package as a distinct canonical release while preserving the older-master question for recording-level dedupe work.

## Source metadata variance

The sources disagree in ways worth preserving:

- Amazon and Apple date the 18-track provider edition to August 28, 2024.
- the exact official YouTube deliveries found in this wave report `Released on: 2024-05-21`.
- YouTube and Shazam identify Jhankar Music.
- Amazon/Apple copyright metadata names Maarss Movies And Music LLP.
- some Apple song pages expose older per-recording dates even while placing those songs inside the 2024 `Amber Gaje` album.

These values are source provenance, not errors to normalize silently.

## Taxonomy decision

`Amber Gaje` belongs in issue #152 despite the provider-level devotional classification because its programme is dominated by Krishna Garba, raas and Gujarati folk material. The canonical release uses `modern-gujarati-garba`, `traditional-garba`, `krishna-garba` and `folk-lokgeet`; individual tracks use the narrowest defensible category.

## Remaining issue #152 backlog

After Wave D8, the highest-value remaining work is:

- migrate the nine unresolved `Amber Gaje` songs to exact official YouTube identities when recording-level evidence becomes available
- review Falguni Pathak's older dandiya and non-stop catalogue with edition/master dedupe rather than title-only import
- continue Geeta Rabari authoritative-release review where the catalogue still has genuine release gaps
- audit any remaining Kirtidan historical series entries only after checking existing exact-route shards and release overlap

Issue #152 should remain open until those legitimate areas are reviewed or explicitly rejected with evidence.
