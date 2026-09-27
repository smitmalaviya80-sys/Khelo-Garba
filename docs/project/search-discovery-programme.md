# PlayGarba search-discovery programme

Status: active implementation  
Programme issue: #368  
Technical crawl/index lane: #369  
Simplified architecture direction recorded 2026-09-08.

## Objective

Make PlayGarba easy to discover in search without turning the product into a large SEO website.

The product should stay centred on listening:

- `/` is the canonical player/home experience;
- `/explore/` is the canonical catalogue and discovery experience;
- a compact set of useful general, cultural and help pages support the product;
- `/navratri-2026/` is the focused 2026 seasonal page once deployed;
- catalogue richness belongs inside Explore rather than in hundreds of public URLs.

Success is not page count. A small set of strong, maintained pages is preferred over clusters of thin pages.

## Canonical production architecture

`https://playgarba.com/` is the canonical public origin and GitHub Pages production host.

Current production principles:

- `CNAME` is `playgarba.com`;
- root `robots.txt` advertises `https://playgarba.com/sitemap.xml`;
- the player canonical is `https://playgarba.com/`;
- `/explore/` is the canonical catalogue/discovery route;
- public HTML page URLs use lowercase paths with trailing slashes;
- query strings and hash states remain application state rather than separate search pages.

Do not introduce another canonical host or another parallel catalogue website without an explicit product decision.

## The simple public surface

### Player

```text
/
```

This is the primary product. Search visitors should be able to listen immediately.

### Explore

```text
/explore/
```

Explore is the single music-discovery surface.

It should absorb the value that would otherwise be fragmented across many SEO pages:

- strong catalogue search;
- Traditional, Dandiya, Devotional, Folk, Sanedo and Fusion browsing;
- one clear Nonstop area;
- artist browsing and artist detail inside Explore;
- release context and tracklists inside Explore;
- factual song descriptions and available story/context fields;
- one-tap playback;
- stable search/filter/detail/back/scroll state;
- good mobile and PWA behaviour;
- useful empty, loading and error states.

Artist, release, song and Nonstop detail may be rich in-product views. They do not need standalone public pages.

### General pages

Keep only pages with genuine standalone value. Current useful production routes include:

```text
/what-is-garba/
/how-to-use/
/install/
/faq/
/about/
```

The repository also contains additional cultural/editorial source pages. Audit them individually before deployment. Consolidate overlap rather than publishing a large keyword cluster.

A new general page should exist only when someone would reasonably choose to read or share that page on its own, not simply because a keyword exists.

### Seasonal page

```text
/navratri-2026/
```

Use the existing authored source. Keep it focused on current Navratri 2026 dates, sourced festival context and direct listening/discovery actions.

Do not create a tree of supporting entity pages around it.

## Explicitly cancelled route strategy

Issue #371 is closed as not planned.

Do not generate SEO pages for:

```text
/songs/{id}/
/artists/{id}/
/releases/{id}/
/nonstop/{id}/
```

Do not create one public page for every:

- song;
- artist;
- release/album;
- Nonstop set;
- genre;
- taxonomy value;
- alias;
- transliteration;
- search/filter combination.

Do not create `/garba-songs/` plus six separate style landing pages solely for SEO. The existing Explore catalogue already provides that browsing model.

If a future page is proposed, it must have a clear user purpose independent of keyword capture and must be approved as a product page, not generated automatically from catalogue data.

## Application-state URL policy

The player may use functional query state such as:

```text
/?song={song-id}
/?genre={genre-id}
/?nonstop={set-id}
```

Explore may use hash/search/filter state such as:

```text
/explore/#collection={id}
/explore/#collection={id}&release={release-id}
/explore/#search={query}
```

These states are allowed for product behaviour but are not separate canonical landing pages.

Rules:

- do not add them to the sitemap;
- do not expose infinite crawl graphs;
- canonicalize the player to `/` and Explore to `/explore/` as appropriate;
- tracking parameters do not create new canonical URLs;
- aliases and transliterations improve in-product search but do not generate URLs.

## Compatibility routes

