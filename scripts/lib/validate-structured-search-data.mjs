import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateSearchSurfaces } from './validate-search-surfaces.mjs';

const CANONICAL_ORIGIN = 'https://playgarba.com';
const DEFAULT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function decodeHtml(value = '') {
  return String(value)
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');
}

function parseAttributes(tag = '') {
  const attrs = new Map();
  const source = String(tag).replace(/^<\/?[a-z0-9:-]+\s*/i, '').replace(/\/?\s*>$/, '');
  const pattern = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  for (const match of source.matchAll(pattern)) {
    attrs.set(match[1].toLowerCase(), decodeHtml(match[2] ?? match[3] ?? match[4] ?? ''));
  }
  return attrs;
}

export function extractJsonLdBlocks(html = '') {
  const blocks = [];
  const pattern = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  for (const match of String(html).matchAll(pattern)) {
    const attrs = parseAttributes(`<script${match[1]}>`);
    if (String(attrs.get('type') || '').toLowerCase() !== 'application/ld+json') continue;
    blocks.push(match[2].trim());
  }
  return blocks;
}

function canonicalFromHtml(html = '') {
  for (const match of String(html).matchAll(/<link\b([^>]*)>/gi)) {
    const attrs = parseAttributes(`<link${match[1]}>`);
    const rel = String(attrs.get('rel') || '').toLowerCase().split(/\s+/).filter(Boolean);
    if (!rel.includes('canonical')) continue;
    const href = String(attrs.get('href') || '').trim();
    if (href) return href;
  }
  return '';
}

function typeValues(value) {
  if (typeof value === 'string' && value.trim()) return [value.trim()];
  if (Array.isArray(value)) return value.filter((item) => typeof item === 'string' && item.trim()).map((item) => item.trim());
  return [];
}

function objectLabel(label, index) {
  return `${label} JSON-LD object ${index + 1}`;
}

function asIdentityUrl(value) {
  if (typeof value === 'string') return value.trim();
  if (value && typeof value === 'object' && !Array.isArray(value) && typeof value['@id'] === 'string') return value['@id'].trim();
  return '';
}

function validateIdentityUrl(raw, label, errors) {
  if (!raw) return null;
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    errors.push(`${label}: identity URL must be absolute: ${raw}`);
    return null;
  }
  if (parsed.protocol !== 'https:') errors.push(`${label}: identity URL must use https: ${raw}`);
  if (parsed.origin !== CANONICAL_ORIGIN) errors.push(`${label}: identity URL must use ${CANONICAL_ORIGIN}: ${raw}`);
  if (parsed.search || parsed.hash) errors.push(`${label}: identity URL must not contain query/hash state: ${raw}`);
  if (parsed.pathname !== '/' && !parsed.pathname.endsWith('/')) errors.push(`${label}: identity page URL must end with '/': ${raw}`);
  if (parsed.pathname.includes('//')) errors.push(`${label}: identity path must not contain duplicate slashes: ${raw}`);
  return parsed;
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (!value || typeof value !== 'object') return JSON.stringify(value);
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
}

function validateBreadcrumbList(node, canonical, label, errors) {
  if (!typeValues(node['@type']).includes('BreadcrumbList')) return;
  const items = node.itemListElement;
  if (!Array.isArray(items) || !items.length) {
    errors.push(`${label}: BreadcrumbList must contain itemListElement entries`);
    return;
  }
  const finalItem = items.at(-1);
  const finalUrl = asIdentityUrl(finalItem?.item);
  if (!finalUrl) {
    errors.push(`${label}: final BreadcrumbList item must expose an item URL`);
    return;
  }
  validateIdentityUrl(finalUrl, `${label} final breadcrumb`, errors);
  if (canonical && finalUrl !== canonical) {
    errors.push(`${label}: final breadcrumb item must equal page canonical (${finalUrl} != ${canonical})`);
  }
}

function validateArticle(node, canonical, label, errors) {
  const types = typeValues(node['@type']);
  if (!types.some((type) => ['Article', 'NewsArticle', 'BlogPosting'].includes(type))) return;
  if (!Object.prototype.hasOwnProperty.call(node, 'mainEntityOfPage')) return;
  const mainEntity = asIdentityUrl(node.mainEntityOfPage);
  if (!mainEntity) {
    errors.push(`${label}: Article mainEntityOfPage must be a URL or @id object`);
    return;
  }
  validateIdentityUrl(mainEntity, `${label} mainEntityOfPage`, errors);
  if (canonical && mainEntity !== canonical) {
    errors.push(`${label}: Article mainEntityOfPage must equal page canonical (${mainEntity} != ${canonical})`);
  }
}

