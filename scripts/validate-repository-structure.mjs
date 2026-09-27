import { access, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const root = path.resolve(import.meta.dirname, '..');
let failed = false;
const fail = (message) => { console.error(`✗ ${message}`); failed = true; };
const ok = (message) => console.log(`✓ ${message}`);
const exists = async (file) => {
  try { await access(path.join(root, file)); return true; }
  catch { return false; }
};
const read = (file) => readFile(path.join(root, file), 'utf8');
const readJson = async (file) => JSON.parse(await read(file));
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);

const requiredRootFiles = new Set([
  'AGENTS.md',
  '.gitignore',
  'CNAME',
  'CONTRIBUTING.md',
  'EXECUTION-LEDGER.md',
  'README.md',
  'app.js',
  'index.html',
  'manifest.webmanifest',
  'nonstop-browser.js',
  'offline.html',
  'package.json',
  'player-continuity.js',
  'provider-runtime.js',
  'robots.txt',
  'simple-runtime.js',
  'sitemap.xml',
  'styles.css',
  'sw.js',
  'vercel.json',
  'youtube-player-runtime.js',
]);
const allowedRootDirs = new Set(['.github', '.raas', 'assets', 'data', 'docs', 'public-site', 'scripts', 'src', 'styles', '.worktrees', 'dist']);

for (const entry of await readdir(root, { withFileTypes: true })) {
  if (entry.name === '.git' || entry.name === 'node_modules') continue;
  if (entry.isDirectory()) {
    if (!allowedRootDirs.has(entry.name)) fail(`Unexpected root directory: ${entry.name}`);
    continue;
  }
  if (!requiredRootFiles.has(entry.name)) fail(`Unexpected root file: ${entry.name}`);
}
for (const file of requiredRootFiles) if (!await exists(file)) fail(`Missing required root file: ${file}`);

const rootJs = (await readdir(root)).filter((file) => file.endsWith('.js')).sort();
const expectedRootJs = ['app.js', 'nonstop-browser.js', 'player-continuity.js', 'provider-runtime.js', 'simple-runtime.js', 'sw.js', 'youtube-player-runtime.js'];
if (!same(rootJs, expectedRootJs)) {
  fail(`Root JavaScript must be production-only. Expected ${expectedRootJs.join(', ')}, found ${rootJs.join(', ')}`);
} else ok('root JavaScript is production-only');

const styleLayers = [
  '00-foundation-and-player.css',
  '10-browser-and-shell.css',
  '20-responsive-and-accessibility.css',
  '30-product-polish.css',
  '40-accessibility-states.css',
  '50-discovery-and-performance.css',
  '60-runtime-and-provider.css',
  '70-mobile-playback-coordination.css',
  '80-genre-icon-images.css',
];
const actualStyles = (await readdir(path.join(root, 'styles'))).filter((file) => file.endsWith('.css')).sort();
if (!same(actualStyles, styleLayers)) {
  fail(`Styles must use the ordered semantic layer set. Found: ${actualStyles.join(', ')}`);
} else ok('styles use ordered semantic filenames');
const styleEntry = await read('styles.css');
const expectedImports = styleLayers.map((file) => `@import url("styles/${file}");`).join('\n') + '\n';
if (styleEntry !== expectedImports) fail('styles.css import order does not match the semantic layer contract');

if (!await exists('assets/backgrounds/garba15-2k.zip')) fail('Canonical artwork pack assets/backgrounds/garba15-2k.zip is missing');
if (await exists('assets/backgrounds/garba15-2k-q82.zip')) fail('Legacy artwork alias garba15-2k-q82.zip must not coexist with the canonical filename');

const optionalFiles = [
  'catalogue-bootstrap.js',
  'direct-audio-bridge.js',
  'playback-bridge.js',
  'playback-prewarm.js',
  'playback-release-guard.js',
  'playback-routes.js',
  'ux-input.js',
  'ux-next.js',
  'ux-polish.js',
  'visual-library.js',
];
for (const file of optionalFiles) if (!await exists(`src/optional/${file}`)) fail(`Missing retained optional module: src/optional/${file}`);
if (!await exists('src/optional/README.md')) fail('src/optional/README.md must document the production boundary');
for (const file of [
  'src/catalogue/index.html',
  'src/catalogue/catalogue.css',
  'src/catalogue/catalogue.js',
  'data/release-artwork.json',
]) if (!await exists(file)) fail(`Missing catalogue product file: ${file}`);
if (await exists('scripts/lib/generate-static-catalogue-pages.mjs')) fail('Standalone song/release page generator must not remain active');

