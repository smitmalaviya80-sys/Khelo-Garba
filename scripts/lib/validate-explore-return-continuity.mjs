import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const root = path.resolve(import.meta.dirname, '../..');
const runtimePath = path.join(root, 'src/catalogue/listening-library.js');
const bridgePath = path.join(root, 'src/catalogue/explore-continuity-bridge.js');
const exploreHtmlPath = path.join(root, 'src/catalogue/index.html');
const [runtime, bridge, exploreHtml] = await Promise.all([
  readFile(runtimePath, 'utf8'),
  readFile(bridgePath, 'utf8'),
  readFile(exploreHtmlPath, 'utf8'),
]);

execFileSync(process.execPath, ['--check', bridgePath], { stdio: 'inherit' });

const bridgeLoadOrder = [
  '<script type="module" src="catalogue.js"></script>',
  '<script type="module" src="explore-continuity-bridge.js"></script>',
  '<script type="module" src="listening-library.js"></script>',
];
const bridgeIndexes = bridgeLoadOrder.map((needle) => exploreHtml.indexOf(needle));

const checks = [
  [runtime.includes("const EXPLORE_RETURN_STATE_KEY = 'playgarbaExploreReturn';"), 'Explore return context must use history-entry state'],
  [runtime.includes('history.replaceState({ ...currentState, [EXPLORE_RETURN_STATE_KEY]: context }'), 'Listen navigation must attach return context to the current history entry'],
  [runtime.includes("const songRows = document.querySelectorAll('#catalogueSongList .song-row').length;"), 'return context must remember progressive song-list depth'],
  [runtime.includes('linkTop: link.getBoundingClientRect().top'), 'return context must remember the selected link viewport offset'],
  [runtime.includes('restoreFocus: event.detail === 0 || document.activeElement === link'), 'keyboard focus intent must be preserved'],
  [runtime.includes("document.querySelector('#catalogueSongList .song-more')"), 'return restoration must be able to rebuild progressively loaded rows'],
  [runtime.includes('more.click();'), 'return restoration must replay progressive loading before alignment'],
  [runtime.includes("a.play-link[href], a.personal-listening-card[href]"), 'both catalogue Listen links and Your listening cards must participate in continuity'],
  [runtime.includes("window.scrollTo({ top: Math.max(0, Number(context.scrollY) || 0), left: 0, behavior: 'auto' });"), 'return restoration must restore the saved scroll position without animation'],
  [runtime.includes('if (event.persisted) queueListeningRender();') && runtime.includes('else restoreExploreReturnState();'), 'BFCache returns must be left to the browser while rebuilt returns restore manually'],
  [!runtime.includes("localStorage.setItem(EXPLORE_RETURN_STATE_KEY"), 'Explore return context must not become a persistent user preference'],
  [!runtime.includes("sessionStorage.setItem(EXPLORE_RETURN_STATE_KEY"), 'Explore return context must remain scoped to the exact browser history entry'],
  [bridgeIndexes.every((index) => index >= 0) && bridgeIndexes[0] < bridgeIndexes[1] && bridgeIndexes[1] < bridgeIndexes[2], 'embedded Explore bridge must load after catalogue data setup and before ordinary listening navigation handlers'],
  [bridge.includes("const BRIDGE_TYPE = 'playgarba:explore-continuity';") && bridge.includes('const BRIDGE_VERSION = 1;'), 'embedded Explore bridge must use one explicit versioned message contract'],
  [bridge.includes("const PARENT_CONTRACT_KEY = '__PLAYGARBA_EXPLORE_CONTINUITY_PARENT__';") && bridge.includes('contract?.version === BRIDGE_VERSION'), 'embedded Explore must require an explicit version-matched parent capability before intercepting navigation'],
  [bridge.includes('window.parent === window') && bridge.includes('window.parent.location.origin !== window.location.origin'), 'bridge must reject standalone and cross-origin parents'],
  [bridge.includes('parent.postMessage(message, window.location.origin);'), 'bridge must post only to the exact current origin'],
  [!bridge.includes("postMessage(message, '*')") && !bridge.includes('postMessage(message, "*")'), 'bridge must never use a wildcard postMessage target'],
  [bridge.includes("postParentIntent('ready')") && bridge.includes("postParentIntent('close')") && bridge.includes("postParentIntent('listen', payload)"), 'bridge contract must remain limited to ready, close and listen intents'],
  [bridge.includes("const songId = String(destination.searchParams.get('song') || '').trim();"), 'Listen intent must derive canonical song identity from the existing player URL'],
  [bridge.includes("const hrefRelease = String(destination.searchParams.get('release') || '').trim();") && bridge.includes('song?.releaseId === releaseId') && bridge.includes('releaseTrackNumberForHandoff(song) != null'), 'optional release intent must remain source-truthfully validated against the canonical song'],
  [bridge.includes("target?.closest('a.play-link[href], a.personal-listening-card[href]')"), 'embedded Listen handling must cover catalogue and My Garba player links'],
  [bridge.includes("target?.closest('a.close-explore[href]')"), 'embedded Close must use the same narrow bridge contract'],
  [bridge.includes('window.location.assign(link.href);') && bridge.includes('window.location.assign(close.href);'), 'ordinary same-origin navigation must remain the fail-closed fallback if the parent disappears'],
  [bridge.includes('event.stopImmediatePropagation();'), 'handled embedded navigation must not fall through to standalone navigation/session handlers'],
];

const failures = checks.filter(([passed]) => !passed).map(([, message]) => message);
if (failures.length) {
  console.error('Explore return continuity validation failed:');
  failures.forEach((message) => console.error(`- ${message}`));
  process.exit(1);
}

console.log('✓ Explore → player → Back continuity and embedded child bridge are regression-guarded');
