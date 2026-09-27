# PlayGarba Admin analytics architecture

Status: canonical v1 contract for issue #837 and parent programme #836  
Product: PlayGarba Admin  
Short name: PGA  
Reviewed: 2026-09-09

This document defines the analytics, privacy, retention, precision, freshness and data semantics that PGA must use. Later telemetry, backend and UI work must follow this contract unless a later issue deliberately changes it with evidence.

PGA exists to answer four founder questions quickly:

1. How many listening sessions are active now?
2. How much traffic came to PlayGarba, and how is it changing?
3. What are people listening to, searching for and failing to play?
4. Is PlayGarba healthy in production?

The dashboard must not manufacture certainty. Anonymous browser telemetry can measure browser identifiers, sessions and playback behaviour. It cannot prove unique human beings.

## 1. Product and deployment boundary

Public PlayGarba and private PGA are separate security surfaces.

| Surface | Intended host | Exposure | Responsibility |
| --- | --- | --- | --- |
| Public player and Explore | `playgarba.com` | Public | Listening, discovery, catalogue and supporting pages |
| Telemetry ingestion | `events.playgarba.com` | Public write-only API | Validate and accept bounded analytics events |
| PGA | `pga.playgarba.com` | Private | Founder dashboard and protected aggregate APIs |
| Scheduled rollup worker | No public route | Private scheduled job | Convert recent event detail into durable aggregates |

The existing GitHub Pages deployment remains the canonical public product. PGA must not become a hidden route inside the GitHub Pages artefact. A guessed `/admin` path on `playgarba.com` must never expose founder data.

### 1.1 Selected v1 infrastructure

Use Cloudflare for the private/analytics plane while leaving the public GitHub Pages origin intact:

- a public Worker accepts telemetry at `events.playgarba.com`;
- Workers Analytics Engine stores recent product events and presence heartbeats;
- a scheduled Worker reads recent analytics and writes durable aggregate rollups to D1;
- a separate PGA Worker serves the private PWA and protected aggregate APIs at `pga.playgarba.com`;
- Cloudflare Access protects the PGA Worker or hostname before PGA code runs;
- PGA browser code never receives the Analytics Engine SQL token, D1 credentials or other server secrets.

The public telemetry Worker must not serve PGA. Keeping the untrusted public write endpoint and the founder application in separate Workers reduces the blast radius of an ingestion bug.

Cloudflare capabilities were rechecked on 2026-09-09. Workers Analytics Engine currently retains data for three months and may use adaptive sampling at high volume. D1 is therefore used for non-user-level durable rollups, and every Analytics Engine query must account for `_sample_interval` rather than assuming every stored row represents exactly one original event.

Current Cloudflare limits are capacity-planning inputs, not metric semantics and not assumptions that the free tier will always be sufficient.

Official references:

- https://developers.cloudflare.com/analytics/analytics-engine/
- https://developers.cloudflare.com/analytics/analytics-engine/limits/
- https://developers.cloudflare.com/analytics/analytics-engine/sql-api/
- https://developers.cloudflare.com/analytics/analytics-engine/sampling/
- https://developers.cloudflare.com/d1/platform/limits/
- https://developers.cloudflare.com/workers/configuration/cloudflare-access/
- https://developers.cloudflare.com/workers/configuration/routing/custom-domains/

## 2. Data-flow contract

```text
playgarba.com
  |
  | bounded first-party events
  v
events.playgarba.com
  |
  | schema validation, redaction, normalisation, HMAC pseudonyms
  v
Workers Analytics Engine
  |                 \
  | recent queries   \ scheduled rollup
  v                   v
pga.playgarba.com     D1 aggregate history
  |                   /
  +------ protected --+
          queries
```

Rules:

1. The public player sends events asynchronously. Analytics failure must never block listening, search, Explore, navigation or page load.
2. The ingestion Worker rejects unknown or oversized event shapes before storage.
3. Raw client identifiers are transformed to server-side pseudonymous keys before analytics storage.
4. The ingestion Worker must not log raw request bodies in normal production logs.
5. Recent detailed queries come from Analytics Engine.
6. Long-term charts and lifetime counters come from D1 aggregates.
7. PGA receives aggregates only. PGA v1 has no raw-event explorer and no listener-level session list.
8. A dashboard query must preserve data status and precision. Backend failure is not converted to a numeric zero, and sampled data is not labelled exact.

