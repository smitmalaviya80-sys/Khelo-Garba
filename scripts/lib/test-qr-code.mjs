import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { encodeQr, qrSvg, penaltyScore } from '../../assets/runtime/qr-code.js';

const pass = (message) => console.log(`✓ ${message}`);
const rows = (modules) => modules.map((row) => row.map((dark) => (dark ? 1 : 0)).join('')).join('\n');
const digest = (modules) => createHash('sha256').update(rows(modules)).digest('hex').slice(0, 16);

// Known-good symbols. Each was cross-checked against OpenCV: the module matrix equals
// cv2.QRCodeEncoder output at the same version and mask (apart from remainder bits, which
// ISO/IEC 18004 masks and OpenCV does not), and cv2.QRCodeDetector decodes it to the input.
const circleLink = 'https://playgarba.com/?circle=1.1fyf8el.muhapozf.4jh1qw.f29.rangtaal-2025-03-hu-to-gai-ti-mele-garba-ramva';
const vectors = [
  ['A', 1, 3, 'bc9009ae87ca68f1'],
  ['hello world', 1, 2, '851bd1031e2539fc'],
  ['ગરબા · PlayGarba', 2, 1, 'e0f2943ba9d0ade7'],
  [circleLink, 6, 3, '2cfb5bfc6041bca7'],
  ['M'.repeat(152), 8, 1, '0c3dce64dc28f110'],
  ['x'.repeat(181), 10, 2, '6f87f0f4e0a3a510'],
  ['M'.repeat(213), 10, 1, 'cc4db01851e2d435'],
];
for (const [text, version, mask, hash] of vectors) {
  const qr = encodeQr(text);
  assert.equal(qr.version, version, `${text.length}-char version`);
  assert.equal(qr.mask, mask, `${text.length}-char mask`);
  assert.equal(qr.size, version * 4 + 17);
  assert.equal(digest(qr.modules), hash, `${text.length}-char module matrix`);
}
pass(`${vectors.length} known-good symbols (versions 1-10, UTF-8, realistic circle link) match their OpenCV-verified module matrices`);

// Byte-mode capacity at level M (ISO/IEC 18004 table 7)
const capacityM = [14, 26, 42, 62, 84, 106, 122, 152, 180, 213];
capacityM.forEach((capacity, index) => {
  assert.equal(encodeQr('a'.repeat(capacity)).version, index + 1, `capacity of version ${index + 1}`);
  assert.equal(encodeQr('a'.repeat(capacity + 1)).version, index + 2, `overflow of version ${index + 1}`);
});
assert.equal(encodeQr('a'.repeat(2331)).version, 40);
assert.throws(() => encodeQr('a'.repeat(2332)), RangeError);
assert.throws(() => encodeQr('a'.repeat(214), { maxVersion: 10 }), RangeError);
assert.throws(() => encodeQr('a', { ecl: 'X' }), RangeError);
pass('byte-mode level M capacities match the standard for versions 1-10, and oversize input is rejected');

function bchRemainder(value, bits, generator, degree) {
  let rem = value << degree;
  for (let i = bits + degree - 1; i >= degree; i -= 1) if ((rem >>> i) & 1) rem ^= generator << (i - degree);
  return rem;
}

function readFormat(modules) {
  const size = modules.length;
  const bit = (x, y) => (modules[y][x] ? 1 : 0);
  let first = 0;
  let second = 0;
  const firstPositions = [[8, 0], [8, 1], [8, 2], [8, 3], [8, 4], [8, 5], [8, 7], [8, 8], [7, 8], [5, 8], [4, 8], [3, 8], [2, 8], [1, 8], [0, 8]];
  firstPositions.forEach(([x, y], i) => { first |= bit(x, y) << i; });
  for (let i = 0; i < 8; i += 1) second |= bit(size - 1 - i, 8) << i;
  for (let i = 8; i < 15; i += 1) second |= bit(8, size - 15 + i) << i;
  return { first, second };
}

