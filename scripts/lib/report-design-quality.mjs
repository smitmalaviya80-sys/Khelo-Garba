import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const root = path.resolve(import.meta.dirname, '../..');
const extensions = new Set(['.html', '.css', '.js']);
const scanTargets = [
  'index.html',
  'app.js',
  'nonstop-browser.js',
  'provider-runtime.js',
  'styles',
  'public-site',
  'src/catalogue',
  'assets/runtime',
];

async function walk(relativePath) {
  const absolute = path.join(root, relativePath);
  const info = await stat(absolute);
  if (info.isFile()) return extensions.has(path.extname(relativePath)) ? [relativePath] : [];

  const files = [];
  for (const entry of await readdir(absolute, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git') continue;
    const child = path.join(relativePath, entry.name);
    if (entry.isDirectory()) files.push(...await walk(child));
    else if (extensions.has(path.extname(entry.name))) files.push(child);
  }
  return files;
}

const files = [...new Set((await Promise.all(scanTargets.map(walk))).flat())].sort();
const sources = new Map();
for (const file of files) sources.set(file, await readFile(path.join(root, file), 'utf8'));

function countMatches(text, pattern) {
  return [...text.matchAll(pattern)].length;
}

function countLargeBlur(text) {
  let count = 0;
  for (const match of text.matchAll(/\bblur\(\s*([0-9]+(?:\.[0-9]+)?)px\s*\)/gi)) {
    if (Number(match[1]) > 20) count += 1;
  }
  return count;
}

const metrics = [
  {
    id: 'inlineStyleBlocks',
    label: 'Inline <style> blocks',
    kind: 'debt',
    note: 'Durable rules should move into the owning semantic stylesheet layer.',
    count: (text) => countMatches(text, /<style\b/gi),
  },
  {
    id: 'inlineStyleAttributes',
    label: 'Inline style attributes',
    kind: 'debt',
    note: 'Prefer classes/tokens unless a runtime value genuinely has to be inline.',
    count: (text) => countMatches(text, /\sstyle\s*=\s*["']/gi),
  },
  {
    id: 'importantRules',
    label: '!important declarations',
    kind: 'debt',
    note: 'Review specificity ownership before adding more overrides.',
    count: (text) => countMatches(text, /!important\b/gi),
  },
  {
    id: 'transitionAll',
    label: 'transition: all',
    kind: 'avoid',
    note: 'Use explicit properties so motion stays predictable and cheap.',
    count: (text) => countMatches(text, /\btransition\s*:\s*all\b/gi),
  },
  {
    id: 'plainEaseIn',
    label: 'Plain ease-in usage',
    kind: 'review',
    note: 'UI entry/feedback should generally use ease-out; verify intentional exceptions.',
    count: (text) => countMatches(text, /(?:^|[^-\w])ease-in(?=\s|[,;)]|$)/gim),
  },
  {
    id: 'scaleZero',
    label: 'scale(0) starts',
    kind: 'review',
    note: 'Popovers/surfaces should normally start from a small visible scale rather than zero.',
    count: (text) => countMatches(text, /\bscale(?:x|y)?\(\s*0(?:\.0+)?\s*\)/gi),
  },
  {
    id: 'largeBlur',
    label: 'Blur effects above 20px',
    kind: 'review',
    note: 'Large blur can be expensive and muddy; keep only when it earns the cost.',
    count: countLargeBlur,
  },
  {
    id: 'viewport100vh',
    label: '100vh declarations',
    kind: 'review',
    note: 'Check that mobile full-screen composition also has a deliberate dynamic-viewport strategy.',
    count: (text) => countMatches(text, /\b(?:height|min-height)\s*:\s*100vh\b/gi),
  },
  {
    id: 'reducedMotion',
    label: 'prefers-reduced-motion references',
    kind: 'coverage',
    note: 'Coverage signal, not a target count.',
    count: (text) => countMatches(text, /prefers-reduced-motion\s*:\s*reduce/gi),
  },
  {
    id: 'hoverMedia',
    label: 'Hover-capability media queries',
    kind: 'coverage',
    note: 'Hover-only behaviour should be gated to devices that actually hover.',
    count: (text) => countMatches(text, /@media[^\{]*(?:hover\s*:\s*hover|any-hover\s*:\s*hover)/gi),
  },
  {
    id: 'activeStates',
    label: ':active selectors',
    kind: 'coverage',
    note: 'Coverage signal for tactile press feedback.',
    count: (text) => countMatches(text, /:active\b/gi),
  },
  {
    id: 'focusVisible',
    label: ':focus-visible selectors',
    kind: 'coverage',
    note: 'Coverage signal for explicit keyboard focus treatment.',
    count: (text) => countMatches(text, /:focus-visible\b/gi),
  },
];

const report = {
  generatedAt: new Date().toISOString(),
  scannedFiles: files.length,
  metrics: {},
};

for (const metric of metrics) {
  const byFile = [];
  let total = 0;
  for (const [file, text] of sources) {
    const count = metric.count(text);
    if (!count) continue;
    total += count;
    byFile.push({ file, count });
  }
  byFile.sort((a, b) => b.count - a.count || a.file.localeCompare(b.file));
  report.metrics[metric.id] = {
    label: metric.label,
    kind: metric.kind,
    note: metric.note,
    total,
    topFiles: byFile.slice(0, 8),
  };
}

if (process.argv.includes('--json')) {
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  process.exit(0);
}

console.log('PlayGarba design quality report');
console.log(`Scanned ${report.scannedFiles} UI-bearing HTML/CSS/JS files.\n`);

for (const kind of ['avoid', 'debt', 'review', 'coverage']) {
  const group = Object.values(report.metrics).filter((metric) => metric.kind === kind);
  if (!group.length) continue;
  console.log(`${kind.toUpperCase()}`);
  for (const metric of group) {
    console.log(`  ${String(metric.total).padStart(4)}  ${metric.label}`);
    if (metric.topFiles.length) {
      const top = metric.topFiles.slice(0, 3).map(({ file, count }) => `${file} (${count})`).join(', ');
      console.log(`        top: ${top}`);
    }
    console.log(`        ${metric.note}`);
  }
  console.log('');
}

console.log('This report is intentionally non-blocking. Existing debt should become visible before it becomes a CI gate.');
console.log('For UI changes, read docs/product/design-system.md and docs/product/responsive-pwa.md first.');
