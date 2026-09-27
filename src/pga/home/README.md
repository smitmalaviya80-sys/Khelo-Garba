# PGA Home truth model

This directory contains the pure presentation-state contract for PlayGarba Admin Home and Live KPIs. It belongs to child issue #935 under #842.

The model deliberately does not fetch PGA APIs, render DOM, read browser storage, inspect environment variables or own authentication. Later #842 integration can feed protected aggregate evidence into these helpers after the shared PGA app files are free.

## Why this exists

Home is the founder's highest-frequency view. A failed query, an old result and a genuine zero are materially different facts. The UI must never make those states look identical just because `0` is visually convenient.

`model.js` therefore keeps data state, numeric value, freshness, precision and evidence separate.

## Stable states

The model exports these states:

- `loading` — the source has not resolved yet;
- `available` — current usable evidence is available;
- `partial` — a usable subset is available while some evidence is missing;
- `stale` — a usable last value exists but exceeded an explicit freshness budget;
- `unavailable` — the source cannot currently supply the metric;
- `offline` — the caller knows the product is offline;
- `auth-expired` — protected evidence cannot be fetched because access expired;
- `error` — the evidence or metric is invalid/failed.

Only `available`, `partial` and `stale` may expose a numeric KPI value. Other states expose `value: null`, `exactValue: null` and the presentation placeholder `—`.

A real supplied `0` remains `0` and sets `zeroData: true`. It is never confused with an unavailable source.

## Explicit freshness only

`evaluateKpi()` can turn `available` or `partial` evidence into `stale` only when the caller supplies a non-negative `freshnessBudgetMs` plus a timestamp (`freshnessAt`, `dataThroughAt` or `checkedAt`).

There is no universal timeout inside this layer. Live presence, daily aggregates, rollups and health evidence have different freshness contracts, so the adapter that owns each source must provide the correct budget.

A stale metric retains its last valid numeric value and carries the stale status/reason. That lets the UI say, for example, that the last known Live value was 4 while making its age unmistakable.

## Evidence preservation

For each KPI the model preserves:

- exact numeric value when usable;
- compact display value;
- checked-at and data-through timestamps;
- freshness timestamp, budget and calculated age;
- precision text and sampled flag;
- bounded source kind/id/URL;
- optional action and reason.

Invalid negative, `NaN` or infinite values fail closed to `error`; they are not clamped or coerced to zero.

## Period comparisons

`compareKpis(current, prior)` only calculates a comparison when both periods have usable numeric values.

Rules:

- prior > 0: `(current - prior) / prior * 100`;
- prior = 0 and current > 0: `New activity`, with no percentage;
- prior = 0 and current = 0: flat, 0%;
- missing/unusable current or prior evidence: comparison unavailable.

This prevents `Infinity%`, `NaN%` and misleading percentage claims at a zero baseline.

The caller remains responsible for supplying genuinely comparable windows, as required by #842. This pure layer does not guess calendar boundaries.

## Compact display

`formatCompactNumber()` provides deterministic `K`, `M` and `B` display text while every evaluated KPI still retains `exactValue`. Compact text is presentation only; it never replaces the underlying number used for calculations or accessible detail.

## Text-first trend summaries

`summarizeTrend()` accepts numeric points or objects plus a `valueKey`. It returns:

- first and last values;
- minimum and maximum;
- point count;
- `up`, `down`, `flat` or `unknown` direction;
- a complete text summary.

At least two valid non-negative points are required before a direction is stated. The summary exists so later sparklines never become the only way to understand the trend and never rely on colour alone.

## Snapshot helper

`buildHomeSnapshot()` evaluates a named metric map while preserving an overall source state. For a `partial` source, individual metrics must declare their own status; missing metrics remain unavailable rather than inheriting a fabricated usable value.

The result uses schema identifier `pga-home/v1` and reports how many metrics have usable numeric values versus missing values.

## Integration boundary

This child does not modify:

- `src/pga/app/**`;
- `src/pga/backend/**`;
- public PlayGarba runtime or telemetry;
- authentication or Cloudflare configuration;
- browser-smoke or deployment files.

Parent #842 owns the eventual mobile/desktop Home and Live presentation. Its integration should use protected PGA responses as evidence, apply the correct source-specific freshness budget, and keep stale/partial/error badges visible alongside any retained last-known value.

## Validation

Run:

```sh
node --test src/pga/home/tests/home.test.mjs
node scripts/lib/validate-pga-home.mjs
```

The dedicated `PGA Home validate` workflow runs both under Node 22. Repository-wide `Validate GARBA` remains the broader merge gate.
