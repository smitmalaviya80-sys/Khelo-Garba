# PGA Health model

This directory contains the pure status-evaluation layer for PlayGarba Admin Health.

It does **not** fetch production, GitHub, Cloudflare, catalogue or PWA data. Later #844 adapters collect those signals behind the protected PGA backend and pass bounded evidence into this model. Keeping collection separate makes the status rules deterministic and testable while #843 owns the current admin UI/API files.

## Product question

PGA Health should answer:

> Is PlayGarba healthy in production, what is not healthy, how fresh is the evidence, and what should I inspect next?

It must not answer a failed query with `0`, reuse an old green check as if it were current, or call the public player down because a supporting analytics service is unavailable.

## Stable states

The v1 model exposes five states:

- `healthy` — current evidence explicitly says the subsystem is working;
- `degraded` — working or reachable but with a meaningful problem;
- `stale` — the underlying observation may have been healthy/degraded/unknown, but it is older than the freshness budget supplied by its adapter;
- `unknown` — evidence is missing, pending, cancelled or otherwise not a completed trustworthy result;
- `failed` — the subsystem has explicit current failure evidence.

A subsystem can be `failed` while the overall product is only `degraded`. For example, failed CI does not prove the currently deployed player is unavailable. Production reachability and truthful playback are release-critical, so their explicit failures can make the overall Health state `failed`.

## Criticality

Default subsystem criticality is deliberately narrow:

| Subsystem | Default criticality | Overall effect of explicit failure |
| --- | --- | --- |
| Production | critical | failed |
| Playback | critical | failed |
| Deployment | important | degraded |
| CI | important | degraded |
| Catalogue | important | degraded |
| Telemetry | supporting | degraded |
| Rollups | supporting | degraded |
| PWA | supporting | degraded |

Later adapters may supply another criticality only when #844 deliberately defines that evidence source. The pure model does not infer criticality from a URL, check name or free text.

## Freshness

There is no universal hard-coded stale timeout.

Each adapter can supply:

```js
{
  status: 'healthy',
  checkedAt: 1788990000000,
  freshnessBudgetMs: 300000
}
```

or a `dataThroughAt` timestamp for aggregate data. The model marks non-failed evidence stale only after its own explicit budget expires.

Why this matters:

- a production reachability probe may need a short budget;
- a scheduled rollup naturally has a different cadence;
- a CI result can remain useful longer than a live probe;
- an absent budget means the model does not invent one.

Hard failures remain failures even if their observation is old. The adapter/UI can still show the old timestamp and request a new probe.

## Evidence shape

A subsystem accepts a bounded object such as:

```js
{
  status: 'degraded',
  criticality: 'important',
  checkedAt: 1788990000000,
  freshnessBudgetMs: 1800000,
  summary: 'Production is serving a different build than expected.',
  reason: 'Expected abc123 but observed def456.',
  action: 'Inspect the production deployment.',
  source: {
    kind: 'build_identity',
    id: 'def456',
    url: 'https://playgarba.com/build-info.json'
  },
  details: {
    expectedBuildId: 'abc123',
    deployedBuildId: 'def456'
  }
}
```

The evaluator preserves evidence values. It never fills a missing metric with zero. A genuine supplied `value: 0` remains zero, while absent values stay absent.

## Helpers

`buildIdentityEvidence(...)` turns expected/deployed build IDs into:

- `healthy` when they match;
- `degraded` when both are present but different;
- `unknown` when one side is missing.

`checkRunEvidence(...)` maps completed CI pass/fail states while keeping pending, queued, cancelled, skipped and unknown states as `unknown`. A cancelled check is not a failed product and is not a passing check.

## Overall precedence

The evaluator keeps all subsystem states and then chooses one overall state deterministically:

1. explicit critical failure -> `failed`;
2. critical degradation or any non-critical explicit failure/degradation -> `degraded`;
3. otherwise any stale evidence -> `stale`;
4. otherwise any unknown evidence -> `unknown`;
5. otherwise -> `healthy`.

This precedence makes problems visible without collapsing the evidence. The later UI should still show every subsystem independently and should never hide a healthy production result because CI or telemetry is degraded.

## Later #844 integration

The protected Health adapter/UI lane still needs to connect real evidence sources, such as:

- production reachability;
- deployed `build-info.json` identity vs expected deployment;
- current repository/CI validation state;
- catalogue/build validation state;
- truthful playback/runtime failures where telemetry supports them;
- service-worker/PWA version/update evidence;
- telemetry ingestion/query health;
- rollup/data-through freshness.

Those adapters must attach source identity and timestamps. They should not give the pure model secrets, raw event payloads or founder credentials.

## Validation

Run:

```sh
node --test src/pga/health/tests/health.test.mjs
node scripts/lib/validate-pga-health.mjs
```

The dedicated `PGA Health validate` workflow runs the same focused contract. Repository-wide validation remains required before merge.
