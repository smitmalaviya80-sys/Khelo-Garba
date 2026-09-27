import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const root = path.resolve(import.meta.dirname, '..');
const read = (file) => readFile(path.join(root, file), 'utf8');
const [runtime, nonstop, styles, mobileStyles, bootstrap, styleIndex, pages] = await Promise.all([
  read('youtube-player-runtime.js'),
  read('nonstop-browser.js'),
  read('styles/60-runtime-and-provider.css'),
  read('styles/70-mobile-playback-coordination.css'),
  read('simple-runtime.js'),
  read('styles.css'),
  read('.github/workflows/pages.yml'),
]);

let failed = false;
const fail = (message) => { console.error(`✗ ${message}`); failed = true; };

const requiredRuntimeSignals = [
  'https://www.youtube.com/iframe_api',
  'new window.YT.Player',
  'player.playVideo',
  'player.pauseVideo',
  'player.seekTo',
  'loadVideoById',
  'cueVideoById',
  'controls: 0',
  'playsinline: 1',
  'enablejsapi: 1',
  'playbackSearchOnly',
  'verified-unchaptered-youtube-release',
  'youtubeStage',
  'provider-dock',
  'let playerReadyPromise = null;',
  'let playerReadyReject = null;',
  'let playerGeneration = 0;',
  'let activeRequestGeneration = 0;',
  "let activeVideoId = '';",
  'let retryCount = 0;',
  'const MAX_RECOVERY_RETRIES = 2;',
  'id="youtubeDockRetry"',
  'id="youtubeDockChoose"',
  'function retryActive()',
  'function chooseAnother()',
  'function showRecovery(message',
  'function resetPlaybackState(song, id, generation, { resume = true } = {})',
  'function providerEventIsCurrent(event, generation, expectedPlayer)',
  'async function ensurePlayer(initialVideoId, expectedToken)',
  "mount.id = 'garba-youtube-player'",
  'const readyPlayer = await ensurePlayer(id, token);',
  'const logicalStart = resetPlaybackState(song, id, token, { resume });',
  'readyPlayer.loadVideoById(request)',
  'readyPlayer.cueVideoById(request)',
  'onStateChange: (event) => handlePlayerStateChange(event, generation, createdPlayer)',
  'onAutoplayBlocked: (event) => handleAutoplayBlocked(event, generation, createdPlayer)',
  'onError: (event) => handlePlayerError(event, generation, createdPlayer)',
  'syncProgress(expectedRequestGeneration = activeRequestGeneration)',
  'setInterval(syncProgress, 350)',
];

for (const signal of requiredRuntimeSignals) {
  if (!runtime.includes(signal)) fail(`YouTube runtime is missing required signal ${JSON.stringify(signal)}`);
}

const openBlock = runtime.match(/async function open\(song, \{ autoplay = true, resume = true, retry = false \} = \{\}\) \{[\s\S]*?\n  \}\n\n  function toggle/)?.[0] || '';
const closeBlock = runtime.match(/function close\(\) \{[\s\S]*?\n  \}\n\n  function restoreElapsed/)?.[0] || '';
const destroyBlock = runtime.match(/function destroyPlayer\(\) \{[\s\S]*?\n  \}\n\n  async function ensurePlayer/)?.[0] || '';
const ensureBlock = runtime.match(/async function ensurePlayer\(initialVideoId, expectedToken\) \{[\s\S]*?\n  \}\n\n  function close/)?.[0] || '';
const stateHandlerBlock = runtime.match(/function handlePlayerStateChange\(event, generation, expectedPlayer\) \{[\s\S]*?\n  \}\n\n  function handleAutoplayBlocked/)?.[0] || '';
const autoplayHandlerBlock = runtime.match(/function handleAutoplayBlocked\(event, generation, expectedPlayer\) \{[\s\S]*?\n  \}\n\n  function handlePlayerError/)?.[0] || '';
const errorHandlerBlock = runtime.match(/function handlePlayerError\(event, generation, expectedPlayer\) \{[\s\S]*?\n  \}\n\n  function destroyPlayer/)?.[0] || '';
const syncBlock = runtime.match(/function syncProgress\(expectedRequestGeneration = activeRequestGeneration\) \{[\s\S]*?\n  \}\n\n  function startPolling/)?.[0] || '';
const retryBlock = runtime.match(/function retryActive\(\) \{[\s\S]*?\n  \}\n\n  function chooseAnother/)?.[0] || '';
const chooseBlock = runtime.match(/function chooseAnother\(\) \{[\s\S]*?\n  \}\n\n  function setPlaying/)?.[0] || '';
const offlineBlock = runtime.match(/window\.addEventListener\('offline', \(\) => \{[\s\S]*?\n  \}\);/)?.[0] || '';