function validateNodeUrls(node, label, errors, seenObjects = new Set()) {
  if (!node || typeof node !== 'object') return;
  if (seenObjects.has(node)) return;
  seenObjects.add(node);

  if (Array.isArray(node)) {
    node.forEach((item) => validateNodeUrls(item, label, errors, seenObjects));
    return;
  }

  for (const key of ['url', '@id']) {
    if (!Object.prototype.hasOwnProperty.call(node, key)) continue;
    const raw = asIdentityUrl(node[key]);
    if (!raw) errors.push(`${label}: ${key} must be a URL string when present`);
    else validateIdentityUrl(raw, `${label} ${key}`, errors);
  }

  for (const value of Object.values(node)) validateNodeUrls(value, label, errors, seenObjects);
}

function flattenTypedObjects(document, label, errors) {
  if (!document || typeof document !== 'object' || Array.isArray(document)) {
    errors.push(`${label}: JSON-LD top level must be an object`);
    return [];
  }

  if (Object.prototype.hasOwnProperty.call(document, '@context') && document['@context'] !== 'https://schema.org') {
    errors.push(`${label}: @context must be https://schema.org`);
  }

  if (Object.prototype.hasOwnProperty.call(document, '@graph')) {
    if (!Array.isArray(document['@graph']) || !document['@graph'].length) {
      errors.push(`${label}: @graph must contain at least one object`);
      return [];
    }
    return document['@graph'].map((node, index) => {
      if (!node || typeof node !== 'object' || Array.isArray(node)) {
        errors.push(`${label}: @graph member ${index + 1} must be an object`);
        return null;
      }
      if (!typeValues(node['@type']).length) errors.push(`${label}: @graph member ${index + 1} must have a non-empty @type`);
      return node;
    }).filter(Boolean);
  }

  if (!typeValues(document['@type']).length) errors.push(`${label}: top-level object must have a non-empty @type`);
  return [document];
}

export function validateStructuredDataHtml({ html, canonical, label = 'page' }) {
  const errors = [];
  const warnings = [];
  const blocks = extractJsonLdBlocks(html);
  const identities = new Map();
  let objectCount = 0;

  blocks.forEach((raw, blockIndex) => {
    const blockLabel = `${label} JSON-LD block ${blockIndex + 1}`;
    let document;
    try {
      document = JSON.parse(raw);
    } catch (error) {
      errors.push(`${blockLabel}: invalid JSON (${error instanceof Error ? error.message : String(error)})`);
      return;
    }

    const objects = flattenTypedObjects(document, blockLabel, errors);
    for (const node of objects) {
      const nodeLabel = objectLabel(blockLabel, objectCount);
      objectCount += 1;
      validateNodeUrls(node, nodeLabel, errors);
      validateArticle(node, canonical, nodeLabel, errors);
      validateBreadcrumbList(node, canonical, nodeLabel, errors);

      const id = typeof node['@id'] === 'string' ? node['@id'].trim() : '';
      if (!id) continue;
      const fingerprint = stableJson(node);
      if (identities.has(id) && identities.get(id) !== fingerprint) {
        errors.push(`${label}: duplicate @id ${id} has conflicting JSON-LD objects`);
      } else {
        identities.set(id, fingerprint);
      }
    }
  });

  return { ok: errors.length === 0, errors, warnings, blockCount: blocks.length, objectCount };
}

export function validateStructuredSearchData(rootDir = DEFAULT_ROOT, { quiet = false } = {}) {
  const root = path.resolve(rootDir);
  const errors = [];
  const warnings = [];
  const surfaceResult = validateSearchSurfaces(root, { quiet: true });
  if (!surfaceResult.ok) {
    errors.push(...surfaceResult.errors.map((error) => `search-surface prerequisite: ${error}`));
  }

  let pagesWithStructuredData = 0;
  let structuredObjects = 0;
  for (const route of surfaceResult.routes) {
    const source = path.join(root, route.source);
    if (!fs.existsSync(source)) continue;
    const html = fs.readFileSync(source, 'utf8');
    const canonical = route.canonical || canonicalFromHtml(html);
    const result = validateStructuredDataHtml({ html, canonical, label: `${route.route} (${route.source})` });
    if (result.blockCount) pagesWithStructuredData += 1;
    structuredObjects += result.objectCount;
    errors.push(...result.errors);
    warnings.push(...result.warnings);
  }

  const result = {
    ok: errors.length === 0,
    errors,
    warnings,
    pageCount: surfaceResult.routes.length,
    pagesWithStructuredData,
    structuredObjects,
  };

  if (!quiet) {
    if (errors.length) {
      console.error(`✗ Structured search-data validation failed with ${errors.length} error${errors.length === 1 ? '' : 's'}:`);
      errors.forEach((error) => console.error(`  - ${error}`));
    } else {
      console.log(`✓ Structured search data valid: ${pagesWithStructuredData}/${surfaceResult.routes.length} deployed routes publish ${structuredObjects} typed object(s).`);
    }
    warnings.forEach((warning) => console.warn(`! ${warning}`));
  }
  return result;
}

const isDirect = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirect) {
  const result = validateStructuredSearchData(process.argv[2] || DEFAULT_ROOT);
  if (!result.ok) process.exitCode = 1;
}
