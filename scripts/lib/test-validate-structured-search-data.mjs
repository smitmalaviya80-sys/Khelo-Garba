import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { validateStructuredDataHtml } from './validate-structured-search-data.mjs';

const CANONICAL = 'https://playgarba.com/guide/';

function htmlWith(documentText, canonical = CANONICAL) {
  return `<!doctype html><html><head><link rel="canonical" href="${canonical}"><script type="application/ld+json">${documentText}</script></head><body><h1>Guide</h1></body></html>`;
}

function expectValid(name, documentText) {
  const result = validateStructuredDataHtml({ html: htmlWith(documentText), canonical: CANONICAL, label: name });
  assert.equal(result.ok, true, `${name}: ${result.errors.join(' | ')}`);
}

function expectInvalid(name, documentText, expected) {
  const result = validateStructuredDataHtml({ html: htmlWith(documentText), canonical: CANONICAL, label: name });
  assert.equal(result.ok, false, `${name}: expected failure`);
  assert.match(result.errors.join('\n'), expected, `${name}: ${result.errors.join(' | ')}`);
}

export function runStructuredSearchDataSelfTests() {
  expectValid('valid representative graph', JSON.stringify({
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Article',
        headline: 'Guide',
        mainEntityOfPage: CANONICAL,
        publisher: { '@type': 'Organization', name: 'PlayGarba', url: 'https://playgarba.com/' },
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'PlayGarba', item: 'https://playgarba.com/' },
          { '@type': 'ListItem', position: 2, name: 'Guide', item: CANONICAL },
        ],
      },
    ],
  }));

  expectInvalid('invalid JSON', '{"@context":"https://schema.org",', /invalid JSON/);

  expectInvalid('wrong context', JSON.stringify({
    '@context': 'http://schema.org',
    '@type': 'Article',
    mainEntityOfPage: CANONICAL,
  }), /@context must be https:\/\/schema\.org/);

  expectInvalid('off-origin identity', JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    url: 'https://example.com/guide/',
  }), /identity URL must use https:\/\/playgarba\.com/);

  expectInvalid('article canonical mismatch', JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'Article',
    mainEntityOfPage: 'https://playgarba.com/other/',
  }), /Article mainEntityOfPage must equal page canonical/);

  expectInvalid('breadcrumb canonical mismatch', JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'PlayGarba', item: 'https://playgarba.com/' },
      { '@type': 'ListItem', position: 2, name: 'Wrong', item: 'https://playgarba.com/other/' },
    ],
  }), /final breadcrumb item must equal page canonical/);

  expectInvalid('graph member missing type', JSON.stringify({
    '@context': 'https://schema.org',
    '@graph': [
      { headline: 'Untyped object', mainEntityOfPage: CANONICAL },
    ],
  }), /@graph member 1 must have a non-empty @type/);

  return 7;
}

const isDirect = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isDirect) {
  const count = runStructuredSearchDataSelfTests();
  console.log(`✓ Structured search-data self-tests passed (${count} cases).`);
}