const expectedScriptEntrypoints = [
  'audit-direct-host-health.mjs',
  'audit-youtube-health.mjs',
  'build-catalogue.mjs',
  'build-vercel-site.mjs',
  'enforce-protected-main.mjs',
  'enrich-runtime-songs.mjs',
  'generate-licensing-request.mjs',
  'match-vendor-catalogue.mjs',
  'plan-direct-ingest.mjs',
  'raas-adaptive.mjs',
  'raas-adaptive.test.mjs',
  'raas-task.mjs',
  'raas-task.test.mjs',
  'report-hosting-readiness.mjs',
  'report-label-acquisition.mjs',
  'report-playback-route-quality.mjs',
  'report-youtube-first-coverage.mjs',
  'test-catalogue-matcher.mjs',
  'validate-contact-map.mjs',
  'validate-direct-audio.mjs',
  'validate-discovery.mjs',
  'validate-documentation.mjs',
  'validate-hosting-rights.mjs',
  'validate-master-intake.mjs',
  'validate-outreach-queue.mjs',
  'validate-player-continuity.mjs',
  'validate-publish-transaction.mjs',
  'validate-repository-structure.mjs',
  'validate-runtime-packaging.mjs',
  'validate-runtime-song-routes.mjs',
  'validate-simple-runtime.mjs',
  'validate-youtube-player-runtime.mjs',
];
const actualScriptEntrypoints = (await readdir(path.join(root, 'scripts'))).filter((file) => file.endsWith('.mjs')).sort();
if (!same(actualScriptEntrypoints, expectedScriptEntrypoints)) {
  fail(`scripts/ entry points drifted. Expected ${expectedScriptEntrypoints.join(', ')}, found ${actualScriptEntrypoints.join(', ')}`);
} else ok('scripts use one maintained action-oriented entry-point set');
if (!await exists('scripts/README.md')) fail('scripts/README.md must document tooling responsibilities and naming');
for (const stale of [
  'scripts/hosting-readiness.mjs',
  'scripts/label-acquisition-report.mjs',
  'scripts/validate.mjs',
  'scripts/validate-pages.mjs',
  'scripts/validate-playback.mjs',
  'scripts/validate-player.mjs',
  'scripts/validate-visuals.mjs',
]) if (await exists(stale)) fail(`Retired tooling must not remain executable in the active script directory: ${stale}`);

const docsTop = await readdir(path.join(root, 'docs'), { withFileTypes: true });
for (const entry of docsTop) {
  if (entry.isFile() && entry.name !== 'README.md') fail(`Documentation must be grouped by responsibility, found docs/${entry.name}`);
}
for (const folder of ['catalogue', 'operations', 'product', 'project', 'rights']) {
  if (!await exists(`docs/${folder}`)) fail(`Missing documentation responsibility folder: docs/${folder}`);
}

const catalogueIndex = await readJson('data/catalogue/index.json');
const discovery = catalogueIndex.discovery || {};
const discoveryArtists = discovery.artists || [];
const discoveryRecommendations = discovery.recommendations || [];
const requiredIndexedPaths = [
  ...(catalogueIndex.songChunks || []),
  ...(catalogueIndex.releaseChunks || []),
  ...(catalogueIndex.freeSourceChunks || []),
  ...(catalogueIndex.playbackSources || []),
  ...discoveryArtists,
  ...discoveryRecommendations,
  catalogueIndex.taxonomy,
  catalogueIndex.nonstopSets,
  discovery.setsIndex,
].filter(Boolean);
for (const file of requiredIndexedPaths) if (!await exists(file)) fail(`Catalogue manifest references missing file: ${file}`);

if (new Set(requiredIndexedPaths).size !== requiredIndexedPaths.length) fail('Catalogue manifest contains duplicate file references');
for (const file of discoveryArtists) {
  if (!/^data\/discovery\/artists-\d{4}-\d{2}\.json$/.test(file)) fail(`Discovery artist shard must use artists-YYYY-NN.json: ${file}`);
}
for (const file of discoveryRecommendations) {
  if (!/^data\/discovery\/recommendations-\d{4}-\d{2}\.json$/.test(file)) fail(`Discovery recommendation shard must use recommendations-YYYY-NN.json: ${file}`);
}
if (await exists('data/discovery/artists-2026.json')) fail('Legacy discovery filename artists-2026.json must be normalised to artists-2026-01.json');

