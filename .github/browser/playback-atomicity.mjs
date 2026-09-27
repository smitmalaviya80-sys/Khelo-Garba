import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';

const baseUrl = process.env.PLAYBACK_ATOMICITY_BASE_URL || 'http://127.0.0.1:4173';

const syntheticSongs = [
  {
    id: 'atomic-a',
    title: 'Atomic A',
    artist: 'GARBA test fixture',
    genre: 'traditional',
    audioUrl: null,
    youtubeId: 'atomic-video-a',
    durationSeconds: 300,
    playbackProvider: 'youtube',
    playbackSourceType: 'verified-youtube-track',
    playbackSearchOnly: false,
  },
  {
    id: 'atomic-b',
    title: 'Atomic B',
    artist: 'GARBA test fixture',
    genre: 'traditional',
    audioUrl: null,
    youtubeId: 'atomic-video-b',
    durationSeconds: 360,
    playbackProvider: 'youtube',
    playbackSourceType: 'verified-youtube-track',
    playbackSearchOnly: false,
  },
  {
    id: 'atomic-c',
    title: 'Atomic C',
    artist: 'GARBA test fixture',
    genre: 'traditional',
    audioUrl: null,
    youtubeId: 'atomic-video-c',
    durationSeconds: 420,
    playbackProvider: 'youtube',
    playbackSourceType: 'verified-youtube-track',
    playbackSearchOnly: false,
  },
  {
    id: 'atomic-d',
    title: 'Atomic D',
    artist: 'GARBA test fixture',
    genre: 'traditional',
    audioUrl: null,
    youtubeId: 'atomic-video-d',
    durationSeconds: 480,
    playbackProvider: 'youtube',
    playbackSourceType: 'verified-youtube-track',
    playbackSearchOnly: false,
  },
];

