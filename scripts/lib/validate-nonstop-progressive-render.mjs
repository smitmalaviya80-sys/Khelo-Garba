import fs from 'node:fs';

const source = fs.readFileSync(new URL('../../nonstop-browser.js', import.meta.url), 'utf8');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const schedulerMatch = source.match(/function scheduleProgressiveRender\(\) \{[\s\S]*?\n  \}\n\n  function getProgressiveSets/);
assert(schedulerMatch, 'Could not locate scheduleProgressiveRender');
const scheduler = schedulerMatch[0];

assert(
  scheduler.includes("if (!list || list.querySelector('.nonstop-set')) return;"),
  'Passive progressive renders must stop once a Nonstop row is visible',
);
assert(
  scheduler.includes('requestAnimationFrame(() =>'),
  'The first useful progressive render must remain frame-bounded',
);
assert(
  scheduler.includes("state.browserOpen && !state.allSets && !list.querySelector('.nonstop-set')"),
  'The scheduled callback must re-check browser, completion and visible-row state',
);
assert(
  !scheduler.includes("if (!list.querySelector('.nonstop-set')) {\n      renderBrowser();"),
  'Chunk arrival must not synchronously rebuild the chooser',
);

const loadChunkMatch = source.match(/async function loadChunk\(name\) \{[\s\S]*?\n  \}\n\n  async function loadAllSets/);
assert(loadChunkMatch?.[0].includes('scheduleProgressiveRender();'), 'Chunk loading must still request the initial progressive render');

const openBrowserIndex = source.indexOf('async function openBrowser');
assert(openBrowserIndex >= 0, 'Could not locate openBrowser');
const finalHydrationIndex = source.indexOf('await Promise.all([loadAllSets(), loadSearchCore()]);', openBrowserIndex);
assert(finalHydrationIndex >= 0, 'openBrowser must still wait for complete catalogue hydration');
const finalRenderIndex = source.indexOf('renderBrowser();', finalHydrationIndex);
assert(
  finalRenderIndex > finalHydrationIndex && finalRenderIndex - finalHydrationIndex < 500,
  'The complete catalogue must still receive its final canonical render',
);

assert(
  source.includes("$('nonstopBrowserSearch')?.addEventListener('input'") &&
    source.includes("state.browserQuery = String(event.target?.value || '');\n      renderBrowser();"),
  'User-driven search must continue rendering while hydration is in flight',
);

console.log('Nonstop progressive render contract validated.');