if (!openBlock) fail('Could not inspect YouTube open() lifecycle');
if (openBlock.includes('destroyPlayer();')) {
  fail('Normal YouTube song navigation must reuse the existing IFrame player instead of destroying it');
}
if (!openBlock.includes('await ensurePlayer(id, token)')) {
  fail('YouTube open() must await the shared player readiness lifecycle with its navigation token');
}
if (!openBlock.includes('resetPlaybackState(song, id, token, { resume })')) {
  fail('Every YouTube selection must reset visible playback state before provider loading begins');
}
if (!openBlock.includes('activeRequestGeneration !== token')) {
  fail('YouTube open() must reject stale async work after a newer selection generation wins');
}
if (!openBlock.includes('if (!retry) retryCount = 0;')) {
  fail('A genuinely new YouTube selection must reset the bounded retry budget');
}
if (!openBlock.includes('if (!navigator.onLine)')) {
  fail('YouTube open() must surface an explicit offline recovery state instead of failing silently');
}
if (!openBlock.includes("showRecovery('You are offline. Reconnect, then retry this recording.'")) {
  fail('Offline YouTube selection must keep an actionable listener-facing recovery message');
}
if (!openBlock.includes('/timed out/i.test(reason)')) {
  fail('YouTube initialisation timeout must be distinguished from generic initialisation failure');
}
if (openBlock.includes('stage.classList.remove(\'is-loading\');\n      syncProgress();')) {
  fail('A newly requested recording must not sample stale provider progress before matching provider evidence arrives');
}
if (!ensureBlock.includes('if (playerReadyPromise) return playerReadyPromise;')) {
  fail('Concurrent first-load navigation must share the same YouTube player readiness promise');
}
if (!ensureBlock.includes("expectedToken !== openToken || !activeSong")) {
  fail('Closing playback while the YouTube API loads must cancel player creation before an iframe is mounted');
}
if (!ensureBlock.includes("mount.id = 'garba-youtube-player'")) {
  fail('Persistent YouTube playback must use one stable player mount');
}
for (const marker of [
  'onStateChange: (event) => handlePlayerStateChange(event, generation, createdPlayer)',
  'onAutoplayBlocked: (event) => handleAutoplayBlocked(event, generation, createdPlayer)',
  'onError: (event) => handlePlayerError(event, generation, createdPlayer)',
]) {
  if (!ensureBlock.includes(marker)) fail(`YouTube provider callback must stay bound to its player generation: ${marker}`);
}
if (!closeBlock.includes('destroyPlayer();')) {
  fail('Explicit YouTube Close must still tear down the IFrame player');
}
for (const marker of [
  'activeRequestGeneration = openToken;',
  "activeVideoId = '';",
  'retryCount = 0;',
  'setProgressState(0, 0);',
]) {
  if (!closeBlock.includes(marker)) fail(`Explicit YouTube Close must clear stale selection state: ${marker}`);
}
for (const marker of [
  'playerGeneration += 1;',
  'playerReadyPromise = null;',
  'playerReadyReject = null;',
  'currentPlayer?.destroy?.()',
]) {
  if (!destroyBlock.includes(marker)) fail(`Explicit YouTube teardown is missing lifecycle marker: ${marker}`);
}
if (!ensureBlock.includes('generation !== playerGeneration')) {
  fail('YouTube readiness callbacks must ignore stale player generations after Close/offline teardown');
}
for (const [block, label] of [
  [stateHandlerBlock, 'state'],
  [autoplayHandlerBlock, 'autoplay-blocked'],
  [errorHandlerBlock, 'error'],
]) {
  if (!block) fail(`Could not inspect YouTube ${label} callback`);
  else if (!block.includes('providerEventIsCurrent(event, generation, expectedPlayer)')) {
    fail(`YouTube ${label} callback must reject stale player/video evidence before mutating UI state`);
  }
}
if (!autoplayHandlerBlock.includes('setPlaying(false);') || !autoplayHandlerBlock.includes("showRecovery('Playback is ready. Tap Play to start this recording.'")) {
  fail('Autoplay-blocked YouTube state must remain paused and request a real user gesture with persistent recovery UI');
}
for (const marker of [
  'code === 101 || code === 150',
  'code === 100',
  'showRecovery(',
]) {
  if (!errorHandlerBlock.includes(marker)) fail(`YouTube error recovery must distinguish provider failures: ${marker}`);
}
{
  const tokenIndex = errorHandlerBlock.indexOf('const token = openToken;');
  const dispatchIndex = errorHandlerBlock.indexOf("new CustomEvent('garba:youtube-error'");
  const guardIndex = errorHandlerBlock.indexOf('if (token !== openToken) return;');
  const recoveryIndex = errorHandlerBlock.indexOf('showRecovery(');
  if (!(tokenIndex >= 0 && dispatchIndex > tokenIndex && guardIndex > dispatchIndex && recoveryIndex > guardIndex)) {
    fail('YouTube error recovery must not paint over a replacement opened by a garba:youtube-error listener');
  }
}
if (!retryBlock) fail('Could not inspect bounded YouTube retry action');
else {
  if (!retryBlock.includes('retryCount >= MAX_RECOVERY_RETRIES')) fail('YouTube Retry must have a hard attempt bound');
  if (!retryBlock.includes('activeRequestGeneration !== generation')) fail('YouTube Retry must reject an older selection generation');
  if (!retryBlock.includes("open(song, { autoplay: true, resume: true, retry: true })")) fail('YouTube Retry must retry the exact active recording through the normal open lifecycle');
}
if (!chooseBlock.includes('continueAfterNavigation = true;') || !chooseBlock.includes("$('nextButton')?.click();")) {
  fail('Choose another recording must preserve queue/navigation context and advance through the normal player path');
}
if (!syncBlock.includes('expectedRequestGeneration !== activeRequestGeneration')) {
  fail('YouTube progress polling must stop stale explicit generations from mutating the new recording');
}
if (!syncBlock.includes('observedVideoId !== activeVideoId')) {
  fail('YouTube progress polling must reject a reused iframe until its provider video matches the active selection');
}
if (!offlineBlock) fail('Active YouTube playback must handle an offline transition explicitly');
else {
  if (!offlineBlock.includes('destroyPlayer();')) fail('Offline transition must tear down the provider iframe while preserving the active recording identity');
  if (!offlineBlock.includes("showRecovery('You are offline. Reconnect, then retry this recording.'")) fail('Offline transition must keep persistent actionable recovery UI');
}
for (const marker of [
  'role="status" aria-live="polite"',
  "note.setAttribute('aria-live', assertive ? 'assertive' : 'polite')",
  'setRecoveryActions({ retry: retry && retryCount < MAX_RECOVERY_RETRIES, choose, open });',
  'openLink.href = `https://www.youtube.com/watch?v=${encodeURIComponent(id)}`;',
]) {
  if (!runtime.includes(marker)) fail(`Persistent YouTube recovery contract missing marker: ${marker}`);
}