const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    serviceWorkers: 'block',
  });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await page.addInitScript(() => {
    const states = Object.freeze({
      ENDED: 0,
      PLAYING: 1,
      PAUSED: 2,
      BUFFERING: 3,
      CUED: 5,
    });
    const players = [];

    class FakeYoutubePlayer {
      constructor(_mountId, options = {}) {
        this.options = options;
        this.videoId = String(options.videoId || '');
        this.currentSeconds = 0;
        this.durationSeconds = 600;
        this.destroyed = false;
        players.push(this);
        queueMicrotask(() => options.events?.onReady?.({ target: this }));
      }

      loadVideoById(request = {}) {
        this.videoId = String(request.videoId || '');
        this.currentSeconds = Number(request.startSeconds || 0);
        if (Number.isFinite(request.endSeconds) && request.endSeconds > this.currentSeconds) {
          this.durationSeconds = Number(request.endSeconds);
        }
      }

      cueVideoById(request = {}) {
        this.loadVideoById(request);
      }

      getVideoData() {
        return { video_id: this.videoId };
      }

      getCurrentTime() {
        return this.currentSeconds;
      }

      getDuration() {
        return this.durationSeconds;
      }

      getPlaybackRate() {
        return 1;
      }

      playVideo() {
        this.emit(states.PLAYING);
      }

      pauseVideo() {
        this.emit(states.PAUSED);
      }

      seekTo(seconds) {
        this.currentSeconds = Number(seconds || 0);
      }

      destroy() {
        this.destroyed = true;
      }

      emit(state) {
        this.options.events?.onStateChange?.({ target: this, data: state });
      }
    }

    const snapshot = () => ({
      activeSongId: window.GARBA_YOUTUBE_PLAYER?.activeSongId || null,
      elapsed: document.getElementById('elapsedTime')?.textContent || '',
      duration: document.getElementById('durationTime')?.textContent || '',
      playing: Boolean(document.getElementById('app')?.classList.contains('is-playing')),
      playMode: document.getElementById('app')?.dataset.playMode || '',
    });

    window.__PLAYBACK_ATOMICITY = {
      players,
      states,
      resets: [],
      latest() {
        return players.at(-1) || null;
      },
      emit(index, { videoId, currentSeconds = 0, durationSeconds = 600, state = states.PLAYING }) {
        const player = players[index];
        if (!player) throw new Error(`Missing fake YouTube player ${index}`);
        player.videoId = String(videoId || '');
        player.currentSeconds = Number(currentSeconds || 0);
        player.durationSeconds = Number(durationSeconds || 0);
        player.emit(state);
      },
      snapshot,
    };

    window.addEventListener('garba:youtube-selection-reset', (event) => {
      window.__PLAYBACK_ATOMICITY.resets.push({
        detail: { ...event.detail },
        snapshot: snapshot(),
      });
    });

    window.YT = {
      Player: FakeYoutubePlayer,
      PlayerState: states,
    };
  });

  await page.goto(`${baseUrl}/`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(
    window.GARBA_YOUTUBE_PLAYER?.open
      && window.GARBA_NONSTOP?.play
      && window.GARBA_NONSTOP?.list
      && document.getElementById('elapsedTime')
      && document.getElementById('durationTime')
  ));

  const openedA = await page.evaluate(
    async (song) => window.GARBA_YOUTUBE_PLAYER.open(song, { autoplay: true, resume: false }),
    syntheticSongs[0]
  );
  assert.equal(openedA, true, 'fixture A should open');
  assert.equal(await page.evaluate(() => window.GARBA_YOUTUBE_PLAYER.activeSongId), 'atomic-a');
  assert.equal(await page.locator('#elapsedTime').textContent(), '0:00');
  assert.equal(await page.locator('#durationTime').textContent(), '5:00');
  assert.equal(await page.locator('#app').evaluate((node) => node.classList.contains('is-playing')), false);

  await page.evaluate(() => {
    window.__PLAYBACK_ATOMICITY.emit(0, {
      videoId: 'atomic-video-a',
      currentSeconds: 137,
      durationSeconds: 300,
      state: window.__PLAYBACK_ATOMICITY.states.PLAYING,
    });
  });
  assert.equal(await page.locator('#elapsedTime').textContent(), '2:17');
  assert.equal(await page.locator('#app').evaluate((node) => node.classList.contains('is-playing')), true);

  const rapidResults = await page.evaluate(async ([songB, songC]) => {
    const pendingB = window.GARBA_YOUTUBE_PLAYER.open(songB, { autoplay: true, resume: false });
    const pendingC = window.GARBA_YOUTUBE_PLAYER.open(songC, { autoplay: true, resume: false });
    return Promise.all([pendingB, pendingC]);
  }, [syntheticSongs[1], syntheticSongs[2]]);
  assert.deepEqual(rapidResults, [false, true], 'only the latest rapid selection may complete');
  assert.equal(await page.evaluate(() => window.GARBA_YOUTUBE_PLAYER.activeSongId), 'atomic-c');
  assert.equal(await page.locator('#elapsedTime').textContent(), '0:00');
  assert.equal(await page.locator('#durationTime').textContent(), '7:00');
  assert.equal(await page.locator('#app').evaluate((node) => node.classList.contains('is-playing')), false);

  await page.evaluate(() => {
    window.__PLAYBACK_ATOMICITY.emit(0, {
      videoId: 'atomic-video-a',
      currentSeconds: 201,
      durationSeconds: 300,
      state: window.__PLAYBACK_ATOMICITY.states.PLAYING,
    });
  });
  await page.waitForTimeout(30);
  assert.equal(await page.locator('#elapsedTime').textContent(), '0:00', 'stale A progress must not overwrite C');
  assert.equal(await page.locator('#durationTime').textContent(), '7:00', 'stale A duration must not overwrite C');
  assert.equal(await page.locator('#app').evaluate((node) => node.classList.contains('is-playing')), false, 'stale A PLAYING must be ignored');

  await page.evaluate(() => {
    window.__PLAYBACK_ATOMICITY.emit(0, {
      videoId: 'atomic-video-c',
      currentSeconds: 4,
      durationSeconds: 420,
      state: window.__PLAYBACK_ATOMICITY.states.PLAYING,
    });
  });
  assert.equal(await page.locator('#elapsedTime').textContent(), '0:04');
  assert.equal(await page.locator('#app').evaluate((node) => node.classList.contains('is-playing')), true);

  const closeDuringOpen = await page.evaluate(async (song) => {
    const pending = window.GARBA_YOUTUBE_PLAYER.open(song, { autoplay: true, resume: false });
    window.GARBA_YOUTUBE_PLAYER.close();
    return pending;
  }, syntheticSongs[3]);
  assert.equal(closeDuringOpen, false, 'close must win over an in-flight open');
  assert.equal(await page.evaluate(() => window.GARBA_YOUTUBE_PLAYER.activeSongId), null);
  assert.equal(await page.locator('#elapsedTime').textContent(), '0:00');
  assert.equal(await page.locator('#durationTime').textContent(), '0:00');
  assert.equal(await page.locator('#app').evaluate((node) => node.classList.contains('is-playing')), false);

  const reopenedC = await page.evaluate(
    async (song) => window.GARBA_YOUTUBE_PLAYER.open(song, { autoplay: true, resume: false }),
    syntheticSongs[2]
  );
  assert.equal(reopenedC, true);
  assert.equal(await page.evaluate(() => window.__PLAYBACK_ATOMICITY.players.length), 2, 'close should force a new player generation');

  await page.evaluate(() => {
    window.__PLAYBACK_ATOMICITY.emit(0, {
      videoId: 'atomic-video-d',
      currentSeconds: 88,
      durationSeconds: 480,
      state: window.__PLAYBACK_ATOMICITY.states.PLAYING,
    });
  });
  assert.equal(await page.locator('#elapsedTime').textContent(), '0:00', 'destroyed player callback must not mutate the new generation');
  assert.equal(await page.locator('#app').evaluate((node) => node.classList.contains('is-playing')), false);

  await page.evaluate(() => {
    window.__PLAYBACK_ATOMICITY.emit(1, {
      videoId: 'atomic-video-c',
      currentSeconds: 11,
      durationSeconds: 420,
      state: window.__PLAYBACK_ATOMICITY.states.PLAYING,
    });
  });
  assert.equal(await page.locator('#elapsedTime').textContent(), '0:11');
  assert.equal(await page.locator('#app').evaluate((node) => node.classList.contains('is-playing')), true);

  const nonstop = await page.evaluate(async () => {
    const sets = await window.GARBA_NONSTOP.list();
    const selected = sets.find((set) => set.id === 'set-aditya-ochhav-2023')
      || sets.find((set) => set.videoId)
      || null;
    if (!selected) return { selected: null, opened: false };
    const opened = await window.GARBA_NONSTOP.play(selected.id, { quiet: true });
    return {
      selected: {
        id: selected.id,
        videoId: selected.videoId,
        durationSeconds: selected.durationSeconds || 0,
      },
      opened,
    };
  });
  assert.ok(nonstop.selected, 'a Nonstop fixture must be available');
  assert.equal(nonstop.opened, true, 'Nonstop fixture should open through the shared YouTube runtime');
  assert.equal(await page.evaluate(() => window.GARBA_YOUTUBE_PLAYER.activeSongId), `nonstop:${nonstop.selected.id}`);
  assert.equal(await page.locator('#app').getAttribute('data-play-mode'), 'nonstop');
  assert.equal(await page.locator('#elapsedTime').textContent(), '0:00', 'song elapsed must reset on Nonstop identity');
  assert.equal(await page.locator('#app').evaluate((node) => node.classList.contains('is-playing')), false, 'Nonstop identity reset must not inherit Playing');

  const latestReset = await page.evaluate(() => window.__PLAYBACK_ATOMICITY.resets.at(-1));
  assert.equal(latestReset.detail.songId, `nonstop:${nonstop.selected.id}`);
  assert.equal(latestReset.detail.videoId, nonstop.selected.videoId);
  assert.equal(latestReset.detail.position, 0);
  assert.equal(latestReset.snapshot.elapsed, '0:00');
  assert.equal(latestReset.snapshot.playing, false);
  assert.equal(latestReset.snapshot.playMode, 'nonstop');

  await page.evaluate(() => {
    window.__PLAYBACK_ATOMICITY.emit(1, {
      videoId: 'atomic-video-c',
      currentSeconds: 222,
      durationSeconds: 420,
      state: window.__PLAYBACK_ATOMICITY.states.PLAYING,
    });
  });
  await page.waitForTimeout(30);
  assert.equal(await page.locator('#elapsedTime').textContent(), '0:00', 'stale song progress must not overwrite Nonstop');
  assert.equal(await page.locator('#app').evaluate((node) => node.classList.contains('is-playing')), false, 'stale song PLAYING must not overwrite Nonstop');

  await page.evaluate(({ videoId, durationSeconds }) => {
    window.__PLAYBACK_ATOMICITY.emit(1, {
      videoId,
      currentSeconds: 9,
      durationSeconds: Math.max(9, durationSeconds || 600),
      state: window.__PLAYBACK_ATOMICITY.states.PLAYING,
    });
  }, nonstop.selected);
  assert.equal(await page.locator('#elapsedTime').textContent(), '0:09');
  assert.equal(await page.locator('#app').evaluate((node) => node.classList.contains('is-playing')), true);
  assert.equal(await page.evaluate(() => window.GARBA_YOUTUBE_PLAYER.activeSongId), `nonstop:${nonstop.selected.id}`);

  const resetIds = await page.evaluate(() => window.__PLAYBACK_ATOMICITY.resets.map((entry) => entry.detail.songId));
  assert.ok(resetIds.includes('atomic-a'));
  assert.ok(resetIds.includes('atomic-b'));
  assert.ok(resetIds.includes('atomic-c'));
  assert.ok(resetIds.includes('atomic-d'));
  assert.equal(resetIds.at(-1), `nonstop:${nonstop.selected.id}`);
  assert.deepEqual(pageErrors, []);

  await context.close();
  console.log('✓ playback identity, progress and Playing state stay atomic across rapid YouTube and Nonstop transitions');
} finally {
  await browser.close();
}
