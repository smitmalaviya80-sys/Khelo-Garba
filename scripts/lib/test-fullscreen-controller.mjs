import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  VERSION,
  createFullscreenController,
} = require('../../src/navigation/fullscreen-controller.js');

function createEnvironment({
  appLike = true,
  fullscreenEnabled = true,
  rejectEnterOnce = false,
  rejectExitOnce = false,
} = {}) {
  const listeners = new Map();
  const calls = {
    add: 0,
    remove: 0,
    enter: 0,
    exit: 0,
  };

  const documentRef = {
    fullscreenEnabled,
    fullscreenElement: null,
    addEventListener(type, listener) {
      calls.add += 1;
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(listener);
    },
    removeEventListener(type, listener) {
      calls.remove += 1;
      listeners.get(type)?.delete(listener);
    },
    async exitFullscreen() {
      calls.exit += 1;
      if (rejectExitOnce) {
        rejectExitOnce = false;
        const error = new Error('denied');
        error.name = 'NotAllowedError';
        throw error;
      }
      documentRef.fullscreenElement = null;
    },
  };

  const target = {
    async requestFullscreen() {
      calls.enter += 1;
      if (rejectEnterOnce) {
        rejectEnterOnce = false;
        const error = new Error('denied');
        error.name = 'NotAllowedError';
        throw error;
      }
      documentRef.fullscreenElement = target;
    },
  };

  function emit(type) {
    for (const listener of listeners.get(type) || []) listener();
  }

  return {
    calls,
    documentRef,
    target,
    emit,
    getAppLike: () => appLike,
    setAppLike(value) {
      appLike = value;
    },
  };
}

assert.equal(VERSION, 1);

{
  const env = createEnvironment({ appLike: false });
  const controller = createFullscreenController(env);
  assert.equal(env.calls.enter, 0, 'construction must never enter fullscreen');
  assert.equal(env.calls.exit, 0, 'construction must never exit fullscreen');
  assert.equal(controller.snapshot().visible, false);
  assert.equal(controller.snapshot().reason, 'surface-not-app-like');
  const result = await controller.performAction();
  assert.equal(result.status, 'unavailable');
  assert.equal(env.calls.enter, 0);
  assert.equal(env.calls.exit, 0);
}

{
  const env = createEnvironment({ fullscreenEnabled: false });
  env.target.requestFullscreen = undefined;
  const controller = createFullscreenController(env);
  const decision = controller.snapshot();
  assert.equal(decision.visible, false);
  assert.equal(decision.reason, 'fullscreen-enter-unavailable');
  const result = await controller.performAction();
  assert.equal(result.status, 'unavailable');
  assert.equal(env.calls.enter, 0);
}

{
  const env = createEnvironment();
  const controller = createFullscreenController(env);
  const before = controller.snapshot();
  assert.equal(before.visible, true);
  assert.equal(before.action, 'enter');
  assert.equal(env.calls.enter, 0);

  const result = await controller.performAction();
  assert.equal(result.status, 'fulfilled');
  assert.equal(result.action, 'enter');
  assert.equal(env.calls.enter, 1);
  assert.equal(result.after.action, 'exit');
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.before), true);
  assert.equal(Object.isFrozen(result.after), true);
}

{
  const env = createEnvironment();
  env.documentRef.fullscreenElement = env.target;
  const controller = createFullscreenController(env);
  assert.equal(controller.snapshot().action, 'exit');
  const result = await controller.performAction();
  assert.equal(result.status, 'fulfilled');
  assert.equal(result.action, 'exit');
  assert.equal(env.calls.exit, 1);
  assert.equal(result.after.action, 'enter');
}

{
  const env = createEnvironment();
  const externalFullscreenElement = {};
  env.documentRef.fullscreenElement = externalFullscreenElement;
  const controller = createFullscreenController(env);
  assert.equal(controller.snapshot().action, 'exit', 'any active document fullscreen state must reconcile as exit');
}