## 3. Identity semantics

### 3.1 Anonymous browser identifier

The public client creates a random v4-style 128-bit identifier and stores it locally with a creation timestamp.

Contract:

- identifier name in implementation is not user-facing;
- it contains no account, email, IP, device fingerprint or catalogue data;
- it rotates after 180 days;
- clearing site data, reinstalling, private browsing or browser storage policy can create a new identifier;
- one human using several browsers or devices can therefore produce several browser identifiers;
- several humans sharing one browser profile can produce one identifier.

The ingestion Worker immediately transforms the client identifier with HMAC-SHA-256 using a server secret and stores only a truncated 128-bit `browser_key`. The raw client identifier is not written to Analytics Engine or D1.

PGA labels this concept **Unique browsers**, not people, users or listeners.

### 3.2 Session identifier

A session is a browser activity window, not a login session.

- create a random `session_id` when no active session exists;
- reuse the same session across same-browser tabs when shared storage is available;
- expire a session after 30 minutes with no accepted activity;
- continuous confirmed listening counts as activity;
- a new session after inactivity gets a new random ID;
- ingestion HMACs the ID into `session_key` before storage.

A session can span midnight.

**Sessions** means accepted `session_started` events in the selected window. **Active sessions** means distinct session keys observed in the selected window. PGA must not silently switch between those meanings.

### 3.3 Tab, search and playback correlation

Each document gets an ephemeral random `tab_id`. Each search gets a random `search_id`. Each newly selected playable content instance gets a random `playback_instance_id`.

The ingestion Worker transforms them into bounded HMAC pseudonyms when they must be retained for joins:

- `tab_key`;
- `search_key`;
- `playback_key`.

These exist only to deduplicate events and correlate product transitions. They must not become founder-visible identity.

## 4. Reporting timezone

Store event timestamps as UTC milliseconds.

The canonical product reporting timezone for day-based PGA metrics is `Asia/Kolkata`.

Reasons:

- PlayGarba's primary cultural and release context is India;
- Navratri day boundaries should not move when the founder travels;
- a fixed reporting timezone keeps period comparisons reproducible.

UI labels must make this explicit where ambiguity matters, for example `Today · IST`.

Health/deployment timestamps may additionally show UTC when that matches infrastructure evidence. A future personal display-timezone preference must not silently redefine historical daily rollups.

## 5. Event envelope

Every accepted event has this logical envelope after ingestion normalisation.

| Field | Required | Meaning |
| --- | --- | --- |
| `schema_version` | Yes | Integer event schema version |
| `event_name` | Yes | Allowlisted event name |
| `event_id` | Yes | Random idempotency key generated by client |
| `occurred_at` | Yes | Client event time, bounded against server time |
| `received_at` | Yes | Server receive time |
| `browser_key` | Yes | Server-HMAC anonymous browser pseudonym |
| `session_key` | Yes | Server-HMAC analytics session pseudonym |
| `tab_key` | When needed | Server-HMAC ephemeral tab pseudonym |
| `search_key` | Search attribution | Server-HMAC search correlation key |
| `playback_key` | Playback attribution | Server-HMAC playback-instance correlation key |
| `surface` | Yes | `player`, `explore`, `nonstop`, `editorial` |
| `display_mode` | Yes | `browser`, `standalone`, `minimal-ui`, `unknown` |
| `world` | When applicable | One of the six PlayGarba presentation worlds |
| `content_type` | When applicable | Canonical object type such as `song`, `release`, `nonstop_set`, `chapter` |
| `content_id` | When applicable | Canonical catalogue/discovery identifier, never free-text title |
| `entry_point` | When applicable | Bounded origin such as `player`, `explore_search`, `explore_collection`, `nonstop_browser`, `deep_link` |
| `referrer_host` | When applicable | Hostname only, never full URL/path/query |
| `source` / `medium` / `campaign` | Optional | Sanitised bounded acquisition fields |
| `country` | Server derived | Coarse country code when available |
| `region` | Server derived | Coarse region only if allowed by privacy thresholds |
| `device_family` | Server normalised | `mobile`, `tablet`, `desktop`, `other`, `unknown` |
| `os_family` | Server normalised | Coarse family only |
| `browser_family` | Server normalised | Coarse family only |
| `event_value` | Event specific | Small numeric value such as played milliseconds |
| `error_code` | Event specific | Allowlisted product/runtime error class |
| `build_id` | Recommended | Deployed PlayGarba build identity for regression attribution |

