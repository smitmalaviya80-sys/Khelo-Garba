#!/usr/bin/env node

import assert from 'node:assert/strict';
import { access, rename } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import {
  CONSTRAINED_PROFILE,
  readServiceWorkerMetadata,
  startFixtureServer,
} from './sw-install-contention-lib.mjs';

const FAILURE_PATH = '/assets/icons/mstile-310x310.png';
const PORT = 4175;

function parseArgs(argv) {
  const options = { root: null };
  for (const argument of argv) {
    const [key, ...parts] = argument.split('=');
    const value = parts.join('=');
    if (key === '--root' && value) options.root = path.resolve(value);
    else throw new Error(`Unknown or incomplete argument: ${argument}`);
  }
  if (!options.root) throw new Error('--root=<production-equivalent-fixture> is required');
  return options;
}

async function loadChromium() {
  try {
    const { chromium } = await import('@playwright/test');
    return chromium;
  } catch {
    throw new Error('Missing @playwright/test. Install repository-standard Playwright 1.55.0 before running this check.');
  }
}

async function waitForPlayer(page) {
  await page.waitForFunction(() => {
    const title = document.getElementById('songTitle');
    const play = document.getElementById('playButton');
    return Boolean(
      title?.textContent?.trim()
      && play
      && !play.disabled
      && play.getBoundingClientRect().width > 0
      && play.getBoundingClientRect().height > 0
    );
  }, null, { timeout: 30_000 });
}

async function waitForCatalogue(page) {
  await page.waitForFunction(() => window.GARBA_CATALOGUE_READY === true, null, { timeout: 60_000 });
}

async function collectPwaState(page) {
  return page.evaluate(async () => {
    let registrations = [];
    try { registrations = await navigator.serviceWorker?.getRegistrations?.() || []; }
    catch { registrations = []; }

    let cacheKeys = [];
    try { cacheKeys = await caches.keys(); }
    catch { cacheKeys = []; }

    return {
      controller: Boolean(navigator.serviceWorker?.controller),
      cacheKeys,
      registrations: registrations.map((registration) => ({
        scope: registration.scope,
        installing: registration.installing?.state ?? null,
        waiting: registration.waiting?.state ?? null,
        active: registration.active?.state ?? null,
      })),
    };
  });
}

async function main() {
  const { root } = parseArgs(process.argv.slice(2));
  const chromium = await loadChromium();
  const swMetadata = await readServiceWorkerMetadata(root);

  assert(swMetadata.cacheName, 'Expected the fixture service worker to expose a live CACHE_NAME');
  assert(swMetadata.coreShellPaths.has(FAILURE_PATH), `${FAILURE_PATH} must remain a CORE_SHELL entry for this regression`);

  const failureFile = path.join(root, FAILURE_PATH.slice(1));
  const hiddenFile = `${failureFile}.sw-install-failure-hidden`;
  await access(failureFile);
  await rename(failureFile, hiddenFile);

  let fixture = null;
  let browser = null;
  let context = null;
  try {
    fixture = await startFixtureServer(root, '127.0.0.1', PORT, CONSTRAINED_PROFILE.network);
    fixture.beginSample('failed-install');

    browser = await chromium.launch({ headless: true });
    context = await browser.newContext({
      ...CONSTRAINED_PROFILE.context,
      serviceWorkers: 'allow',
    });
    const page = await context.newPage();
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));

    await page.goto(fixture.origin, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await Promise.all([waitForPlayer(page), waitForCatalogue(page)]);

    const beforeFailureState = await page.evaluate(() => ({
      title: document.getElementById('songTitle')?.textContent?.trim() || '',
      playEnabled: !document.getElementById('playButton')?.disabled,
      catalogueReady: window.GARBA_CATALOGUE_READY === true,
    }));

    assert(beforeFailureState.title, 'Player title must render independently of service-worker installation');
    assert.equal(beforeFailureState.playEnabled, true, 'Primary Play control must remain enabled on the already-loaded page');
    assert.equal(beforeFailureState.catalogueReady, true, 'Full catalogue must become ready independently of service-worker installation');

    const becameIdle = await fixture.waitForIdle(30_000);
    assert.equal(becameIdle, true, 'Fixture requests did not settle after the injected install failure');

    // Give Chromium a bounded turn to reject the install event and transition the
    // failed worker away from install/wait/active state. This is not a performance
    // threshold: the explicit HTTP failure below is the failure authority.
    await page.waitForTimeout(750);

    const pwaState = await collectPwaState(page);
    const afterFailureState = await page.evaluate(() => ({
      title: document.getElementById('songTitle')?.textContent?.trim() || '',
      playEnabled: !document.getElementById('playButton')?.disabled,
      catalogueReady: window.GARBA_CATALOGUE_READY === true,
    }));

    const rawServer = fixture.endSample('failed-install');
    const injectedRequests = rawServer.requests.filter((request) => request.path === FAILURE_PATH);
    const injected404 = injectedRequests.find((request) => request.status === 404);

    assert(injected404, `Expected a real HTTP 404 for the injected CORE_SHELL path ${FAILURE_PATH}`);
    assert.equal(afterFailureState.catalogueReady, true, 'Catalogue readiness must survive the failed install');
    assert.equal(afterFailureState.playEnabled, true, 'Already-loaded player controls must remain usable after the failed install');
    assert(afterFailureState.title, 'Failed install must not blank the already-loaded player state');
    assert.equal(pageErrors.length, 0, `Page runtime errors are not part of the expected install failure: ${pageErrors.join(' | ')}`);

    const promotedLiveCache = pwaState.cacheKeys.includes(swMetadata.cacheName);
    const activeOrWaiting = pwaState.registrations.some((registration) => registration.active || registration.waiting);

    assert.equal(promotedLiveCache, false, `Failed install must not promote partial content into live cache ${swMetadata.cacheName}`);
    assert.equal(activeOrWaiting, false, 'Failed install must not leave an active or waiting service worker in a fresh context');
    assert.equal(pwaState.controller, false, 'Failed install must not acquire page control in a fresh context');

    const evidence = {
      schemaVersion: 1,
      outcome: 'failed-install-distinct-from-slow-install',
      failure: {
        path: FAILURE_PATH,
        status: injected404.status,
        requestCompleted: Number.isFinite(injected404.endEpochMs),
      },
      listenerPage: {
        beforeTitle: beforeFailureState.title,
        afterTitle: afterFailureState.title,
        playerTitlePresent: Boolean(afterFailureState.title),
        playEnabled: afterFailureState.playEnabled,
        catalogueReady: afterFailureState.catalogueReady,
        pageErrors,
      },
      serviceWorker: {
        controller: pwaState.controller,
        registrations: pwaState.registrations,
        cacheKeys: pwaState.cacheKeys,
        expectedLiveCache: swMetadata.cacheName,
        liveCachePromoted: promotedLiveCache,
      },
    };

    console.log(JSON.stringify(evidence, null, 2));
  } finally {
    await context?.close().catch(() => {});
    await browser?.close().catch(() => {});
    await fixture?.close().catch(() => {});
    await rename(hiddenFile, failureFile).catch(() => {});
  }
}

main().catch((error) => {
  console.error(error.stack || error.message || String(error));
  process.exitCode = 1;
});
