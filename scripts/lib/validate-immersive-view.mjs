// Two-view contract: the courtyard artwork and the full Garbo prototype are exclusive renderers;
// playback stays mounted in the production player and reaches the prototype through a same-origin bridge.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const root = path.resolve(import.meta.dirname, '../..');
const read = (file) => readFile(path.join(root, file), 'utf8');
const [runtime, html, css, sw, pages, agents, app, prototypeHtml, prototypeJs, prototypeCss] = await Promise.all([
  read('assets/runtime/immersive-view.js'),
  read('index.html'),
  read('styles/60-runtime-and-provider.css'),
  read('sw.js'),
  read('.github/workflows/pages.yml'),
  read('AGENTS.md'),
  read('app.js'),
  read('docs/product/prototypes/garbo/index.html'),
  read('docs/product/prototypes/garbo/garbo.js'),
  read('docs/product/prototypes/garbo/garbo.css'),
]);

let failed = false;
const fail = (message) => { console.error(`✗ ${message}`); failed = true; };

for (const marker of ["var view = 'simple'", "VIEW_KEY = 'garba:view'", "./garbo/prototype/?live=1&embed=1&v=20260926-3", "classList.toggle('view-immersive'", 'window.GARBA_IMMERSIVE_VIEW', "window.GARBA_IMMERSIVE_PLAYER.snapshot", "event.source !== frame.contentWindow"]) {
  if (!runtime.includes(marker)) fail(`immersive-view.js is missing ${marker}`);
}
// A first visit opens Immersive by the stage in the indoor stadium, and the first tap that isn't on a control starts the song
for (const marker of ["savedView == null && !navigator.webdriver", "atmo.venue = 'stadium'; atmo.listener = 'stage'", 'function armFirstTap(', "window.GARBA_IMMERSIVE_PLAYER.action('play')", 'Tap anywhere to start the garba']) {
  if (!runtime.includes(marker)) fail(`immersive-view.js is missing the first-visit marker ${marker}`);
}
if (!html.includes('<script src="assets/runtime/immersive-view.js?v=20260926-4" defer></script>')) fail('index.html must load the versioned immersive-view.js runtime with defer');
if (html.indexOf('assets/runtime/immersive-view.js') < html.indexOf('src="app.js"')) fail('immersive-view.js must load after app.js');