Unknown keys are rejected or dropped by an explicit schema-version rule. The backend must never store arbitrary client objects.

### 5.1 Request metadata that must not be retained

The edge inevitably receives network metadata needed to process an HTTP request. PGA product analytics must not persist:

- raw IP addresses;
- raw `User-Agent` strings;
- full referrer URLs;
- full page URLs containing query strings;
- cookies unrelated to the analytics contract;
- device fingerprints;
- names, emails or account IDs.

Normalise the minimum needed dimensions in memory and discard the raw values.

## 6. Event taxonomy

### 6.1 Product and navigation

| Event | Trigger |
| --- | --- |
| `browser_created` | A new 180-day anonymous browser identifier is generated |
| `session_started` | A new 30-minute analytics session is created |
| `surface_viewed` | A meaningful product surface becomes the active view |
| `explore_opened` | Listener enters Explore from the player or another supported entry |
| `nonstop_opened` | Listener opens the Nonstop browser/mode |

Do not emit `surface_viewed` for every internal re-render. One human-visible navigation state should create one event.

### 6.2 Search and discovery

| Event | Trigger |
| --- | --- |
| `search_submitted` | Non-empty search is executed |
| `search_zero_results` | Executed search returns no matching catalogue results |
| `search_result_selected` | A result is selected from a search context |
| `collection_selected` | A supported Explore collection/filter is selected |

Each search creates a random `search_id` that becomes `search_key` at ingestion so conversion can be joined without relying on query text.

Raw search text is potentially user-entered free text. The ingestion Worker must:

- trim and Unicode-normalise it;
- cap it at 80 characters;
- reject/redact obvious email addresses, phone-number-like strings and URL-like strings;
- store it only for search analytics where the query itself is needed;
- never write an individual zero-result query to long-term D1 history;
- only present aggregate query text in PGA when at least three accepted searches share the normalised term in the selected period.

The normal recent-event retention therefore bounds raw search-term retention to the Analytics Engine retention window.

### 6.3 Playback

| Event | Trigger |
| --- | --- |
| `play_intent` | Listener requests Play or selects a playable row |
| `playback_started` | Provider/runtime confirms media actually entered playing state for a new playback instance |
| `playback_resumed` | Existing paused playback instance returns to confirmed playing state |
| `playback_paused` | Confirmed playing state becomes paused through listener/provider state |
| `playback_ended` | Confirmed playback reaches its truthful end state |
| `next_requested` | Listener invokes Next |
| `previous_requested` | Listener invokes Previous |
| `skip_requested` | Product-supported skip action is invoked where distinct from Next |
| `playback_unavailable` | Listener attempts content that has no executable truthful route |
| `playback_error` | Executable route fails with an allowlisted runtime/provider error class |

`play_intent` and `playback_started` must never be collapsed. A click is not proof that audio played.

A resume is not a new play start. A content change creates a new playback instance and `playback_key`.

Provider or YouTube state churn must be deduplicated so repeated callbacks for the same transition do not produce repeated events.

### 6.4 Presence and listening-time heartbeat

Emit `presence_heartbeat` approximately every 45 seconds while either:

- the page is visible and the session is active; or
- playback remains confirmed as playing.

The heartbeat includes bounded state:

- active surface;
- `playback_state`: `playing`, `paused`, `none`, `unknown`;
- canonical content type/id when confirmed;
- presentation world when applicable;
- `played_ms_since_previous_heartbeat`, capped at 60,000 ms.

Do not queue presence heartbeats for later replay after an offline period. Old heartbeats must never make someone look live.

Listening time is calculated from accepted heartbeat deltas and capped to at most 60 seconds per `(session_key, minute bucket)`. This prevents two same-session tabs from doubling wall-clock listening time.

## 7. Live-presence semantics

PGA `Live now` is an approximate active-session measure, with precision metadata from the analytics source.

### 7.1 Live now

A session is live when it has an accepted `presence_heartbeat` in the previous 120 seconds.

`Live now` = distinct `session_key` values meeting that rule.

