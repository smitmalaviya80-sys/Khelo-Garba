import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const target = process.argv[2];
if (!target) {
  console.error('Usage: node scripts/lib/inject-brand-metadata.mjs <html-file-or-directory>');
  process.exit(2);
}

const brandBlock = [
  '<link rel="icon" href="/favicon.ico" sizes="any" />',
  '<link rel="icon" href="/assets/icons/icon.svg" type="image/svg+xml" />',
  '<link rel="icon" href="/assets/icons/favicon-32.png" type="image/png" sizes="32x32" />',
  '<link rel="icon" href="/assets/icons/favicon-16.png" type="image/png" sizes="16x16" />',
  '<link rel="apple-touch-icon" sizes="152x152" href="/assets/icons/apple-touch-icon-152.png" />',
  '<link rel="apple-touch-icon" sizes="167x167" href="/assets/icons/apple-touch-icon-167.png" />',
  '<link rel="apple-touch-icon" sizes="180x180" href="/assets/icons/apple-touch-icon.png" />',
  '<meta name="msapplication-TileColor" content="#111323" />',
  '<meta name="msapplication-config" content="/assets/icons/browserconfig.xml" />',
].join('\n');

const removable = [
  /[ \t]*<link\s+rel=["']icon["'][^>]*\/?>\s*/gi,
  /[ \t]*<link\s+rel=["']apple-touch-icon["'][^>]*\/?>\s*/gi,
  /[ \t]*<meta\s+name=["']msapplication-(?:TileColor|config)["'][^>]*\/?>\s*/gi,
];

async function collectHtmlFiles(input) {
  const info = await stat(input);
  if (info.isFile()) {
    if (!input.endsWith('.html')) throw new Error(`Target is not an HTML file: ${input}`);
    return [input];
  }
  if (!info.isDirectory()) throw new Error(`Unsupported target: ${input}`);

  const files = [];
  for (const entry of await readdir(input, { withFileTypes: true })) {
    const fullPath = path.join(input, entry.name);
    if (entry.isDirectory()) files.push(...await collectHtmlFiles(fullPath));
    else if (entry.isFile() && entry.name.endsWith('.html')) files.push(fullPath);
  }
  return files;
}

function applyBrandMeta(html, file) {
  if (!/<\/head>/i.test(html)) throw new Error(`Missing </head> in ${file}`);
  let next = html;
  for (const pattern of removable) next = next.replace(pattern, '');
  next = next.replace(/<\/head>/i, `${brandBlock}\n</head>`);

  for (const marker of [
    'href="/favicon.ico"',
    'sizes="32x32"',
    'sizes="16x16"',
    'sizes="152x152"',
    'sizes="167x167"',
    'sizes="180x180"',
    'name="msapplication-TileColor" content="#111323"',
    'name="msapplication-config" content="/assets/icons/browserconfig.xml"',
  ]) {
    if (!next.includes(marker)) throw new Error(`Brand metadata injection failed for ${file}: ${marker}`);
  }
  return next;
}

const resolvedTarget = path.resolve(target);
const files = await collectHtmlFiles(resolvedTarget);
if (!files.length) throw new Error(`No HTML files found under ${resolvedTarget}`);

for (const file of files) {
  const html = await readFile(file, 'utf8');
  const next = applyBrandMeta(html, file);
  if (next !== html) await writeFile(file, next);
}

console.log(`Injected PlayGarba icon metadata into ${files.length} HTML file${files.length === 1 ? '' : 's'}.`);
