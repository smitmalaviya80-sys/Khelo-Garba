# Issue #341: Ramzat 2017 YouTube migration audit

Date: 2026-09-08

Refs: #157 and #221.

## Contract

This audit covers the 35 canonical split tracks in Sur Sagar's `Ramzat - Non Stop Garba` (2017). Executable playback is promoted only when the exact split recording is independently identified on an official artist, label or distributor YouTube surface.

The verified Sur Sagar full-set upload `qRBix85kgvI` and its publisher chapter list remain authoritative discovery evidence, but its chapter markers are not promoted to split-track playback merely because titles and order align. No timestamp is inferred from catalogue durations.

## Exact split-track coverage

After this pass, 19 of the 35 canonical split tracks have exact full-song YouTube identities.

### Ten exact routes already present before #341

These remain owned by the existing current-source manifest and are not duplicated by #341:

- track 2 `Mangal Divada Ni Mangal` → `Nd1TaITnDh8`
- track 3 `Kumkum Pagle` → `vnx8pubS-v0`
- track 6 `Ambe Maa Palakhadi Shangaro` → `_bHgXjgZJZc`
- track 8 `Navrang Chundadi Ma` → `6RCiJnUgVxs`
- track 9 `Maa Taro Garbo` → `ns11xQxskAE`
- track 10 `Maa Tu Chaud Bhuvan Ma (Mogal Maa)` → `we3ekP9LRQY`
- track 13 `Tame Hincho To Tamne` → `zCgaPVxvBxU`
- track 18 `Bedo Tindho Paar (Aashapura)` → `GeYwVJaT1as`
- track 19 `Range Rame Aanande Rame` → `yMhbiTDEee0`
- track 26 `Pavli Lai Ne Hun To` → `8vZtCazXqpo`

### Nine exact routes added by #341

The already-indexed ranked fallback manifest adds:

- track 1 `Sachi Re Mari - Chhand - Charni Sapakharu` → `jnfUfnDn9A8`
- track 7 `Tun Kaali Ne Kalyaani Ma` → `I2Qn0Xy86gI`
- track 14 `Sona No Garbo` → `q7IPPJKWbgc`
- track 16 `Mer Karo Momai` → `n9K21NuxSQs`
- track 22 `Moj Ma Rehti Re Mahakali` → `cg0817MRoyM`
- track 27 `Bahuchar Maa Na Dera Pachhal` → `X7luwdfBjrI`
- track 30 `Dak Geet - Meldi Ramti Aave` → `T4kBfImdscE`
- track 32 `Khel Khel Re Bhavani Maa` → `XSGJ7V4JTt0`
- track 34 `Maadi Tara Mandiriye` → `qRbsjVxEDos`

Every new route is a full-song asset with exact `startSeconds: 0`. The strongest auto-generated pages explicitly identify the same `Ramzat - Non Stop Garba` album and 2017 Sur Sagar release; label-channel routes were retained only where the split recording identity was independently verified.

## Remaining fail-closed split tracks

Sixteen canonical rows remain non-playable because this pass did not recover a trustworthy exact split-track YouTube identity:

- track 4 `ramzat-2017-04-aavi-aaso-ni-radhhiyali`
- track 5 `ramzat-2017-05-maa-dilde-jo-dhabkar-aashapura`
- track 11 `ramzat-2017-11-smaran-vela-ae-vela-aavjo-chamund-maa`
- track 12 `ramzat-2017-12-garbe-ramzat-machave-bahuchara`
- track 15 `ramzat-2017-15-kesariyo-rang-tane`
- track 17 `ramzat-2017-17-matelvali-khodal-maa-ni-mithi-mer`
- track 20 `ramzat-2017-20-morla-jaje-ambe-maa-na-desh`
- track 21 `ramzat-2017-21-mogal-aavta-garbe-ramva`
- track 23 `ramzat-2017-23-lembde-rame-lemboch-maa`
- track 24 `ramzat-2017-24-madhwali-mangal-mandir-kholo`
- track 25 `ramzat-2017-25-ekvar-bolun`
- track 28 `ramzat-2017-28-dak-geet-khamma-khamma-okhadhara-ni`
- track 29 `ramzat-2017-29-dak-geet-halo-halo-vagad-ni-vaate`
- track 31 `ramzat-2017-31-chakkardi-bhamardi`
- track 33 `ramzat-2017-33-talio-na-taale`
- track 35 `ramzat-2017-35-maa-ni-dhun-lagi`

Commercial album listings confirm these titles belong to the release, but album membership alone is not sufficient to manufacture a YouTube route. They remain fail-closed until an exact official YouTube recording is independently recovered.

## Rejected shortcuts

- no publisher chapter timestamp is promoted solely from title/order alignment;
- no timestamp is calculated from cumulative catalogue durations;
- no same-title older recording, cover or different performer is substituted;
- no duplicate YouTube route is reused for different song identities;
- no commercial-provider URL becomes executable playback.

## Result

- 35 canonical split tracks audited.
- 19 exact split-track YouTube routes total after this pass.
- 9 newly recovered exact routes in #341.
- 16 split tracks explicitly fail-closed.
- 0 guessed YouTube IDs.
- 0 inferred timestamps.
- 0 different-recording substitutions.
