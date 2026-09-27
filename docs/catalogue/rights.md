# Free and legally accessible Garba sources

Updated: 6 September 2026

This project distinguishes **free access** from **permission to redistribute**. A download button is not permission to copy an unchanged file into GitHub.

The machine-readable audit is stored under `data/catalogue/free-sources/` and is generated into `data/free-audio-sources.json` by `scripts/build-catalogue.mjs`.

## Current audit

- 20 rights-audited free/access resources
- 10 resources with a free-download path
- 2 name-your-price Bandcamp resources
- 10 Creative Commons-labelled resources
- 0 third-party raw audio files mirrored into the repository

## Pixabay

Several directly relevant Garba, Dandiya and Gujarati tracks are free MP3 downloads under the Pixabay Content License. The licence allows use and adaptation subject to its terms, but prohibits standalone redistribution of substantially unchanged content.

Verified examples include:

- `Garba Night | Indian Pop Music` by kontraa
- `Dandiyan | Bollywood Pop Music` by kontraa
- `Aavi Garba Ni Raat` by kalsstockmedia
- `INSTRUMENTAL | Garba Song 2025` by kalsstockmedia
- `Gujarati Krishna Bhajan — garba-influenced devotional rhythm` by PoorArtistt
- `Dharti_Dhadake` by RahulSapkal, retained as Gujarati Timli/folk-adjacent material

These remain legal source links. Their unchanged MP3 files are not committed.

## Bandcamp

Bandcamp may provide free or name-your-price high-quality downloads while the recording remains all-rights-reserved or otherwise lacks an open redistribution licence.

Current finds include:

- `Zat Zaiye` by Parle Patel, 16-bit/44.1 kHz
- `Dream the Dreams So Far Denied: Devotional Music from the Gujarat` by Hive Mind Records, 16-bit/44.1 kHz

The download opportunity is recorded, but it does not by itself authorise repository mirroring or commercial use.

## Creative Commons and SoundCloud

Several SoundCloud recordings expose CC BY-NC or CC BY-NC-SA metadata, including Aghori Muzik's `Teen Taal`, Maa Shakti Garba material and several Garba/Raas competition mixes.

The `NC` restriction prevents commercial use. DJ and competition mixes also receive an additional rights-review flag because a platform Creative Commons label does not establish clearance for every underlying commercial song or sample.

These remain external references.

## Wikimedia Commons and Wikisource

The audit includes legitimately open historical/live resources such as:

- the 2019 Mehsana Garba audiovisual recording under CC BY-SA 4.0
- the 1922 `Nhana Nhana Ras` collection under CC BY-SA 4.0
- related Gujarati Wikisource and Wikimedia Commons archive parts

They are kept external because they are archival/live reference resources rather than clean music masters, and in some cases are very large files.

## Freesound

The `garba m.aiff` tabla-machine sample from loopcentury is recorded as a production resource. Its Sampling+ terms permit creative transformation under conditions, while whole-file redistribution has additional restrictions. It remains external.

## Repository rule

Raw third-party audio may be committed only when all of these are true:

1. the exact file comes from a legitimate source;
2. the licence explicitly permits redistribution in the intended context;
3. attribution and share-alike obligations are recorded and satisfied;
4. composition, sample and performance rights do not create an unresolved conflict;
5. the file is appropriate for Git rather than a large-media host.

Until those conditions are met, store the verified metadata and legal source URL, not the audio bytes.
