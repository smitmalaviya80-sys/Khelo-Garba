(() => {
  /*
    Garba Atmosphere.

    Atmosphere plays a Garba night around the song: the crowd, the circle's claps or
    dandiya sticks, and the venue those sounds are heard in. Songs play through the
    YouTube player, whose audio a page cannot reach, so the song itself is never
    processed. Everything here is either public-domain ambience or synthesised.

    The audio engine below has no DOM dependencies so the same code can render
    offline previews with an OfflineAudioContext.
  */

  const TAU = Math.PI * 2;

  // ---------------------------------------------------------------------------
  // Venues. Each builds a stereo impulse response and a tone curve for the
  // atmosphere layers. Times are seconds, levels are linear gain.
  // ---------------------------------------------------------------------------
  const VENUES = {
    stadium: {
      label: 'Indoor stadium',
      desc: 'A big covered arena. A long, dense reverb and a slap back off the far stands.',
      trim: 1,
      dry: 0.58,
      wet: 0.9,
      clappers: 60,
      spread: 0.014,
      distance: [2.5, 12],
      far: [22, 48],
      tone: { lowShelf: [160, 2.5], mid: [300, 0.9, 1.5], highShelf: [5500, -3] },
      ir: {
        length: 4.4,
        predelay: 0.035,
        early: { count: 24, from: 0.02, to: 0.12, level: 0.7 },
        taps: [[0.19, 0.3, 3500], [0.31, 0.16, 2800]],
        tail: { level: 0.24, rt: [3.0, 2.5, 1.4] },
      },
      // The song's own room: its dhol blooms into a long boom under the roof
      room: { level: 0.08, cut: 700 },
      night: 0,
      roomTone: 0.02,
    },
    outdoors: {
      label: 'Outdoors',
      desc: 'An open garba ground. Almost no reverb, just echoes off the speaker stacks and distant buildings.',
      trim: 1.4,
      dry: 1,
      wet: 0.4,
      clappers: 45,
      spread: 0.013,
      distance: [2.2, 9],
      far: [28, 62],
      tone: { lowShelf: [140, -3], mid: [2600, 0.8, 1.5], highShelf: [5500, -3.5] },
      ir: {
        length: 2.6,
        predelay: 0.004,
        // Ground bounce, then the speaker stacks around the ground, then far buildings
        taps: [[0.004, 0.42, 9000], [0.11, 0.26, 3200], [0.23, 0.16, 2800], [0.42, 0.09, 1700], [0.68, 0.05, 1300], [0.95, 0.03, 1100]],
        tail: { level: 0.03, rt: [1, 0.8, 0.4] },
      },
      // The song's own room: its dhol comes back off the speaker stacks and the buildings round the ground
      room: { level: 0.2, cut: 1100 },
      night: 1,
      roomTone: 0,
    },
    sheri: {
      label: 'Sheri',
      desc: 'A lane between houses. Bright flutter off the walls, a short tail.',
      trim: 1.2,
      dry: 0.9,
      wet: 0.58,
      clappers: 20,
      spread: 0.009,
      distance: [1.4, 4.5],
      far: [12, 26],
      tone: { lowShelf: [160, -1], mid: [2400, 0.9, 1.5], highShelf: [6500, -1] },
      ir: {
        length: 1.8,
        predelay: 0.008,
        flutter: { period: 0.038, count: 11, decay: 0.58, first: 0.3 },
        taps: [[0.012, 0.3, 8000], [0.026, 0.2, 7000]],
        tail: { level: 0.16, rt: [1.1, 0.95, 0.6] },
      },
      // The song's own room: its dhol flutters between the house walls
      room: { level: 0.11, cut: 1600 },
      night: 0.55,
      roomTone: 0,
    },
  };

  // Where the listener stands. Far away: the circle loses its direct sound and highs,
  // the room takes over, the image narrows, and the far side of the circle arrives later.
  const LISTENERS = {
    circle: { label: 'In the circle', desc: 'You are dancing, with clappers all around you.', dry: 1, wet: 1, dryCut: 20000, wetCut: 20000, width: 1 },
    far: { label: 'Far away', desc: 'You are watching from the far edge. The circle sounds distant, softer and more echoey.', dry: 0.26, wet: 0.95, dryCut: 2000, wetCut: 4200, width: 0.3 },
    stage: { label: 'By the stage', desc: 'You are up front by the band, with the circle clapping behind you.', dry: 0.55, wet: 0.8, dryCut: 6000, wetCut: 7500, width: 0.65 },
  };

  // Claps land on these beats of each round, counted from the first tap.
  // Be tali and Tran tali timings need confirming by someone who dances them.
  const PATTERNS = {
    beat: { label: 'On the beat', cycle: 1, hits: [0] },
    'be-tali': { label: 'Be tali', cycle: 4, hits: [2, 3] },
    'tran-tali': { label: 'Tran tali', cycle: 4, hits: [1, 2, 3] },
  };

  const PREVIEW_BPM = 112;

  function seeded(seed) {
    let s = seed >>> 0 || 1;
    return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  }
  function gauss(rand) {
    let u = 0; let v = 0;
    while (u === 0) u = rand();
    while (v === 0) v = rand();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * v);
  }

  // Simple one-pole filters for building buffers offline.
  function onePoleLow(data, cutoff, rate) {
    const a = Math.exp(-TAU * cutoff / rate);
    let y = 0;
    for (let i = 0; i < data.length; i += 1) { y = (1 - a) * data[i] + a * y; data[i] = y; }
    return data;
  }

  function buildImpulse(ctx, venue, seed) {
    const rate = ctx.sampleRate;
    const spec = venue.ir;
    const length = Math.ceil(spec.length * rate);
    const buffer = ctx.createBuffer(2, length, rate);
    const rand = seeded(seed);
    for (let ch = 0; ch < 2; ch += 1) {
      const out = buffer.getChannelData(ch);
      const start = Math.floor(spec.predelay * rate);
      // Diffuse tail in three bands with their own decay times (low, mid, high).
      const noise = new Float32Array(length);
      for (let i = 0; i < length; i += 1) noise[i] = rand() * 2 - 1;
      const low = onePoleLow(Float32Array.from(noise), 320, rate);
      const lowMid = onePoleLow(Float32Array.from(noise), 3200, rate);
      const [rtLow, rtMid, rtHigh] = spec.tail.rt;
      for (let i = start; i < length; i += 1) {
        const t = (i - start) / rate;
        const fadeIn = Math.min(1, t / 0.018);
        const mid = lowMid[i] - low[i];
        const high = noise[i] - lowMid[i];
        const value = low[i] * Math.exp(-6.91 * t / rtLow) * 1.4
          + mid * Math.exp(-6.91 * t / rtMid)
          + high * Math.exp(-6.91 * t / rtHigh) * 0.7;
        out[i] = value * spec.tail.level * fadeIn;
      }
      // Discrete reflections, softened with their own low-pass.
      const addTap = (time, level, cutoff) => {
        const width = Math.floor(0.0022 * rate);
        const at = Math.floor((time + (ch ? 0.0007 : 0)) * rate);
        const burst = new Float32Array(width);
        for (let i = 0; i < width; i += 1) burst[i] = (rand() * 2 - 1) * Math.exp(-i / (width * 0.25));
        onePoleLow(burst, cutoff, rate);
        const sign = rand() < 0.5 ? -1 : 1;
        for (let i = 0; i < width && at + i < length; i += 1) out[at + i] += burst[i] * level * sign * 3;
      };
      (spec.taps || []).forEach(([time, level, cutoff]) => addTap(time, level, cutoff));
      if (spec.flutter) {
        const f = spec.flutter;
        for (let k = 0; k < f.count; k += 1) addTap(spec.predelay + f.period * (k + 1), f.first * Math.pow(f.decay, k), 7000 - k * 350);
      }
      if (spec.early) {
        const e = spec.early;
        for (let k = 0; k < e.count; k += 1) {
          const time = e.from + (e.to - e.from) * rand();
          addTap(time, e.level * (1 - (time - e.from) / (e.to - e.from) * 0.6) * (0.5 + rand() * 0.5), 5200);
        }
      }
    }
    // Unit energy, so each venue's wet gain alone sets how much of the room you hear.
    let energy = 0;
    for (let ch = 0; ch < 2; ch += 1) { const d = buffer.getChannelData(ch); for (let i = 0; i < d.length; i += 1) energy += d[i] * d[i]; }
    const scale = energy > 0 ? 1 / Math.sqrt(energy / 2) : 1;
    for (let ch = 0; ch < 2; ch += 1) { const d = buffer.getChannelData(ch); for (let i = 0; i < d.length; i += 1) d[i] *= scale; }
    return buffer;
  }

  // Hand claps, one person at a time. A clap is a single puff of air squeezed out of the
  // pocket between the palms. That pocket rings like a Helmholtz resonator, and the soft
  // skin damps it within a few milliseconds. Palm to palm gives a narrow peak below 1 kHz
  // with a dip near 2.5 kHz; cupped hands ring lower; fingers on palm give a broad peak
  // near 2 kHz. (Repp 1987; Peltola et al. 2007; Physical Review Research 7, 013259, 2025.)
  const HANDS = {
    cupped: { f: [470, 680], q: [6, 9], notch: 0, crack: 0.14 },
    palm: { f: [760, 980], q: [3.8, 5.8], notch: 2500, crack: 0.26 },
    finger: { f: [1700, 2400], q: [2.4, 3.6], notch: 0, crack: 0.45 },
  };
  function pickHands(rand) {
    const r = rand();
    return r < 0.25 ? 'cupped' : r < 0.8 ? 'palm' : 'finger';
  }

  // RBJ biquad, applied in place: band-pass (0 dB peak), notch or high-pass.
  function biquad(data, type, freq, q, rate) {
    const w = TAU * freq / rate;
    const cos = Math.cos(w);
    const alpha = Math.sin(w) / (2 * q);
    let b0; let b1; let b2;
    if (type === 'bandpass') { b0 = alpha; b1 = 0; b2 = -alpha; }
    else if (type === 'notch') { b0 = 1; b1 = -2 * cos; b2 = 1; }
    else { b0 = (1 + cos) / 2; b1 = -(1 + cos); b2 = (1 + cos) / 2; }
    const a0 = 1 + alpha; const a1 = -2 * cos; const a2 = 1 - alpha;
    let x1 = 0; let x2 = 0; let y1 = 0; let y2 = 0;
    for (let i = 0; i < data.length; i += 1) {
      const x = data[i];
      const y = (b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0;
      x2 = x1; x1 = x; y2 = y1; y1 = y; data[i] = y;
    }
    return data;
  }

  function buildClap(ctx, rand, hand, { freq, q, brightness = 1, distance = 3 }) {
    const rate = ctx.sampleRate;
    const length = Math.ceil(0.09 * rate);
    const buffer = ctx.createBuffer(1, length, rate);
    const out = buffer.getChannelData(0);
    const spec = HANDS[hand];
    // The air puff: a very fast noise burst, about half a millisecond long.
    const puff = new Float32Array(length);
    const attack = 0.00015 * rate;
    const tau = (0.00045 + rand() * 0.0002) * rate;
    for (let i = 0; i < length; i += 1) {
      const env = i < attack ? i / attack : Math.exp(-(i - attack) / tau);
      puff[i] = (rand() * 2 - 1) * env;
    }
    // The palms' pocket ringing at its own pitch
    const ring = biquad(Float32Array.from(puff), 'bandpass', freq, q, rate);
    // The skin-on-skin crack: the upper part of the same burst, centred around 3.5 kHz
    const crack = biquad(Float32Array.from(puff), 'bandpass', 3400 + rand() * 600, 0.9, rate);
    for (let i = 0; i < length; i += 1) out[i] = ring[i] * 5 + crack[i] * spec.crack * brightness;
    if (hand === 'cupped') {
      const body = 170 + rand() * 90;
      for (let i = 0; i < Math.min(length, rate * 0.02); i += 1) out[i] += Math.sin(TAU * body * i / rate) * Math.exp(-i / (rate * 0.0025)) * 0.018;
    }
    if (spec.notch) biquad(out, 'notch', spec.notch * (0.95 + rand() * 0.1), 1.6, rate);
    // Air softens the far side of the circle a little
    onePoleLow(out, Math.max(3200, 6800 - distance * 300), rate);
    onePoleLow(out, Math.max(3200, 6800 - distance * 300), rate);
    normalise(out, 0.9);
    return buffer;
  }

  // Dandiya: two wooden sticks struck together. A few inharmonic modes and a click.
  function buildStick(ctx, rand) {
    const rate = ctx.sampleRate;
    const length = Math.ceil(0.12 * rate);
    const buffer = ctx.createBuffer(1, length, rate);
    const out = buffer.getChannelData(0);
    const f0 = 1050 + rand() * 500;
    const modes = [[1, 1, 0.018], [2.37, 0.55, 0.011], [3.9, 0.3, 0.007], [5.6, 0.12, 0.005]];
    const second = 0.0015 + rand() * 0.002;
    for (let i = 0; i < length; i += 1) {
      const t = i / rate;
      let v = 0;
      for (const [ratio, amp, dec] of modes) {
        v += Math.sin(TAU * f0 * ratio * t) * amp * Math.exp(-t / dec);
        if (t > second) v += Math.sin(TAU * f0 * 1.08 * ratio * (t - second)) * amp * 0.7 * Math.exp(-(t - second) / dec);
      }
      if (t < 0.002) v += (rand() * 2 - 1) * (1 - t / 0.002) * 0.8;
      out[i] = v;
    }
    normalise(out, 0.85);
    return buffer;
  }

  // A low dhol stroke, used only for the venue's echo of the song: never heard dry, only as the room answering
  // the song's beat. Two takes: the stronger bayan stroke and a softer one.
  function buildThump(ctx, strong) {
    const rate = ctx.sampleRate;
    const length = Math.ceil(0.42 * rate);
    const buffer = ctx.createBuffer(1, length, rate);
    const out = buffer.getChannelData(0);
    const f0 = strong ? 92 : 108, f1 = strong ? 52 : 64, decay = strong ? 0.2 : 0.13;
    let phase = 0;
    for (let i = 0; i < length; i += 1) {
      const t = i / rate;
      const f = f1 + (f0 - f1) * Math.exp(-t / 0.045);
      phase += TAU * f / rate;
      let v = Math.sin(phase) * Math.exp(-t / decay) * Math.min(1, t / 0.003);
      // The skin's slap, an octave and a fifth up, gone in a few milliseconds
      v += Math.sin(phase * 3) * 0.25 * Math.exp(-t / 0.012);
      out[i] = v;
    }
    normalise(out, 0.9);
    return buffer;
  }

  function normalise(data, peak) {
    let max = 0;
    for (let i = 0; i < data.length; i += 1) max = Math.max(max, Math.abs(data[i]));
    if (max > 0) for (let i = 0; i < data.length; i += 1) data[i] *= peak / max;
  }

  // Crossfade the tail of a loop into its head so the bed never clicks when it wraps.
  function seamless(ctx, buffer, fade = 1.2) {
    const rate = buffer.sampleRate;
    const n = Math.min(Math.floor(fade * rate), Math.floor(buffer.length / 3));
    const length = buffer.length - n;
    const out = ctx.createBuffer(buffer.numberOfChannels, length, rate);
    for (let ch = 0; ch < buffer.numberOfChannels; ch += 1) {
      const src = buffer.getChannelData(ch);
      const dst = out.getChannelData(ch);
      dst.set(src.subarray(0, length));
      for (let i = 0; i < n; i += 1) {
        const x = i / n;
        dst[i] = src[i] * Math.sin(x * Math.PI / 2) + src[length + i] * Math.cos(x * Math.PI / 2);
      }
    }
    return out;
  }

  function createEngine(ctx, { destination = ctx.destination, loadBed = async () => null, seed = 11 } = {}) {
    const rand = seeded(seed);
    const now = () => ctx.currentTime;
    const nodes = {};

    nodes.out = ctx.createGain();
    nodes.out.gain.value = 0;
    nodes.highpass = ctx.createBiquadFilter();
    nodes.highpass.type = 'highpass';
    nodes.highpass.frequency.value = 55;
    nodes.compressor = ctx.createDynamicsCompressor();
    nodes.compressor.threshold.value = -18;
    nodes.compressor.knee.value = 12;
    nodes.compressor.ratio.value = 3;
    nodes.compressor.attack.value = 0.005;
    nodes.compressor.release.value = 0.25;
    nodes.out.connect(nodes.highpass).connect(nodes.compressor).connect(destination);

    // Tone curve shared by dry and wet paths
    nodes.lowShelf = ctx.createBiquadFilter(); nodes.lowShelf.type = 'lowshelf';
    nodes.mid = ctx.createBiquadFilter(); nodes.mid.type = 'peaking';
    nodes.highShelf = ctx.createBiquadFilter(); nodes.highShelf.type = 'highshelf';
    nodes.lowShelf.connect(nodes.mid).connect(nodes.highShelf).connect(nodes.out);

    // The circle's direct sound passes a distance filter, so a far listener hears it duller.
    nodes.distance = ctx.createBiquadFilter();
    nodes.distance.type = 'lowpass';
    nodes.distance.frequency.value = 20000;
    nodes.distance.Q.value = 0.5;
    nodes.distance.connect(nodes.lowShelf);
    nodes.dry = ctx.createGain();
    nodes.dry.connect(nodes.distance);
    // Sounds right beside the listener (crickets, room tone) skip the distance filter.
    nodes.near = ctx.createGain();
    nodes.near.connect(nodes.lowShelf);
    // Two convolvers so a venue change crossfades instead of cutting
    nodes.verbs = [0, 1].map(() => {
      const convolver = ctx.createConvolver();
      convolver.normalize = false;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      convolver.connect(gain).connect(nodes.lowShelf);
      return { convolver, gain, venue: null };
    });
    nodes.send = ctx.createGain();
    nodes.sendTone = ctx.createBiquadFilter();
    nodes.sendTone.type = 'lowpass';
    nodes.sendTone.frequency.value = 20000;
    nodes.send.connect(nodes.sendTone);
    nodes.verbs.forEach((v) => nodes.sendTone.connect(v.convolver));

    nodes.bus = ctx.createGain();
    nodes.bus.connect(nodes.dry);
    nodes.bus.connect(nodes.send);

    // The venue's echo of the song. YouTube's player is sealed, and its sound is left untouched; instead a low stroke
    // on each of the song's beats goes only into the venue's reverb, so the room answers the song: echoes off the
    // speaker stacks outdoors, a boom under the stadium roof, a flutter between the sheri's walls.
    nodes.room = ctx.createGain();
    nodes.roomCut = ctx.createBiquadFilter();
    nodes.roomCut.type = 'lowpass';
    nodes.roomCut.frequency.value = 1100;
    nodes.room.connect(nodes.roomCut).connect(nodes.send);
    const thumps = [buildThump(ctx, true), buildThump(ctx, false)];

    const impulses = {};
    const circles = new Map();
    const sticks = Array.from({ length: 8 }, () => buildStick(ctx, rand));

    const state = {
      venue: null,
      listener: 'circle',
      activeVerb: 0,
      profile: { crowd: 0, night: 0, claps: 0, spatial: false },
      level: 0.45,
      running: false,
      style: 'claps',
      pattern: 'beat',
      tempo: null,
      nextBeat: 0,
      beatIndex: 0,
      clappers: [],
      groups: [],
      beds: {},
      orbit: 0,
    };

    function venueSpec() { return VENUES[state.venue] || VENUES.outdoors; }
    function listenerSpec() { return LISTENERS[state.listener] || LISTENERS.circle; }
    function range() { return state.listener === 'far' ? venueSpec().far : venueSpec().distance; }

    // Clappers stand in the circle around the listener, in eight spatial groups.
    function buildCircle() {
      state.groups.forEach((g) => { try { g.input.disconnect(); g.panner.disconnect(); } catch { /* no-op */ } });
      const venue = venueSpec();
      const listener = listenerSpec();
      const [near, farEdge] = range();
      const far = state.listener === 'far';
      const spatial = state.profile.spatial && typeof ctx.createPanner === 'function';
      state.groups = Array.from({ length: 8 }, (_, i) => {
        const angle = (i / 8) * TAU + 0.2;
        const input = ctx.createGain();
        let panner;
        if (spatial) {
          panner = ctx.createPanner();
          panner.panningModel = 'HRTF';
          panner.distanceModel = 'inverse';
          panner.refDistance = 1.2;
          panner.rolloffFactor = 0.55;
          const d = (near + farEdge) / 2;
          // From far away the whole circle sits in front of you, in a narrow arc.
          if (far) setPosition(panner, Math.sin(angle) * d * 0.28, -d);
          else setPosition(panner, Math.sin(angle) * d, -Math.cos(angle) * d);
        } else {
          panner = typeof ctx.createStereoPanner === 'function' ? ctx.createStereoPanner() : ctx.createGain();
          if (panner.pan) panner.pan.value = Math.sin(angle) * 0.8 * listener.width;
        }
        input.connect(panner).connect(nodes.bus);
        return { input, panner, angle };
      });
      const key = `${state.venue}|${state.listener}`;
      if (circles.has(key)) { state.clappers = circles.get(key); return; }
      state.clappers = Array.from({ length: venue.clappers }, (_, i) => {
        const d = near + (farEdge - near) * rand();
        return {
          group: i % 8,
          bias: gauss(rand) * venue.spread * 0.6,
          jitter: venue.spread,
          // Level falls with distance relative to the nearest clapper
          gain: (0.5 + rand() * 0.5) * Math.pow(near / d, 0.7) * 0.8,
          // Nearest clappers land on the beat; the far side of the circle arrives a little later.
          delay: (d - near) / 343,
          claps: personalClaps(d),
          stick: Math.floor(rand() * sticks.length),
          keen: 0.8 + rand() * 0.2,
        };
      });
      circles.set(key, state.clappers);
    }

    // Everyone's hands sound a little different, and stay the same all night.
    // Three takes each: a soft, an ordinary and a hard, brighter clap.
    function personalClaps(distance) {
      const hand = pickHands(rand);
      const spec = HANDS[hand];
      const freq = spec.f[0] + (spec.f[1] - spec.f[0]) * rand();
      const q = spec.q[0] + (spec.q[1] - spec.q[0]) * rand();
      return [0.75, 1, 1.3].map((brightness, i) => buildClap(ctx, rand, hand, {
        freq: freq * (0.985 + i * 0.012 + rand() * 0.01), q, brightness, distance,
      }));
    }

    function setPosition(panner, x, z) {
      if (panner.positionX) { panner.positionX.value = x; panner.positionY.value = 0; panner.positionZ.value = z; }
      else if (panner.setPosition) panner.setPosition(x, 0, z);
    }

    function setVenue(id, { ramp = 0.6 } = {}) {
      if (!VENUES[id]) id = 'outdoors';
      if (state.venue === id) return;
      const venue = VENUES[id];
      state.venue = id;
      if (!impulses[id]) impulses[id] = buildImpulse(ctx, venue, id.length * 97 + 5);
      const t = now();
      const next = nodes.verbs[1 - state.activeVerb];
      const prev = nodes.verbs[state.activeVerb];
      if (next.venue !== id) { next.convolver.buffer = impulses[id]; next.venue = id; }
      next.gain.gain.cancelScheduledValues(t);
      prev.gain.gain.cancelScheduledValues(t);
      next.gain.gain.setTargetAtTime(venue.wet * listenerSpec().wet, t, ramp / 3);
      prev.gain.gain.setTargetAtTime(0, t, ramp / 3);
      state.activeVerb = 1 - state.activeVerb;
      applyMix(ramp);
      nodes.lowShelf.frequency.setTargetAtTime(venue.tone.lowShelf[0], t, ramp / 3);
      nodes.lowShelf.gain.setTargetAtTime(venue.tone.lowShelf[1], t, ramp / 3);
      nodes.mid.frequency.setTargetAtTime(venue.tone.mid[0], t, ramp / 3);
      nodes.mid.Q.setTargetAtTime(venue.tone.mid[1], t, ramp / 3);
      nodes.mid.gain.setTargetAtTime(venue.tone.mid[2], t, ramp / 3);
      nodes.highShelf.frequency.setTargetAtTime(venue.tone.highShelf[0], t, ramp / 3);
      nodes.highShelf.gain.setTargetAtTime(venue.tone.highShelf[1], t, ramp / 3);
      nodes.roomCut.frequency.setTargetAtTime(venue.room ? venue.room.cut : 1100, t, ramp / 3);
      buildCircle();
      applyBedLevels(ramp);
    }

    function applyMix(ramp = 0.6) {
      const t = now();
      const venue = venueSpec();
      const listener = listenerSpec();
      nodes.dry.gain.setTargetAtTime(venue.dry * venue.trim * listener.dry, t, ramp / 3);
      nodes.send.gain.setTargetAtTime(venue.trim, t, ramp / 3);
      nodes.near.gain.setTargetAtTime(venue.trim, t, ramp / 3);
      nodes.distance.frequency.setTargetAtTime(listener.dryCut, t, ramp / 3);
      nodes.sendTone.frequency.setTargetAtTime(listener.wetCut, t, ramp / 3);
      const active = nodes.verbs[state.activeVerb];
      active.gain.gain.setTargetAtTime(venue.wet * listener.wet, t, ramp / 3);
    }

    function setListener(id, { ramp = 0.8 } = {}) {
      if (!LISTENERS[id]) id = 'circle';
      if (state.listener === id) return;
      state.listener = id;
      if (!state.venue) return;
      applyMix(ramp);
      buildCircle();
      applyBedLevels(ramp);
    }

    function masterTarget() { return state.running ? state.level : 0; }
    function setLevel(level, ramp = 0.18) {
      state.level = level;
      nodes.out.gain.setTargetAtTime(masterTarget(), now(), Math.max(0.003, ramp / 3));
    }

    async function ensureBed(role) {
      if (state.beds[role]) return state.beds[role];
      const raw = await loadBed(role);
      if (!raw) return null;
      const buffer = seamless(ctx, raw);
      const gain = ctx.createGain();
      gain.gain.value = 0;
      const tone = ctx.createBiquadFilter();
      tone.type = 'lowpass';
      tone.frequency.value = 12000;
      gain.connect(tone).connect(role === 'courtyard-bed' ? nodes.near : nodes.bus);
      state.beds[role] = { buffer, gain, tone, source: null, drift: rand() * TAU };
      return state.beds[role];
    }

    function startBed(bed, when) {
      if (!bed || bed.source) return;
      const source = ctx.createBufferSource();
      source.buffer = bed.buffer;
      source.loop = true;
      source.connect(bed.gain);
      source.start(when, rand() * bed.buffer.duration);
      bed.source = source;
    }
    function stopBed(bed, when) {
      if (!bed?.source) return;
      try { bed.source.stop(when); } catch { /* already stopped */ }
      bed.source = null;
    }

    function bedTargets() {
      const venue = venueSpec();
      return {
        crowd: state.profile.crowd * (state.venue === 'stadium' ? 0.34 : state.venue === 'sheri' ? 0.4 : 0.46) * (state.listener === 'far' ? 0.85 : 1),
        night: state.profile.night * venue.night * (state.listener === 'far' ? 0.4 : 0.3),
      };
    }

    function applyBedLevels(ramp = 0.6) {
      const t = now();
      const targets = bedTargets();
      const crowd = state.beds['ground-crowd'];
      const night = state.beds['courtyard-bed'];
      if (crowd) {
        crowd.gain.gain.setTargetAtTime(state.running ? targets.crowd : 0, t, ramp / 3);
        crowd.tone.frequency.setTargetAtTime(state.venue === 'outdoors' ? 7000 : state.venue === 'stadium' ? 6000 : 9000, t, ramp / 3);
      }
      if (night) night.gain.gain.setTargetAtTime(state.running ? targets.night : 0, t, ramp / 3);
      if (nodes.roomTone) nodes.roomTone.gain.gain.setTargetAtTime(state.running ? venueSpec().roomTone * (state.profile.crowd ? 1 : 0.6) : 0, t, ramp / 3);
    }

    function ensureRoomTone() {
      if (nodes.roomTone) return;
      const rate = ctx.sampleRate;
      const buffer = ctx.createBuffer(2, rate * 4, rate);
      for (let ch = 0; ch < 2; ch += 1) {
        const d = buffer.getChannelData(ch);
        let b0 = 0; let b1 = 0; let b2 = 0;
        for (let i = 0; i < d.length; i += 1) {
          const w = rand() * 2 - 1;
          b0 = 0.99765 * b0 + w * 0.099; b1 = 0.963 * b1 + w * 0.2965; b2 = 0.57 * b2 + w * 1.0527;
          d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.2;
        }
        onePoleLow(d, 700, rate);
      }
      const source = ctx.createBufferSource();
      source.buffer = seamless(ctx, buffer, 0.5);
      source.loop = true;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      source.connect(gain).connect(nodes.near);
      source.start();
      nodes.roomTone = { source, gain };
    }

    async function setProfile(profile) {
      const spatialChanged = Boolean(profile.spatial) !== Boolean(state.profile.spatial);
      state.profile = { ...profile };
      if (spatialChanged) buildCircle();
      if (profile.crowd > 0) await ensureBed('ground-crowd');
      if (profile.night > 0) await ensureBed('courtyard-bed');
      ensureRoomTone();
      if (state.running) {
        const t = now();
        if (profile.crowd > 0) startBed(state.beds['ground-crowd'], t);
        if (profile.night > 0) startBed(state.beds['courtyard-bed'], t);
      }
      applyBedLevels();
    }

    function start() {
      if (state.running) return;
      state.running = true;
      const t = now();
      if (state.profile.crowd > 0) startBed(state.beds['ground-crowd'], t);
      if (state.profile.night > 0) startBed(state.beds['courtyard-bed'], t);
      nodes.out.gain.cancelScheduledValues(t);
      nodes.out.gain.setTargetAtTime(state.level, t, 0.06);
      applyBedLevels(0.3);
      if (state.tempo) alignNextBeat();
    }

    function stop({ fade = 0.12 } = {}) {
      if (!state.running) return;
      state.running = false;
      const t = now();
      nodes.out.gain.cancelScheduledValues(t);
      nodes.out.gain.setTargetAtTime(0, t, fade / 3);
      const end = t + fade * 2;
      Object.values(state.beds).forEach((bed) => stopBed(bed, end));
    }

    // Tempo: one beat every 60 / bpm seconds, with a beat landing exactly at `anchor`. `locked` means it is the
    // song's own beat, from the listener's taps or the microphone, and not a preview tempo: only then does the
    // room answer it.
    function setTempo(bpm, anchor, { locked = false } = {}) {
      state.tempo = { bpm, period: 60 / bpm, anchor, locked: Boolean(locked) };
      alignNextBeat();
    }
    function clearTempo() { state.tempo = null; }
    function alignNextBeat() {
      const { period, anchor } = state.tempo;
      const k = Math.ceil((now() + 0.02 - anchor) / period);
      state.nextBeat = anchor + k * period;
      state.beatIndex = k;
    }

    function hitAt(time, beat) {
      const venue = venueSpec();
      const accent = beat % (PATTERNS[state.pattern]?.cycle || 1) === (PATTERNS[state.pattern]?.hits.slice(-1)[0] ?? 0) ? 1.12 : 1;
      const amount = state.profile.claps;
      const players = state.style === 'dandiya' ? state.clappers.slice(0, Math.ceil(state.clappers.length * 0.45)) : state.clappers;
      for (const p of players) {
        if (rand() > p.keen) continue;
        // Personal timing, human spread, and the time the sound takes to cross the circle.
        const offset = p.bias + gauss(rand) * p.jitter + p.delay;
        const at = Math.max(now() + 0.005, time + offset);
        // A harder clap is louder and brighter, so velocity picks the take.
        const velocity = (0.82 + rand() * 0.36) * accent;
        const take = velocity > 1.08 ? 2 : velocity < 0.92 ? 0 : 1;
        const source = ctx.createBufferSource();
        source.buffer = state.style === 'dandiya' ? sticks[p.stick] : p.claps[take];
        source.playbackRate.value = 0.98 + rand() * 0.04;
        const gain = ctx.createGain();
        gain.gain.value = p.gain * amount * velocity * (state.style === 'dandiya' ? 0.75 : 1.05) * (30 / Math.max(12, venue.clappers));
        source.connect(gain).connect(state.groups[p.group].input);
        source.start(at);
        source.onended = () => { try { source.disconnect(); gain.disconnect(); } catch { /* no-op */ } };
      }
    }

    function roomLevel() {
      const room = venueSpec().room;
      if (!room || !state.tempo?.locked) return 0;
      return room.level * (state.profile.room ?? 1);
    }
    function roomAt(time, beat) {
      const level = roomLevel();
      if (level <= 0 || time < now()) return;
      const strong = beat % 2 === 0;
      const source = ctx.createBufferSource();
      source.buffer = thumps[strong ? 0 : 1];
      source.playbackRate.value = 0.99 + rand() * 0.02;
      const gain = ctx.createGain();
      gain.gain.value = level * (strong ? 1 : 0.7) * (0.92 + rand() * 0.16);
      source.connect(gain).connect(nodes.room);
      source.start(time);
      source.onended = () => { try { source.disconnect(); gain.disconnect(); } catch { /* no-op */ } };
    }

    // Schedule every beat that falls before `until` (Web Audio clock).
    function schedule(until) {
      if (!state.running || !state.tempo) return;
      const claps = state.profile.claps > 0, room = roomLevel() > 0;
      if (!claps && !room) return;
      const pattern = PATTERNS[state.pattern] || PATTERNS.beat;
      while (state.nextBeat < until) {
        const pos = ((state.beatIndex % pattern.cycle) + pattern.cycle) % pattern.cycle;
        if (claps && pattern.hits.includes(pos)) hitAt(state.nextBeat, state.beatIndex);
        if (room) roomAt(state.nextBeat, state.beatIndex);
        state.beatIndex += 1;
        state.nextBeat += state.tempo.period;
      }
    }

    // Slow orbit for Full circle, and a gentle rise and fall in the crowd's energy.
    function animate(dt) {
      const crowd = state.beds['ground-crowd'];
      if (crowd && state.running) {
        crowd.drift += dt * 0.07;
        const swell = 1 + 0.18 * Math.sin(crowd.drift) * Math.sin(crowd.drift * 0.37 + 1.3);
        crowd.gain.gain.setTargetAtTime(bedTargets().crowd * swell, now(), 0.8);
      }
      if (!state.profile.spatial) return;
      state.orbit += dt * 0.12;
      const [near, farEdge] = range();
      const d = (near + farEdge) / 2;
      const far = state.listener === 'far';
      state.groups.forEach((g) => {
        if (!g.panner.positionX) return;
        const a = g.angle + state.orbit;
        // Close up the circle turns around you; from far away it turns in front of you.
        g.panner.positionX.setTargetAtTime(Math.sin(a) * d * (far ? 0.28 : 1), now(), 0.2);
        g.panner.positionZ.setTargetAtTime(far ? -d - Math.cos(a) * (farEdge - near) * 0.3 : -Math.cos(a) * d, now(), 0.2);
      });
    }

    return {
      setVenue,
      setListener,
      setLevel,
      setProfile,
      setStyle(style) { state.style = style === 'dandiya' ? 'dandiya' : 'claps'; },
      setPattern(id) { state.pattern = PATTERNS[id] ? id : 'beat'; },
      setTempo,
      clearTempo,
      schedule,
      animate,
      start,
      stop,
      get tempo() { return state.tempo; },
      get running() { return state.running; },
      get venue() { return state.venue; },
      get listener() { return state.listener; },
      get pattern() { return state.pattern; },
    };
  }

  // ---------------------------------------------------------------------------
  // Following the song's beat through the microphone.
  // The song plays inside YouTube's player, which a page can't read. With the listener's permission the
  // microphone hears it from the speaker instead. Only the low end is used (dhol and bass sit below ~180 Hz,
  // our own claps are bright), energy is measured every ~12 ms, and once a second the last 8 seconds give a
  // tempo and the time of the latest beat. Nothing is recorded or sent anywhere.

  // frames: [[time, energy], ...] at a steady hop. Returns { bpm, lastBeat, confidence } or null.
  function estimateBeat(frames, { minBpm = 70, maxBpm = 180, preferBpm = 120 } = {}) {
    const n = frames.length;
    if (n < 200) return null;
    const hop = (frames[n - 1][0] - frames[0][0]) / (n - 1);
    if (!(hop > 0.002 && hop < 0.05)) return null;
    // Onset strength: how much the level jumps above the last few frames, in decibels, rises only
    const db = frames.map((f) => 10 * Math.log10(f[1] + 1e-10));
    const onset = new Float64Array(n);
    for (let i = 3; i < n; i += 1) onset[i] = Math.max(0, db[i] - (db[i - 1] + db[i - 2] + db[i - 3]) / 3);
    let mean = 0; for (let i = 0; i < n; i += 1) mean += onset[i]; mean /= n;
    if (!(mean > 0.05)) return null;
    for (let i = 0; i < n; i += 1) onset[i] = Math.max(0, onset[i] - mean);
    // Tempo: autocorrelation over the beat lengths a garba can have, leaning towards a middle tempo so that
    // double and half time don't win on a close call
    const minLag = Math.max(2, Math.floor(60 / maxBpm / hop)), maxLag = Math.min(n - 2, Math.ceil(60 / minBpm / hop));
    const r = new Float64Array(maxLag + 2);
    let zero = 0; for (let i = 0; i < n; i += 1) zero += onset[i] * onset[i];
    if (!(zero > 0)) return null;
    let bestLag = 0, bestScore = -1, sum = 0, count = 0;
    for (let lag = minLag; lag <= maxLag + 1; lag += 1) {
      let acc = 0; for (let i = lag; i < n; i += 1) acc += onset[i] * onset[i - lag];
      r[lag] = acc / (n - lag);
    }
    for (let lag = minLag; lag <= maxLag; lag += 1) {
      const bpm = 60 / (lag * hop), prior = Math.exp(-0.5 * (Math.log2(bpm / preferBpm) / 0.9) ** 2);
      const score = r[lag] * (0.55 + 0.45 * prior);
      sum += r[lag]; count += 1;
      if (score > bestScore) { bestScore = score; bestLag = lag; }
    }
    if (!bestLag) return null;
    // Sub-frame lag from the neighbours
    const a = r[bestLag - 1] || 0, b = r[bestLag], c = r[bestLag + 1] || 0, den = a - 2 * b + c;
    const lag = den < 0 ? bestLag + 0.5 * (a - c) / den : bestLag;
    const period = lag * hop, bpmOut = 60 / period;
    const confidence = b / Math.max(1e-9, sum / Math.max(1, count));
    // Phase: slide a comb of beats back from the newest frame and keep the offset that lands on the most onsets
    let bestPhase = 0, bestPhaseScore = -1;
    const steps = Math.max(1, Math.round(lag));
    for (let ph = 0; ph < steps; ph += 1) {
      let acc = 0;
      for (let k = 0; ; k += 1) {
        const idx = Math.round(n - 1 - ph - k * lag);
        if (idx < 1) break;
        // The newest beats count most: a garba speeding up leaves its older beats further apart
        acc += Math.max(onset[idx], onset[idx - 1] * 0.8, (onset[idx + 1] || 0) * 0.8) * Math.pow(0.8, k);
        if (k > 10) break;
      }
      if (acc > bestPhaseScore) { bestPhaseScore = acc; bestPhase = ph; }
    }
    const lastBeat = frames[n - 1][0] - bestPhase * hop;
    return { bpm: bpmOut, period, lastBeat, confidence };
  }

  const BEAT_WORKLET = `class GarbaBeatEnergy extends AudioWorkletProcessor {
    constructor() { super(); this.sum = 0; this.count = 0; this.start = null; }
    process(inputs) {
      const ch = inputs[0] && inputs[0][0];
      if (ch) {
        if (this.start === null) this.start = currentTime;
        for (let i = 0; i < ch.length; i += 1) this.sum += ch[i] * ch[i];
        this.count += ch.length;
        if (this.count >= 512) { this.port.postMessage({ t: this.start, e: this.sum / this.count }); this.sum = 0; this.count = 0; this.start = null; }
      }
      return true;
    }
  }
  registerProcessor('garba-beat-energy', GarbaBeatEnergy);`;

  // onBeat({ bpm, anchor, confidence }) is called about once a second once the beat is clear: `anchor` is on the
  // audio clock, placed so that a clap scheduled there is heard with the song's beat. onState(state) reports
  // 'starting', 'listening', 'following', 'denied', 'unavailable' or 'off'.
  function createBeatFollower(ctx, { onBeat = () => {}, onState = () => {}, getUserMedia } = {}) {
    let stream = null, nodes = [], timer = 0, frames = [], smoothBpm = null, agree = 0, status = 'off', inLatency = 0.03, analyser = null, poll = 0;
    const setStatus = (next) => { if (status !== next) { status = next; onState(next); } };
    function push(t, e) { frames.push([t, e]); if (frames.length > 720) frames.splice(0, frames.length - 720); }
    function update() {
      const est = estimateBeat(frames);
      if (!est || est.confidence < 1.6) { agree = Math.max(0, agree - 1); if (agree === 0 && status === 'following' && frames.length >= 700) setStatus('listening'); return; }
      if (smoothBpm && Math.abs(est.bpm - smoothBpm) / smoothBpm < 0.06) { smoothBpm += (est.bpm - smoothBpm) * 0.5; agree = Math.min(4, agree + 1); }
      else if (smoothBpm && Math.abs(est.bpm * 2 - smoothBpm) / smoothBpm < 0.06) return;
      else if (smoothBpm && Math.abs(est.bpm / 2 - smoothBpm) / smoothBpm < 0.06) return;
      else { smoothBpm = est.bpm; agree = 1; }
      if (agree < 2) return;
      const outLatency = ctx.outputLatency || ctx.baseLatency || 0;
      onBeat({ bpm: smoothBpm, anchor: est.lastBeat - inLatency - outLatency, confidence: est.confidence });
      setStatus('following');
    }
    async function start() {
      if (stream) return true;
      const gum = getUserMedia || (navigator.mediaDevices && navigator.mediaDevices.getUserMedia && navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices));
      if (!gum) { setStatus('unavailable'); return false; }
      setStatus('starting');
      try {
        stream = await gum({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
      } catch (error) {
        stream = null;
        setStatus(error && (error.name === 'NotAllowedError' || error.name === 'SecurityError') ? 'denied' : 'unavailable');
        return false;
      }
      try { inLatency = Number(stream.getAudioTracks()[0].getSettings().latency) || 0.03; } catch { inLatency = 0.03; }
      const source = ctx.createMediaStreamSource(stream);
      const low = ctx.createBiquadFilter(); low.type = 'lowpass'; low.frequency.value = 180; low.Q.value = 0.7;
      const hush = ctx.createGain(); hush.gain.value = 0;
      nodes = [source, low, hush];
      source.connect(low);
      let worklet = null;
      if (ctx.audioWorklet && typeof AudioWorkletNode === 'function') {
        try {
          const url = URL.createObjectURL(new Blob([BEAT_WORKLET], { type: 'text/javascript' }));
          await ctx.audioWorklet.addModule(url);
          URL.revokeObjectURL(url);
          worklet = new AudioWorkletNode(ctx, 'garba-beat-energy', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1] });
          worklet.port.onmessage = (event) => push(event.data.t, event.data.e);
          low.connect(worklet).connect(hush).connect(ctx.destination);
          nodes.push(worklet);
        } catch { worklet = null; }
      }
      if (!worklet) {
        // Older browsers: read the level on a short timer instead
        analyser = ctx.createAnalyser(); analyser.fftSize = 512;
        const buf = new Float32Array(analyser.fftSize);
        low.connect(analyser); nodes.push(analyser);
        poll = setInterval(() => { analyser.getFloatTimeDomainData(buf); let acc = 0; for (let i = 0; i < buf.length; i += 1) acc += buf[i] * buf[i]; push(ctx.currentTime - buf.length / ctx.sampleRate / 2, acc / buf.length); }, 12);
      }
      frames = []; smoothBpm = null; agree = 0;
      timer = setInterval(update, 1000);
      setStatus('listening');
      return true;
    }
    function stop() {
      clearInterval(timer); clearInterval(poll); timer = 0; poll = 0;
      nodes.forEach((node) => { try { node.disconnect(); } catch { /* already gone */ } });
      nodes = []; analyser = null;
      if (stream) stream.getTracks().forEach((track) => track.stop());
      stream = null; frames = []; smoothBpm = null; agree = 0;
      setStatus('off');
    }
    return { start, stop, get status() { return status; }, get bpm() { return smoothBpm; } };
  }

  // ---------------------------------------------------------------------------
  // Dandiya tap. Pressing any button, link or slider knocks two dandiya sticks
  // together, so the press is felt as well as seen. The Simple player already
  // does this from app.js; this covers every other page that loads the engine,
  // the Immersive (Garbo) player inside its frame among them.
  // ---------------------------------------------------------------------------
  const TAP_TARGETS = 'button, a[href], input[type="range"], input[type="checkbox"], input[type="radio"], select, summary, label[for], [role="button"], [role="tab"], [role="switch"], [role="option"], [role="menuitem"]';
  let tapContext = null;
  let lastTapAt = 0;

  function playDandiyaTap() {
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return;
    try {
      if (!tapContext || tapContext.state === 'closed') tapContext = new Ctor({ latencyHint: 'interactive' });
      if (tapContext.state === 'suspended') tapContext.resume().catch(() => {});
      const ctx = tapContext;
      const t = ctx.currentTime + 0.002;
      // A little variation so repeated presses sound like hands, not a sample
      const pitch = 0.94 + Math.random() * 0.12;
      const level = 0.8 + Math.random() * 0.2;
      const out = ctx.createGain();
      out.gain.value = 0.55 * level;
      out.connect(ctx.destination);

      // The wooden body of the stick
      const body = ctx.createOscillator();
      const bodyFilter = ctx.createBiquadFilter();
      const bodyGain = ctx.createGain();
      body.type = 'triangle';
      body.frequency.setValueAtTime(880 * pitch, t);
      body.frequency.exponentialRampToValueAtTime(520 * pitch, t + 0.045);
      bodyFilter.type = 'bandpass';
      bodyFilter.frequency.value = 820 * pitch;
      bodyFilter.Q.value = 1.8;
      bodyGain.gain.setValueAtTime(1, t);
      bodyGain.gain.exponentialRampToValueAtTime(0.001, t + 0.065);
      body.connect(bodyFilter).connect(bodyGain).connect(out);

      // The snap where the two sticks meet
      const snap = ctx.createOscillator();
      const snapGain = ctx.createGain();
      snap.type = 'sine';
      snap.frequency.setValueAtTime(1750 * pitch, t);
      snap.frequency.exponentialRampToValueAtTime(980 * pitch, t + 0.025);
      snapGain.gain.setValueAtTime(0.5, t);
      snapGain.gain.exponentialRampToValueAtTime(0.001, t + 0.028);
      snap.connect(snapGain).connect(out);

      body.start(t); body.stop(t + 0.08);
      snap.start(t); snap.stop(t + 0.04);
      snap.onended = () => out.disconnect();
    } catch {
      // The tap is a courtesy; a page without audio still works
    }
  }

  function tapFor(event) {
    if (event.button > 0) return;
    const target = event.target instanceof Element ? event.target.closest(TAP_TARGETS) : null;
    if (!target || target.matches(':disabled, [aria-disabled="true"]')) return;
    const now = performance.now();
    if (now - lastTapAt < 60) return;
    lastTapAt = now;
    playDandiyaTap();
  }

  function tapKey(event) {
    if (event.repeat || (event.key !== 'Enter' && event.key !== ' ')) return;
    const target = event.target instanceof Element ? event.target.closest(TAP_TARGETS) : null;
    if (target && !target.matches('input[type="range"], select')) tapFor(event);
  }

  const simplePlayerTaps = Boolean(document.querySelector('script[src*="app.js"]'));
  if (!simplePlayerTaps && !window.__garbaDandiyaTaps) {
    window.__garbaDandiyaTaps = true;
    document.addEventListener(window.PointerEvent ? 'pointerdown' : 'touchstart', tapFor, { capture: true, passive: true });
    document.addEventListener('keydown', tapKey, { capture: true, passive: true });
    window.addEventListener('pagehide', () => { if (tapContext?.state === 'running') tapContext.suspend().catch(() => {}); });
  }

  window.GARBA_ATMOSPHERE_ENGINE = { createEngine, buildImpulse, buildClap, HANDS, VENUES, LISTENERS, PATTERNS, PREVIEW_BPM, estimateBeat, createBeatFollower, playDandiyaTap };

  // ---------------------------------------------------------------------------
  // Player integration and panel
  // ---------------------------------------------------------------------------
  const STORAGE_KEY = 'garba:atmosphere';
  const SOURCE_MANIFEST = 'data/atmosphere-sources.json';
  const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
  const utilityBar = document.querySelector('.utilities');
  const app = document.getElementById('app');
  const directAudio = document.getElementById('audio');
  if (!utilityBar || !app) return;

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;

  const MODES = {
    off: { label: 'Off', desc: 'No atmosphere', crowd: 0, night: 0, claps: 0, spatial: false },
    crowd: { label: 'Crowd', desc: 'The ground around you: people, chatter and the night air. No claps.', crowd: 1, night: 1, claps: 0, spatial: false },
    clapping: { label: 'Claps', desc: 'The circle clapping in time with the song, with a quieter crowd.', crowd: 0.35, night: 0.6, claps: 1, spatial: false },
    immersive: { label: 'Full circle', desc: 'The crowd and the claps all around you. Best on headphones.', crowd: 0.85, night: 1, claps: 0.9, spatial: true },
  };

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const stored = (() => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'); } catch { return null; }
  })();

  const initialMode = (() => {
    if (stored?.mode && MODES[stored.mode]) return stored.mode;
    if (stored?.mode === 'ground' || stored?.mode === 'courtyard') return 'crowd';
    return 'off';
  })();
  const initialVenue = (() => {
    if (stored?.venue && VENUES[stored.venue]) return stored.venue;
    if (stored?.venue === 'hall' || stored?.environment === 'indoor') return 'stadium';
    return 'outdoors';
  })();

  const state = {
    context: null,
    engine: null,
    manifest: null,
    mode: initialMode,
    lastMode: MODES[stored?.lastMode] && stored.lastMode !== 'off' ? stored.lastMode : (initialMode !== 'off' ? initialMode : 'immersive'),
    venue: initialVenue,
    listener: LISTENERS[stored?.listener] ? stored.listener : 'circle',
    pattern: PATTERNS[stored?.pattern] ? stored.pattern : 'beat',
    level: clamp(Number(stored?.level ?? 0.45), 0.05, 1),
    taps: [],
    follower: null,
    listenStatus: 'off',
    tapTimer: 0,
    schedulerTimer: 0,
    idleTimer: 0,
    previewTimer: 0,
    lastAnimate: 0,
    panelOpen: false,
    previewActive: false,
    playbackActive: false,
    sceneReady: false,
    generation: 0,
    previousFocus: null,
    inertNodes: [],
  };

  function persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ mode: state.mode, lastMode: state.lastMode, venue: state.venue, listener: state.listener, pattern: state.pattern, level: state.level }));
    } catch { /* storage unavailable */ }
  }

  function constrainedConnection() {
    return Boolean(connection?.saveData) || /(^|-)2g$/.test(String(connection?.effectiveType || ''));
  }

  function playbackIsActive() {
    if (directAudio?.currentSrc && !directAudio.paused && !directAudio.ended) return true;
    return app.classList.contains('is-playing');
  }

  function runtimeProfile() {
    const base = MODES[state.mode];
    if (!base || state.mode === 'off' || !constrainedConnection()) return base;
    // On Data Saver the recorded beds stay off; synthesised claps still work.
    return { ...base, crowd: 0, night: 0 };
  }

  function currentStyle() { return app.dataset.genre === 'dandiya' ? 'dandiya' : 'claps'; }

  function injectStyles() {
    if (document.getElementById('garbaAtmosphereStyles')) return;
    const style = document.createElement('style');
    style.id = 'garbaAtmosphereStyles';
    style.textContent = `
      .atmosphere-button{position:relative}
      .atmosphere-button[aria-pressed="true"]{color:var(--accent);background:color-mix(in srgb,var(--accent) 16%,rgba(8,10,18,.22))}
      .atmosphere-button::after{content:"";position:absolute;right:6px;top:6px;width:6px;height:6px;border-radius:50%;background:var(--accent);opacity:0;transform:scale(.6);transition:opacity 160ms ease,transform 180ms ease;box-shadow:0 0 0 2px rgba(8,10,18,.54)}
      .atmosphere-button[aria-pressed="true"]::after{opacity:1;transform:scale(1)}
      .atmosphere-button[data-waiting="true"]::after{background:#f2c230;animation:atmosphere-wait 1.4s ease-in-out infinite}
      @keyframes atmosphere-wait{50%{transform:scale(1.5);opacity:.55}}
      .atmosphere-button svg{width:22px;height:22px;fill:none;stroke:currentColor;stroke-width:1.65;stroke-linecap:round;stroke-linejoin:round}
      .atmosphere-backdrop{position:fixed;z-index:89;inset:0;border:0;padding:0;background:rgba(3,5,10,.26);backdrop-filter:blur(2px);-webkit-backdrop-filter:blur(2px)}
      .atmosphere-backdrop[hidden],.atmosphere-panel[hidden],.atmosphere-tip[hidden]{display:none!important}
      .atmosphere-panel{position:fixed;z-index:90;top:max(76px,calc(env(safe-area-inset-top) + 58px));right:max(14px,env(safe-area-inset-right));width:min(384px,calc(100vw - 28px));max-height:calc(100dvh - 96px);overflow-y:auto;overscroll-behavior:contain;box-sizing:border-box;padding:14px 18px 20px;color:#f6ecd7;text-align:center;border:1px solid rgba(246,236,215,.14);border-radius:24px;background:rgba(12,14,25,.97);box-shadow:0 28px 90px rgba(0,0,0,.52);backdrop-filter:blur(24px);-webkit-backdrop-filter:blur(24px);animation:atmosphere-rise 220ms cubic-bezier(.2,.8,.2,1)}
      @keyframes atmosphere-rise{from{transform:translateY(12px);opacity:.4}}
      .atmosphere-panel-header{display:grid;grid-template-columns:40px 1fr 40px;align-items:center;gap:8px}
      .atmosphere-panel h2{margin:0;font:600 19px/1.2 var(--serif,var(--sans,system-ui));letter-spacing:-.01em}
      .atmosphere-test,.atmosphere-close{width:40px;height:40px;border-radius:50%;display:inline-grid;place-items:center;border:1px solid rgba(246,236,215,.12);color:inherit;background:rgba(246,236,215,.05);cursor:pointer;padding:0}
      .atmosphere-test[aria-pressed="true"]{color:var(--accent);border-color:color-mix(in srgb,var(--accent) 52%,rgba(246,236,215,.14));background:color-mix(in srgb,var(--accent) 13%,rgba(246,236,215,.04))}
      .atmosphere-test svg{width:15px;height:15px;fill:currentColor}
      .atmosphere-close{font:300 22px/1 var(--sans,system-ui)}
      .atmosphere-power{display:flex;align-items:center;justify-content:space-between;gap:14px;width:100%;margin:14px 0 2px;padding:14px 16px;border-radius:18px;border:1px solid rgba(246,236,215,.12);background:rgba(246,236,215,.05);color:inherit;cursor:pointer;text-align:left;font:inherit}
      .atmosphere-power[aria-checked="true"]{border-color:color-mix(in srgb,var(--accent) 55%,transparent);background:color-mix(in srgb,var(--accent) 12%,rgba(246,236,215,.03))}
      .atmosphere-power strong{display:block;font:600 16px/1.25 var(--sans,system-ui)}
      .atmosphere-power small{display:block;margin-top:2px;font:400 13px/1.35 var(--sans,system-ui);color:rgba(246,236,215,.66)}
      .atmosphere-knob{flex:0 0 auto;position:relative;width:50px;height:30px;border-radius:15px;background:rgba(246,236,215,.18);transition:background 160ms ease}
      .atmosphere-knob::after{content:"";position:absolute;left:3px;top:3px;width:24px;height:24px;border-radius:50%;background:#f6ecd7;box-shadow:0 2px 6px rgba(0,0,0,.35);transition:transform 180ms cubic-bezier(.2,.8,.2,1)}
      .atmosphere-power[aria-checked="true"] .atmosphere-knob{background:var(--accent)}
      .atmosphere-power[aria-checked="true"] .atmosphere-knob::after{transform:translateX(20px)}
      .atmosphere-body{transition:opacity 180ms ease}
      .atmosphere-body[data-off="true"]{opacity:.42}
      .atmosphere-section{display:grid;gap:10px;margin-top:22px}
      .atmosphere-section h3{margin:0;font:600 16px/1.2 var(--sans,system-ui);letter-spacing:-.005em;text-align:center;color:#f6ecd7}
      .atmosphere-desc{margin:0;font:400 13.5px/1.45 var(--sans,system-ui);color:rgba(246,236,215,.68);text-align:center;text-wrap:balance;min-height:39px}
      .atmosphere-modes,.atmosphere-venues,.atmosphere-patterns{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px}
      .atmosphere-listeners{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px}
      .atmosphere-mode,.atmosphere-venue,.atmosphere-listener,.atmosphere-pattern{min-height:46px;padding:8px 6px;border:1px solid rgba(246,236,215,.11);border-radius:14px;color:inherit;background:rgba(246,236,215,.045);cursor:pointer;font:600 14px/1.2 var(--sans,system-ui);text-align:center;display:inline-flex;align-items:center;justify-content:center;gap:6px;transition:background 160ms ease,border-color 160ms ease,transform 120ms ease,opacity 160ms ease}
      .atmosphere-mode:hover,.atmosphere-venue:hover,.atmosphere-listener:hover,.atmosphere-pattern:hover{background:rgba(246,236,215,.08)}
      .atmosphere-mode:active,.atmosphere-venue:active,.atmosphere-listener:active,.atmosphere-pattern:active{transform:scale(.97)}
      .atmosphere-mode[aria-pressed="true"],.atmosphere-venue[aria-pressed="true"],.atmosphere-listener[aria-pressed="true"],.atmosphere-pattern[aria-pressed="true"]{border-color:color-mix(in srgb,var(--accent) 62%,rgba(246,236,215,.15));background:color-mix(in srgb,var(--accent) 16%,rgba(246,236,215,.05));color:#fff}
      .atmosphere-venue:disabled,.atmosphere-listener:disabled,.atmosphere-mode:disabled,.atmosphere-pattern:disabled,.atmosphere-tap:disabled{opacity:.4;cursor:default;pointer-events:none}
      .atmosphere-panel .atmosphere-local-background{display:flex;justify-content:center;margin-top:22px}
      .atmosphere-headphone-icon{display:inline-block;width:14px;height:14px;vertical-align:-2px;margin-right:2px;flex:0 0 auto;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
      .atmosphere-tap{justify-self:center;display:grid;place-items:center;width:104px;height:104px;border-radius:50%;border:1.5px solid color-mix(in srgb,var(--accent) 75%,transparent);background:radial-gradient(circle at 50% 40%,color-mix(in srgb,var(--accent) 28%,transparent),color-mix(in srgb,var(--accent) 8%,transparent));color:#fff;font:700 14px/1.15 var(--sans,system-ui);cursor:pointer;touch-action:manipulation;-webkit-user-select:none;user-select:none;transition:transform 90ms ease,box-shadow 160ms ease}
      .atmosphere-tap:active,.atmosphere-tap.is-hit{transform:scale(.92);box-shadow:0 0 0 10px color-mix(in srgb,var(--accent) 16%,transparent)}
      .atmosphere-tap[data-locked="true"]{border-color:#f2c230}
      .atmosphere-listen{justify-self:center;display:inline-flex;align-items:center;gap:8px;min-height:40px;padding:8px 16px;border-radius:999px;border:1px solid color-mix(in srgb,var(--accent) 55%,transparent);background:transparent;color:#f6ecd7;font:600 13px/1.2 var(--sans,system-ui);cursor:pointer}
      .atmosphere-listen::before{content:"";width:8px;height:8px;border-radius:50%;background:rgba(246,236,215,.35)}
      .atmosphere-listen[aria-pressed="true"]{border-color:#f2c230;background:color-mix(in srgb,var(--accent) 16%,transparent)}
      .atmosphere-listen[aria-pressed="true"]::before{background:#e0473b;box-shadow:0 0 0 3px rgba(224,71,59,.25)}
      .atmosphere-listen:disabled{opacity:.4;cursor:default}
      .atmosphere-listen-note{font-size:12px;opacity:.75}
      .atmosphere-bpm{margin:0;font:700 26px/1 var(--sans,system-ui);font-variant-numeric:tabular-nums;letter-spacing:-.01em;min-height:26px}
      .atmosphere-bpm span{font-size:13px;font-weight:600;letter-spacing:.04em;color:rgba(246,236,215,.6);margin-left:4px}
      .atmosphere-dots{display:flex;justify-content:center;gap:7px;min-height:10px}
      .atmosphere-dots i{width:9px;height:9px;border-radius:50%;background:rgba(246,236,215,.16);transition:background 120ms ease}
      .atmosphere-dots i.on{background:var(--accent)}
      .atmosphere-level{display:grid;gap:8px}
      .atmosphere-level output{font:600 13px/1 var(--sans,system-ui);color:rgba(246,236,215,.7)}
      .atmosphere-level input{--fill:${Math.round(state.level * 100)}%;appearance:none;-webkit-appearance:none;width:100%;height:28px;margin:0;background:transparent;cursor:pointer}
      .atmosphere-level input::-webkit-slider-runnable-track{height:6px;border-radius:999px;background:linear-gradient(90deg,var(--accent) 0 var(--fill),rgba(246,236,215,.14) var(--fill) 100%)}
      .atmosphere-level input::-webkit-slider-thumb{-webkit-appearance:none;width:22px;height:22px;margin-top:-8px;border:2px solid rgba(12,14,25,.95);border-radius:50%;background:#f6ecd7;box-shadow:0 0 0 3px color-mix(in srgb,var(--accent) 35%,transparent),0 3px 10px rgba(0,0,0,.35)}
      .atmosphere-level input::-moz-range-track{height:6px;border-radius:999px;background:rgba(246,236,215,.14)}
      .atmosphere-level input::-moz-range-progress{height:6px;border-radius:999px;background:var(--accent)}
      .atmosphere-level input::-moz-range-thumb{width:20px;height:20px;border:2px solid rgba(12,14,25,.95);border-radius:50%;background:#f6ecd7}
      .atmosphere-level input:disabled{opacity:.4;cursor:default}
      .atmosphere-note a{display:block;margin-top:8px;color:#d6b06f;font-weight:600;text-decoration:underline;text-underline-offset:3px}
      .atmosphere-note{margin:22px 0 0;padding-top:14px;border-top:1px solid rgba(246,236,215,.1);font:400 12.5px/1.45 var(--sans,system-ui);color:rgba(246,236,215,.55);text-align:center;text-wrap:balance}
      .atmosphere-status{position:absolute!important;width:1px!important;height:1px!important;padding:0!important;margin:-1px!important;overflow:hidden!important;clip:rect(0,0,0,0)!important;white-space:nowrap!important;border:0!important}
      .atmosphere-panel :focus-visible,.atmosphere-tip :focus-visible{outline:2px solid var(--accent);outline-offset:3px}
      .atmosphere-tip{position:fixed;z-index:88;width:min(280px,calc(100vw - 24px));box-sizing:border-box;padding:14px 16px;border-radius:18px;color:#f6ecd7;text-align:left;background:rgba(12,14,25,.97);border:1px solid color-mix(in srgb,var(--accent) 45%,rgba(246,236,215,.14));box-shadow:0 18px 50px rgba(0,0,0,.5);animation:atmosphere-rise 240ms cubic-bezier(.2,.8,.2,1)}
      .atmosphere-tip::before{content:"";position:absolute;top:-7px;right:var(--arrow,22px);width:12px;height:12px;background:inherit;border-left:inherit;border-top:inherit;transform:rotate(45deg)}
      .atmosphere-tip strong{display:block;font:600 15px/1.25 var(--sans,system-ui)}
      .atmosphere-tip strong em{font-style:normal;color:var(--accent);margin-right:6px}
      .atmosphere-tip p{margin:4px 0 12px;font:400 13.5px/1.45 var(--sans,system-ui);color:rgba(246,236,215,.72)}
      .atmosphere-tip-actions{display:flex;gap:8px;justify-content:flex-end}
      .atmosphere-tip-actions button{min-height:38px;padding:0 14px;border-radius:19px;border:1px solid rgba(246,236,215,.16);background:transparent;color:inherit;font:600 13.5px/1 var(--sans,system-ui);cursor:pointer}
      .atmosphere-tip-actions .primary{background:var(--accent);border-color:var(--accent);color:#1b1108}
      @media(max-width:700px){.atmosphere-backdrop{background:rgba(3,5,10,.42)}.atmosphere-panel{top:auto;right:max(10px,env(safe-area-inset-right));bottom:max(10px,calc(env(safe-area-inset-bottom) + 8px));left:max(10px,env(safe-area-inset-left));width:auto;max-height:calc(100dvh - 70px);border-radius:26px;padding:12px 16px 18px}}
      @media(max-width:360px){.atmosphere-mode,.atmosphere-venue,.atmosphere-listener,.atmosphere-pattern{font-size:13px}.atmosphere-tap{width:92px;height:92px}}
      @media(prefers-reduced-motion: reduce){.atmosphere-button::after,.atmosphere-panel,.atmosphere-tip,.atmosphere-mode,.atmosphere-venue,.atmosphere-listener,.atmosphere-pattern,.atmosphere-tap,.atmosphere-knob,.atmosphere-knob::after,.atmosphere-body{transition:none;animation:none}}
    `;
    document.head.append(style);
  }

  function focusables() {
    return [...state.panel.querySelectorAll('button:not([disabled]),input:not([disabled]),[href],[tabindex]:not([tabindex="-1"])')].filter((node) => node.getClientRects().length > 0);
  }

  function setBackgroundInert(inert) {
    if (inert) {
      state.inertNodes = [app, document.getElementById('providerStage'), document.getElementById('youtubeStage'), document.getElementById('installBanner')].filter((node) => node && node !== state.panel && !state.panel.contains(node));
      state.inertNodes.forEach((node) => node.setAttribute('inert', ''));
    } else {
      state.inertNodes.forEach((node) => node.removeAttribute('inert'));
      state.inertNodes = [];
    }
  }

  function createUi() {
    injectStyles();
    const button = document.createElement('button');
    button.id = 'atmosphereButton';
    button.className = 'icon-button atmosphere-button';
    button.type = 'button';
    button.setAttribute('aria-haspopup', 'dialog');
    button.setAttribute('aria-expanded', 'false');
    button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="1.7"></circle><path d="M8.4 8.4a5.1 5.1 0 0 0 0 7.2M15.6 8.4a5.1 5.1 0 0 1 0 7.2M5.5 5.5a9.2 9.2 0 0 0 0 13M18.5 5.5a9.2 9.2 0 0 1 0 13"></path></svg>';
    const queue = document.getElementById('queueButton');
    utilityBar.insertBefore(button, queue?.nextSibling || null);

    const backdrop = document.createElement('button');
    backdrop.type = 'button';
    backdrop.className = 'atmosphere-backdrop';
    backdrop.hidden = true;
    backdrop.tabIndex = -1;
    backdrop.setAttribute('aria-label', 'Close Garba Atmosphere');
    document.body.append(backdrop);

    const panel = document.createElement('section');
    panel.id = 'atmospherePanel';
    panel.className = 'atmosphere-panel';
    panel.hidden = true;
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.setAttribute('aria-labelledby', 'atmosphereTitle');
    panel.innerHTML = `
      <div class="atmosphere-panel-header">
        <button class="atmosphere-test" type="button" aria-label="Test Garba Atmosphere" aria-pressed="false" title="Test atmosphere">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.4v13.2L18.5 12 8 5.4Z"></path></svg>
        </button>
        <h2 id="atmosphereTitle">Garba Atmosphere</h2>
        <button class="atmosphere-close" type="button" aria-label="Close Garba Atmosphere">×</button>
      </div>
      <button class="atmosphere-power" type="button" role="switch" aria-checked="false">
        <span><strong>Atmosphere is off</strong><small>A Garba night around your music: the crowd, the claps and the venue.</small></span>
        <i class="atmosphere-knob" aria-hidden="true"></i>
      </button>
      <div class="atmosphere-body">
        <section class="atmosphere-section" aria-labelledby="atmosphereModesTitle">
          <h3 id="atmosphereModesTitle">Around the music</h3>
          <div class="atmosphere-modes"></div>
          <p class="atmosphere-desc atmosphere-mode-desc" aria-live="polite"></p>
        </section>
        <section class="atmosphere-section" aria-labelledby="atmosphereVenueTitle">
          <h3 id="atmosphereVenueTitle">Venue</h3>
          <div class="atmosphere-venues"></div>
          <p class="atmosphere-desc atmosphere-venue-desc" aria-live="polite"></p>
        </section>
        <section class="atmosphere-section" aria-labelledby="atmosphereWhereTitle">
          <h3 id="atmosphereWhereTitle">Where you are</h3>
          <div class="atmosphere-listeners"></div>
          <p class="atmosphere-desc atmosphere-listener-desc" aria-live="polite"></p>
        </section>
        <section class="atmosphere-section atmosphere-beat" aria-labelledby="atmosphereBeatTitle">
          <h3 id="atmosphereBeatTitle">Beat</h3>
          <button class="atmosphere-tap" type="button" aria-describedby="atmosphereTempo">Tap the beat</button>
          <button class="atmosphere-listen" type="button" aria-pressed="false" aria-describedby="atmosphereListenNote">Follow the song's beat</button>
          <p class="atmosphere-desc atmosphere-listen-note" id="atmosphereListenNote">Uses your microphone to hear the beat from your speaker, so the claps stay with the song as it speeds up. Nothing is recorded or sent.</p>
          <div class="atmosphere-dots" aria-hidden="true"><i></i><i></i><i></i><i></i></div>
          <p class="atmosphere-bpm" aria-hidden="true"></p>
          <p class="atmosphere-desc atmosphere-tempo" id="atmosphereTempo" aria-live="polite"></p>
          <div class="atmosphere-patterns" role="group" aria-label="Clap pattern"></div>
        </section>
        <section class="atmosphere-section atmosphere-level">
          <h3><label for="atmosphereLevel">Intensity</label></h3>
          <input id="atmosphereLevel" type="range" min="5" max="100" step="5" value="${Math.round(state.level * 100)}" />
          <output for="atmosphereLevel">${Math.round(state.level * 100)}%</output>
        </section>
      </div>
      <p class="atmosphere-status" role="status" aria-live="polite"></p>
      <p class="atmosphere-note">Plays a Garba night around the song. The song itself plays as YouTube sends it. <a class="atmosphere-room" href="./atmosphere/">Open the listening room</a></p>
    `;
    document.body.append(panel);

    const modes = panel.querySelector('.atmosphere-modes');
    for (const [id, profile] of Object.entries(MODES)) {
      if (id === 'off') continue;
      const mode = document.createElement('button');
      mode.type = 'button';
      mode.className = 'atmosphere-mode';
      mode.dataset.mode = id;
      mode.textContent = profile.label;
      mode.title = profile.desc;
      mode.addEventListener('click', () => setMode(id, { userGesture: true }));
      modes.append(mode);
    }

    const venues = panel.querySelector('.atmosphere-venues');
    for (const [id, venue] of Object.entries(VENUES)) {
      const control = document.createElement('button');
      control.type = 'button';
      control.className = 'atmosphere-venue';
      control.dataset.venue = id;
      control.textContent = venue.label;
      control.title = venue.desc;
      control.addEventListener('click', () => setVenue(id));
      venues.append(control);
    }

    const listeners = panel.querySelector('.atmosphere-listeners');
    for (const [id, listener] of Object.entries(LISTENERS)) {
      const control = document.createElement('button');
      control.type = 'button';
      control.className = 'atmosphere-listener';
      control.dataset.listener = id;
      control.textContent = listener.label;
      control.title = listener.desc;
      control.addEventListener('click', () => setListener(id));
      listeners.append(control);
    }

    const patterns = panel.querySelector('.atmosphere-patterns');
    for (const [id, pattern] of Object.entries(PATTERNS)) {
      const control = document.createElement('button');
      control.type = 'button';
      control.className = 'atmosphere-pattern';
      control.dataset.pattern = id;
      control.textContent = pattern.label;
      control.addEventListener('click', () => setPattern(id));
      patterns.append(control);
    }

    const close = panel.querySelector('.atmosphere-close');
    const test = panel.querySelector('.atmosphere-test');
    const tap = panel.querySelector('.atmosphere-tap');
    const listen = panel.querySelector('.atmosphere-listen');
    const slider = panel.querySelector('#atmosphereLevel');
    const output = panel.querySelector('output');
    const levelWrap = panel.querySelector('.atmosphere-level');
    const power = panel.querySelector('.atmosphere-power');

    const syncSliderFill = () => slider.style.setProperty('--fill', `${slider.value}%`);
    const endAdjust = () => levelWrap.classList.remove('is-adjusting');

    button.addEventListener('click', () => setPanelOpen(!state.panelOpen));
    backdrop.addEventListener('click', () => setPanelOpen(false));
    close.addEventListener('click', () => setPanelOpen(false));
    test.addEventListener('click', () => togglePreview());
    power.addEventListener('click', () => setEnabled(state.mode === 'off'));
    // Taps are timed on pointerdown for accuracy. Screen readers only send click, so accept those too.
    tap.addEventListener('pointerdown', (event) => { event.preventDefault(); registerTap(); });
    listen.addEventListener('click', () => { void toggleListening(); });
    tap.addEventListener('click', (event) => { if (event.detail === 0 && !state.tapKeyed) registerTap(); state.tapKeyed = false; });
    tap.addEventListener('keydown', (event) => { if ((event.key === 'Enter' || event.key === ' ') && !event.repeat) { event.preventDefault(); state.tapKeyed = true; registerTap(); } });
    slider.addEventListener('input', () => {
      state.level = clamp(Number(slider.value) / 100, 0.05, 1);
      output.value = `${Math.round(state.level * 100)}%`;
      levelWrap.classList.add('is-adjusting');
      syncSliderFill();
      persist();
      applyMasterLevel();
      dispatchChange('level');
    });
    slider.addEventListener('pointerup', () => setTimeout(endAdjust, 500));
    slider.addEventListener('change', () => setTimeout(endAdjust, 500));
    slider.addEventListener('blur', endAdjust);

    panel.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setPanelOpen(false);
        return;
      }
      if (event.key !== 'Tab') return;
      const items = focusables();
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    });

    state.button = button;
    state.backdrop = backdrop;
    state.panel = panel;
    state.slider = slider;
    state.output = output;
    state.test = test;
    state.tap = tap;
    state.listen = listen;
    state.power = power;
    state.body = panel.querySelector('.atmosphere-body');
    state.modeDesc = panel.querySelector('.atmosphere-mode-desc');
    state.bpmText = panel.querySelector('.atmosphere-bpm');
    state.dots = [...panel.querySelectorAll('.atmosphere-dots i')];
    state.tempoText = panel.querySelector('.atmosphere-tempo');
    state.venueDesc = panel.querySelector('.atmosphere-venue-desc');
    state.listenerDesc = panel.querySelector('.atmosphere-listener-desc');
    state.status = panel.querySelector('.atmosphere-status');
    syncSliderFill();
    syncUi();
  }

  function setPanelOpen(open) {
    const next = Boolean(open);
    if (next === state.panelOpen) return;
    state.panelOpen = next;
    if (next) {
      state.previousFocus = document.activeElement;
      state.panel.hidden = false;
      state.backdrop.hidden = false;
      state.button.setAttribute('aria-expanded', 'true');
      setBackgroundInert(true);
      hideIntro({ remember: true });
      requestAnimationFrame(() => (state.panel.querySelector('.atmosphere-mode[aria-pressed="true"]') || state.power)?.focus({ preventScroll: true }));
    } else {
      state.panel.hidden = true;
      state.backdrop.hidden = true;
      state.button.setAttribute('aria-expanded', 'false');
      setBackgroundInert(false);
      const target = state.previousFocus?.isConnected ? state.previousFocus : state.button;
      state.previousFocus = null;
      target?.focus?.({ preventScroll: true });
    }
  }

  function tempoLabel() {
    const tempo = state.engine?.tempo;
    const profile = MODES[state.mode] || MODES.off;
    if (state.mode === 'off') return 'Turn Atmosphere on, then tap along with the song.';
    if (!profile.claps) return 'Choose Claps or Full circle to add the circle clapping in time.';
    const what = currentStyle() === 'dandiya' ? 'Dandiya sticks' : 'Claps';
    if (tempo && state.tempoSource === 'taps') return `${what} follow your taps. Tap again if the rhythm changes.`;
    if (tempo && state.tempoSource === 'mic') return `${what} follow the song's beat through the microphone, and keep up as it speeds up.`;
    if (state.listenStatus === 'listening' || state.listenStatus === 'starting') return 'Listening for the beat. Play the song out loud; it takes a few seconds.';
    if (state.listenStatus === 'denied') return 'The microphone is blocked for this site. Tap the beat instead, or allow the microphone in your browser settings.';
    if (state.listenStatus === 'unavailable') return "This browser can't use the microphone here. Tap the beat instead.";
    if (state.taps.length) return `Keep going: ${Math.max(0, 4 - state.taps.length)} more ${4 - state.taps.length === 1 ? 'tap' : 'taps'}.`;
    return `Tap 4 times in time with the song. ${what} join in once they know the tempo.`;
  }

  const HEADPHONES = '<svg class="atmosphere-headphone-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 14v-2a8 8 0 0 1 16 0v2"></path><path d="M4 14h3v6H5.5A1.5 1.5 0 0 1 4 18.5V14ZM20 14h-3v6h1.5a1.5 1.5 0 0 0 1.5-1.5V14Z"></path></svg> ';

  function waitingForBeat() {
    const profile = MODES[state.mode] || MODES.off;
    return Boolean(profile.claps) && state.playbackActive && state.tempoSource !== 'taps' && state.tempoSource !== 'mic';
  }

  function syncUi() {
    const profile = MODES[state.mode] || MODES.off;
    const off = state.mode === 'off';
    if (!state.button) return;
    const waiting = waitingForBeat();
    state.button.setAttribute('aria-pressed', String(!off));
    state.button.dataset.waiting = String(waiting);
    const label = off ? 'Garba Atmosphere: off' : waiting ? `Garba Atmosphere: ${profile.label}. Tap the beat to start the claps` : `Garba Atmosphere: ${profile.label}`;
    state.button.setAttribute('aria-label', label);
    state.button.title = label;
    if (state.power) {
      state.power.setAttribute('aria-checked', String(!off));
      state.power.querySelector('strong').textContent = off ? 'Atmosphere is off' : 'Atmosphere is on';
    }
    if (state.body) state.body.dataset.off = String(off);
    state.panel?.querySelectorAll('.atmosphere-mode').forEach((control) => {
      control.setAttribute('aria-pressed', String(control.dataset.mode === state.mode));
    });
    state.panel?.querySelectorAll('.atmosphere-venue').forEach((control) => {
      control.setAttribute('aria-pressed', String(control.dataset.venue === state.venue));
      control.disabled = off;
    });
    state.panel?.querySelectorAll('.atmosphere-pattern').forEach((control) => {
      control.setAttribute('aria-pressed', String(control.dataset.pattern === state.pattern));
      control.disabled = off || !profile.claps;
    });
    state.panel?.querySelectorAll('.atmosphere-listener').forEach((control) => {
      control.setAttribute('aria-pressed', String(control.dataset.listener === state.listener));
      control.disabled = off;
    });
    if (state.modeDesc) {
      const shown = off ? state.lastMode || 'immersive' : state.mode;
      state.modeDesc.innerHTML = (shown === 'immersive' ? HEADPHONES : '') + MODES[shown].desc;
    }
    if (state.venueDesc) state.venueDesc.textContent = VENUES[state.venue].desc;
    if (state.listenerDesc) state.listenerDesc.textContent = LISTENERS[state.listener].desc;
    const tempo = state.engine?.tempo;
    const locked = Boolean(tempo && (state.tempoSource === 'taps' || state.tempoSource === 'mic'));
    if (state.tap) {
      state.tap.disabled = off || !profile.claps;
      state.tap.dataset.locked = String(locked);
      state.tap.textContent = locked ? 'Tap to adjust' : 'Tap the beat';
    }
    if (state.listen) {
      const on = state.listenStatus !== 'off' && state.listenStatus !== 'denied' && state.listenStatus !== 'unavailable';
      state.listen.disabled = off || !profile.claps;
      state.listen.setAttribute('aria-pressed', String(on));
      state.listen.textContent = on ? (state.listenStatus === 'following' ? 'Following the beat · stop' : 'Listening… · stop') : "Follow the song's beat";
    }
    if (state.bpmText) state.bpmText.innerHTML = locked ? `${Math.round(tempo.bpm)}<span>BPM</span>` : '';
    if (state.dots) state.dots.forEach((dot, i) => dot.classList.toggle('on', locked || i < state.taps.length));
    if (state.tempoText) state.tempoText.textContent = tempoLabel();
    if (state.slider) state.slider.disabled = off;
    if (state.test) {
      state.test.disabled = off;
      state.test.setAttribute('aria-pressed', String(state.previewActive));
      state.test.setAttribute('aria-label', state.previewActive ? 'Stop atmosphere test' : 'Test Garba Atmosphere');
      state.test.title = state.previewActive ? 'Stop test' : 'Test atmosphere';
      const path = state.test.querySelector('path');
      if (path) path.setAttribute('d', state.previewActive ? 'M7 6h4v12H7V6Zm6 0h4v12h-4V6Z' : 'M8 5.4v13.2L18.5 12 8 5.4Z');
    }
  }

  // A one-time pointer to Atmosphere for people who have never opened it.
  const INTRO_KEY = 'garba:atmosphere-intro';
  function introSeen() { try { return localStorage.getItem(INTRO_KEY) === 'seen'; } catch { return true; } }
  function showIntro() {
    if (introSeen() || state.mode !== 'off' || state.panelOpen || state.tip || document.hidden) return;
    const rect = state.button.getBoundingClientRect();
    if (!rect.width) return;
    const tip = document.createElement('div');
    tip.className = 'atmosphere-tip';
    tip.setAttribute('role', 'note');
    tip.innerHTML = `
      <strong><em>New</em>Garba Atmosphere</strong>
      <p>Hear a Garba night around your music: the crowd, the circle clapping in time, and the venue.</p>
      <div class="atmosphere-tip-actions"><button type="button" data-tip="later">Not now</button><button class="primary" type="button" data-tip="try">Try it</button></div>
    `;
    document.body.append(tip);
    const width = tip.offsetWidth;
    const left = Math.max(12, Math.min(window.innerWidth - width - 12, rect.right - width + 8));
    tip.style.left = `${left}px`;
    tip.style.top = `${rect.bottom + 12}px`;
    tip.style.setProperty('--arrow', `${Math.max(14, left + width - (rect.left + rect.width / 2) - 6)}px`);
    tip.addEventListener('click', (event) => {
      const action = event.target.closest('[data-tip]')?.dataset.tip;
      if (!action) return;
      hideIntro({ remember: true });
      if (action === 'try') setPanelOpen(true);
    });
    state.tip = tip;
    state.tipTimer = setTimeout(() => hideIntro({ remember: true }), 14000);
  }
  function hideIntro({ remember = false } = {}) {
    clearTimeout(state.tipTimer);
    state.tip?.remove();
    state.tip = null;
    if (remember) { try { localStorage.setItem(INTRO_KEY, 'seen'); } catch { /* storage unavailable */ } }
  }

  function setStatus(message = '') {
    if (state.status) state.status.textContent = message;
  }

  function dispatchChange(reason) {
    window.dispatchEvent(new CustomEvent('garba:atmosphere-change', {
      detail: {
        reason,
        mode: state.mode,
        venue: state.venue,
        listener: state.listener,
        pattern: state.pattern,
        bpm: state.engine?.tempo ? Math.round(state.engine.tempo.bpm) : null,
        level: state.level,
        audible: state.playbackActive || state.previewActive,
        constrained: constrainedConnection(),
      },
    }));
  }

  async function loadManifest() {
    if (state.manifest) return state.manifest;
    try {
      const response = await fetch(SOURCE_MANIFEST, { cache: 'force-cache' });
      state.manifest = response.ok ? await response.json() : { sources: [] };
    } catch { state.manifest = { sources: [] }; }
    return state.manifest;
  }

  // Beds come from the manifest: public-domain, enabled, no music. AAC first for Safari.
  async function loadBed(role) {
    if (constrainedConnection()) return null;
    const manifest = await loadManifest();
    const source = (manifest.sources || []).find((item) => item.role === role && item.enabled && item.license === 'public-domain' && item.containsMusic === false);
    if (!source) return null;
    const candidates = [...(source.files || []).map((file) => file.url), source.audioUrl].filter(Boolean);
    for (const url of candidates) {
      try {
        const response = await fetch(url, { cache: 'force-cache' });
        if (!response.ok) continue;
        const data = await response.arrayBuffer();
        const buffer = await new Promise((resolve, reject) => {
          const result = state.context.decodeAudioData(data, resolve, reject);
          if (result?.then) result.then(resolve, reject);
        });
        if (buffer) return buffer;
      } catch { /* try the next format */ }
    }
    return null;
  }

  async function ensureContext() {
    if (!AudioContextCtor) { setStatus('Atmosphere audio is not supported on this browser.'); return false; }
    if (!state.context) {
      // iOS mutes Web Audio with the ringer switch unless the session is set to playback.
      try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch { /* unsupported */ }
      try { state.context = new AudioContextCtor({ latencyHint: 'playback' }); } catch {
        try { state.context = new AudioContextCtor(); } catch { setStatus('Garba Atmosphere could not start on this device.'); return false; }
      }
      state.engine = createEngine(state.context, { loadBed });
      state.engine.setLevel(state.level * 0.8, 0.01);
      state.engine.setVenue(state.venue, { ramp: 0.05 });
      state.engine.setListener(state.listener, { ramp: 0.05 });
      state.engine.setPattern(state.pattern);
    }
    if (state.context.state !== 'running') {
      try { await state.context.resume(); } catch { return false; }
    }
    return state.context.state === 'running';
  }

  // Keep scheduling ahead of the audio clock. Hidden tabs throttle timers, so look further ahead.
  function startScheduler() {
    clearInterval(state.schedulerTimer);
    state.lastAnimate = performance.now();
    state.schedulerTimer = setInterval(() => {
      if (!state.engine || !state.context) return;
      const ahead = document.hidden ? 1.6 : 0.2;
      state.engine.schedule(state.context.currentTime + ahead);
      const t = performance.now();
      if (!reducedMotion.matches) state.engine.animate((t - state.lastAnimate) / 1000);
      state.lastAnimate = t;
    }, 25);
  }
  function stopScheduler() { clearInterval(state.schedulerTimer); state.schedulerTimer = 0; }

  function clearScene() {
    stopScheduler();
    state.engine?.stop({ fade: 0.1 });
    state.sceneReady = false;
  }

  function targetMasterGain() {
    if (!state.context || !state.engine || state.mode === 'off' || (!state.playbackActive && !state.previewActive)) return 0;
    return state.level * 0.8;
  }

  function applyMasterLevel({ quick = false } = {}) {
    if (!state.engine) return;
    const target = targetMasterGain();
    if (target > 0) state.engine.setLevel(target, quick ? 0.06 : 0.18);
    else state.engine.stop({ fade: quick ? 0.08 : 0.16 });
  }

  async function buildScene({ smooth = true } = {}) {
    const generation = ++state.generation;
    clearTimeout(state.idleTimer);
    if (state.mode === 'off') { applyMasterLevel({ quick: true }); clearScene(); return; }
    if (!await ensureContext()) return;
    if (smooth && state.sceneReady) {
      state.engine.stop({ fade: 0.08 });
      await sleep(110);
      if (generation !== state.generation) return;
    }
    const profile = runtimeProfile();
    state.engine.setStyle(currentStyle());
    await startBeds(profile);
    if (generation !== state.generation) return;
    if (state.previewActive && !state.playbackActive && state.tempoSource !== 'taps' && state.tempoSource !== 'mic') {
      state.engine.setTempo(PREVIEW_BPM, state.context.currentTime + 0.35);
      state.tempoSource = 'preview';
    }
    state.sceneReady = true;
    state.engine.setLevel(targetMasterGain(), 0.2);
    state.engine.start();
    startScheduler();
  }

  async function startBeds(profile) {
    await state.engine.setProfile(profile);
  }

  function scheduleIdleSuspend() {
    clearTimeout(state.idleTimer);
    // The microphone follower needs the audio running, even before the song starts
    if (state.previewActive || state.playbackActive || state.follower || state.mode === 'off') return;
    state.idleTimer = setTimeout(() => {
      if (state.previewActive || state.playbackActive || state.follower) return;
      clearScene();
      if (state.context?.state === 'running') state.context.suspend().catch(() => {});
    }, 2400);
  }

  function stopPreview({ announce = true } = {}) {
    clearTimeout(state.previewTimer);
    state.previewTimer = 0;
    if (!state.previewActive) return;
    state.previewActive = false;
    if (state.tempoSource === 'preview') { state.engine?.clearTempo(); state.tempoSource = null; }
    syncUi();
    applyMasterLevel({ quick: true });
    if (announce) setStatus('Atmosphere test stopped.');
    scheduleIdleSuspend();
    dispatchChange('preview-ended');
  }

  async function previewCurrentMode() {
    if (state.mode === 'off') return;
    if (state.previewActive) { stopPreview(); return; }
    clearTimeout(state.previewTimer);
    if (!await ensureContext()) return;
    state.previewActive = true;
    syncUi();
    await buildScene({ smooth: true });
    setStatus(`Testing ${MODES[state.mode].label} at ${VENUES[state.venue].label}, ${LISTENERS[state.listener].label.toLowerCase()}.`);
    state.previewTimer = setTimeout(() => stopPreview({ announce: false }), 6000);
    dispatchChange('preview-started');
  }

  function togglePreview() { return previewCurrentMode(); }

  function setVenue(id) {
    if (!VENUES[id]) return;
    state.venue = id;
    persist();
    state.engine?.setVenue(id);
    syncUi();
    dispatchChange('venue');
  }

  function setListener(id) {
    if (!LISTENERS[id]) return;
    state.listener = id;
    persist();
    state.engine?.setListener(id);
    syncUi();
    dispatchChange('listener');
  }

  function setPattern(id) {
    if (!PATTERNS[id]) return;
    state.pattern = id;
    persist();
    state.engine?.setPattern(id);
    syncUi();
    dispatchChange('pattern');
  }

  // Tap tempo. Four taps set the tempo; each later tap refines it. A pause of more
  // than two seconds starts a new count. Beats are placed where the taps were heard.
  async function registerTap() {
    // Stamp the tap on the page clock before anything async, so waking the audio on the
    // first tap cannot delay it and shorten the first interval.
    const tappedAt = performance.now() / 1000;
    // Tapping takes over from the microphone
    if (state.follower) stopListening();
    if (!await ensureContext()) return;
    const ctx = state.context;
    const last = state.taps[state.taps.length - 1];
    if (last !== undefined && tappedAt - last > 2) state.taps = [];
    state.taps.push(tappedAt);
    if (state.taps.length > 12) state.taps.shift();
    state.tap?.classList.add('is-hit');
    setTimeout(() => state.tap?.classList.remove('is-hit'), 90);
    if (state.taps.length >= 4) {
      // Least-squares fit of tap time against tap number gives period and phase.
      const n = state.taps.length;
      const xs = state.taps.map((_, i) => i);
      const mx = (n - 1) / 2;
      const my = state.taps.reduce((a, b) => a + b, 0) / n;
      let num = 0; let den = 0;
      for (let i = 0; i < n; i += 1) { num += (xs[i] - mx) * (state.taps[i] - my); den += (xs[i] - mx) ** 2; }
      const period = num / den;
      const bpm = 60 / period;
      if (bpm >= 50 && bpm <= 200) {
        // Move the fitted first beat from the page clock onto the audio clock, as the listener heard it.
        const firstBeat = ctx.currentTime - (performance.now() / 1000 - (my - mx * period)) - (ctx.outputLatency || ctx.baseLatency || 0);
        // Keep the round counted from the first tap of this count.
        state.engine.setTempo(bpm, firstBeat, { locked: true });
        state.tempoSource = 'taps';
        if (!state.sceneReady && (state.playbackActive || state.previewActive)) void buildScene({ smooth: false });
        dispatchChange('tempo');
      }
    }
    syncUi();
  }

  // The microphone beat follower: on only when the listener asks, off with Atmosphere or when they tap
  async function toggleListening() {
    if (state.follower) { stopListening(); return; }
    if (!await ensureContext()) return;
    const engineApi = window.GARBA_ATMOSPHERE_ENGINE;
    state.follower = engineApi.createBeatFollower(state.context, {
      onState: (next) => { state.listenStatus = next; if (next === 'denied' || next === 'unavailable') state.follower = null; syncUi(); },
      onBeat: ({ bpm, anchor }) => {
        if (!state.engine || state.tempoSource === 'taps') return;
        state.engine.setTempo(bpm, anchor, { locked: true });
        const first = state.tempoSource !== 'mic';
        state.tempoSource = 'mic';
        if (first) {
          if (!state.sceneReady && (state.playbackActive || state.previewActive)) void buildScene({ smooth: false });
          dispatchChange('tempo');
        }
        syncUi();
      },
    });
    const ok = await state.follower?.start();
    if (!ok && state.follower) state.follower = null;
    syncUi();
  }
  function stopListening() {
    const follower = state.follower;
    state.follower = null;
    follower?.stop();
    state.listenStatus = 'off';
    if (state.tempoSource === 'mic') { state.engine?.clearTempo(); state.tempoSource = null; }
    syncUi();
  }

  function clearTaps() {
    state.taps = [];
    if (state.tempoSource === 'taps') { state.engine?.clearTempo(); state.tempoSource = null; }
    syncUi();
  }

  async function setMode(mode, { userGesture = false } = {}) {
    if (!MODES[mode]) return;
    stopPreview({ announce: false });
    state.mode = mode;
    if (mode !== 'off') state.lastMode = mode;
    persist();
    syncUi();
    dispatchChange('mode');
    if (mode === 'off') {
      if (state.follower) stopListening();
      applyMasterLevel({ quick: true });
      await sleep(100);
      clearScene();
      scheduleIdleSuspend();
      return;
    }
    if (userGesture && !await ensureContext()) return;
    state.playbackActive = playbackIsActive();
    if (state.playbackActive) await buildScene({ smooth: true });
    else scheduleIdleSuspend();
  }

  function setEnabled(on) {
    hideIntro({ remember: true });
    return setMode(on ? (state.lastMode || 'immersive') : 'off', { userGesture: true });
  }

  function syncPlaybackState() {
    const active = playbackIsActive();
    if (active === state.playbackActive && !(active && state.mode !== 'off' && !state.sceneReady)) return;
    state.playbackActive = active;
    syncUi();
    if (active && !introSeen()) { clearTimeout(state.introTimer); state.introTimer = setTimeout(() => { if (state.playbackActive) showIntro(); }, 4000); }
    if (active) stopPreview({ announce: false });
    dispatchChange(active ? 'play' : 'pause');
    if (state.mode === 'off') return;
    if (active) {
      clearTimeout(state.idleTimer);
      ensureContext().then((ready) => {
        if (!ready || !state.playbackActive) return;
        void buildScene({ smooth: false });
      });
    } else if (!state.previewActive) {
      applyMasterLevel({ quick: true });
      scheduleIdleSuspend();
    }
  }

  function trustedPlaybackUnlock(event) {
    if (!event.isTrusted || state.mode === 'off') return;
    const target = event.target instanceof Element ? event.target : null;
    if (target && !target.closest('#playButton,#miniPlay,.song-copy,#prevButton,#nextButton,#miniPrev,#miniNext,#atmosphereButton,.atmosphere-mode,.atmosphere-venue,.atmosphere-listener,.atmosphere-tap,#atmosphereLevel,.atmosphere-test')) return;
    ensureContext().then((ready) => { if (ready) requestAnimationFrame(syncPlaybackState); });
  }

  function handleConnectionChange() {
    if (state.mode !== 'off' && state.playbackActive) void buildScene({ smooth: true });
  }

  createUi();
  state.playbackActive = playbackIsActive();

  directAudio?.addEventListener('play', syncPlaybackState);
  directAudio?.addEventListener('pause', syncPlaybackState);
  directAudio?.addEventListener('ended', syncPlaybackState);
  directAudio?.addEventListener('emptied', syncPlaybackState);
  document.addEventListener('pointerdown', trustedPlaybackUnlock, { capture: true });
  document.addEventListener('keydown', (event) => {
    if (!event.isTrusted || event.code !== 'Space' || state.mode === 'off') return;
    ensureContext().then((ready) => { if (ready) requestAnimationFrame(syncPlaybackState); });
  }, { capture: true });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      stopPreview({ announce: false });
      if (!playbackIsActive()) {
        state.playbackActive = false;
        applyMasterLevel({ quick: true });
        scheduleIdleSuspend();
      }
    } else {
      requestAnimationFrame(syncPlaybackState);
    }
  });
  new MutationObserver(syncPlaybackState).observe(app, { attributes: true, attributeFilter: ['class'] });
  // A new song or genre means a new rhythm: drop the old tempo and switch claps or sticks.
  new MutationObserver(() => { state.engine?.setStyle(currentStyle()); syncUi(); }).observe(app, { attributes: true, attributeFilter: ['data-genre'] });
  const songTitle = document.getElementById('songTitle');
  if (songTitle) new MutationObserver(clearTaps).observe(songTitle, { childList: true, characterData: true, subtree: true });
  connection?.addEventListener?.('change', handleConnectionChange);

  const songSheet = document.getElementById('songSheet');
  if (songSheet) new MutationObserver(() => { if (state.panelOpen && songSheet.getAttribute('aria-hidden') === 'false') setPanelOpen(false); }).observe(songSheet, { attributes: true, attributeFilter: ['aria-hidden'] });

  window.addEventListener('pagehide', () => {
    if (state.follower) stopListening();
    stopPreview({ announce: false });
    state.playbackActive = false;
    applyMasterLevel({ quick: true });
    if (state.context?.state === 'running') state.context.suspend().catch(() => {});
  });
  window.addEventListener('pageshow', () => requestAnimationFrame(syncPlaybackState));

  window.GARBA_ATMOSPHERE = {
    get mode() { return state.mode; },
    set mode(value) { void setMode(value); },
    get venue() { return state.venue; },
    set venue(value) { setVenue(value); },
    get listener() { return state.listener; },
    set listener(value) { setListener(value); },
    get pattern() { return state.pattern; },
    get bpm() { return state.engine?.tempo ? state.engine.tempo.bpm : null; },
    get level() { return state.level; },
    set level(value) {
      state.level = clamp(Number(value) || 0.45, 0.05, 1);
      if (state.slider) {
        state.slider.value = String(Math.round(state.level * 100));
        state.slider.style.setProperty('--fill', `${Math.round(state.level * 100)}%`);
      }
      if (state.output) state.output.value = `${Math.round(state.level * 100)}%`;
      persist();
      applyMasterLevel();
      dispatchChange('level');
    },
    get active() { return state.mode !== 'off' && (state.playbackActive || state.previewActive) && Boolean(state.context) && state.sceneReady; },
    get playbackSynced() { return state.playbackActive; },
    get constrained() { return constrainedConnection(); },
    get spatialModel() { return state.mode === 'immersive' ? 'HRTF' : 'stereo'; },
    setMode,
    setVenue,
    setListener,
    setPattern,
    setEnabled,
    tap: registerTap,
    preview() { return previewCurrentMode(); },
    stopPreview,
    stop() { return setMode('off'); },
  };
})();
