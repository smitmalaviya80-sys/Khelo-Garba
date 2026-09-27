import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { dirname, join, relative } from 'node:path';

const ROOT = process.cwd();
const OUT = join(ROOT, '_site');

function fail(message) {
  throw new Error(message);
}

function ensureDir(path) {
  mkdirSync(path, { recursive: true });
}

function copy(sourceRelative, destinationRelative = sourceRelative) {
  const source = join(ROOT, sourceRelative);
  const destination = join(OUT, destinationRelative);
  if (!existsSync(source)) fail(`Missing source path: ${sourceRelative}`);
  ensureDir(dirname(destination));
  cpSync(source, destination, { recursive: true, force: true });
}

function run(command, args, options = {}) {
  execFileSync(command, args, {
    cwd: ROOT,
    stdio: 'inherit',
    ...options,
  });
}

function commandWorks(command, args = ['--version']) {
  const result = spawnSync(command, args, { cwd: ROOT, stdio: 'ignore' });
  return !result.error && result.status === 0;
}

function ensureBuildTools() {
  const packages = [];
  if (!commandWorks('rsvg-convert')) packages.push('librsvg2-tools');
  if (!commandWorks('unzip', ['-v'])) packages.push('unzip');
  if (!packages.length) return;

  if (!commandWorks('dnf', ['--version'])) {
    fail(
      `Missing required build tools and dnf is unavailable. Install: ${packages.join(', ')}`,
    );
  }

  const uniquePackages = [...new Set(packages)];
  console.log(`Installing Vercel build tools: ${uniquePackages.join(', ')}`);
  run('dnf', ['install', '-y', ...uniquePackages]);

  if (!commandWorks('rsvg-convert')) fail('rsvg-convert is unavailable after package install.');
  if (!commandWorks('unzip', ['-v'])) fail('unzip is unavailable after package install.');
}

function concatFiles(sources, destinationRelative) {
  const destination = join(OUT, destinationRelative);
  ensureDir(dirname(destination));
  const content = sources.map((source) => readFileSync(join(ROOT, source))).map((buffer) => buffer.toString('utf8')).join('');
  writeFileSync(destination, content);
}

function pngDimensions(buffer) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (buffer.length < 24 || !buffer.subarray(0, 8).equals(signature)) {
    fail('Expected a PNG image.');
  }
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

function buildIco(entries, outputPath) {
  const images = entries.map(({ path, width, height }) => {
    const data = readFileSync(path);
    const dimensions = pngDimensions(data);
    if (dimensions.width !== width || dimensions.height !== height) {
      fail(`ICO source has wrong dimensions: ${relative(ROOT, path)} (${dimensions.width}x${dimensions.height})`);
    }
    return { data, width, height };
  });

  const headerSize = 6;
  const entrySize = 16;
  let offset = headerSize + entrySize * images.length;
  const header = Buffer.alloc(headerSize);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);

  const directory = Buffer.alloc(entrySize * images.length);
  images.forEach((image, index) => {
    const base = index * entrySize;
    directory.writeUInt8(image.width === 256 ? 0 : image.width, base);
    directory.writeUInt8(image.height === 256 ? 0 : image.height, base + 1);
    directory.writeUInt8(0, base + 2);
    directory.writeUInt8(0, base + 3);
    directory.writeUInt16LE(1, base + 4);
    directory.writeUInt16LE(32, base + 6);
    directory.writeUInt32LE(image.data.length, base + 8);
    directory.writeUInt32LE(offset, base + 12);
    offset += image.data.length;
  });

  writeFileSync(outputPath, Buffer.concat([header, directory, ...images.map((image) => image.data)]));
}

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function resolveBuildSha() {
  const candidates = [
    process.env.VERCEL_GIT_COMMIT_SHA,
    process.env.GITHUB_SHA,
  ];
  for (const candidate of candidates) {
    if (/^[0-9a-f]{40}$/i.test(candidate || '')) return candidate.toLowerCase();
  }
  return execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: ROOT,
    encoding: 'utf8',
  }).trim();
}

function renderSvg(source, destination, width, height) {
  ensureDir(dirname(destination));
  run('rsvg-convert', [
    '-w',
    String(width),
    '-h',
    String(height),
    source,
    '-o',
    destination,
  ]);
  const dimensions = pngDimensions(readFileSync(destination));
  if (dimensions.width !== width || dimensions.height !== height) {
    fail(`Rendered icon has wrong dimensions: ${relative(ROOT, destination)}`);
  }
}

