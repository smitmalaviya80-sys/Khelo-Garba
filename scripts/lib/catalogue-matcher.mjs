const FIELD_ALIASES = {
  title: ["title", "track_title", "song_title", "recording_title", "song", "track", "name"],
  artist: ["artist", "artists", "primary_artist", "performer", "performers", "artist_name"],
  release: ["release", "release_title", "album", "album_title", "release_name"],
  duration: ["duration_seconds", "duration_sec", "duration", "length", "track_duration"],
  durationMs: ["duration_ms", "length_ms"],
  isrc: ["isrc", "track_isrc", "recording_isrc"],
  label: ["label", "record_label", "release_label"],
  masterOwner: ["master_owner", "phonogram_owner", "p_owner", "℗_owner", "copyright_owner_recording"],
};

export function normaliseText(value = "") {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/\b(feat(?:uring)?|ft|with|and)\b/giu, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function normaliseHeader(value = "") {
  return String(value ?? "")
    .replace(/^\uFEFF/, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9℗]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function tokenSet(value) {
  return new Set(normaliseText(value).split(" ").filter(Boolean));
}

export function tokenSimilarity(a, b) {
  const aa = tokenSet(a);
  const bb = tokenSet(b);
  if (!aa.size || !bb.size) return 0;
  let intersection = 0;
  for (const token of aa) if (bb.has(token)) intersection += 1;
  const union = new Set([...aa, ...bb]).size;
  return union ? intersection / union : 0;
}

export function parseDurationSeconds(value, assumeMilliseconds = false) {
  if (value == null || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) {
    if (assumeMilliseconds) return value / 1000;
    return value > 10000 ? value / 1000 : value;
  }

  const raw = String(value).trim();
  if (!raw) return null;
  if (/^\d+(?:\.\d+)?$/.test(raw)) {
    const number = Number(raw);
    if (!Number.isFinite(number)) return null;
    if (assumeMilliseconds) return number / 1000;
    return number > 10000 ? number / 1000 : number;
  }

  const parts = raw.split(":").map(Number);
  if (parts.some((part) => !Number.isFinite(part))) return null;
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return null;
}

export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') quoted = true;
    else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (char !== "\r") {
      field += char;
    }
  }

  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }

  const nonEmpty = rows.filter((candidate) => candidate.some((value) => String(value).trim()));
  if (!nonEmpty.length) return [];
  const headers = nonEmpty[0].map(normaliseHeader);
  return nonEmpty.slice(1).map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""])));
}

function normaliseRecordKeys(record) {
  return Object.fromEntries(Object.entries(record || {}).map(([key, value]) => [normaliseHeader(key), value]));
}

function firstValue(record, aliases) {
  for (const alias of aliases) {
    const key = normaliseHeader(alias);
    if (record[key] != null && String(record[key]).trim() !== "") return record[key];
  }
  return null;
}

export function canonicaliseVendorTrack(input, index = 0) {
  const record = normaliseRecordKeys(input);
  const durationMsValue = firstValue(record, FIELD_ALIASES.durationMs);
  const durationValue = firstValue(record, FIELD_ALIASES.duration);
  const isrc = String(firstValue(record, FIELD_ALIASES.isrc) || "").toUpperCase().replace(/[^A-Z0-9]/g, "") || null;

  return {
    vendorIndex: index,
    title: String(firstValue(record, FIELD_ALIASES.title) || "").trim(),
    artist: String(firstValue(record, FIELD_ALIASES.artist) || "").trim(),
    release: String(firstValue(record, FIELD_ALIASES.release) || "").trim(),
    durationSeconds: durationMsValue != null
      ? parseDurationSeconds(durationMsValue, true)
      : parseDurationSeconds(durationValue),
    isrc,
    label: String(firstValue(record, FIELD_ALIASES.label) || "").trim() || null,
    masterOwner: String(firstValue(record, FIELD_ALIASES.masterOwner) || "").trim() || null,
    raw: input,
  };
}

function durationSimilarity(a, b) {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return { similarity: null, differenceSeconds: null };
  const differenceSeconds = Math.abs(a - b);
  if (differenceSeconds <= 2) return { similarity: 1, differenceSeconds };
  if (differenceSeconds <= 5) return { similarity: 0.85, differenceSeconds };
  if (differenceSeconds <= 10) return { similarity: 0.55, differenceSeconds };
  if (differenceSeconds <= 20) return { similarity: 0.2, differenceSeconds };
  return { similarity: 0, differenceSeconds };
}

