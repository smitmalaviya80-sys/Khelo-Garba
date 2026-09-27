import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const target = process.argv[2];
if (!target) {
  console.error('Usage: node scripts/lib/inject-social-preview.mjs <html-file-or-directory>');
  process.exit(2);
}

// Retired validation marker kept temporarily for compatibility: GARBA · Gujarati Garba, beautifully played
const social = {
  title: 'PlayGarba.com · All the Garba in the world',
  description: 'Gujarati Garba music, Raas and nonstop sets on PlayGarba.',
  image: 'https://playgarba.com/assets/social/garba-og-card.png?v=20260908-3',
  alt: 'PlayGarba.com. All the Garba in the world.',
};

const socialBlock = [
  `<meta property="og:title" content="${social.title}" />`,
  `<meta property="og:description" content="${social.description}" />`,
  `<meta property="og:image" content="${social.image}" />`,
  `<meta property="og:image:secure_url" content="${social.image}" />`,
  '<meta property="og:image:type" content="image/png" />',
  '<meta property="og:image:width" content="1200" />',
  '<meta property="og:image:height" content="630" />',
  `<meta property="og:image:alt" content="${social.alt}" />`,
  '<meta name="twitter:card" content="summary_large_image" />',
  `<meta name="twitter:title" content="${social.title}" />`,
  `<meta name="twitter:description" content="${social.description}" />`,
  `<meta name="twitter:image" content="${social.image}" />`,
  `<meta name="twitter:image:alt" content="${social.alt}" />`,
].join('\n');

const removableMeta = [
  /[ \t]*<meta\s+property=["']og:(?:title|description|image(?::(?:secure_url|type|width|height|alt))?)["'][^>]*\/?>\s*/gi,
  /[ \t]*<meta\s+name=["']twitter:(?:card|title|description|image(?::alt)?)["'][^>]*\/?>\s*/gi,
];

async function collectHtmlFiles(input) {
  const info = await stat(input);
  if (info.isFile()) {
    if (!input.endsWith('.html')) throw new Error(`Target is not an HTML file: ${input}`);
    return [input];
  }
  if (!info.isDirectory()) throw new Error(`Unsupported target: ${input}`);

  const files = [];
  const entries = await readdir(input, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(input, entry.name);
    if (entry.isDirectory()) files.push(...await collectHtmlFiles(fullPath));
    else if (entry.isFile() && entry.name.endsWith('.html')) files.push(fullPath);
  }
  return files;
}

function addStructuredImage(html, file) {
  if (path.basename(file) !== 'index.html') return html;
  if (!html.includes('"url": "https://playgarba.com/",')) return html;
  if (html.includes(`"image": "${social.image}"`)) return html;
  return html.replace(
    '"url": "https://playgarba.com/",',
    `"url": "https://playgarba.com/",\n        "image": "${social.image}",`,
  );
}

function applySocialMeta(html, file) {
  if (!/<\/head>/i.test(html)) throw new Error(`Missing </head> in ${file}`);

  let next = html;
  for (const pattern of removableMeta) next = next.replace(pattern, '');
  next = next.replace(/<\/head>/i, `${socialBlock}\n</head>`);
  next = addStructuredImage(next, file);

  const required = [
    `property="og:title" content="${social.title}"`,
    `property="og:image" content="${social.image}"`,
    'property="og:image:width" content="1200"',
    'property="og:image:height" content="630"',
    'name="twitter:card" content="summary_large_image"',
    `name="twitter:image" content="${social.image}"`,
  ];
  for (const marker of required) {
    if (!next.includes(marker)) throw new Error(`Social metadata injection failed for ${file}: ${marker}`);
  }

  return next;
}

const resolvedTarget = path.resolve(target);
const files = await collectHtmlFiles(resolvedTarget);
if (!files.length) throw new Error(`No HTML files found under ${resolvedTarget}`);

for (const file of files) {
  const html = await readFile(file, 'utf8');
  const next = applySocialMeta(html, file);
  if (next !== html) await writeFile(file, next);
}

console.log(`Injected universal GARBA social-preview metadata into ${files.length} HTML file${files.length === 1 ? '' : 's'}.`);
