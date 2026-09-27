# PlayGarba event discovery evidence contract

Status: design gate  
Implementation issue: #375  
Search programme: #368  

## Decision

PlayGarba should not publish indexable city or event pages from scraped listings, search snippets or stale festival pages.

Local discovery is safe to launch only after PlayGarba has:

1. a source-backed event inventory;
2. field-level evidence for volatile facts;
3. stable event identity and deduplication;
4. explicit timezone and occurrence handling;
5. a re-verification cadence;
6. cancellation, postponement and rescheduling rules;
7. automatic expiry from upcoming discovery;
8. an operational owner for keeping the inventory current.

This document defines that gate. It does not authorize public `/events/` or city pages by itself.

## Outcome

A future event surface should answer one simple question truthfully:

> What current Garba or Navratri events can I actually attend here, and where did this information come from?

The event system must prefer missing data over plausible guesses. It must never invent venues, dates, performers, prices, ticket availability or organiser relationships to make a listing look complete.

## Non-goals

This contract does not:

- create public event or city pages;
- create empty city slugs for search traffic;
- scrape the web indiscriminately;
- infer event schedules from previous years;
- treat every Navratri celebration as a Garba event;
- guarantee ticket availability or prices;
- copy commercial event photography or long descriptions without rights;
- turn PlayGarba into a general events marketplace.

The listening product remains primary. Local discovery should exist only if it can be more useful and trustworthy than a thin listing page.

## Source hierarchy

Source authority is field-specific. One source does not automatically control every fact about an event.

### Tier A: primary event evidence

Prefer these sources when they directly publish the relevant fact:

- organiser-owned event page;
- organiser's verified or clearly official social announcement for the current occurrence;
- venue-owned event page;
- primary ticketing page that clearly names the organiser, venue and occurrence;
- official festival programme for that occurrence.

These sources can establish the event itself when the page is clearly current and identifies the occurrence.

### Tier B: authoritative supporting evidence

Use these to confirm fields that they directly control:

- official municipal, tourism or government programme;
- performer's official schedule;
- venue directory/address page;
- organiser's official organisation page;
- ticketing provider's event detail page when it is clearly tied to the same occurrence.

### Tier C: discovery leads only

These can help find a primary source but should not independently establish a volatile event fact:

- third-party event directories;
- editorial roundups;
- search-engine snippets;
- reposted social announcements;
- community calendars without clear source attribution.

### Reject as publication evidence

Do not publish from:

- copied SEO listings with no original source;
- screenshots with no verifiable source URL;
- previous-year pages reused without an explicit current-year update;
- social reposts whose original publisher cannot be identified;
- title-only matches between different events;
- cached search text when the live source contradicts it;
- user-submitted claims with no corroborating evidence for required fields.

## Field-specific authority

When sources disagree, use the source closest to the field it controls.

Examples:

- organiser identity: organiser or official event page;
- venue name/address: event page plus venue-owned source when needed;
- ticket price and availability: primary ticketing page;
- performer: organiser announcement or performer schedule;
- cancellation/rescheduling: organiser, venue or primary ticketing notice that explicitly updates the occurrence;
- city/region/country: normalized from the verified venue/address, not inferred from the event title.

Never average conflicting times, prices, dates or addresses.

## Minimum publish evidence

An event is eligible for public discovery only when all required fields are verified.

### Required

- stable internal event ID;
- event name;
- status;
- start calendar date;
- venue, or an explicit verified online/virtual attendance mode;
- city, region and country for an in-person event;
- organiser name;
- at least one Tier A source URL;
- `lastVerifiedAt` timestamp;
- evidence mapping for every required field;
- IANA timezone when an exact local start time is published.

### Required when advertised by the source

- local start time;
- local end time/date;
- ticket URL;
- price/currency;
- age or entry restriction;
- named performers.

If the source omits one of these optional facts, PlayGarba must omit it too.

### Never infer

Do not infer:

- a default evening start time;
- a nine-night schedule because an event is associated with Navratri;
- a performer from a poster style or previous edition;
- a ticket price from another date or city;
- sold-out/available status from an old ticket page;
- end time by adding an assumed duration;
- a venue from the organiser's home city;
- recurrence from an annual event name alone.

## Proposed canonical record

The future event store should preserve both normalized values and their evidence.

