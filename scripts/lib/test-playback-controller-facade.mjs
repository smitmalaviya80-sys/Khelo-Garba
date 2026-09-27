#!/usr/bin/env node

import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { VERSION, createPlaybackControllerFacade } = require('../../src/playback/playback-controller-facade.js');

const identityA = Object.freeze({
  canonicalId: 'song-a',
  title: 'Song A',
  artist: 'Artist A',
});
const identityB = Object.freeze({
  canonicalId: 'song-b',
  title: 'Song B',
  artist: 'Artist B',
});

function youtubeResolution(songId, videoId = 'abcdefghijk') {
  return Object.freeze({
    version: 1,
    kind: 'youtube-foreground',
    playable: true,
    backgroundCapable: false,
    songId,
    provider: 'youtube',
    media: null,
    provenance: Object.freeze({
      sourceType: 'youtube',
      sourceUrl: `https://www.youtube.com/watch?v=${videoId}`,
      videoId,
      startSeconds: 0,
    }),
  });
}

function directResolution(songId) {
  return Object.freeze({
    version: 1,
    kind: 'direct',
    playable: true,
    backgroundCapable: true,
    songId,
    provider: 'direct',
    media: Object.freeze({
      url: `https://cdn.example.test/${songId}.mp3`,
      mimeType: 'audio/mpeg',
    }),
    provenance: Object.freeze({
      sourceType: 'licensed-direct',
      rightsHolder: 'Example Rights Holder',
      licenseName: 'Example licence',
      proofUrl: `https://rights.example.test/${songId}`,
    }),
  });
}

function unavailableResolution(songId) {
  return Object.freeze({
    version: 1,
    kind: 'unavailable',
    playable: false,
    backgroundCapable: false,
    songId,
    provider: null,
    reason: 'no-executable-source',
    media: null,
    provenance: null,
  });
}

assert.equal(VERSION, 1);

{
  const controller = createPlaybackControllerFacade();
  const seen = [];
  const unsubscribe = controller.subscribe((snapshot, reason) => seen.push([snapshot.phase, reason]));
  const selected = controller.select({
    identity: identityA,
    resolution: youtubeResolution('song-a'),
    capabilities: { canPlay: true, canPause: true, canSeek: true },
    stage: { supported: true, visible: false, state: 'closed' },
  });

  assert.equal(selected.generation, 1);
  assert.equal(selected.canonicalId, 'song-a');
  assert.equal(selected.route.kind, 'youtube-foreground');
  assert.equal(selected.route.provider, 'youtube');
  assert.equal(selected.route.provenance.videoId, 'abcdefghijk');
  assert.equal(selected.phase, 'selected');
  assert.equal(selected.playbackState, 'none');
  assert.equal(selected.stage.supported, true);
  assert(Object.isFrozen(selected));
  assert(Object.isFrozen(selected.route));
  assert(Object.isFrozen(selected.identity));
  assert.deepEqual(seen, [['idle', 'subscribe'], ['selected', 'select']]);
  unsubscribe();
}

{
  const controller = createPlaybackControllerFacade();
  const selected = controller.select({ identity: identityA, resolution: directResolution('song-a') });
  assert.equal(selected.route.kind, 'direct');
  assert.equal(selected.route.backgroundCapable, true);
  assert.equal(selected.route.media.url, 'https://cdn.example.test/song-a.mp3');
  assert.equal(selected.capabilities.canPlay, true);
}

{
  const controller = createPlaybackControllerFacade();
  const selected = controller.select({ identity: identityA, resolution: unavailableResolution('song-a') });
  assert.equal(selected.phase, 'unavailable');
  assert.equal(selected.playbackState, 'none');
  assert.equal(selected.error.code, 'no-executable-source');
  assert.equal(controller.play().accepted, false);
  assert.equal(controller.retry().accepted, true);
}