This 120-second expiry gives a bounded tolerance for timer throttling while keeping ghost sessions short-lived.

### 7.2 Listening now

`Listening now` = distinct live `session_key` values whose most recent accepted heartbeat reports confirmed `playback_state = playing`.

### 7.3 Browsing now

`Browsing now` = `Live now - Listening now`.

It is an aggregate convenience metric, not a claim about attention.

### 7.4 Live breakdown privacy

Top-level live counts may display `1`.

Breakdowns that could reveal one anonymous listener's current context use a minimum aggregation threshold of three sessions. This applies to:

- live geography;
- current content/title breakdown;
- fine-grained live source breakdown;
- world breakdown by default in v1.

Below threshold, PGA shows `Insufficient volume` or groups the row into `Other` rather than exposing the dimension.

## 8. Acquisition, device and geography

### 8.1 Acquisition

Store:

- referrer hostname only;
- sanitised `utm_source`, `utm_medium` and `utm_campaign` values using a conservative allowlist and length cap;
- `direct` when no useful referrer/source exists.

Never store full referrer paths, full landing URLs or arbitrary query strings.

### 8.2 Device/browser

Normalise to coarse families at ingestion and discard raw user-agent input.

Example values:

- device: mobile, tablet, desktop, other, unknown;
- OS: iOS, Android, macOS, Windows, Linux, other, unknown;
- browser: Safari, Chrome, Firefox, Edge, other, unknown.

Do not expose full version strings in normal analytics.

### 8.3 Geography

Derive coarse geography at the edge if available. Do not geolocate from stored IP data.

- country is the primary geography dimension;
- region/state is secondary and suppressed below an aggregate threshold of three browsers or sessions in the selected period;
- city and exact coordinates are out of scope for PGA v1;
- no live map of individual sessions.

## 9. Recent and durable storage

### 9.1 Workers Analytics Engine datasets

Use two logical datasets so high-frequency presence does not drown product events:

#### `playgarba_events_v1`

Contains non-heartbeat product events.

Recommended sampling index: `browser_key`.

Use for:

- recent product/navigation/playback events;
- 7d/30d/90d browser/session calculations;
- recent search-term demand;
- recent content/source/device/geography breakdowns;
- recent errors and playback failures.

#### `playgarba_presence_v1`

Contains `presence_heartbeat` only.

Recommended sampling index: `session_key`.

Use for:

- Live now;
- Listening now;
- short live trends;
- listening-time heartbeat aggregation.

Both datasets follow the current Analytics Engine three-month retention boundary.

### 9.2 Sampling and precision contract

Analytics Engine can sample on write and read. Every stored row exposes `_sample_interval`.

Required query rules:

- event counts use `SUM(_sample_interval)`, not plain `COUNT()`, when sampling is possible;
- numeric sums use weighted values such as `SUM(_sample_interval * value)`;
- weighted averages use weighted numerator / weighted denominator;
- rollups preserve whether source rows were sampled;
- distinct-browser/session metrics are **exact** only when the implementation proves the query window is unsampled or uses a verified exact strategy;
- if sampling affects a distinct metric and no exact strategy exists, PGA marks it **estimated** or **unavailable**, never exact;
- a sampled metric must not be rendered with more visual precision than the evidence supports.

API metric objects must be able to expose:

- `precision: exact | estimated | unknown`;
- `sampled: true | false | unknown`;
- an optional denominator/sample count when useful.

The low-volume launch state is likely unsampled, but the product contract must remain truthful after traffic grows.

### 9.3 D1 aggregate history

D1 stores non-user-level rollups only.

Recommended logical tables:

#### `daily_metrics`

- `date_ist`
- `metric_key`
- `dimension_type`
- `dimension_value`
- `value_num`
- `sample_count`
- `precision`
- `sampled`
- `schema_version`
- `generated_at`

Primary key: `(date_ist, metric_key, dimension_type, dimension_value)`.

Examples:

- confirmed play starts by day;
- listening seconds by day;
- sessions started by day;
- browser identifiers created by day;
- plays by canonical content id/day;
- plays by presentation world/day;
- PWA/browser sessions by day;
- coarse source/device/country totals where privacy thresholds are satisfied;
- error counts by allowlisted error code.

#### `lifetime_counters`

