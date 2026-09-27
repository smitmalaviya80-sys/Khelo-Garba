import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../../nonstop-browser.js', import.meta.url), 'utf8');

const forbiddenIdleWarmSignatures = [
  'function warmNonstop',
  'warmNonstop();',
  'const warm = () => loadAllSets().catch(() => null);',
  'requestIdleCallback(warm',
  'setTimeout(warm, 1800)',
];
for (const signature of forbiddenIdleWarmSignatures) {
  assert.equal(source.includes(signature), false, `idle Nonstop warm signature must stay absent: ${signature}`);
}

assert.match(source, /function init\(\)[\s\S]*?restoreFromUrl\(\);/, 'ordinary init must preserve explicit Nonstop deep-link restoration');
assert.match(source, /async function openBrowser\(\)[\s\S]*?await Promise\.all\(\[loadAllSets\(\),\s*loadSearchCore\(\)\]\)/, 'opening the chooser must still deliberately load the catalogue');
assert.match(source, /function restoreFromUrl\(\)[\s\S]*?searchParams\.get\(['"]nonstop['"]\)[\s\S]*?startNonstop\(id,\s*\{\s*quiet:\s*true\s*\}\)/, 'deep-link restoration must still resolve and start the requested set');
assert.match(source, /list:\s*async\s*\(\)\s*=>\s*loadAllSets\(\)/, 'GARBA_NONSTOP.list() must remain an explicit catalogue-loading API');
assert.match(source, /if\s*\(state\.allSets\)\s*return\s+state\.allSets;/, 'full catalogue loading must remain cached within the document');
assert.match(source, /Promise\.all\(index\.chunks\.map\(loadChunk\)\)/, 'explicit catalogue loading must still load indexed discovery chunks');
assert.match(source, /window\.addEventListener\(['"]online['"][\s\S]*?state\.failedChunks\.size[\s\S]*?loadAllSets\(\{\s*refresh:\s*true\s*\}\)/, 'online recovery for previously failed chunks must remain intact');

console.log('✓ Nonstop discovery is intent-driven: idle startup warming removed; chooser, deep-link, list, cache and online-recovery paths preserved.');
