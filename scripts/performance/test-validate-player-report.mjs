#!/usr/bin/env node

import assert from 'node:assert/strict';
import { validatePlayerPerformanceReport } from './validate-player-report.mjs';

function sample(searchPresentationMs, overrides = {}) {
  return {
    searchPresentationMs,
    searchResultCount: 4,
    searchMatchedQuery: true,
    failures: [],
    consoleErrors: [],
    ...overrides,
  };
}

function report({ cold = [90, 100, 110, 120], warm = [80, 90, 100, 110], budget = 150, overrides = {} } = {}) {
  return {
    schemaVersion: 3,
    runsPerProfile: cold.length,
    provisionalBudgets: {
      loadedIndexSearchPresentationMs: budget,
    },
    profiles: [{
      profile: 'mobile-low-end',
      cold: cold.map((value) => sample(value)),
      warm: warm.map((value) => sample(value)),
    }],
    ...overrides,
  };
}

{
  const result = validatePlayerPerformanceReport(report());
  assert.equal(result.ok, true, result.failures.join('\n'));
  assert.deepEqual(result.rows.map(({ phase, p75 }) => [phase, p75]), [['cold', 110], ['warm', 100]]);
}

{
  const result = validatePlayerPerformanceReport(report({ cold: [120, 140, 151, 175] }));
  assert.equal(result.ok, false);
  assert.ok(result.failures.some((message) => message.includes('Search p75 151 ms exceeds the 150 ms budget')));
}

{
  const broken = report();
  delete broken.profiles[0].warm[1].searchPresentationMs;
  const result = validatePlayerPerformanceReport(broken);
  assert.equal(result.ok, false);
  assert.ok(result.failures.some((message) => message.includes('searchPresentationMs must be a finite number')));
}

{
  const broken = report();
  broken.profiles[0].cold[0].failures = ['requestfailed: GET /data/songs.json'];
  broken.profiles[0].warm[0].consoleErrors = ['Uncaught Error'];
  const result = validatePlayerPerformanceReport(broken);
  assert.equal(result.ok, false);
  assert.ok(result.failures.some((message) => message.includes('recorded runtime failures')));
  assert.ok(result.failures.some((message) => message.includes('recorded console errors')));
}

{
  const broken = report({ overrides: { runsPerProfile: 7 } });
  const result = validatePlayerPerformanceReport(broken);
  assert.equal(result.ok, false);
  assert.ok(result.failures.some((message) => message.includes('does not match runsPerProfile 7')));
}

{
  const broken = report({ budget: null });
  const result = validatePlayerPerformanceReport(broken);
  assert.equal(result.ok, false);
  assert.ok(result.failures.some((message) => message.includes('loadedIndexSearchPresentationMs')));
}

console.log('Player performance report budget validator tests passed.');