```json
{
  "id": "event-stable-id",
  "name": "Verified event name",
  "slug": "verified-event-name",
  "status": "scheduled",
  "attendanceMode": "in_person",
  "start": {
    "localDate": "2026-10-11",
    "localTime": "19:30",
    "timezone": "America/Toronto",
    "utc": "2026-10-11T23:30:00Z"
  },
  "end": null,
  "venue": {
    "name": "Verified venue name",
    "address": "Verified address",
    "city": "Toronto",
    "region": "Ontario",
    "country": "Canada",
    "latitude": null,
    "longitude": null
  },
  "organizer": {
    "name": "Verified organiser",
    "url": null
  },
  "performers": [],
  "seriesId": null,
  "occurrenceKey": "2026-10-11",
  "ticketUrl": null,
  "offers": null,
  "previousStarts": [],
  "sourceUrls": [],
  "lastVerifiedAt": "2026-09-08T19:00:00Z",
  "fieldEvidence": {},
  "evidenceNotes": ""
}
```

The exact implementation schema may differ. The invariants above should not.

## Stable event identity

A title is not an identity.

### Prefer source identifiers

When a primary organiser or ticketing source exposes a durable event/occurrence identifier, retain it as an external ID.

### Fallback identity

When no durable external ID exists, establish identity from a conservative combination of:

- normalized event name;
- organiser;
- venue;
- local calendar date;
- explicit occurrence relationship.

Do not derive the stable internal ID only from the display title.

### Do not merge automatically when

- the same event name appears on different dates;
- the same name appears at different venues;
- two organisers independently use a similar event name;
- an annual event has a new year's occurrence;
- a later reissue/listing cannot be proven to represent the same occurrence.

### Rescheduled event

When an authoritative source explicitly says the same occurrence moved to a new date or venue:

- preserve the stable event ID;
- update the current verified schedule/location;
- retain the previous start in `previousStarts`;
- store the source that proves the reschedule.

Do not create a duplicate event simply because the new date changed.

## Series, multi-night and recurring events

A festival series and an occurrence are different concepts.

### Series

Use an optional `seriesId` to group related occurrences such as an organiser's named annual or multi-night programme.

A series does not make unverified dates publishable.

### Multi-night programmes

Create explicit occurrence records when the source publishes distinct dates, times, venues or tickets.

If one official page sells a single multi-night admission and does not separate occurrences, retain the programme as one event record with its verified date range rather than inventing individual nights.

### Recurrence

If an authoritative source publishes recurrence rules, they may be retained as source metadata. Public occurrence records should still be materialized only from dates that the source actually confirms.

Do not generate every Navratri night because a pattern seems culturally likely.

## Time and timezone contract

Use IANA timezone identifiers such as:

- `Asia/Kolkata`
- `America/Toronto`
- `America/New_York`

Do not store a fixed UTC offset as the timezone identity.

When an exact time exists, preserve:

1. the local source date/time;
2. the IANA timezone;
3. the derived UTC instant.

When the source publishes only a calendar date, store a date-only event. Do not invent midnight, noon or an evening start.

Timezone rules can change. Runtime conversion should use a maintained IANA timezone database rather than handwritten offsets.

## Event status contract

Internal status should distinguish at least:

- `scheduled`;
- `postponed`;
- `rescheduled`;
- `cancelled`;
- `completed`;
- `verification_required`.

### Cancelled

When a primary source cancels an occurrence:

- keep its stable identity;
- preserve the original scheduled start and location as historical facts;
- mark it cancelled;
- record the cancellation source;
- remove ticket-availability claims that are no longer valid.

Do not silently delete a cancelled event before its original occurrence date. A user who already found the event needs to see that it was cancelled.

### Postponed

When the event is postponed and no replacement date is known:

- retain the original schedule;
- mark it postponed;
- do not invent a new date;
- re-verify on the high-frequency cadence until a new date or cancellation is published.

### Rescheduled

When a new date is explicitly published:

- mark the event rescheduled;
- update the current date/time;
- preserve the previous date/time;
- keep the same event identity when the source confirms continuity.

### Completed

After the verified end, or after the start plus the repository's conservative completion window when no end is published, remove the event from upcoming discovery.

Do not present a past event as available because a stale ticket page still resolves.

## Freshness policy

Freshness is part of the evidence, not a background implementation detail.

