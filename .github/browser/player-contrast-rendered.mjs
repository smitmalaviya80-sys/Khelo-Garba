import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { chromium } from 'playwright';
import { PNG } from 'pngjs';

const ORIGIN = process.env.PLAYGARBA_CONTRAST_ORIGIN || 'http://127.0.0.1:4173';
const OUTPUT_ROOT = process.env.PLAYGARBA_CONTRAST_OUTPUT || 'test-results/player-contrast-rendered';
const EVIDENCE_DIR = path.join(OUTPUT_ROOT, 'evidence');
const TEXT_THRESHOLD = 4.5;
const CONTROL_THRESHOLD = 3;
const VIEWPORTS = [
  { name: 'mobile-390x844', width: 390, height: 844 },
  { name: 'desktop-1440x900', width: 1440, height: 900 },
];

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const roundRatio = (value) => Math.round(value * 100) / 100;

function parseCssColor(value) {
  const match = String(value || '').match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)$/i);
  if (!match) throw new Error(`Unsupported computed colour: ${value}`);
  return {
    r: Number(match[1]),
    g: Number(match[2]),
    b: Number(match[3]),
    a: match[4] === undefined ? 1 : Number(match[4]),
  };
}

function linearChannel(channel) {
  const value = channel / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function luminance({ r, g, b }) {
  return (0.2126 * linearChannel(r)) + (0.7152 * linearChannel(g)) + (0.0722 * linearChannel(b));
}

function contrastRatio(first, second) {
  const firstLuminance = luminance(first);
  const secondLuminance = luminance(second);
  const lighter = Math.max(firstLuminance, secondLuminance);
  const darker = Math.min(firstLuminance, secondLuminance);
  return (lighter + 0.05) / (darker + 0.05);
}

function composite(foreground, background) {
  const alpha = clamp(foreground.a ?? 1, 0, 1);
  return {
    r: (foreground.r * alpha) + (background.r * (1 - alpha)),
    g: (foreground.g * alpha) + (background.g * (1 - alpha)),
    b: (foreground.b * alpha) + (background.b * (1 - alpha)),
    a: 1,
  };
}

function pixelAt(png, x, y) {
  const safeX = clamp(Math.floor(x), 0, png.width - 1);
  const safeY = clamp(Math.floor(y), 0, png.height - 1);
  const offset = ((safeY * png.width) + safeX) * 4;
  const alpha = png.data[offset + 3] / 255;
  const raw = {
    r: png.data[offset],
    g: png.data[offset + 1],
    b: png.data[offset + 2],
    a: alpha,
  };
  return alpha >= 0.999 ? raw : composite(raw, { r: 255, g: 255, b: 255, a: 1 });
}

function normaliseRect(rect, png) {
  const left = clamp(Math.floor(rect.x), 0, png.width - 1);
  const top = clamp(Math.floor(rect.y), 0, png.height - 1);
  const right = clamp(Math.ceil(rect.x + rect.width), left + 1, png.width);
  const bottom = clamp(Math.ceil(rect.y + rect.height), top + 1, png.height);
  return { left, top, right, bottom };
}

function measureRectContrast(png, rect, foregroundCss) {
  const foreground = parseCssColor(foregroundCss);
  const bounds = normaliseRect(rect, png);
  let minimum = Number.POSITIVE_INFINITY;
  let worst = null;
  let samples = 0;

  for (let y = bounds.top; y < bounds.bottom; y += 1) {
    for (let x = bounds.left; x < bounds.right; x += 1) {
      const background = pixelAt(png, x, y);
      const renderedForeground = composite(foreground, background);
      const ratio = contrastRatio(renderedForeground, background);
      samples += 1;
      if (ratio < minimum) {
        minimum = ratio;
        worst = { x, y, background, renderedForeground };
      }
    }
  }

  return {
    ratio: roundRatio(minimum),
    samples,
    worst: worst && {
      x: worst.x,
      y: worst.y,
      background: [worst.background.r, worst.background.g, worst.background.b].map((value) => Math.round(value)),
      foreground: [worst.renderedForeground.r, worst.renderedForeground.g, worst.renderedForeground.b].map((value) => Math.round(value)),
    },
  };
}

function measureFocusContrast(png, controlRect, outlineCss, haloCss) {
  const outline = parseCssColor(outlineCss);
  const halo = parseCssColor(haloCss);
  const outer = normaliseRect({
    x: controlRect.x - 9,
    y: controlRect.y - 9,
    width: controlRect.width + 18,
    height: controlRect.height + 18,
  }, png);
  const inner = normaliseRect({
    x: controlRect.x - 1,
    y: controlRect.y - 1,
    width: controlRect.width + 2,
    height: controlRect.height + 2,
  }, png);
  let minimum = Number.POSITIVE_INFINITY;
  let worst = null;
  let samples = 0;

  for (let y = outer.top; y < outer.bottom; y += 1) {
    for (let x = outer.left; x < outer.right; x += 1) {
      if (x >= inner.left && x < inner.right && y >= inner.top && y < inner.bottom) continue;
      const underlying = pixelAt(png, x, y);
      const renderedHalo = composite(halo, underlying);
      const renderedOutline = composite(outline, renderedHalo);
      const ratio = contrastRatio(renderedOutline, renderedHalo);
      samples += 1;
      if (ratio < minimum) {
        minimum = ratio;
        worst = { x, y, underlying, renderedHalo, renderedOutline };
      }
    }
  }

  return {
    ratio: roundRatio(minimum),
    samples,
    worst: worst && {
      x: worst.x,
      y: worst.y,
      underlying: [worst.underlying.r, worst.underlying.g, worst.underlying.b].map((value) => Math.round(value)),
      halo: [worst.renderedHalo.r, worst.renderedHalo.g, worst.renderedHalo.b].map((value) => Math.round(value)),
      outline: [worst.renderedOutline.r, worst.renderedOutline.g, worst.renderedOutline.b].map((value) => Math.round(value)),
    },
  };
}

function extractShadowColours(boxShadow) {
  return [...String(boxShadow || '').matchAll(/rgba?\([^)]*\)/gi)].map((match) => match[0]);
}