const ECL_BITS = { L: 1, M: 0, Q: 3, H: 2 };
function assertStructure(qr, ecl) {
  const { modules, size, version, mask } = qr;
  const finder = (ox, oy) => {
    for (let dy = -1; dy <= 7; dy += 1) {
      for (let dx = -1; dx <= 7; dx += 1) {
        const x = ox + dx;
        const y = oy + dy;
        if (x < 0 || y < 0 || x >= size || y >= size) continue;
        const ring = Math.max(Math.abs(dx - 3), Math.abs(dy - 3));
        assert.equal(modules[y][x], ring !== 2 && ring !== 4, `finder module ${x},${y} v${version}`);
      }
    }
  };
  finder(0, 0);
  finder(size - 7, 0);
  finder(0, size - 7);
  for (let i = 8; i < size - 8; i += 1) {
    assert.equal(modules[6][i], i % 2 === 0, 'horizontal timing');
    assert.equal(modules[i][6], i % 2 === 0, 'vertical timing');
  }
  assert.equal(modules[size - 8][8], true, 'dark module');

  const { first, second } = readFormat(modules);
  assert.equal(first, second, 'both format copies agree');
  const format = first ^ 0x5412;
  const data = format >>> 10;
  assert.equal(format & 0x3ff, bchRemainder(data, 5, 0x537, 10), 'format BCH');
  assert.equal(data >>> 3, ECL_BITS[ecl], 'format error-correction level');
  assert.equal(data & 7, mask, 'format mask');

  if (version >= 7) {
    let a = 0;
    let b = 0;
    for (let i = 0; i < 18; i += 1) {
      const x = size - 11 + (i % 3);
      const y = Math.floor(i / 3);
      a |= (modules[y][x] ? 1 : 0) << i;
      b |= (modules[x][y] ? 1 : 0) << i;
    }
    assert.equal(a, b, 'both version copies agree');
    assert.equal(a >>> 12, version, 'version number');
    assert.equal(a & 0xfff, bchRemainder(version, 6, 0x1f25, 12), 'version BCH');
  }
}

let structural = 0;
for (const ecl of ['L', 'M', 'Q', 'H']) {
  for (const length of [1, 20, 60, 100, 150, 200, 400, 900]) {
    const qr = encodeQr('g'.repeat(length), { ecl });
    assertStructure(qr, ecl);
    for (let mask = 0; mask < 8; mask += 1) {
      assertStructure(encodeQr('g'.repeat(length), { ecl, mask, minVersion: qr.version, maxVersion: qr.version }), ecl);
    }
    structural += 9;
  }
}
pass(`${structural} symbols across L/M/Q/H and all 8 masks have exact finders, timing, dark module, BCH-valid format and version info`);

// Mask selection picks the lowest penalty
for (const text of ['hello world', circleLink, 'x'.repeat(181)]) {
  const auto = encodeQr(text);
  const scores = Array.from({ length: 8 }, (_, mask) => penaltyScore(encodeQr(text, { mask, minVersion: auto.version, maxVersion: auto.version }).modules));
  assert.equal(scores[auto.mask], Math.min(...scores));
  assert.equal(scores.indexOf(Math.min(...scores)), auto.mask, 'ties resolve to the lowest mask');
}
assert.equal(penaltyScore([[true, true], [true, true]]), 3 + 90, '2x2 block and full-dark balance penalties');
pass('automatic mask is the penalty-score minimum');

// SVG rendering
const svg = qrSvg(circleLink, { title: 'Circle "link" <QR>' });
const qr = encodeQr(circleLink);
const extent = qr.size + 8;
assert(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"'));
assert(svg.includes(`viewBox="0 0 ${extent} ${extent}"`), 'four-module quiet zone on every side');
assert(svg.includes(`<rect width="${extent}" height="${extent}" fill="#f6ecd7"/>`));
assert.equal((svg.match(/h1v1h-1z/g) || []).length, qr.modules.flat().filter(Boolean).length, 'one square per dark module');
assert(svg.includes('M4,4h1v1h-1z'), 'top-left finder corner is offset by the quiet zone');
assert(svg.includes('<title>Circle &quot;link&quot; &lt;QR&gt;</title>'));
assert(!svg.includes('<QR>'));
assert(qrSvg('x', { border: 2 }).includes('viewBox="0 0 25 25"'));
pass('SVG output has a quiet zone, one square per dark module and escaped labels');

console.log('qr code tests passed');