{
  const env = createEnvironment();
  const snapshots = [];
  const controller = createFullscreenController({
    ...env,
    onChange: (decision) => snapshots.push(decision),
  });

  const firstStart = controller.start();
  const secondStart = controller.start();
  assert.equal(firstStart.listening, true);
  assert.equal(secondStart.listening, true);
  assert.equal(env.calls.add, 1, 'duplicate start must not attach twice');
  assert.equal(snapshots.at(-1).action, 'enter');

  env.documentRef.fullscreenElement = env.target;
  env.emit('fullscreenchange');
  assert.equal(snapshots.at(-1).action, 'exit');

  env.documentRef.fullscreenElement = null;
  env.emit('fullscreenchange');
  assert.equal(snapshots.at(-1).action, 'enter', 'native/external exit must refresh through policy');

  const firstStop = controller.stop();
  const secondStop = controller.stop();
  assert.equal(firstStop.listening, false);
  assert.equal(secondStop.listening, false);
  assert.equal(env.calls.remove, 1, 'duplicate stop must not detach twice');

  const snapshotCount = snapshots.length;
  env.documentRef.fullscreenElement = env.target;
  env.emit('fullscreenchange');
  assert.equal(snapshots.length, snapshotCount, 'stopped controller must not react to fullscreenchange');
}

{
  const env = createEnvironment({ rejectEnterOnce: true });
  const controller = createFullscreenController(env);
  const rejected = await controller.performAction();
  assert.equal(rejected.status, 'rejected');
  assert.equal(rejected.action, 'enter');
  assert.equal(rejected.reason, 'fullscreen-operation-rejected');
  assert.equal(rejected.errorName, 'NotAllowedError');
  assert.equal(env.calls.enter, 1);
  assert.equal(controller.snapshot().action, 'enter');

  const retried = await controller.performAction();
  assert.equal(retried.status, 'fulfilled');
  assert.equal(env.calls.enter, 2);
  assert.equal(controller.snapshot().action, 'exit');
}

{
  const env = createEnvironment({ rejectExitOnce: true });
  env.documentRef.fullscreenElement = env.target;
  const controller = createFullscreenController(env);
  const rejected = await controller.performAction();
  assert.equal(rejected.status, 'rejected');
  assert.equal(rejected.action, 'exit');
  assert.equal(rejected.errorName, 'NotAllowedError');
  assert.equal(controller.snapshot().action, 'exit');

  const retried = await controller.performAction();
  assert.equal(retried.status, 'fulfilled');
  assert.equal(env.calls.exit, 2);
  assert.equal(controller.snapshot().action, 'enter');
}

{
  const env = createEnvironment();
  env.setAppLike('installed');
  const controller = createFullscreenController(env);
  const decision = controller.snapshot();
  assert.equal(decision.visible, false);
  assert.equal(decision.reason, 'capability-facts-invalid');
  const result = await controller.performAction();
  assert.equal(result.status, 'unavailable');
  assert.equal(env.calls.enter, 0);
}

{
  const env = createEnvironment();
  const controller = createFullscreenController({
    documentRef: env.documentRef,
    target: env.target,
    getAppLike: () => {
      throw new Error('fact source failed');
    },
  });
  const decision = controller.snapshot();
  assert.equal(decision.visible, false);
  assert.equal(decision.reason, 'capability-facts-invalid');
}

{
  const controller = createFullscreenController();
  const decision = controller.snapshot();
  assert.equal(decision.visible, false);
  assert.equal(decision.reason, 'capability-facts-invalid');
  const result = await controller.performAction();
  assert.equal(result.status, 'unavailable');
}

