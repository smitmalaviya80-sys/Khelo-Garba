import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { chromium } from 'playwright';

const baseUrl = process.env.PLAYGARBA_BASE_URL || 'http://127.0.0.1:4175/';
const revision = process.env.GITHUB_SHA || process.env.GITHUB_HEAD_SHA || 'local';
const artifactDir = path.resolve(process.env.PLAYGARBA_A11Y_ARTIFACT_DIR || 'test-results/player-overlay-a11y');

await mkdir(artifactDir, { recursive: true });

const results = [];
const browser = await chromium.launch();

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function activeFocus(page) {
  return page.evaluate(() => {
    const active = document.activeElement;
    return {
      id: active?.id || '',
      tag: active?.tagName || '',
      insideHiddenSheet: Boolean(active?.closest?.('#songSheet[aria-hidden="true"]')),
    };
  });
}

async function waitForFocus(page, expectedId, timeout = 3500) {
  await page.waitForFunction(
    (id) => document.activeElement?.id === id,
    expectedId,
    { timeout },
  );
}

async function waitForSheet(page, open, title) {
  const hidden = open ? 'false' : 'true';
  await page.waitForFunction(
    ({ hidden, title }) => {
      const sheet = document.getElementById('songSheet');
      const heading = document.getElementById('sheetTitle');
      if (!sheet || sheet.getAttribute('aria-hidden') !== hidden) return false;
      return !title || heading?.textContent?.trim() === title;
    },
    { hidden, title },
    { timeout: 4000 },
  );
}

async function pressTabUntil(page, expectedId, { reverse = false, max = 40 } = {}) {
  for (let index = 0; index < max; index += 1) {
    if ((await activeFocus(page)).id === expectedId) return true;
    await page.keyboard.press(reverse ? 'Shift+Tab' : 'Tab');
  }
  return (await activeFocus(page)).id === expectedId;
}

async function newReadyPage(viewport = { width: 1180, height: 820 }) {
  const context = await browser.newContext({ viewport, serviceWorkers: 'block' });
  const page = await context.newPage();
  const diagnostics = { consoleErrors: [], pageErrors: [] };

  page.on('console', (message) => {
    if (message.type() === 'error') diagnostics.consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => diagnostics.pageErrors.push(String(error?.stack || error)));

  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#searchButton', { state: 'visible' });
  await page.waitForFunction(() => {
    const app = document.getElementById('app');
    const search = document.getElementById('searchButton');
    const queue = document.getElementById('queueButton');
    const favourites = document.getElementById('favouritesButton');
    return Boolean(app && search && queue && favourites && !search.disabled && !queue.disabled && !favourites.disabled);
  }, null, { timeout: 8000 });

  return { context, page, diagnostics };
}

async function recordFailure(page, name, error, diagnostics) {
  const safeName = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const screenshotPath = path.join(artifactDir, `${safeName}.png`);
  try {
    await page.screenshot({ path: screenshotPath, fullPage: true });
  } catch {
    // The JSON result remains authoritative if screenshot capture itself fails.
  }
  return {
    name,
    status: 'failed',
    error: String(error?.stack || error),
    focus: await activeFocus(page).catch(() => ({ id: '', tag: '', insideHiddenSheet: false })),
    diagnostics,
    screenshot: screenshotPath,
  };
}

async function runScenario(name, fn) {
  const { context, page, diagnostics } = await newReadyPage();
  try {
    await fn(page);
    const focus = await activeFocus(page);
    assert(!focus.insideHiddenSheet, `${name}: focus remained inside an aria-hidden sheet`);
    results.push({ name, status: 'passed', focus, diagnostics });
  } catch (error) {
    results.push(await recordFailure(page, name, error, diagnostics));
  } finally {
    await context.close();
  }
}

await runScenario('Search keyboard entry, Space isolation, Escape dismissal and focus return', async (page) => {
  await page.evaluate(() => {
    window.__overlayA11yPlayClicks = 0;
    document.getElementById('playButton')?.addEventListener('click', () => {
      window.__overlayA11yPlayClicks += 1;
    }, { capture: true });
  });

  const search = page.locator('#searchButton');
  await search.focus();
  assert((await activeFocus(page)).id === 'searchButton', 'Search trigger could not receive keyboard focus');
  await page.keyboard.press('Enter');

  await waitForSheet(page, true, 'Search');
  await waitForFocus(page, 'searchInput');

  const beforePlayClicks = await page.evaluate(() => window.__overlayA11yPlayClicks);
  await page.keyboard.type('garba night');
  const query = await page.locator('#searchInput').inputValue();
  const afterPlayClicks = await page.evaluate(() => window.__overlayA11yPlayClicks);

  assert(query === 'garba night', `Search input did not retain Space as text; got ${JSON.stringify(query)}`);
  assert(afterPlayClicks === beforePlayClicks, 'Typing Space in Search activated the global Play control');

  await page.keyboard.press('Escape');
  await waitForSheet(page, false);
  await waitForFocus(page, 'searchButton');
  const focus = await activeFocus(page);
  assert(!focus.insideHiddenSheet, 'Search dismissal left focus inside the hidden song sheet');
});

async function verifySheetTriggerRoundTrip({ triggerId, title }) {
  await runScenario(`${title} keyboard open, close reachability and focus return`, async (page) => {
    const trigger = page.locator(`#${triggerId}`);
    await trigger.focus();
    assert((await activeFocus(page)).id === triggerId, `${title}: trigger could not receive focus`);
    await page.keyboard.press('Enter');
    await waitForSheet(page, true, title);

    const close = page.locator('#sheetClose');
    assert(await close.isVisible(), `${title}: close control is not visible`);
    const reachedClose = await pressTabUntil(page, 'sheetClose');
    assert(reachedClose, `${title}: close control was not reachable within 40 forward Tab presses`);

    await page.keyboard.press('Enter');
    await waitForSheet(page, false);
    await waitForFocus(page, triggerId);
    const focus = await activeFocus(page);
    assert(!focus.insideHiddenSheet, `${title}: dismissal left focus inside the hidden song sheet`);
  });
}

await verifySheetTriggerRoundTrip({ triggerId: 'queueButton', title: 'Up next' });
await verifySheetTriggerRoundTrip({ triggerId: 'favouritesButton', title: 'My Garba' });

await browser.close();

const summary = {
  schemaVersion: 1,
  revision,
  baseUrl,
  playwright: process.env.npm_package_devDependencies_playwright || process.env.PLAYWRIGHT_VERSION || 'workflow-pinned',
  generatedAt: new Date().toISOString(),
  passed: results.filter((result) => result.status === 'passed').length,
  failed: results.filter((result) => result.status === 'failed').length,
  results,
};

await writeFile(path.join(artifactDir, 'results.json'), `${JSON.stringify(summary, null, 2)}\n`);
console.log(JSON.stringify(summary, null, 2));

if (summary.failed > 0) process.exitCode = 1;