const compareCanonicalDir = async (dir, indexed) => {
  const actual = (await readdir(path.join(root, dir))).filter((file) => file.endsWith('.json')).map((file) => `${dir}/${file}`).sort();
  const expected = indexed.filter((file) => file.startsWith(`${dir}/`)).sort();
  for (const file of actual) if (!expected.includes(file)) fail(`Unindexed canonical shard in ${dir}: ${file}`);
  for (const file of expected) if (!actual.includes(file)) fail(`Indexed shard missing from ${dir}: ${file}`);
};
await compareCanonicalDir('data/catalogue/songs', catalogueIndex.songChunks || []);
await compareCanonicalDir('data/catalogue/releases', catalogueIndex.releaseChunks || []);
await compareCanonicalDir('data/catalogue/free-sources', catalogueIndex.freeSourceChunks || []);

for (const file of [
  'data/catalogue/archive/README.md',
  'data/catalogue/archive/rangtaal-release-2025.json',
  'data/catalogue/archive/rangtaal-song-2025.json',
  'data/catalogue/archive/umesh-barot-garba-2022-2025.json',
  'data/README.md',
  'docs/README.md',
]) if (!await exists(file)) fail(`Missing repository organisation file: ${file}`);

const packageJson = await readJson('package.json');
const packageScripts = packageJson.scripts || {};
if (!packageScripts.catalogue?.includes('scripts/enrich-runtime-songs.mjs')) fail('npm run catalogue must retain runtime playback-route enrichment');
if (!packageScripts['playback:report']?.includes('scripts/report-playback-route-quality.mjs')) fail('playback:report must expose the ranked route-quality backlog');
if (!packageScripts['youtube:coverage']?.includes('scripts/report-youtube-first-coverage.mjs')) fail('youtube:coverage must expose the YouTube-first one-tap coverage baseline');
if (packageScripts['seo:check']) fail('Standalone song/release SEO generation must not return as seo:check');
if (!packageScripts['check:modules']?.includes('node --check src/catalogue/catalogue.js')) fail('check:modules must syntax-check the catalogue runtime');
if (!packageScripts.check?.includes('scripts/validate-player-continuity.mjs')) fail('npm run check must retain player-continuity validation');
if (!packageScripts.check?.includes('scripts/validate-runtime-packaging.mjs')) fail('npm run check must retain runtime packaging validation');
if (!packageScripts.check?.includes('scripts/validate-runtime-song-routes.mjs')) fail('npm run check must retain complete runtime song-route validation');
if (!packageScripts.check?.includes('scripts/validate-youtube-player-runtime.mjs')) fail('npm run check must retain YouTube player architecture validation');
if (!packageScripts.check?.includes('npm run repo:validate')) fail('npm run check must retain repository-structure validation');
if (!packageScripts.check?.includes('npm run docs:validate')) fail('npm run check must retain documentation validation');
if (JSON.stringify(packageScripts).includes('generate-static-catalogue-pages.mjs')) fail('Package scripts must not reference the retired standalone-page generator');
if (JSON.stringify(packageScripts).includes('label-acquisition-report.mjs')) fail('package scripts still reference retired label-acquisition-report.mjs');

const artwork = await readJson('data/release-artwork.json');
if (artwork.version !== 1 || typeof artwork.releases !== 'object' || !artwork.releases) fail('release-artwork.json must use the versioned verified-artwork manifest contract');