function prepareStaticSite() {
  rmSync(OUT, { recursive: true, force: true });
  ensureDir(OUT);

  for (const file of [
    'CNAME',
    'robots.txt',
    'sitemap.xml',
    'index.html',
    'app.js',
    'simple-runtime.js',
    'provider-runtime.js',
    'player-continuity.js',
    'youtube-player-runtime.js',
    'nonstop-browser.js',
    'sw.js',
    'manifest.webmanifest',
    'offline.html',
  ]) {
    copy(file);
  }
  copy('public-site/404.html', '404.html');
  copy('assets');
  copy('data');

  concatFiles(
    [
      'app.js',
      'assets/runtime/seek-state.js',
      'assets/runtime/continuous-set-state.js',
    ],
    'app.js',
  );
  const deployedApp = readFileSync(join(OUT, 'app.js'), 'utf8');
  if (!deployedApp.includes('GARBA_SEEK_STATE_RUNTIME')) fail('Seek-state runtime missing from deployed app.js.');
  if (!deployedApp.includes('GARBA_CONTINUOUS_SET_RUNTIME')) fail('Continuous-set runtime missing from deployed app.js.');

  for (const route of ['catalogue', 'explore']) {
    ensureDir(join(OUT, route));
    copy('src/catalogue/index.html', `${route}/index.html`);
    copy('src/catalogue/catalogue.css', `${route}/catalogue.css`);
    copy('src/catalogue/catalogue.js', `${route}/catalogue.js`);
    copy('src/catalogue/listening-library.js', `${route}/listening-library.js`);
    copy('src/catalogue/explore-continuity-bridge.js', `${route}/explore-continuity-bridge.js`);
  }

  run('node', [
    'scripts/lib/validate-pages-explore-telemetry.mjs',
    '--publish-and-validate',
    '_site',
  ]);

  for (const route of [
    'about',
    'dandiya-raas',
    'faq',
    'garba-attire-and-craft',
    'garba-music',
    'garba-vs-dandiya',
    'garbo',
    'history-of-garba',
    'how-to-use',
    'install',
    'learn',
    'live',
    'navratri-2026',
    'navratri-and-garba',
    'what-is-garba',
  ]) {
    copy(`public-site/${route}`, route);
  }

  for (const file of [
    'editorial.css',
    'pages.css',
    'polish.css',
    'site.js',
    'pages.js',
  ]) {
    copy(`public-site/${file}`, file);
  }

  concatFiles(
    [
      'styles/00-foundation-and-player.css',
      'styles/10-browser-and-shell.css',
      'styles/20-responsive-and-accessibility.css',
      'styles/30-product-polish.css',
      'styles/40-accessibility-states.css',
      'styles/50-discovery-and-performance.css',
      'styles/60-runtime-and-provider.css',
      'styles/70-mobile-playback-coordination.css',
      'styles/80-genre-icon-images.css',
    ],
    'styles.css',
  );

  ensureBuildTools();

  const iconDir = join(OUT, 'assets/icons');
  const iconSource = join(ROOT, 'assets/icons/icon.svg');
  const maskableSource = join(ROOT, 'assets/icons/maskable.svg');
  const iconTargets = [
    ['favicon-16.png', 16, 16, iconSource],
    ['favicon-32.png', 32, 32, iconSource],
    ['favicon-48.png', 48, 48, iconSource],
    ['apple-touch-icon-152.png', 152, 152, iconSource],
    ['apple-touch-icon-167.png', 167, 167, iconSource],
    ['apple-touch-icon.png', 180, 180, iconSource],
    ['icon-192.png', 192, 192, iconSource],
    ['icon-512.png', 512, 512, iconSource],
    ['mstile-150x150.png', 150, 150, iconSource],
    ['mstile-310x310.png', 310, 310, iconSource],
    ['maskable-192.png', 192, 192, maskableSource],
    ['maskable-512.png', 512, 512, maskableSource],
  ];
  for (const [name, width, height, source] of iconTargets) {
    renderSvg(source, join(iconDir, name), width, height);
  }

  buildIco(
    [
      { path: join(iconDir, 'favicon-16.png'), width: 16, height: 16 },
      { path: join(iconDir, 'favicon-32.png'), width: 32, height: 32 },
      { path: join(iconDir, 'favicon-48.png'), width: 48, height: 48 },
    ],
    join(OUT, 'favicon.ico'),
  );

  const backgroundsDir = join(OUT, 'assets/backgrounds');
  const libraryDir = join(backgroundsDir, 'library');
  rmSync(libraryDir, { recursive: true, force: true });
  ensureDir(libraryDir);

  const packCandidates = [
    ['assets/backgrounds/garba15-2048-q90.zip', '4690046d30ecd5400b3fc953a2a93f877d64921a69955d2b5dc6aa0bd65a769d'],
    ['assets/backgrounds/garba15-2k.zip', null],
    ['assets/backgrounds/garba15-2k-q82.zip', null],
  ];
  const selectedPack = packCandidates.find(([path]) => existsSync(join(ROOT, path)));
  if (!selectedPack) fail('Required 15-image WebP pack is missing.');

  const [packRelative, expectedHash] = selectedPack;
  const packPath = join(ROOT, packRelative);
  if (expectedHash && sha256(packPath) !== expectedHash) {
    fail(`Background pack checksum mismatch: ${packRelative}`);
  }
  console.log(`Deploying visual pack: ${packRelative}`);
  run('unzip', ['-oq', packPath, '-d', libraryDir]);

  const webps = readdirSync(libraryDir).filter((name) => name.endsWith('.webp')).sort();
  if (webps.length !== 15) fail(`Expected 15 WebPs, found ${webps.length}.`);

  for (const file of readdirSync(backgroundsDir)) {
    if (/^garba15-.*\.zip$/i.test(file)) {
      rmSync(join(backgroundsDir, file), { force: true });
    }
  }

  const ogCard = join(OUT, 'assets/social/garba-og-card.png');
  if (!existsSync(ogCard)) fail('Committed universal social card is missing.');
  const ogDimensions = pngDimensions(readFileSync(ogCard));
  if (ogDimensions.width !== 1200 || ogDimensions.height !== 630) {
    fail(`Social preview must be 1200x630, got ${ogDimensions.width}x${ogDimensions.height}.`);
  }

  run('node', ['scripts/lib/inject-social-preview.mjs', '_site']);
  run('node', ['scripts/lib/inject-brand-metadata.mjs', '_site']);

  const buildSha = resolveBuildSha();
  run('node', ['scripts/lib/generate-build-info.mjs', '_site/build-info.json', buildSha, '_site']);
  run('node', ['scripts/lib/validate-build-info.mjs', '_site/build-info.json', buildSha]);

  writeFileSync(join(OUT, '.nojekyll'), '');
  run('node', ['scripts/lib/validate-vercel-site.mjs', '_site', 'vercel.json']);
  console.log(`Vercel static artifact ready at ${relative(ROOT, OUT)} for ${buildSha}.`);
}

prepareStaticSite();