const prohibitedPatterns = [
  [/googlevideo/i, 'raw googlevideo delivery'],
  [/videoplayback/i, 'raw YouTube videoplayback URLs'],
  [/youtube-dl/i, 'youtube-dl extraction'],
  [/yt-dlp/i, 'yt-dlp extraction'],
  [/signatureCipher/i, 'YouTube signature-cipher parsing'],
  [/get_video_info/i, 'undocumented get_video_info access'],
  [/skipAd/i, 'ad-skipping controls'],
  [/removeAds/i, 'ad-removal controls'],
  [/blockAds/i, 'ad-blocking controls'],
];

for (const [pattern, label] of prohibitedPatterns) {
  if (pattern.test(runtime) || pattern.test(nonstop)) fail(`YouTube runtime must not implement ${label}`);
}

if (!/\.provider-media\s*\{[^}]*min-width:\s*200px;[^}]*min-height:\s*200px;/s.test(styles)) {
  fail('Visible provider media contract must keep a minimum 200×200 viewport');
}
if (!/\.provider-media iframe\s*\{[^}]*min-width:\s*200px;[^}]*min-height:\s*200px;/s.test(styles)) {
  fail('Embedded provider iframe must keep a minimum 200×200 viewport');
}

for (const marker of [
  'body:has(#youtubeStage.open[aria-hidden="false"]) #youtubeStage',
  'width: 216px;',
  'height: 200px;',
  'min-width: 200px;',
  'min-height: 200px;',
  '#songSheet[data-snap="medium"]',
  '#songSheet[data-snap="full"]',
  'height: clamp(220px, 48dvh, calc(100dvh - 320px));',
]) {
  if (!mobileStyles.includes(marker)) fail(`Mobile YouTube/sheet layout contract missing marker: ${marker}`);
}
if (!styleIndex.includes('@import url("styles/70-mobile-playback-coordination.css");')) {
  fail('Mobile playback coordination stylesheet must load after the base runtime styles locally');
}
const mobileLayerIndex = pages.indexOf('styles/70-mobile-playback-coordination.css');
const outputIndex = pages.indexOf('> _site/styles.css');
if (!(mobileLayerIndex >= 0 && outputIndex > mobileLayerIndex)) {
  fail('Pages must flatten the mobile playback coordination layer into production styles.css');
}

for (const marker of [
  "const DEFAULT_SET_ID = 'set-aditya-ochhav-2023'",
  "button.textContent = 'Nonstop'",
  "strip.insertBefore(button, strip.firstElementChild)",
  "url.searchParams.set('nonstop', set.id)",
  "playbackProvider: 'youtube'",
  'youtubeStartSeconds: 0',
  "$('progress')?.addEventListener('input', captureSeek, { capture: true })",
  'function captureMainNavigation(event)',
  "target.closest('#queueButton')",
  '.app[data-play-mode="nonstop"] #prevButton',
  'data-play-mode',
  '#genreStrip{grid-row:6!important',
  '#browseActions{grid-row:7!important',
]) {
  if (!nonstop.includes(marker)) fail(`Direct Nonstop playback contract missing marker: ${marker}`);
}