const cname = (await read('CNAME')).trim();
const robots = await read('robots.txt');
const sitemap = await read('sitemap.xml');
const index = await read('index.html');
const catalogueHtml = await read('src/catalogue/index.html');
const catalogueJs = await read('src/catalogue/catalogue.js');
if (cname !== 'playgarba.com') fail(`CNAME must be playgarba.com, found ${cname || '(empty)'}`);
if (!robots.includes('Sitemap: https://playgarba.com/sitemap.xml')) fail('robots.txt must advertise the PlayGarba sitemap');
if (!sitemap.includes('<loc>https://playgarba.com/</loc>')) fail('sitemap.xml must include the canonical PlayGarba root');
if (!sitemap.includes('<loc>https://playgarba.com/explore/</loc>')) fail('sitemap.xml must include the single catalogue page');
if (sitemap.includes('/songs/') || sitemap.includes('/releases/')) fail('sitemap must not advertise standalone song or release pages');
for (const marker of [
  '<link rel="canonical" href="https://playgarba.com/"',
  '<meta property="og:url" content="https://playgarba.com/"',
  '"url": "https://playgarba.com/"',
]) if (!index.includes(marker)) fail(`index.html missing production-domain marker: ${marker}`);
for (const marker of [
  '<link rel="canonical" href="https://playgarba.com/explore/"',
  'id="catalogueSections"',
  'id="collectionDetail"',
  'catalogue.js',
]) if (!catalogueHtml.includes(marker)) fail(`Catalogue page missing product marker: ${marker}`);
for (const marker of [
  "id:'nonstop'",
  "id:'live'",
  "id:'current'",
  "id:'classics'",
  "id:'dandiya-raas'",
  "id:'devotional'",
  "Artist essentials",
  "By era",
  'release-artwork.json',
]) if (!catalogueJs.includes(marker)) fail(`Catalogue runtime missing collection/artwork marker: ${marker}`);

const publicSiteFiles = [
  'public-site/index.html',
  'public-site/how-to-use/index.html',
  'public-site/install/index.html',
  'public-site/live/index.html',
  'public-site/faq/index.html',
  'public-site/about/index.html',
  'public-site/styles.css',
  'public-site/pages.css',
  'public-site/polish.css',
  'public-site/site.js',
  'public-site/pages.js',
  'public-site/robots.txt',
  'public-site/sitemap.xml',
];
for (const file of publicSiteFiles) if (!await exists(file)) fail(`Unified public-site bundle is missing: ${file}`);
const publicIndex = await read('public-site/index.html');
for (const marker of [
  '<link rel="canonical" href="https://playgarba.com/"',
  'https://playgarba.com/',
]) if (!publicIndex.includes(marker)) fail(`Public homepage missing production marker: ${marker}`);

const pages = await read('.github/workflows/pages.yml');
if (pages.includes('cp index.html *.js')) fail('Pages deployment must not copy JavaScript through a root glob');
for (const file of expectedRootJs) if (!pages.includes(file)) fail(`Pages workflow does not explicitly account for runtime file: ${file}`);
for (const file of ['robots.txt', 'sitemap.xml']) if (!pages.includes(file)) fail(`Pages build missing production-domain file: ${file}`);
for (const layer of styleLayers) if (!pages.includes(`styles/${layer}`)) fail(`Pages workflow missing style layer: ${layer}`);
if (!pages.includes("PACK='assets/backgrounds/garba15-2k.zip'")) fail('Pages workflow must use the canonical artwork-pack filename');
for (const action of ['actions/configure-pages@v5', 'actions/upload-pages-artifact@v4', 'actions/deploy-pages@v4']) if (!pages.includes(action)) fail(`Pages workflow must use ${action}`);
for (const marker of [
  'mkdir -p _site/catalogue',
  'cp src/catalogue/index.html _site/catalogue/index.html',
  'cp src/catalogue/catalogue.css _site/catalogue/catalogue.css',
  'cp src/catalogue/catalogue.js _site/catalogue/catalogue.js',
  'test ! -d _site/songs',
  'test ! -d _site/releases',
]) if (!pages.includes(marker)) fail(`Pages workflow missing single-page catalogue contract marker: ${marker}`);
if (pages.includes('generate-static-catalogue-pages.mjs') || pages.includes('SONG_PAGE_COUNT=') || pages.includes('RELEASE_PAGE_COUNT=')) fail('Pages workflow must not regenerate standalone song/release trees');

if (failed) process.exit(1);
ok('catalogue source directories contain only manifest-indexed shards');
ok('discovery shards use explicit ordered filenames and resolve through the manifest');
ok('unindexed historical catalogue fragments are isolated in archive/');
ok('documentation is grouped by responsibility');
ok('PlayGarba custom-domain and crawler files are source-controlled and deployment-validated');
ok('catalogue is one crawlable page with in-page collection, release and song states');
ok('verified album-artwork manifest is required and fake artwork is not part of the contract');
ok('standalone song/release SEO page generation is retired and guarded against');
ok('Pages deployment uses explicit runtime and stylesheet contracts');
ok('Vercel preview configuration is repository-approved while Pages remains canonical');
ok('single Pages artifact serves the player at the apex with legacy compatibility paths');
