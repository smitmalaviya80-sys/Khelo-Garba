import { readFile, writeFile } from "node:fs/promises";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  canonicaliseVendorTrack,
  findDuplicateIsrcs,
  matchVendorTrack,
  parseCsv,
  summariseMatches,
} from "./lib/catalogue-matcher.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function usage() {
  console.error("Usage: node scripts/match-vendor-catalogue.mjs <vendor.csv|vendor.json> [--target-label <label>] [--out <report.json>]");
}

function parseArgs(argv) {
  const args = [...argv];
  const inputPath = args.shift();
  const options = { inputPath, targetLabel: null, outPath: null };
  while (args.length) {
    const flag = args.shift();
    if (flag === "--target-label") options.targetLabel = args.shift() || null;
    else if (flag === "--out") options.outPath = args.shift() || null;
    else throw new Error(`Unknown argument: ${flag}`);
  }
  return options;
}

async function readVendorRows(path) {
  const absolute = resolve(process.cwd(), path);
  const raw = await readFile(absolute, "utf8");
  const extension = extname(path).toLowerCase();
  if (extension === ".csv") return parseCsv(raw);
  if (extension === ".json") {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
    for (const key of ["tracks", "recordings", "catalogue", "songs", "items"]) {
      if (Array.isArray(parsed?.[key])) return parsed[key];
    }
    throw new Error("JSON vendor file must be an array or contain tracks/recordings/catalogue/songs/items array.");
  }
  throw new Error("Unsupported vendor format. Export XLSX to CSV first; matcher currently accepts CSV or JSON.");
}

async function merge(paths = []) {
  const parts = await Promise.all(paths.map(async (path) => JSON.parse(await readFile(resolve(root, path), "utf8"))));
  return parts.flat();
}

const options = parseArgs(process.argv.slice(2));
if (!options.inputPath) {
  usage();
  process.exitCode = 2;
} else {
  const index = JSON.parse(await readFile(resolve(root, "data/catalogue/index.json"), "utf8"));
  const [songs, releases, vendorRows] = await Promise.all([
    merge(index.songChunks),
    merge(index.releaseChunks),
    readVendorRows(options.inputPath),
  ]);

  const releasesById = new Map(releases.map((release) => [release.id, release]));
  const vendorTracks = vendorRows.map(canonicaliseVendorTrack);
  const matches = vendorTracks.map((vendor) => matchVendorTrack(vendor, songs, releasesById, { targetLabel: options.targetLabel }));
  const summary = summariseMatches(matches);
  const duplicateIsrcs = findDuplicateIsrcs(vendorTracks);
  const report = {
    version: "1.0.0",
    generatedAt: new Date().toISOString(),
    catalogueVersion: index.version,
    vendorFile: options.inputPath,
    targetLabel: options.targetLabel,
    warning: "This report is an identification aid only. A match does not establish copyright ownership, licensing authority, or permission to host audio.",
    vendorRows: vendorTracks.length,
    duplicateIsrcs,
    summary,
    matches,
  };

  const output = `${JSON.stringify(report, null, 2)}\n`;
  if (options.outPath) {
    await writeFile(resolve(process.cwd(), options.outPath), output);
    console.log(`Wrote vendor match report to ${options.outPath}`);
  } else {
    process.stdout.write(output);
  }

  console.error(`Matched ${summary.uniqueCatalogueSongMatches} unique GARBA songs from ${vendorTracks.length} vendor rows.`);
  console.error(`States: ${Object.entries(summary.states).map(([state, count]) => `${state}=${count}`).join(", ") || "none"}`);
  if (duplicateIsrcs.length) console.error(`Vendor duplicate ISRC groups: ${duplicateIsrcs.length}`);
}