const restoreForms = [
  'function restorePreviousSession(previous)',
  'function restorePreviousSession(previous, { updateHistory = true } = {})',
];
if (!restoreForms.some((marker) => nonstop.includes(marker))) {
  fail('Direct Nonstop playback contract must restore the previous listening session');
}

for (const marker of [
  "['traditional', 'Traditional']",
  "['sanedo', 'Sanedo']",
  'id="nonstopBrowserSearch"',
  "import('./assets/runtime/search-core.js')",
  'function fallbackNormalize(value',
  'function searchSets(sets, query)',
  'rankSearchRecords(sets.map(searchRecordForSet), needle)',
  'Promise.all([loadAllSets(), loadSearchCore()])',
  'function trapBrowserFocus(event)',
  'function setBackgroundInert(inert)',
  "localStorage.getItem('garba:session')",
  'history.pushState(history.state',
  "url.searchParams.delete('song')",
  'seenVideos.has(set.videoId)',
  'state.failedChunks.size',
  '@media(prefers-reduced-motion:reduce)',
]) {
  if (!nonstop.includes(marker)) fail(`Hardened Nonstop UX contract missing marker: ${marker}`);
}

const nonstopDurationForms = [
  'durationSeconds: 0',
  'durationSeconds: set.durationSeconds || 0',
];
if (!nonstopDurationForms.some((marker) => nonstop.includes(marker))) {
  fail('Direct Nonstop playback contract must use a zero/known duration compatible with the YouTube engine');
}

const nonstopOpenForms = [
  'window.GARBA_YOUTUBE_PLAYER.open(state.activeTrack, { autoplay: true, resume: false })',
  'window.GARBA_YOUTUBE_PLAYER.open(track, { autoplay: true, resume: false })',
];
if (!nonstopOpenForms.some((marker) => nonstop.includes(marker))) {
  fail('Direct Nonstop playback contract must open the selected track through GARBA_YOUTUBE_PLAYER');
}

if (nonstop.includes('window.open(')) {
  fail('Primary Nonstop playback must not open an external provider window');
}
if (nonstop.includes('nonstop-overlay') || nonstop.includes('youtube-nocookie.com/embed/')) {
  fail('Primary Nonstop playback must reuse the PlayGarba provider engine instead of a separate modal/embed player');
}

const providerIndex = bootstrap.indexOf('provider-runtime.js');
const continuityIndex = bootstrap.indexOf('player-continuity.js');
const youtubeIndex = bootstrap.indexOf('youtube-player-runtime.js');
if (!(providerIndex >= 0 && continuityIndex > providerIndex && youtubeIndex > continuityIndex)) {
  fail('YouTube runtime must load after provider-runtime and player-continuity route sanitisation');
}

if (failed) process.exit(1);
console.log('✓ YouTube error recovery yields to a replacement opened by an error listener');
console.log('✓ YouTube playback uses the documented IFrame Player API and GARBA transport controls');
console.log('✓ queue navigation reuses one visible YouTube IFrame player while explicit Close tears it down');
console.log('✓ concurrent first-load navigation shares readiness and Close during API loading cannot create a hidden iframe afterward');
console.log('✓ provider callbacks and progress polling are scoped to the active player/video selection before they mutate UI state');
console.log('✓ a new YouTube selection resets stale elapsed/duration/progress before matching provider evidence arrives');
console.log('✓ stale player generations cannot resume after teardown');
console.log('✓ YouTube failures remain visible with bounded Retry, exact Open YouTube and Choose another recording recovery');
console.log('✓ offline, API timeout, autoplay-blocked, unavailable and embed-disabled states are distinguished without stale retries');
console.log('✓ no raw-stream extraction, cipher parsing, ad skipping or ad-removal mechanism is present');
console.log('✓ the embedded YouTube player retains a visible minimum 200×200 viewport');
console.log('✓ mobile Browse/Search reserves space for the visible YouTube player instead of rendering underneath it');
console.log('✓ Pages flattens the mobile playback coordination layer into the PWA-cached production stylesheet');
console.log('✓ Nonstop is a first-class PlayGarba mode that reuses the controllable YouTube engine and restores the prior listening state on exit');
console.log('✓ Nonstop search, taxonomy, history, focus and partial-load hardening are regression-guarded');
console.log('✓ Nonstop sits before the genre strip and Explore remains a separate lower discovery action');
console.log('✓ route-truth sanitisation runs before YouTube autoplay decisions');
