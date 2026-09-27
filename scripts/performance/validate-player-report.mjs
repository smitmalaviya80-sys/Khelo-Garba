#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

function percentile(values, fraction) {
  const finite = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!finite.length) return null;
  const index = Math.min(finite.length - 1, Math.max(0, Math.ceil(finite.length * fraction) - 1));
  return finite[index];
}

function round(value, digits = 1) {
  if (!Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function requireFinite(value, label, failures) {
  if (!Number.isFinite(value)) failures.push(`${label} must be a finite number`);
}

function validatePhaseSamples(profileName, phaseName, samples, searchBudgetMs, failures, rows) {
  if (!Array.isArray(samples) || !samples.length) {
    failures.push(`${profileName}/${phaseName} has no raw measurement samples`);
    return;
  }

  const searchValues = [];
  for (const [index, sample] of samples.entries()) {
    const prefix = `${profileName}/${phaseName} sample ${index + 1}`;
    if (!sample || typeof sample !== 'object') {
      failures.push(`${prefix} is not an object`);
      continue;
    }

    requireFinite(sample.searchPresentationMs, `${prefix} searchPresentationMs`, failures);
    if (Number.isFinite(sample.searchPresentationMs)) searchValues.push(sample.searchPresentationMs);

    if (sample.searchMatchedQuery !== true) {
      failures.push(`${prefix} did not confirm the expected Search query`);
    }
    if (!Number.isFinite(sample.searchResultCount) || sample.searchResultCount < 1) {
      failures.push(`${prefix} did not render a positive Search result count`);
    }

    const runtimeFailures = Array.isArray(sample.failures) ? sample.failures : null;
    const consoleErrors = Array.isArray(sample.consoleErrors) ? sample.consoleErrors : null;
    if (!runtimeFailures) failures.push(`${prefix} is missing failures[] evidence`);
    else if (runtimeFailures.length) failures.push(`${prefix} recorded runtime failures: ${runtimeFailures.join(' | ')}`);
    if (!consoleErrors) failures.push(`${prefix} is missing consoleErrors[] evidence`);
    else if (consoleErrors.length) failures.push(`${prefix} recorded console errors: ${consoleErrors.join(' | ')}`);
  }

  if (searchValues.length !== samples.length) return;
  const p75 = percentile(searchValues, 0.75);
  rows.push({ profile: profileName, phase: phaseName, samples: searchValues.length, p75: round(p75), budget: searchBudgetMs });
  if (p75 > searchBudgetMs) {
    failures.push(`${profileName}/${phaseName} loaded-index Search p75 ${round(p75)} ms exceeds the ${round(searchBudgetMs)} ms budget`);
  }
}

export function validatePlayerPerformanceReport(report) {
  const failures = [];
  const rows = [];

  if (!report || typeof report !== 'object' || Array.isArray(report)) {
    return { ok: false, failures: ['Report root must be an object'], rows };
  }

  if (!Number.isInteger(report.schemaVersion) || report.schemaVersion < 3) {
    failures.push('schemaVersion must be an integer >= 3');
  }
  if (!Number.isInteger(report.runsPerProfile) || report.runsPerProfile < 1) {
    failures.push('runsPerProfile must be a positive integer');
  }

  const searchBudgetMs = report.provisionalBudgets?.loadedIndexSearchPresentationMs;
  if (!Number.isFinite(searchBudgetMs) || searchBudgetMs <= 0) {
    failures.push('provisionalBudgets.loadedIndexSearchPresentationMs must be a positive finite number');
  }

  if (!Array.isArray(report.profiles) || !report.profiles.length) {
    failures.push('profiles must contain at least one measured profile');
  } else if (Number.isFinite(searchBudgetMs) && searchBudgetMs > 0) {
    const seenProfiles = new Set();
    for (const profile of report.profiles) {
      const profileName = String(profile?.profile || '').trim();
      if (!profileName) {
        failures.push('Every profile must have a non-empty profile name');
        continue;
      }
      if (seenProfiles.has(profileName)) failures.push(`Duplicate profile evidence: ${profileName}`);
      seenProfiles.add(profileName);

      validatePhaseSamples(profileName, 'cold', profile?.cold, searchBudgetMs, failures, rows);
      validatePhaseSamples(profileName, 'warm', profile?.warm, searchBudgetMs, failures, rows);

      if (Array.isArray(profile?.cold) && profile.cold.length !== report.runsPerProfile) {
        failures.push(`${profileName}/cold sample count ${profile.cold.length} does not match runsPerProfile ${report.runsPerProfile}`);
      }
      if (Array.isArray(profile?.warm) && profile.warm.length !== report.runsPerProfile) {
        failures.push(`${profileName}/warm sample count ${profile.warm.length} does not match runsPerProfile ${report.runsPerProfile}`);
      }
    }
  }

  return { ok: failures.length === 0, failures, rows };
}

export function formatValidationResult(result) {
  const lines = ['Player performance report validation'];
  for (const row of result.rows) {
    lines.push(`- ${row.profile}/${row.phase}: Search p75 ${row.p75} ms (${row.samples} samples, budget <= ${round(row.budget)} ms)`);
  }
  if (result.ok) lines.push('PASS: measured Search evidence is complete and within the declared budget.');
  else {
    lines.push(`FAIL: ${result.failures.length} validation problem${result.failures.length === 1 ? '' : 's'}.`);
    for (const failure of result.failures) lines.push(`  - ${failure}`);
  }
  return lines.join('\n');
}

async function main(argv = process.argv.slice(2)) {
  if (argv.length !== 1 || argv[0] === '--help') {
    console.log('Usage: node scripts/performance/validate-player-report.mjs <performance-report.json>');
    return argv[0] === '--help' ? 0 : 2;
  }

  let report;
  try {
    report = JSON.parse(await readFile(argv[0], 'utf8'));
  } catch (error) {
    console.error(`Could not read performance report: ${error.message}`);
    return 2;
  }

  const result = validatePlayerPerformanceReport(report);
  const output = formatValidationResult(result);
  (result.ok ? console.log : console.error)(output);
  return result.ok ? 0 : 1;
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  process.exitCode = await main();
}