Compatibility or handoff routes such as `/catalogue/` or `/live/` must not compete with canonical pages.

Prefer a true permanent redirect where the hosting layer supports it. Otherwise keep compatibility HTML explicitly non-indexable and point its canonical target to the real page.

Do not include compatibility URLs in the sitemap.

## Search intent map

### Listening intent

Primary targets:

- play Garba online;
- Gujarati Garba online;
- Gujarati Garba songs;
- Garba music online;
- Nonstop Garba;
- Traditional Garba;
- Dandiya / Dandiya Raas;
- Devotional Garba;
- Folk Garba;
- Sanedo;
- Fusion Garba.

These should be handled primarily by the player and Explore rather than by one URL per phrase.

### Seasonal intent

Primary 2026 targets:

- Navratri songs 2026;
- Navratri Garba 2026;
- Gujarati Garba for Navratri;
- Nonstop Garba for Navratri;
- Dandiya songs for Navratri.

Handle these with `/navratri-2026/` plus direct handoff to Explore/player.

### Informational intent

Examples:

- What is Garba?
- What is Dandiya Raas?
- What is Sanedo?
- What is Nonstop Garba?
- What is the difference between Garba and Dandiya?
- Where can I listen to Gujarati Garba online?

Prefer concise answers on a small number of substantial pages. Do not create one page for every wording variation.

### Artist/song/release searches

PlayGarba may still surface for these through:

- strong visible catalogue content in Explore;
- meaningful page titles and descriptions;
- factual artist/release/song labels visible in the application;
- external search understanding of the overall catalogue.

Do not respond by creating an individual page for every catalogue entity.

### Local/event intent

City and event pages remain evidence-gated under #375. Do not publish thin local pages without a reliable sourced event model, freshness policy, expiry logic and maintenance capacity.

## Explore-first content contract

The catalogue remains the source of truth.

Use verified repository data inside Explore for:

- canonical/display song title;
- artist/performer;
- release when known;
- genre and taxonomy;
- duration when verified;
- authored description when available;
- sourced story/background only when available;
- verified YouTube playback;
- Nonstop chapter/timestamp information only when source-backed.

Do not invent biographies, rankings, popularity, histories, dates, credits or stories to make Explore appear richer.

The right response to incomplete metadata is better verified metadata, not generated filler or new thin URLs.

## Nonstop policy

Nonstop is a listening/discovery mode, not a public page tree.

Use one strong Nonstop area inside Explore/player that can list verified sets and expose source-backed chapter detail when available.

Do not create one indexable page per Nonstop recording.

## Artist policy

Artist discovery belongs inside Explore for now.

Explore may provide artist collections, artist detail panels and verified catalogue appearances without creating `/artists/{id}/` pages.

If a standalone artist-page programme is ever reconsidered, it requires a new explicit product decision. It is not part of the current search plan.

## General-page policy

Before adding a public page, ask:

1. Does the page solve a distinct user need?
2. Is there enough factual content to make it useful without filler?
3. Is it meaningfully different from Explore, the player and existing general pages?
4. Can it be maintained?
5. Would we still want the page if search engines did not exist?

If the answer is no, do not create the page.

Prefer consolidation. One excellent page is better than several near-duplicates.

## Structured data

Use structured data only where it accurately describes visible content.

Appropriate examples can include:

- `WebSite` on the main site;
- `BreadcrumbList` on general/editorial pages;
- `Article` where a page is genuinely editorial;
- `ItemList` where a visible list warrants it.

Do not create song, release or artist pages merely to emit `MusicRecording`, `MusicAlbum`, `MusicGroup` or similar schema.

Never add fabricated fields to satisfy schema.

## Technical SEO foundation

Issue #369 owns technical crawl/index quality.

Validate:

- canonical origin and syntax;
- robots behaviour;
- sitemap only contains real deployed canonical pages;
- one canonical per indexable page;
- title, description and H1 quality;
- no accidental `noindex` on intended pages;
- no accidental indexation of application/query state;
- Open Graph URL consistency;
- real HTML links between important public pages;
- compatibility routes do not compete with canonical pages;
- crawl/index regressions fail repository validation where practical.