for (const marker of ['id="moreButton"', 'aria-controls="moreCard"', 'id="moreCard"', 'data-view-switch', 'id="immersiveViewStatus"']) {
  if (!html.includes(marker)) fail(`index.html is missing ${marker}`);
}
if (html.indexOf('class="view-switch"') < html.indexOf('id="moreButton"') || html.indexOf('class="view-switch"') > html.indexOf('id="moreCard"')) fail('The Simple/Immersive switch must sit below More and outside its menu');
if (!html.includes('role="switch"') || !html.includes('aria-checked="false"')) fail('The Simple view must expose an accessible Immersive switch in the off state');
for (const marker of ['class="view-switch-detail"', 'class="view-switch-icon view-switch-icon-simple"', 'class="view-switch-icon view-switch-icon-immersive"']) {
  if (!html.includes(marker)) fail(`index.html is missing the icon-only view switch element ${marker}`);
}
if (html.includes('>Simple<') || html.includes('>Immersive<')) fail('The Simple/Immersive pill must use icons rather than visible text labels');
if (html.slice(html.indexOf('id="moreCard"'), html.indexOf('id="immersiveViewStatus"')).includes('data-view-switch')) fail('The More card must not contain the player view switch');
for (const id of ['atmosphereButton', 'circleButton', 'favouritesButton', 'shareButton']) {
  if (!html.includes(`data-proxy="${id}"`)) fail(`More card has no row for #${id}`);
}
// The Simple renderer keeps its courtyard artwork while Immersive uses a separate full-screen frame.
if (!html.includes('class="world')) fail('index.html must keep the courtyard artwork for Simple view');
// Up next is a stable player anchor, so it stays in the bar at every size
if (/#queueButton[^{]*\{\s*display:\s*none/.test(css)) fail('Up next must stay in the top bar at every size');
for (const marker of ['.garbo-prototype-overlay', '.garbo-prototype-frame', '.view-switch', '.utilities > .view-switch', '.view-switch-detail', '.view-switch-icon-simple', '.view-switch-icon-immersive', '.more-card', '@media (max-width: 1023px)', '@media (min-width: 1024px)', 'prefers-reduced-motion: reduce', 'forced-colors: active']) {
  if (!css.includes(marker)) fail(`styles/60-runtime-and-provider.css is missing ${marker}`);
}
if (!sw.includes("'./assets/runtime/immersive-view.js?v=20260926-4'") || !sw.includes("'/assets/runtime/immersive-view.js'")) fail('sw.js must cache the current immersive-view.js runtime and refresh its path');
if (!pages.includes('public-site/atmosphere')) fail('Pages must publish public-site/atmosphere so /atmosphere/scene.js exists');
if (!pages.includes("s#../../../../public-site/atmosphere/scene.js#../../atmosphere/scene.js#")) fail('Pages must rewrite the canonical source scene URL for the deployed prototype location');
if (!pages.includes('public-site/garbo')) fail('Pages must publish the complete public Garbo prototype for immersive mode');
if (!pages.includes('60-runtime-and-provider.css')) fail('Pages must bundle styles/60-runtime-and-provider.css');
if (!/Distinct Player Views/.test(agents) || !agents.includes('never combine the two visual renderers')) fail('AGENTS.md invariant 1 must describe the distinct Simple and Immersive renderers');
for (const marker of ['window.GARBA_IMMERSIVE_PLAYER', 'syncCatalogue()', 'loadNonstopCatalogue()', "case 'play'", "case 'seek'", "case 'song'", 'includeCatalogue']) {
  if (!app.includes(marker)) fail(`app.js is missing the immersive player API marker ${marker}`);
}
for (const marker of ["get('live') === '1'", "'play'", "'seek'", "'shuffle'", "'circle'", 'nonstopSetsStatus', 'visibleSongCount', 'visibleSetCount', 'appendMoreRow']) {
  if (!prototypeJs.includes(marker)) fail(`The canonical prototype runtime is missing ${marker}`);
}
if (prototypeJs.includes('matches.slice(0, 160)')) fail('Explore must provide progressive access to every song match rather than stopping at 160');
for (const marker of ['loadNonstopCatalogue', 'nonstopSetsStatus', 'snapshot.nonstopSets']) {
  if (!runtime.includes(marker)) fail(`immersive-view.js is missing the full Nonstop handoff marker ${marker}`);
}
if (!prototypeHtml.includes('id="exploreCount"')) fail('The canonical prototype page must expose the live Explore result count');
if (!prototypeHtml.includes('class="proto-states"')) fail('The standalone prototype must keep its prototype-state picker');
if (!prototypeJs.includes("document.querySelector('.proto-states')") || !prototypeJs.includes('prototypeStates.hidden = LIVE_SITE')) fail('Prototype-state controls must be hidden in embedded live mode and remain available standalone');
const guideNote = prototypeHtml.match(/<p class="about-note">([^<]*)<\/p>/)?.[1] || '';
if (!guideNote.includes('Mata ni Pachedi') || !guideNote.includes("Devipujak community")) fail('The Garba guide must preserve its concise Pachedi attribution');
if (/commission|TODO|should be credited/i.test(guideNote)) fail('The live Garba guide must not expose artwork commissioning or editorial task notes');
for (const marker of ['href="garbo.css?v=20260927-1"', 'src="garbo.js?v=20260927-2"']) {
  if (!prototypeHtml.includes(marker)) fail(`The canonical prototype must version its cached embedded asset URL: ${marker}`);
}
for (const file of ['index.html', 'garbo.js', 'garbo.css']) {
  if (!pages.includes(`docs/product/prototypes/garbo/${file}`) || !pages.includes(`_site/garbo/prototype/`)) {
    fail(`Pages must deploy the canonical prototype ${file} to /garbo/prototype/`);
  }
}
if (!/Garbo player prototype/i.test(prototypeHtml) || !prototypeJs.includes("get('live') === '1'")) fail('The canonical prototype page must support live-site mode');
if (!prototypeHtml.includes('id="circleBridge"')) fail('The prototype must expose the live Garba Circle action');
if (!prototypeHtml.includes('class="view-switch"') || !prototypeHtml.includes('role="switch"') || !prototypeJs.includes("type: 'view'")) fail('Immersive mode must expose a live Simple/Immersive switch outside the prototype More menu');
for (const marker of ['class="view-switch-detail"', 'class="view-switch-icon view-switch-icon-simple"', 'class="view-switch-icon view-switch-icon-immersive"']) {
  if (!prototypeHtml.includes(marker)) fail(`The embedded prototype is missing the icon-only view switch element ${marker}`);
}
if (prototypeHtml.includes('>Simple<') || prototypeHtml.includes('>Immersive<')) fail('The embedded prototype mode pill must not render visible text labels');
if (!prototypeJs.includes("viewSwitch.closest('.view-switch').hidden = false")) fail('Live Immersive mode must reveal the switch itself, not only its parent toolbar');
if (!prototypeCss.includes('.lamp-tip') || !prototypeCss.includes('.side-card')) fail('The canonical prototype must include its full player presentation');

if (failed) process.exit(1);
console.log('✓ Simple and Immersive use separate renderers, the mode switch sits below More, and the deployed Garbo scene path resolves');
