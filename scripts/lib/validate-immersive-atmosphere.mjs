import { access, readFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../..');
const read = (file) => readFile(path.join(root, file), 'utf8');
const exists = async (file) => { try { await access(path.join(root, file)); return true; } catch { return false; } };

const [runtime, manifestText, provider, sw] = await Promise.all([
  read('assets/runtime/immersive-atmosphere.js'),
  read('data/atmosphere-sources.json'),
  read('provider-runtime.js'),
  read('sw.js'),
]);

const manifest = JSON.parse(manifestText);
let failed = false;
const fail = (message) => { console.error(`✗ ${message}`); failed = true; };

// Engine, player integration and accessibility contract
for (const marker of [
  'GARBA_ATMOSPHERE',
  'GARBA_ATMOSPHERE_ENGINE',
  'HRTF',
  'createConvolver',
  'createDynamicsCompressor',
  'prefers-reduced-motion: reduce',
  'constrainedConnection',
  "app.classList.contains('is-playing')",
  'document.hidden',
  'garba:atmosphere-change',
  "aria-modal', 'true'",
  'setBackgroundInert',
  'navigator.audioSession',
  'Indoor stadium',
  'Outdoors',
  'Sheri',
  'In the circle',
  'Far away',
  'By the stage',
  'function setListener(',
  'function setEnabled(',
  'role="switch"',
  "const INTRO_KEY = 'garba:atmosphere-intro'",
  'event.detail === 0',
  'Full circle',
  'Tap the beat',
  'Be tali',
  'Tran tali',
]) {
  if (!runtime.includes(marker)) fail(`Atmosphere runtime is missing: ${marker}`);
}

for (const marker of [
  '<h2 id="atmosphereTitle">Garba Atmosphere</h2>',
  'class="atmosphere-test"',
  'aria-label="Test Garba Atmosphere"',
  'class="atmosphere-headphone-icon"',
  'class="atmosphere-status" role="status" aria-live="polite"',
  '.atmosphere-status{position:absolute!important;width:1px!important;',
  'type="range" min="5" max="100" step="5"',
  'setTimeout(() => stopPreview({ announce: false }), 6000)',
  'if (state.previewActive) { stopPreview(); return; }',
  'if (active) stopPreview({ announce: false });',
  "state.mode === 'off' || (!state.playbackActive && !state.previewActive)) return 0;",
]) {
  if (!runtime.includes(marker)) fail(`Compact Atmosphere/Test contract is missing: ${marker}`);
}

// Truthfulness: the song is never processed, and the panel says so.
if (!runtime.includes('The song itself plays as YouTube sends it.')) {
  fail('Atmosphere panel must say the song itself is not processed');
}
// Venue names are fine; the retired labels that implied the song itself was being processed are not.
if (/Acoustic Space|Soundstage|Indoor Hall|Outdoor Ground|stadium slapback echo|Palace walls/.test(runtime)) {
  fail('Provider-backed playback must not expose fake source-processing Soundstage modes');
}
if (/youtubeStage[^\n]*createMediaElementSource|createMediaElementSource\([^)]*youtube/i.test(runtime)) {
  fail('Atmosphere must not attempt to process the YouTube player');
}

// Rhythm: claps are synthesised and follow the listener's taps, never a looped recording.
for (const retired of ['rhythmic-clapping.ogg', 'ground-applause.ogg', 'Palmas', '160 BPM']) {
  if (runtime.includes(retired)) fail(`Retired Atmosphere recording is referenced by the runtime: ${retired}`);
}
for (const marker of ['function buildClap(', 'function buildStick(', 'function schedule(until)', 'async function registerTap()', 'setTempo(bpm, firstBeat, { locked: true })']) {
  if (!runtime.includes(marker)) fail(`Beat-locked synthesis contract is missing: ${marker}`);
}
if (/setTimeout\([^)]*playTransient|Math\.random\(\) < 0\.35 \? 'applause'/.test(runtime)) {
  fail('Claps and sticks must be scheduled on the beat, not at random intervals');
}

for (const retired of [
  'Place a subtle venue layer beneath the song',
  'Live Ground can add a very quiet public-domain',
  'Paused with the music',
  '>Headphones<',
]) {
  if (runtime.includes(retired)) fail(`Retired Atmosphere panel copy returned: ${retired}`);
}

const setModeStart = runtime.indexOf('async function setMode(');
const syncPlaybackStart = runtime.indexOf('function syncPlaybackState()', setModeStart);
if (setModeStart < 0 || syncPlaybackStart <= setModeStart) {
  fail('Atmosphere mode/playback synchronisation functions are missing');
} else {
  const setModeSource = runtime.slice(setModeStart, syncPlaybackStart);
  if (setModeSource.includes('previewCurrentMode(')) {
    fail('Selecting an Atmosphere mode while paused must not auto-preview it');
  }
  if (!setModeSource.includes('if (state.playbackActive) await buildScene({ smooth: true });\n    else scheduleIdleSuspend();')) {
    fail('Mode selection must follow real playback and otherwise stay quiet');
  }
}

const syncPlaybackSource = syncPlaybackStart >= 0
  ? runtime.slice(syncPlaybackStart, runtime.indexOf('function trustedPlaybackUnlock(', syncPlaybackStart))
  : '';
if (!syncPlaybackSource.includes('} else if (!state.previewActive) {\n      applyMasterLevel({ quick: true });\n      scheduleIdleSuspend();')) {
  fail('Ordinary pause must silence Atmosphere unless an explicit Test is active');
}

for (const marker of [
  'function loadAtmosphereRuntime()',
  "script.src = 'assets/runtime/immersive-atmosphere.js'",
  'loadAtmosphereRuntime();',
]) {
  if (!provider.includes(marker)) fail(`Playback bootstrap is missing Atmosphere loader: ${marker}`);
}

// Source manifest
if (manifest.version !== '2.0.0') fail('Atmosphere source manifest version must be 2.0.0');
if (manifest.runtimePolicy?.allowRemoteOnDataSaver !== false) fail('Remote Atmosphere audio must stay disabled on Data Saver');
if (manifest.runtimePolicy?.requireNoEmbeddedMusic !== true) fail('Atmosphere sources must reject embedded music');
if (manifest.runtimePolicy?.fallback !== 'procedural-local-scene') fail('Atmosphere must retain its procedural local fallback');
if (manifest.runtimePolicy?.songProcessing !== 'none') fail('Atmosphere manifest must declare that songs are not processed');

const sources = Array.isArray(manifest.sources) ? manifest.sources : [];
const enabledSources = sources.filter((source) => source.enabled);
if (!enabledSources.length) fail('At least one enabled Atmosphere ambience source is required');
const localOrHttps = (url) => /^https:\/\//.test(url) || /^assets\/audio\/[a-z0-9-]+\.(ogg|m4a)$/.test(url);
for (const source of enabledSources) {
  if (source.license !== 'public-domain') fail(`Enabled Atmosphere source ${source.id} must be public-domain`);
  if (source.containsMusic !== false) fail(`Enabled Atmosphere source ${source.id} must explicitly contain no music`);
  if (!/^https:\/\//.test(source.sourcePage || '')) fail(`Enabled Atmosphere source ${source.id} must cite its source page`);
  const urls = [source.audioUrl, ...(source.files || []).map((file) => file.url)].filter(Boolean);
  if (!urls.length) fail(`Enabled Atmosphere source ${source.id} has no audio file`);
  for (const url of urls) {
    if (!localOrHttps(url)) fail(`Atmosphere source ${source.id} must use HTTPS or a bundled assets/audio file: ${url}`);
    if (!/^https:/.test(url) && !await exists(url)) fail(`Atmosphere source ${source.id} file is missing: ${url}`);
  }
}
for (const source of sources.filter((item) => item.license !== 'public-domain')) {
  if (source.enabled) fail(`Non-public-domain Atmosphere source ${source.id} must stay disabled`);
}

for (const marker of [
  "'./assets/runtime/immersive-atmosphere.js'",
  "'/assets/runtime/immersive-atmosphere.js'",
]) {
  if (!sw.includes(marker)) fail(`PWA Atmosphere packaging is missing: ${marker}`);
}
// Anything sw.js precaches must still exist, or the service worker install fails.
for (const match of sw.matchAll(/'\.\/(assets\/audio\/[^']+)'/g)) {
  if (!await exists(match[1])) fail(`sw.js precaches a missing Atmosphere file: ${match[1]}`);
}

// Listening room: a public page that runs the same engine, linked from the panel and deployed by Pages.
const [room, roomScript, pages] = await Promise.all([
  read('public-site/atmosphere/index.html'),
  read('public-site/atmosphere/atmosphere.js'),
  read('.github/workflows/pages.yml'),
]);
if (!runtime.includes('href="./atmosphere/"')) fail('Atmosphere panel must link to the listening room');
if (!pages.includes('public-site/atmosphere \\')) fail('Pages must deploy public-site/atmosphere');
for (const marker of ['<script src="../assets/runtime/immersive-atmosphere.js"></script>', 'role="switch"', 'id="tap"']) {
  if (!room.includes(marker)) fail(`Listening room is missing: ${marker}`);
}
if (!roomScript.includes('GARBA_ATMOSPHERE_ENGINE')) fail('Listening room must use the shared Atmosphere engine');
if (!room.includes("never the song itself")) fail('Listening room must say the song itself is not processed');

// The microphone beat follower: opt-in, hears the speaker (echo cancellation off), and its estimator finds a
// steady 120 BPM beat in a synthetic low-end signal to within 1.5 BPM and 25 ms
for (const marker of ['function createBeatFollower(', 'echoCancellation: false', 'function estimateBeat(', 'createBeatFollower, playDandiyaTap };', "Follow the song's beat", 'Nothing is recorded or sent.']) {
  if (!runtime.includes(marker)) fail(`Atmosphere runtime is missing the beat follower marker: ${marker}`);
}
// Every press outside the Simple player (which taps from app.js) knocks two dandiya sticks together, once
for (const marker of ['function playDandiyaTap(', "script[src*=\"app.js\"]", 'window.__garbaDandiyaTaps', "addEventListener(window.PointerEvent ? 'pointerdown' : 'touchstart', tapFor"]) {
  if (!runtime.includes(marker)) fail(`Atmosphere runtime is missing the dandiya tap marker: ${marker}`);
}
// The venue answers the song's locked beat through its reverb only; YouTube's own audio is never touched
for (const marker of ['function buildThump(', 'nodes.room.connect(nodes.roomCut).connect(nodes.send)', 'function roomAt(', "if (!room || !state.tempo?.locked) return 0;", "setTempo(bpm, firstBeat, { locked: true })", "setTempo(bpm, anchor, { locked: true })"]) {
  if (!runtime.includes(marker)) fail(`Atmosphere runtime is missing the venue echo marker: ${marker}`);
}
for (const id of ['outdoors', 'stadium', 'sheri']) if (!/room: \{ level: [\d.]+, cut: \d+ \}/.test(runtime.slice(runtime.indexOf(`    ${id}: {`), runtime.indexOf(`    ${id}: {`) + 1600))) fail(`Venue ${id} has no echo room`);
if (/nodes\.room[^C]*connect\(nodes\.(dry|bus|near|out)\)/.test(runtime)) fail('The venue echo must go only into the reverb, never dry');
{
  const body = runtime.slice(runtime.indexOf('function estimateBeat('), runtime.indexOf('const BEAT_WORKLET'));
  const estimateBeat = new Function(`${body}; return estimateBeat;`)();
  const hop = 512 / 44100, beats = [], frames = [];
  for (let t = 0.4; t < 8; t += 0.5) beats.push(t);
  for (let f = 0; f * hop < 8; f += 1) {
    const t = f * hop; let e = 0.01 * (1 + ((f * 7919) % 13) / 13);
    for (const b of beats) { const d = t - b; if (d >= 0 && d < 0.2) e += Math.exp(-d / 0.04); }
    frames.push([t, e]);
  }
  const est = estimateBeat(frames);
  const nearest = est ? beats.reduce((m, b) => (Math.abs(b - est.lastBeat) < Math.abs(m - est.lastBeat) ? b : m), 0) : 0;
  if (!est || Math.abs(est.bpm - 120) > 1.5 || Math.abs(est.lastBeat - nearest) > 0.025) fail(`Beat estimator missed a steady 120 BPM beat: ${JSON.stringify(est)}`);
}

// The venue scene's staging: the band drawn in full up close, a deep stage with a riser, a proper indoor ceiling,
// the crowd with bodies and cloth near the stage, rigging for the chhatris, and the mandap over the sheri takht
{
  const scene = await read('public-site/atmosphere/scene.js');
  for (const marker of ['function performer(', 'function micStand(', 'function drawCeiling(', 'function jhummar(', 'function backRich(', 'function backHead(', 'function sheriMandap(', 'function chhatriRig(', 'function armsFor(', "cachedLayer('stadiumCeiling', drawCeiling)", 'o.riserZ = zF + depth * 0.72', 'if (m.h * p.s >= 58) {', 'var rich = h >= (QP >= 1 ? 40 : 90)', "g.fillText('DRONE'"]) {
    if (!scene.includes(marker)) fail(`Venue scene is missing the staging marker: ${marker}`);
  }
  // The stage screen is a drone feed of detailed people from above, with no name on it, rendered as its own image
  for (const marker of ['function droneFeed(', 'function person2(', 'if (rr < 7) {', 'function shotAt(', 'function dronePos(', 'function droneInSky(', 'droneInSky(t);', 'DRONE_AIR']) if (!scene.includes(marker)) fail(`Venue scene is missing the drone marker: ${marker}`);
  // Singers keep to lanes of their own and don't copy each other's moves
  for (const marker of ['lane: [slot - half, slot + half]', 'busy.indexOf(pick(r))']) if (!scene.includes(marker)) fail(`Venue scene is missing the singer-lane marker: ${marker}`);
  if (/brandMark|drawMark|PlayGarba\.com/.test(scene)) fail('The stage screen must not carry the PlayGarba.com name or mark');
  // The singers are the song's own: a lineup and a song key from the page; a new key walks the old lineup off stage
  // left and the new one on from the right
  for (const marker of ['function syncLineup(', 'function lineupFor(', 'patch.singers !== undefined', 'patch.songKey !== undefined', "m.tx = o.x0 + 0.2", "m.cx = o.x1 - 0.2"]) if (!scene.includes(marker)) fail(`Venue scene is missing the singer-lineup marker: ${marker}`);
  // The handover sits inside the song transition: off in the song's last seconds, about five seconds on a pick, after the walk back from the DJ
  for (const marker of ['function paceFrom(', 'function songLeft(', 'function walkPace(', 'function leaveLineup(', 'function camLead(', "lineupKeys[id] = 'back|'", 'm.spd || 2']) if (!scene.includes(marker)) fail(`Venue scene is missing the singer-handover marker: ${marker}`);
  for (const file of ['docs/product/prototypes/garbo/garbo.js', 'public-site/garbo/prototype/garbo.js']) {
    const garbo = await read(file);
    for (const marker of ['singers: lineup.length ? lineup : null, songKey: songKey || null', 'function voiceOf(', 'NOT_A_SINGER']) if (!garbo.includes(marker)) fail(`${file} does not send the singer lineup: ${marker}`);
  }
  // Heavy effects step down with the scene's own quality level
  for (const marker of ['&& QP >= 1) {', 'if (st.on && !reduce && QP >= 1) {']) if (!scene.includes(marker)) fail(`Venue scene does not gate a heavy effect on quality: ${marker}`);
  // Colours arrive both as hex and as rgb() strings from other shading; both must shade to a valid colour
  const body = scene.slice(scene.indexOf('    function shadeRaw('), scene.indexOf('    // Cloth or skin wrapped round a body'));
  const shadeRaw = new Function('lerp', `${body}; return shadeRaw;`)((a, b, t) => a + (b - a) * t);
  for (const [input, f] of [['#8e1b2c', -0.3], ['rgb(142,27,44)', -0.3], ['#f3e6d0', 0.2], ['rgb(10, 20, 30)', 0.5]]) {
    const out = shadeRaw(input, f);
    if (!/^rgb\(\d{1,3},\d{1,3},\d{1,3}\)$/.test(out)) fail(`shade(${input}, ${f}) gave an invalid colour: ${out}`);
  }
  if (shadeRaw('#8e1b2c', -0.3) !== shadeRaw('rgb(142,27,44)', -0.3)) fail('shade() must treat hex and rgb() forms of the same colour alike');
}

if (failed) process.exit(1);
console.log('✓ Garba Atmosphere venues, listening position, beat-locked claps, truthful copy, public-domain sources and PWA packaging are coherent');