function candidateScore(vendor, song, release) {
  const titleSimilarity = tokenSimilarity(vendor.title, song.title);
  const titleExact = Boolean(normaliseText(vendor.title)) && normaliseText(vendor.title) === normaliseText(song.title);
  const titleTokenCount = tokenSet(vendor.title).size;
  if (!titleExact && (titleSimilarity < 0.58 || (titleTokenCount <= 2 && titleSimilarity < 1))) return null;

  const artistSimilarity = vendor.artist ? tokenSimilarity(vendor.artist, song.artist) : null;
  const releaseSimilarity = vendor.release ? tokenSimilarity(vendor.release, release?.title) : null;
  const duration = durationSimilarity(vendor.durationSeconds, Number(song.durationSeconds));
  const vendorLabel = normaliseText(vendor.label || vendor.masterOwner || "");
  const catalogueLabel = normaliseText(release?.label || "");
  const labelAgreement = vendorLabel && catalogueLabel ? vendorLabel === catalogueLabel : null;

  let score = titleSimilarity * 60;
  if (titleExact) score += 5;
  if (artistSimilarity != null) score += artistSimilarity * 25;
  if (releaseSimilarity != null) score += releaseSimilarity * 5;
  if (duration.similarity != null) score += duration.similarity * 8;
  if (labelAgreement === true) score += 2;
  score = Math.min(100, score);

  return {
    score: Number(score.toFixed(2)),
    titleSimilarity: Number(titleSimilarity.toFixed(3)),
    titleExact,
    artistSimilarity: artistSimilarity == null ? null : Number(artistSimilarity.toFixed(3)),
    releaseSimilarity: releaseSimilarity == null ? null : Number(releaseSimilarity.toFixed(3)),
    durationDifferenceSeconds: duration.differenceSeconds == null ? null : Number(duration.differenceSeconds.toFixed(2)),
    labelAgreement,
  };
}

function classifyCandidate(vendor, metrics) {
  const artistGood = metrics.artistSimilarity == null || metrics.artistSimilarity >= 0.72;
  const durationGood = metrics.durationDifferenceSeconds == null || metrics.durationDifferenceSeconds <= 5;
  const releaseGood = metrics.releaseSimilarity == null || metrics.releaseSimilarity >= 0.5;

  if (metrics.titleExact && artistGood && durationGood && releaseGood && vendor.artist) return "exact";
  if (metrics.score >= 82 && metrics.titleSimilarity >= 0.8 && (metrics.artistSimilarity == null || metrics.artistSimilarity >= 0.5)) return "likely";
  if (metrics.score >= 68 && metrics.titleSimilarity >= 0.65) return "possible";
  return "weak";
}

export function matchVendorTrack(vendor, catalogueSongs, releasesById, options = {}) {
  if (!vendor.title) {
    return { state: "invalid", reason: "missing-title", vendor, candidates: [] };
  }

  const targetLabel = normaliseText(options.targetLabel || "");
  const scored = [];
  for (const song of catalogueSongs) {
    const release = releasesById.get(song.releaseId) || null;
    if (targetLabel && normaliseText(release?.label || "") !== targetLabel) continue;
    const metrics = candidateScore(vendor, song, release);
    if (!metrics) continue;
    const confidence = classifyCandidate(vendor, metrics);
    if (confidence === "weak") continue;
    scored.push({
      songId: song.id,
      title: song.title,
      artist: song.artist,
      releaseId: song.releaseId || null,
      releaseTitle: release?.title || null,
      releaseLabel: release?.label || null,
      durationSeconds: Number.isFinite(Number(song.durationSeconds)) ? Number(song.durationSeconds) : null,
      confidence,
      ...metrics,
    });
  }

  scored.sort((a, b) => b.score - a.score || String(a.songId).localeCompare(String(b.songId)));
  const top = scored[0] || null;
  const second = scored[1] || null;
  if (!top) return { state: "unmatched", vendor, candidates: [] };

  const ambiguous = Boolean(second && top.score - second.score < 4 && top.confidence !== "exact");
  const state = ambiguous ? "ambiguous" : top.confidence;
  return {
    state,
    vendor,
    best: top,
    candidates: scored.slice(0, 5),
  };
}

export function findDuplicateIsrcs(vendorTracks) {
  const grouped = new Map();
  for (const track of vendorTracks) {
    if (!track.isrc) continue;
    if (!grouped.has(track.isrc)) grouped.set(track.isrc, []);
    grouped.get(track.isrc).push(track.vendorIndex);
  }
  return [...grouped.entries()]
    .filter(([, indices]) => indices.length > 1)
    .map(([isrc, vendorIndices]) => ({ isrc, vendorIndices }));
}

export function summariseMatches(matches) {
  const states = {};
  for (const match of matches) states[match.state] = (states[match.state] || 0) + 1;
  const matchedSongIds = new Set(matches.filter((match) => ["exact", "likely", "possible"].includes(match.state) && match.best).map((match) => match.best.songId));
  return { states, uniqueCatalogueSongMatches: matchedSongIds.size };
}