- `metric_key`
- `value_num`
- `precision`
- `through_date_ist`
- `updated_at`

Use only for additive metrics that can be safely combined across finalised daily rollups, such as:

- browser identifiers created;
- sessions started;
- confirmed play starts;
- listening seconds;
- surface views.

Do not create a lifetime `unique people` or `unique browsers` counter by summing daily distinct counts.

#### `rollup_runs`

Track each rollup interval, source window, status, schema version, sampling/precision state and generated time so PGA can detect stale or partial history.

### 9.4 Long-term free text

Do not copy individual search queries, runtime messages or raw referrers into D1.

Long-term D1 data should remain aggregate and non-user-level. Search terms stay in the recent-detail window unless a later, separate issue defines a thresholded editorial-demand dataset with its own retention policy.

## 10. Metric definitions

### 10.1 Home and Audience

| PGA label | Definition |
| --- | --- |
| Live now | Distinct session keys with accepted heartbeat in last 120 seconds |
| Listening now | Distinct live session keys with latest confirmed playing heartbeat |
| Browsing now | Live now minus Listening now |
| Unique browsers | Distinct browser keys with any accepted production event in selected window |
| Sessions | Accepted `session_started` events in selected window |
| Active sessions | Distinct session keys with any accepted event in selected window |
| New browser IDs | Accepted `browser_created` events in selected window |
| Returning browsers | Distinct active browser keys in the selected window that do not have `browser_created` inside that same window |
| Surface views | Weighted accepted `surface_viewed` events |
| PWA sessions | Sessions whose first accepted event reports standalone/minimal-ui display mode |
| Browser sessions | Sessions not classified as PWA sessions |

`Unique browsers` is only available for ranges covered by event-detail retention unless a future privacy-reviewed durable distinct-count design is introduced.

For older/all-time context use **Browser IDs created**, **Sessions started**, **Confirmed plays** and other additive lifetime counters. Do not rename them to `all-time people`.

A lost `browser_created` event can make a browser look returning. Data-quality health should make ingestion loss visible rather than silently claiming perfect classification.

### 10.2 Listening

| PGA label | Definition |
| --- | --- |
| Play intents | Weighted accepted `play_intent` events |
| Confirmed play starts | Deduplicated/weighted `playback_started` events |
| Play success rate | Eligible `play_intent` playback keys followed by `playback_started` on the same playback key within 30 seconds / eligible play-intent playback keys |
| Listening time | Sum of deduplicated capped heartbeat playback milliseconds, weighted for source sampling |
| Listening sessions | Sessions with at least one confirmed play start |
| Avg listening session | Listening time divided by listening sessions |
| Pauses | Weighted accepted `playback_paused` events |
| Next | Weighted accepted `next_requested` events |
| Previous | Weighted accepted `previous_requested` events |
| Unavailable attempts | Weighted accepted `playback_unavailable` events |
| Playback failures | Weighted accepted `playback_error` events |

Do not call measured top content `popular`, `iconic` or `trending` unless the label explicitly describes the measurement, for example `Most played · 30d`.

If sampling makes a rate estimated, both numerator and denominator must use compatible weighting and the response must carry estimated precision.

### 10.3 Search and discovery

| PGA label | Definition |
| --- | --- |
| Searches | Weighted accepted `search_submitted` events |
| Zero-result searches | Weighted accepted `search_zero_results` events |
| Zero-result rate | Zero-result searches / Searches |
| Search-to-play conversion | Eligible search keys followed by a confirmed play within 10 minutes / eligible search keys |
| Explore-to-play conversion | Explore entries followed by a confirmed play in the same session attribution window / eligible Explore entries |
| Unmet demand | Thresholded zero-result and unavailable-attempt aggregates, kept separate by cause |

Search conversion attribution ends when:

- 10 minutes pass;
- a new search supersedes the current search; or
- the analytics session ends.

A search conversion join uses `search_key`, not the raw search string.

### 10.4 Worlds and Nonstop

The six presentation worlds remain:

- Traditional;
- Dandiya;
- Devotional;
- Folk;
- Sanedo;
- Fusion.

Nonstop is a listening mode and first-class set type, not a seventh world.

PGA may show `Nonstop starts` beside world metrics, but must not insert `Nonstop` into the world distribution denominator.

## 11. Canonical content identity

