import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const cssPath = resolve(root, 'styles/00-foundation-and-player.css');
const css = readFileSync(cssPath, 'utf8');

const fail = (message) => {
  console.error(`player contrast validation failed: ${message}`);
  process.exitCode = 1;
};

const assert = (condition, message) => {
  if (!condition) fail(message);
};

const variable = (name) => {
  const match = css.match(new RegExp(`--${name}\\s*:\\s*([^;]+);`));
  if (!match) throw new Error(`missing --${name}`);
  return match[1].trim();
};

const parseHex = (value) => {
  const match = value.match(/^#([0-9a-f]{6})$/i);
  if (!match) throw new Error(`expected six-digit hex colour, received ${value}`);
  const hex = match[1];
  return [0, 2, 4].map((index) => Number.parseInt(hex.slice(index, index + 2), 16));
};

const parseRgba = (value) => {
  const match = value.match(/^rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(0(?:\.\d+)?|1(?:\.0+)?)\s*\)$/i);
  if (!match) throw new Error(`expected rgba() colour, received ${value}`);
  return {
    rgb: match.slice(1, 4).map(Number),
    alpha: Number(match[4]),
  };
};

const composite = (foreground, background, alpha) => foreground.map(
  (channel, index) => (alpha * channel) + ((1 - alpha) * background[index]),
);

const linearChannel = (channel) => {
  const value = channel / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
};

const luminance = (rgb) => {
  const [red, green, blue] = rgb.map(linearChannel);
  return (0.2126 * red) + (0.7152 * green) + (0.0722 * blue);
};

const contrastRatio = (first, second) => {
  const high = Math.max(luminance(first), luminance(second));
  const low = Math.min(luminance(first), luminance(second));
  return (high + 0.05) / (low + 0.05);
};

const ratioAtWorstCaseArtwork = ({ foreground, foregroundAlpha = 1, scrim, scrimAlpha }) => {
  // White is the conservative luminance ceiling for unknown artwork beneath a dark scrim.
  // Any darker source pixel makes the resulting background darker and improves contrast
  // for PlayGarba's light foreground colours.
  const white = [255, 255, 255];
  const background = composite(scrim, white, scrimAlpha);
  const renderedForeground = composite(foreground, background, foregroundAlpha);
  return contrastRatio(renderedForeground, background);
};

let ivory;
let textScrim;
let labelScrim;
let controlScrim;
let focusHalo;
let mutedText;

try {
  ivory = parseHex(variable('ivory'));
  textScrim = parseRgba(variable('courtyard-text-scrim'));
  labelScrim = parseRgba(variable('courtyard-label-scrim'));
  controlScrim = parseRgba(variable('courtyard-control-scrim'));
  focusHalo = parseRgba(variable('courtyard-focus-halo'));
  mutedText = parseRgba(variable('courtyard-muted-text'));
} catch (error) {
  fail(error.message);
}

if (!process.exitCode) {
  const titleRatio = ratioAtWorstCaseArtwork({
    foreground: ivory,
    scrim: textScrim.rgb,
    scrimAlpha: textScrim.alpha,
  });
  const genreRatio = ratioAtWorstCaseArtwork({
    foreground: mutedText.rgb,
    foregroundAlpha: mutedText.alpha,
    scrim: labelScrim.rgb,
    scrimAlpha: labelScrim.alpha,
  });
  const controlRatio = ratioAtWorstCaseArtwork({
    foreground: ivory,
    scrim: controlScrim.rgb,
    scrimAlpha: controlScrim.alpha,
  });
  const focusBackdrop = composite(focusHalo.rgb, [255, 255, 255], focusHalo.alpha);
  const focusRatio = contrastRatio(ivory, focusBackdrop);

  assert(titleRatio >= 4.5, `metadata floor ${titleRatio.toFixed(2)}:1 is below 4.5:1`);
  assert(genreRatio >= 4.5, `genre-label floor ${genreRatio.toFixed(2)}:1 is below 4.5:1`);
  assert(controlRatio >= 3, `control-icon floor ${controlRatio.toFixed(2)}:1 is below 3:1`);
  assert(focusRatio >= 3, `focus-ring inner/outer contrast ${focusRatio.toFixed(2)}:1 is below 3:1`);

  assert(/\.track-block::before\s*\{[\s\S]*?var\(--courtyard-text-scrim\)\s+0\s+72%/m.test(css), 'metadata scrim must retain a broad 72% high-contrast centre');
  assert(/\.genre-strip\s*\{[\s\S]*?var\(--courtyard-label-scrim\)\s+12%[\s\S]*?var\(--courtyard-label-scrim\)\s+88%/m.test(css), 'genre strip must retain its bounded contrast band');
  assert(/\.icon-button,\s*\.transport,\s*\.heart-button\s*\{[\s\S]*?background:\s*var\(--courtyard-control-scrim\)/m.test(css), 'primary icon controls must retain a local contrast surface');
  assert(/button:focus-visible,[\s\S]*?outline:\s*2px solid var\(--ivory\);[\s\S]*?box-shadow:\s*0 0 0 6px var\(--courtyard-focus-halo\)/m.test(css), 'normal-mode focus must retain a two-tone indicator');
  assert(/\.genre-button\s*\{[\s\S]*?color:\s*var\(--courtyard-muted-text\)/m.test(css), 'inactive genre labels must use the tested text token');

  if (!process.exitCode) {
    console.log('Player contrast contract OK');
    console.log(`metadata floor: ${titleRatio.toFixed(2)}:1`);
    console.log(`genre-label floor: ${genreRatio.toFixed(2)}:1`);
    console.log(`control-icon floor: ${controlRatio.toFixed(2)}:1`);
    console.log(`focus-ring inner/outer: ${focusRatio.toFixed(2)}:1`);
  }
}