The sitemap should stay intentionally small.

## Navratri 2026

Issue #372 owns the seasonal page.

The page should:

1. answer the 2026 date question immediately;
2. keep separate official date ranges separate when sources differ;
3. provide concise sourced context;
4. send users directly to the player and Explore;
5. explain listening choices using existing Explore categories;
6. avoid generic festival filler;
7. avoid links to undeployed pages;
8. enter the sitemap only after it is actually deployed.

## AEO/GEO approach

Do not build a separate answer-engine page factory.

Make the pages we already have easier to understand and quote:

- answer obvious questions early;
- use clear headings;
- keep facts source-truthful;
- avoid padded introductions;
- connect relevant general pages to Explore/player;
- do not duplicate the same answer across multiple pages.

## Measurement

Issue #374 owns search measurement and indexing operations. Track only real data from approved connected tools when available:

- indexed canonical URLs;
- excluded/duplicate/error URLs;
- impressions;
- clicks;
- CTR;
- average position;
- top landing pages;
- branded vs non-branded queries;
- Navratri query visibility;
- search to play conversion;
- search to Explore engagement;
- crawl errors;
- Core Web Vitals;
- identifiable answer-engine referrals.

Do not invent baselines or commit credentials/private exports.

### Measurement source authority

Every reported number must name the system that produced it, the property/origin, the date window and the comparison window. If the required source is not connected or cannot expose the metric, record the metric as `unavailable`, not zero and not estimated.

Use these sources for these questions:

| Question | Preferred evidence | Do not substitute |
| --- | --- | --- |
| Is a canonical URL indexed or excluded? | Google Search Console page/indexing reports and URL Inspection; Bing Webmaster Tools for Bing | `site:` result counts or a successful HTTP 200 |
| What queries and landing pages receive Google search traffic? | Google Search Console Performance report/API | browser history, rank-check guesses or copied search-result screenshots |
| What receives Bing search traffic? | Bing Webmaster Tools | Google data relabelled as Bing |
| Are public pages passing field Core Web Vitals? | Search Console Core Web Vitals / CrUX where enough field data exists | local Lighthouse or the player lab harness as a field percentile |
| Did a search visitor play or enter Explore? | an explicitly approved first-party product analytics or privacy-reviewed server-side source | Search Console clicks, which end at the landing-page visit |
| Did an answer engine refer a visit? | an approved analytics/log source with an identifiable referrer | user-agent guessing or anecdotal mentions |
| Was a sitemap submitted or processed? | the relevant webmaster-tool sitemap report | presence of `/sitemap.xml` alone |

Search Console and Bing credentials, verification secrets, API tokens and private exports stay outside the repository. Repository documentation may record that a connection is `verified`, `not verified`, `not checked` or `access unavailable`, with a date and responsible operator, but never a secret value.

### Metric definitions

Use one definition per metric so reports remain comparable:

- **Impressions:** source-reported search impressions for the named property, filters and date window.
- **Clicks:** source-reported organic search clicks for the same scope.
- **CTR:** clicks divided by impressions for the same source scope. Prefer the source-reported value rather than recomputing from differently filtered exports.
- **Average position:** source-reported average position. Treat it as a directional aggregate, not a literal fixed rank.
- **Indexed canonical URLs:** canonical production URLs the connected indexing source reports as indexed. State whether the count is a complete property report or a checked URL subset.
- **Excluded/error URLs:** URLs grouped by the source's actual exclusion/error reason. Do not merge duplicates, redirects, crawled-not-indexed and server errors into one unexplained total.
- **Landing-page performance:** impressions, clicks, CTR and average position grouped by canonical landing page.
- **Search to play conversion:** approved analytics sessions/visits from organic search that trigger the defined successful Play event divided by the matching eligible organic-search visits. This metric is unavailable until the event source and privacy decision exist.
- **Search to Explore engagement:** approved organic-search visits that enter Explore divided by the matching eligible organic-search visits. This metric is likewise unavailable without an approved product-event source.
- **Core Web Vitals:** field LCP, INP and CLS status from the named field source and population. Keep lab diagnostics separate.