Telemetry sends canonical IDs, not titles, artist strings or display labels when an ID exists.

At query/render time PGA joins IDs to current canonical catalogue/discovery labels.

Requirements:

- title/artist renames do not split historical usage;
- retired/merged IDs require an explicit analytics alias/migration map before history is combined;
- unknown IDs display as `Unknown/retired ID` with the ID available to the founder, not a guessed title;
- event free text must never override catalogue identity;
- long-form releases, Nonstop sets and chapters keep their distinct object types.

## 12. Internal, test and bot traffic

### 12.1 Environment

Only events from the production public origin are eligible for production PGA metrics by default.

Localhost, preview builds and test fixtures must carry a non-production environment and stay out of production aggregates.

### 12.2 Internal founder/test browsers

Internal exclusion is a data-quality feature, not a security boundary.

Preferred implementation is a protected server-managed list of HMAC browser keys or an equivalent private exclusion mechanism. PGA default views exclude known internal/test keys but may expose an explicit `include internal` diagnostic mode later.

Do not depend solely on a public query parameter that any visitor can set as proof that traffic is internal.

### 12.3 Bots

Because events originate from client JavaScript, many non-browser crawlers will not emit telemetry. The ingestion Worker should additionally apply a conservative known-bot classification when available.

PGA must not call the remaining traffic `humans`. Bot filtering is best-effort and versioned.

## 13. Event validity and abuse controls

The public telemetry endpoint is intentionally unauthenticated, therefore event data is untrusted input.

Required controls:

- POST only;
- production origin/CORS checks where browser policy can help, without treating CORS as authentication;
- strict content type;
- request body limit;
- batch event count limit;
- per-event field count and string length limits;
- allowlisted event names and enum values;
- bounded timestamp skew;
- deterministic event IDs and duplicate defence for the useful retry window;
- server-side HMAC for pseudonyms;
- rate limiting using edge controls that do not require storing raw IPs in product analytics;
- reject arbitrary nested JSON;
- no user-supplied SQL/filter expression reaches Analytics Engine or D1;
- no secrets accepted from or returned to the public client.

Transport may be at-least-once. Metric queries/rollups therefore must use the event id/correlation contract to avoid retry duplication where exact event counts matter.

Abuse can make public analytics noisy. PGA should expose data-quality health so suspicious volume changes can be investigated without pretending every accepted event is a real listener.

## 14. Error telemetry

Error analytics must be useful without becoming a log dump.

Allowed runtime error payload:

- allowlisted `error_code`;
- first-party `source_module` enum;
- route/surface enum;
- numeric line/column where available and useful;
- canonical content/provider context when relevant;
- build identity.

Do not store:

- arbitrary exception objects;
- full third-party stack traces;
- full URLs with queries;
- DOM text;
- form/input values;
- YouTube/user-generated messages that have not been sanitised.

Unknown client errors use a generic class plus source/build context. Health can still identify a regression by build without collecting uncontrolled text.

## 15. Data-status, precision and API response contract

Every protected PGA data endpoint returns data plus status metadata.

Logical envelope:

```json
{
  "status": "complete",
  "generatedAt": "2026-09-09T20:00:00Z",
  "dataThrough": "2026-09-09T19:59:30Z",
  "window": {
    "from": "2026-09-09T00:00:00+05:30",
    "to": "2026-09-10T00:00:00+05:30",
    "timezone": "Asia/Kolkata"
  },
  "sources": [
    { "name": "analytics-engine", "status": "complete", "sampled": false },
    { "name": "d1-rollups", "status": "complete", "sampled": false }
  ],
  "data": {
    "sessions": {
      "value": 123,
      "precision": "exact",
      "sampled": false
    }
  }
}
```

Allowed top-level statuses:

- `complete`: query ran successfully and the requested source window is complete;
- `partial`: some requested sources/windows succeeded and others did not;
- `stale`: the endpoint returned a previously valid snapshot older than its freshness target;
- `unavailable`: no trustworthy data can be returned.

Allowed metric precision:

- `exact`: implementation can support the value exactly under the active source/query semantics;
- `estimated`: value is statistically/weighted estimated, including sampled distinct metrics without exact recovery;
- `unknown`: source cannot establish precision.

Rules:

