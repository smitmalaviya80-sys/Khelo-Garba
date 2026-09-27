import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = path.resolve(import.meta.dirname, "..");
const manifest = JSON.parse(await readFile(path.join(root, "data/direct-audio.json"), "utf8"));
const tracks = manifest?.tracks || {};

const failures = [];
const results = [];
const expectedOrigin = process.env.GARBA_PLAYER_ORIGIN || "https://playgarba.com";

function fail(songId, message) {
  failures.push(`${songId}: ${message}`);
}

for (const [songId, entry] of Object.entries(tracks)) {
  const audioUrl = String(entry?.audioUrl || "").trim();
  if (!/^https:\/\//i.test(audioUrl)) {
    results.push({ songId, skipped: true, reason: "non-HTTPS/local asset URL" });
    continue;
  }

  try {
    const parsedAudioUrl = new URL(audioUrl);
    const crossOrigin = parsedAudioUrl.origin !== expectedOrigin;
    const response = await fetch(audioUrl, {
      method: "GET",
      headers: {
        Range: "bytes=0-1",
        Origin: expectedOrigin,
        "User-Agent": "GARBA-direct-audio-health/1.1",
      },
      redirect: "follow",
    });

    const contentType = String(response.headers.get("content-type") || "").toLowerCase();
    const contentRange = response.headers.get("content-range");
    const acceptRanges = String(response.headers.get("accept-ranges") || "").toLowerCase();
    const cors = response.headers.get("access-control-allow-origin");

    if (response.status !== 206) fail(songId, `expected HTTP 206 for byte-range request, got ${response.status}`);
    if (!contentRange || !/^bytes\s+0-1\//i.test(contentRange)) fail(songId, "missing/invalid Content-Range for bytes 0-1");
    if (acceptRanges && acceptRanges !== "bytes") fail(songId, `unexpected Accept-Ranges ${JSON.stringify(acceptRanges)}`);
    if (!contentType.startsWith("audio/") && contentType !== "application/octet-stream") {
      fail(songId, `unexpected Content-Type ${JSON.stringify(contentType || null)}`);
    }
    if (crossOrigin && !cors) {
      fail(songId, `cross-origin audio response is missing Access-Control-Allow-Origin for ${expectedOrigin}`);
    } else if (cors && cors !== "*" && cors !== expectedOrigin) {
      fail(songId, `CORS allows ${JSON.stringify(cors)} instead of * or ${expectedOrigin}`);
    }

    const body = new Uint8Array(await response.arrayBuffer());
    if (body.byteLength !== 2) fail(songId, `range response returned ${body.byteLength} bytes instead of 2`);

    results.push({
      songId,
      status: response.status,
      contentType,
      contentRange,
      acceptRanges: acceptRanges || null,
      cors: cors || null,
      crossOrigin,
      bytesRead: body.byteLength,
    });
  } catch (error) {
    fail(songId, `request failed: ${error?.message || error}`);
  }
}

console.log(JSON.stringify({ checked: results.length, failures, results }, null, 2));
if (failures.length) process.exit(1);
console.error(`✓ direct-host health audit passed for ${results.length} track(s)`);