The following is the default PlayGarba operational policy. It can be tightened for a volatile source.

| Time until event | Re-verification target |
| --- | --- |
| More than 60 days | At ingest, then at least every 14 days |
| 15 to 60 days | At least every 7 days |
| 2 to 14 days | At least every 48 hours |
| Less than 48 hours | At least once within the final 24 hours |
| Postponed or status-conflicted | At least every 24 hours while material uncertainty remains |

Ticket availability and price are more volatile than event identity. If PlayGarba later displays live availability, that field needs its own stricter freshness rule and should be omitted when it is stale.

Every public event record must retain `lastVerifiedAt`. A future UI may show freshness when it materially helps trust, but the internal timestamp is mandatory even when it is not displayed.

## Conflict resolution

When sources conflict:

1. identify which field conflicts;
2. compare field-specific source authority;
3. compare publication/update time;
4. look for an explicit correction, cancellation or reschedule notice;
5. never merge contradictory values into a compromise;
6. if a material conflict remains unresolved, set `verification_required` and remove the event from public upcoming discovery until resolved.

A lower-authority source can trigger re-verification. It should not silently overwrite stronger evidence.

## Deduplication contract

Deduplication should be conservative.

Potential duplicates may be clustered using:

- external source IDs;
- normalized organiser;
- normalized venue;
- local date;
- normalized event name;
- ticket/source URL fingerprints.

A cluster is not an automatic merge. Merge only when the records describe the same occurrence.

Keep source aliases and old URLs as evidence after a merge so the event cannot be re-imported later as a duplicate.

## Venue and geography normalization

Retain the venue's official display spelling while storing normalized geography separately.

For in-person events, normalize:

- venue name;
- street address when published;
- city;
- region/state/province;
- country;
- optional verified coordinates.

Do not geocode an ambiguous venue name and present the result as verified without checking it against a source.

City pages, if approved later, should key from normalized geography rather than keyword matches in event titles.

## Ticket and offer handling

A ticket URL is useful only when it belongs to the same occurrence.

Rules:

- retain the primary ticket URL when verified;
- do not rewrite tracking/referral parameters into an unverified destination;
- show price only when the source publishes it for the same ticket/occurrence;
- preserve currency;
- do not convert currencies for stored canonical facts;
- do not claim `available`, `sold out` or `waitlist` without a sufficiently fresh primary source;
- when availability is unknown, omit it.

If multiple legitimate ticket classes exist, a future implementation may store them as separate offers. Do not reduce a price range to one misleading headline price.

## Performer and organiser handling

A poster, event title or platform category is not enough to establish a performer relationship.

Publish a performer only when an authoritative source explicitly names that performer for the occurrence.

Keep organiser and performer separate. A singer promoted by an organiser is not automatically the organiser, and a venue hosting the event is not automatically the organiser.

## Rights and copied content

Event facts are not permission to copy creative assets.

Do not ingest:

- copyrighted event posters as permanent site assets without rights;
- long organiser descriptions verbatim;
- ticketing-platform photography without a reusable licence or explicit permission.

A future listing should use concise source-backed factual copy and link to the primary source for full details.

## Public event-page gate

An individual event URL should be considered only when:

- all required evidence is present;
- the event is within the maintained inventory window;
- its source can be re-verified on schedule;
- the page has useful standalone information beyond a title/date/link;
- visible content and structured data can stay synchronized;
- there is a defined post-event lifecycle.

Do not create event pages merely because a source URL was discovered.

## City-page publication gate

Do not pre-create city pages.

A city becomes eligible for an indexable local page only when the current inventory contains enough independently verified information to make the page useful.

Default gate:

- at least three verified upcoming occurrences in that normalized city, with current freshness; or
- one official multi-night programme containing at least three separately verified occurrences;
- and enough source diversity or programme detail that the page is more than a doorway to one external listing.

This is an editorial/product gate, not a ranking claim.

If inventory later falls below the gate, do not fabricate replacement content. The owning local-discovery implementation must define whether the existing URL becomes a truthful seasonal/archive page or is removed from indexing. That lifecycle decision must be stable rather than oscillating with every individual event import.

## `/events/` publication gate

A general events index should launch only after:

