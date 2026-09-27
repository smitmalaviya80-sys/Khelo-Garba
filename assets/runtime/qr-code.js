/**
 * PlayGarba QR code encoder
 * Byte-mode QR codes (ISO/IEC 18004) with Reed–Solomon error correction, all 40 versions,
 * levels L/M/Q/H and penalty-scored mask selection. Renders to an SVG string.
 */

const ECC_FORMAT_BITS = { L: 1, M: 0, Q: 3, H: 2 };

// Indexed by version (index 0 unused).
const ECC_CODEWORDS_PER_BLOCK = {
  L: [0, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  M: [0, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28],
  Q: [0, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  H: [0, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
};
const ERROR_CORRECTION_BLOCKS = {
  L: [0, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],
  M: [0, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49],
  Q: [0, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68],
  H: [0, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81],
};

const MASKS = [
  (x, y) => (x + y) % 2 === 0,
  (x, y) => y % 2 === 0,
  (x) => x % 3 === 0,
  (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
  (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
  (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
  (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
];

function numRawDataModules(version) {
  let result = (16 * version + 128) * version + 64;
  if (version >= 2) {
    const align = Math.floor(version / 7) + 2;
    result -= (25 * align - 10) * align - 55;
    if (version >= 7) result -= 36;
  }
  return result;
}

function numDataCodewords(version, ecl) {
  return Math.floor(numRawDataModules(version) / 8)
    - ECC_CODEWORDS_PER_BLOCK[ecl][version] * ERROR_CORRECTION_BLOCKS[ecl][version];
}

function alignmentPositions(version) {
  if (version === 1) return [];
  const count = Math.floor(version / 7) + 2;
  const size = version * 4 + 17;
  const step = version === 32 ? 26 : Math.ceil((version * 4 + 4) / (count * 2 - 2)) * 2;
  const positions = [6];
  for (let pos = size - 7; positions.length < count; pos -= step) positions.splice(1, 0, pos);
  return positions;
}

// GF(256) arithmetic with the QR polynomial x^8 + x^4 + x^3 + x^2 + 1.
function gfMultiply(a, b) {
  let result = 0;
  for (let i = 7; i >= 0; i -= 1) {
    result = (result << 1) ^ ((result >>> 7) * 0x11d);
    result ^= ((b >>> i) & 1) * a;
  }
  return result & 0xff;
}

function reedSolomonDivisor(degree) {
  const result = new Array(degree).fill(0);
  result[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i += 1) {
    for (let j = 0; j < degree; j += 1) {
      result[j] = gfMultiply(result[j], root);
      if (j + 1 < degree) result[j] ^= result[j + 1];
    }
    root = gfMultiply(root, 0x02);
  }
  return result;
}

function reedSolomonRemainder(data, divisor) {
  const result = new Array(divisor.length).fill(0);
  for (const byte of data) {
    const factor = byte ^ result.shift();
    result.push(0);
    divisor.forEach((coef, i) => { result[i] ^= gfMultiply(coef, factor); });
  }
  return result;
}

function utf8Bytes(text) {
  if (typeof TextEncoder !== 'undefined') return [...new TextEncoder().encode(text)];
  return [...unescape(encodeURIComponent(text))].map((ch) => ch.charCodeAt(0));
}

function chooseVersion(byteLength, ecl, minVersion, maxVersion) {
  for (let version = minVersion; version <= maxVersion; version += 1) {
    const countBits = version <= 9 ? 8 : 16;
    if (byteLength < 2 ** countBits && 4 + countBits + byteLength * 8 <= numDataCodewords(version, ecl) * 8) return version;
  }
  return null;
}

function buildCodewords(bytes, version, ecl) {
  const capacity = numDataCodewords(version, ecl) * 8;
  const bits = [];
  const push = (value, length) => { for (let i = length - 1; i >= 0; i -= 1) bits.push((value >>> i) & 1); };
  push(0b0100, 4);
  push(bytes.length, version <= 9 ? 8 : 16);
  bytes.forEach((byte) => push(byte, 8));
  push(0, Math.min(4, capacity - bits.length));
  push(0, (8 - (bits.length % 8)) % 8);
  for (let pad = 0xec; bits.length < capacity; pad ^= 0xec ^ 0x11) push(pad, 8);

  const data = [];
  for (let i = 0; i < bits.length; i += 8) data.push(bits.slice(i, i + 8).reduce((byte, bit) => (byte << 1) | bit, 0));

  const blockCount = ERROR_CORRECTION_BLOCKS[ecl][version];
  const eccLength = ECC_CODEWORDS_PER_BLOCK[ecl][version];
  const rawCodewords = Math.floor(numRawDataModules(version) / 8);
  const shortBlocks = blockCount - (rawCodewords % blockCount);
  const shortBlockLength = Math.floor(rawCodewords / blockCount);
  const divisor = reedSolomonDivisor(eccLength);
  const blocks = [];
  for (let i = 0, offset = 0; i < blockCount; i += 1) {
    const length = shortBlockLength - eccLength + (i < shortBlocks ? 0 : 1);
    const chunk = data.slice(offset, offset + length);
    offset += length;
    blocks.push({ data: chunk, ecc: reedSolomonRemainder(chunk, divisor) });
  }

  const result = [];
  const longest = shortBlockLength - eccLength + 1;
  for (let i = 0; i < longest; i += 1) blocks.forEach((block) => { if (i < block.data.length) result.push(block.data[i]); });
  for (let i = 0; i < eccLength; i += 1) blocks.forEach((block) => result.push(block.ecc[i]));
  return result;
}

function createGrid(version) {
  const size = version * 4 + 17;
  const modules = Array.from({ length: size }, () => new Array(size).fill(false));
  const reserved = Array.from({ length: size }, () => new Array(size).fill(false));
  const set = (x, y, dark) => { modules[y][x] = dark; reserved[y][x] = true; };

  for (let i = 0; i < size; i += 1) {
    set(6, i, i % 2 === 0);
    set(i, 6, i % 2 === 0);
  }
  for (const [cx, cy] of [[3, 3], [size - 4, 3], [3, size - 4]]) {
    for (let dy = -4; dy <= 4; dy += 1) {
      for (let dx = -4; dx <= 4; dx += 1) {
        const x = cx + dx;
        const y = cy + dy;
        if (x < 0 || y < 0 || x >= size || y >= size) continue;
        const distance = Math.max(Math.abs(dx), Math.abs(dy));
        set(x, y, distance !== 2 && distance !== 4);
      }
    }
  }
  const align = alignmentPositions(version);
  const last = align.length - 1;
  align.forEach((ay, i) => align.forEach((ax, j) => {
    if ((i === 0 && j === 0) || (i === 0 && j === last) || (i === last && j === 0)) return;
    for (let dy = -2; dy <= 2; dy += 1) {
      for (let dx = -2; dx <= 2; dx += 1) set(ax + dx, ay + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }
  }));

  // Reserve format areas now; their bits depend on the mask and are written later.
  drawFormat(set, size, 0, 'M');
  if (version >= 7) {
    let rem = version;
    for (let i = 0; i < 12; i += 1) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
    const bits = (version << 12) | rem;
    for (let i = 0; i < 18; i += 1) {
      const dark = ((bits >>> i) & 1) === 1;
      const a = size - 11 + (i % 3);
      const b = Math.floor(i / 3);
      set(a, b, dark);
      set(b, a, dark);
    }
  }
  return { size, modules, reserved };
}

function drawFormat(set, size, mask, ecl) {
  const data = (ECC_FORMAT_BITS[ecl] << 3) | mask;
  let rem = data;
  for (let i = 0; i < 10; i += 1) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  const bits = ((data << 10) | rem) ^ 0x5412;
  const bit = (i) => ((bits >>> i) & 1) === 1;
  for (let i = 0; i <= 5; i += 1) set(8, i, bit(i));
  set(8, 7, bit(6));
  set(8, 8, bit(7));
  set(7, 8, bit(8));
  for (let i = 9; i < 15; i += 1) set(14 - i, 8, bit(i));
  for (let i = 0; i < 8; i += 1) set(size - 1 - i, 8, bit(i));
  for (let i = 8; i < 15; i += 1) set(8, size - 15 + i, bit(i));
  set(8, size - 8, true);
}

function placeCodewords({ size, modules, reserved }, codewords) {
  let index = 0;
  const total = codewords.length * 8;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert += 1) {
      for (let j = 0; j < 2; j += 1) {
        const x = right - j;
        const upward = ((right + 1) & 2) === 0;
        const y = upward ? size - 1 - vert : vert;
        if (reserved[y][x] || index >= total) continue;
        modules[y][x] = ((codewords[index >>> 3] >>> (7 - (index & 7))) & 1) === 1;
        index += 1;
      }
    }
  }
}

function applyMask({ size, modules, reserved }, mask) {
  const test = MASKS[mask];
  return modules.map((row, y) => row.map((dark, x) => (reserved[y][x] ? dark : dark !== test(x, y))));
}

const FINDER_LIKE = [
  [true, false, true, true, true, false, true, false, false, false, false],
  [false, false, false, false, true, false, true, true, true, false, true],
];

/** ISO/IEC 18004 penalty score (lower is better). */
export function penaltyScore(matrix) {
  const size = matrix.length;
  let score = 0;
  const lines = [];
  for (let i = 0; i < size; i += 1) {
    lines.push(matrix[i]);
    lines.push(matrix.map((row) => row[i]));
  }
  for (const line of lines) {
    let run = 1;
    for (let i = 1; i <= size; i += 1) {
      if (i < size && line[i] === line[i - 1]) run += 1;
      else {
        if (run >= 5) score += 3 + (run - 5);
        run = 1;
      }
    }
    for (let i = 0; i + 11 <= size; i += 1) {
      if (FINDER_LIKE.some((pattern) => pattern.every((dark, k) => line[i + k] === dark))) score += 40;
    }
  }
  for (let y = 0; y + 1 < size; y += 1) {
    for (let x = 0; x + 1 < size; x += 1) {
      const dark = matrix[y][x];
      if (dark === matrix[y][x + 1] && dark === matrix[y + 1][x] && dark === matrix[y + 1][x + 1]) score += 3;
    }
  }
  const darkCount = matrix.reduce((sum, row) => sum + row.filter(Boolean).length, 0);
  const total = size * size;
  score += (Math.ceil(Math.abs(darkCount * 20 - total * 10) / total) - 1) * 10;
  return score;
}

/**
 * Encode text as a QR code module matrix.
 * @param {string} text
 * @param {{ ecl?: 'L'|'M'|'Q'|'H', minVersion?: number, maxVersion?: number, mask?: number }} options
 * @returns {{ version: number, ecl: string, mask: number, size: number, modules: boolean[][] }}
 */
export function encodeQr(text, { ecl = 'M', minVersion = 1, maxVersion = 40, mask = null } = {}) {
  if (!(ecl in ECC_FORMAT_BITS)) throw new RangeError(`Unknown error-correction level ${ecl}`);
  const bytes = utf8Bytes(String(text));
  const version = chooseVersion(bytes.length, ecl, Math.max(1, minVersion), Math.min(40, maxVersion));
  if (!version) throw new RangeError('Text is too long for a QR code at this size');

  const grid = createGrid(version);
  placeCodewords(grid, buildCodewords(bytes, version, ecl));

  const candidates = Number.isInteger(mask) && mask >= 0 && mask < 8 ? [mask] : [0, 1, 2, 3, 4, 5, 6, 7];
  let best = null;
  for (const candidate of candidates) {
    const matrix = applyMask(grid, candidate);
    drawFormat((x, y, dark) => { matrix[y][x] = dark; }, grid.size, candidate, ecl);
    const score = candidates.length > 1 ? penaltyScore(matrix) : 0;
    if (!best || score < best.score) best = { mask: candidate, matrix, score };
  }
  return { version, ecl, mask: best.mask, size: grid.size, modules: best.matrix };
}

/**
 * Render a QR code as a standalone SVG string: dark modules on a light ground with a quiet zone.
 * @param {string} text
 * @param {{ ecl?: string, border?: number, dark?: string, light?: string, title?: string }} options
 */
export function qrSvg(text, { ecl = 'M', border = 4, dark = '#111323', light = '#f6ecd7', title = '' } = {}) {
  const { size, modules } = encodeQr(text, { ecl });
  const extent = size + border * 2;
  let path = '';
  modules.forEach((row, y) => row.forEach((on, x) => { if (on) path += `M${x + border},${y + border}h1v1h-1z`; }));
  const escape = (value) => String(value).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]);
  const label = title ? `<title>${escape(title)}</title>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${extent} ${extent}" shape-rendering="crispEdges" role="img"${title ? ` aria-label="${escape(title)}"` : ''}>${label}<rect width="${extent}" height="${extent}" fill="${light}"/><path d="${path}" fill="${dark}"/></svg>`;
}

if (typeof window !== 'undefined') {
  window.GARBA_QR = Object.freeze({ encodeQr, qrSvg, penaltyScore });
}