- real measured zero is numeric `0` with `complete` status;
- unknown/unavailable value is `null` or absent with non-complete status;
- the UI must never convert network/query failure to `0`;
- stale cached values keep their original `dataThrough` timestamp;
- partial data identifies which source is missing;
- every live/presence response includes a freshness timestamp;
- sampled metrics expose sampled/precision state;
- no endpoint returns raw HMAC keys to the PGA browser.

## 16. Freshness targets

Initial targets, subject to implementation evidence:

| Data | Target freshness |
| --- | --- |
| Live now | 30 to 60 seconds query freshness, 120-second presence expiry |
| Today KPIs | Within 2 minutes |
| Recent 7d/30d/90d detail | Within 5 minutes |
| Daily durable rollup | Finalised after the IST day closes, with repair/backfill capability |
| Health/build state | Within 5 minutes or event-driven where existing evidence supports it |

If a source is older than its target, PGA marks it stale rather than silently presenting it as current.

## 17. Rollup and repair contract

The scheduled rollup job is idempotent.

- roll up a closed IST day from Analytics Engine;
- use `_sample_interval` weighting for sampled source rows;
- persist precision/sampled metadata with affected daily metrics;
- write/replace that day's aggregate rows in one controlled transaction/batch strategy;
- record a `rollup_runs` status;
- allow a bounded re-run of recent days when schema/late-event repair is required;
- never double-increment lifetime counters when a daily rollup is replayed;
- derive lifetime counters from finalised daily rows or a transactionally consistent replacement strategy;
- store the event schema version used for each rollup.

Late events keep their original `occurred_at`. A late event outside the normal repair window may remain absent from durable history. The repair window must be explicit in implementation rather than silently changing totals forever.

Recommended initial repair window: seven closed IST days.

## 18. Client delivery and offline behaviour

Telemetry uses a small dedicated runtime module and must stay outside critical rendering/playback work.

Requirements for #838:

- batch non-presence events where practical;
- use `sendBeacon` or `fetch(..., { keepalive: true })` where appropriate;
- bound an offline event queue by count, bytes and age;
- recommended initial cap: 100 non-presence events, 64 KB total, 24-hour TTL;
- drop oldest events when the queue exceeds the cap;
- never queue presence heartbeats offline;
- do not retry in a tight loop;
- analytics failure must produce no public UI toast/error;
- telemetry code must not add a blocking third-party script to public first paint.

Public performance acceptance is part of PGA release acceptance. A functioning dashboard is not a valid reason to slow the player materially.

## 19. PGA cache and offline contract

The PGA static shell may be cached by its own service worker if implementation proves that is safe and useful.

Private analytics API responses must not be placed into public/shared caches or a persistent service-worker data cache.

Expected behaviour:

- static shell may open offline;
- private data cannot refresh offline;
- previously rendered in-memory data may remain visible only with a clear stale/offline state if the implementation retains it;
- auth revocation prevents new private data access even if the shell remains installed;
- API responses use a private/no-store cache policy appropriate to the chosen Worker implementation.

## 20. PGA v1 information architecture data contract

### Home

Must be supportable by:

- Live now;
- Listening now;
- Unique browsers today;
- Sessions today;
- Confirmed play starts today;
- listening time today;
- comparison against the previous equivalent IST window;
- short recent activity trend;
- durable additive lifetime counters;
- compact health/attention summary.

### Audience

Must support recent ranges up to the detailed-retention boundary:

- Unique browsers;
- Sessions;
- New browser IDs / returning classification;
- PWA vs browser;
- device, OS and browser family;
- acquisition source/referrer host;
- coarse geography with privacy suppression.

For older periods where durable distinct-browser history does not exist, the API must omit/mark unavailable rather than sum daily unique counts.

### Listening

Must support:

- play intent vs confirmed play start;
- play success rate;
- listening time;
- top canonical songs/artists/releases/Nonstop sets by measured events;
- world distribution;
- search-to-play conversion;
- zero-result rate and thresholded recent unmet-demand terms;
- unavailable attempts;
- playback failures.

### Health

Health source contracts are defined in #844, but analytics/backend health must expose:

- ingestion accepted/rejected counts;
- query health;
- rollup freshness/status;
- event-schema version distribution;
- sampled/estimated metric state;
- suspicious event-volume signal where implementable;
- current PGA build identity.

