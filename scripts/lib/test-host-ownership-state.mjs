import assert from 'node:assert/strict';
import { classifyHostOwnership } from './validate-host-ownership.mjs';

const cases = [
  {
    name: 'Pages-only production remains valid before Vercel preparation',
    input: { cnameContent: 'playgarba.com\n', hasVercelConfig: false, hasVercelMetadata: false },
    expected: { ok: true, state: 'pages-only', canonicalSource: 'github-pages' },
  },
  {
    name: 'Pages stays canonical while Vercel preview config is staged',
    input: { cnameContent: 'playgarba.com\n', hasVercelConfig: true, hasVercelMetadata: false },
    expected: { ok: true, state: 'pages-canonical-vercel-preview', canonicalSource: 'github-pages' },
  },
  {
    name: 'Vercel source ownership is valid only after Pages CNAME removal',
    input: { cnameContent: '', hasVercelConfig: true, hasVercelMetadata: false },
    expected: { ok: true, state: 'vercel-source', canonicalSource: 'vercel' },
  },
  {
    name: 'missing both hosting declarations fails closed',
    input: { cnameContent: '', hasVercelConfig: false, hasVercelMetadata: false },
    expected: { ok: false, state: 'invalid', canonicalSource: null },
  },
  {
    name: 'unexpected Pages CNAME fails closed',
    input: { cnameContent: 'www.playgarba.com', hasVercelConfig: true, hasVercelMetadata: false },
    expected: { ok: false, state: 'invalid', canonicalSource: null },
  },
  {
    name: 'local Vercel metadata is never committed as hosting ownership evidence',
    input: { cnameContent: 'playgarba.com', hasVercelConfig: true, hasVercelMetadata: true },
    expected: { ok: false, state: 'invalid', canonicalSource: null },
  },
];

for (const testCase of cases) {
  const result = classifyHostOwnership(testCase.input);
  assert.equal(result.ok, testCase.expected.ok, `${testCase.name}: ok`);
  assert.equal(result.state, testCase.expected.state, `${testCase.name}: state`);
  assert.equal(result.canonicalSource, testCase.expected.canonicalSource, `${testCase.name}: canonicalSource`);
  if (!result.ok) assert.ok(result.errors.length > 0, `${testCase.name}: invalid states must explain why`);
  console.log(`✓ ${testCase.name}`);
}

console.log(`✓ hosting source transition policy regression tests passed (${cases.length} cases)`);
