import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import {
  REQUIRED_RAAS_FILES,
  extractRepositoryReferences,
  validateAutonomy,
  validateRaas,
} from './raas-verify.mjs';

const roots = [];
const validAutonomy = () => ({
  protocol: 'harness-autonomy/v1',
  harness: 'RAAS',
  project: 'PlayGarba',
  repository: 'ruddvz/garba',
  localAuthority: {
    productTruth: true,
    issueOwnership: true,
    branchOwnership: true,
    fileOwnership: true,
    graphVocabulary: true,
    contextCompiler: true,
    uiUxRules: true,
    validation: true,
    release: true,
  },
  runtimeDependenciesOnPeers: false,
  sharedMutableState: false,
  federation: {
    mode: 'reviewed-knowledge-only',
    allowed: ['protocol-patterns'],
    forbidden: [
      'active-claims',
      'locks',
      'project-truth',
      'private-data',
      'secrets',
      'release-authority',
    ],
  },
  graph: { inferredEdgesAreAdvisory: true },
  fallback: 'local-raas-canonical-workflow',
});

const createFixture = async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'garba-raas-'));
  roots.push(root);
  await mkdir(path.join(root, '.raas/clients'), { recursive: true });
  await mkdir(path.join(root, 'docs'), { recursive: true });
  await mkdir(path.join(root, 'scripts'), { recursive: true });
  await writeFile(path.join(root, 'docs/README.md'), '# Docs\n');
  await writeFile(path.join(root, 'scripts/raas-task.mjs'), '// task compiler\n');
  await writeFile(path.join(root, 'AGENTS.md'), [
    '# Agent rules',
    '## Load the RAAS harness first',
    '- `.raas/RAAS.md`',
    '- `.raas/PROJECT-CONTEXT.md`',
    '- `.raas/EXECUTION.md`',
    '- `.raas/LANGUAGE.md`',
  ].join('\n'));

  for (const target of REQUIRED_RAAS_FILES) {
    if (target === '.raas/config.json' || target === '.raas/autonomy.json') continue;
    await mkdir(path.dirname(path.join(root, target)), { recursive: true });
    await writeFile(path.join(root, target), `# ${path.basename(target)}\n`);
  }
  await writeFile(path.join(root, '.raas/BOOTSTRAP.md'), '`AGENTS.md` `.raas/RAAS.md` `scripts/raas-task.mjs`\n');
  await writeFile(path.join(root, '.raas/RAAS.md'), '`AGENTS.md` `.raas/PROJECT-CONTEXT.md` `.raas/AUTONOMY.md` `.raas/autonomy.json`\n');
  await writeFile(path.join(root, '.raas/PROJECT-CONTEXT.md'), '`docs/README.md`\n');
  await writeFile(path.join(root, '.raas/EXECUTION.md'), '`AGENTS.md`\n');
  await writeFile(path.join(root, '.raas/config.json'), JSON.stringify({
    version: 1,
    entrypoints: ['AGENTS.md', '.raas/RAAS.md', '.raas/PROJECT-CONTEXT.md', '.raas/EXECUTION.md'],
    languageContext: '.raas/LANGUAGE.md',
  }));
  await writeFile(path.join(root, '.raas/autonomy.json'), JSON.stringify(validAutonomy()));
  return root;
};

const mutatedAutonomyError = (mutate) => {
  const autonomy = validAutonomy();
  mutate(autonomy);
  return validateAutonomy(autonomy).join('\n');
};

try {
  assert.deepEqual(extractRepositoryReferences('`docs/README.md` `npm run check` `https://example.com`'), ['docs/README.md']);

  const valid = await createFixture();
  assert.deepEqual(await validateRaas({ root: valid }), [], 'valid harness fixture should pass');

  const missingFile = await createFixture();
  await rm(path.join(missingFile, '.raas/clients/chatgpt.md'));
  assert.match((await validateRaas({ root: missingFile })).join('\n'), /Missing required RAAS file: \.raas\/clients\/chatgpt\.md/);

  const missingAutonomy = await createFixture();
  await rm(path.join(missingAutonomy, '.raas/autonomy.json'));
  assert.match((await validateRaas({ root: missingAutonomy })).join('\n'), /Missing required RAAS file: \.raas\/autonomy\.json/);

  const brokenAgents = await createFixture();
  await writeFile(path.join(brokenAgents, 'AGENTS.md'), '# Agent rules\n');
  const agentErrors = (await validateRaas({ root: brokenAgents })).join('\n');
  assert.match(agentErrors, /missing the RAAS preflight heading/i);
  assert.match(agentErrors, /no longer routes agents through \.raas\/RAAS\.md/);

  const brokenReference = await createFixture();
  await writeFile(path.join(brokenReference, '.raas/PROJECT-CONTEXT.md'), '`docs/missing.md`\n');
  assert.match((await validateRaas({ root: brokenReference })).join('\n'), /references missing repository path: docs\/missing\.md/);

  const brokenConfig = await createFixture();
  await writeFile(path.join(brokenConfig, '.raas/config.json'), JSON.stringify({
    entrypoints: ['AGENTS.md', 'docs/missing.md'],
    languageContext: '.raas/LANGUAGE.md',
  }));
  assert.match((await validateRaas({ root: brokenConfig })).join('\n'), /config\.json references missing repository path: docs\/missing\.md/);

  assert.match(mutatedAutonomyError((a) => { a.runtimeDependenciesOnPeers = true; }), /runtimeDependenciesOnPeers must remain false/);
  assert.match(mutatedAutonomyError((a) => { a.sharedMutableState = true; }), /sharedMutableState must remain false/);
  assert.match(mutatedAutonomyError((a) => { a.federation.mode = 'central-control'; }), /reviewed-knowledge-only/);
  assert.match(mutatedAutonomyError((a) => { a.localAuthority.issueOwnership = false; }), /localAuthority\.issueOwnership must remain true/);
  assert.match(mutatedAutonomyError((a) => { a.federation.forbidden = a.federation.forbidden.filter((x) => x !== 'active-claims'); }), /must forbid active-claims/);
  assert.match(mutatedAutonomyError((a) => { a.federation.forbidden = a.federation.forbidden.filter((x) => x !== 'release-authority'); }), /must forbid release-authority/);
  assert.match(mutatedAutonomyError((a) => { a.graph.inferredEdgesAreAdvisory = false; }), /inferred graph edges must remain advisory/);
  assert.match(mutatedAutonomyError((a) => { a.fallback = 'shared-global-harness'; }), /fallback must remain local-raas-canonical-workflow/);

  console.log(`✓ RAAS verifier self-tests cover ${REQUIRED_RAAS_FILES.length} required files plus local-autonomy mutation guards, valid, missing-file, broken-preflight, broken-reference and broken-config states`);
} finally {
  await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
}
