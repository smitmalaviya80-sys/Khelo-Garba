# Catalogue partnership strategy

Status: active, 2026-09-07

Goal: reach 700 GARBA-hosted tracks with the fewest high-confidence rights transactions possible.

## Core idea

The fastest route to 700 is not 700 one-song permissions. Pursue rights holders whose catalogues overlap heavily with GARBA and can grant a bundle or catalogue-level direct-streaming licence.

The current catalogue-derived label report changes the acquisition order materially. It maps 271 song rows to Sur Sagar and 245 rows to Soor Mandir, before smaller owner/label clusters such as Rutvi Pandya (64), Geeta Rabari Official (59), Rutumbhara Entertainment (43), and 2245114 Records DK (28). These are metadata clusters, not proof of legal ownership, but they identify where one rights conversation could have the highest leverage.

Keep three acquisition lanes running in parallel:

1. **Existing GARBA owner clusters** — rights holders already tied to large groups of catalogue rows.
2. **Broad Gujarati label partnerships** — labels with hundreds or thousands of relevant recordings that may expand or replace provider-backed entries.
3. **GARBA-controlled new recordings** — commission or partner on new recordings of traditional repertoire where composition and master rights can be made clean from the start.

## Priority A: Sur Sagar Music

Catalogue metadata signal: 271 song rows across 16 releases and 38 artist-credit strings.

Why it matters:
- verified official channel describes Sur Sagar as a Gujarati label founded in 1984;
- its stated repertoire includes Folk, Garba, Raas and Devotional music;
- the existing GARBA catalogue maps a very large cross-artist block to Sur Sagar, including `Garbi` and `Garbi 2`;
- its official catalogue activity features artists already important to GARBA, including Geeta Rabari, Aishwarya Majmudar, Aditya Gadhvi and others.

Ask for:
- ownership/catalogue export with ISRC, recording title, artist, release, ©/℗ owner and duration;
- all Garba/Raas/devotional masters eligible for on-demand web streaming;
- rights scope and pricing for a 100-, 250- and 500-track bundle;
- lossless master delivery;
- direct hosting, transcoding, worldwide streaming and ordinary streaming-cache rights;
- separate price/permission for explicit offline playback.

Do not assume every recording on Sur Sagar channels is owned by the label. Require a rights-owner field per recording.

## Priority B: Soor Mandir

Catalogue metadata signal: 245 rows under `Soor Mandir`, plus a separately-labelled 15-row `Soor Mandir / SM Digital` block that must not be merged legally without confirmation.

Why it matters:
- the verified active Soor Mandir channel identifies itself as a Gujarati music label and continues to publish Garba, devotional and folk recordings;
- its own published descriptions point to `soormandir.com`, official social accounts, the Soor Mandir app and provider catalogue pages;
- current provider metadata repeatedly shows recordings with ℗ Soor Mandir;
- IPRS member material lists `SOOR MANDIR` as an owner/publisher.

Legal-entity caveat:
An old company record for `SOOR MANDIR MUSIC PRIVATE LIMITED` is currently shown as struck off. That does not establish that the catalogue is inactive or unowned. It means GARBA must not assume that old company is the present licensor. The first business inquiry must identify the current legal person/entity controlling the master catalogue and its authority to grant direct-streaming rights.

First ask:
- identify the current master-rights/licensing entity for the Soor Mandir catalogue;
- reconcile `Soor Mandir`, `SM Digital`, and `Soor Mandir / SM Digital` naming;
- provide a machine-readable catalogue export with ©/℗ owner and ISRC fields;
- quote 100-, 250- and whole-Garba-catalogue direct-streaming scenarios.

If the 245-row metadata cluster is substantially confirmed as one licensable catalogue, this is potentially one of the two highest-leverage agreements in the entire project.

## Priority C: Jigar Studio

Why it matters:
- official site says it has 3,000+ released tracks and 300+ albums/films;
- it describes itself as an independent Gujarati music label and production house;
- it explicitly invites licensing and partnership enquiries for digital media;
- the studio publishes a direct business contact page.

Caveat:
The public catalogue interface currently exposes only a small visible selection. The 3,000+ figure therefore needs a catalogue export before GARBA can measure useful Garba/Raas overlap.

First request should be a catalogue-discovery conversation, not a commitment. Ask for a CSV/JSON/Excel export of the licensable Gujarati catalogue with genre/category and rights fields, then match it against GARBA song titles/artists and the missing long tail.

## Priority D: Saregama Gujarati

Why it matters:
- Saregama has an official licensing team;
- its Gujarati catalogue includes important legacy artists and traditional repertoire, including Praful Dave;
- it offers enterprise/custom licensing routes.

Caveat:
Saregama's self-service business product is primarily designed around licensed social/sync uses. That is not automatically an on-demand music-streaming licence. GARBA must request custom terms explicitly covering direct hosting and interactive streaming.

## Priority E: Rutumbhara Entertainment

Catalogue metadata signal: 43 rows across six releases after normalising minor label-name variants.

Why it matters:
- multiple Atul Purohit releases show Rutumbhara as ©/℗ owner;
- corporate records identify Atul Purohit and Jigar Purohit as company directors;
- a single label agreement may clear a large share of the Atul cluster.

Before negotiation, obtain the exact master catalogue controlled by Rutumbhara and separate recordings whose event/live-production agreements impose additional restrictions.

## Priority F: self-controlled artist catalogues

The strongest current clusters are Rutvi Pandya at 64 catalogue rows and Geeta Rabari Official at 59 metadata rows. `2245114 Records DK` accounts for another 28 rows associated with Aditya Gadhvi releases, but the authorised licensor behind that imprint must first be identified.

Artist-controlled catalogues can be commercially and operationally easier than major-label licences, but underlying compositions still need proper treatment. A master-owner grant does not automatically clear songs written or composed by third parties.

## The 700-track portfolio target

Do not require all 700 tracks to come from the existing 1,169-row catalogue. The preferred portfolio is:

- **Tier 1, core favourites:** clear the most important existing GARBA recordings.
- **Tier 2, catalogue partnerships:** add rights-clean recordings from Gujarati labels even when a recording is new to the current catalogue.
- **Tier 3, controlled traditional library:** create new high-quality recordings of traditional Garba/Raas repertoire under contracts that give GARBA the necessary master rights and document underlying-work status.

This creates a resilient library instead of a fragile clone of third-party streaming catalogues.

## Commercial request structure

For each serious label ask for three scenarios:

- 100-track pilot;
- 250-track expansion;
- 500+ catalogue partnership.

Request both a fixed-fee and revenue-share proposal where available. Separate:

- master/sound-recording rights;
- underlying musical/literary rights;
- artwork rights;
- online streaming;
- ordinary technical caching;
- explicit offline playback/downloads;
- territory;
- term;
- reporting/minimum guarantees;
- takedown/expiry.

## Technical delivery requirement

Do not accept consumer-provider downloads as masters. Preferred delivery is WAV/FLAC from the rights holder or authorised distributor, with ISRC and checksum metadata. GARBA will generate immutable production encodes and retain a private archival master outside Git history.