Always state filters that materially alter the denominator, especially country, device, search type, page and query filters.

### Reporting intent taxonomy

Group query data consistently before comparing periods. A query may be assigned to one primary reporting intent; when classification is genuinely ambiguous, use `other/unclear` rather than forcing a category.

1. **Brand**: PlayGarba/Play Garba product-name and domain/navigation queries.
2. **Generic listening**: Garba music/song listening intent such as Garba songs, Nonstop Garba, Dandiya, Traditional, Devotional, Folk, Sanedo and Fusion queries without a specific named recording/person.
3. **Seasonal Navratri**: queries where the seasonal/festival intent is material, including year-qualified Navratri music queries.
4. **Cultural/informational**: questions about what Garba, Dandiya Raas, Sanedo or related concepts are and how they differ.
5. **Artist/song/release discovery**: named artist, song, album/release or recording searches. This category measures discovery demand; it does not authorize standalone entity-page generation.
6. **Local/event**: venue, city, event or local-intent searches. Keep this evidence-gated with #375 rather than manufacturing city pages from query volume.
7. **Other/unclear**: relevant queries that cannot be classified safely from the available text/context.

Do not publish raw query exports in the repository. Rare queries can reveal user-entered personal information. Public reports should use aggregated intent groups, sanitized examples only where useful, and no attempt to identify a searcher.

### Landing-page groups

Use stable page groups so a route rename does not silently change the meaning of reports:

- `player`: `/`;
- `explore`: `/explore/`;
- `seasonal`: `/navratri-2026/` when deployed/indexable;
- `general-help`: `/how-to-use/`, `/install/`, `/faq/`, `/about/`;
- `cultural-editorial`: `/what-is-garba/` and any future substantial approved cultural page;
- `compatibility/non-indexable`: redirects/handoffs tracked for technical errors only, never counted as target landing pages.

If the sitemap/public route set changes, update the grouping from deployed canonical truth before the next report.

### Operating cadence

Use the lightest cadence that can change a decision.

**Normal / pre-Navratri:** review once per week. The weekly review should cover:

1. property/verification access status for each connected search tool;
2. sitemap processing and material indexing/exclusion changes;
3. crawl, redirect, canonical and server-error regressions;
4. impressions/clicks/CTR/average position by landing-page group and intent group;
5. seasonal Navratri query visibility when the seasonal page is deployed;
6. field Core Web Vitals status where the source has sufficient data;
7. any approved search-to-play/search-to-Explore measures;
8. one action list ranked by user impact and evidence strength.

Do not switch to daily reporting simply because Navratri is approaching. Daily checks are justified only during the highest-demand window when connected data shows active seasonal demand, or while an indexing/crawl incident or material seasonal deployment needs close verification. Daily review should be a short exception-focused check, not a full dashboard rebuild.

After the high-demand window, return to weekly review. Keep historical comparisons aligned to equivalent day counts and note major deployment/content changes that make a period non-comparable.

### Evidence-safe observation template

Use this structure in a private operating note, issue comment or approved reporting system. Do not commit private exports merely to fill the template.

```text
Search observation date:
Deployed revision/build identity:
Source/tool:
Property/origin:
Measurement window:
Comparison window:
Filters/denominator:
Intent group:
Landing-page group:
Observed result:
Evidence status: verified | partial | unavailable
Material change since prior check:
Likely interpretation:
Action / no action:
Owner:
Follow-up date:
Public-safe summary (optional):
```

Interpretation must stay separate from the observed result. A ranking or traffic change after a deployment is correlation until evidence supports a cause.

### Recrawl and resubmission procedure

Use recrawl/resubmission for material deployed changes, not as a ritual after every commit.

