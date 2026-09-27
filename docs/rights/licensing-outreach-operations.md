# Licensing outreach operations

Status: v1, 2026-09-07

Purpose: turn GARBA's rights-holder research into a controlled first-contact and negotiation workflow without confusing a contact attempt with copyright clearance.

## Source of truth

Operational outreach state lives in:

`data/rights-acquisition/outreach-queue.json`

Contact discovery/evidence remains in:

`data/rights-acquisition/wave-01-contacts.json`

Catalogue concentration remains a prioritisation signal in:

`data/rights-acquisition/label-batches-snapshot.json`

Track-level permission remains in `data/hosting-rights.json`. Authorised source-master provenance remains in `data/master-intake.json`.

These layers must not be collapsed into one another.

## Current priority order

1. Sur Sagar Music
2. Soor Mandir
3. Jigar Studio
4. Rutumbhara Entertainment
5. T-Series
6. Saregama Gujarati
7. Aditya Gadhvi / 2245114 authority discovery
8. Rutvi Pandya authoritative-contact discovery
9. Geeta Rabari Official authoritative-contact discovery

The order is operational, not a statement of legal ownership.

The biggest current release-label metadata concentrations are Sur Sagar at 271 GARBA rows and Soor Mandir at 245 rows. Their combined 516 rows make label-level conversations potentially more efficient than hundreds of one-song requests. The separate 15-row `Soor Mandir / SM Digital` block remains distinct until the current licensor confirms its relationship to the main catalogue.

## Outreach state machine

### `route-discovery`

No sufficiently authoritative contact route is verified yet.

Allowed work:
- verify official artist/label/business pages;
- verify management or licensing representation;
- record public evidence.

Do not generate or send a licensing proposal.

### `authority-confirmation`

A credible route exists, but GARBA still needs to confirm who can license the relevant sound recordings.

First message should ask for the current master-rights/licensing authority and catalogue scope. It should not imply that the recipient already owns every recording in GARBA metadata.

### `ready-to-contact`

The route is suitable for a first business/licensing inquiry.

A request packet can be generated, reviewed, then sent manually through the verified route.

### `contacted`

Use only after a real message was sent. Record:
- `sentAt` as an ISO timestamp;
- `sentVia` describing the actual route.

Do not pre-fill these values.

### `awaiting-response`

The initial request was sent and no substantive response has arrived yet.

### `negotiating`

A substantive rights/licensing response has arrived and commercial/scope discussions are active. Record `lastResponseAt`.

### `closed-no-deal`

The lane is closed without an agreement. Preserve the reason and correspondence history outside the public repo if confidential.

### `agreement-executed`

A written agreement has been executed. Record a private `agreementEvidenceRef` and execution date.

Important: `agreement-executed` does **not** set any track to `cleared`. The agreement still needs to be mapped to exact recordings, territories, term, permitted uses, underlying-work obligations, and authorised masters.

## Validate the queue

```bash
npm run rights:outreach:validate
```

The validator checks:
- every queue item maps to a contact-research batch;
- states and priorities are valid and unique;
- catalogue counts remain explicitly marked as metadata-only signals;
- standard GARBA technical rights are included in the request brief;
- ISRC and phonogram-owner fields are requested;
- unsent states cannot carry fake send timestamps;
- contacted/negotiating states require real operational timestamps;
- executed agreements require an evidence reference and date.

## Generate a first-contact packet

Example:

```bash
npm run rights:outreach:packet -- --id sur-sagar-catalogue-direct-streaming --out /tmp/sur-sagar-request.md
```

For Soor Mandir:

```bash
npm run rights:outreach:packet -- --id soor-mandir-catalogue-licensor-confirmation --out /tmp/soor-mandir-request.md
```

The generated packet includes:
- the currently recorded public contact routes;
- the specific operational objective;
- the catalogue signal caveat;
- a suggested subject and first-contact body;
- a pre-send checklist.

It does not send anything and does not mutate the queue.

## Route-discovery safeguard

The generator intentionally throws an error for `route-discovery` items. This prevents an attractive but unverified social/profile page from silently becoming a licensing contact.

For those leads, verify the official business/management/licensing route first and update the contact map through review before moving the queue state.

## What GARBA asks a catalogue owner for

The standard first-stage request seeks:
- a machine-readable catalogue export;
- exact recording title and artist;
- release;
- ISRC;
- duration;
- label;
- phonogram/master owner;
- current licensor where legal identity is unclear;
- Garba/Raas/related category when available.

Commercial/scope terms should distinguish:
- direct interactive/on-demand streaming;
- GARBA-controlled hosting;
- technical transcoding;
- ordinary CDN/streaming cache;
- territories;
- term;
- reporting/minimum guarantees if any;
- artwork rights if needed;
- underlying composition/lyrics treatment;
- offline playback/download rights as a separate question.

Do not let a generic phrase such as "digital rights" substitute for these concrete permissions.

## Pilot structures

Where appropriate GARBA asks for multiple scopes, commonly 100, 250 and 500 tracks, or smaller batches for concentrated artist catalogues.

This is designed to reveal catalogue economics before GARBA commits to a large minimum guarantee or negotiates song by song.

## After receiving a catalogue export

Do not manually guess overlaps. Use:

```bash
npm run rights:match -- path/to/vendor.csv --out /tmp/vendor-match.json
```

Then:
1. review exact/likely/possible/ambiguous matches;
2. reconcile duplicate ISRCs and label disagreements;
3. ask the licensor to resolve uncertain ownership;
4. negotiate an exact identifier list;
5. map the executed agreement to individual GARBA song IDs;
6. only then advance eligible `data/hosting-rights.json` records toward `licence-review` and eventually `cleared`;
7. accept lossless masters only through the authorised master-intake pipeline.

## Private correspondence

Do not commit:
- private email addresses supplied under confidence;
- executed contracts;
- commercial price sheets marked confidential;
- private catalogue exports;
- source master binaries.

The public repo may contain non-sensitive operational state and opaque private evidence references, for example:

`private-rights-record:sur-sagar-2026-001`

## Sending responsibility

Packet generation is preparation, not sending. Immediately before a real send, a human should confirm:
- the route is still official/current;
- the recipient is appropriate for licensing/business enquiries;
- the same request has not already been sent through another channel;
- the message does not claim rights GARBA does not have;
- any commercial details that should remain private are not committed back to GitHub.

After sending, update the queue with the actual timestamp and route in a small auditable change.
