import assert from 'node:assert/strict';
import {
  aggregateBreakdowns,
  formatDuration,
  formatMetric,
  metricValue,
  normaliseAudience,
  normaliseListening,
  ratio,
} from '../../src/pga/app/analytics.js';

const metric = (value, precision = 'exact', sampled = false) => ({ value, precision, sampled });

assert.equal(metricValue(metric(0)), 0, 'real numeric zero must remain valid');
assert.equal(metricValue(metric(12.5)), 12.5, 'finite numeric metrics must remain valid');

for (const value of [null, undefined, '', '0', '12', true, false, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
  assert.equal(metricValue({ value }), null, `invalid metric value ${String(value)} must stay unavailable`);
}

assert.equal(formatMetric(metric(0)), '0');
assert.equal(formatMetric({ value: null }), '—');
assert.equal(formatMetric({ value: '0' }), '—');
assert.equal(formatDuration({ value: '' }), '—');
assert.equal(ratio(metric(7), metric(10)).value, 0.7);
assert.equal(ratio({ value: '7' }, metric(10)), null);
assert.equal(ratio(metric(7), { value: '10' }), null);
assert.equal(ratio(metric(7), metric(0)), null);

const breakdowns = aggregateBreakdowns([
  { client: 'mobile', sessions: metric(0) },
  { client: 'desktop', sessions: { value: null } },
], (row) => row.client);
assert.deepEqual(breakdowns.map(({ label, metric: itemMetric }) => [label, itemMetric.value]), [['mobile', 0]], 'invalid breakdown rows must not become zero buckets');

const poisonedBreakdown = aggregateBreakdowns([
  { client: 'mobile', sessions: metric(4) },
  { client: 'mobile', sessions: { value: '3' } },
], (row) => row.client);
assert.deepEqual(poisonedBreakdown, [], 'a malformed contribution must not leave a knowingly incomplete aggregate visible');

const audience = normaliseAudience({
  status: 'complete',
  generatedAt: '2026-09-10T07:00:00.000Z',
  dataThrough: '2026-09-10T06:59:00.000Z',
  data: {
    range: '30d',
    summary: { uniqueBrowsers: { value: null }, sessions: metric(0) },
    breakdowns: [
      { client: 'mobile|iOS|Safari', displayMode: 'standalone', sessions: metric(0) },
      { client: 'desktop|Windows|Chrome', displayMode: 'browser', sessions: { value: '' } },
    ],
  },
});
assert.equal(metricValue(audience.summary.uniqueBrowsers), null);
assert.equal(metricValue(audience.summary.sessions), 0);
assert.equal(audience.distributions.device.length, 1);
assert.equal(audience.distributions.device[0].label, 'mobile');
assert.equal(audience.distributions.device[0].metric.value, 0);

const listening = normaliseListening({
  status: 'complete',
  generatedAt: '2026-09-10T07:00:00.000Z',
  dataThrough: '2026-09-10T06:59:00.000Z',
  data: {
    range: '30d',
    listeningMs: { value: '60000' },
    search: {
      searches: { value: '4' },
      selectedSearches: metric(2),
      searchesWithConfirmedPlay: metric(1),
      zeroResultSearches: metric(0),
    },
    rows: [
      { eventName: 'play_intent', surface: 'player', events: metric(4) },
      { eventName: 'playback_started', surface: 'player', contentType: 'song', contentId: 'valid-song', canonicalId: 'valid-song', events: metric(2) },
      { eventName: 'playback_started', surface: 'player', contentType: 'song', contentId: 'broken-song', canonicalId: 'broken-song', events: { value: null } },
    ],
  },
});
assert.equal(metricValue(listening.metrics.listeningMs), null, 'string duration must remain unavailable');
assert.equal(listening.playSuccess, null, 'malformed playback-start evidence must poison the aggregate conversion rate instead of undercounting');
assert.equal(listening.search.selectionRate, null, 'string-coerced search denominator must stay unavailable');
assert.equal(listening.search.zeroResultRate, null, 'invalid search denominator must not produce a zero-rate claim');
assert.equal(listening.topSongs.some((row) => row.contentId === 'broken-song'), false, 'malformed content rows must not appear as zero-play content');

console.log('✓ PGA analytics rejects coerced or malformed metrics without losing real zero');