1. Confirm the intended change is live on the canonical origin and identify the deployed revision through the repository's build identity where available.
2. Verify the affected URL returns the intended status, canonical and robots state before asking a crawler to revisit it.
3. If the sitemap's canonical URL set changed, confirm the deployed sitemap first, then resubmit or refresh it in the connected webmaster tools as appropriate.
4. For a small number of high-priority changed canonical pages, use the search engine's URL inspection/request-indexing mechanism where available. Do not mass-submit unchanged URLs.
5. Record the request date, source/tool, affected canonical URL(s), deployed revision and result/status. Never record credentials.
6. Recheck through the same source on the next appropriate cadence. A submitted request is not proof of indexing.

For redirects, removals or canonical changes, verify both the old and new URL behavior before requesting recrawl. Do not ask indexing tools to index compatibility/query-state URLs that policy says are non-canonical.

### Bing and IndexNow

Bing Webmaster Tools status must be recorded from the actual connected property. Do not assume it is configured because Google Search Console is configured.

IndexNow is optional. Implement or use it only when the production publishing flow has an intentionally configured key and owner. If enabled:

- keep the key/secret configuration out of committed docs and source where it would expose a credential;
- notify only canonical URLs that were added, materially updated or removed;
- do not submit player query/hash states or unchanged catalogue permutations;
- record submission timestamp, changed URL set, deployed revision and response/outcome in the private operational record;
- treat successful submission as notification delivery, not proof of crawl or indexation.

If IndexNow is not configured, document that state and use the normal Bing sitemap/webmaster workflow instead. Do not create a fake setup record.

### Privacy and repository boundary

Search measurement is an operational input, not a reason to add tracking by default.

- No analytics/tracking script is added by this programme without a separate product/privacy decision.
- Do not commit credentials, verification secrets, cookies, API tokens, user identifiers, raw analytics exports or full query dumps.
- Keep private account-level metrics in the approved account/reporting system. Public issues/docs may contain only the minimum aggregated evidence needed to explain a repository decision when publication is appropriate.
- If search-to-play, search-to-Explore or answer-engine referral data cannot be measured without new tracking, report `unavailable pending product/privacy decision` rather than inventing a proxy.
- Do not infer individual user journeys by joining small or rare search-query groups with product data.

### Minimum weekly decision output

A useful search review ends with answers to these questions, each tied to a named evidence source or marked unavailable:

- Are the intended canonical pages indexed, and are any important pages excluded for a fixable technical reason?
- What intent groups are generating impressions and clicks?
- Which canonical landing-page groups are gaining or losing qualified search visibility?
- Are Navratri seasonal queries reaching the intended seasonal/player/Explore surfaces?
- Are crawl/canonical/sitemap errors blocking discovery?
- Are field Core Web Vitals showing a search-surface problem?
- Can approved evidence show whether organic visitors play or enter Explore?
- Is there one evidence-backed action worth taking now, or is the correct action to make no change and collect more data?

This operating contract makes the repository ready for real connected data. It does not assert that Google Search Console, Bing Webmaster Tools, IndexNow, product analytics or answer-engine referral measurement are currently connected; those statuses must be verified from the actual accounts/tools.

## Delivery priority

1. Keep crawl/index signals correct.
2. Make Explore materially better.
3. Keep general pages compact and useful.
4. Deploy the Navratri 2026 page and connect it to Explore/player.
5. Improve concise factual answers inside existing pages.
6. Measure what actually works before adding more public pages.

## What not to do

- no individual song pages;
- no individual artist pages;
- no individual release pages;
- no individual Nonstop pages;
- no one-page-per-genre SEO tree;
- no alias/transliteration doorway pages;
- no thousands of AI-generated articles;
- no keyword-swapped city pages;
- no fake event pages;
- no invented song histories or artist biographies;
- no hidden keyword blocks;
- no schema fields absent from visible content;
- no indexable search/filter/query permutations;
- no second marketing homepage competing with the player.

## Definition of done

PlayGarba has:

- one canonical player/home experience;
- one excellent Explore catalogue;
- a small, coherent set of useful general pages;
- a strong and deployed Navratri 2026 page;
- correct sitemap/robots/canonical behaviour;
- useful factual metadata inside Explore;
- measurement that shows whether existing pages are being crawled and used.

The long-term search advantage should come from the quality of PlayGarba's catalogue and listening experience, not from manufacturing more URLs.