async function waitForPlayer(page) {
  await page.goto(ORIGIN, { waitUntil: 'domcontentloaded' });
  await page.locator('#app').waitFor({ state: 'visible', timeout: 15_000 });
  await page.waitForFunction(() => document.getElementById('songTitle')?.textContent?.trim().length > 0, null, { timeout: 15_000 });
  await page.waitForFunction(() => document.querySelectorAll('#genreStrip .genre-button[data-genre-bound="true"]').length === 6, null, { timeout: 15_000 });
  await page.evaluate(async () => { if (document.fonts?.ready) await document.fonts.ready; });
}

async function settleWorld(page, genre) {
  const button = page.locator(`#genreStrip .genre-button[data-genre="${genre}"]`);
  await button.scrollIntoViewIfNeeded();
  await button.click();
  await page.waitForFunction((expected) => document.getElementById('app')?.dataset.genre === expected, genre, { timeout: 5_000 });
  await page.waitForFunction(() => {
    const layer = document.querySelector('.world-layer.is-visible');
    if (!(layer instanceof HTMLElement)) return false;
    return getComputedStyle(layer).backgroundImage !== 'none';
  }, null, { timeout: 5_000 });
  await page.waitForTimeout(250);
  return page.evaluate(() => {
    const layer = document.querySelector('.world-layer.is-visible');
    return layer instanceof HTMLElement ? getComputedStyle(layer).backgroundImage : null;
  });
}