{
  const controller = createPlaybackControllerFacade();
  controller.select({
    identity: identityA,
    resolution: youtubeResolution('song-a'),
    capabilities: { canPlay: true, canPause: true, canSeek: true, canStop: true },
    stage: { supported: true },
  });
  const generation = controller.getSnapshot().generation;

  const play = controller.play({ source: 'primary-control' });
  assert.equal(play.accepted, true);
  assert.equal(play.command.type, 'play');
  assert.equal(play.command.canonicalId, 'song-a');
  assert.equal(play.command.generation, generation);
  assert.equal(controller.getSnapshot().phase, 'selected', 'play intent must not fabricate Playing');

  assert.equal(controller.acceptEvidence({
    type: 'playing', canonicalId: 'song-a', generation, duration: 180, position: 4,
  }), true);
  assert.equal(controller.getSnapshot().phase, 'playing');
  assert.equal(controller.getSnapshot().playbackState, 'playing');

  const pause = controller.pause();
  assert.equal(pause.accepted, true);
  assert.equal(pause.command.sequence, play.command.sequence + 1);
  assert.equal(controller.getSnapshot().phase, 'playing', 'pause intent must await transport evidence');

  assert.equal(controller.acceptEvidence({
    type: 'paused', canonicalId: 'song-a', generation, position: 5,
  }), true);
  assert.equal(controller.getSnapshot().phase, 'paused');

  const seek = controller.seek(30, { source: 'progress' });
  assert.equal(seek.accepted, true);
  assert.equal(seek.command.payload.targetSeconds, 30);
  assert.equal(controller.seek(999).accepted, false);
  assert.equal(controller.openStage().accepted, true);
  assert.equal(controller.stop().accepted, true);
}

{
  const controller = createPlaybackControllerFacade();
  controller.select({ identity: identityA, resolution: youtubeResolution('song-a') });
  const generationA = controller.getSnapshot().generation;
  controller.select({ identity: identityB, resolution: youtubeResolution('song-b', 'lmnopqrstuv') });
  const before = controller.getSnapshot();

  assert.equal(controller.acceptEvidence({
    type: 'playing', canonicalId: 'song-a', generation: generationA, duration: 120, position: 10,
  }), false);
  assert.strictEqual(controller.getSnapshot(), before, 'late A evidence must not mutate B authority');
  assert.equal(controller.getSnapshot().canonicalId, 'song-b');
  assert.equal(controller.getSnapshot().phase, 'selected');
}

{
  const controller = createPlaybackControllerFacade();
  controller.select({ identity: identityA, resolution: directResolution('song-a') });
  const generation = controller.getSnapshot().generation;
  controller.clear();
  assert.equal(controller.getSnapshot().phase, 'idle');
  assert.equal(controller.getSnapshot().generation, generation + 1);
  assert.equal(controller.acceptEvidence({
    type: 'playing', canonicalId: 'song-a', generation,
  }), false, 'clear must invalidate older transport evidence');
}

{
  const controller = createPlaybackControllerFacade();
  controller.select({ identity: identityA, resolution: youtubeResolution('song-a') });
  const generation = controller.getSnapshot().generation;
  assert.equal(controller.acceptEvidence({
    type: 'capabilities', canonicalId: 'song-a', generation,
    capabilities: { canPlay: true, canPause: true, canSeek: true, canNext: true, canPrevious: true },
  }), true);
  assert.equal(controller.acceptEvidence({
    type: 'stage', canonicalId: 'song-a', generation,
    stage: { supported: true, visible: true, state: 'open' },
  }), true);
  assert.equal(controller.getSnapshot().stage.visible, true);
  assert.equal(controller.next().accepted, true);
  assert.equal(controller.previous().accepted, true);
}

{
  const controller = createPlaybackControllerFacade();
  assert.throws(() => controller.select({
    identity: identityA,
    resolution: youtubeResolution('song-b'),
  }), /match canonical identity/);
}

console.log('✓ playback-controller facade: route-neutral generation, commands, evidence and stale-event guards');
