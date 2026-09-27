import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { validateSearchSurfacePolicy } from './validate-search-surface-policy.mjs';
import { runSearchSurfacePolicySelfTests } from './test-validate-search-surface-policy.mjs';
import { validateSearchSurfaces } from './validate-search-surfaces.mjs';
import { validateStructuredSearchData } from './validate-structured-search-data.mjs';
import { runStructuredSearchDataSelfTests } from './test-validate-structured-search-data.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const exists = async (file) => {
  try { await access(path.join(root, file)); return true; }
  catch { return false; }
};
const read = (file) => readFile(path.join(root, file), 'utf8');
const readJson = async (file) => JSON.parse(await read(file));

export function classifyHostOwnership({
  cnameContent = '',
  hasVercelConfig = false,
  hasVercelMetadata = false,
} = {}) {
  const cname = String(cnameContent || '').trim();
  const errors = [];

  if (hasVercelMetadata) {
    errors.push('.vercel/ must not remain in the production source');
  }

  if (cname && cname !== 'playgarba.com') {
    errors.push(`CNAME must be playgarba.com while GitHub Pages owns the canonical domain, got ${cname}`);
  }

  if (!cname && !hasVercelConfig) {
    errors.push('no production hosting source is declared: CNAME is absent and vercel.json is missing');
  }

  if (errors.length) {
    return {
      ok: false,
      state: 'invalid',
      canonicalSource: null,
      errors,
    };
  }

  if (cname === 'playgarba.com' && hasVercelConfig) {
    return {
      ok: true,
      state: 'pages-canonical-vercel-preview',
      canonicalSource: 'github-pages',
      errors: [],
    };
  }

  if (cname === 'playgarba.com') {
    return {
      ok: true,
      state: 'pages-only',
      canonicalSource: 'github-pages',
      errors: [],
    };
  }

  return {
    ok: true,
    state: 'vercel-source',
    canonicalSource: 'vercel',
    errors: [],
  };
}

function hostStateMessage(hostState) {
  switch (hostState.state) {
    case 'pages-only':
      return 'GitHub Pages owns the canonical PlayGarba source at playgarba.com; no Vercel source config is present';
    case 'pages-canonical-vercel-preview':
      return 'GitHub Pages still owns playgarba.com while Vercel preview configuration is staged; source state does not claim DNS cutover';
    case 'vercel-source':
      return 'Vercel owns the repository production source after Pages CNAME removal; external custom-domain and HTTPS verification are still required';
    default:
      return 'production hosting source state is invalid';
  }
}

export async function validateHostOwnership() {
  let failed = false;
  const fail = (message) => { console.error(`✗ ${message}`); failed = true; };

  const cnameContent = (await exists('CNAME')) ? await read('CNAME') : '';
  const hostState = classifyHostOwnership({
    cnameContent,
    hasVercelConfig: await exists('vercel.json'),
    hasVercelMetadata: await exists('.vercel'),
  });

  for (const error of hostState.errors) fail(error);
  if (hostState.ok) console.log(`✓ hosting source state: ${hostStateMessage(hostState)}`);

  try {
    const count = runSearchSurfacePolicySelfTests();
    console.log(`✓ search-surface policy regression tests passed (${count} cases)`);
  } catch (error) {
    fail(`search-surface policy self-test failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  try {
    const policy = await readJson('data/search-surface-policy.json');
    const sitemapXml = await read('sitemap.xml');
    const result = validateSearchSurfacePolicy({ policy, sitemapXml });
    for (const error of result.errors) fail(`search-surface policy: ${error}`);
    for (const warning of result.warnings) console.warn(`! search-surface policy: ${warning}`);
    if (result.ok) console.log(`✓ search-surface policy admits all ${result.sitemapRoutes.length} canonical sitemap route(s)`);
  } catch (error) {
    fail(`search-surface policy could not be evaluated: ${error instanceof Error ? error.message : String(error)}`);
  }

  try {
    await import('./test-validate-search-surfaces.mjs');
  } catch (error) {
    fail(`search-surface validator self-test failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  try {
    const result = validateSearchSurfaces(root, { quiet: true });
    for (const error of result.errors) fail(`search surfaces: ${error}`);
    for (const warning of result.warnings) console.warn(`! search surfaces: ${warning}`);
    if (result.ok) console.log(`✓ search surfaces valid: ${result.routes.length} deployed route(s), ${result.sitemapUrls.length} sitemap URL(s)`);
  } catch (error) {
    fail(`search-surface validation could not run: ${error instanceof Error ? error.message : String(error)}`);
  }

  try {
    const count = runStructuredSearchDataSelfTests();
    console.log(`✓ structured search-data regression tests passed (${count} cases)`);
  } catch (error) {
    fail(`structured search-data self-test failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  try {
    const result = validateStructuredSearchData(root, { quiet: true });
    for (const error of result.errors) fail(`structured search data: ${error}`);
    for (const warning of result.warnings) console.warn(`! structured search data: ${warning}`);
    if (result.ok) console.log(`✓ structured search data valid: ${result.pagesWithStructuredData}/${result.pageCount} deployed route(s), ${result.structuredObjects} typed object(s)`);
  } catch (error) {
    fail(`structured search-data validation could not run: ${error instanceof Error ? error.message : String(error)}`);
  }

  if (failed) return { ok: false, hostState };
  console.log(`✓ hosting ownership validated: ${hostStateMessage(hostState)}`);
  return { ok: true, hostState };
}

const invokedUrl = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href
  : null;

if (invokedUrl === import.meta.url) {
  const result = await validateHostOwnership();
  if (!result.ok) process.exitCode = 1;
}