async function collectTargets(page, genre) {
  return page.evaluate((activeGenre) => {
    const rectObject = (rect) => ({ x: rect.x, y: rect.y, width: rect.width, height: rect.height });
    const targetFromElement = (id, selector, threshold) => {
      const element = document.querySelector(selector);
      if (!(element instanceof HTMLElement)) throw new Error(`Missing contrast target: ${selector}`);
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return { id, threshold, foreground: style.color, rect: rectObject(rect) };
    };
    const textRangeTarget = (id, button, threshold) => {
      const textNode = [...button.childNodes].find((node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim());
      if (!textNode) throw new Error(`Missing text node for ${id}`);
      const range = document.createRange();
      range.selectNodeContents(textNode);
      const rect = range.getBoundingClientRect();
      const style = getComputedStyle(button);
      return { id, threshold, foreground: style.color, rect: rectObject(rect) };
    };
    const visibleControl = (id, selector) => {
      const button = document.querySelector(selector);
      if (!(button instanceof HTMLElement)) throw new Error(`Missing control: ${selector}`);
      const buttonRect = button.getBoundingClientRect();
      const buttonStyle = getComputedStyle(button);
      if (buttonStyle.display === 'none' || buttonStyle.visibility === 'hidden' || buttonRect.width <= 0 || buttonRect.height <= 0) return null;
      const icons = [...button.querySelectorAll('svg')].filter((icon) => {
        const style = getComputedStyle(icon);
        const rect = icon.getBoundingClientRect();
        return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) > 0 && rect.width > 0 && rect.height > 0;
      });
      const icon = icons[0];
      if (!(icon instanceof SVGElement)) throw new Error(`Visible SVG icon missing for ${selector}`);
      const iconRect = icon.getBoundingClientRect();
      return {
        id,
        threshold: 3,
        foreground: buttonStyle.color,
        rect: rectObject(iconRect),
        controlRect: rectObject(buttonRect),
      };
    };

    const buttons = [...document.querySelectorAll('#genreStrip .genre-button[data-genre]')].filter((button) => button instanceof HTMLButtonElement);
    const active = buttons.find((button) => button.dataset.genre === activeGenre);
    if (!(active instanceof HTMLButtonElement)) throw new Error(`Active genre button missing for ${activeGenre}`);
    const inactive = buttons.find((button) => {
      if (button === active) return false;
      const rect = button.getBoundingClientRect();
      return rect.left >= 0 && rect.right <= innerWidth && rect.top >= 0 && rect.bottom <= innerHeight;
    });
    if (!(inactive instanceof HTMLButtonElement)) throw new Error(`No fully visible inactive genre label beside ${activeGenre}`);

    return {
      text: [
        targetFromElement('genre-eyebrow', '#genreEyebrow', 4.5),
        targetFromElement('song-title', '#songTitle', 4.5),
        targetFromElement('song-artist', '#songArtist', 4.5),
        textRangeTarget('genre-active', active, 4.5),
        textRangeTarget('genre-inactive', inactive, 4.5),
      ],
      controls: [
        visibleControl('play-control', '#playButton'),
        visibleControl('search-control', '#searchButton'),
        visibleControl('queue-control', '#queueButton'),
      ].filter(Boolean),
    };
  }, genre);
}

async function getFocusStyle(page) {
  await page.evaluate(() => {
    const previous = document.getElementById('prevButton');
    if (!(previous instanceof HTMLButtonElement)) throw new Error('Previous button missing for keyboard focus evidence');
    previous.focus({ preventScroll: true });
  });
  await page.keyboard.press('Tab');
  return page.evaluate(() => {
    const button = document.getElementById('playButton');
    if (!(button instanceof HTMLButtonElement)) throw new Error('Play button missing for focus evidence');
    const style = getComputedStyle(button);
    return {
      outlineColor: style.outlineColor,
      outlineStyle: style.outlineStyle,
      outlineWidth: style.outlineWidth,
      boxShadow: style.boxShadow,
      focused: document.activeElement === button,
      activeElementId: document.activeElement?.id || null,
    };
  });
}

async function captureBackground(page) {
  const mask = await page.addStyleTag({ content: `
    #genreEyebrow, #songTitle, #songArtist,
    #genreStrip .genre-button[data-genre] {
      color: transparent !important;
      text-shadow: none !important;
    }
    #playButton svg, #searchButton svg, #queueButton svg {
      visibility: hidden !important;
    }
  ` });
  const buffer = await page.screenshot({ type: 'png', animations: 'disabled' });
  await mask.evaluate((node) => node.remove());
  return PNG.sync.read(buffer);
}

async function measureWorld(page, viewport, genre) {
  const backgroundImage = await settleWorld(page, genre);
  const targets = await collectTargets(page, genre);
  const evidenceFile = path.join(EVIDENCE_DIR, `${viewport.name}-${genre}.png`);
  await page.screenshot({ path: evidenceFile, type: 'png', animations: 'disabled' });
  const background = await captureBackground(page);

  const measurements = [];
  for (const target of [...targets.text, ...targets.controls]) {
    const measured = measureRectContrast(background, target.rect, target.foreground);
    measurements.push({
      id: target.id,
      threshold: target.threshold,
      foreground: target.foreground,
      rect: target.rect,
      ...measured,
      pass: measured.ratio >= target.threshold,
    });
  }

  const playControl = targets.controls.find((target) => target.id === 'play-control');
  if (!playControl) throw new Error('Play control was not measurable');
  const focusStyle = await getFocusStyle(page);
  const shadowColours = extractShadowColours(focusStyle.boxShadow);
  if (!focusStyle.focused || focusStyle.outlineStyle === 'none' || Number.parseFloat(focusStyle.outlineWidth) <= 0 || shadowColours.length === 0) {
    measurements.push({
      id: 'play-focus',
      threshold: CONTROL_THRESHOLD,
      ratio: 0,
      pass: false,
      error: `Keyboard focus indicator incomplete; active=${focusStyle.activeElementId || 'none'}, outline=${focusStyle.outlineStyle} ${focusStyle.outlineWidth}, shadow=${focusStyle.boxShadow}`,
    });
  } else {
    const haloCss = shadowColours[shadowColours.length - 1];
    const focus = measureFocusContrast(background, playControl.controlRect, focusStyle.outlineColor, haloCss);
    measurements.push({
      id: 'play-focus',
      threshold: CONTROL_THRESHOLD,
      outline: focusStyle.outlineColor,
      halo: haloCss,
      boxShadow: focusStyle.boxShadow,
      ...focus,
      pass: focus.ratio >= CONTROL_THRESHOLD,
    });
  }

  return {
    genre,
    backgroundImage,
    screenshot: evidenceFile,
    measurements,
    pass: measurements.every((measurement) => measurement.pass),
  };
}