- more than one geography has fresh verified inventory, or there is a clear product reason for a single-region pilot;
- the ingestion/re-verification process has operated successfully through at least one update cycle;
- cancellations/reschedules can be reflected promptly;
- expired events are automatically removed from upcoming results;
- the inventory owner is named.

Until then, a repository dataset or private pilot is preferable to a public index.

## Expiry and retention

Upcoming discovery and evidence retention have different lifecycles.

### Public upcoming discovery

- remove completed occurrences from upcoming results immediately after their verified end;
- if no end time is published, use a documented conservative completion rule in implementation rather than pretending an exact end is known;
- keep cancelled/postponed status visible through the original scheduled date when that helps users who may already have found the listing;
- remove stale ticket availability as soon as its freshness contract fails.

### Internal evidence

Retain source/evidence history long enough to:

- prevent duplicate re-imports;
- explain a cancellation/reschedule;
- audit why a field changed;
- support future annual-series matching.

Internal retention does not mean a past event must remain indexable.

## Structured-data contract for a future implementation

If event pages are later approved, structured data must describe the visible verified page only.

Use the current Google event guidance and Schema.org Event vocabulary where applicable.

Required principles:

- stable canonical URL;
- visible name, start date and location match structured data;
- `eventStatus` reflects scheduled/postponed/rescheduled/cancelled truth;
- rescheduled events preserve `previousStartDate` where supported;
- `organizer`, `performer` and `offers` appear only when verified and visible;
- do not emit hidden facts solely for search engines;
- remove or update stale event structured data as the occurrence changes.

Structured data is not a substitute for event evidence.

## Ingestion lifecycle

A future implementation should follow this sequence:

```text
discover lead
  -> identify primary source
  -> verify required fields
  -> normalize time/place/identity
  -> deduplicate conservatively
  -> store field evidence + lastVerifiedAt
  -> publish only if eligibility gate passes
  -> re-verify on cadence
  -> update cancellation/reschedule/status
  -> expire from upcoming discovery
  -> retain evidence history
```

No automated step should promote a discovery lead directly to a public listing.

## Validation requirements for a future event dataset

Repository validation should eventually reject at least:

- public event with no Tier A source;
- required field with no evidence mapping;
- timed event with no valid IANA timezone;
- invalid calendar date/time;
- `scheduled` upcoming record whose verified occurrence is already in the past;
- duplicate stable/external IDs;
- exact duplicate occurrence records;
- unsupported status value;
- stale record beyond its required re-verification window;
- ticket/price/availability fields with no supporting source;
- city-page generation below the approved inventory gate;
- structured data that disagrees with visible canonical event values.

The validator should fail closed rather than repair missing facts automatically.

## Operational ownership

Local discovery cannot be a one-time SEO content import.

Before public launch, one named repository/product lane must own:

- source ingestion;
- freshness checks;
- conflict review;
- cancellation/reschedule handling;
- expiry;
- schema/validator maintenance;
- seasonal closeout.

If PlayGarba cannot maintain that loop, it should not publish event pages.

## Recommended pilot before public launch

The next implementation should be a bounded inventory pilot, not a public page generator.

Suggested pilot contract:

1. choose one Gujarat market and one diaspora market only after confirming primary-source availability;
2. collect a small current Navratri 2026 inventory using this evidence contract;
3. run one full re-verification cycle;
4. measure duplicate/conflict/staleness rates;
5. test cancellation/reschedule representation with fixtures even if no live event changes;
6. decide whether the evidence quality and maintenance cost justify `/events/` or city pages.

The pilot should create no indexable local URLs until the publication gates above are met.

## Launch decision

**Current decision: not ready to launch public local/event SEO pages from repository evidence alone.**

The evidence and lifecycle contract is now defined. The next gate is a source-backed inventory pilot with real re-verification operations. If that pilot proves the data can stay current, a separate bounded implementation issue can add the data schema, validators and then the smallest useful public discovery surface.

## References

- Google Search Central, Event structured data: <https://developers.google.com/search/docs/appearance/structured-data/event>
- Schema.org Event: <https://schema.org/Event>
- IANA Time Zone Database: <https://www.iana.org/time-zones>
- RFC 5545, iCalendar recurrence semantics: <https://www.rfc-editor.org/rfc/rfc5545>
- PlayGarba search-discovery programme: [`search-discovery-programme.md`](search-discovery-programme.md)
