# GARBA direct-master rights request template

Use this as a negotiation checklist, not as a claim that any rights are already granted.

## Purpose

GARBA is building a Gujarati Garba discovery and playback library. For selected recordings, the goal is to host an authorised audio master directly so users can play it in the GARBA web/PWA player without depending on third-party streaming accounts, ads, or provider availability.

## Requested rights

For the identified recordings, request written permission covering:

1. Direct hosting of supplied sound-recording masters on GARBA-controlled cloud storage/CDN.
2. On-demand interactive streaming through the GARBA website/PWA.
3. Worldwide territory, or a clearly stated permitted territory.
4. Commercial or non-commercial use as applicable to the agreed model.
5. Creation of streaming derivatives from supplied masters, such as AAC and/or Opus transcodes.
6. Normal browser/CDN caching required for streaming.
7. Explicit position on user-initiated offline caching/downloads. Treat this as prohibited unless granted.
8. Display of supplied cover art and approved artist/label metadata if desired.
9. Term, renewal, termination, takedown procedure, and any reporting obligations.
10. Confirmation that the licensor controls the sound-recording rights needed for this grant.
11. A clear statement about underlying musical works and lyrics: included in the grant, controlled by another party, traditional/public-domain, or requiring separate licensing.

## Master delivery

Preferred source is WAV or FLAC supplied directly by the authorised rights holder or their authorised distributor. Do not request or accept a consumer-stream rip as the master source.

For each file capture:
- catalogue song ID;
- exact recording title and version;
- performing artist credit;
- release title;
- ISRC when available;
- supplied filename;
- SHA-256 checksum;
- sample rate / bit depth;
- rights-holder name;
- licence/evidence reference;
- permission start and end dates;
- territory;
- offline-cache permission;
- artwork permission.

## Minimum approval wording

The written grant should unambiguously permit GARBA to store a copy of the supplied sound recording and make it available for user-selected on-demand streaming through GARBA-controlled web infrastructure. A generic statement such as “you may use the song,” permission to embed a provider player, permission to post on social media, or permission to use the music in one video is not sufficient.

## Release gate

A recording is not published as GARBA direct audio until:
- rights evidence is recorded;
- the approved master is received from an authorised source;
- underlying-work requirements are resolved or documented;
- the production encode is checksum-verified;
- `data/direct-audio.json` receives a rights-gated entry;
- `data/hosting-rights.json` may then move the corresponding song to `cleared`;
- repository validation passes.