## 21. UI truth rules

Later PGA UI issues must preserve these rules:

1. Never render placeholder `0` for an unknown value.
2. Loading skeletons may reserve geometry but must not resemble final numeric data closely enough to be mistaken for it.
3. A real no-data period says `No data yet` when that is clearer than `0`.
4. A failed query says it failed and offers recovery where useful.
5. Stale data shows its age.
6. Estimated/sample-weighted metrics are visually distinguishable from exact metrics when the distinction matters.
7. Percentages expose a denominator/sample count when small samples could mislead.
8. Top-content labels describe measured behaviour, for example `Most played · 30d`.
9. Live breakdowns obey minimum-volume privacy suppression.
10. Charts have accessible textual equivalents and do not rely on colour alone.
11. Home prioritises live/current founder questions over decorative analytics.

## 22. Versioning

Start at event schema version `1`.

Schema rules:

- additive optional fields can remain within a version only when old consumers are unaffected;
- renaming event names, changing metric meaning or changing required field semantics requires a new schema version;
- ingestion may accept a bounded set of active versions during migration;
- rollups record the versions included;
- PGA queries must not combine semantically incompatible versions without an explicit mapping;
- unknown future versions fail closed at ingestion until deployed code understands them.

Metric definitions are versioned product contracts. Changing what `Confirmed play starts` means requires an issue and migration note, not just a UI code edit.

## 23. Security boundary summary

Public telemetry is untrusted write input. PGA is trusted read output for the founder.

Required separation:

- telemetry Worker has only the bindings/secrets needed to validate/write telemetry;
- scheduled rollup Worker has the Analytics Engine read credential and D1 write access, with no public route;
- PGA Worker has protected Analytics Engine/D1 read access and only the minimum write access required for future admin settings;
- Cloudflare Access protects PGA before app/API execution;
- Access identity is never treated as a public listener identity;
- no analytics secret appears in the public GitHub Pages artefact;
- no PGA route appears in the public sitemap or public navigation;
- no private API response is cached as public content.

## 24. Failure-mode table

| Failure | Public PlayGarba behaviour | PGA behaviour |
| --- | --- | --- |
| Telemetry endpoint down | Listening continues; bounded events may queue/drop | Analytics source becomes stale/degraded |
| Analytics Engine write rejected | Listening continues | Health shows ingestion/rejection degradation |
| Analytics Engine query unavailable | No public effect | Recent/live metrics partial or unavailable, not zero |
| Analytics Engine sampling active | No public effect | Weighted metrics expose estimated/sampled precision where required |
| D1 unavailable | No public effect | Long-term metrics partial/unavailable; recent detail may still work |
| Rollup misses a day | No public effect | History marked stale/partial; repair job can rerun |
| Access unavailable/expired | No public effect | PGA fails closed to login/denied state |
| PGA service worker stale | No public effect | Build identity/update health detects mismatch; private API still requires auth |
| Client offline | Listening UI follows existing PWA/playback truth; presence stops | Session ages out of Live now; queued non-presence events retain original time |

## 25. Implementation order

The programme child issues should normally proceed in this dependency order:

1. #837 architecture and metric contract;
2. #839 backend foundation and #841 PGA shell may proceed in parallel after this contract lands;
3. #838 telemetry client integrates the agreed event schema while respecting active player/Explore ownership;
4. #840 live presence builds on backend + telemetry contracts;
5. #842 Home/Live and #843 Audience/Listening build on protected query endpoints + shell;
6. #844 Health integrates repository and backend operational truth;
7. #845 security hardening validates the whole private surface;
8. #846 release acceptance proves device/PWA/accessibility/performance/production behaviour.

Each issue still needs a fresh ownership preflight under `AGENTS.md`. This ordering is dependency guidance, not permission to ignore active file claims.

## 26. Non-goals for PGA v1

Do not add without a separate owner decision and issue:

- individual listener profiles;
- exact location tracking;
- raw IP analytics;
- advertising identifiers;
- fingerprinting;
- heatmaps/session replay;
- email/user-account analytics;
- public analytics pages;
- arbitrary SQL console;
- write-heavy catalogue administration;
- user messaging or push campaigns;
- popularity scores presented as cultural truth;
- a second public marketing site for PGA.

The useful v1 is a small private operational product, not a generic analytics suite.