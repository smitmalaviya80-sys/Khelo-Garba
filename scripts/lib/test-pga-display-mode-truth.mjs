import assert from 'node:assert/strict';
import { normaliseAudience } from '../../src/pga/app/analytics.js';

const metric = (value, precision = 'exact', sampled = false) => ({ value, precision, sampled });
const envelope = {
  status: 'complete',
  generatedAt: '2026-09-10T07:00:00.000Z',
  dataThrough: '2026-09-10T06:59:00.000Z',
  data: {
    range: '30d',
    summary: {
      uniqueBrowsers: metric(21),
      sessions: metric(28),
      newBrowserIds: metric(9),
      returningBrowserIds: metric(12),
    },
    breakdowns: [
      { displayMode: 'browser', sessions: metric(10) },
      { displayMode: 'standalone', sessions: metric(6) },
      { displayMode: 'minimal-ui', sessions: metric(4) },
      { displayMode: 'unknown', sessions: metric(3) },
      { displayMode: '', sessions: metric(2) },
      { displayMode: null, sessions: metric(1) },
      { displayMode: 'future-mode', sessions: metric(2) },
    ],
  },
};

const model = normaliseAudience(envelope);
const byLabel = new Map(model.distributions.displayMode.map((row) => [row.label, row.metric]));

assert.equal(byLabel.get('Browser')?.value, 10, 'only exact browser evidence may enter Browser');
assert.equal(byLabel.get('PWA')?.value, 10, 'known installed display modes must remain PWA');
assert.equal(byLabel.get('Unknown')?.value, 8, 'unknown, missing and unrecognised evidence must remain Unknown');
assert.equal([...byLabel.values()].reduce((sum, row) => sum + row.value, 0), 28, 'classification must preserve valid session totals');

const mixedCase = normaliseAudience({
  ...envelope,
  data: {
    ...envelope.data,
    breakdowns: [
      { displayMode: ' Browser ', sessions: metric(2) },
      { displayMode: 'STANDALONE', sessions: metric(3) },
      { displayMode: 'unknown', sessions: { value: null } },
    ],
  },
});
const mixedByLabel = new Map(mixedCase.distributions.displayMode.map((row) => [row.label, row.metric]));
assert.equal(mixedByLabel.get('Browser')?.value, 2);
assert.equal(mixedByLabel.get('PWA')?.value, 3);
assert.equal(mixedByLabel.has('Unknown'), false, 'malformed metric evidence must still poison its aggregate bucket');

console.log('✓ PGA display-mode analytics keeps unproven mode evidence out of Browser');
