# Issue #231 Khamma 2 YouTube migration

Date: 2026-09-08

Issue: #231, YouTube migration for `Khamma 2` (2024).

## Outcome

The legacy Amazon playback manifest has been converted to the production YouTube-only policy.

- 21 canonical Khamma 2 rows audited
- 20 exact YouTube routes accepted
- 1 row intentionally unresolved
- 0 Amazon, Apple or Spotify routes remain executable in the Khamma 2 playback manifest
- no timestamp is calculated from track durations

## Exact long-master route

Canonical track 1, `Khamma 2 (HipHop Garba)`, uses the exact auto-generated YouTube Topic recording:

- video: `85jwFZy4jz0`
- credited to Aghori Muzik, Geeta Rabari, Dharmesh Barot and Anushka Pandit
- release: `Khamma 2`
- rights line: Sur Sagar

This avoids treating a longer chaptered programme as if it were necessarily identical to the 56:17 album master.

## Verified Sur Sagar chapter routes

Sur Sagar Music's verified full-programme upload `0U3i-GuKZoE` publishes the following chapter starts. These source-published starts are used directly for canonical split tracks:

| Track | Canonical song | Start |
| --- | --- | ---: |
| 2 | Dhinganu | 05:20 |
| 3 | Jogidas Khuman No Raahdo | 06:14 |
| 4 | Vir Vachhraj Dada No Raahdo | 09:54 |
| 5 | Shivji Nu Damaru | 14:14 |
| 6 | Raam Vada No Raahdo | 18:16 |
| 7 | Kaanji Tari Maa Kehse | 24:18 |
| 8 | Kuldevi Nathi Jeva Teva | 26:58 |
| 9 | Vaari Jaau | 29:36 |
| 10 | Mata Ni Maya | 31:34 |
| 11 | Mogal no Bhediyo | 34:29 |
| 12 | Sooraj Chand | 37:21 |
| 13 | Chapaner No Chawk | 39:41 |
| 14 | Jag Janani Jagdamba | 41:58 |
| 15 | Man Moti No Haar | 44:15 |
| 16 | Maa Chamunda Chhand | 47:05 |
| 18 | Khamkaaro | 49:09 |
| 19 | Ramjo Ramjo | 53:30 |
| 20 | Ghadi Toh Ramo | 56:30 |
| 21 | Lili Nagher Ma | 59:19 |

## Intentional unresolved row

Canonical track 17 is `Khamma 2`, a 29-second album track.

The verified Sur Sagar programme labels the 48:39 chapter `Sarkari (Dakla Intro)`. The duration is compatible with a short transition, but the authoritative title is different. Duration proximity is not enough to prove recording identity.

Therefore `khamma-2-2024-17-khamma-2` has no executable route in this migration. It remains non-playable until an exact official YouTube identity is independently verified.

## Provider evidence

Amazon Music remains useful for the 21-track album sequence, titles and durations, but provider URLs are provenance only. They were removed from `songSources` so the runtime cannot mistake them for executable playback.

## Route-safety decision

This migration deliberately prefers 20 truthful routes over 21 guessed routes. It satisfies PlayGarba's source-truth rule: an exact official recording or exact source-published chapter is playable; an ambiguous segment is not.
