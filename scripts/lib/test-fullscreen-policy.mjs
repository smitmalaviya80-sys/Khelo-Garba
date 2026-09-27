import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  VERSION,
  decideFullscreenControl,
} = require('../../src/navigation/fullscreen-policy.js');

const base = Object.freeze({
  appLike: true,
  fullscreenEnabled: true,
  requestFullscreenAvailable: true,
  fullscreenActive: false,
  exitFullscreenAvailable: true,
});

function decide(overrides = {}) {
  return decideFullscreenControl({ ...base, ...overrides });
}

assert.equal(VERSION, 1);

{
  const result = decide({ appLike: false });
  assert.equal(result.visible, false);
  assert.equal(result.action, null);
  assert.equal(result.label, null);
  assert.equal(result.reason, 'surface-not-app-like');
  assert.deepEqual(result.capabilities, {
    appLike: false,
    canEnter: true,
    active: false,
    canExit: true,
  });
}

{
  const result = decide({ requestFullscreenAvailable: false });
  assert.equal(result.visible, false);
  assert.equal(result.reason, 'fullscreen-enter-unavailable');
  assert.equal(result.capabilities.canEnter, false);
}

{
  const result = decide({ fullscreenEnabled: false });
  assert.equal(result.visible, false);
  assert.equal(result.reason, 'fullscreen-enter-unavailable');
  assert.equal(result.capabilities.canEnter, false);
}

{
  const result = decide();
  assert.equal(result.visible, true);
  assert.equal(result.action, 'enter');
  assert.equal(result.label, 'Enter fullscreen');
  assert.equal(result.reason, null);
  assert.deepEqual(result.capabilities, {
    appLike: true,
    canEnter: true,
    active: false,
    canExit: true,
  });
}

{
  const result = decide({
    fullscreenEnabled: false,
    requestFullscreenAvailable: false,
    fullscreenActive: true,
    exitFullscreenAvailable: true,
  });
  assert.equal(result.visible, true);
  assert.equal(result.action, 'exit');
  assert.equal(result.label, 'Exit fullscreen');
  assert.equal(result.reason, null);
  assert.equal(result.capabilities.active, true);
  assert.equal(result.capabilities.canEnter, false);
}

{
  const result = decide({
    fullscreenActive: true,
    exitFullscreenAvailable: false,
  });
  assert.equal(result.visible, false);
  assert.equal(result.action, null);
  assert.equal(result.reason, 'fullscreen-exit-unavailable');
}

for (const invalid of [
  null,
  [],
  {},
  { ...base, appLike: 'yes' },
  { ...base, fullscreenEnabled: 1 },
  { ...base, requestFullscreenAvailable: undefined },
  { ...base, fullscreenActive: 'false' },
  { ...base, exitFullscreenAvailable: null },
]) {
  const result = decideFullscreenControl(invalid);
  assert.equal(result.visible, false);
  assert.equal(result.reason, 'capability-facts-invalid');
}

{
  const first = decide();
  const second = decide();
  assert.deepEqual(first, second);
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.capabilities), true);
  assert.throws(() => {
    first.visible = false;
  }, TypeError);
  assert.throws(() => {
    first.capabilities.canEnter = false;
  }, TypeError);
}

{
  const source = await readFile(new URL('../../src/navigation/fullscreen-policy.js', import.meta.url), 'utf8');
  const forbidden = [
    /navigator\s*\./,
    /\buserAgent\b/,
    /\bplatform\b/,
    /\bdocument\s*\./,
    /\bwindow\s*\./,
    /requestFullscreen\s*\(/,
    /exitFullscreen\s*\(/,
    /matchMedia\s*\(/,
  ];
  for (const pattern of forbidden) {
    assert.equal(pattern.test(source), false, `fullscreen policy must stay pure: ${pattern}`);
  }
}

console.log('fullscreen policy: ok');
