#!/usr/bin/env node

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { renderSearchSitemap, validateSearchSurfacePolicy } from './validate-search-surface-policy.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const policyPath = path.join(root, 'data/search-surface-policy.json');
const sitemapPath = path.join(root, 'sitemap.xml');

function fail(message) {
  console.error(`✗ ${message}`);
  process.exitCode = 1;
}

const args = process.argv.slice(2);
const allowedArgs = new Set(['--check', '--write']);
const unknownArgs = args.filter((arg) => !allowedArgs.has(arg));
const check = args.includes('--check');
const write = args.includes('--write');

if (unknownArgs.length) {
  fail(`Unknown argument(s): ${unknownArgs.join(', ')}`);
} else if (check && write) {
  fail('Use either --check or --write, not both.');
} else {
  const policy = JSON.parse(await readFile(policyPath, 'utf8'));
  const generated = renderSearchSitemap(policy);
  const validation = validateSearchSurfacePolicy({ policy, sitemapXml: generated });

  if (!validation.ok) {
    fail(`Search-surface policy cannot generate a valid sitemap:\n${validation.errors.join('\n')}`);
  } else if (check) {
    const committed = await readFile(sitemapPath, 'utf8');
    if (committed !== generated) {
      fail('sitemap.xml is stale. Run `node scripts/lib/generate-search-sitemap.mjs --write` and review the diff.');
    } else {
      console.log(`✓ sitemap.xml matches ${validation.publishedRoutes.length} published search routes.`);
    }
  } else if (write) {
    await writeFile(sitemapPath, generated, 'utf8');
    console.log(`✓ Wrote sitemap.xml from ${validation.publishedRoutes.length} published search routes.`);
  } else {
    process.stdout.write(generated);
  }
}