await mkdir(EVIDENCE_DIR, { recursive: true });
const browser = await chromium.launch({ headless: true });
const report = {
  schemaVersion: 'player-contrast-rendered/v1',
  origin: ORIGIN,
  thresholds: { normalText: TEXT_THRESHOLD, controlsAndFocus: CONTROL_THRESHOLD },
  revision: process.env.GITHUB_SHA || null,
  viewports: [],
  summary: null,
};
const failures = [];

try {
  for (const viewport of VIEWPORTS) {
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      deviceScaleFactor: 1,
      reducedMotion: 'reduce',
    });
    const page = await context.newPage();
    await waitForPlayer(page);
    const genres = await page.locator('#genreStrip .genre-button[data-genre]').evaluateAll((buttons) => buttons.map((button) => button.dataset.genre));
    const uniqueGenres = [...new Set(genres.filter(Boolean))];
    if (uniqueGenres.length !== 6) throw new Error(`Expected exactly six courtyard worlds; found ${uniqueGenres.length}: ${uniqueGenres.join(', ')}`);

    const viewportResult = { ...viewport, worlds: [] };
    for (const genre of uniqueGenres) {
      try {
        const world = await measureWorld(page, viewport, genre);
        viewportResult.worlds.push(world);
        for (const measurement of world.measurements) {
          if (!measurement.pass) failures.push(`${viewport.name}/${genre}/${measurement.id}: ${measurement.error || `${measurement.ratio}:1 < ${measurement.threshold}:1`}`);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        viewportResult.worlds.push({ genre, pass: false, error: message, measurements: [] });
        failures.push(`${viewport.name}/${genre}/harness: ${message}`);
      }
    }
    report.viewports.push(viewportResult);
    await context.close();
  }
} finally {
  await browser.close();
}

const allMeasurements = report.viewports.flatMap((viewport) => viewport.worlds.flatMap((world) => (world.measurements || []).map((measurement) => ({ viewport: viewport.name, genre: world.genre, ...measurement }))));
const byKind = (prefixes) => allMeasurements.filter((measurement) => prefixes.some((prefix) => measurement.id.startsWith(prefix)));
const minimum = (measurements) => {
  const ratios = measurements.map((measurement) => measurement.ratio).filter((ratio) => Number.isFinite(ratio));
  return ratios.length ? Math.min(...ratios) : null;
};
report.summary = {
  worldsMeasured: report.viewports.reduce((sum, viewport) => sum + viewport.worlds.filter((world) => !world.error).length, 0),
  worldAttempts: report.viewports.reduce((sum, viewport) => sum + viewport.worlds.length, 0),
  measurements: allMeasurements.length,
  minimumTextRatio: minimum(byKind(['genre-eyebrow', 'song-', 'genre-active', 'genre-inactive'])),
  minimumControlRatio: minimum(byKind(['play-control', 'search-control', 'queue-control'])),
  minimumFocusRatio: minimum(byKind(['play-focus'])),
  failures,
  pass: failures.length === 0,
};

await writeFile(path.join(OUTPUT_ROOT, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(`Rendered player contrast: ${report.summary.worldsMeasured}/${report.summary.worldAttempts} world/viewport combinations, ${report.summary.measurements} measurements.`);
console.log(`Minimum text contrast: ${report.summary.minimumTextRatio ?? 'n/a'}:1`);
console.log(`Minimum control contrast: ${report.summary.minimumControlRatio ?? 'n/a'}:1`);
console.log(`Minimum focus contrast: ${report.summary.minimumFocusRatio ?? 'n/a'}:1`);

if (failures.length) {
  console.warn('Rendered contrast findings:');
  for (const failure of failures) console.warn(`- ${failure}`);
  if (process.env.PLAYGARBA_STRICT_CONTRAST === 'true') {
    process.exitCode = 1;
  }
} else {
  console.log('Rendered player contrast evidence OK');
}
