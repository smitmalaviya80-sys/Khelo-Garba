import { readFile, appendFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const root = path.resolve(import.meta.dirname, '..');
const readJson = async (file) => JSON.parse(await readFile(path.join(root, file), 'utf8'));
const index = await readJson('data/catalogue/index.json');

const ids = new Map();
const add = (videoId, label, url = null, embeddableExpected = true) => {
  const id = String(videoId || '').trim();
  if (!id) return;
  const record = ids.get(id) || { videoId: id, labels: new Set(), urls: new Set(), embeddableExpected: false };
  if (label) record.labels.add(label);
  if (url) record.urls.add(url);
  record.embeddableExpected ||= Boolean(embeddableExpected);
  ids.set(id, record);
};

for (const file of (index.playbackSources || [])) {
  let manifest;
  try { manifest = await readJson(file); } catch { continue; }
  for (const [songId, source] of Object.entries(manifest?.songSources || {})) {
    if (source?.provider === 'youtube' && source.videoId) {
      add(source.videoId, `song:${songId}`, source.sourceUrl, source.embeddable !== false);
    }
  }
}

const setsIndexPath = index.discovery?.setsIndex;
if (setsIndexPath) {
  const setsIndex = await readJson(setsIndexPath);
  const base = path.posix.dirname(setsIndexPath);
  for (const chunk of setsIndex.chunks || []) {
    const payload = await readJson(path.posix.join(base, chunk));
    for (const set of payload?.sets || []) {
      if (set?.source?.provider === 'youtube' && set.source.videoId) {
        add(set.source.videoId, `set:${set.id}`, set.source.url, set.source.embeddable !== false);
      }
    }
  }
}

const records = [...ids.values()];
const concurrency = 5;
const queue = [...records];
const dead = [];
const unexpectedEmbedRestrictions = [];
const expectedEmbedRestrictions = [];
const warnings = [];
let healthy = 0;

async function probe(record) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  const watch = `https://www.youtube.com/watch?v=${encodeURIComponent(record.videoId)}`;
  const endpoint = `https://www.youtube.com/oembed?url=${encodeURIComponent(watch)}&format=json`;
  try {
    const response = await fetch(endpoint, { signal: controller.signal, headers: { 'User-Agent': 'garba-source-health/1.1' } });
    if (response.ok) { healthy += 1; return; }
    if (response.status === 401) {
      const target = record.embeddableExpected ? unexpectedEmbedRestrictions : expectedEmbedRestrictions;
      target.push({ ...record, status: response.status });
      return;
    }
    if ([400, 404, 410].includes(response.status)) {
      dead.push({ ...record, status: response.status });
      return;
    }
    warnings.push({ ...record, status: response.status, reason: `HTTP ${response.status}` });
  } catch (error) {
    warnings.push({ ...record, status: null, reason: error?.name === 'AbortError' ? 'timeout' : String(error?.message || error) });
  } finally {
    clearTimeout(timer);
  }
}

async function worker() {
  while (queue.length) await probe(queue.shift());
}
await Promise.all(Array.from({ length: Math.min(concurrency, queue.length || 1) }, () => worker()));

const lines = [
  '# GARBA YouTube source health',
  '',
  `- Checked: ${records.length}`,
  `- Embeddable: ${healthy}`,
  `- Expected watch-page-only sources: ${expectedEmbedRestrictions.length}`,
  `- Unexpected embed restrictions: ${unexpectedEmbedRestrictions.length}`,
  `- Confirmed dead/invalid: ${dead.length}`,
  `- Transient warnings: ${warnings.length}`,
];
if (expectedEmbedRestrictions.length) {
  lines.push('', '## Watch-page-only sources');
  for (const item of expectedEmbedRestrictions) lines.push(`- \`${item.videoId}\`: ${[...item.labels].slice(0, 5).join(', ')}`);
}
if (unexpectedEmbedRestrictions.length) {
  lines.push('', '## Unexpected embed restrictions');
  for (const item of unexpectedEmbedRestrictions) lines.push(`- \`${item.videoId}\`: ${[...item.labels].slice(0, 5).join(', ')}`);
}
if (dead.length) {
  lines.push('', '## Broken sources');
  for (const item of dead) lines.push(`- \`${item.videoId}\` HTTP ${item.status}: ${[...item.labels].slice(0, 5).join(', ')}`);
}
if (warnings.length) {
  lines.push('', '## Warnings');
  for (const item of warnings.slice(0, 25)) lines.push(`- \`${item.videoId}\`: ${item.reason}`);
}
const summary = `${lines.join('\n')}\n`;
console.log(summary);
if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, summary);
if (dead.length || unexpectedEmbedRestrictions.length) process.exit(1);