{
  const source = await readFile(new URL('../../src/navigation/fullscreen-controller.js', import.meta.url), 'utf8');
  const forbidden = [
    /navigator\s*\./,
    /\buserAgent\b/,
    /\bplatform\b/,
    /matchMedia\s*\(/,
    /localStorage/,
    /sessionStorage/,
  ];
  for (const pattern of forbidden) {
    assert.equal(pattern.test(source), false, `fullscreen controller must stay capability-driven: ${pattern}`);
  }
}


{
  const env = createEnvironment();
  env.documentRef.addEventListener = undefined;
  const controller = createFullscreenController(env);
  const startResult = controller.start();
  assert.equal(startResult.listening, false, 'start must not throw and remain non-listening when addEventListener is missing');
}


{
  const env = createEnvironment();
  const controller = createFullscreenController(env);

  Object.defineProperty(env.target, 'requestFullscreen', {
    get() {
      if (this.called) return undefined;
      this.called = true;
      return async () => {};
    },
    configurable: true
  });

  const result = await controller.performAction();
  assert.equal(result.status, 'unavailable');
  assert.equal(result.action, 'enter');
  assert.equal(result.reason, 'fullscreen-enter-unavailable');
}


{
  const env = createEnvironment();
  env.documentRef.fullscreenElement = env.target;
  const controller = createFullscreenController(env);

  Object.defineProperty(env.documentRef, 'exitFullscreen', {
    get() {
      if (this.called) return undefined;
      this.called = true;
      return async () => {};
    },
    configurable: true
  });

  const result = await controller.performAction();
  assert.equal(result.status, 'unavailable');
  assert.equal(result.action, 'exit');
  assert.equal(result.reason, 'fullscreen-exit-unavailable');
}


{
  const policyPath = require.resolve('../../src/navigation/fullscreen-policy.js');
  const controllerPath = require.resolve('../../src/navigation/fullscreen-controller.js');

  const originalPolicy = require.cache[policyPath];
  const originalController = require.cache[controllerPath];

  delete require.cache[controllerPath];

  require.cache[policyPath] = {
    id: policyPath,
    filename: policyPath,
    loaded: true,
    exports: {
      decideFullscreenControl() {
        return {
          visible: true,
          action: 'unknown_action',
          reason: null,
        };
      }
    }
  };

  const { createFullscreenController: createMockedFullscreenController } = require('../../src/navigation/fullscreen-controller.js');

  const env = createEnvironment();
  const controller = createMockedFullscreenController(env);
  const result = await controller.performAction();

  assert.equal(result.status, 'unavailable');
  assert.equal(result.reason, 'fullscreen-action-invalid');

  require.cache[policyPath] = originalPolicy;
  require.cache[controllerPath] = originalController;
}


{
  const env = createEnvironment();
  const controller = createFullscreenController(env);
  env.target.requestFullscreen = async () => { throw "string error, not object"; };
  const res = await controller.performAction();
  assert.equal(res.status, 'rejected');
  assert.equal(res.errorName, null);

  env.target.requestFullscreen = async () => { throw { name: '   CustomError   ' }; };
  const res2 = await controller.performAction();
  assert.equal(res2.errorName, 'CustomError');

  env.target.requestFullscreen = async () => { throw {}; };
  const res3 = await controller.performAction();
  assert.equal(res3.errorName, null);
}


{
  const policyPath = require.resolve('../../src/navigation/fullscreen-policy.js');
  const controllerPath = require.resolve('../../src/navigation/fullscreen-controller.js');

  const originalPolicy = require.cache[policyPath];
  const originalController = require.cache[controllerPath];

  delete require.cache[controllerPath];

  require.cache[policyPath] = {
    id: policyPath,
    filename: policyPath,
    loaded: true,
    exports: {
      decideFullscreenControl() {
        return {
          visible: true,
          action: null,
          reason: null, // this will trigger the 'fullscreen-action-unavailable' fallback in performAction()
        };
      }
    }
  };

  const { createFullscreenController: createMockedFullscreenController } = require('../../src/navigation/fullscreen-controller.js');

  const env = createEnvironment();
  const controller = createMockedFullscreenController(env);
  const result = await controller.performAction();

  assert.equal(result.status, 'unavailable');
  assert.equal(result.reason, 'fullscreen-action-unavailable');

  require.cache[policyPath] = originalPolicy;
  require.cache[controllerPath] = originalController;
}

console.log('fullscreen controller: ok');
