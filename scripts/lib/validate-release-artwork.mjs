import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../..');
const readJson = async (file) => JSON.parse(await readFile(path.join(root, file), 'utf8'));

const manifest = await readJson('data/release-artwork.json');
const curation = await readJson('data/catalogue-curation.json');
const releases = await readJson('data/releases.json');
const releaseById = new Map(releases.filter((release) => release?.id).map((release) => [release.id, release]));
const allowedArtworkHosts = (host) => host === 'm.media-amazon.com' || host.endsWith('.mzstatic.com');
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
let failed = false;

const fail = (message) => {
  console.error(`✗ ${message}`);
  failed = true;
};

const assertHttpsUrl = (releaseId, field, value, { artwork = false } = {}) => {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:') fail(`${releaseId}: ${field} must use HTTPS`);
    if (artwork && !allowedArtworkHosts(url.hostname)) fail(`${releaseId}: unapproved artwork host ${url.hostname}`);
    return url;
  } catch {
    fail(`${releaseId}: ${field} must be a valid absolute URL`);
    return null;
  }
};

if (manifest.version !== 1 || !manifest.releases || typeof manifest.releases !== 'object' || Array.isArray(manifest.releases)) {
  fail('release-artwork.json must contain a version 1 releases object');
}

for (const [releaseId, entry] of Object.entries(manifest.releases || {})) {
  const release = releaseById.get(releaseId);
  if (!release) {
    fail(`Artwork references unknown release: ${releaseId}`);
    continue;
  }

  if (entry?.verified !== true) fail(`${releaseId}: artwork entries must be explicitly verified`);
  if (!entry?.sourceProvider || typeof entry.sourceProvider !== 'string') fail(`${releaseId}: sourceProvider is required`);
  if (!datePattern.test(String(entry?.verifiedAt || ''))) fail(`${releaseId}: verifiedAt must be YYYY-MM-DD`);

  assertHttpsUrl(releaseId, 'imageUrl', entry?.imageUrl, { artwork: true });
  assertHttpsUrl(releaseId, 'sourceUrl', entry?.sourceUrl);
  assertHttpsUrl(releaseId, 'canonicalSourceUrl', entry?.canonicalSourceUrl);

  if (!Array.isArray(entry?.verificationSources) || entry.verificationSources.length < 2) {
    fail(`${releaseId}: at least two release identity verification sources are required`);
  } else {
    for (const source of entry.verificationSources) {
      if (!source?.platform) fail(`${releaseId}: verification source platform is required`);
      assertHttpsUrl(releaseId, 'verification source URL', source?.url);
    }
  }

  const canonicalSources = new Set((release.sources || []).map((source) => source.url));
  if (!canonicalSources.has(entry.canonicalSourceUrl)) {
    fail(`${releaseId}: canonicalSourceUrl must be present in the canonical PlayGarba release sources`);
  }

  const verifiedSourceUrls = new Set((entry.verificationSources || []).map((source) => source.url));
  if (!verifiedSourceUrls.has(entry.sourceUrl)) fail(`${releaseId}: sourceUrl must appear in verificationSources`);
  if (!verifiedSourceUrls.has(entry.canonicalSourceUrl)) fail(`${releaseId}: canonicalSourceUrl must appear in verificationSources`);
  if (!(entry.verificationSources || []).some((source) => source.platform === entry.sourceProvider && source.url === entry.sourceUrl)) {
    fail(`${releaseId}: sourceProvider must identify the provider for sourceUrl`);
  }
}

if (curation.version !== 1 || !Array.isArray(curation.featuredReleaseIds)) {
  fail('catalogue-curation.json must contain a version 1 featuredReleaseIds array');
} else {
  const featured = curation.featuredReleaseIds;
  if (featured.length < 4 || featured.length > 12) fail('catalogue-curation.json must feature between 4 and 12 releases');
  if (new Set(featured).size !== featured.length) fail('catalogue-curation.json must not contain duplicate featured release IDs');
  for (const releaseId of featured) {
    if (!releaseById.has(releaseId)) fail(`Curated release does not exist in the canonical catalogue: ${releaseId}`);
    const art = manifest.releases?.[releaseId];
    if (!art?.imageUrl || art.verified !== true) fail(`Curated release must have verified artwork: ${releaseId}`);
  }
}

if (failed) process.exit(1);
console.log(`✓ verified release artwork manifest: ${Object.keys(manifest.releases || {}).length} release covers`);
console.log(`✓ curated essential releases: ${(curation.featuredReleaseIds || []).length}`);
