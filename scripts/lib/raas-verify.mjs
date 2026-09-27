import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const REQUIRED_RAAS_FILES = Object.freeze([
  '.raas/BOOTSTRAP.md',
  '.raas/RAAS.md',
  '.raas/PROJECT-CONTEXT.md',
  '.raas/EXECUTION.md',
  '.raas/LANGUAGE.md',
  '.raas/CLIENTS.md',
  '.raas/AUTONOMY.md',
  '.raas/autonomy.json',
  '.raas/clients/chatgpt.md',
  '.raas/clients/codex.md',
  '.raas/clients/cursor.md',
  '.raas/clients/generic.md',
  '.raas/config.json',
]);

const REFERENCE_DOCS = Object.freeze(REQUIRED_RAAS_FILES.filter((file) => file.endsWith('.md')));
const ROOT_REFERENCES = new Set(['AGENTS.md', 'README.md', 'package.json']);
const REQUIRED_LOCAL_AUTHORITIES = Object.freeze([
  'productTruth',
  'issueOwnership',
  'branchOwnership',
  'fileOwnership',
  'graphVocabulary',
  'contextCompiler',
  'uiUxRules',
  'validation',
  'release',
]);
const REQUIRED_FORBIDDEN_FEDERATION = Object.freeze([
  'active-claims',
  'locks',
  'project-truth',
  'private-data',
  'secrets',
  'release-authority',
]);

const exists = async (root, target) => {
  try {
    await access(path.join(root, target));
    return true;
  } catch {
    return false;
  }
};

const repoReference = (value) => {
  const target = value.trim().replace(/[.,;:]$/, '');
  if (ROOT_REFERENCES.has(target)) return target;
  if (/^(?:\.raas|docs|data|scripts)\//.test(target) && !target.includes('<')) return target;
  return null;
};

export function extractRepositoryReferences(markdown) {
  const refs = new Set();
  for (const match of markdown.matchAll(/`([^`\n]+)`/g)) {
    const target = repoReference(match[1]);
    if (target) refs.add(target);
  }
  return [...refs].sort();
}

export function validateAutonomy(autonomy) {
  const errors = [];
  if (autonomy?.protocol !== 'harness-autonomy/v1') errors.push('autonomy: protocol must be harness-autonomy/v1');
  if (autonomy?.harness !== 'RAAS') errors.push('autonomy: harness must be RAAS');
  if (autonomy?.project !== 'PlayGarba') errors.push('autonomy: project must be PlayGarba');
  if (autonomy?.repository !== 'ruddvz/garba') errors.push('autonomy: repository must be ruddvz/garba');
  if (autonomy?.runtimeDependenciesOnPeers !== false) {
    errors.push('autonomy: runtimeDependenciesOnPeers must remain false');
  }
  if (autonomy?.sharedMutableState !== false) {
    errors.push('autonomy: sharedMutableState must remain false');
  }
  if (autonomy?.federation?.mode !== 'reviewed-knowledge-only') {
    errors.push('autonomy: federation mode must remain reviewed-knowledge-only');
  }
  for (const key of REQUIRED_LOCAL_AUTHORITIES) {
    if (autonomy?.localAuthority?.[key] !== true) {
      errors.push(`autonomy: localAuthority.${key} must remain true`);
    }
  }
  const forbidden = new Set(autonomy?.federation?.forbidden ?? []);
  for (const value of REQUIRED_FORBIDDEN_FEDERATION) {
    if (!forbidden.has(value)) errors.push(`autonomy: federation must forbid ${value}`);
  }
  if (autonomy?.graph?.inferredEdgesAreAdvisory !== true) {
    errors.push('autonomy: inferred graph edges must remain advisory');
  }
  if (autonomy?.fallback !== 'local-raas-canonical-workflow') {
    errors.push('autonomy: fallback must remain local-raas-canonical-workflow');
  }
  return errors;
}

export async function validateRaas({ root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..') } = {}) {
  const errors = [];
  const read = (target) => readFile(path.join(root, target), 'utf8');

  for (const target of REQUIRED_RAAS_FILES) {
    if (!await exists(root, target)) errors.push(`Missing required RAAS file: ${target}`);
  }
  if (!await exists(root, 'AGENTS.md')) errors.push('Missing AGENTS.md RAAS entry point');
  if (errors.length) return errors;

  const agents = await read('AGENTS.md');
  if (!agents.includes('## Load the RAAS harness first')) {
    errors.push('AGENTS.md is missing the RAAS preflight heading');
  }
  for (const target of ['.raas/RAAS.md', '.raas/PROJECT-CONTEXT.md', '.raas/EXECUTION.md', '.raas/LANGUAGE.md']) {
    if (!agents.includes(`\`${target}\``)) {
      errors.push(`AGENTS.md no longer routes agents through ${target}`);
    }
  }

  for (const source of REFERENCE_DOCS) {
    const markdown = await read(source);
    for (const target of extractRepositoryReferences(markdown)) {
      if (!await exists(root, target)) {
        errors.push(`${source} references missing repository path: ${target}`);
      }
    }
  }

  let config;
  try {
    config = JSON.parse(await read('.raas/config.json'));
  } catch (error) {
    errors.push(`.raas/config.json is not valid JSON: ${error.message}`);
    return errors;
  }
  for (const target of [...(config.entrypoints || []), config.languageContext].filter(Boolean)) {
    if (!await exists(root, target)) errors.push(`.raas/config.json references missing repository path: ${target}`);
  }

  try {
    const autonomy = JSON.parse(await read('.raas/autonomy.json'));
    errors.push(...validateAutonomy(autonomy));
  } catch (error) {
    errors.push(`.raas/autonomy.json is not valid JSON: ${error.message}`);
  }

  return errors;
}

async function main() {
  const errors = await validateRaas();
  if (errors.length) {
    for (const error of errors) console.error(`✗ ${error}`);
    process.exitCode = 1;
    return;
  }
  console.log(`✓ RAAS harness verified: ${REQUIRED_RAAS_FILES.length} required files, local-autonomy invariants, AGENTS preflight, config and repository-local references are intact`);
}

const entry = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (entry === import.meta.url) await main();
