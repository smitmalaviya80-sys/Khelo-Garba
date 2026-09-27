#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const root = path.resolve(import.meta.dirname, '../..');
const read = (file) => readFile(path.join(root, file), 'utf8');
let failed = false;
const fail = (message) => {
  console.error(`✗ ${message}`);
  failed = true;
};

const [index, performanceCss, startupHarness, lifetimeHarness] = await Promise.all([
  read('index.html'),
  read('styles/50-discovery-and-performance.css'),
  read('scripts/performance/measure-startup.mjs'),
  read('scripts/performance/measure-player.mjs'),
]);

if (/<link\s+rel="preload"[^>]+href="assets\/backgrounds\/(?:traditional|dandiya|devotional|folk|sanedo|fusion)\.svg"/i.test(index)) {
  fail('Retired world SVGs must not be preloaded during first paint');
}

for (const marker of [
  'const PRODUCT_SHELL_TARGET_MS = 1_000;',
  "const BACKGROUND_LIBRARY_PREFIX = '/assets/backgrounds/library/';",
  "const FULL_CATALOGUE_PATH = '/data/songs.json';",
  'startupBackgroundLibraryRequestCount > 1',
  'startupUniqueBackgroundLibraryAssetCount > 1',
  'startupRetiredWorldSvgRequestCount > 0',
  'startupFullCatalogueRequestCount > 0',
  "checkpoint: 'first usable player shell with non-empty title and laid-out Play control'",
  'requestStartShapeCapturedUntilShellCheckpoint: true',
  'completedTransferBytesCapturedAtShellCheckpoint: true',
  "enforcement: 'measurement target only; not a CI failure because runner/network timing is environment-sensitive'",
]) {
  if (!startupHarness.includes(marker)) fail(`Startup measurement contract missing marker: ${marker}`);
}

for (const marker of [
  'const shellReadyMs = await page.evaluate(() => performance.now());',
  'const catalogueReadyMs = await waitForFullCatalogue(page);',
  'const browser = await collectBrowserMetrics(page, options.originValue);',
]) {
  if (!lifetimeHarness.includes(marker)) fail(`Full-lifetime performance harness missing marker: ${marker}`);
}

const shellPosition = lifetimeHarness.indexOf('const shellReadyMs = await page.evaluate(() => performance.now());');
const cataloguePosition = lifetimeHarness.indexOf('const catalogueReadyMs = await waitForFullCatalogue(page);');
const browserPosition = lifetimeHarness.indexOf('const browser = await collectBrowserMetrics(page, options.originValue);');
if (!(shellPosition >= 0 && cataloguePosition > shellPosition && browserPosition > cataloguePosition)) {
  fail('Full-lifetime harness must keep shell readiness, full catalogue readiness and lifetime resource collection as distinct ordered boundaries');
}

const expectedWorlds = ['traditional', 'dandiya', 'devotional', 'folk', 'sanedo', 'fusion'];
for (const genre of expectedWorlds) {
  const visibleOnly = `.world-layer.is-visible[style*="assets/backgrounds/${genre}.svg"]`;
  if (!performanceCss.includes(visibleOnly)) fail(`Approved high-resolution ${genre} artwork must be restricted to the visible world layer`);
  if (performanceCss.includes(`.world-layer[style*="assets/backgrounds/${genre}.svg"]`)) {
    fail(`Hidden ${genre} world layers must not qualify for high-resolution artwork`);
  }
}

if (!performanceCss.includes('.app[data-save-data="true"] .world-layer.is-visible[style*="assets/backgrounds/"]')) {
  fail('Save-Data must keep an explicit visible-world artwork suppression path');
}

if (failed) process.exit(1);
console.log('✓ first-usable-player startup is measured separately from catalogue hydration and page-lifetime warming');
console.log('✓ startup structural budget allows at most one approved high-resolution background');
console.log('✓ retired world SVG and full songs catalogue requests are forbidden before the usable shell checkpoint');
console.log('✓ shell timing remains a measured target instead of a runner-sensitive hard failure');
