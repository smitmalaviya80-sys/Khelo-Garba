/* Garba venue scene: several circles dancing around their garbos in a drawn venue, with clap waves that
   leave the dancers and reach the listener on the beat they hear. Pure canvas drawing on a ground plane seen
   through a level camera; the page owns the audio and feeds this renderer its clock and beat. */
(function () {
  'use strict';

  var TAU = Math.PI * 2, NEAR = 0.6;
  var SYNODIC = 29.530588853, NEW_MOON = Date.UTC(2000, 0, 6, 18, 14);

  // The moon's age in days since new moon (today's when no age is given), how much of it is lit, and its name.
  function moonInfo(age) {
    if (age == null) age = (((Date.now() - NEW_MOON) / 864e5) % SYNODIC + SYNODIC) % SYNODIC;
    var k = (1 - Math.cos(age / SYNODIC * TAU)) / 2, waxing = age < SYNODIC / 2;
    var name = age < 1 || age > SYNODIC - 1 ? 'new moon' : k > 0.97 ? 'full moon' : Math.abs(k - 0.5) < 0.06 ? (waxing ? 'first quarter' : 'last quarter') : k < 0.5 ? (waxing ? 'waxing crescent' : 'waning crescent') : (waxing ? 'waxing gibbous' : 'waning gibbous');
    return { age: age, lit: k, name: name, waxing: waxing };
  }
  var SKIRTS = ['#c0392b', '#d6246e', '#e8a33d', '#2f8f5b', '#3b4cc0', '#8e44ad', '#e67e22', '#16a085', '#b83227'];
  var TOPS = ['#f0c24b', '#2f8f5b', '#c2185b', '#3b4cc0', '#e67e22', '#8e44ad'];
  var BULBS = ['#ffd58a', '#ffb070', '#ffe9b8', '#9fe7b8', '#ff8fb3', '#8fc7ff'];
  // Each kind of Garba night is lit differently: bulbs, stage washes, the stage screen and how fast the lights move.
  var THEMES = {
    traditional: { bulbs: ['#ffd58a', '#ffb070', '#ffe9b8', '#ff9f5a'], flags: ['#f08a24', '#c2185b', '#ffc861', '#2f8f5b', '#b8312b'], beams: ['255,214,150', '255,170,90', '255,236,200', '255,190,120'], hues: [28, 42, 16], sat: 75, speed: 0.3, glowTint: '255,190,110' },
    dandiya: { bulbs: ['#ffd58a', '#ff6fa3', '#7fe0a0', '#8fc7ff', '#ffb070', '#c38fff'], flags: ['#f08a24', '#2f8f5b', '#c2185b', '#ffc861', '#3b4cc0'], beams: ['255,120,190', '120,220,255', '255,200,90', '190,140,255'], hues: [320, 190, 45, 270], sat: 82, speed: 0.75, glowTint: '255,170,200' },
    devotional: { bulbs: ['#ffe9b8', '#ffd58a', '#fff4dc'], flags: ['#f08a24', '#ffc861', '#b8312b', '#f3e6d0'], beams: ['255,236,200', '255,214,150'], hues: [34, 22], sat: 60, speed: 0.12, glowTint: '255,210,150', diyas: true },
    folk: { bulbs: ['#ffb070', '#ffd58a', '#e8a33d', '#9fe7b8'], flags: ['#b8312b', '#2f8f5b', '#e8a33d', '#3b4cc0'], beams: ['255,190,120', '210,235,170', '255,220,160'], hues: [24, 90, 12], sat: 62, speed: 0.28, glowTint: '255,190,120' },
    sanedo: { bulbs: ['#ffd58a', '#ff8fb3', '#ffb070', '#9fe7b8'], flags: ['#c2185b', '#f08a24', '#ffc861', '#2f8f5b'], beams: ['255,140,190', '255,200,110', '255,236,200'], hues: [340, 30, 50], sat: 78, speed: 0.55, glowTint: '255,170,170' },
    fusion: { bulbs: ['#8fc7ff', '#c38fff', '#ff6fa3', '#7fe0ff'], flags: ['#3b4cc0', '#8e44ad', '#c2185b', '#16a085'], beams: ['120,220,255', '190,120,255', '255,90,180', '90,255,220'], hues: [200, 280, 320], sat: 88, speed: 1.05, glowTint: '170,150,255' },
    nonstop: { bulbs: ['#ffd58a', '#ff6fa3', '#8fc7ff', '#ffb070', '#7fe0a0'], flags: ['#f08a24', '#2f8f5b', '#c2185b', '#ffc861', '#3b4cc0'], beams: ['255,200,110', '255,120,190', '120,220,255', '255,236,200'], hues: [30, 320, 190], sat: 80, speed: 0.65, glowTint: '255,190,140' }
  };

  function seeded(s) { s = s % 2147483647 || 7; return function () { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function ease(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }

  // Where the camera stands, in metres. The main circle's garbo is at the origin and Z runs away from you.
  var CAMS = {
    outdoors: { circle: [0, 4.4, -12.5], far: [0, 5.5, -26], stage: [0, 3.2, 39.2] },
    stadium: { circle: [0, 4.6, -12.5], far: [0, 9.5, -37], stage: [0, 3.1, 28.8] },
    sheri: { circle: [0, 4, -11.5], far: [-3, 3, -23], stage: [0, 2.8, 58.8] }
  };

  // The DJ's booth beside the stage, where you walk to pick the next song. The camera stands in front of the table.
  var DJ = { outdoors: { x: 19.5, z: 22 }, stadium: { x: 15.5, z: 17 }, sheri: { x: 4.4, z: 60.6 } };
  // The booth and the space in front of it, where you stand to pick songs, stay clear
  function clearOfBooth(id, x, z, r) { var b = DJ[id]; return !b || (Math.hypot(b.x - x, b.z - z) > r + 3.2 && Math.hypot(b.x - x, b.z - 2.4 - z) > r + 2.6); }
  function djCam(id) { var b = DJ[id] || DJ.outdoors; return [b.x, 1.62, b.z - 2.35]; }

  function create(canvas, opts) {
    opts = opts || {};
    var g = canvas.getContext('2d');
    var W = 1, H = 1, DPR = 1, F = 1, HOR = 1, box = null, BX = 0, BY = 0, BW = 1, BH = 1;
    var cam = { x: 0, y: 4, z: -15 };
    var TH = THEMES.traditional, BEAT = 0, band = {};
    var st = { dj: false, djSay: '', youAs: 'woman', theme: 'traditional', density: 1, venue: 'outdoors', listener: 'circle', style: 'claps', mode: 'immersive', on: false, level: 0.6, lit: null, progress: 0, chapters: null, chapterIndex: -1, live: false };
    var view = { k: 0 };
    var rnd = seeded(opts.seed || (Date.now() % 100000) + 11);
    var layouts = {}, statics = {}, fade = null, fadeA = 0;
    var waves = [], arrivals = [], haze = 0, youGlow = 0, pulse = 0, beatKey = '', visIdx = null, lastMs = 0, running = true;
    // Render quality steps down on its own when frames run slow: first fewer pixels, then a smaller crowd
    var PIXELS = 2.4e6, QP = 1, QD = 1, slowFor = 0, frameMs = 16;
    var reduce = !!opts.reduceMotion;
    var clock = opts.clock || function () { return performance.now() / 1000; };
    var venues = opts.venues || {};

    /* ---------- projection ---------- */
    function P(X, Y, Z) {
      var zc = Z - cam.z; if (zc < NEAR - 1e-6) return null;
      var s = F / zc; return { x: BX + BW / 2 + (X - cam.x) * s, y: HOR + (cam.y - Y) * s, s: s, z: zc };
    }
    function clip(pts) {
      var out = [];
      for (var i = 0; i < pts.length; i++) {
        var a = pts[i], b = pts[(i + 1) % pts.length], za = a[2] - cam.z, zb = b[2] - cam.z;
        if (za >= NEAR) out.push(a);
        if ((za >= NEAR) !== (zb >= NEAR)) { var t = (NEAR - za) / (zb - za); out.push([lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]); }
      }
      return out;
    }
    function poly(pts) {
      pts = clip(pts); if (pts.length < 3) return false;
      g.beginPath();
      for (var i = 0; i < pts.length; i++) { var p = P(pts[i][0], pts[i][1], pts[i][2]); if (i) g.lineTo(p.x, p.y); else g.moveTo(p.x, p.y); }
      g.closePath(); return true;
    }
    function fillPoly(pts, col) { if (poly(pts)) { g.fillStyle = col; g.fill(); } }
    function glow(x, y, r, col, a) {
      if (a <= 0.01 || r <= 0) return;
      g.globalAlpha = Math.min(1, a) * 0.3; g.fillStyle = col; g.beginPath(); g.arc(x, y, r * 3.2, 0, TAU); g.fill();
      g.globalAlpha = Math.min(1, a); g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); g.globalAlpha = 1;
    }
    function groundRing(cx, cz, r, a0, a1, seg) {
      var started = false; seg = seg || 56;
      g.beginPath();
      for (var i = 0; i <= seg; i++) {
        var a = lerp(a0, a1, i / seg), p = P(cx + Math.cos(a) * r, 0, cz + Math.sin(a) * r);
        if (!p) { started = false; continue; }
        if (started) g.lineTo(p.x, p.y); else { g.moveTo(p.x, p.y); started = true; }
      }
    }
    function sag(a, b, drop, u) { return [lerp(a[0], b[0], u), lerp(a[1], b[1], u) - drop * 4 * u * (1 - u), lerp(a[2], b[2], u)]; }

    /* ---------- layouts: the circles on the ground, re-drawn at random each visit ---------- */
    function person(extra) {
      var man = rnd() < 0.4, d = {
        man: man, col: SKIRTS[Math.floor(rnd() * SKIRTS.length)], top: TOPS[Math.floor(rnd() * TOPS.length)], tier: TOPS[Math.floor(rnd() * TOPS.length)],
        odhni: TOPS[Math.floor(rnd() * TOPS.length)], pagdi: ['#b8312b', '#e67e22', '#f0c24b', '#c2185b', '#f3e6d0', '#2f8f5b'][Math.floor(rnd() * 6)],
        moustache: man && rnd() < 0.55, stick: Math.floor(rnd() * 4), ph: rnd() * TAU, ph2: rnd() * TAU, h: 1.52 + rnd() * 0.22 + (man ? 0.1 : 0), flash: 0, twirl: 0
      };
      for (var k in extra) d[k] = extra[k];
      return d;
    }
    function makeCircle(x, z, R, main, parent, force) {
      var n = force || Math.max(5, Math.min(60, Math.round(TAU * R / (parent ? 1.15 : 1.08)))), c = { x0: x, z0: z, R: R, main: main, parent: parent || null, dancers: [], ph: [rnd() * TAU, rnd() * TAU, rnd() * TAU, rnd() * TAU], w: (0.95 + rnd() * 0.35) / R, spin: main ? 0 : rnd() * TAU, wob: parent ? 1.6 : 1 };
      for (var i = 0; i < n; i++) {
        var d0 = person({ a0: -Math.PI / 2 + i / n * TAU, delay: rnd() * 1.8, speed: 2.6 + rnd() * 1.2, lag: rnd() * 0.02, clapAt: 0 });
        if (main && i < 2) {
          // You and your partner: she in a maroon chaniya with a heavy gold border, he in ivory with a maroon pagdi and a gold stole
          if (i === 0) { d0.man = false; d0.coupleRole = 'w'; d0.col = '#8e1b2c'; d0.top = '#d6a24a'; d0.tier = '#e8b04b'; d0.odhni = '#f3e6d0'; d0.h = 1.62; d0.stick = 2; }
          else { d0.man = true; d0.coupleRole = 'm'; d0.col = '#f3e6d0'; d0.top = '#f3e6d0'; d0.legs = '#7a1a2e'; d0.pagdi = '#8e1b2c'; d0.stole = '#e8b04b'; d0.moustache = true; d0.h = 1.76; d0.stick = 2; }
          d0.a0 = -Math.PI / 2 + (i === 0 ? -0.5 : 0.5) / n * TAU; d0.delay = 0.2 + i * 0.2; d0.ph = 1.3; d0.lag = 0;
        }
        if (d0.coupleRole) d0.alt = person({ man: d0.man, h: d0.h });
        c.dancers.push(d0);
      }
      return c;
    }
    function layout(id) {
      if (layouts[id]) return layouts[id];
      // One garbo at the centre of the venue. Rings grow around it, and people start their own circles anywhere.
      var main = makeCircle(0, 0, id === 'sheri' ? 4.4 : 5.6, true), circles = [main];
      if (id !== 'sheri') circles.push(makeCircle(0, 0, 9.4, false, main));
      if (id === 'outdoors') circles.push(makeCircle(0, 0, 13.2, false, main));
      if (id === 'sheri') {
        circles.push(makeCircle(lerp(-0.8, 0.8, rnd()), 17 + rnd() * 2, 3 + rnd() * 0.5, false));
        circles.push(makeCircle(lerp(-1, 1, rnd()), 29 + rnd() * 2, 2.6 + rnd() * 0.5, false));
        circles.push(makeCircle(lerp(-1, 1, rnd()), 41 + rnd() * 3, 2.8 + rnd() * 0.5, false));
      } else {
        var base = circles.length, want = id === 'outdoors' ? 7 + Math.floor(rnd() * 3) : 5 + Math.floor(rnd() * 2), box = id === 'outdoors' ? [-25, 25, -2, 40] : [-20, 20, 2, 32], tries = 0;
        while (circles.length < want + base && tries++ < 900) {
          var R = rnd() < 0.4 ? 1.6 + rnd() * 1.2 : 2.8 + rnd() * (id === 'outdoors' ? 3 : 2), x = lerp(box[0] + R, box[1] - R, rnd()), z = lerp(box[2] + R, box[3] - R, rnd());
          var ok = clearOfBooth(id, x, z, R) && circles.every(function (c) { return Math.hypot(c.x0 - x, c.z0 - z) > c.R + R + 2.4; });
          if (ok) circles.push(makeCircle(x, z, R, false));
        }
      }
      // Around the edges: pairs spinning together and a few dancing alone
      var nPairs = id === 'outdoors' ? 9 : id === 'stadium' ? 6 : 3, bx0 = BOUNDS[id], ptries = 0, placed = 0;
      while (placed < nPairs && ptries++ < 400) {
        var solo = rnd() < 0.3, pr = solo ? 0.3 : 0.55, px = lerp(bx0[0] + 1, bx0[1] - 1, rnd()), pz = lerp(Math.max(bx0[2], 1), bx0[3] - 1, rnd());
        if (clearOfBooth(id, px, pz, pr) && circles.every(function (c) { return Math.hypot(c.x0 - px, c.z0 - pz) > c.R + pr + 1.6; })) { var pc = makeCircle(px, pz, pr, false, null, solo ? 1 : 2); pc.w = (solo ? 2.4 : 1.8) * (rnd() < 0.5 ? 1 : 1.2); pc.small = true; circles.push(pc); placed++; }
      }
      // Life around the dancing: people stopped at the edge of a circle to watch, clusters chatting further off,
      // and phones held up to record
      var standers = [];
      circles.forEach(function (c, ci) {
        if (c.small || ci === 1) return;
        var n = ci === 0 ? 0 : 1 + Math.floor(rnd() * 3), outer = ci === 0 && circles[1] && circles[1].parent ? (circles[2] && circles[2].parent ? circles[2].R : circles[1].R) : c.R;
        if (ci === 0) n = id === 'sheri' ? 4 : 10;
        for (var k = 0; k < n; k++) { var a = rnd() * TAU, rr = outer + 1.6 + rnd() * 1.6, sx = c.x0 + Math.cos(a) * rr, sz = c.z0 + Math.sin(a) * rr; if (sz < BOUNDS[id][2] - 2 || Math.abs(sx) > (id === 'sheri' ? 6.4 : 26) || !clearOfBooth(id, sx, sz, 0)) continue; standers.push(person({ x: sx, z: sz, stander: true, phone: rnd() < 0.3, sway: rnd() * TAU })); }
      });
      for (var gi = 0; gi < (id === 'sheri' ? 3 : 7); gi++) {
        var bx1 = BOUNDS[id], gx = lerp(bx1[0] + 2, bx1[1] - 2, rnd()), gz = lerp(Math.max(bx1[2], 0), bx1[3] - 2, rnd());
        if (!clearOfBooth(id, gx, gz, 1) || !circles.every(function (c) { return Math.hypot(c.x0 - gx, c.z0 - gz) > c.R + 2.4; })) continue;
        var m = 2 + Math.floor(rnd() * 3);
        for (var j = 0; j < m; j++) { var aj = j / m * TAU + rnd() * 0.5; standers.push(person({ x: gx + Math.cos(aj) * 0.7, z: gz + Math.sin(aj) * 0.55, stander: true, chat: true, phone: rnd() < 0.15, sway: rnd() * TAU, kid: rnd() < 0.15 })); }
      }
      var L = { circles: circles, houses: id === 'sheri' ? houses() : null, stands: id === 'stadium' ? stands() : null, stalls: stallsFor(id), standers: standers };
      L.gallery = galleryFor(id);
      L.kids = []; for (var ki = 0; ki < (id === 'sheri' ? 7 : 12); ki++) { var ks = freeSpot(id, L); L.kids.push(person({ x: ks.x, z: ks.z, tx: ks.x, tz: ks.z, wait: rnd() * 2, speed: 3 + rnd() * 1.4, step: 0, walker: true, kid: true, h: 0.9 + rnd() * 0.3 })); }
      L.walkers = walkersFor(id, L);
      L.seats = seatsFor(id);
      // Some of the people sitting out hold a cup of tea or look at their phones
      L.seats.forEach(function (se) { if (!se.who || se.who.kid) return; var r = rnd(); if (r < 0.22) se.who.holding = 'tea'; else if (r < 0.34) se.who.holding = 'phone'; });
      L.watchers = watchersFor(id);
      L.trees = treesFor(id);
      L.props = propsFor(id, L);
      if (id === 'sheri') sheriStreet(L);
      L.motes = []; for (var mi = 0; mi < 80; mi++) L.motes.push([lerp(-26, 26, rnd()), rnd() * 9, lerp(-6, 46, rnd()), 0.1 + rnd() * 0.25, rnd() * TAU]);
      layouts[id] = L; return L;
    }
    // Food stalls: where they stand, which way they face (u runs along the counter, v into the stall)
    function stallsFor(id) {
      var list = id === 'outdoors' ? [[-26.5, 11, 'ચા', '#b8312b', 'Chai'], [-26.5, 18.5, 'દાબેલી', '#2f6fa8', 'Dabeli'], [-26.5, 26, 'પાણીપુરી', '#2f8f5b', 'Pani puri'], [26.5, 14, 'પાણી', '#2f6fa8', 'Water'], [26.5, 22, 'આઈસ્ક્રીમ', '#8e44ad', 'Ice cream'], [26.5, 30, 'નાસ્તો', '#e67e22', 'Snacks']]
        : id === 'stadium' ? [[-20.5, 33.5, 'ચા', '#b8312b', 'Chai'], [20.5, 33.5, 'નાસ્તો', '#e67e22', 'Snacks']]
          : [[-6.2, 9, 'પાણીપુરી', '#2f8f5b', 'Pani puri']];
      return list.map(function (a) {
        var side = a[0] < 0 ? -1 : 1, facing = id === 'stadium' ? 'camera' : 'inward';
        var st0 = { x: a[0], z: a[1], sign: a[2], col: a[3], en: a[4], w: id === 'sheri' ? 1.8 : 3.4, depth: id === 'sheri' ? 0.9 : 2.2, cart: id === 'sheri' };
        if (facing === 'camera') { st0.U = [1, 0]; st0.V = [0, 1]; } else { st0.U = [0, -side]; st0.V = [side, 0]; }
        st0.front = { x: st0.x - st0.V[0] * 1.3, z: st0.z - st0.V[1] * 1.3 };
        st0.vendor = { man: rnd() < 0.6, col: SKIRTS[Math.floor(rnd() * SKIRTS.length)], top: TOPS[Math.floor(rnd() * TOPS.length)], ph: rnd() * TAU, ph2: 0, h: 1.65, flash: 0 };
        return st0;
      });
    }
    // Where people walk; kept clear of the space right in front of the camera
    var BOUNDS = { outdoors: [-23, 23, -5, 40], stadium: [-21, 21, -5, 32], sheri: [-6, 6, -10, 60] };
    function freeSpot(id, L) {
      var bx = BOUNDS[id];
      for (var k = 0; k < 40; k++) {
        var x = lerp(bx[0], bx[1], rnd()), z = lerp(bx[2], bx[3], rnd());
        if (clearOfBooth(id, x, z, 0) && L.circles.every(function (c) { return Math.hypot(c.x0 - x, c.z0 - z) > c.R + 1.8; })) return { x: x, z: z };
      }
      return { x: bx[0], z: bx[3] };
    }
    function walkersFor(id, L) {
      var n = { outdoors: 32, stadium: 18, sheri: 14 }[id], out = [];
      for (var i = 0; i < n; i++) {
        var p = freeSpot(id, L), kid = rnd() < 0.22, photo = !kid && rnd() < 0.14;
        var w = person({ x: p.x, z: p.z, tx: p.x, tz: p.z, wait: rnd() * 4, speed: kid ? 1.7 + rnd() * 0.9 : 0.9 + rnd() * 0.6, step: rnd() * TAU, walker: true, kid: kid, photo: photo, snap: 0 });
        if (kid) w.h = 0.95 + rnd() * 0.3;
        out.push(w);
      }
      // Couples out for the evening: they stroll together, and while the music plays they stop to dance as a pair
      for (var pi = 0; pi < { outdoors: 4, stadium: 2, sheri: 2 }[id]; pi++) {
        var q = freeSpot(id, L), pr = { on: false, move: 'tali', until: 0, ang: Math.PI, r: 0.34, cx: q.x, cz: q.z };
        var lead = person({ x: q.x - 0.34, z: q.z, tx: q.x, tz: q.z, wait: rnd() * 3, speed: 0.85 + rnd() * 0.3, step: rnd() * TAU, walker: true, man: true, moustache: rnd() < 0.6, h: 1.66 + rnd() * 0.12, snap: 0, pair: pr });
        var mate = person({ x: q.x + 0.34, z: q.z, tx: q.x, tz: q.z, wait: 0, speed: 1.3, step: rnd() * TAU, walker: true, man: false, moustache: false, h: 1.54 + rnd() * 0.1, snap: 0, pair: pr, lead: lead });
        lead.mate = mate; out.unshift(lead, mate);
      }
      return out;
    }
    // A couple's dance, while the music plays: clapping to each other on the beat, a twirl under his raised hand, or
    // a phudadi, both hands held crossed as they whirl round each other. They stay a few bars on each.
    var PAIR_MOVES = ['tali', 'twirl', 'phudadi'];
    function movePair(w, dt) {
      var pr = w.pair, m = w.mate, dance = st.on && !reduce && w.wait > 0.4 && Math.hypot(m.x - w.x, m.z - w.z) < 1.2;
      if (dance && !pr.on) { pr.cx = (w.x + m.x) / 2; pr.cz = (w.z + m.z) / 2; pr.ang = Math.atan2(w.z - pr.cz, w.x - pr.cx); pr.until = 0; }
      pr.on = dance;
      if (!dance) { w.fk = Math.max(0, (w.fk || 0) - dt * 3); w.clapK = m.clapK = 0; m.twirl = Math.max(0, (m.twirl || 0) - dt * 2); w.reach = m.reach = 0; return; }
      if (T > pr.until) { var nx = PAIR_MOVES.filter(function (k) { return k !== pr.move; }); pr.move = nx[Math.floor(rnd() * nx.length)]; pr.until = T + 4 + rnd() * 4; }
      // Where they stand: facing each other across a small gap, he on the left, or whirling round the middle
      if (pr.move === 'phudadi') pr.ang += dt * 3.4;
      else { var da = ((Math.PI - pr.ang) % TAU + TAU * 1.5) % TAU - Math.PI; pr.ang += da * Math.min(1, dt * 3); }
      var r0 = pr.move === 'phudadi' ? 0.3 : 0.36; pr.r += (r0 - pr.r) * Math.min(1, dt * 4);
      w.x = pr.cx + Math.cos(pr.ang) * pr.r; w.z = pr.cz + Math.sin(pr.ang) * pr.r; m.x = pr.cx - Math.cos(pr.ang) * pr.r; m.z = pr.cz - Math.sin(pr.ang) * pr.r;
      w.moving = m.moving = false; w.tx = m.x; w.tz = m.z; m.tx = w.x; m.tz = w.z;
      var bp = ((BEAT % 1) + 1) % 1, clap = pr.move === 'tali' ? (bp < 0.14 ? 1 - bp / 0.14 : bp > 0.78 ? (bp - 0.78) / 0.22 : 0) : 0;
      w.clapK = m.clapK = clap; w.clapHigh = m.clapHigh = false;
      w.flair = 'handup'; w.fk += ((pr.move === 'twirl' ? 1 : 0) - (w.fk || 0)) * Math.min(1, dt * 5);
      m.twirl = pr.move === 'twirl' ? Math.max(0, Math.sin(T * 2.4 + w.ph)) : Math.max(0, (m.twirl || 0) - dt * 2);
      var side = m.x > w.x ? 1 : -1; w.reach = pr.move === 'phudadi' ? side : 0; m.reach = pr.move === 'phudadi' ? -side : 0;
    }
    // Children: run between open spots round the ground (never ringing the garbo), and once the music plays now and then
    // straight through a circle. Anyone who can't reach a spot in a few seconds picks another, so nobody gets stuck
    // The mandvi, rangoli and diyas sit in a clear space nobody walks through
    var KEEP_OUT = 2.9;
    function clearOfCentre(o) {
      var d = Math.hypot(o.x, o.z);
      if (d < KEEP_OUT) { var k = d > 0.01 ? KEEP_OUT / d : 1; o.x = d > 0.01 ? o.x * k : KEEP_OUT; o.z = d > 0.01 ? o.z * k : 0; }
    }
    // Heading across the centre: go round it instead, keeping to one side for the whole detour. Choosing the side
    // afresh every frame made anyone bound for the spot straight across flip back and forth and stick at the edge.
    function roundCentre(o, mx, mz, dx, dz) {
      var rc = Math.hypot(o.x, o.z);
      if (rc > KEEP_OUT + 2.6) o.around = 0;
      if (rc > KEEP_OUT + 2.2 || (o.x * mx + o.z * mz) >= -0.05 * (rc || 1)) return [mx, mz];
      var ux = o.x / (rc || 1), uz = o.z / (rc || 1), tx = -uz, tz = ux;
      if (!o.around) o.around = (tx * dx + tz * dz) >= 0 ? 1 : -1;
      var nx = mx * 0.2 + tx * o.around + ux * 0.2, nz = mz * 0.2 + tz * o.around + uz * 0.2, l = Math.hypot(nx, nz) || 1;
      return [nx / l, nz / l];
    }
    // Children at play in front of the stage and down the lane: each has a patch of ground and makes up their own
    // game in it. They run off in any direction, hop, cheer with their arms up, stop to watch, or play tag, where the
    // one who's caught becomes the chaser. Kids on the stadium steps keep to their step.
    function playKid(ga, all, dt) {
      var k = ga.who, pl = ga.pl;
      if (!pl) {
        pl = ga.pl = { z0: ga.z, x0: ga.cx || 0, amp: ga.amp || 6, dz: ga.y > 0.5 ? 0 : 0.7, act: 'watch', until: 0, tx: 0, tz: ga.z };
        ga.x = pl.x0 + (rnd() - 0.5) * pl.amp * 1.6; pl.until = T + rnd() * 1.5;
      }
      var spot = function () { pl.tx = pl.x0 + (rnd() * 2 - 1) * pl.amp; pl.tz = pl.z0 + (rnd() * 2 - 1) * pl.dz; };
      var mates = all.filter(function (o) { return o !== ga && o.kind === 'runner' && o.pl && Math.abs(o.pl.z0 - pl.z0) < 2.5 && Math.abs(o.y - ga.y) < 0.3; });
      if (T >= pl.until && pl.act !== 'chase' && pl.act !== 'flee') {
        var r = rnd();
        if (!st.on && r < 0.5) { pl.act = 'watch'; pl.until = T + 1 + rnd() * 2; }
        else if (r < 0.4) { pl.act = 'run'; spot(); pl.until = T + 6; pl.sp = 1.3 + rnd() * 1.3; }
        else if (r < 0.55) { pl.act = 'hop'; pl.until = T + 0.9 + rnd() * 0.9; }
        else if (r < 0.68) { pl.act = 'cheer'; pl.until = T + 1.2 + rnd() * 1.2; }
        else if (r < 0.84 && mates.length) { var prey = mates[Math.floor(rnd() * mates.length)]; pl.act = 'chase'; pl.prey = prey; pl.until = T + 5; pl.sp = 2.1 + rnd() * 0.5; if (prey.pl) { prey.pl.act = 'flee'; prey.pl.from = ga; prey.pl.until = T + 5; prey.pl.sp = 1.9 + rnd() * 0.4; } }
        else { pl.act = 'watch'; pl.until = T + 0.8 + rnd() * 1.6; }
      }
      var moving = false;
      if (pl.act === 'run' || pl.act === 'chase' || pl.act === 'flee') {
        if (pl.act === 'chase') { pl.tx = pl.prey.x; pl.tz = pl.prey.z; }
        if (pl.act === 'flee' && pl.from) { var fx = ga.x - pl.from.x, fz = ga.z - pl.from.z, fl = Math.hypot(fx, fz) || 1; pl.tx = ga.x + fx / fl * 1.5 + Math.sin(T * 2.3 + ga.z) * 0.8; pl.tz = ga.z + fz / fl * 0.6; }
        pl.tx = Math.max(pl.x0 - pl.amp, Math.min(pl.x0 + pl.amp, pl.tx)); pl.tz = Math.max(pl.z0 - pl.dz, Math.min(pl.z0 + pl.dz, pl.tz));
        var dx = pl.tx - ga.x, dz = pl.tz - ga.z, dd = Math.hypot(dx, dz);
        if (dd > 0.05) { var stp = Math.min(dd, (pl.sp || 1.6) * dt); ga.x += dx / dd * stp; ga.z += dz / dd * stp; moving = true; }
        // Tag: a chaser who reaches the other child turns and runs, and the caught one gives chase
        if (pl.act === 'chase' && Math.hypot(pl.prey.x - ga.x, pl.prey.z - ga.z) < 0.35 && pl.prey.pl) {
          var caught = pl.prey; caught.pl.act = 'chase'; caught.pl.prey = ga; caught.pl.until = T + 4; caught.pl.sp = 2.1;
          pl.act = 'flee'; pl.from = caught; pl.until = T + 3; pl.sp = 2.2;
        }
        if ((pl.act === 'run' && dd <= 0.05) || T >= pl.until) { if (pl.act === 'chase' && pl.prey.pl && pl.prey.pl.act === 'flee') pl.prey.pl.until = T; pl.act = 'watch'; pl.until = T + 0.4 + rnd() * 1.2; }
      }
      ga.hopY = pl.act === 'hop' && !reduce ? Math.abs(Math.sin(T * 9 + ga.z * 3)) * 0.22 : 0;
      k.armsUp = pl.act === 'cheer' || (pl.act === 'hop' && Math.sin(T * 4.5) > 0) ? 1 : 0;
      k.moving = moving && !reduce; if (moving) k.step = (k.step || 0) + dt * (pl.sp || 1.6) * 7;
    }
    function moveKids(L, id, dt) {
      var bx = BOUNDS[id];
      L.kids.forEach(function (k) {
        if (k.wait > 0) { k.wait -= dt; k.moving = false; return; }
        var dx = k.tx - k.x, dz = k.tz - k.z, d = Math.hypot(dx, dz);
        k.tt = (k.tt || 0) + dt;
        if (d < 0.3 || k.tt > 12) {
          k.moving = false; k.wait = rnd() * 0.8; k.around = 0; k.tt = 0;
          if (!st.on || L.circles.length <= 3) { var p0 = freeSpot(id, L); k.tx = p0.x; k.tz = p0.z; k.through = false; }
          else if (rnd() < 0.3 && L.circles.length > 3) { var c = L.circles[3 + Math.floor(rnd() * (L.circles.length - 3))], a2 = rnd() * TAU; k.tx = c.x0 + Math.cos(a2) * (c.R + 3); k.tz = Math.max(bx[2], c.z0 + Math.sin(a2) * (c.R + 3)); k.through = true; }
          else { var p = freeSpot(id, L); k.tx = p.x; k.tz = p.z; k.through = false; }
          return;
        }
        var vx = dx / d, vz = dz / d, bo = DJ[id];
        if (bo) { var bx0 = k.x - bo.x, bz0 = k.z - (bo.z - 1.2), bd = Math.hypot(bx0, bz0); if (bd < 4.5 && bd > 0.01) { var bp = (4.5 - bd) / 1.5; vx += bx0 / bd * bp; vz += bz0 / bd * bp; } }
        if (st.on && !k.through) L.circles.forEach(function (c) { var cx = k.x - c.x0, cz = k.z - c.z0, cd = Math.hypot(cx, cz), keep = c.R + 1.2; if (cd < keep + 1.5 && cd > 0.01) { var push = (keep + 1.5 - cd) / 1.5 * Math.min(1, d / 3); vx += cx / cd * push; vz += cz / cd * push; } });
        var vl0 = Math.hypot(vx, vz) || 1, rk = roundCentre(k, vx / vl0, vz / vl0, dx, dz); vx = rk[0]; vz = rk[1];
        var vl = 1, sp = k.speed * (st.on && !k.through ? 0.8 : 1);
        k.x += vx / vl * sp * dt; k.z += vz / vl * sp * dt; clearOfCentre(k); k.step = (k.step || 0) + dt * sp * 6; k.moving = true;
      });
    }
    function moveWalkers(L, id, dt) {
      L.walkers.forEach(function (w) {
        w.snap = Math.max(0, (w.snap || 0) - dt * 4);
        // She keeps beside him on a stroll; while they dance he places them both
        if (w.lead) {
          if (w.pair.on) return;
          var ld = w.lead, hx0 = ld.tx - ld.x, hz0 = ld.tz - ld.z, hl0 = Math.hypot(hx0, hz0) || 1, sx = ld.moving ? -hz0 / hl0 : 1, sz = ld.moving ? hx0 / hl0 : 0;
          var fx = ld.x + sx * 0.62 - w.x, fz = ld.z + sz * 0.62 - w.z, fd = Math.hypot(fx, fz);
          w.tx = ld.moving ? ld.tx + sx * 0.62 : ld.x + sx * 0.62; w.tz = ld.moving ? ld.tz + sz * 0.62 : ld.z + sz * 0.62;
          if (fd > 0.12) { var sp0 = Math.min(fd, Math.max(ld.speed, w.speed * Math.min(1, fd)) * dt); w.x += fx / fd * sp0; w.z += fz / fd * sp0; w.step += sp0 * 5.5; w.moving = true; } else w.moving = ld.moving;
          return;
        }
        if (w.pair) movePair(w, dt);
        if (w.wait > 0) { w.wait -= dt; w.moving = false; if (w.photo && st.on && Math.random() < dt * 0.5) w.snap = 1; return; }
        var dx = w.tx - w.x, dz = w.tz - w.z, d = Math.hypot(dx, dz);
        w.tt = (w.tt || 0) + dt;
        if (d < 0.3 || w.tt > 18) {
          w.moving = false; w.tt = 0; w.wait = w.kid ? 0.5 + rnd() * 2 : w.pair && st.on ? 9 + rnd() * 9 : 2 + rnd() * 6;
          var target = L.stalls.length && rnd() < 0.35 ? L.stalls[Math.floor(rnd() * L.stalls.length)].front : freeSpot(id, L);
          w.tx = target.x + (rnd() - 0.5) * 1.2; w.tz = target.z + (rnd() - 0.5) * 1.2; w.around = 0; return;
        }
        // Head for the target and step around the circles and the DJ's booth on the way
        var vx = dx / d, vz = dz / d, bo = DJ[id];
        if (bo) { var bx0 = w.x - bo.x, bz0 = w.z - (bo.z - 1.2), bd = Math.hypot(bx0, bz0); if (bd < 4.5 && bd > 0.01) { var bp = (4.5 - bd) / 1.5; vx += bx0 / bd * bp; vz += bz0 / bd * bp; } }
        L.circles.forEach(function (c) {
          var cx = w.x - c.x0, cz = w.z - c.z0, cd = Math.hypot(cx, cz), keep = c.R + 1.6;
          if (cd < keep + 2 && cd > 0.01) { var push = (keep + 2 - cd) / 2 * Math.min(1, d / 3); vx += cx / cd * push - cz / cd * push * 0.6; vz += cz / cd * push + cx / cd * push * 0.6; }
        });
        var vl0 = Math.hypot(vx, vz) || 1, rw = roundCentre(w, vx / vl0, vz / vl0, dx, dz); vx = rw[0]; vz = rw[1];
        var vl = 1;
        w.x += vx / vl * w.speed * dt; w.z += vz / vl * w.speed * dt; clearOfCentre(w); w.step += dt * w.speed * 5.5; w.moving = true;
      });
    }
    // Rows of plastic chairs along the sides of an open ground, most of them taken by the older folk watching
    // Where you sit when you watch from far away: a row of chairs, the stadium's stepped benches, a bench in the lane.
    // You and your partner sit among neighbours, seen from behind as the camera looks over your shoulders.
    function galleryFor(id) {
      var out = [];
      function sitter(x, y, z, kind, role, view) { var d = role ? person({ man: role === 'm', sitting: true, rest: { y: y } }) : rnd() < 0.8 ? person({ sitting: true, older: rnd() < 0.3, rest: { y: y } }) : null; if (role) { d.seatRole = role; if (role === 'w') { d.col = '#8e1b2c'; d.top = '#d6a24a'; d.odhni = '#f3e6d0'; d.h = 1.62; } else { d.col = '#f3e6d0'; d.top = '#f3e6d0'; d.pagdi = '#8e1b2c'; d.h = 1.76; } } out.push({ x: x, y: y, z: z, kind: kind, who: d, view: view || 'far', col: ['#b73a2e', '#2f6fa8', '#d9d2c5', '#2f8f5b'][Math.floor(rnd() * 4)] }); }
      if (id === 'outdoors') {
        [-18.4, -17.2, -16].forEach(function (z, row) { for (var x = -5.2 + (row % 2) * 0.4; x <= 5.2; x += 0.8) { var role = row === 0 && Math.abs(x + 0.4) < 0.05 ? 'w' : row === 0 && Math.abs(x - 0.4) < 0.05 ? 'm' : null; sitter(x, 0.45, z, 'chair', role); } });
        [-1, 1].forEach(function (sd) { for (var k = 0; k < 3; k++) out.push({ x: sd * (6.2 + k * 0.5), y: 0, z: -17.6 + k * 0.4, kind: 'stand', who: person({ stander: true, phone: k === 1, sway: rnd() * TAU }) }); });
      }
      // By the stage: a standing crowd seen from behind, lots of phones up, and the two of you at the front
      var sz0 = { outdoors: 46, stadium: 35.5, sheri: 64.5 }[id], hw = id === 'sheri' ? 5.5 : 8;
      // Rows behind you thin out in the middle so you look over shoulders, not into backs
      for (var rz = 0; rz < 4; rz++) for (var cx0 = -hw; cx0 <= hw; cx0 += 0.62 + rnd() * 0.3) {
        var zz = sz0 - 2.3 - rz * 0.9 + (rnd() - 0.5) * 0.3, aisle = rz < 2 ? 1.5 : 0.9 + rz * 0.5;
        if (rnd() < 0.2 || Math.abs(cx0) < aisle) continue;
        var djb0 = DJ[id]; if (djb0 && Math.abs(cx0 - djb0.x) < 1.8 && zz > djb0.z - 3.6 && zz < djb0.z + 1.2) continue;
        var rec = rnd() < 0.45, pp2 = person({ stander: true, phone: rec, video: rec && rnd() < 0.6, sway: rnd() * TAU, kid: rnd() < 0.06 });
        out.push({ x: cx0, y: 0, z: zz, kind: 'stand', who: pp2, view: 'stage' });
      }
      ['w', 'm'].forEach(function (role2) {
        var pp2 = person({ stander: true, sway: rnd() * TAU, man: role2 === 'm' }); pp2.seatRole = role2;
        if (role2 === 'w') { pp2.col = '#8e1b2c'; pp2.top = '#d6a24a'; pp2.odhni = '#f3e6d0'; pp2.h = 1.62; } else { pp2.col = '#f3e6d0'; pp2.top = '#f3e6d0'; pp2.pagdi = '#8e1b2c'; pp2.stole = '#e8b04b'; pp2.h = 1.76; }
        out.push({ x: role2 === 'w' ? -0.3 : 0.35, y: 0, z: sz0 - 2.1, kind: 'stand', who: pp2, view: 'stage' });
      });
      // Children chasing each other across the open ground in front of the stage, and a videographer with a gimbal at the barrier
      for (var rk = 0; rk < 3; rk++) out.push({ x: 0, y: 0, z: sz0 - 1.3 + rk * 0.3, kind: 'runner', view: 'stage', amp: hw * 0.55, sp: 0.45 + rk * 0.04, ph: rk * 0.5, who: person({ kid: true, h: 0.95 + rnd() * 0.25, walker: true, moving: true, step: rk }) });
      out.push({ x: -hw * 0.55, y: 0, z: sz0 - 0.9, kind: 'stand', view: 'stage', who: person({ stander: true, phone: true, video: true, gimbal: true, sway: 0.4, man: true }) });
      if (id === 'stadium') {
        // Shallow steps so you look down over the rows in front to the floor
        for (var k = 0; k < 5; k++) {
          var z = -32.4 + k * 1.15, y = 7.6 - k * 0.42;
          out.push({ x: 0, y: y, z: z + 0.45, kind: 'step', w: 11 });
          for (var x = -9.6 + (k % 2) * 0.3; x <= 9.6; x += 0.62) { var role = k === 0 && Math.abs(x + 0.29) < 0.2 ? 'w' : k === 0 && Math.abs(x - 0.33) < 0.2 ? 'm' : null; if (role || rnd() < (k === 0 ? 0.45 : 0.72)) sitter(x, y, z, 'bench', role); }
        }
        [-33.6, -34.8].forEach(function (z, i) { out.push({ x: 0, y: 7.6 + (i + 1) * 0.42, z: z + 0.45, kind: 'step', w: 11 }); });
        out.push({ x: -10.6, y: 7.1, z: -30.9, kind: 'stand', who: person({ stander: true, phone: true, sway: 1 }) });
        out.push({ x: 10.4, y: 7.1, z: -31, kind: 'stand', who: person({ stander: true, sway: 2 }) });
        out.push({ x: 0, y: 6.2, z: -30.1, kind: 'runner', who: person({ kid: true, h: 1.05, walker: true, moving: true, step: 0 }) });
      } else if (id === 'sheri') {
        out.push({ x: -3, y: 0.45, z: -19.2, kind: 'benchPlank', w: 2 });
        sitter(-3.35, 0.45, -19.2, 'bench', 'w'); sitter(-2.6, 0.45, -19.2, 'bench', 'm'); sitter(-4.15, 0.45, -19.2, 'bench', null);
        out.push({ x: -1.2, y: 0, z: -18.6, kind: 'stand', who: person({ stander: true, phone: true, sway: 0.5 }) });
        [[-14.8, 0.55, 0], [-14.3, 0.48, 0.6], [-12.6, 0.4, 2.1]].forEach(function (k) { out.push({ x: 0, y: 0, z: k[0], kind: 'runner', view: 'far', cx: -1, amp: 3.6, sp: k[1], ph: k[2], who: person({ kid: true, h: 0.95 + rnd() * 0.25, walker: true, moving: true, step: 0 }) }); });
        out.push({ x: -0.5, y: 0, z: -18.1, kind: 'stand', who: person({ stander: true, sway: 1.5 }) });
      }
      return out;
    }
    function seatsFor(id) {
      var out = [];
      if (id === 'sheri') {
        [-1, 1].forEach(function (sd) {
          for (var z = -22; z < 60; z += 1.6 + rnd() * 3.2) {
            var r = rnd(), older = rnd() < 0.55;
            if (r < 0.55) out.push({ kind: 'otla', x: sd * 6.95, y: 0.45, z: z, side: sd, who: person({ sitting: true, older: older, rest: { y: 0.45 } }) });
            else if (r < 0.75) out.push({ x: sd * 6.35, y: 0.45, z: z, side: sd, col: ['#b73a2e', '#2f6fa8', '#d9d2c5', '#2f8f5b'][Math.floor(rnd() * 4)], who: person({ sitting: true, older: true, rest: { y: 0.45 } }) });
            else out.push({ kind: 'ground', x: sd * (5.6 + rnd() * 0.6), y: 0, z: z, side: sd, who: person({ sitting: true, kid: rnd() < 0.5, h: 1.2 + rnd() * 0.4, rest: { y: 0 } }) });
          }
        });
        return out;
      }
      if (id !== 'outdoors') return out;
      [-1, 1].forEach(function (sd) {
        [[-4, 8.5], [32, 41]].forEach(function (span) {
          for (var z = span[0]; z <= span[1]; z += 1.05) {
            var taken = rnd() < 0.72, older = rnd() < 0.6;
            out.push({ x: sd * (24.3 + (Math.round(z) % 2) * 0.1), z: z, side: sd, col: ['#b73a2e', '#2f6fa8', '#d9d2c5', '#2f8f5b'][Math.floor(rnd() * 4)], who: taken ? person({ sitting: true, older: older, rest: { y: 0.45 } }) : null });
          }
        });
      });
      return out;
    }
    // People standing at the barrier in the stadium, cheering now and then
    function watchersFor(id) {
      var out = [];
      if (id !== 'stadium') return out;
      [-1, 1].forEach(function (sd) { for (var z = -6; z <= 32; z += 0.7 + rnd() * 0.9) out.push(person({ x: sd * (23.9 - rnd() * 0.5), z: z, watcher: true })); });
      return out;
    }
    // Neem and peepal trees ring the open ground; some are wrapped in fairy lights
    function treesFor(id) {
      var out = [];
      if (id !== 'outdoors') return out;
      function tree(x, z, big) { var n = 5 + Math.floor(rnd() * 3), blobs = []; for (var i = 0; i < n; i++) blobs.push([(rnd() - 0.5) * 4.2, 5 + rnd() * 3.2, (rnd() - 0.5) * 1.5, 1.8 + rnd() * 1.6]); out.push({ x: x, z: z, s: big ? 1.25 : 0.8 + rnd() * 0.4, blobs: blobs, fairy: rnd() < 0.55, hue: Math.floor(rnd() * 6), tone: Math.floor(rnd() * 3) }); }
      for (var x = -48; x <= 48; x += 6 + rnd() * 4) tree(x, 58 + rnd() * 12, rnd() < 0.3);
      [-1, 1].forEach(function (sd) { for (var z = -14; z < 56; z += 7 + rnd() * 5) tree(sd * (33 + rnd() * 9), z, rnd() < 0.3); });
      tree(-29.5, -7, true); tree(30.5, -9.5, true);
      return out;
    }
    function drawTree(tr, t) {
      var base = P(tr.x, 0, tr.z), top = P(tr.x, 4.6 * tr.s, tr.z); if (!base || !top) return;
      g.strokeStyle = '#1c130c'; g.lineCap = 'round'; g.lineWidth = Math.max(1.2, base.s * 0.5 * tr.s); g.beginPath(); g.moveTo(base.x, base.y); g.lineTo(top.x, top.y); g.stroke();
      g.lineWidth = Math.max(0.8, base.s * 0.2 * tr.s); g.beginPath(); g.moveTo(lerp(base.x, top.x, 0.6), lerp(base.y, top.y, 0.6)); g.lineTo(top.x - base.s * 1.3 * tr.s, top.y - base.s * 0.6); g.moveTo(lerp(base.x, top.x, 0.75), lerp(base.y, top.y, 0.75)); g.lineTo(top.x + base.s * 1.2 * tr.s, top.y - base.s * 0.8); g.stroke();
      var greens = [['#0f1d12', '#1a2c18'], ['#12200f', '#20321a'], ['#0d1a14', '#1a2b22']][tr.tone];
      tr.blobs.forEach(function (bl, i) {
        var c = P(tr.x + bl[0] * tr.s, bl[1] * tr.s, tr.z + bl[2] * tr.s); if (!c) return;
        var r = c.s * bl[3] * tr.s;
        var gr = g.createRadialGradient(c.x - r * 0.3, c.y - r * 0.4, r * 0.1, c.x, c.y, r); gr.addColorStop(0, greens[1]); gr.addColorStop(1, greens[0]);
        g.fillStyle = gr; g.beginPath(); g.arc(c.x, c.y, r, 0, TAU); g.fill();
        // Warm light from the ground catches the underside of the leaves
        g.fillStyle = 'rgba(' + TH.glowTint + ',' + 0.08 * bright + ')'; g.beginPath(); g.arc(c.x, c.y + r * 0.35, r * 0.7, 0, Math.PI); g.fill();
      });
      if (tr.fairy) for (var k = 0; k < 26; k++) {
        var bl2 = tr.blobs[k % tr.blobs.length], an = k * 2.4, rr = bl2[3] * 0.8 * ((k * 37) % 10) / 10;
        var q = P(tr.x + (bl2[0] + Math.cos(an) * rr) * tr.s, (bl2[1] + Math.sin(an) * rr * 0.8) * tr.s, tr.z + bl2[2] * tr.s - 0.5); if (!q) continue;
        glow(q.x, q.y, Math.max(0.5, Math.min(1.8, q.s * 0.05)), TH.bulbs[(tr.hue + k) % TH.bulbs.length], (0.5 + 0.5 * Math.sin(t * 2.2 + k * 1.3)) * bright);
      }
    }
    // Things at the edges that a wide screen shows: parked scooters, a shamiyana, water tanks, tulsi pots, a cow
    function propsFor(id, L) {
      var out = [];
      var cols = ['#b73a2e', '#2f6fa8', '#d9d2c5', '#1c1c1c', '#e8a33d', '#6c8fa3'];
      if (id === 'outdoors') {
        [-1, 1].forEach(function (sd) { for (var z = -8; z < 40; z += 1.1) if (rnd() < 0.7) out.push({ kind: 'scooter', x: sd * (30 + rnd() * 1.2), z: z, col: cols[Math.floor(rnd() * cols.length)], side: sd }); });
        out.push({ kind: 'tent', x: -37, z: 44, col: '#b8312b' }); out.push({ kind: 'tent', x: 37, z: 46, col: '#e8a33d' });
      } else if (id === 'sheri') {
        [-1, 1].forEach(function (sd) { for (var z = -6; z < 60; z += 3 + rnd() * 5) { var r = rnd(); out.push(r < 0.45 ? { kind: 'scooter', x: sd * 6.4, z: z, col: cols[Math.floor(rnd() * cols.length)], side: sd } : r < 0.8 ? { kind: 'tulsi', x: sd * 7.05, z: z } : { kind: 'none' }); } });
        out.push({ kind: 'cow', x: 5.2, z: 23 + rnd() * 6 });
      }
      return out.filter(function (o) { return o.kind !== 'none'; });
    }
    // Up the lane from the bench: the house on your right is purple with a white van
    // parked in front of it, and a motorbike and an Activa stand across the lane edges
    function sheriStreet(L) {
      var zc = 1.5, right = L.houses.filter(function (h) { return h.side > 0 && h.z1 <= zc && h.z2 >= zc; })[0];
      if (right) right.col = '#7a4f9e';
      var vz0 = zc - 1.9, vz1 = zc + 1.9;
      L.props = L.props.filter(function (o) { return !(o.x > 3 && o.z > vz0 - 1 && o.z < vz1 + 1) && !(o.z > -14.5 && o.z < -9 && Math.abs(o.x) > 4); });
      L.seats = L.seats.filter(function (se) { return !(se.x > 3 && se.z > vz0 - 1 && se.z < vz1 + 1); });
      L.props.push({ kind: 'van', x: 5.3, z: zc });
      L.props.push({ kind: 'bike', x: -5.5, z: -12.2, side: -1, col: '#1c1c1c' });
      L.props.push({ kind: 'activa', x: -5.55, z: 3.2, side: -1, col: '#e9e7e1' });
      L.props.push({ kind: 'activa', x: 5.55, z: -12.4, side: 1, col: '#2f6fa8' });
      L.props.push({ kind: 'bike', x: -5.4, z: 12.5, side: -1, col: '#8e1b2c' });
    }
    // A wheel in the side plane of a vehicle parked along the lane (points in y and z at a fixed x)
    function sideWheel(x, y, z, r) { var pts = []; for (var k = 0; k < 14; k++) { var a = k / 14 * TAU; pts.push([x, y + Math.sin(a) * r, z + Math.cos(a) * r]); } fillPoly(pts, '#141414'); var hub = []; for (var k2 = 0; k2 < 10; k2++) { var a2 = k2 / 10 * TAU; hub.push([x - 0.005, y + Math.sin(a2) * r * 0.5, z + Math.cos(a2) * r * 0.5]); } fillPoly(hub, '#8f9398'); }
    function van(o) {
      // A white Eeco-style van: its side faces the lane, its back faces you
      var x0 = o.x - 0.72, x1 = o.x + 0.72, z0 = o.z - 1.9, z1 = o.z + 1.9, b = 0.28, top = 1.9;
      fillPoly([[x0, top, z0], [x1, top, z0], [x1, top, z1 - 0.45], [x0, top, z1 - 0.45]], '#cfd0cc');
      fillPoly([[x0, b, z0], [x0, b, z1], [x0, 1.05, z1], [x0, top, z1 - 0.45], [x0, top, z0]], '#ecece7');
      fillPoly([[x0 - 0.004, 1.15, z0 + 0.25], [x0 - 0.004, 1.15, z1 - 0.9], [x0 - 0.004, 1.72, z1 - 0.9], [x0 - 0.004, 1.72, z0 + 0.25]], '#2a323c');
      fillPoly([[x0 - 0.005, 1.15, z1 - 0.8], [x0 - 0.005, 1.05, z1 - 0.1], [x0 - 0.005, 1.72, z1 - 0.52], [x0 - 0.005, 1.72, z1 - 0.8]], '#2a323c');
      [z0 + 1.3, z0 + 2.45].forEach(function (zp) { var a = P(x0 - 0.006, 1.15, zp), c = P(x0 - 0.006, 1.72, zp); if (a && c) { g.strokeStyle = '#ecece7'; g.lineWidth = Math.max(1, a.s * 0.04); g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(c.x, c.y); g.stroke(); } });
      var sl0 = P(x0 - 0.006, b + 0.05, z0 + 1.3), sl1 = P(x0 - 0.006, 1.1, z0 + 1.3); if (sl0 && sl1) { g.strokeStyle = 'rgba(0,0,0,.25)'; g.lineWidth = 1; g.beginPath(); g.moveTo(sl0.x, sl0.y); g.lineTo(sl1.x, sl1.y); g.stroke(); }
      fillPoly([[x0 - 0.004, b, z0], [x0 - 0.004, b, z1], [x0 - 0.004, b + 0.14, z1], [x0 - 0.004, b + 0.14, z0]], '#9a9c98');
      sideWheel(x0 - 0.01, 0.3, z0 + 0.65, 0.3); sideWheel(x0 - 0.01, 0.3, z1 - 0.7, 0.3);
      // The back: big rear window, tail lights, a yellow plate and a dark bumper
      fillPoly([[x0, b, z0], [x1, b, z0], [x1, top, z0], [x0, top, z0]], '#f1f1ec');
      fillPoly([[x0 + 0.14, 1.15, z0 - 0.004], [x1 - 0.14, 1.15, z0 - 0.004], [x1 - 0.14, 1.75, z0 - 0.004], [x0 + 0.14, 1.75, z0 - 0.004]], '#262e37');
      fillPoly([[x0 + 0.14, 1.55, z0 - 0.005], [x0 + 0.55, 1.75, z0 - 0.005], [x0 + 0.4, 1.75, z0 - 0.005], [x0 + 0.14, 1.62, z0 - 0.005]], 'rgba(255,255,255,.12)');
      [x0 + 0.06, x1 - 0.2].forEach(function (lx) { fillPoly([[lx, 0.62, z0 - 0.005], [lx + 0.14, 0.62, z0 - 0.005], [lx + 0.14, 0.95, z0 - 0.005], [lx, 0.95, z0 - 0.005]], '#a51d1a'); });
      fillPoly([[o.x - 0.24, 0.5, z0 - 0.006], [o.x + 0.24, 0.5, z0 - 0.006], [o.x + 0.24, 0.62, z0 - 0.006], [o.x - 0.24, 0.62, z0 - 0.006]], '#f2cf3e');
      fillPoly([[x0, b, z0 - 0.02], [x1, b, z0 - 0.02], [x1, 0.45, z0 - 0.02], [x0, 0.45, z0 - 0.02]], '#3a3b3d');
      var sh = P(o.x, 0, o.z); if (sh) { g.fillStyle = 'rgba(0,0,0,.28)'; g.beginPath(); g.ellipse(sh.x, sh.y, sh.s * 0.9, sh.s * 0.12, 0, 0, TAU); g.fill(); }
    }
    // A motorbike or an Activa parked across the lane edge, seen side-on, its front towards the middle of the lane
    function twoWheeler(o) {
      var p = P(o.x, 0, o.z); if (!p) return;
      var s = p.s, dir = -o.side, bike = o.kind === 'bike', wr = s * (bike ? 0.31 : 0.23), wb = s * (bike ? 0.66 : 0.55), fx = p.x + dir * wb, rx = p.x - dir * wb, wy = p.y - wr;
      [fx, rx].forEach(function (wx) { g.fillStyle = '#131313'; g.beginPath(); g.arc(wx, wy, wr, 0, TAU); g.fill(); g.fillStyle = '#9ca0a5'; g.beginPath(); g.arc(wx, wy, wr * 0.45, 0, TAU); g.fill(); if (s > 30) { g.strokeStyle = 'rgba(40,40,40,.8)'; g.lineWidth = 1; for (var k = 0; k < 6; k++) { var a = k / 6 * Math.PI; g.beginPath(); g.moveTo(wx - Math.cos(a) * wr * 0.42, wy - Math.sin(a) * wr * 0.42); g.lineTo(wx + Math.cos(a) * wr * 0.42, wy + Math.sin(a) * wr * 0.42); g.stroke(); } } });
      g.lineCap = 'round'; g.lineJoin = 'round';
      if (bike) {
        g.strokeStyle = '#2b2b2e'; g.lineWidth = Math.max(1, s * 0.04); g.beginPath(); g.moveTo(rx, wy); g.lineTo(p.x, p.y - s * 0.62); g.lineTo(fx - dir * s * 0.08, p.y - s * 0.95); g.lineTo(fx, wy); g.stroke();
        g.fillStyle = o.col; g.beginPath(); g.ellipse(p.x + dir * s * 0.18, p.y - s * 0.8, s * 0.24, s * 0.1, 0, 0, TAU); g.fill();
        g.fillStyle = '#161616'; g.beginPath(); g.moveTo(p.x - dir * s * 0.1, p.y - s * 0.78); g.lineTo(p.x - dir * s * 0.55, p.y - s * 0.72); g.lineTo(p.x - dir * s * 0.55, p.y - s * 0.66); g.lineTo(p.x - dir * s * 0.1, p.y - s * 0.7); g.closePath(); g.fill();
        g.strokeStyle = '#c9ccd1'; g.lineWidth = Math.max(1, s * 0.035); g.beginPath(); g.moveTo(p.x, p.y - s * 0.4); g.lineTo(rx - dir * s * 0.1, p.y - s * 0.42); g.stroke();
        g.strokeStyle = '#1b1b1b'; g.lineWidth = Math.max(1, s * 0.025); g.beginPath(); g.moveTo(fx - dir * s * 0.1, p.y - s * 0.98); g.lineTo(fx - dir * s * 0.02, p.y - s * 1.08); g.lineTo(fx - dir * s * 0.24, p.y - s * 1.1); g.stroke();
        g.fillStyle = '#f4f1e6'; g.beginPath(); g.arc(fx + dir * s * 0.02, p.y - s * 0.93, s * 0.06, 0, TAU); g.fill();
      } else {
        // Activa: step-through body, front apron, floorboard and the rounded rear cowl
        g.fillStyle = o.col;
        g.beginPath(); g.moveTo(fx - dir * s * 0.05, p.y - s * 0.28); g.quadraticCurveTo(fx - dir * s * 0.02, p.y - s * 0.95, fx - dir * s * 0.15, p.y - s * 1.0); g.lineTo(fx - dir * s * 0.28, p.y - s * 0.95); g.lineTo(fx - dir * s * 0.3, p.y - s * 0.3); g.closePath(); g.fill();
        g.fillRect(Math.min(fx - dir * s * 0.3, p.x + dir * s * 0.05), p.y - s * 0.3, Math.abs(fx - dir * s * 0.3 - (p.x + dir * s * 0.05)), s * 0.06);
        g.beginPath(); g.moveTo(p.x + dir * s * 0.05, p.y - s * 0.28); g.quadraticCurveTo(p.x - dir * s * 0.1, p.y - s * 0.72, rx + dir * s * 0.05, p.y - s * 0.62); g.quadraticCurveTo(rx - dir * s * 0.28, p.y - s * 0.5, rx - dir * s * 0.12, p.y - s * 0.3); g.closePath(); g.fill();
        g.fillStyle = '#1a1a1a'; g.beginPath(); g.ellipse(p.x - dir * s * 0.28, p.y - s * 0.7, s * 0.3, s * 0.06, 0, 0, TAU); g.fill();
        g.strokeStyle = '#2a2a2a'; g.lineWidth = Math.max(1, s * 0.025); g.beginPath(); g.moveTo(fx - dir * s * 0.2, p.y - s * 1.02); g.lineTo(fx - dir * s * 0.38, p.y - s * 1.05); g.stroke();
        g.fillStyle = '#f4f1e6'; g.beginPath(); g.arc(fx - dir * s * 0.12, p.y - s * 0.9, s * 0.045, 0, TAU); g.fill();
        g.strokeStyle = '#555'; g.lineWidth = 1; g.beginPath(); g.moveTo(fx - dir * s * 0.24, p.y - s * 1.04); g.lineTo(fx - dir * s * 0.3, p.y - s * 1.16); g.stroke();
      }
      g.lineCap = 'butt';
    }
    function prop(o, t) {
      if (o.kind === 'van') { van(o); return; }
      if (o.kind === 'bike' || o.kind === 'activa') { twoWheeler(o); return; }
      var p = P(o.x, 0, o.z); if (!p) return;
      var s = p.s;
      if (o.kind === 'scooter') {
        g.fillStyle = '#111'; g.beginPath(); g.arc(p.x - s * 0.5, p.y - s * 0.2, s * 0.2, 0, TAU); g.arc(p.x + s * 0.5, p.y - s * 0.2, s * 0.2, 0, TAU); g.fill();
        g.fillStyle = o.col; g.beginPath(); g.moveTo(p.x - s * 0.7, p.y - s * 0.35); g.lineTo(p.x + s * 0.2, p.y - s * 0.35); g.lineTo(p.x + s * 0.45, p.y - s * 0.85); g.lineTo(p.x + s * 0.6, p.y - s * 0.85); g.lineTo(p.x + s * 0.55, p.y - s * 0.3); g.lineTo(p.x + s * 0.75, p.y - s * 0.25); g.lineTo(p.x - s * 0.1, p.y - s * 0.6); g.lineTo(p.x - s * 0.7, p.y - s * 0.6); g.closePath(); g.fill();
        g.fillStyle = '#222'; g.fillRect(p.x - s * 0.62, p.y - s * 0.7, s * 0.55, s * 0.12);
      } else if (o.kind === 'tent') {
        var a = P(o.x - 4, 0, o.z), b = P(o.x + 4, 0, o.z), ta = P(o.x - 4, 3.2, o.z), tb = P(o.x + 4, 3.2, o.z), apex = P(o.x, 4.6, o.z); if (!a || !b || !ta || !tb || !apex) return;
        g.fillStyle = 'rgba(255,200,130,' + 0.14 * bright + ')'; g.fillRect(ta.x, ta.y, tb.x - ta.x, a.y - ta.y);
        for (var k = 0; k < 8; k++) { var u0 = k / 8, u1 = (k + 1) / 8; g.fillStyle = k % 2 ? '#f3e6d0' : o.col; g.beginPath(); g.moveTo(apex.x, apex.y); g.lineTo(lerp(ta.x, tb.x, u0), ta.y); g.lineTo(lerp(ta.x, tb.x, u1), ta.y); g.closePath(); g.fill(); }
        g.strokeStyle = '#2a1a10'; g.lineWidth = Math.max(1, a.s * 0.1); g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(ta.x, ta.y); g.moveTo(b.x, b.y); g.lineTo(tb.x, tb.y); g.stroke();
        for (var q = 0; q <= 8; q++) glow(lerp(ta.x, tb.x, q / 8), ta.y + 2, Math.max(0.7, a.s * 0.06), TH.bulbs[q % TH.bulbs.length], 0.8 * bright);
      } else if (o.kind === 'tulsi') {
        g.fillStyle = '#8a4b22'; g.fillRect(p.x - s * 0.2, p.y - s * 0.5, s * 0.4, s * 0.5);
        g.fillStyle = '#e8b04b'; g.fillRect(p.x - s * 0.2, p.y - s * 0.42, s * 0.4, s * 0.05);
        g.fillStyle = '#2f6b33'; g.beginPath(); g.arc(p.x, p.y - s * 0.72, s * 0.28, 0, TAU); g.arc(p.x - s * 0.15, p.y - s * 0.6, s * 0.18, 0, TAU); g.arc(p.x + s * 0.16, p.y - s * 0.62, s * 0.18, 0, TAU); g.fill();
        glow(p.x + s * 0.3, p.y - s * 0.05, Math.max(0.6, s * 0.05), '#ffcf7a', (0.7 + 0.3 * Math.sin(t * 8 + o.z)) * bright);
      } else if (o.kind === 'cow') {
        g.fillStyle = '#ece3d3'; g.beginPath(); g.ellipse(p.x, p.y - s * 0.45, s * 0.95, s * 0.42, 0, 0, TAU); g.fill();
        g.fillStyle = '#d9cdb8'; g.beginPath(); g.ellipse(p.x - s * 0.95, p.y - s * 0.72, s * 0.28, s * 0.22, -0.3, 0, TAU); g.fill();
        g.strokeStyle = '#e8d9b0'; g.lineWidth = Math.max(1, s * 0.06); g.beginPath(); g.moveTo(p.x - s * 1.05, p.y - s * 0.9); g.quadraticCurveTo(p.x - s * 1.2, p.y - s * 1.15, p.x - s * 1.0, p.y - s * 1.2); g.moveTo(p.x - s * 0.85, p.y - s * 0.9); g.quadraticCurveTo(p.x - s * 0.7, p.y - s * 1.15, p.x - s * 0.9, p.y - s * 1.2); g.stroke();
        g.fillStyle = '#b8312b'; g.beginPath(); g.arc(p.x - s * 0.8, p.y - s * 0.55, s * 0.07, 0, TAU); g.fill();
        g.fillStyle = 'rgba(0,0,0,.2)'; g.beginPath(); g.ellipse(p.x, p.y, s * 1.1, s * 0.12, 0, 0, TAU); g.fill();
      }
    }
    function galleryItem(ga, p, T0) {
      if (ga.kind === 'step') {
        // A concrete step: its top shaded from the back to the lit front edge, joints every few metres, a painted
        // yellow line along the edge, and the riser below
        if (poly([[ga.x - ga.w, ga.y, ga.z - 1.0], [ga.x + ga.w, ga.y, ga.z - 1.0], [ga.x + ga.w, ga.y, ga.z + 0.1], [ga.x - ga.w, ga.y, ga.z + 0.1]])) {
          var sb0 = P(ga.x, ga.y, ga.z - 1.0), sf0 = P(ga.x, ga.y, ga.z + 0.1);
          if (sb0 && sf0) { var sgr = g.createLinearGradient(0, sb0.y, 0, sf0.y); sgr.addColorStop(0, '#1b1722'); sgr.addColorStop(1, '#2d2735'); g.fillStyle = sgr; } else g.fillStyle = '#26212e';
          g.fill();
        }
        g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 1;
        for (var jx = -ga.w + 2.4; jx < ga.w; jx += 2.4) { var j0 = P(ga.x + jx, ga.y + 0.002, ga.z - 1.0), j1 = P(ga.x + jx, ga.y + 0.002, ga.z + 0.1); if (j0 && j1) { g.beginPath(); g.moveTo(j0.x, j0.y); g.lineTo(j1.x, j1.y); g.stroke(); } }
        fillPoly([[ga.x - ga.w, ga.y, ga.z + 0.1], [ga.x + ga.w, ga.y, ga.z + 0.1], [ga.x + ga.w, ga.y - 0.42, ga.z + 0.12], [ga.x - ga.w, ga.y - 0.42, ga.z + 0.12]], '#15121b');
        fillPoly([[ga.x - ga.w, ga.y + 0.003, ga.z - 0.02], [ga.x + ga.w, ga.y + 0.003, ga.z - 0.02], [ga.x + ga.w, ga.y + 0.003, ga.z + 0.06], [ga.x - ga.w, ga.y + 0.003, ga.z + 0.06]], 'rgba(214,170,58,.55)');
        return;
      }
      if (ga.kind === 'benchPlank') {
        fillPoly([[ga.x - ga.w / 2 - 0.2, 0.45, ga.z - 0.22], [ga.x + ga.w / 2 + 0.2, 0.45, ga.z - 0.22], [ga.x + ga.w / 2 + 0.2, 0.45, ga.z + 0.22], [ga.x - ga.w / 2 - 0.2, 0.45, ga.z + 0.22]], '#6b3f1f');
        [-1, 1].forEach(function (sd) { var a = P(ga.x + sd * ga.w / 2, 0, ga.z - 0.2), b = P(ga.x + sd * ga.w / 2, 0.45, ga.z - 0.2); if (a && b) { g.strokeStyle = '#3b2213'; g.lineWidth = Math.max(1, a.s * 0.08); g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke(); } });
        return;
      }
      if (ga.kind === 'chair') fillPoly([[ga.x - 0.22, 0.45, ga.z - 0.22], [ga.x + 0.22, 0.45, ga.z - 0.22], [ga.x + 0.22, 0.45, ga.z + 0.22], [ga.x - 0.22, 0.45, ga.z + 0.22]], ga.col);
      if (ga.who) { ga.who.backWord = null; ga.who.headAt = null; }
      if (ga.who) backFigure(ga.kind === 'stand' || ga.kind === 'runner' ? P(ga.x, ga.y + (ga.hopY || 0), ga.z) : p, ga.who, T0, ga.kind === 'runner' && ga.who.moving);
      if (ga.who && ga.who.seatRole && (ga.view || 'far') === st.listener && !st.dj && ga.who.headAt) {
        var youSeat = ga.who.seatRole === (st.youAs === 'man' ? 'm' : 'w'), lab = { x: ga.who.headAt.x, y: ga.who.headAt.y, h: ga.who.h * p.s, man: ga.who.man, hx: ga.who.headAt.x, hy: ga.who.headAt.y };
        if (youSeat) youLabel = lab; else partnerLabel = lab;
      }
      if (ga.kind === 'chair') {
        // The chair back sits between you and the sitter, so only their shoulders and head show above it
        fillPoly([[ga.x - 0.22, 0.45, ga.z - 0.22], [ga.x + 0.22, 0.45, ga.z - 0.22], [ga.x + 0.22, 0.98, ga.z - 0.25], [ga.x - 0.22, 0.98, ga.z - 0.25]], ga.col);
        var lg = P(ga.x - 0.2, 0, ga.z - 0.22), lt = P(ga.x - 0.2, 0.45, ga.z - 0.22), rg = P(ga.x + 0.2, 0, ga.z - 0.22), rt = P(ga.x + 0.2, 0.45, ga.z - 0.22);
        if (lg && lt && rg && rt) { g.strokeStyle = ga.col; g.lineWidth = Math.max(1, lg.s * 0.05); g.beginPath(); g.moveTo(lg.x, lg.y); g.lineTo(lt.x, lt.y); g.moveTo(rg.x, rg.y); g.lineTo(rt.x, rt.y); g.stroke(); }
      }

    }
    // Someone seen from behind: back of the head, hair or pagdi, the choli or kediyu, the odhni falling down the back
    function backFigure(p, d, T0, running) {
      FOGF = 0;
      var s = p.s, x = p.x, y = p.y, h = d.h * s, sit = !!d.sitting, hip = sit ? y - h * 0.02 : y - h * 0.5;
      if (h < 3) return;
      var skin = SKIN[Math.floor((d.ph || 0) * 10) % SKIN.length], top = d.top, main = d.col, hair = d.older ? '#9a948c' : '#1f130d';
      if (h < 14 && !d.backWord) {
        // Far off: a couple of shapes are enough
        g.globalAlpha = 1 - Math.min(1, p.z / 70) * 0.4;
        g.fillStyle = sit || d.man ? top : main; g.fillRect(x - h * 0.1, hip - h * 0.26, h * 0.2, sit ? h * 0.26 : h * 0.26 + (y - hip));
        g.fillStyle = d.man ? d.pagdi || '#b8312b' : hair; g.beginPath(); g.arc(x, hip - h * 0.365, h * 0.075, 0, TAU); g.fill();
        g.globalAlpha = 1; return;
      }
      // The audience at the stage grooves: a bob on each beat, a sway, and now and then (unless they're filming) both
      // arms up to cheer, or a clap over their heads that lands on the beat
      var grooveUp = false, clapOver = 0;
      if (d.stander && !reduce) {
        if (st.on && !sit) {
          var sw0 = d.sway || 0, gc = (T0 * 0.35 + sw0 * 1.7) % 6;
          var bob0 = Math.pow(Math.abs(Math.cos(BEAT * Math.PI)), 3) * h * 0.02; y -= bob0; hip -= bob0;
          x += Math.sin(T0 * 1.8 + sw0) * h * 0.028;
          if (!d.phone && !d.kid) { if (gc < 1.2) grooveUp = true; else if (gc > 3 && gc < 4.6) clapOver = Math.pow(Math.abs(Math.cos(BEAT * Math.PI)), 4); }
        } else x += Math.sin(T0 * 0.8 + (d.sway || 0)) * h * 0.02;
      }
      var armsUp = d.armsUp || grooveUp || clapOver > 0, upWave = reduce || clapOver > 0 ? 0 : Math.sin(T0 * 12 + (d.ph || 0) * 5) * h * 0.025;
      // Arms raised: apart and waving for a cheer, drawing together until the hands meet overhead for a clap
      var spread0 = clapOver > 0 ? 1 - clapOver : 1;
      var upE = [x - h * (0.1 + 0.05 * spread0), hip - h * 0.35, x + h * (0.1 + 0.05 * spread0)], upH = [x - h * (0.015 + 0.155 * spread0) + upWave, x + h * (0.015 + 0.155 * spread0) - upWave];
      if (sit && !reduce && st.on) x += Math.sin(T0 * 1.6 + (d.ph || 0) * 3) * h * 0.02;
      if (running) y -= Math.abs(Math.sin(d.step || 0)) * h * 0.05;
      g.lineCap = 'round';
      // Big in the foreground, the crowd is drawn with bodies and cloth instead of lines, their backs in the shadow
      // of the stage lights and their edges caught by them
      var rich = h >= (QP >= 1 ? 40 : 90), sh = hip - h * 0.26;
      if (rich) { backRich(x, y, h, d, T0, running, sit, hip, skin, top, main, hair); }
      else if (!sit) {
        if (d.man) { g.strokeStyle = d.legs || '#efe6d6'; g.lineWidth = Math.max(1, h * 0.055); var lx = running ? Math.sin(d.step) * h * 0.06 : 0; g.beginPath(); g.moveTo(x - h * 0.045, hip + h * 0.06); g.lineTo(x - h * 0.06 - lx, y); g.moveTo(x + h * 0.045, hip + h * 0.06); g.lineTo(x + h * 0.06 + lx, y); g.stroke(); }
        else { g.fillStyle = main; g.beginPath(); g.moveTo(x - h * 0.075, hip - h * 0.03); g.lineTo(x + h * 0.075, hip - h * 0.03); g.quadraticCurveTo(x + h * 0.19, y - h * 0.22, x + h * 0.24, y); g.quadraticCurveTo(x, y + h * 0.04, x - h * 0.24, y); g.quadraticCurveTo(x - h * 0.19, y - h * 0.22, x - h * 0.075, hip - h * 0.03); g.fill(); g.strokeStyle = '#e8b04b'; g.lineWidth = Math.max(1, h * 0.03); g.beginPath(); g.moveTo(x - h * 0.23, y - h * 0.01); g.quadraticCurveTo(x, y + h * 0.03, x + h * 0.23, y - h * 0.01); g.stroke(); }
      } else if (!d.man) { g.fillStyle = main; g.beginPath(); g.ellipse(x, hip, h * 0.2, h * 0.07, 0, Math.PI, 0); g.fill(); }
      // Back: a choli with a strip of skin above the waist, or the back of a kediyu
      if (rich) { /* drawn above */ }
      else if (d.man) { g.fillStyle = top; g.beginPath(); g.moveTo(x - h * 0.09, sh); g.lineTo(x + h * 0.09, sh); g.lineTo(x + h * 0.13, hip + (sit ? 0 : h * 0.1)); g.lineTo(x - h * 0.13, hip + (sit ? 0 : h * 0.1)); g.closePath(); g.fill(); }
      else { g.fillStyle = skin; g.fillRect(x - h * 0.07, sh + h * 0.12, h * 0.14, h * 0.13); g.fillStyle = top; g.fillRect(x - h * 0.085, sh, h * 0.17, h * 0.13); g.fillStyle = main; g.fillRect(x - h * 0.08, hip - h * 0.03, h * 0.16, h * 0.04); }
      // Arms resting at the sides (or one raised with a phone)
      if (rich) {
        var slv = d.man ? top : skin, aw = h * 0.04;
        var slvL = shade(slv, -0.22), slvR = shade(slv, -0.08), skL = shade(skin, -0.22), skR = shade(skin, -0.08);
        if (armsUp) {
          seg([x - h * 0.085, sh + h * 0.02], [upE[0], upE[1]], aw, aw * 0.9, slvL); seg([upE[0], upE[1]], [upH[0], sh - h * 0.21], aw * 0.9, aw * 0.75, skL);
          seg([x + h * 0.085, sh + h * 0.02], [upE[2], upE[1]], aw, aw * 0.9, slvR); seg([upE[2], upE[1]], [upH[1], sh - h * 0.21], aw * 0.9, aw * 0.75, skR);
        }
        else seg([x - h * 0.085, sh + h * 0.02], [x - h * 0.11, sh + h * 0.13], aw, aw * 0.9, slvL), seg([x - h * 0.11, sh + h * 0.13], [x - h * 0.12, hip - h * 0.02], aw * 0.9, aw * 0.75, skL);
        if (armsUp) { /* drawn above */ }
        else if (d.phone) { seg([x + h * 0.085, sh + h * 0.02], [x + h * 0.12, sh - h * 0.06], aw, aw * 0.9, slvR); seg([x + h * 0.12, sh - h * 0.06], [x + h * 0.1, sh - h * 0.16], aw * 0.9, aw * 0.75, skR); }
        else { seg([x + h * 0.085, sh + h * 0.02], [x + h * 0.11, sh + h * 0.13], aw, aw * 0.9, slvR); seg([x + h * 0.11, sh + h * 0.13], [x + h * 0.12, hip - h * 0.02], aw * 0.9, aw * 0.75, skR); }
        if (!d.man) { g.strokeStyle = '#c0392b'; g.lineWidth = Math.max(1, h * 0.008); g.beginPath(); g.moveTo(x - h * 0.135, hip - h * 0.06); g.lineTo(x - h * 0.105, hip - h * 0.06); g.stroke(); g.strokeStyle = '#e8b04b'; g.beginPath(); g.moveTo(x - h * 0.135, hip - h * 0.045); g.lineTo(x - h * 0.105, hip - h * 0.045); g.stroke(); }
      } else {
      g.strokeStyle = skin; g.lineWidth = Math.max(0.8, h * 0.034);
      g.beginPath();
      if (armsUp) { g.moveTo(x - h * 0.085, sh + h * 0.02); g.lineTo(upE[0], upE[1]); g.lineTo(upH[0], sh - h * 0.21); g.moveTo(x + h * 0.085, sh + h * 0.02); g.lineTo(upE[2], upE[1]); g.lineTo(upH[1], sh - h * 0.21); }
      else { g.moveTo(x - h * 0.085, sh + h * 0.02); g.lineTo(x - h * 0.12, hip - h * 0.02); }
      if (armsUp) { /* both drawn */ }
      else if (d.phone) { g.moveTo(x + h * 0.085, sh + h * 0.02); g.lineTo(x + h * 0.1, sh - h * 0.16); } else { g.moveTo(x + h * 0.085, sh + h * 0.02); g.lineTo(x + h * 0.12, hip - h * 0.02); }
      g.stroke();
      }
      if (d.phone && d.video) {
        // Held sideways to record: the screen shows the stage lights, with the red recording dot
        var pw0 = h * (d.gimbal ? 0.13 : 0.11), ph0 = pw0 * 0.56, px0 = x + h * 0.1 - pw0 / 2, py0 = sh - h * 0.25;
        if (d.gimbal) { g.strokeStyle = '#1a1a1a'; g.lineWidth = Math.max(1, h * 0.02); g.beginPath(); g.moveTo(x + h * 0.1, sh - h * 0.16); g.lineTo(x + h * 0.1, py0 + ph0); g.stroke(); }
        g.fillStyle = '#0d0d0d'; g.fillRect(px0 - 1, py0 - 1, pw0 + 2, ph0 + 2);
        var sg0 = g.createLinearGradient(px0, 0, px0 + pw0, 0); sg0.addColorStop(0, 'hsl(' + TH.hues[0] + ',' + TH.sat + '%,' + (30 + 15 * pulse) + '%)'); sg0.addColorStop(1, 'hsl(' + TH.hues[TH.hues.length - 1] + ',' + TH.sat + '%,' + (38 + 15 * pulse) + '%)');
        g.fillStyle = sg0; g.fillRect(px0, py0, pw0, ph0);
        g.fillStyle = 'rgba(255,240,210,.8)'; g.fillRect(px0 + pw0 * 0.3, py0 + ph0 * 0.55, pw0 * 0.4, ph0 * 0.2);
        if (Math.sin(T0 * 4 + (d.sway || 0)) > -0.3) { g.fillStyle = '#ff3b30'; g.beginPath(); g.arc(px0 + pw0 * 0.14, py0 + ph0 * 0.22, Math.max(0.8, ph0 * 0.12), 0, TAU); g.fill(); }
        glow(x + h * 0.1, py0 + ph0 / 2, Math.max(1, h * 0.05), '#eaf3ff', 0.35);
      } else if (d.phone) { g.fillStyle = 'rgba(200,225,255,.95)'; g.fillRect(x + h * 0.075, sh - h * 0.25, h * 0.05, h * 0.09); glow(x + h * 0.1, sh - h * 0.2, Math.max(0.8, h * 0.03), '#eaf3ff', 0.5); }
      // Odhni falling from one shoulder down the back: a sheet of cloth with a gold border when you're close
      if (!d.man && rich) {
        var oc = d.odhni || d.top, ob = hip + (sit ? -h * 0.02 : h * 0.17), sway0 = reduce ? 0 : Math.sin(T0 * 1.4 + (d.sway || 0)) * h * 0.012;
        g.globalAlpha = 0.82; g.fillStyle = roundSoft(oc, x - h * 0.12, x + h * 0.1); g.beginPath(); g.moveTo(x + h * 0.03, sh - h * 0.01); g.quadraticCurveTo(x + h * 0.1, sh + h * 0.02, x + h * 0.095, sh + h * 0.06); g.quadraticCurveTo(x + h * 0.02 + sway0, sh + h * 0.22, x - h * 0.03 + sway0, ob); g.lineTo(x - h * 0.13 + sway0, ob - h * 0.03); g.quadraticCurveTo(x - h * 0.06, sh + h * 0.12, x + h * 0.03, sh - h * 0.01); g.fill(); g.globalAlpha = 1;
        g.strokeStyle = '#e8b04b'; g.lineWidth = Math.max(1, h * 0.012); g.beginPath(); g.moveTo(x - h * 0.03 + sway0, ob); g.lineTo(x - h * 0.13 + sway0, ob - h * 0.03); g.stroke();
        g.fillStyle = 'rgba(255,248,230,.55)'; for (var od = 0; od < 7; od++) { g.beginPath(); g.arc(x + h * (0.03 - od * 0.018) + sway0 * od / 7, sh + h * (0.06 + od * 0.045), Math.max(0.6, h * 0.005), 0, TAU); g.fill(); }
      } else if (!d.man) { g.strokeStyle = d.odhni || d.top; g.globalAlpha = 0.85; g.lineWidth = Math.max(1, h * 0.045); g.beginPath(); g.moveTo(x + h * 0.08, sh); g.quadraticCurveTo(x, sh + h * 0.12, x - h * 0.09, hip + (sit ? -h * 0.02 : h * 0.15)); g.stroke(); g.globalAlpha = 1; }
      if (d.man && d.stole) { g.strokeStyle = d.stole; g.lineWidth = Math.max(1, h * 0.03); g.beginPath(); g.moveTo(x - h * 0.08, sh); g.lineTo(x + h * 0.06, hip); g.stroke(); }
      // Your word printed on your back, so it never covers the view
      if (d.backWord) {
        var you0 = d.backWord === 'you' || d.backWord === 'તું', fs0 = Math.max(9, Math.min(22, h * 0.075));
        if (you0) glow(x, sh + h * 0.1, h * 0.16, 'rgba(255,210,130,1)', 0.25 + youGlow * 0.3);
        g.font = '700 ' + fs0 + 'px ' + GU_FONT; g.textAlign = 'center';
        var pw = Math.max(fs0 * 1.8, g.measureText(d.backWord).width + fs0 * 0.8), ph = fs0 * 1.4;
        g.fillStyle = you0 ? '#e8b04b' : 'rgba(243,230,208,.95)'; roundRect(x - pw / 2, sh + h * 0.035, pw, ph, fs0 * 0.3); g.fill();
        g.fillStyle = you0 ? '#2a1208' : '#6b1420'; g.fillText(d.backWord, x, sh + h * 0.035 + ph * 0.72);
      }
      // Neck and the back of the head
      g.fillStyle = rich ? roundSoft(skin, x - h * 0.025, x + h * 0.025) : skin; g.fillRect(x - h * 0.022, sh - h * 0.05, h * 0.044, h * 0.05);
      var hy = sh - h * 0.105;
      d.headAt = { x: x, y: hy - h * 0.085 };
      if (rich) backHead(x, hy, h, d, T0, skin, hair);
      else if (d.man) { g.fillStyle = skin; g.beginPath(); g.arc(x, hy, h * 0.066, 0, TAU); g.fill(); g.fillStyle = d.older ? '#f3e6d0' : d.pagdi || '#b8312b'; g.beginPath(); g.ellipse(x, hy - h * 0.025, h * 0.078, h * 0.058, 0, Math.PI, 0); g.lineTo(x + h * 0.078, hy - h * 0.005); g.lineTo(x - h * 0.078, hy - h * 0.005); g.fill(); }
      else { g.fillStyle = hair; g.beginPath(); g.arc(x, hy, h * 0.07, 0, TAU); g.fill(); g.beginPath(); g.arc(x, hy + h * 0.055, h * 0.036, 0, TAU); g.fill(); g.fillStyle = '#e8b04b'; g.beginPath(); g.arc(x, hy + h * 0.055, Math.max(0.6, h * 0.012), 0, TAU); g.fill(); }
    }
    // The crowd from behind, up close: shaded legs or a pleated chaniya with its gota hem, the back of a choli tied
    // with dori and tassels or of a kediyu with its gathered flare, and the stage's light catching their edges
    function backRich(x, y, h, d, T0, running, sit, hip, skin, top, main, hair) {
      var sh = hip - h * 0.26, dim = -0.04, beam = TH.beams[Math.floor((d.sway || 0) * 3) % TH.beams.length], roundLit = roundSoft;
      if (!sit) {
        if (d.man) {
          var legC = d.legs || '#efe6d6', lx = running ? Math.sin(d.step) * h * 0.06 : 0;
          [[-1, -lx], [1, lx]].forEach(function (lg) { var sd = lg[0], a = [x + sd * h * 0.045, hip + h * 0.06], k = [x + sd * h * 0.055 + lg[1] * 0.5, lerp(hip, y, 0.5)], f = [x + sd * h * 0.06 + lg[1], y - h * 0.02]; var lc0 = shade(legC, sd < 0 ? -0.2 : -0.06); seg(a, k, h * 0.062, h * 0.05, lc0); seg(k, f, h * 0.05, h * 0.036, lc0); g.fillStyle = '#3a1f12'; g.beginPath(); g.ellipse(f[0], y - h * 0.005, h * 0.035, h * 0.016, 0, 0, TAU); g.fill(); });
        } else {
          var fl = h * 0.24, hemY = y;
          g.fillStyle = roundLit(shade(main, dim), x - fl, x + fl); g.beginPath(); g.moveTo(x - h * 0.075, hip - h * 0.03); g.lineTo(x + h * 0.075, hip - h * 0.03); g.quadraticCurveTo(x + h * 0.19, y - h * 0.22, x + fl, hemY); g.quadraticCurveTo(x, hemY + h * 0.04, x - fl, hemY); g.quadraticCurveTo(x - h * 0.19, y - h * 0.22, x - h * 0.075, hip - h * 0.03); g.fill();
          g.strokeStyle = 'rgba(0,0,0,.2)'; g.lineWidth = Math.max(0.6, h * 0.004); for (var pl = -4; pl <= 4; pl++) { g.beginPath(); g.moveTo(x + pl * h * 0.017, hip - h * 0.02); g.lineTo(x + pl * fl * 0.24, hemY + h * 0.03 * (1 - Math.abs(pl) / 5)); g.stroke(); }
          g.strokeStyle = shade('#e8b04b', -0.1); g.lineWidth = Math.max(1.2, h * 0.03); g.beginPath(); g.moveTo(x - fl * 0.96, hemY - h * 0.015); g.quadraticCurveTo(x, hemY + h * 0.028, x + fl * 0.96, hemY - h * 0.015); g.stroke();
          g.strokeStyle = shade(d.odhni || top, -0.1); g.lineWidth = Math.max(0.8, h * 0.012); g.beginPath(); g.moveTo(x - fl * 0.85, hemY - h * 0.08); g.quadraticCurveTo(x, hemY - h * 0.045, x + fl * 0.85, hemY - h * 0.08); g.stroke();
        }
      } else if (!d.man) { g.fillStyle = roundLit(shade(main, dim), x - h * 0.2, x + h * 0.2); g.beginPath(); g.ellipse(x, hip, h * 0.2, h * 0.07, 0, Math.PI, 0); g.fill(); }
      if (d.man) {
        // The back of a kediyu: fitted across the shoulders, then gathered into a flare with the pleats showing
        var fb = hip + (sit ? 0 : h * 0.1), kfl = h * 0.15;
        g.fillStyle = roundLit(shade(top, dim), x - kfl, x + kfl); g.beginPath(); g.moveTo(x - h * 0.09, sh); g.quadraticCurveTo(x, sh - h * 0.012, x + h * 0.09, sh); g.lineTo(x + h * 0.085, sh + h * 0.14); g.quadraticCurveTo(x + kfl * 0.9, hip - h * 0.02, x + kfl, fb); g.quadraticCurveTo(x, fb + h * 0.03, x - kfl, fb); g.quadraticCurveTo(x - kfl * 0.9, hip - h * 0.02, x - h * 0.085, sh + h * 0.14); g.closePath(); g.fill();
        g.strokeStyle = 'rgba(0,0,0,.2)'; g.lineWidth = Math.max(0.6, h * 0.004); for (var kp = -3; kp <= 3; kp++) { g.beginPath(); g.moveTo(x + kp * h * 0.02, sh + h * 0.15); g.lineTo(x + kp * kfl * 0.3, fb + h * 0.02 * (1 - Math.abs(kp) / 4)); g.stroke(); }
        g.strokeStyle = shade('#e8b04b', -0.15); g.lineWidth = Math.max(0.8, h * 0.008); g.beginPath(); g.moveTo(x - kfl * 0.97, fb - h * 0.005); g.quadraticCurveTo(x, fb + h * 0.025, x + kfl * 0.97, fb - h * 0.005); g.stroke();
      } else {
        // The back of a choli: bare between the ties, the dori knotted across with tassels hanging from it
        g.fillStyle = roundLit(shade(skin, dim), x - h * 0.075, x + h * 0.075); g.fillRect(x - h * 0.07, sh + h * 0.1, h * 0.14, h * 0.15);
        g.fillStyle = roundLit(shade(top, dim), x - h * 0.09, x + h * 0.09); g.beginPath(); g.moveTo(x - h * 0.087, sh); g.quadraticCurveTo(x, sh - h * 0.012, x + h * 0.087, sh); g.lineTo(x + h * 0.082, sh + h * 0.11); g.lineTo(x + h * 0.03, sh + h * 0.11); g.quadraticCurveTo(x, sh + h * 0.075, x - h * 0.03, sh + h * 0.11); g.lineTo(x - h * 0.082, sh + h * 0.11); g.closePath(); g.fill();
        g.strokeStyle = shade(top, -0.35); g.lineWidth = Math.max(0.7, h * 0.006); g.beginPath(); g.moveTo(x - h * 0.03, sh + h * 0.14); g.lineTo(x + h * 0.03, sh + h * 0.14); g.stroke();
        var tsw = reduce ? 0 : Math.sin(T0 * 2 + (d.sway || 0)) * h * 0.006;
        g.beginPath(); g.moveTo(x, sh + h * 0.14); g.lineTo(x - h * 0.012 + tsw, sh + h * 0.21); g.moveTo(x, sh + h * 0.14); g.lineTo(x + h * 0.012 + tsw, sh + h * 0.21); g.stroke();
        [-1, 1].forEach(function (sd) { g.fillStyle = '#e8b04b'; g.beginPath(); g.arc(x + sd * h * 0.012 + tsw, sh + h * 0.215, Math.max(0.8, h * 0.008), 0, TAU); g.fill(); g.strokeStyle = TH.flags[0]; g.lineWidth = Math.max(0.6, h * 0.004); g.beginPath(); g.moveTo(x + sd * h * 0.012 + tsw, sh + h * 0.22); g.lineTo(x + sd * h * 0.012 + tsw * 1.5, sh + h * 0.245); g.stroke(); });
        g.fillStyle = roundLit(shade(main, dim), x - h * 0.08, x + h * 0.08); g.fillRect(x - h * 0.08, hip - h * 0.035, h * 0.16, h * 0.04);
      }
      // Stage light catching the tops of the shoulders
      g.strokeStyle = 'rgba(' + beam + ',' + 0.32 * bright + ')'; g.lineWidth = Math.max(1, h * 0.01);
      g.beginPath(); g.moveTo(x - h * 0.13, sh + h * 0.05); g.quadraticCurveTo(x - h * 0.09, sh - h * 0.01, x - h * 0.02, sh - h * 0.005); g.moveTo(x + h * 0.02, sh - h * 0.005); g.quadraticCurveTo(x + h * 0.09, sh - h * 0.01, x + h * 0.13, sh + h * 0.05); g.stroke();
    }
    // The back of a head up close: her hair drawn into a braid down her back with a gajra and a paranda,
    // or his safa's wraps with the tail hanging down
    function backHead(x, hy, h, d, T0, skin, hair) {
      var hr = h * 0.068, beam = TH.beams[Math.floor((d.sway || 0) * 3) % TH.beams.length];
      if (d.man) {
        g.fillStyle = roundSoft(skin, x - hr, x + hr); g.beginPath(); g.arc(x, hy, hr * 0.96, 0, TAU); g.fill();
        var pc = d.older ? '#f3e6d0' : d.pagdi || '#b8312b';
        g.fillStyle = roundSoft(pc, x - hr * 1.2, x + hr * 1.2); g.beginPath(); g.moveTo(x - hr * 1.12, hy + hr * 0.2); g.quadraticCurveTo(x - hr * 1.3, hy - hr * 1.45, x, hy - hr * 1.55); g.quadraticCurveTo(x + hr * 1.3, hy - hr * 1.45, x + hr * 1.12, hy + hr * 0.2); g.quadraticCurveTo(x, hy + hr * 0.02, x - hr * 1.12, hy + hr * 0.2); g.fill();
        g.save(); g.clip(); for (var wf = 0; wf < 5; wf++) { var wy = hy - hr * (0.1 + wf * 0.28); g.strokeStyle = shade(pc, -0.4); g.lineWidth = Math.max(0.7, h * 0.005); g.beginPath(); g.moveTo(x - hr * 1.3, wy - hr * 0.3); g.quadraticCurveTo(x, wy + hr * 0.1, x + hr * 1.3, wy + hr * 0.3); g.stroke(); } g.restore();
        var tail = reduce ? 0 : Math.sin(T0 * 2 + (d.sway || 0)) * h * 0.01;
        if (!d.older) { g.fillStyle = shade(pc, -0.25); g.beginPath(); g.moveTo(x - hr * 0.3, hy + hr * 0.1); g.lineTo(x + hr * 0.3, hy + hr * 0.1); g.lineTo(x + hr * 0.25 + tail, hy + h * 0.2); g.lineTo(x - hr * 0.25 + tail, hy + h * 0.21); g.closePath(); g.fill(); }
      } else {
        g.fillStyle = hair; g.beginPath(); g.arc(x, hy, hr * 1.02, 0, TAU); g.fill();
        g.strokeStyle = 'rgba(255,255,255,.08)'; g.lineWidth = Math.max(0.6, h * 0.004); for (var hs = -2; hs <= 2; hs++) { g.beginPath(); g.moveTo(x + hs * hr * 0.3, hy - hr * 0.9); g.quadraticCurveTo(x + hs * hr * 0.2, hy, x, hy + hr * 0.9); g.stroke(); }
        // The braid: overlapping plaits down the back, jasmine where it starts, a red paranda at the end
        var bl = h * 0.2, sway0 = reduce ? 0 : Math.sin(T0 * 1.6 + (d.sway || 0)) * h * 0.01;
        for (var bk = 0; bk < 7; bk++) { var bu = bk / 7, bx = x + sway0 * bu, by = hy + hr * 0.8 + bl * bu, bw = hr * (0.42 - bu * 0.2); g.fillStyle = bk % 2 ? hair : shade(hair, 0.12); g.beginPath(); g.ellipse(bx + (bk % 2 ? bw * 0.2 : -bw * 0.2), by, bw, bl / 12, bk % 2 ? 0.5 : -0.5, 0, TAU); g.fill(); }
        dotRow(alongQuad(x - hr * 0.55, hy + hr * 0.55, x, hy + hr * 0.95, x + hr * 0.55, hy + hr * 0.55, 6), Math.max(0.7, h * 0.006), '#fffaf0');
        var pe = [x + sway0, hy + hr * 0.8 + bl]; g.fillStyle = '#c0392b'; g.beginPath(); g.moveTo(pe[0] - hr * 0.2, pe[1]); g.lineTo(pe[0] + hr * 0.2, pe[1]); g.lineTo(pe[0] + hr * 0.12, pe[1] + h * 0.05); g.lineTo(pe[0] - hr * 0.12, pe[1] + h * 0.05); g.closePath(); g.fill(); g.fillStyle = '#e8b04b'; g.beginPath(); g.arc(pe[0], pe[1], Math.max(0.8, h * 0.006), 0, TAU); g.fill();
        [-1, 1].forEach(function (sd) { g.fillStyle = '#e8b04b'; g.beginPath(); g.arc(x + sd * hr * 0.98, hy + hr * 0.35, Math.max(0.8, h * 0.006), 0, TAU); g.fill(); });
      }
      g.strokeStyle = 'rgba(' + beam + ',' + 0.3 * bright + ')'; g.lineWidth = Math.max(1, h * 0.009); g.beginPath(); g.arc(x, d.man ? hy - hr * 0.5 : hy, hr * (d.man ? 1.1 : 1.02), -Math.PI * 0.95, -Math.PI * 0.05); g.stroke();
    }
    // A moulded plastic chair side-on along the edge: four splayed legs, the seat, and a back with slots in it
    function chair(se) {
      var sd = se.side, x = se.x, z = se.z, o = sd * 0.22;
      g.strokeStyle = se.col;
      [[-o, -0.2], [-o, 0.2], [o, -0.2], [o, 0.2]].forEach(function (l) { var a = P(x + l[0] * 1.1, 0, z + l[1] * 1.1), b = P(x + l[0], 0.45, z + l[1]); if (a && b) { g.lineWidth = Math.max(0.7, a.s * 0.03); g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke(); } });
      fillPoly([[x - o, 0.45, z - 0.22], [x + o, 0.45, z - 0.22], [x + o, 0.45, z + 0.22], [x - o, 0.45, z + 0.22]], se.col);
      fillPoly([[x + o, 0.45, z - 0.22], [x + o * 1.12, 0.95, z - 0.2], [x + o * 1.12, 0.95, z + 0.2], [x + o, 0.45, z + 0.22]], se.col);
      var sl = P(x + o * 1.06, 0.72, z); if (sl && sl.s > 22) { g.fillStyle = 'rgba(0,0,0,.2)'; for (var k = -1; k <= 1; k++) { var q = P(x + o * 1.06, 0.72, z + k * 0.1); if (q) g.fillRect(q.x - 0.5, q.y - q.s * 0.1, Math.max(1, q.s * 0.02), q.s * 0.2); } }
    }
    function houses() {
      var list = [], cols = ['#3a4468', '#5e4526', '#5c3040', '#28524f', '#5b5241', '#4a3a5e'];
      [-1, 1].forEach(function (side) {
        for (var z = -48; z < 70;) {
          var w = 5 + rnd() * 3.5, h = 6.8 + rnd() * 4.5;
          list.push({ side: side, z1: z, z2: z + w, h: h, col: cols[Math.floor(rnd() * cols.length)], floors: h > 9.5 ? 3 : 2, lit: rnd(), balcony: rnd() < 0.5, rangoli: rnd() < 0.55, bulbs: rnd() < 0.6, hue: Math.floor(rnd() * 6) });
          z += w + 0.15;
        }
      });
      return list;
    }
    function stands() {
      var people = [];
      for (var row = 0; row < 11; row++) for (var x = -27; x <= 27; x += 0.72) people.push({ side: 0, row: row, u: x, c: Math.floor(rnd() * 6), p: rnd() < 0.05 ? rnd() * TAU : -1 });
      [-1, 1].forEach(function (side) { for (var row = 0; row < 9; row++) for (var z = -30; z <= 42; z += 0.8) people.push({ side: side, row: row, u: z, c: Math.floor(rnd() * 6), p: rnd() < 0.04 ? rnd() * TAU : -1 }); });
      return people;
    }

    /* ---------- the moon: its real phase tonight, or the phase on a chosen night ---------- */
    function moonAge() { return st.moonAge != null ? st.moonAge : moonInfo().age; }
    function drawMoon(b, x, y, r, age) {
      var ph = age / SYNODIC, k = (1 - Math.cos(ph * TAU)) / 2;
      var gl = b.createRadialGradient(x, y, r * 0.6, x, y, r * 5); gl.addColorStop(0, 'rgba(255,240,215,' + (0.05 + 0.2 * k) + ')'); gl.addColorStop(1, 'rgba(255,240,215,0)');
      b.fillStyle = gl; b.beginPath(); b.arc(x, y, r * 5, 0, TAU); b.fill();
      b.fillStyle = 'rgba(150,150,180,.16)'; b.beginPath(); b.arc(x, y, r, 0, TAU); b.fill();
      if (k < 0.004) return;
      b.save(); b.translate(x, y); if (ph > 0.5) b.scale(-1, 1);
      b.beginPath(); b.arc(0, 0, r, -Math.PI / 2, Math.PI / 2, false);
      b.ellipse(0, 0, r * Math.abs(1 - 2 * k), r, 0, Math.PI / 2, -Math.PI / 2, k < 0.5);
      b.closePath(); b.fillStyle = 'rgba(255,243,220,.96)'; b.fill(); b.restore();
    }

    /* ---------- the fixed sky, cached ---------- */
    function sky(id) {
      var key = id + W + 'x' + H + '@' + Math.round(HOR / 3) + ':' + BX + ',' + BY + 'm' + Math.round(moonAge() * 4); if (statics[key]) return statics[key];
      if (Object.keys(statics).length > 5) statics = {};
      var c = document.createElement('canvas'); c.width = Math.round(W * DPR); c.height = Math.round(H * DPR);
      var b = c.getContext('2d'); b.setTransform(DPR, 0, 0, DPR, 0, 0);
      var r2 = seeded(99), i;
      if (id === 'stadium') {
        var roof = b.createLinearGradient(0, 0, 0, HOR); roof.addColorStop(0, '#050409'); roof.addColorStop(1, '#171222');
        b.fillStyle = roof; b.fillRect(0, 0, W, HOR + 1);
        var fl = b.createLinearGradient(0, HOR, 0, H); fl.addColorStop(0, '#2a1d14'); fl.addColorStop(1, '#130c08');
        b.fillStyle = fl; b.fillRect(0, HOR, W, H - HOR);
      } else {
        var s = b.createLinearGradient(0, 0, 0, HOR); s.addColorStop(0, '#04051a'); s.addColorStop(0.62, '#140f33'); s.addColorStop(1, id === 'sheri' ? '#2a1b36' : '#3d1f1a');
        b.fillStyle = s; b.fillRect(0, 0, W, HOR + 1);
        for (i = 0; i < 120; i++) { b.fillStyle = 'rgba(255,245,225,' + (0.2 + r2() * 0.6) + ')'; b.fillRect(r2() * W, r2() * HOR * 0.92, 1.2, 1.2); }
        var age = moonAge(), yA = Math.min(age, 29.5 - age, 14.8) / 14.8;
        drawMoon(b, BX + BW * 0.82, BY + (HOR - BY) * lerp(0.7, 0.24, yA), Math.max(5, BW * 0.026), age);
        b.fillStyle = id === 'sheri' ? '#140f10' : '#0d0913';
        if (id === 'outdoors') {
          for (var x = 0; x < W; x += W / 30) { var bh = HOR * (0.03 + r2() * 0.09); b.fillRect(x, HOR - bh, W / 31, bh + 1); for (var w = 0; w < 3; w++) if (r2() < 0.4) { b.fillStyle = 'rgba(255,196,120,.5)'; b.fillRect(x + r2() * W / 34, HOR - r2() * bh, 1.5, 1.5); b.fillStyle = '#0d0913'; } }
          var hz = b.createLinearGradient(0, HOR - HOR * 0.2, 0, HOR); hz.addColorStop(0, 'rgba(255,140,70,0)'); hz.addColorStop(1, 'rgba(255,140,70,.16)');
          b.fillStyle = hz; b.fillRect(0, HOR - HOR * 0.2, W, HOR * 0.2);
        }
        var gr = b.createLinearGradient(0, HOR, 0, H); gr.addColorStop(0, id === 'sheri' ? '#2b2019' : '#2a1b10'); gr.addColorStop(1, '#100a06');
        b.fillStyle = gr; b.fillRect(0, HOR, W, H - HOR);
      }
      statics[key] = c; return c;
    }

    /* ---------- venue structures, drawn in perspective each frame ---------- */
    var bright = 1;
    function outdoorsBack(t) {
      groundMarks('outdoors');
      // Light towers with floodlights, and the pools of light they throw
      [-31, 31].forEach(function (x) {
        var pool = P(x * 0.55, 0, 14); if (pool) { var pr = pool.s * 9, pg = g.createRadialGradient(pool.x, pool.y, 1, pool.x, pool.y, pr); pg.addColorStop(0, 'rgba(' + TH.glowTint + ',' + 0.12 * bright + ')'); pg.addColorStop(1, 'rgba(' + TH.glowTint + ',0)'); g.fillStyle = pg; g.beginPath(); g.ellipse(pool.x, pool.y, pr, pr * 0.3, 0, 0, TAU); g.fill(); }
        var base = P(x, 0, 16), top = P(x, 11, 16); if (!base || !top) return;
        g.strokeStyle = '#1c1511'; g.lineWidth = Math.max(1, base.s * 0.3); g.beginPath(); g.moveTo(base.x, base.y); g.lineTo(top.x, top.y); g.stroke();
        // The lamp head: a dark frame of four lamps angled down at the ground, with the light falling from it
        var hw = top.s * 1.6, hh = top.s * 0.9, hx = top.x - hw / 2, hy = top.y - hh;
        var beam = g.createLinearGradient(top.x, top.y, pool ? pool.x : top.x, pool ? pool.y : top.y + 200);
        beam.addColorStop(0, 'rgba(255,240,210,' + 0.1 * bright + ')'); beam.addColorStop(1, 'rgba(255,240,210,0)');
        if (pool) { g.fillStyle = beam; g.beginPath(); g.moveTo(hx, top.y); g.lineTo(hx + hw, top.y); g.lineTo(pool.x + pool.s * 6, pool.y); g.lineTo(pool.x - pool.s * 6, pool.y); g.closePath(); g.fill(); }
        g.fillStyle = '#16110e'; g.fillRect(hx - 1, hy - 1, hw + 2, hh + 2);
        for (var k = 0; k < 4; k++) glow(hx + hw * (k % 2 ? 0.72 : 0.28), hy + hh * (k < 2 ? 0.3 : 0.72), Math.max(1, Math.min(3.4, top.s * 0.22)), '#fff4dc', 0.35 + 0.65 * bright);
      });
      // Trees beyond the stage go behind it; the rest are sorted in with the crowd
      layout('outdoors').trees.filter(function (tr) { return tr.z >= 44; }).sort(function (a, b) { return b.z - a.z; }).forEach(function (tr) { drawTree(tr, t); });
      stage({ x0: -11, x1: 11, z: 46, h: 1.6, screenTop: 8.5, truss: 10.5, arrays: 13 }, t, 'outdoors');
      // Delay speaker towers halfway down the ground, so the back of the crowd hears the band on time
      [-21, 21].forEach(function (x) { speakerPole(x, 16, 6); });
    }
    function groundMarks(id) {
      // Scuffed earth, stones and footprints: fixed in the world so they move with the view
      var L = layout(id);
      if (!L.marks) { L.marks = []; for (var i = 0; i < 260; i++) L.marks.push([lerp(-30, 30, rnd()), lerp(-14, 44, rnd()), rnd()]); }
      for (var j = 0; j < L.marks.length; j++) {
        var m = L.marks[j], p = P(m[0], 0, m[1]); if (!p || p.x < 0 || p.x > W || p.s < 4) continue;
        g.fillStyle = m[2] < 0.5 ? 'rgba(255,220,170,.05)' : 'rgba(0,0,0,.18)';
        g.beginPath(); g.ellipse(p.x, p.y, Math.max(0.6, p.s * (0.12 + m[2] * 0.25)), Math.max(0.3, p.s * 0.04), 0, 0, TAU); g.fill();
      }
    }
    // A stage: deck, screen with a mandala that breathes with the beat, truss with lights, hung speaker arrays and the band
    function stage(o, t, id) {
      // A deck deep enough to stage the band: singers down at the front, the players on a riser behind them, the screen at the back
      var zF = o.z, depth = o.depth || 3.2, zB = o.z + depth, rH = 0.4, rz0 = zF + depth * 0.45, close = st.listener === 'stage' || st.dj;
      // The front of the deck: a pleated maroon skirt, a gold trim along the edge, and steps up in the middle
      fillPoly([[o.x0, 0, zF], [o.x1, 0, zF], [o.x1, o.h, zF], [o.x0, o.h, zF]], '#2a0c12');
      var fa = P(o.x0, o.h, zF), fb = P(o.x1, o.h, zF), fg0 = P(o.x0, 0, zF);
      // (Pleats only at full quality; a device that has had to step down gets the plain skirt)
      if (fa && fb && fg0 && fb.x - fa.x > 40 && QP >= 1) {
        // One gradient for the whole skirt, its stops laid out as pleats
        var np = Math.min(60, Math.round((fb.x - fa.x) / 9)), pgr = g.createLinearGradient(fa.x, 0, fb.x, 0);
        for (var pl = 0; pl < np; pl++) { pgr.addColorStop(pl / np, 'rgba(0,0,0,.32)'); pgr.addColorStop((pl + 0.45) / np, 'rgba(255,190,170,.07)'); }
        pgr.addColorStop(1, 'rgba(0,0,0,.32)'); g.fillStyle = pgr; g.fillRect(fa.x, fa.y, fb.x - fa.x, fg0.y - fa.y);
      }
      if (fa && fb) { g.strokeStyle = '#c9963f'; g.lineWidth = Math.max(1, fa.s * 0.05); g.beginPath(); g.moveTo(fa.x, fa.y + fa.s * 0.03); g.lineTo(fb.x, fb.y + fb.s * 0.03); g.stroke(); }
      for (var stp = 0; stp < 3; stp++) { var sy0 = o.h * stp / 3, sy1 = o.h * (stp + 1) / 3, sz = zF - 0.9 + stp * 0.3; fillPoly([[-1.3, sy0, sz], [1.3, sy0, sz], [1.3, sy1, sz], [-1.3, sy1, sz]], stp % 2 ? '#3a1a14' : '#44201a'); fillPoly([[-1.3, sy1, sz], [1.3, sy1, sz], [1.3, sy1, sz + 0.3], [-1.3, sy1, sz + 0.3]], '#5a2c20'); }
      // The deck: dark and glossy, picking up the screen's colour towards the back
      if (poly([[o.x0, o.h, zF], [o.x1, o.h, zF], [o.x1, o.h, zB], [o.x0, o.h, zB]])) {
        var d0 = P(0, o.h, zF), d1 = P(0, o.h, zB);
        if (d0 && d1) { var dg = g.createLinearGradient(0, d0.y, 0, d1.y); dg.addColorStop(0, '#1d120c'); dg.addColorStop(0.6, '#2a1a12'); dg.addColorStop(1, 'hsl(' + TH.hues[0] + ',' + TH.sat * 0.5 + '%,' + (12 + 6 * bright + 4 * pulse) + '%)'); g.fillStyle = dg; } else g.fillStyle = '#2a1a10';
        g.fill();
      }
      var sx0 = o.x0 + 1, sx1 = o.x1 - 1;
      screenPanel(sx0, sx1, o.h, o.screenTop, zB, t, id);
      // The riser for the players, its face lined with a strip of LEDs
      var rx0 = o.x0 + 1.4, rx1 = o.x1 - 1.4;
      fillPoly([[rx0, o.h, rz0], [rx1, o.h, rz0], [rx1, o.h + rH, rz0], [rx0, o.h + rH, rz0]], '#170f0c');
      fillPoly([[rx0, o.h + rH, rz0], [rx1, o.h + rH, rz0], [rx1, o.h + rH, zB - 0.05], [rx0, o.h + rH, zB - 0.05]], '#2b1c14');
      var ra = P(rx0, o.h + rH * 0.5, rz0 - 0.01), rb = P(rx1, o.h + rH * 0.5, rz0 - 0.01);
      if (ra && rb) { var lgr = g.createLinearGradient(ra.x, 0, rb.x, 0); TH.hues.forEach(function (hh, k) { lgr.addColorStop(k / Math.max(1, TH.hues.length - 1), 'hsla(' + (hh + 20 * Math.sin(t * TH.speed + k)) + ',' + TH.sat + '%,' + (45 + 15 * pulse) + '%,' + (0.55 + 0.35 * bright) + ')'); }); g.strokeStyle = lgr; g.lineWidth = Math.max(1, ra.s * 0.05); g.beginPath(); g.moveTo(ra.x, ra.y); g.lineTo(rb.x, rb.y); g.stroke(); }
      // Backlight: a fan of beams rising from behind the band, which is what makes a stage look deep
      if (st.on && !reduce && QP >= 1) {
        g.save(); g.globalCompositeOperation = 'lighter';
        for (var fb2 = 0; fb2 < 5; fb2++) {
          var bxu = lerp(rx0 + 0.5, rx1 - 0.5, (fb2 + 0.5) / 5), bsrc = P(bxu, o.h + rH, zB - 0.2), sweep = Math.sin(t * (0.5 + TH.speed * 0.6) + fb2 * 1.7) * 2.2, btop0 = P(bxu + sweep - 0.9, o.screenTop + 3, zB - 1.4), btop1 = P(bxu + sweep + 0.9, o.screenTop + 3, zB - 1.4);
          if (!bsrc || !btop0 || !btop1) continue;
          var bcol = TH.beams[(fb2 + 1) % TH.beams.length], bgr = g.createLinearGradient(bsrc.x, bsrc.y, (btop0.x + btop1.x) / 2, btop0.y);
          bgr.addColorStop(0, 'rgba(' + bcol + ',' + (0.16 + 0.12 * pulse) * bright + ')'); bgr.addColorStop(1, 'rgba(' + bcol + ',0)');
          g.fillStyle = bgr; g.beginPath(); g.moveTo(bsrc.x - 1, bsrc.y); g.lineTo(bsrc.x + 1, bsrc.y); g.lineTo(btop1.x, btop1.y); g.lineTo(btop0.x, btop0.y); g.closePath(); g.fill();
          glow(bsrc.x, bsrc.y, Math.max(1.5, bsrc.s * 0.12), 'rgb(' + bcol + ')', 0.8 * bright);
        }
        g.restore();
      }
      // Truss towers and the top beam, built as lattice, with a velvet valance hung across the front of the beam
      // and velvet wings masking the sides, so the stage reads as a framed proscenium
      var tl = P(o.x0 - 0.4, 0, zF), tr = P(o.x1 + 0.4, 0, zF), tlt = P(o.x0 - 0.4, o.truss, zF), trt = P(o.x1 + 0.4, o.truss, zF);
      if (tl && tr && tlt && trt) {
        var tw0 = Math.max(2, tl.s * 0.4);
        g.strokeStyle = '#4a4452'; g.lineWidth = Math.max(0.7, tl.s * 0.05);
        [[tl, tlt], [tr, trt]].forEach(function (tt) {
          var a = tt[0], b = tt[1]; g.beginPath(); g.moveTo(a.x - tw0 / 2, a.y); g.lineTo(b.x - tw0 / 2, b.y); g.moveTo(a.x + tw0 / 2, a.y); g.lineTo(b.x + tw0 / 2, b.y);
          var nz = Math.max(4, Math.round((a.y - b.y) / tw0)); for (var zi = 0; zi < nz; zi++) { var y0 = lerp(a.y, b.y, zi / nz), y1 = lerp(a.y, b.y, (zi + 1) / nz); g.moveTo(a.x + (zi % 2 ? tw0 : -tw0) / 2, y0); g.lineTo(a.x + (zi % 2 ? -tw0 : tw0) / 2, y1); } g.stroke();
        });
        g.beginPath(); g.moveTo(tlt.x, tlt.y - tw0 / 2); g.lineTo(trt.x, trt.y - tw0 / 2); g.moveTo(tlt.x, tlt.y + tw0 / 2); g.lineTo(trt.x, trt.y + tw0 / 2);
        var nb = Math.max(6, Math.round((trt.x - tlt.x) / tw0)); for (var bi2 = 0; bi2 < nb; bi2++) { g.moveTo(lerp(tlt.x, trt.x, bi2 / nb), tlt.y + (bi2 % 2 ? tw0 : -tw0) / 2); g.lineTo(lerp(tlt.x, trt.x, (bi2 + 1) / nb), tlt.y + (bi2 % 2 ? -tw0 : tw0) / 2); } g.stroke();
        // Wings and valance
        [-1, 1].forEach(function (sd) {
          var wx0 = sd < 0 ? o.x0 - 0.2 : o.x1 - 0.7, wx1 = sd < 0 ? o.x0 + 0.7 : o.x1 + 0.2, wa = P(wx0, o.h, zF + 0.15), wb = P(wx1, o.truss - 0.3, zF + 0.15); if (!wa || !wb) return;
          var wgr = g.createLinearGradient(wa.x, 0, wb.x, 0); for (var wf = 0; wf <= 6; wf++) wgr.addColorStop(wf / 6, wf % 2 ? '#3d0d1a' : '#1a050b'); g.fillStyle = wgr; g.fillRect(wa.x, wb.y, wb.x - wa.x, wa.y - wb.y);
        });
        var va = P(o.x0 - 0.2, o.truss - 0.15, zF + 0.1), vb = P(o.x1 + 0.2, o.truss - 1.0, zF + 0.1);
        if (va && vb) {
          var vgr = g.createLinearGradient(0, va.y, 0, vb.y); vgr.addColorStop(0, '#1a050b'); vgr.addColorStop(1, '#4a1020'); g.fillStyle = vgr;
          var nsw = Math.max(4, Math.round((vb.x - va.x) / Math.max(30, va.s * 2.2))), swW = (vb.x - va.x) / nsw;
          g.beginPath(); g.moveTo(va.x, va.y); g.lineTo(vb.x, va.y); for (var sw3 = nsw; sw3 > 0; sw3--) { var sxr = va.x + sw3 * swW, sxl = sxr - swW; g.lineTo(sxr, vb.y - (vb.y - va.y) * 0.3); g.quadraticCurveTo((sxl + sxr) / 2, vb.y + (vb.y - va.y) * 0.25, sxl, vb.y - (vb.y - va.y) * 0.3); } g.closePath(); g.fill();
          g.strokeStyle = '#d6a64a'; g.lineWidth = Math.max(0.8, va.s * 0.04); g.beginPath(); for (var sw4 = 0; sw4 < nsw; sw4++) { var sl2 = va.x + sw4 * swW; g.moveTo(sl2, vb.y - (vb.y - va.y) * 0.3); g.quadraticCurveTo(sl2 + swW / 2, vb.y + (vb.y - va.y) * 0.25, sl2 + swW, vb.y - (vb.y - va.y) * 0.3); } g.stroke();
        }
        // Moving heads under the beam (up close you can see each fixture), par cans between them
        for (var pc = 0; pc < 10; pc++) {
          var u = (pc + 0.5) / 10, px = lerp(tlt.x, trt.x, u), py = lerp(tlt.y, trt.y, u) + tl.s * 0.3, col = 'rgb(' + TH.beams[pc % TH.beams.length] + ')';
          if (pc % 2 && tl.s > 14) { var fs2 = tl.s * 0.22, tilt = reduce ? 0 : Math.sin(t * (0.4 + TH.speed) + pc * 1.3) * 0.5; g.fillStyle = '#18161b'; g.fillRect(px - fs2 * 0.7, py - fs2 * 0.9, fs2 * 1.4, fs2 * 0.35); g.save(); g.translate(px, py); g.rotate(tilt); g.fillStyle = '#232027'; g.fillRect(-fs2 * 0.45, -fs2 * 0.5, fs2 * 0.9, fs2 * 1.1); g.restore(); glow(px + Math.sin(tilt) * fs2 * 0.6, py + fs2 * 0.5, Math.max(1.2, fs2 * 0.35), col, (0.7 + 0.3 * pulse) * bright); }
          else glow(px, py, Math.max(1, Math.min(3.5, tl.s * 0.2)), col, (0.6 + 0.4 * pulse) * bright);
        }
      }
      // Hung line arrays and subs on the ground, one pair each side
      [-1, 1].forEach(function (sd) {
        var x = sd * o.arrays, prev = null;
        for (var k = 0; k < 6; k++) {
          var y = o.truss - 1 - k * 0.62, zz = zF - 0.4 - k * k * 0.03;
          fillPoly([[x - 0.7, y - 0.55, zz], [x + 0.7, y - 0.55, zz], [x + 0.7, y, zz], [x - 0.7, y, zz]], '#0b0909');
          var gp = P(x, y - 0.28, zz - 0.01); if (gp) { g.fillStyle = 'rgba(255,255,255,.07)'; g.fillRect(gp.x - gp.s * 0.6, gp.y - gp.s * 0.12, gp.s * 1.2, gp.s * 0.24); }
        }
        var sx = sd * (o.x1 - 2.5);
        cabinet(sx - 0.4, 0, zF - 0.9, 0.78, 1.1); cabinet(sx + 0.4, 0, zF - 0.9, 0.78, 1.1); cabinet(sx, 1.1, zF - 0.9, 0.7, 0.55);
      });
      // Front edge of the stage: a line of bulbs, and marigold garlands swagged between them
      for (var fb = 0; fb <= 16; fb++) { var fp = P(lerp(o.x0, o.x1, fb / 16), o.h, zF - 0.02); if (fp) glow(fp.x, fp.y, Math.max(0.7, Math.min(2.2, fp.s * 0.07)), TH.bulbs[fb % TH.bulbs.length], (0.8 + 0.2 * pulse) * bright); }
      for (var sg = 0; sg < 8; sg++) {
        var ga0 = [lerp(o.x0, o.x1, sg / 8), o.h - 0.05, zF - 0.04], ga1 = [lerp(o.x0, o.x1, (sg + 1) / 8), o.h - 0.05, zF - 0.04], gp0 = P(ga0[0], ga0[1], ga0[2]); if (!gp0 || gp0.s < 6) continue;
        var gr2 = Math.max(0.9, gp0.s * 0.05);
        var gA = [], gB = [];
        for (var gk = 1; gk < 14; gk++) { var gq = sag(ga0, ga1, 0.35, gk / 14), gpp = P(gq[0], gq[1], gq[2]); if (gpp) (gk % 3 ? gA : gB).push([gpp.x, gpp.y]); }
        dotRow(gA, gr2, '#f29a2e'); dotRow(gB, gr2, '#f6c342');
        var tsl = P(ga1[0], ga1[1] - 0.45, ga1[2]), tsh = P(ga1[0], ga1[1], ga1[2]); if (tsl && tsh && sg < 7) { g.strokeStyle = '#f29a2e'; g.lineWidth = gr2 * 1.6; g.setLineDash([0.01, gr2 * 2.2]); g.lineCap = 'round'; g.beginPath(); g.moveTo(tsh.x, tsh.y); g.lineTo(tsl.x, tsl.y); g.stroke(); g.setLineDash([]); }
      }
      if (st.listener === 'stage') {
        // Cables snaking across the deck to the mic stands and the players
        g.strokeStyle = 'rgba(8,8,10,.9)';
        [-0.3, -0.12, 0.08, 0.22, 0.36].forEach(function (u, ci) {
          var a0 = P(u * (o.x1 - o.x0), o.h + 0.01, zF + 0.3), a1 = P(u * (o.x1 - o.x0) + (ci % 2 ? 0.9 : -0.7), o.h + 0.01, zF + 0.9), a2 = P(u * (o.x1 - o.x0) + (ci % 2 ? 0.3 : -0.2), o.h + 0.01, zB - 0.05);
          if (a0 && a1 && a2) { g.lineWidth = Math.max(1, a0.s * 0.02); g.beginPath(); g.moveTo(a0.x, a0.y); g.quadraticCurveTo(a1.x, a1.y, a2.x, a2.y); g.stroke(); }
        });
        // Up close: wedge monitors along the front of the deck, low haze rolling off it, and beams sweeping down from the truss
        [-0.18, 0.18, -0.36, 0.36].forEach(function (u) { var mx = u * (o.x1 - o.x0); fillPoly([[mx - 0.35, o.h, zF + 0.15], [mx + 0.35, o.h, zF + 0.15], [mx + 0.3, o.h + 0.32, zF + 0.4], [mx - 0.3, o.h + 0.32, zF + 0.4]], '#0c0a0a'); });
        if (st.on) {
          g.save(); g.globalCompositeOperation = 'lighter';
          for (var hz = 0; hz < 3; hz++) { var hp = P(Math.sin(t * 0.2 + hz * 2.1) * (o.x1 - o.x0) * 0.3, o.h + 0.3, zF + 0.2); if (hp) { var hr = hp.s * 3.2, hg = g.createRadialGradient(hp.x, hp.y, 1, hp.x, hp.y, hr); hg.addColorStop(0, 'rgba(' + TH.glowTint + ',' + 0.07 * bright + ')'); hg.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = hg; g.beginPath(); g.ellipse(hp.x, hp.y, hr, hr * 0.28, 0, 0, TAU); g.fill(); } }
          for (var bm = 0; bm < 6; bm++) {
            var bu = lerp(o.x0 + 1, o.x1 - 1, (bm + 0.5) / 6), sw2 = reduce ? 0 : Math.sin(t * (0.4 + TH.speed) + bm * 1.3) * 3.5;
            var src = P(bu, o.truss - 0.3, zF), d0 = P(bu + sw2 - 1, 0, zF - 5), d1 = P(bu + sw2 + 1, 0, zF - 5); if (!src || !d0 || !d1) continue;
            var bg = g.createLinearGradient(src.x, src.y, (d0.x + d1.x) / 2, d0.y), col = TH.beams[bm % TH.beams.length];
            bg.addColorStop(0, 'rgba(' + col + ',' + (0.16 + 0.1 * pulse) * bright + ')'); bg.addColorStop(1, 'rgba(' + col + ',0)');
            g.fillStyle = bg; g.beginPath(); g.moveTo(src.x, src.y); g.lineTo(d0.x, d0.y); g.lineTo(d1.x, d1.y); g.closePath(); g.fill();
          }
          g.restore();
        }
      }
      o.riserZ = zF + depth * 0.72; o.riserH = rH;
      bandOn(id, o.h, zF + 0.6, o);
    }
    // The big screen behind the band carries a live aerial shot of the ground, as if a drone were circling over
    // the garbo. When it's too small to read it shows a mandala that breathes with the beat instead.
    function screenPanel(x0, x1, y0, y1, z, t, id) {
      if (!poly([[x0, y0, z], [x1, y0, z], [x1, y1, z], [x0, y1, z]])) return;
      var a = P(x0, y0, z), b2 = P(x1, y0, z), tp = P(x0, y1, z), c = P((x0 + x1) / 2, (y0 + y1) / 2, z); if (!a || !b2 || !tp || !c) return;
      var rx = a.x, ry = tp.y, rw = b2.x - a.x, rh = a.y - tp.y;
      g.save(); g.clip();
      var drone = rh > 34 && rw > 60;
      if (drone) droneFeed(id, rx, ry, rw, rh, t);
      else {
        var lg = g.createLinearGradient(a.x, 0, b2.x, 0);
        TH.hues.forEach(function (hh, i) { lg.addColorStop(i / Math.max(1, TH.hues.length - 1), 'hsl(' + (hh + 15 * Math.sin(t * TH.speed + i)) + ',' + TH.sat + '%,' + (14 + 8 * bright) + '%)'); });
        g.fillStyle = lg; g.fillRect(a.x - 2, 0, b2.x - a.x + 4, H);
        // Mandala: petals and rings that open on each beat
        var R = Math.min(rw * 0.2, rh * 0.42) * (1 + 0.08 * pulse), rot = reduce ? 0 : t * 0.15 * TH.speed / 0.3, my = c.y + rh * 0.06;
        g.strokeStyle = 'rgba(255,236,200,' + (0.35 + 0.35 * pulse) * bright + ')'; g.lineWidth = Math.max(0.8, R * 0.03);
        for (var ring = 1; ring <= 3; ring++) { g.beginPath(); g.arc(c.x, my, R * ring / 3, 0, TAU); g.stroke(); }
        for (var pt = 0; pt < 12; pt++) { var an = rot + pt / 12 * TAU; g.beginPath(); g.ellipse(c.x + Math.cos(an) * R * 0.62, my + Math.sin(an) * R * 0.62, R * 0.3, R * 0.1, an, 0, TAU); g.stroke(); }
      }
      // The panel's LED grid, then the name across the top
      // A faint LED grid: enough to read as a screen, light enough that the drone shot's detail comes through
      if (rh > 24) { g.fillStyle = ledGrid() || 'rgba(0,0,0,0)'; g.globalAlpha = drone ? 0.16 : 0.4; g.fillRect(rx, ry, rw, rh); g.globalAlpha = 1; }
      // No name on the screen: just a small drone-feed tag in its bottom right corner, its light blinking
      var fs = Math.min(W < 700 ? 26 : 32, rh * 0.15, rw * 0.075);
      if (fs >= 7) {
        if (drone && rw > 150) {
          var tf = Math.max(6.5, Math.min(10, fs * 0.34));
          g.font = '600 ' + tf.toFixed(1) + 'px system-ui, sans-serif'; g.textBaseline = 'middle'; g.textAlign = 'center';
          try { g.letterSpacing = tf * 0.12 + 'px'; } catch (e) { /* older canvas */ }
          var tw0 = g.measureText('DRONE').width, cx0 = Math.min(rx + rw, W) - tw0 / 2 - tf * 1.1, ty0 = Math.min(ry + rh, H) - tf * 1.3;
          if (reduce || (t % 1.2) < 0.8) { g.fillStyle = '#e0473b'; g.beginPath(); g.arc(cx0 - tw0 / 2 - tf * 0.7, ty0, tf * 0.3, 0, TAU); g.fill(); }
          g.fillStyle = 'rgba(246,236,215,.72)'; g.fillText('DRONE', cx0, ty0);
          try { g.letterSpacing = '0px'; } catch (e) { /* older canvas */ }
        }
      }
      g.restore();
    }
    var ledPat = null;
    function ledGrid() {
      if (ledPat === null) {
        try { var cv = document.createElement('canvas'); cv.width = cv.height = 3; var c2 = cv.getContext('2d'); c2.fillStyle = 'rgba(0,0,0,.55)'; c2.fillRect(2, 0, 1, 3); c2.fillRect(0, 2, 3, 1); ledPat = g.createPattern(cv, 'repeat'); } catch (e) { ledPat = false; }
      }
      return ledPat || null;
    }
    // The drone feed is drawn into its own image, at up to 20 frames a second and a little under full
    // resolution, the way an LED wall shows a video: it looks the same and costs a fraction as much
    var feed = { cv: null, t: -1, key: '' };
    function droneFeed(id, rx, ry, rw, rh, t) {
      var q = Math.min(DPR, 1.5) * (QP >= 1 ? 1 : 0.75), fw = Math.max(1, Math.round(rw * q)), fh = Math.max(1, Math.round(rh * q)), key = id + ':' + fw + 'x' + fh;
      if (!feed.cv) feed.cv = document.createElement('canvas');
      if (feed.key !== key || t - feed.t >= 0.05 || t < feed.t || reduce) {
        if (feed.cv.width !== fw || feed.cv.height !== fh) { feed.cv.width = fw; feed.cv.height = fh; }
        var live = g, fg = feed.cv.getContext('2d'); fg.setTransform(q, 0, 0, q, 0, 0); fg.clearRect(0, 0, rw, rh);
        g = fg;
        try { aerial(id, 0, 0, rw, rh, t); } finally { g = live; }
        feed.t = t; feed.key = key;
      }
      g.drawImage(feed.cv, rx, ry, rw, rh);
    }
    // A quiet sequence of overhead drone shots. It follows the same people as the ground scene,
    // but lets their movement make the gathering readable instead of drawing its circles for them.
    /* ---------- the drone ----------
       One drone films the night for the stage screen. Its shots run one after another, each flying in from where
       the last ended: the whole ground, sideways passes across the ring, a child running through, one dancer
       spinning while her neighbours clap, the couple marked you and yours, and a tilted fly-over. Each place has its
       own airspace: high sweeping passes outdoors, low under the shamiana indoors, and between the houses along the
       lane in the sheri. The same shot places the drone itself in the sky, lights blinking, so you can see it filming. */
    var DRONE_AIR = { outdoors: { lo: 8.5, hi: 11.5, k: 4, back: 16, dir: [0.3, 0.95] }, stadium: { lo: 7.4, hi: 9.2, k: 3, back: 14, dir: [0.25, 0.97] }, sheri: { lo: 6.8, hi: 9, k: 3, back: 11, dir: [0, 1] } };
    function shotAt(id, t) {
      var L = layout(id), c0 = L.circles[0], ctr = circleCentre(c0, T), sheri = id === 'sheri';
      var groups = L.circles.filter(function (c) { return !c.small && !c.parent && c.shown; });
      groups.sort(function (a, b) { return a.z0 - b.z0; });
      var near = groups[1] || c0, far = groups[2] || groups[groups.length - 1] || c0;
      var nearAt = circleCentre(near, T), farAt = circleCentre(far, T);
      var you = null; c0.dancers.forEach(function (d) { if (d.coupleRole === 'w' && d.wx != null) you = d; });
      var runner = null; L.kids.forEach(function (kd) { if (!runner && kd.through && kd.moving) runner = kd; });
      if (!runner) runner = L.kids.filter(function (kd) { return kd.moving; })[0] || L.kids[0];
      // Somebody in the ring to watch closely: a different dancer each time round
      var cycle = Math.floor(t / 60), star = c0.dancers[(7 + cycle * 11) % c0.dancers.length];
      if (star && star.coupleRole) star = c0.dancers[(9 + cycle * 11) % c0.dancers.length];
      var R0 = c0.R + 1.5, span0 = sheri ? 20 : 30;
      var SHOTS = sheri ? [
        { dur: 9, at: function () { return { x: ctr.x, z: ctr.z, zoom: 1.2, tilt: 0.1, spin: 0 }; } },
        // Along the lane, which reads as sideways on the screen
        { dur: 8, at: function (u) { return { x: ctr.x, z: lerp(ctr.z - 9, ctr.z + 11, u), zoom: 2.4, tilt: 0.3, spin: 0 }; } },
        { dur: 7, at: function () { return star && star.wx != null ? { x: star.wx, z: star.wz, zoom: 3.8, tilt: 0.2, spin: 0.05, star: star } : { x: ctr.x, z: ctr.z, zoom: 2.4, tilt: 0.2, spin: 0.05 }; } },
        { dur: 7, at: function (u) { return you ? { x: you.wx, z: you.wz, zoom: 3.4 - 0.4 * u, tilt: 0.3, spin: 0.03 } : { x: ctr.x, z: ctr.z, zoom: 1.6, tilt: 0.2, spin: 0.03 }; } },
        { dur: 8, at: function () { return runner ? { x: runner.x, z: runner.z, zoom: 3, tilt: 0.25, spin: 0.02 } : { x: nearAt.x, z: nearAt.z, zoom: 1.3, tilt: 0, spin: 0.02 }; } }
      ] : [
        { dur: 9, at: function () { return { x: ctr.x, z: ctr.z, zoom: 1.3, tilt: 0.1, spin: 0.012 }; } },
        // A slow sideways pass across the ring round the garbo, then back across the next ring the other way
        { dur: 8, at: function (u) { return { x: lerp(ctr.x - R0, ctr.x + R0, ease(u)), z: ctr.z - 1, zoom: 2.4, tilt: 0.35, spin: 0 }; } },
        { dur: 7, at: function () { return star && star.wx != null ? { x: star.wx, z: star.wz, zoom: 3.8, tilt: 0.25, spin: 0.04, star: star } : { x: ctr.x, z: ctr.z, zoom: 2.4, tilt: 0.3, spin: 0.04 }; } },
        { dur: 8, at: function () { return runner ? { x: runner.x, z: runner.z, zoom: 3, tilt: 0.25, spin: 0.02 } : { x: nearAt.x, z: nearAt.z, zoom: 1.3, tilt: 0, spin: 0.02 }; } },
        { dur: 8, at: function (u) { return { x: lerp(nearAt.x + near.R + 2, nearAt.x - near.R - 2, ease(u)), z: nearAt.z, zoom: 2.2, tilt: 0.3, spin: 0 }; } },
        { dur: 7, at: function (u) { return you ? { x: you.wx, z: you.wz, zoom: 3.4 - 0.4 * u, tilt: 0.3, spin: 0.03 } : { x: ctr.x, z: ctr.z, zoom: 1.6, tilt: 0.2, spin: 0.03 }; } },
        { dur: 9, at: function (u) { return { x: lerp(nearAt.x, farAt.x, u), z: lerp(nearAt.z, farAt.z, u), zoom: 1.45, tilt: 0.6, spin: 0.015 }; } }
      ];
      var total = SHOTS.reduce(function (n, sh) { return n + sh.dur; }, 0), tc = reduce ? 0 : t % total, si = 0;
      while (si < SHOTS.length - 1 && tc >= SHOTS[si].dur) { tc -= SHOTS[si].dur; si++; }
      var cur = SHOTS[si].at(tc / SHOTS[si].dur);
      // Each new shot flies over from where the last one ended
      var fly = reduce ? 1 : ease(Math.min(1, tc / 1.8));
      if (fly < 1) { var prevS = SHOTS[(si + SHOTS.length - 1) % SHOTS.length], was = prevS.at(1); ['x', 'z', 'zoom', 'tilt'].forEach(function (key) { cur[key] = lerp(was[key], cur[key], fly); }); }
      // The dancer being watched spins every couple of seconds, and her neighbours clap for her
      if (cur.star && st.on && !reduce && fly >= 1 && T - (cur.star.cuteAt || 0) > 1.9) {
        cur.star.cuteAt = T; cur.star.twirl = 1; cur.star.flash = 1;
        var si0 = c0.dancers.indexOf(cur.star);
        [-1, 1].forEach(function (o) { var nb = c0.dancers[(si0 + o + c0.dancers.length) % c0.dancers.length]; if (nb && !nb.coupleRole) nb.clapAt = clock() + 0.25; });
      }
      var rot = sheri ? Math.PI / 2 : 0.4;
      if (!reduce) rot += 0.075 * Math.sin(t * 0.12) + t * cur.spin;
      var fz = cur.z; if (!reduce && sheri && !cur.star) fz += 1.2 * Math.sin(t * 0.09);
      return { x: cur.x, z: fz, zoom: cur.zoom, tilt: cur.tilt, rot: rot, span: span0 / cur.zoom, sheri: sheri, ctr: ctr, c0: c0 };
    }
    // Where the drone is in the world: above what it films, higher for a wide shot, set back for a tilted one
    function dronePos(id, t) {
      // It stands off beyond what it films, on the far side from the crowd you're in, long lens angled down at it
      var sh = shotAt(id, t), air = DRONE_AIR[id] || DRONE_AIR.outdoors, alt = Math.max(air.lo, Math.min(air.hi, air.lo + air.k / sh.zoom));
      var back = air.back * (0.8 + 0.4 * sh.tilt), x = sh.x + air.dir[0] * back, z = sh.z + air.dir[1] * back;
      if (id === 'sheri') x = Math.max(-5.5, Math.min(5.5, x));
      if (!reduce) { x += 0.25 * Math.sin(t * 0.9); alt += 0.18 * Math.sin(t * 1.3 + 1); }
      return { x: x, y: alt, z: z };
    }
    function droneInSky(t) {
      var dp = dronePos(st.venue, t), p = P(dp.x, dp.y, dp.z); if (!p || p.z < 1.5 || p.x < -40 || p.x > W + 40 || p.y < -40 || p.y > H) return;
      var sz = Math.max(15, Math.min(52, p.s * 1.25)), ph = t % 1, blink = reduce ? 1 : (ph < 0.08 || (ph > 0.18 && ph < 0.26)) ? 1 : 0, strobe = reduce ? 0 : (t % 1.6) < 0.05 ? 1 : 0;
      var tiltX = reduce ? 0 : Math.sin(t * 0.9) * 0.08;
      g.save(); g.translate(p.x, p.y); g.rotate(tiltX);
      // Warm light from the ground catching its underside
      var ug = g.createRadialGradient(0, sz * 0.15, 1, 0, sz * 0.15, sz * 0.9); ug.addColorStop(0, 'rgba(255,190,120,' + 0.22 * bright + ')'); ug.addColorStop(1, 'rgba(255,190,120,0)'); g.fillStyle = ug; g.beginPath(); g.arc(0, sz * 0.15, sz * 0.9, 0, TAU); g.fill();
      // Arms in an X, rotors as spinning discs with a bright rim, the body, the gimbal camera and landing legs
      g.strokeStyle = '#4a4552'; g.lineWidth = Math.max(1.2, sz * 0.08); g.lineCap = 'round';
      g.beginPath(); g.moveTo(-sz * 0.5, -sz * 0.1); g.lineTo(sz * 0.5, sz * 0.1); g.moveTo(sz * 0.5, -sz * 0.1); g.lineTo(-sz * 0.5, sz * 0.1); g.stroke();
      [[-0.5, -0.1], [0.5, -0.1], [-0.5, 0.1], [0.5, 0.1]].forEach(function (r, k) {
        var rx0 = r[0] * sz, ry0 = r[1] * sz - sz * 0.06;
        g.fillStyle = 'rgba(230,235,245,.28)'; g.beginPath(); g.ellipse(rx0, ry0, sz * 0.27, sz * 0.07, 0, 0, TAU); g.fill();
        g.strokeStyle = 'rgba(240,244,255,.45)'; g.lineWidth = Math.max(0.6, sz * 0.02); g.stroke();
        if (!reduce) { var bl = t * 40 + k; g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = Math.max(0.6, sz * 0.025); g.beginPath(); g.moveTo(rx0 - Math.cos(bl) * sz * 0.25, ry0 - Math.sin(bl) * sz * 0.06); g.lineTo(rx0 + Math.cos(bl) * sz * 0.25, ry0 + Math.sin(bl) * sz * 0.06); g.stroke(); }
      });
      var bgr = g.createLinearGradient(0, -sz * 0.1, 0, sz * 0.12); bgr.addColorStop(0, '#5a5563'); bgr.addColorStop(1, '#2a2730');
      g.fillStyle = bgr; g.beginPath(); g.ellipse(0, 0, sz * 0.22, sz * 0.1, 0, 0, TAU); g.fill();
      g.fillStyle = '#111014'; g.beginPath(); g.arc(0, sz * 0.14, sz * 0.065, 0, TAU); g.fill();
      g.fillStyle = 'rgba(160,200,255,.8)'; g.beginPath(); g.arc(sz * 0.02, sz * 0.14, sz * 0.025, 0, TAU); g.fill();
      g.strokeStyle = '#3a3640'; g.lineWidth = Math.max(0.8, sz * 0.03); g.beginPath(); g.moveTo(-sz * 0.14, sz * 0.08); g.lineTo(-sz * 0.2, sz * 0.22); g.lineTo(-sz * 0.08, sz * 0.22); g.moveTo(sz * 0.14, sz * 0.08); g.lineTo(sz * 0.2, sz * 0.22); g.lineTo(sz * 0.08, sz * 0.22); g.stroke();
      g.restore();
      // Lights: green and red on the arms, a steady white at the front, the red beacon's double blink, the strobe
      glow(p.x - sz * 0.5, p.y, Math.max(2, sz * 0.12), '#6dff9a', 0.95);
      glow(p.x + sz * 0.5, p.y, Math.max(2, sz * 0.12), '#ff5a4a', 0.95);
      glow(p.x, p.y + sz * 0.02, Math.max(1.6, sz * 0.08), '#ffffff', 0.7);
      if (blink) glow(p.x, p.y - sz * 0.1, Math.max(3, sz * 0.24), '#ff3b30', 1);
      if (strobe) glow(p.x, p.y + sz * 0.05, Math.max(4, sz * 0.45), '#ffffff', 0.85);
    }
    function aerial(id, rx, ry, rw, rh, t) {
      var sh = shotAt(id, t), L = layout(id), c0 = sh.c0, ctr = sh.ctr, sheri = sh.sheri, span = sh.span, tilt = sh.tilt, rot = sh.rot, fx = sh.x, fz = sh.z;
      var k = rh / span, cx = rx + rw / 2, cy = ry + rh * 0.56, cr = Math.cos(rot), sr = Math.sin(rot);
      // A tilted shot looks across the ground: depth squeezes, and the near side opens out a little
      function M(x, z) { var dx = x - fx, dz = z - fz, u = (dx * cr - dz * sr) * k, v = (dx * sr + dz * cr) * k, pf = 1 - tilt * 0.3 * Math.max(-1, Math.min(1, v / (rh * 0.6))); return [cx + u * pf, cy - v * (1 - tilt * 0.45)]; }
      function quad(pts, col) { g.fillStyle = col; g.beginPath(); pts.forEach(function (q, i) { var m = M(q[0], q[1]); if (i) g.lineTo(m[0], m[1]); else g.moveTo(m[0], m[1]); }); g.closePath(); g.fill(); }
      // Ground, and the venue around it
      g.fillStyle = id === 'stadium' ? '#3b2717' : sheri ? '#2a2430' : '#2b1e14'; g.fillRect(rx, ry, rw, rh);
      if (id === 'outdoors') {
        quad([[-60, -60], [60, -60], [60, 90], [-60, 90]], '#1d2616'); quad([[-27, -8], [27, -8], [27, 44], [-27, 44]], '#3a2a1b');
        L.trees.forEach(function (tr) { var m = M(tr.x, tr.z); g.fillStyle = '#16301b'; g.beginPath(); g.arc(m[0], m[1], 2.2 * k, 0, TAU); g.fill(); });
      } else if (id === 'stadium') {
        quad([[-34, -46], [34, -46], [34, 54], [-34, 54]], '#231b2b');
        for (var r0 = 0; r0 < 8; r0++) { var e = 25 + r0 * 1.5; g.strokeStyle = r0 % 2 ? 'rgba(90,70,110,.8)' : 'rgba(60,48,76,.8)'; g.lineWidth = Math.max(1, 1.2 * k); g.beginPath(); var q0 = M(-e, -34), q1 = M(-e, 42 + r0 * 1.5), q2 = M(e, 42 + r0 * 1.5), q3 = M(e, -34); g.moveTo(q0[0], q0[1]); g.lineTo(q1[0], q1[1]); g.lineTo(q2[0], q2[1]); g.lineTo(q3[0], q3[1]); g.stroke(); }
        quad([[-24.8, -34], [24.8, -34], [24.8, 41.8], [-24.8, 41.8]], '#4a3120');
      } else {
        quad([[-7.2, -40], [7.2, -40], [7.2, 90], [-7.2, 90]], '#3a3340');
        L.houses.forEach(function (h) { var X = h.side * 8, X2 = h.side * 16; quad([[X, h.z1], [X2, h.z1], [X2, h.z2], [X, h.z2]], h.col); quad([[X, h.z1], [X + h.side * 0.5, h.z1], [X + h.side * 0.5, h.z2], [X, h.z2]], 'rgba(0,0,0,.35)'); });
      }
      // Stage and stalls as rooftops
      var sz = { outdoors: [46, -11, 11], stadium: [35.5, -8, 8], sheri: [63.9, -3.4, 3.4] }[id];
      quad([[sz[1], sz[0]], [sz[2], sz[0]], [sz[2], sz[0] + 2.2], [sz[1], sz[0] + 2.2]], '#161016');
      L.stalls.forEach(function (sl) { var hw = sl.w / 2, dp = sl.depth; quad([[sl.x - sl.U[0] * hw, sl.z - sl.U[1] * hw], [sl.x + sl.U[0] * hw, sl.z + sl.U[1] * hw], [sl.x + sl.U[0] * hw + sl.V[0] * dp, sl.z + sl.U[1] * hw + sl.V[1] * dp], [sl.x - sl.U[0] * hw + sl.V[0] * dp, sl.z - sl.U[1] * hw + sl.V[1] * dp]], sl.col); });
      // Keep the lamp and rangoli as a warm anchor while the camera drifts through the crowd.
      var mc = M(ctr.x, ctr.z), lit = st.lit != null ? st.lit : st.on ? 1 : 0.35, pr = (c0.R + 1) * k;
      var gl = g.createRadialGradient(mc[0], mc[1], 1, mc[0], mc[1], pr * 1.3); gl.addColorStop(0, 'rgba(255,190,110,' + (0.22 * lit + 0.1 * pulse) + ')'); gl.addColorStop(1, 'rgba(255,190,110,0)');
      g.fillStyle = gl; g.beginPath(); g.arc(mc[0], mc[1], pr * 1.3, 0, TAU); g.fill();
      for (var pe = 0; pe < 16; pe++) { var an = rot + pe / 16 * TAU; g.fillStyle = 'hsl(' + TH.hues[pe % TH.hues.length] + ',' + TH.sat + '%,' + (40 + 10 * bright) + '%)'; g.beginPath(); g.ellipse(mc[0] + Math.cos(an) * 1.5 * k, mc[1] + Math.sin(an) * 1.5 * k, 0.9 * k, 0.32 * k, an, 0, TAU); g.fill(); }
      glow(mc[0], mc[1], Math.max(2, 0.7 * k), '#ffcf7a', 0.9 * lit + 0.1);
      // People from above. Far off they're a skirt and a head; closer in, each is a person seen from the drone:
      // her chaniya flared round her (wider and swirling on a twirl) with a gold hem and pleats, his kediyu's flare,
      // shoulders, an odhni trailing down her back, a bun with a gajra or a wound safa with its tail, and arms that
      // swing with the step, meet in a clap on the beat, go up on a cheer, or strike dandiya towards a neighbour.
      var dr = Math.max(1.4, 0.52 * k), sticks = st.style === 'dandiya', bs0 = Math.sin(BEAT * Math.PI);
      function heading(x, z, hx, hz) { var a = M(x, z), b = M(x + hx * 0.4, z + hz * 0.4); return Math.atan2(b[1] - a[1], b[0] - a[0]); }
      function person2(x, z, d, rr, hx, hz, moving) {
        var m = M(x, z); if (m[0] < rx - rr * 2 || m[0] > rx + rw + rr * 2 || m[1] < ry - rr * 2 || m[1] > ry + rh + rr * 2) return;
        var fl = d.flash || 0, turn = d.twirl || 0, woman = !d.man, col = d.col || '#c0392b', top = d.top || col, head = woman ? (d.older ? '#9a948c' : '#1f130d') : (d.older ? '#f3e6d0' : d.pagdi || '#b8312b');
        if (rr < 4) {
          // Too small for detail: the old wedge and head, with the clap flash
          g.save(); g.translate(m[0], m[1]); g.fillStyle = col; g.beginPath(); g.moveTo(-rr * 0.42, -rr * 0.38); g.quadraticCurveTo(0, -rr * 0.62, rr * 0.42, -rr * 0.38); g.lineTo(rr * 0.72, rr * 0.72); g.quadraticCurveTo(0, rr * 1.02, -rr * 0.72, rr * 0.72); g.closePath(); g.fill();
          g.fillStyle = head; g.beginPath(); g.arc(0, -rr * 0.62, rr * 0.3, 0, TAU); g.fill(); g.restore();
          if (fl > 0.3) glow(m[0], m[1], rr * 1.4, '#fff0d0', fl * 0.8);
          return;
        }
        var ang = heading(x, z, hx, hz), sw = moving ? Math.sin(d.step || T * 6) : st.on && !reduce ? Math.sin(BEAT * Math.PI + (d.ph || 0)) : 0;
        g.save(); g.translate(m[0], m[1]); g.rotate(ang);
        if (rr < 7) {
          // Mid-distance: the skirt or flare, shoulders, arms that swing, clap and cheer, and the head; no shading
          var sr1 = woman ? rr * (0.82 + 0.45 * turn) : rr * 0.6;
          g.fillStyle = woman ? col : top; g.beginPath(); g.arc(-rr * 0.05, 0, sr1, 0, TAU); g.fill();
          if (woman) { g.strokeStyle = '#e8b04b'; g.lineWidth = Math.max(0.6, rr * 0.09); g.stroke(); }
          g.fillStyle = top; g.beginPath(); g.ellipse(0, 0, rr * 0.24, rr * 0.44, 0, 0, TAU); g.fill();
          var cl1 = fl > 0.35, hx1 = cl1 && !sticks ? rr * 0.72 : fl > 0.35 ? rr * 0.5 : rr * (0.35 + 0.28 * sw), hy1 = cl1 && !sticks ? rr * 0.06 : fl > 0.35 ? rr * 0.62 : rr * 0.78;
          g.strokeStyle = SKIN[Math.floor((d.ph || 0) * 10) % SKIN.length]; g.lineCap = 'round'; g.lineWidth = Math.max(0.8, rr * 0.16);
          g.beginPath(); g.moveTo(0, -rr * 0.4); g.lineTo(hx1, -hy1); g.moveTo(0, rr * 0.4); g.lineTo(cl1 && !sticks ? hx1 : rr * (0.35 - 0.28 * sw), hy1); g.stroke();
          g.fillStyle = head; g.beginPath(); g.arc(rr * 0.03, 0, rr * (woman ? 0.24 : 0.26), 0, TAU); g.fill();
          if (woman) { g.beginPath(); g.arc(-rr * 0.22, 0, rr * 0.13, 0, TAU); g.fill(); }
          g.restore();
          if (fl > 0.3) glow(m[0] + Math.cos(ang) * rr * 0.5, m[1] + Math.sin(ang) * rr * 0.5, rr * 0.6, '#fff0d0', fl * 0.7);
          return;
        }
        // Shadow cast forward-right by the lamp at the centre
        g.fillStyle = 'rgba(0,0,0,.28)'; g.beginPath(); g.ellipse(-rr * 0.1, rr * 0.18, rr * 0.95, rr * 0.8, 0, 0, TAU); g.fill();
        // Skirt or kediyu flare, from above: a disc with pleats fanning out, the hem in gold; a twirl widens and swirls it
        var sr = woman ? rr * (0.82 + 0.45 * turn) : rr * 0.6, sgr = g.createRadialGradient(0, 0, sr * 0.15, 0, 0, sr);
        sgr.addColorStop(0, shade(col, -0.25)); sgr.addColorStop(0.6, col); sgr.addColorStop(1, shade(col, 0.12));
        g.fillStyle = woman ? sgr : shade(top, -0.1); g.beginPath(); g.arc(-rr * 0.05, 0, sr, 0, TAU); g.fill();
        g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = Math.max(0.5, rr * 0.04); g.stroke();
        if (woman) {
          g.strokeStyle = 'rgba(0,0,0,.22)'; g.lineWidth = Math.max(0.5, rr * 0.04);
          var swirl = turn * 0.9 + (reduce ? 0 : 0.08 * sw);
          g.beginPath(); for (var pl = 0; pl < 12; pl++) { var a0 = pl / 12 * TAU; g.moveTo(-rr * 0.05 + Math.cos(a0) * sr * 0.2, Math.sin(a0) * sr * 0.2); g.quadraticCurveTo(-rr * 0.05 + Math.cos(a0 + swirl * 0.5) * sr * 0.6, Math.sin(a0 + swirl * 0.5) * sr * 0.6, -rr * 0.05 + Math.cos(a0 + swirl) * sr, Math.sin(a0 + swirl) * sr); } g.stroke();
          g.strokeStyle = '#e8b04b'; g.lineWidth = Math.max(0.7, rr * 0.09); g.beginPath(); g.arc(-rr * 0.05, 0, sr * 0.93, 0, TAU); g.stroke();
          if (rr > 7) { g.fillStyle = 'rgba(235,245,255,.8)'; for (var mw = 0; mw < 10; mw++) { var am = mw / 10 * TAU + swirl; g.beginPath(); g.arc(-rr * 0.05 + Math.cos(am) * sr * 0.8, Math.sin(am) * sr * 0.8, Math.max(0.5, rr * 0.035), 0, TAU); g.fill(); } }
        } else { g.strokeStyle = '#e8b04b'; g.lineWidth = Math.max(0.6, rr * 0.06); g.beginPath(); g.arc(-rr * 0.05, 0, sr * 0.95, 0, TAU); g.stroke(); }
        // Shoulders: choli or kediyu across the back
        g.fillStyle = top; g.beginPath(); g.ellipse(0, 0, rr * 0.24, rr * 0.44, 0, 0, TAU); g.fill();
        if (!woman && d.stole) { g.strokeStyle = d.stole; g.lineWidth = Math.max(0.6, rr * 0.08); g.beginPath(); g.moveTo(rr * 0.12, -rr * 0.38); g.lineTo(-rr * 0.14, rr * 0.36); g.stroke(); }
        // Her odhni over one shoulder, trailing behind her as she moves
        if (woman) { var trail = reduce ? 0 : Math.sin(T * 2 + (d.ph || 0)) * rr * 0.08; g.fillStyle = d.odhni || top; g.globalAlpha = 0.85; g.beginPath(); g.moveTo(rr * 0.05, -rr * 0.42); g.quadraticCurveTo(-rr * 0.35, -rr * 0.3 + trail, -rr * 0.75, -rr * 0.15 + trail); g.lineTo(-rr * 0.7, rr * 0.05 + trail); g.quadraticCurveTo(-rr * 0.3, -rr * 0.08, rr * 0.02, -rr * 0.18); g.closePath(); g.fill(); g.globalAlpha = 1; }
        // Arms: from the shoulders to the hands
        var skin = SKIN[Math.floor((d.ph || 0) * 10) % SKIN.length], LS = [0.02 * rr, -0.4 * rr], RS = [0.02 * rr, 0.4 * rr], handL, handR;
        // Hands reach past the skirt so the movement reads from above: a clap meets in front, a cheer goes up and out,
        // a twirl throws the arms wide, and between beats they swing forward and back with the step
        if (fl > 0.35 && !sticks) { handL = [rr * 0.72, -rr * 0.06]; handR = [rr * 0.72, rr * 0.06]; }
        else if (fl > 0.35 || d.cheer) { handL = [rr * 0.5, -rr * 0.62]; handR = [rr * 0.5, rr * 0.62]; }
        else if (turn > 0.3) { handL = [rr * 0.1, -rr * 1.15]; handR = [rr * 0.1, rr * 1.15]; }
        else { handL = [rr * (0.35 + 0.28 * sw), -rr * 0.78]; handR = [rr * (0.35 - 0.28 * sw), rr * 0.78]; }
        if (sticks && d.strikeDir && fl > 0.35) { var sd = d.strikeDir; handL = [rr * 0.45, sd * rr * 0.35]; handR = [rr * 0.3, sd * rr * 0.55]; }
        // An elbow in each arm, so it bends instead of sticking out straight
        var eL = [lerp(LS[0], handL[0], 0.5) - rr * 0.08, lerp(LS[1], handL[1], 0.5) - rr * 0.1], eR = [lerp(RS[0], handR[0], 0.5) - rr * 0.08, lerp(RS[1], handR[1], 0.5) + rr * 0.1];
        g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineCap = 'round'; g.lineJoin = 'round'; g.lineWidth = Math.max(1.1, rr * 0.2);
        g.beginPath(); g.moveTo(LS[0], LS[1]); g.lineTo(eL[0], eL[1]); g.lineTo(handL[0], handL[1]); g.moveTo(RS[0], RS[1]); g.lineTo(eR[0], eR[1]); g.lineTo(handR[0], handR[1]); g.stroke();
        g.strokeStyle = skin; g.lineWidth = Math.max(0.9, rr * 0.15); g.stroke();
        if (woman && rr > 6) { g.strokeStyle = '#e8b04b'; g.lineWidth = Math.max(0.5, rr * 0.05); g.beginPath(); g.moveTo(lerp(LS[0], handL[0], 0.75), lerp(LS[1], handL[1], 0.75)); g.lineTo(lerp(LS[0], handL[0], 0.85), lerp(LS[1], handL[1], 0.85)); g.moveTo(lerp(RS[0], handR[0], 0.75), lerp(RS[1], handR[1], 0.75)); g.lineTo(lerp(RS[0], handR[0], 0.85), lerp(RS[1], handR[1], 0.85)); g.stroke(); }
        g.fillStyle = skin; g.beginPath(); g.arc(handL[0], handL[1], rr * 0.11, 0, TAU); g.moveTo(handR[0] + rr * 0.11, handR[1]); g.arc(handR[0], handR[1], rr * 0.11, 0, TAU); g.fill();
        if (sticks) {
          // A dandiya in each hand, held out; on the beat they cross towards the neighbour
          var st0 = STICKS[(d.stick || 0) % STICKS.length], sl = rr * 0.62;
          [[handL, -1], [handR, 1]].forEach(function (hs) { var hd = hs[0], a1 = fl > 0.35 && d.strikeDir ? d.strikeDir * 1.1 + hs[1] * 0.25 : hs[1] * 0.7 - 0.25 * sw; g.strokeStyle = st0.bands[0]; g.lineWidth = Math.max(0.7, rr * 0.07); g.beginPath(); g.moveTo(hd[0] - Math.cos(a1) * sl * 0.2, hd[1] - Math.sin(a1) * sl * 0.2); g.lineTo(hd[0] + Math.cos(a1) * sl, hd[1] + Math.sin(a1) * sl); g.stroke(); g.fillStyle = st0.ends; g.beginPath(); g.arc(hd[0] + Math.cos(a1) * sl, hd[1] + Math.sin(a1) * sl, Math.max(0.6, rr * 0.06), 0, TAU); g.fill(); });
        }
        // Head: her hair with the bun at the back and a ring of jasmine, or his safa, wound, with the tail behind
        var hr = rr * 0.24;
        if (woman) {
          g.fillStyle = head; g.beginPath(); g.arc(rr * 0.03, 0, hr, 0, TAU); g.fill(); g.beginPath(); g.arc(-hr * 0.9, 0, hr * 0.55, 0, TAU); g.fill();
          if (rr > 6) { g.fillStyle = '#fffaf0'; for (var gj = 0; gj < 8; gj++) { var ag = gj / 8 * TAU; g.beginPath(); g.arc(-hr * 0.9 + Math.cos(ag) * hr * 0.62, Math.sin(ag) * hr * 0.62, Math.max(0.4, rr * 0.03), 0, TAU); g.fill(); } g.strokeStyle = 'rgba(255,255,255,.18)'; g.lineWidth = Math.max(0.4, rr * 0.02); g.beginPath(); g.moveTo(hr * 1.0, 0); g.lineTo(-hr * 0.3, 0); g.stroke(); }
        } else {
          g.fillStyle = head; g.beginPath(); g.arc(rr * 0.03, 0, hr * 1.1, 0, TAU); g.fill();
          if (rr > 6) { g.strokeStyle = shade(head, -0.3); g.lineWidth = Math.max(0.4, rr * 0.025); for (var wf = 1; wf <= 3; wf++) { g.beginPath(); g.arc(rr * 0.03, 0, hr * 1.1 * wf / 3.4, 0.3 * wf, 0.3 * wf + 4.2); g.stroke(); } g.strokeStyle = head; g.lineWidth = Math.max(0.6, rr * 0.08); g.beginPath(); g.moveTo(-hr, 0); g.quadraticCurveTo(-hr * 1.8, hr * 0.3, -hr * 2.4, hr * 0.1 + (reduce ? 0 : Math.sin(T * 2.2 + (d.ph || 0)) * hr * 0.2)); g.stroke(); }
        }
        g.restore();
        if (fl > 0.3) glow(m[0] + Math.cos(ang) * rr * 0.5, m[1] + Math.sin(ang) * rr * 0.5, rr * 0.6, '#fff0d0', fl * 0.7);
      }
      L.circles.forEach(function (c) { if (!c.shown) return; var cc = circleCentre(c, T), dir = c.w >= 0 ? 1 : -1; c.dancers.forEach(function (d) { if (d.wx == null) return; var ax = d.wx - cc.x, az = d.wz - cc.z, al = Math.hypot(ax, az) || 1; person2(d.wx, d.wz, d, d.man ? dr * 1.05 : dr * 1.1, -az / al * dir, ax / al * dir, false); }); });
      var sm = dr * 0.9, ctrAt = ctr;
      function towardCentre(p) { var hx = ctrAt.x - p.x, hz = ctrAt.z - p.z, hl = Math.hypot(hx, hz) || 1; return [hx / hl, hz / hl]; }
      L.standers.forEach(function (p) { var f = towardCentre(p); person2(p.x, p.z, p, sm, f[0], f[1], false); });
      L.walkers.forEach(function (p, i) { if (i / L.walkers.length > (st.density * QD)) return; var hx = (p.tx != null ? p.tx - p.x : 0), hz = (p.tz != null ? p.tz - p.z : 1), hl = Math.hypot(hx, hz) || 1; person2(p.x, p.z, p, sm, hx / hl, hz / hl, p.moving); });
      L.kids.forEach(function (p) { var hx = (p.tx != null ? p.tx - p.x : 0), hz = (p.tz != null ? p.tz - p.z : 1), hl = Math.hypot(hx, hz) || 1; person2(p.x, p.z, p, sm * 0.72, hx / hl, hz / hl, p.moving); });
      L.gallery.forEach(function (ga) { if (ga.who && ga.view === 'stage') person2(ga.x, ga.z, ga.who, sm, 0, 1, false); });
      // A shot, not a map: the corners fall off into shadow
      var vg = g.createRadialGradient(cx, ry + rh / 2, rh * 0.35, cx, ry + rh / 2, Math.max(rw, rh) * 0.62); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.55)'); g.fillStyle = vg; g.fillRect(rx, ry, rw, rh);
      g.fillStyle = 'rgba(' + TH.glowTint + ',' + 0.06 * pulse + ')'; g.fillRect(rx, ry, rw, rh);
    }
    // The band: a lead singer and a second voice at the front, dhol and keys behind them
    // The players each have a couple of flourishes of their own, at their own odd moments: the dhol player throws
    // his sticks up and comes down in a flurry, the keys player throws a hand in the air, the benjo player leans into
    // it, the tabla player rattles off a fast run. Now and then the whole band hits it together.
    var FLAIRS = { dhol: ['raise', 'lean'], keys: ['handup', 'sway'], benjo: ['step', 'sway'], tabla: ['flurry', 'shake'] };
    var burst = { at: -99, next: 30 };
    function bandFlair(members) {
      var now = T;
      if (st.on && !reduce && now > burst.next) { burst.at = now; burst.next = now + 45 + rnd() * 60; }
      var inBurst = now - burst.at < 3.2;
      members.forEach(function (m) {
        var list = FLAIRS[m.role];
        if (!list) return;
        if (m.flairNext == null) m.flairNext = now + 5 + rnd() * 12;
        if (inBurst && m.flairT0 !== burst.at) { m.flair = list[0]; m.flairT0 = burst.at; m.flairDur = 3.2; }
        else if (st.on && !reduce && now > m.flairNext) { m.flair = list[Math.floor(rnd() * list.length)]; m.flairT0 = now; m.flairDur = 1.6 + rnd() * 1.6; m.flairNext = now + m.flairDur + 7 + rnd() * 16; }
        var u = m.flair ? (now - m.flairT0) / m.flairDur : 1;
        m.fk = u >= 0 && u < 1 && st.on && !reduce ? Math.sin(Math.PI * u) : 0;
      });
      return inBurst ? Math.sin(Math.PI * (now - burst.at) / 3.2) : 0;
    }
    // Shift on a keyboard cues the singers: each press, the next move from a shuffled set, so every move comes round
    var SINGER_MOVES = ['hop', 'spin', 'point', 'clapup', 'dance', 'wave'], moveBag = [];
    function swapSingers() {
      var ss = (band[st.venue] || []).filter(function (m) { return m.role === 'singer' && !m.leaving && !m.waiting && !m.entering; });
      if (reduce) return;
      ss.forEach(function (m, i) { m.cue = { act: 'swap', at: T + i * 0.5 }; });
    }
    function cueSingers() {
      var ss = (band[st.venue] || []).filter(function (m) { return m.role === 'singer' && !m.leaving && !m.waiting && !m.entering; });
      if (!ss.length || reduce) return false;
      if (!moveBag.length) { moveBag = SINGER_MOVES.slice(); for (var i = moveBag.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)), tmp = moveBag[i]; moveBag[i] = moveBag[j]; moveBag[j] = tmp; } }
      var move = moveBag.pop();
      ss.forEach(function (m, i) { m.cue = { act: move, at: T + i * 0.18 }; });
      return move;
    }
    function bandOn(id, y, z, o) {
      if (!band[id]) {
        var w = (o.x1 - o.x0);
        band[id] = [
          { role: 'dhol', x: o.x0 + w * 0.2, man: true, col: '#f3e6d0', top: '#b8312b', pagdi: '#e67e22', h: 1.72, ph: 0.3, flash: 0 },
          { role: 'keys', x: o.x0 + w * 0.8, man: true, col: '#2f8f5b', top: '#2f8f5b', pagdi: '#f3e6d0', h: 1.7, ph: 0.8, flash: 0 },
          { role: 'benjo', x: o.x0 + w * 0.67, man: true, col: '#f3e6d0', top: '#3b4cc0', pagdi: '#f0c24b', h: 1.7, ph: 1.7, flash: 0, near: true },
          { role: 'tabla', x: o.x0 + w * 0.3, man: true, sitting: true, rest: { y: 0 }, col: '#f3e6d0', top: '#d8453a', pagdi: '#f3e6d0', h: 1.7, ph: 2.6, flash: 0, near: true, older: true }
        ];
      }
      // The song's last seconds, as it fades: the singers walk off, so the stage is clear when the next one starts.
      // Seeking back, or playing it again, brings them on again.
      var ending = st.songKeySeen && !st.live && songLeft() <= 3.2 && pace.rate > 0 && 1 / pace.rate > 20 && pace.p > 0.5;
      if (ending && !outKeys[id] && lineupKeys[id]) { outKeys[id] = lineupKeys[id]; leaveLineup(band[id], o, 0); }
      else if (!ending && outKeys[id]) { if (lineupKeys[id] === outKeys[id]) lineupKeys[id] = 'back|'; outKeys[id] = null; }
      syncLineup(id, o);
      // By the stage you see the players properly: the singers sway, the dhol sticks come down on the beat, the benjo player strums
      var close = (st.listener === 'stage' || st.dj) && st.on && !reduce, bs = Math.sin(BEAT * Math.PI), used = [];
      var singers = band[id].filter(function (m) { return m.role === 'singer' && !m.leaving && !m.waiting; });
      var hype = bandFlair(band[id]);
      if (hype > 0.4) singers.forEach(function (m) { if (!m.cue && m.act !== 'wave' && m.act !== 'walk') { m.act = 'wave'; m.until = burst.at + 3.2; } });
      if (hype > 0) pulse = Math.max(pulse, hype * 0.9);
      band[id].forEach(function (m) { if (m.role === 'singer') singerPlan(m, singers, o); });
      // Singers who have walked off the side of the stage are gone
      for (var gi = band[id].length - 1; gi >= 0; gi--) if (band[id][gi].gone) band[id].splice(gi, 1);
      // Players on the riser are drawn first, the singers at the front last
      var order = band[id].map(function (m, i) { var sg0 = m.role === 'singer', bz0 = sg0 ? z - 0.3 : (o.riserZ != null ? o.riserZ : z + 0.4); return { m: m, i: i, bz: bz0, by: sg0 ? y : y + (o.riserH || 0) }; });
      order.sort(function (a, b) { return b.bz - a.bz; });
      order.forEach(function (it0) {
        var m = it0.m, i = it0.i, bz = it0.bz, by = it0.by;
        if (m.near && st.listener !== 'stage') return;
        if (m.waiting) return;
        var mx = m.role === 'singer' ? m.cx : m.x, p = P(mx, by, bz); if (!p) return;
        // Each singer can wear the song's artist as a cut-out head (face and hair on a transparent background),
        // a little oversized, the way a figurine's head is. A duet puts each artist on the singer of the same sex.
        var faceOn = function (hy) {
          if (m.role !== 'singer') return;
          // Each singer in the lineup carries their own portrait; a page that only sends faces gets them matched by sex
          var img = m.faceUrl ? faceImg(m.faceUrl) : null;
          if (!img && !m.faceUrl && !m.lineup) { for (var fi2 = 0; fi2 < faces.length; fi2++) { var f0 = faces[fi2]; if (used.indexOf(fi2) < 0 && f0.img && f0.man === !!m.man) { img = f0.img; used.push(fi2); break; } } }
          if (img) { var hh = m.h * p.s, ih = hh * 0.3, iw = ih * (img.naturalWidth && img.naturalHeight ? img.naturalWidth / img.naturalHeight : 1); g.drawImage(img, p.x - iw / 2, hy - ih * 0.58, iw, ih); }
        };
        // Singers walking off or on fade into the side curtains
        // Singers fade only as they walk into or out of the wings, over their own walk; one dancing near the edge of a
        // narrow stage stays solid
        var wingA = m.role === 'singer' && m.wingAt != null && (m.leaving || m.entering || m.waiting) ? Math.max(0, Math.min(1, Math.abs(m.cx - m.wingAt) / (m.fadeSpan || 1.3))) : 1;
        if (wingA <= 0.01) return;
        // Close enough to see properly: the full, detailed player, and a proper mic stand for the singers
        if (m.h * p.s >= 58) {
          g.globalAlpha = wingA;
          performer(p, m, i, BEAT);
          faceOn(p.y - m.h * p.s * 0.885 - (m.hopK || 0) * m.h * p.s * 0.13);
          g.globalAlpha = 1;
          if (m.role === 'singer' && !m.leaving) micStand(m.x - 0.25, by, bz - 0.35);
          return;
        }
        var spot = g.createRadialGradient(p.x, p.y - p.s, 1, p.x, p.y - p.s, p.s * 1.6); spot.addColorStop(0, 'rgba(' + TH.beams[i % TH.beams.length] + ',' + 0.35 * bright + ')'); spot.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = spot; g.beginPath(); g.arc(p.x, p.y - p.s, p.s * 1.6, 0, TAU); g.fill();
        if (m.role === 'keys') fillPoly([[m.x - 0.6, by + 0.85, bz - 0.3], [m.x + 0.6, by + 0.85, bz - 0.3], [m.x + 0.6, by + 0.95, bz - 0.3], [m.x - 0.6, by + 0.95, bz - 0.3]], '#111');
        figure(p, m, T, false, BEAT, 1);
        faceOn(p.y - m.h * p.s * (m.dancing ? 0.9 : 0.885) - Math.abs(Math.sin(BEAT * Math.PI)) * m.h * p.s * 0.01);
        if (m.role === 'dhol') {
          var dp = P(m.x, by + 0.9, bz - 0.25);
          if (dp && close) {
            // The barrel slung across the waist, a stick in each hand: the thick one on the bass head, the cane on the treble
            var hw0 = dp.s * 0.3, hr0 = dp.s * 0.17;
            g.fillStyle = '#7a3b1a'; g.fillRect(dp.x - hw0, dp.y - hr0, hw0 * 2, hr0 * 2);
            g.strokeStyle = '#e8b04b'; g.lineWidth = Math.max(0.8, dp.s * 0.02); for (var rb = -2; rb <= 2; rb++) { g.beginPath(); g.moveTo(dp.x + rb * hw0 * 0.4, dp.y - hr0); g.lineTo(dp.x + rb * hw0 * 0.4 + hw0 * 0.2, dp.y + hr0); g.stroke(); }
            g.fillStyle = '#e9dcc0'; g.beginPath(); g.ellipse(dp.x - hw0, dp.y, hr0 * 0.35, hr0, 0, 0, TAU); g.ellipse(dp.x + hw0, dp.y, hr0 * 0.35, hr0, 0, 0, TAU); g.fill();
            var hitL = Math.max(0, bs), hitR = Math.max(0, -bs), sl = dp.s * 0.34;
            g.strokeStyle = '#3b2213'; g.lineWidth = Math.max(1.2, dp.s * 0.035); g.beginPath(); g.moveTo(dp.x - hw0 * 1.05, dp.y - hr0 * 0.2); g.lineTo(dp.x - hw0 * 1.05 - sl * 0.5, dp.y - hr0 * 0.2 - sl * (0.2 + 0.8 * (1 - hitL))); g.stroke();
            g.strokeStyle = '#c9a56b'; g.lineWidth = Math.max(0.8, dp.s * 0.018); g.beginPath(); g.moveTo(dp.x + hw0 * 1.05, dp.y - hr0 * 0.1); g.quadraticCurveTo(dp.x + hw0 * 1.05 + sl * 0.3, dp.y - sl * 0.6, dp.x + hw0 * 1.05 + sl * 0.6, dp.y - hr0 * 0.1 - sl * (0.15 + 0.9 * (1 - hitR))); g.stroke();
            if (hitL > 0.85) glow(dp.x - hw0, dp.y, dp.s * 0.12, '#ffe7b0', (hitL - 0.85) * 5);
            if (hitR > 0.85) glow(dp.x + hw0, dp.y, dp.s * 0.1, '#ffe7b0', (hitR - 0.85) * 5);
          } else if (dp) { g.fillStyle = '#7a3b1a'; g.beginPath(); g.ellipse(dp.x, dp.y, dp.s * 0.34, dp.s * 0.2, 0, 0, TAU); g.fill(); g.strokeStyle = '#e8b04b'; g.lineWidth = Math.max(0.8, dp.s * 0.03); g.stroke(); }
        }
        if (m.role === 'tabla') {
          // A pair of tabla in front of him on the deck
          [-1, 1].forEach(function (sd) { var tp = P(m.x + sd * 0.13, by + (sd < 0 ? 0.2 : 0.17), bz - 0.3); if (!tp) return; var tr = tp.s * (sd < 0 ? 0.1 : 0.08); g.fillStyle = sd < 0 ? '#9aa0a6' : '#6b3b1c'; g.fillRect(tp.x - tr, tp.y, tr * 2, tr * 1.6); g.fillStyle = '#e9dcc0'; g.beginPath(); g.ellipse(tp.x, tp.y, tr, tr * 0.35, 0, 0, TAU); g.fill(); g.fillStyle = '#222'; g.beginPath(); g.ellipse(tp.x, tp.y, tr * 0.4, tr * 0.14, 0, 0, TAU); g.fill(); });
        }
        if (m.role === 'benjo') {
          // A benjo across the lap: a long box with typewriter keys and strings, the right hand strumming
          var b0 = P(m.x - 0.35, by + 0.95, bz - 0.3), b1 = P(m.x + 0.35, by + 0.9, bz - 0.3);
          if (b0 && b1) { var bt = b0.s * 0.09; g.fillStyle = '#5a2d14'; g.beginPath(); g.moveTo(b0.x, b0.y - bt); g.lineTo(b1.x, b1.y - bt); g.lineTo(b1.x, b1.y + bt); g.lineTo(b0.x, b0.y + bt); g.closePath(); g.fill();
            g.fillStyle = '#f3e6d0'; for (var kk = 0; kk < 8; kk++) { var ku = 0.1 + kk * 0.08; g.fillRect(lerp(b0.x, b1.x, ku) - 1, lerp(b0.y, b1.y, ku) - bt * 0.9, Math.max(1, bt * 0.35), bt * 0.6); }
            g.strokeStyle = 'rgba(255,240,210,.6)'; g.lineWidth = 0.6; g.beginPath(); g.moveTo(b0.x, b0.y + bt * 0.3); g.lineTo(b1.x, b1.y + bt * 0.3); g.stroke(); }
        }
        if (close && m.role === 'singer') {
          // In-ear wire and a little shine on the mic in the spot
          var mh = m.h * p.s; glow(p.x - mh * 0.03, p.y - mh * 0.84, Math.max(1, mh * 0.03), '#fff6e0', 0.35 + 0.3 * pulse);
        }
        if (m.role === 'singer' && !m.leaving) { var ms = P(m.x - 0.25, by, bz - 0.35), mt = P(m.x - 0.25, by + 1.45, bz - 0.35); if (ms && mt) { g.strokeStyle = '#1a1a1a'; g.lineWidth = Math.max(0.8, ms.s * 0.03); g.beginPath(); g.moveTo(ms.x, ms.y); g.lineTo(mt.x, mt.y); g.stroke(); } }
      });
    }
    /* ---------- the band up close ----------
       Near the stage the players are big enough to draw properly. Each has a body with volume, lit from the front by
       the stage wash and edged from behind by the backlight, a face, the costume's borders, pleats and mirror work,
       and a real instrument: a laced dhol, a keyboard on its stand, a benjo, a pair of tabla on their rings. */
    var shadeCache = {};
    function shade(hex, f) {
      var key = hex + '|' + f, hit = shadeCache[key]; if (hit) return hit;
      if (Object.keys(shadeCache).length > 4000) shadeCache = {};
      return (shadeCache[key] = shadeRaw(hex, f));
    }
    function shadeRaw(hex, f) {
      var r, gg, bb;
      if (hex.charAt(0) === '#') { var n = parseInt(hex.slice(1), 16); r = n >> 16; gg = (n >> 8) & 255; bb = n & 255; }
      else { var m = hex.match(/\d+/g) || [0, 0, 0]; r = +m[0]; gg = +m[1]; bb = +m[2]; }
      if (f > 0) { r = lerp(r, 255, f); gg = lerp(gg, 240, f); bb = lerp(bb, 214, f); } else { r = lerp(r, 10, -f); gg = lerp(gg, 7, -f); bb = lerp(bb, 14, -f); }
      return 'rgb(' + Math.round(r) + ',' + Math.round(gg) + ',' + Math.round(bb) + ')';
    }
    // Cloth or skin wrapped round a body: dark at the turning edges, the wash catching the front, the far side in shadow
    function roundLit(hex, x0, x1) {
      var gr = g.createLinearGradient(x0, 0, x1, 0);
      gr.addColorStop(0, shade(hex, -0.5)); gr.addColorStop(0.22, shade(hex, -0.08)); gr.addColorStop(0.42, shade(hex, 0.16)); gr.addColorStop(0.68, hex); gr.addColorStop(1, shade(hex, -0.55));
      return gr;
    }
    // The same, softer: for people seen from behind, whose fronts face the light
    function roundSoft(hex, x0, x1) {
      var gr = g.createLinearGradient(x0, 0, x1, 0);
      gr.addColorStop(0, shade(hex, -0.32)); gr.addColorStop(0.3, shade(hex, 0.04)); gr.addColorStop(0.6, hex); gr.addColorStop(1, shade(hex, -0.34));
      return gr;
    }
    // One tapered segment of a limb, with a round joint at its end
    function seg(a, b, w0, w1, fill) {
      var dx = b[0] - a[0], dy = b[1] - a[1], L0 = Math.hypot(dx, dy) || 1, nx = -dy / L0 * 0.5, ny = dx / L0 * 0.5;
      g.fillStyle = fill; g.beginPath();
      g.moveTo(a[0] + nx * w0, a[1] + ny * w0); g.lineTo(b[0] + nx * w1, b[1] + ny * w1); g.lineTo(b[0] - nx * w1, b[1] - ny * w1); g.lineTo(a[0] - nx * w0, a[1] - ny * w0); g.closePath(); g.fill();
      g.beginPath(); g.arc(b[0], b[1], w1 / 2, 0, TAU); g.fill();
    }
    function dotRow(pts, r, col) { g.fillStyle = col; g.beginPath(); pts.forEach(function (q) { g.moveTo(q[0] + r, q[1]); g.arc(q[0], q[1], r, 0, TAU); }); g.fill(); }
    // Points along a quadratic curve, for borders, garlands and rows of mirrors
    function alongQuad(x0, y0, cx, cy, x1, y1, n) { var out = []; for (var i = 0; i <= n; i++) { var u = i / n, a = (1 - u) * (1 - u), b = 2 * (1 - u) * u, c = u * u; out.push([a * x0 + b * cx + c * x1, a * y0 + b * cy + c * y1]); } return out; }

    function performer(p, d, i, beatPh) {
      var s = p.s, x = p.x, y = p.y, h = d.h * s, walking = d.walking && !reduce, playing = st.on && !reduce, tw = d.twirl || 0, up = d.flash > 0.25;
      var ph = walking ? d.step : beatPh * Math.PI + d.ph, sw = walking || playing ? Math.sin(ph) : 0, groundY = y;
      if (d.sitting) y = p.y + 0.3 * h;
      else y -= (walking ? 0.025 : 0.015) * Math.abs(sw) * s;
      if (!st.on && !reduce) { x += Math.sin(T * 0.6 + d.ph * 3) * h * 0.012; y -= Math.max(0, Math.sin(T * 1.1 + d.ph)) * h * 0.004; }
      if (d.fk > 0.02) { if (d.flair === 'sway' || d.flair === 'step' || d.flair === 'lean') x += Math.sin(T * 3.4 + d.ph) * h * 0.06 * d.fk; if (d.flair === 'lean' || d.flair === 'raise') y -= Math.abs(Math.sin(T * 6.5 + d.ph)) * h * 0.025 * d.fk; if (d.flair === 'shake') x += Math.sin(T * 17) * h * 0.012 * d.fk; }
      if (d.hopK) y -= d.hopK * h * 0.13;
      var beam = TH.beams[i % TH.beams.length], gold = '#e8b04b', goldHi = '#ffe3a1', ink = '#1f130d';
      var skinC = SKIN[Math.floor((d.ph || 0) * 10) % SKIN.length], lw = Math.max(1, h * 0.034);
      var shy = y - h * 0.76, headY = y - h * 0.885, hr = h * 0.068;
      var A0 = g.globalAlpha;
      g.save();
      // The backlight behind the player, and their pool of light and reflection on the deck
      g.globalCompositeOperation = 'lighter';
      var bl = g.createRadialGradient(x, shy, h * 0.05, x, shy, h * 0.75); bl.addColorStop(0, 'rgba(' + beam + ',' + (0.28 + 0.12 * pulse) * bright + ')'); bl.addColorStop(1, 'rgba(' + beam + ',0)');
      g.fillStyle = bl; g.beginPath(); g.arc(x, shy, h * 0.75, 0, TAU); g.fill();
      var pool = g.createRadialGradient(x, groundY, 1, x, groundY, h * 0.5); pool.addColorStop(0, 'rgba(255,236,205,' + 0.22 * bright + ')'); pool.addColorStop(1, 'rgba(255,236,205,0)');
      g.fillStyle = pool; g.beginPath(); g.ellipse(x, groundY, h * 0.5, h * 0.09, 0, 0, TAU); g.fill();
      g.globalAlpha = A0 * 0.16 * bright; g.fillStyle = d.col; g.beginPath(); g.ellipse(x, groundY + h * 0.05, h * 0.16, h * 0.05, 0, 0, TAU); g.fill(); g.globalAlpha = A0;
      g.globalCompositeOperation = 'source-over';
      g.fillStyle = 'rgba(0,0,0,.4)'; g.beginPath(); g.ellipse(x, groundY, h * 0.2, h * 0.04, 0, 0, TAU); g.fill();
      g.lineCap = 'round'; g.lineJoin = 'round';

      var main = d.col, trim = d.top, hem = y, flare = 0;
      if (!d.man) {
        /* Her chaniya: eight flared panels, a gota band and a mirror border at the hem, a second band above it */
        flare = h * (0.27 + 0.18 * tw + (walking ? 0.012 * sw : 0)); hem = y - h * 0.01 - h * 0.03 * tw;
        var wT = y - h * 0.56, wHalf = h * 0.078, swing = (reduce ? 0 : Math.sin(T * 2.1 + d.ph)) * h * 0.012 + (d.dancing ? sw * h * 0.02 : 0);
        g.fillStyle = roundLit(main, x - flare, x + flare); g.beginPath(); g.moveTo(x - wHalf, wT); g.lineTo(x + wHalf, wT);
        g.quadraticCurveTo(x + flare * 0.72 + swing, y - h * 0.22, x + flare + swing, hem); g.quadraticCurveTo(x + swing * 0.5, hem + h * 0.055, x - flare + swing, hem); g.quadraticCurveTo(x - flare * 0.72 + swing, y - h * 0.22, x - wHalf, wT); g.fill();
        // Kali panels: alternate ones a shade darker, with a fold line down each
        for (var k = 0; k < 8; k++) {
          var u0 = k / 8 * 2 - 1, u1 = (k + 1) / 8 * 2 - 1;
          if (k % 2) { g.fillStyle = 'rgba(0,0,0,.13)'; g.beginPath(); g.moveTo(x + u0 * wHalf, wT); g.lineTo(x + u1 * wHalf, wT); g.lineTo(x + u1 * flare * 0.98 + swing, hem + h * 0.04 * (1 - u1 * u1)); g.lineTo(x + u0 * flare * 0.98 + swing, hem + h * 0.04 * (1 - u0 * u0)); g.closePath(); g.fill(); }
          g.strokeStyle = 'rgba(0,0,0,.18)'; g.lineWidth = Math.max(0.6, h * 0.004); g.beginPath(); g.moveTo(x + u0 * wHalf, wT); g.lineTo(x + u0 * flare * 0.98 + swing, hem + h * 0.04 * (1 - u0 * u0)); g.stroke();
        }
        // Bandhani dots over the skirt
        g.fillStyle = 'rgba(255,248,230,.5)';
        for (var br = 0; br < 5; br++) for (var bc = -5; bc <= 5; bc++) { var by2 = lerp(y - h * 0.48, hem - h * 0.14, br / 4.3), fw = lerp(wHalf, flare * 0.92, (by2 - wT) / Math.max(1, hem - wT)); g.beginPath(); g.arc(x + (bc + (br % 2) * 0.5) / 5.6 * fw + swing * (by2 - wT) / (hem - wT), by2, Math.max(0.5, h * 0.0055), 0, TAU); g.fill(); }
        // The upper band in her odhni's colour, then the wide gota border with a zigzag through it and mirrors below
        var band1 = alongQuad(x - flare * 0.86 + swing, hem - h * 0.13, x + swing * 0.5, hem - h * 0.09, x + flare * 0.86 + swing, hem - h * 0.13, 14);
        g.strokeStyle = d.odhni || trim; g.lineWidth = Math.max(1, h * 0.018); g.beginPath(); band1.forEach(function (q, qi) { if (qi) g.lineTo(q[0], q[1]); else g.moveTo(q[0], q[1]); }); g.stroke();
        var gota = alongQuad(x - flare * 0.97 + swing, hem - h * 0.035, x + swing * 0.5, hem + h * 0.015, x + flare * 0.97 + swing, hem - h * 0.035, 22);
        g.strokeStyle = gold; g.lineWidth = Math.max(1.4, h * 0.045); g.beginPath(); gota.forEach(function (q, qi) { if (qi) g.lineTo(q[0], q[1]); else g.moveTo(q[0], q[1]); }); g.stroke();
        g.strokeStyle = shade(gold, -0.35); g.lineWidth = Math.max(0.6, h * 0.006); g.beginPath(); gota.forEach(function (q, qi) { var zy = q[1] + (qi % 2 ? -1 : 1) * h * 0.012; if (qi) g.lineTo(q[0], zy); else g.moveTo(q[0], zy); }); g.stroke();
        for (var mw = 1; mw < 22; mw += 2) { var q0 = gota[mw], tw2 = reduce ? 0.5 : 0.5 + 0.5 * Math.sin(T * 5 + mw * 1.7 + d.ph * 3); g.fillStyle = 'rgba(235,245,255,' + (0.5 + 0.5 * tw2) + ')'; g.beginPath(); g.arc(q0[0], q0[1] - h * 0.035, Math.max(0.7, h * 0.009), 0, TAU); g.fill(); if (tw2 > 0.9) glow(q0[0], q0[1] - h * 0.035, Math.max(1.2, h * 0.03), '#ffffff', (tw2 - 0.9) * 8); }
        // Her feet in embroidered mojari, peeking out under the hem, and silver payal
        [-1, 1].forEach(function (sd) { g.fillStyle = '#7a1a14'; g.beginPath(); g.ellipse(x + sd * h * 0.05, hem + h * 0.018, h * 0.035, h * 0.013, 0, 0, TAU); g.fill(); g.fillStyle = gold; g.beginPath(); g.arc(x + sd * h * 0.05 + h * 0.024, hem + h * 0.014, Math.max(0.5, h * 0.004), 0, TAU); g.fill(); });
        // The waist: a strip of skin with a gold kandoro chain across it
        g.fillStyle = roundLit(skinC, x - h * 0.065, x + h * 0.065); g.fillRect(x - h * 0.063, y - h * 0.61, h * 0.126, h * 0.055);
        g.strokeStyle = gold; g.lineWidth = Math.max(0.8, h * 0.007); g.beginPath(); g.moveTo(x - h * 0.066, y - h * 0.565); g.quadraticCurveTo(x, y - h * 0.55, x + h * 0.066, y - h * 0.565); g.stroke();
        dotRow(alongQuad(x - h * 0.06, y - h * 0.56, x, y - h * 0.545, x + h * 0.06, y - h * 0.56, 6), Math.max(0.5, h * 0.0045), goldHi);
        // The choli: fitted, with puffed short sleeves, a gold-edged neckline and embroidery
        g.fillStyle = roundLit(trim, x - h * 0.085, x + h * 0.085); g.beginPath();
        g.moveTo(x - h * 0.082, y - h * 0.785); g.quadraticCurveTo(x, y - h * 0.8, x + h * 0.082, y - h * 0.785); g.lineTo(x + h * 0.074, y - h * 0.61); g.quadraticCurveTo(x, y - h * 0.595, x - h * 0.074, y - h * 0.61); g.closePath(); g.fill();
        g.strokeStyle = gold; g.lineWidth = Math.max(0.8, h * 0.008); g.beginPath(); g.moveTo(x - h * 0.05, y - h * 0.79); g.quadraticCurveTo(x, y - h * 0.735, x + h * 0.05, y - h * 0.79); g.stroke();
        g.beginPath(); g.moveTo(x - h * 0.074, y - h * 0.612); g.quadraticCurveTo(x, y - h * 0.597, x + h * 0.074, y - h * 0.612); g.stroke();
        dotRow([[x - h * 0.035, y - h * 0.68], [x, y - h * 0.665], [x + h * 0.035, y - h * 0.68], [x - h * 0.018, y - h * 0.64], [x + h * 0.018, y - h * 0.64]], Math.max(0.5, h * 0.006), goldHi);
      } else {
        /* His churidar, bunched at the ankle, and mojari with the curled toe */
        var lx = walking ? sw * h * 0.06 : sw * h * 0.02, legC = d.legs || '#efe6d6';
        if (d.sitting) {
          // Sitting cross-legged on a cushion: the folded legs as one rounded shape, feet tucked in
          g.fillStyle = roundLit(legC, x - h * 0.22, x + h * 0.22); g.beginPath(); g.ellipse(x, groundY - h * 0.05, h * 0.22, h * 0.07, 0, 0, TAU); g.fill();
          g.strokeStyle = 'rgba(0,0,0,.2)'; g.lineWidth = Math.max(0.6, h * 0.005); g.beginPath(); g.moveTo(x - h * 0.18, groundY - h * 0.06); g.quadraticCurveTo(x, groundY - h * 0.02, x + h * 0.18, groundY - h * 0.06); g.stroke();
        } else {
          [[-1, -lx], [1, lx]].forEach(function (lg) {
            var sd = lg[0], hip = [x + sd * h * 0.045, y - h * 0.44], knee = [x + sd * h * 0.055 + lg[1] * 0.5, y - h * 0.23], ank = [x + sd * h * 0.06 + lg[1], y - h * 0.03];
            seg(hip, knee, h * 0.062, h * 0.05, roundLit(legC, knee[0] - h * 0.03, knee[0] + h * 0.03)); seg(knee, ank, h * 0.05, h * 0.036, roundLit(legC, ank[0] - h * 0.025, ank[0] + h * 0.025));
            g.strokeStyle = 'rgba(0,0,0,.16)'; g.lineWidth = Math.max(0.5, h * 0.004); for (var rb = 0; rb < 4; rb++) { var ry0 = ank[1] - h * (0.012 + rb * 0.018); g.beginPath(); g.moveTo(ank[0] - h * 0.02, ry0); g.quadraticCurveTo(ank[0], ry0 + h * 0.006, ank[0] + h * 0.02, ry0); g.stroke(); }
            g.fillStyle = '#6b2a14'; g.beginPath(); g.moveTo(ank[0] - h * 0.028, y - h * 0.005); g.quadraticCurveTo(ank[0], y - h * 0.035, ank[0] + h * 0.03, y - h * 0.008); g.quadraticCurveTo(ank[0] + sd * h * 0.05, y - h * 0.02, ank[0] + sd * h * 0.045, y - h * 0.03); g.lineTo(ank[0] + sd * h * 0.03, y + h * 0.004); g.lineTo(ank[0] - h * 0.028, y + h * 0.004); g.closePath(); g.fill();
            g.fillStyle = gold; g.fillRect(ank[0] - h * 0.02, y - h * 0.012, h * 0.03, Math.max(0.6, h * 0.004));
          });
        }
        /* The kediyu (or the keys player's kurta): fitted at the chest, then a gathered flare with pleats fanning out */
        var kurta = d.role === 'keys', fl = kurta ? h * 0.11 : h * (0.2 + (playing ? 0.012 * sw : 0)), yH = kurta ? y - h * 0.3 : y - h * 0.42;
        g.fillStyle = roundLit(main, x - fl, x + fl); g.beginPath();
        g.moveTo(x - h * 0.085, y - h * 0.8); g.quadraticCurveTo(x, y - h * 0.815, x + h * 0.085, y - h * 0.8); g.lineTo(x + h * 0.085, y - h * 0.62);
        g.quadraticCurveTo(x + fl * 0.85, y - h * 0.52, x + fl, yH); g.quadraticCurveTo(x, yH + h * 0.045, x - fl, yH); g.quadraticCurveTo(x - fl * 0.85, y - h * 0.52, x - h * 0.085, y - h * 0.62); g.closePath(); g.fill();
        if (!kurta) { g.strokeStyle = 'rgba(0,0,0,.2)'; g.lineWidth = Math.max(0.6, h * 0.005); for (var pl = -4; pl <= 4; pl++) { g.beginPath(); g.moveTo(x + pl * h * 0.018, y - h * 0.6); g.quadraticCurveTo(x + pl * fl * 0.16, y - h * 0.5, x + pl * fl * 0.23, yH + h * 0.03 * (1 - Math.abs(pl) / 5)); g.stroke(); } }
        // Borders at the hem and down the front, an embroidered yoke across the chest
        g.strokeStyle = trim; g.lineWidth = Math.max(1, h * 0.018); g.beginPath(); g.moveTo(x - fl * 0.98, yH - h * 0.005); g.quadraticCurveTo(x, yH + h * 0.04, x + fl * 0.98, yH - h * 0.005); g.stroke();
        g.strokeStyle = gold; g.lineWidth = Math.max(0.8, h * 0.007); g.beginPath(); g.moveTo(x - fl * 0.96, yH - h * 0.018); g.quadraticCurveTo(x, yH + h * 0.026, x + fl * 0.96, yH - h * 0.018); g.stroke();
        g.fillStyle = trim; g.beginPath(); g.moveTo(x - h * 0.078, y - h * 0.79); g.quadraticCurveTo(x, y - h * 0.8, x + h * 0.078, y - h * 0.79); g.lineTo(x + h * 0.07, y - h * 0.7); g.quadraticCurveTo(x, y - h * 0.66, x - h * 0.07, y - h * 0.7); g.closePath(); g.fill();
        dotRow(alongQuad(x - h * 0.066, y - h * 0.7, x, y - h * 0.665, x + h * 0.066, y - h * 0.7, 9), Math.max(0.5, h * 0.0055), goldHi);
        for (var mi = 0; mi < 4; mi++) { var mt = reduce ? 0.6 : 0.5 + 0.5 * Math.sin(T * 4 + mi * 2 + d.ph * 5); g.fillStyle = 'rgba(235,245,255,' + (0.55 + 0.4 * mt) + ')'; g.beginPath(); g.arc(x + (mi - 1.5) * h * 0.03, y - h * 0.745, Math.max(0.6, h * 0.007), 0, TAU); g.fill(); }
        g.strokeStyle = gold; g.lineWidth = Math.max(0.7, h * 0.006); g.beginPath(); g.moveTo(x, y - h * 0.795); g.lineTo(x, y - h * 0.66); g.stroke();
        // A koti (sleeveless jacket) over it for the dhol and benjo players, the keys player's short Nehru jacket
        if (d.role === 'dhol' || d.role === 'benjo' || kurta) {
          var kc = kurta ? shade(trim, -0.35) : trim, kb = kurta ? y - h * 0.5 : y - h * 0.55;
          [-1, 1].forEach(function (sd) { g.fillStyle = roundLit(kc, x + sd * h * 0.1 - h * 0.05, x + sd * h * 0.1 + h * 0.05); g.beginPath(); g.moveTo(x + sd * h * 0.018, y - h * 0.79); g.lineTo(x + sd * h * 0.088, y - h * 0.805); g.lineTo(x + sd * h * 0.1, kb); g.lineTo(x + sd * h * 0.022, kb + h * 0.01); g.closePath(); g.fill(); });
          g.strokeStyle = gold; g.lineWidth = Math.max(0.7, h * 0.006); [-1, 1].forEach(function (sd) { g.beginPath(); g.moveTo(x + sd * h * 0.018, y - h * 0.79); g.lineTo(x + sd * h * 0.022, kb + h * 0.01); g.stroke(); });
        }
        // The male singer's gold stole
        if (d.role === 'singer') { g.strokeStyle = roundLit(gold, x - h * 0.12, x + h * 0.08); g.lineWidth = Math.max(1.4, h * 0.03); g.beginPath(); g.moveTo(x + h * 0.08, y - h * 0.8); g.quadraticCurveTo(x - h * 0.02, y - h * 0.62, x - h * 0.12, y - h * 0.4); g.stroke(); g.strokeStyle = '#b8312b'; g.lineWidth = Math.max(0.6, h * 0.006); g.stroke(); }
        if (d.sitting && d.older) { g.strokeStyle = roundLit(d.shawl || '#8c6a4f', x - h * 0.12, x + h * 0.12); g.lineWidth = Math.max(2, h * 0.06); g.beginPath(); g.moveTo(x - h * 0.1, y - h * 0.745); g.quadraticCurveTo(x, y - h * 0.7, x + h * 0.1, y - h * 0.745); g.stroke(); }
      }

      /* Instruments that sit in front of the body (the hands come after, so they play on top) */
      if (d.role === 'keys') {
        // A keyboard on an X stand: the top face with its keys, a little screen that glows
        var kx0 = x - h * 0.27, kx1 = x + h * 0.27, ky = y - h * 0.47, kd = h * 0.045;
        g.strokeStyle = '#222'; g.lineWidth = Math.max(1, h * 0.012); g.beginPath(); g.moveTo(x - h * 0.16, y); g.lineTo(x + h * 0.14, ky + kd); g.moveTo(x + h * 0.16, y); g.lineTo(x - h * 0.14, ky + kd); g.stroke();
        g.fillStyle = '#141416'; g.fillRect(kx0, ky - kd * 0.3, kx1 - kx0, kd * 1.9);
        g.fillStyle = '#f2efe6'; g.fillRect(kx0 + h * 0.015, ky, kx1 - kx0 - h * 0.03, kd);
        g.fillStyle = '#161616'; var nk = 28; for (var kk = 0; kk < nk; kk++) if ([1, 3, 6, 8, 10].indexOf(kk % 12) >= 0) g.fillRect(lerp(kx0 + h * 0.015, kx1 - h * 0.015, kk / nk), ky, Math.max(0.6, (kx1 - kx0) / nk * 0.6), kd * 0.6);
        g.fillStyle = 'rgba(0,0,0,.25)'; for (var kl = 1; kl < nk; kl++) g.fillRect(lerp(kx0 + h * 0.015, kx1 - h * 0.015, kl / nk), ky + kd * 0.6, 0.6, kd * 0.4);
        g.fillStyle = 'rgba(' + TH.beams[0] + ',' + (0.6 + 0.3 * pulse) + ')'; g.fillRect(x - h * 0.04, ky - kd * 0.25, h * 0.08, kd * 0.22);
      }
      if (d.role === 'benjo') {
        // The benjo on a low stand: a long box with brass typewriter keys along it and a steel string run
        var b0 = [x - h * 0.24, y - h * 0.45], b1 = [x + h * 0.24, y - h * 0.47], bt = h * 0.032;
        g.strokeStyle = '#222'; g.lineWidth = Math.max(1, h * 0.01); g.beginPath(); g.moveTo(x - h * 0.13, y); g.lineTo(x + h * 0.1, b0[1] + bt); g.moveTo(x + h * 0.13, y); g.lineTo(x - h * 0.1, b0[1] + bt); g.stroke();
        var bgr = g.createLinearGradient(0, b0[1] - bt, 0, b0[1] + bt); bgr.addColorStop(0, '#8a4a22'); bgr.addColorStop(0.5, '#5a2d14'); bgr.addColorStop(1, '#2e160a');
        g.fillStyle = bgr; g.beginPath(); g.moveTo(b0[0], b0[1] - bt); g.lineTo(b1[0], b1[1] - bt); g.lineTo(b1[0] + h * 0.01, b1[1] + bt); g.lineTo(b0[0] - h * 0.01, b0[1] + bt); g.closePath(); g.fill();
        g.fillStyle = '#e8c77a'; for (var bk = 0; bk < 12; bk++) { var bu = 0.08 + bk * 0.055; g.beginPath(); g.arc(lerp(b0[0], b1[0], bu), lerp(b0[1], b1[1], bu) - bt * 0.4, Math.max(0.7, h * 0.007), 0, TAU); g.fill(); }
        g.strokeStyle = 'rgba(235,235,240,.75)'; g.lineWidth = 0.7; for (var bs2 = 0; bs2 < 3; bs2++) { g.beginPath(); g.moveTo(b0[0], b0[1] + bt * (0.15 + bs2 * 0.25)); g.lineTo(b1[0], b1[1] + bt * (0.15 + bs2 * 0.25)); g.stroke(); }
        g.fillStyle = '#c9a56b'; g.beginPath(); g.arc(b1[0] - h * 0.035, b1[1] + bt * 0.2, Math.max(1, h * 0.012), 0, TAU); g.fill();
      }
      if (d.role === 'tabla') {
        // Dayan and bayan on their cloth rings: the tall wooden one on the right, the wide metal one on the left
        [[-1, h * 0.12, h * 0.075, '#9aa0a6', '#5d6166'], [1, h * 0.085, h * 0.1, '#7a3f1c', '#3d1e0c']].forEach(function (tb) {
          var tx = x + tb[0] * h * 0.14, top = groundY - tb[2] - h * 0.02, rr = tb[1] * 0.5;
          g.fillStyle = '#7a1a14'; g.beginPath(); g.ellipse(tx, groundY - h * 0.01, rr * 1.15, rr * 0.35, 0, 0, TAU); g.fill();
          var tg = g.createLinearGradient(tx - rr, 0, tx + rr, 0); tg.addColorStop(0, tb[4]); tg.addColorStop(0.35, tb[3]); tg.addColorStop(1, tb[4]);
          g.fillStyle = tg; g.beginPath(); g.moveTo(tx - rr, top); g.quadraticCurveTo(tx - rr * (tb[0] < 0 ? 1.25 : 1.05), top + tb[2] * 0.6, tx - rr * 0.85, groundY - h * 0.02); g.lineTo(tx + rr * 0.85, groundY - h * 0.02); g.quadraticCurveTo(tx + rr * (tb[0] < 0 ? 1.25 : 1.05), top + tb[2] * 0.6, tx + rr, top); g.closePath(); g.fill();
          g.strokeStyle = 'rgba(240,225,190,.55)'; g.lineWidth = Math.max(0.5, h * 0.003); for (var ls = 0; ls < 7; ls++) { var lu = ls / 6 * 2 - 1; g.beginPath(); g.moveTo(tx + lu * rr * 0.95, top + h * 0.004); g.lineTo(tx + lu * rr * 0.8, groundY - h * 0.03); g.stroke(); }
          g.fillStyle = '#eadcc0'; g.beginPath(); g.ellipse(tx, top, rr, rr * 0.34, 0, 0, TAU); g.fill();
          g.fillStyle = '#1b1715'; g.beginPath(); g.ellipse(tx + (tb[0] < 0 ? -rr * 0.2 : 0), top, rr * 0.42, rr * 0.15, 0, 0, TAU); g.fill();
        });
      }

      /* Neck, and the head: face, hair or safa, jewellery */
      g.fillStyle = roundLit(skinC, x - h * 0.03, x + h * 0.03); g.fillRect(x - h * 0.024, y - h * 0.835, h * 0.048, h * 0.06);
      if (!d.man) {
        // Her odhni falls behind her from the back of her head, drawn first so her face sits in front of it
        g.fillStyle = d.odhni || trim; g.globalAlpha = A0 * 0.9; g.beginPath(); g.moveTo(x - hr * 1.15, headY - hr * 0.2); g.quadraticCurveTo(x, headY - hr * 1.7, x + hr * 1.15, headY - hr * 0.2); g.lineTo(x + hr * 1.3, headY + hr * 1.6); g.lineTo(x - hr * 1.3, headY + hr * 1.6); g.closePath(); g.fill(); g.globalAlpha = A0;
        // Her braid over the shoulder with a red paranda tassel
        g.strokeStyle = ink; g.lineWidth = Math.max(1.2, h * 0.02); g.beginPath(); g.moveTo(x + hr * 0.7, headY + hr * 0.4); g.quadraticCurveTo(x + h * 0.09, y - h * 0.75, x + h * 0.075, y - h * 0.63); g.stroke();
        g.fillStyle = '#c0392b'; g.beginPath(); g.moveTo(x + h * 0.068, y - h * 0.635); g.lineTo(x + h * 0.085, y - h * 0.635); g.lineTo(x + h * 0.08, y - h * 0.585); g.lineTo(x + h * 0.072, y - h * 0.585); g.closePath(); g.fill();
      }
      g.fillStyle = roundLit(skinC, x - hr, x + hr); g.beginPath(); g.ellipse(x, headY, hr * 0.92, hr * 1.08, 0, 0, TAU); g.fill();
      // Ears, then the face: brows, eyes, the nose's shadow, a mouth that opens with the song for the singers
      g.fillStyle = shade(skinC, -0.15); g.beginPath(); g.ellipse(x - hr * 0.93, headY + hr * 0.05, hr * 0.14, hr * 0.24, 0, 0, TAU); g.ellipse(x + hr * 0.93, headY + hr * 0.05, hr * 0.14, hr * 0.24, 0, 0, TAU); g.fill();
      if (h > 70) {
        var ey = headY - hr * 0.05, blink = !reduce && ((T + d.ph * 7) % 4.3) < 0.12;
        g.strokeStyle = ink; g.lineWidth = Math.max(0.8, h * 0.006);
        g.beginPath(); g.moveTo(x - hr * 0.55, ey - hr * 0.3); g.quadraticCurveTo(x - hr * 0.33, ey - hr * 0.42, x - hr * 0.12, ey - hr * 0.32); g.moveTo(x + hr * 0.12, ey - hr * 0.32); g.quadraticCurveTo(x + hr * 0.33, ey - hr * 0.42, x + hr * 0.55, ey - hr * 0.3); g.stroke();
        if (blink || (d.role === 'singer' && d.act === 'sing' && Math.sin(T * 0.9 + d.ph) > 0.6)) { g.beginPath(); g.moveTo(x - hr * 0.48, ey); g.quadraticCurveTo(x - hr * 0.33, ey + hr * 0.08, x - hr * 0.18, ey); g.moveTo(x + hr * 0.18, ey); g.quadraticCurveTo(x + hr * 0.33, ey + hr * 0.08, x + hr * 0.48, ey); g.stroke(); }
        else { g.fillStyle = '#fbf6ee'; g.beginPath(); g.ellipse(x - hr * 0.33, ey, hr * 0.15, hr * 0.085, 0, 0, TAU); g.ellipse(x + hr * 0.33, ey, hr * 0.15, hr * 0.085, 0, 0, TAU); g.fill(); g.fillStyle = ink; g.beginPath(); g.arc(x - hr * 0.31, ey, hr * 0.075, 0, TAU); g.arc(x + hr * 0.35, ey, hr * 0.075, 0, TAU); g.fill(); if (!d.man) { g.strokeStyle = ink; g.lineWidth = Math.max(0.8, h * 0.005); g.beginPath(); g.moveTo(x - hr * 0.5, ey - hr * 0.02); g.lineTo(x - hr * 0.58, ey - hr * 0.1); g.moveTo(x + hr * 0.5, ey - hr * 0.02); g.lineTo(x + hr * 0.58, ey - hr * 0.1); g.stroke(); } }
        g.strokeStyle = shade(skinC, -0.3); g.lineWidth = Math.max(0.7, h * 0.005); g.beginPath(); g.moveTo(x + hr * 0.05, ey + hr * 0.12); g.quadraticCurveTo(x + hr * 0.14, ey + hr * 0.36, x - hr * 0.05, ey + hr * 0.4); g.stroke();
        var sing = d.role === 'singer' && st.on && !reduce && d.act !== 'idle' ? 0.35 + 0.65 * Math.abs(Math.sin(beatPh * Math.PI * 2 + d.ph)) : 0;
        if (sing > 0.1) { g.fillStyle = '#5a1712'; g.beginPath(); g.ellipse(x, ey + hr * 0.62, hr * 0.2, hr * (0.05 + 0.13 * sing), 0, 0, TAU); g.fill(); }
        else { g.strokeStyle = d.man ? shade(skinC, -0.45) : '#a3303a'; g.lineWidth = Math.max(0.8, h * 0.007); g.beginPath(); g.moveTo(x - hr * 0.22, ey + hr * 0.6); g.quadraticCurveTo(x, ey + hr * 0.72, x + hr * 0.22, ey + hr * 0.6); g.stroke(); }
      }
      if (!d.man) {
        // Hair parted in the middle and drawn back, a gajra of jasmine round the bun, maang tikka, bindi, nath and jhumkas
        g.fillStyle = ink; g.beginPath(); g.moveTo(x - hr * 0.95, headY + hr * 0.15); g.quadraticCurveTo(x - hr * 1.05, headY - hr * 1.05, x, headY - hr * 1.12); g.quadraticCurveTo(x + hr * 1.05, headY - hr * 1.05, x + hr * 0.95, headY + hr * 0.15); g.quadraticCurveTo(x + hr * 0.8, headY - hr * 0.5, x + hr * 0.05, headY - hr * 0.72); g.lineTo(x - hr * 0.05, headY - hr * 0.72); g.quadraticCurveTo(x - hr * 0.8, headY - hr * 0.5, x - hr * 0.95, headY + hr * 0.15); g.closePath(); g.fill();
        g.fillStyle = ink; g.beginPath(); g.arc(x, headY - hr * 1.18, hr * 0.42, 0, TAU); g.fill();
        dotRow(alongQuad(x - hr * 0.42, headY - hr * 1.1, x, headY - hr * 1.72, x + hr * 0.42, headY - hr * 1.1, 8), Math.max(0.6, h * 0.0055), '#fffaf0');
        g.strokeStyle = '#c0392b'; g.lineWidth = Math.max(0.6, h * 0.004); g.beginPath(); g.moveTo(x, headY - hr * 1.1); g.lineTo(x, headY - hr * 0.72); g.stroke();
        g.strokeStyle = gold; g.lineWidth = Math.max(0.6, h * 0.005); g.beginPath(); g.moveTo(x, headY - hr * 0.98); g.lineTo(x, headY - hr * 0.62); g.stroke();
        g.fillStyle = gold; g.beginPath(); g.arc(x, headY - hr * 0.57, Math.max(0.8, h * 0.008), 0, TAU); g.fill(); g.fillStyle = '#c0392b'; g.beginPath(); g.arc(x, headY - hr * 0.57, Math.max(0.5, h * 0.004), 0, TAU); g.fill();
        g.fillStyle = '#b3141f'; g.beginPath(); g.arc(x, headY - hr * 0.28, Math.max(0.6, h * 0.0045), 0, TAU); g.fill();
        if (h > 70) { g.strokeStyle = gold; g.lineWidth = Math.max(0.6, h * 0.004); g.beginPath(); g.arc(x - hr * 0.18, headY + hr * 0.38, hr * 0.12, 0, TAU); g.stroke(); g.beginPath(); g.moveTo(x - hr * 0.28, headY + hr * 0.4); g.quadraticCurveTo(x - hr * 0.7, headY + hr * 0.6, x - hr * 0.92, headY + hr * 0.2); g.stroke(); }
        [-1, 1].forEach(function (sd) { var jx = x + sd * hr * 0.95, jy = headY + hr * 0.42, sway = reduce ? 0 : Math.sin(T * 3 + d.ph + sd) * hr * 0.06; g.fillStyle = gold; g.beginPath(); g.arc(jx, jy, Math.max(0.7, h * 0.006), 0, TAU); g.fill(); g.beginPath(); g.moveTo(jx - hr * 0.16 + sway, jy + hr * 0.42); g.quadraticCurveTo(jx + sway, jy - hr * 0.02, jx + hr * 0.16 + sway, jy + hr * 0.42); g.closePath(); g.fill(); dotRow([[jx - hr * 0.1 + sway, jy + hr * 0.48], [jx + sway, jy + hr * 0.5], [jx + hr * 0.1 + sway, jy + hr * 0.48]], Math.max(0.5, h * 0.003), goldHi); });
        // A gold choker with red stones, and a longer rani haar below it
        g.strokeStyle = gold; g.lineWidth = Math.max(1, h * 0.012); g.beginPath(); g.arc(x, y - h * 0.84, h * 0.04, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke();
        dotRow(alongQuad(x - h * 0.034, y - h * 0.82, x, y - h * 0.8, x + h * 0.034, y - h * 0.82, 4), Math.max(0.5, h * 0.004), '#c0392b');
        g.lineWidth = Math.max(0.7, h * 0.006); g.beginPath(); g.moveTo(x - h * 0.05, y - h * 0.805); g.quadraticCurveTo(x, y - h * 0.72, x + h * 0.05, y - h * 0.805); g.stroke();
      } else {
        // His moustache (the dhol player's curls up at the ends), short hair at the temples, and a safa wound in layers
        if (h > 70) { g.strokeStyle = ink; g.lineWidth = Math.max(1, h * 0.009); var mh2 = headY + hr * 0.42, curl = d.role === 'dhol' ? 1 : d.older ? 0.2 : 0.5; g.beginPath(); g.moveTo(x - hr * 0.05, mh2); g.quadraticCurveTo(x - hr * 0.35, mh2 + hr * 0.08, x - hr * 0.5, mh2 - hr * 0.12 * curl); g.moveTo(x + hr * 0.05, mh2); g.quadraticCurveTo(x + hr * 0.35, mh2 + hr * 0.08, x + hr * 0.5, mh2 - hr * 0.12 * curl); g.stroke(); if (d.older) { g.strokeStyle = '#e8e2d6'; g.stroke(); } }
        g.fillStyle = d.older ? '#cfc8bc' : ink; g.fillRect(x - hr * 0.95, headY - hr * 0.35, hr * 0.14, hr * 0.5); g.fillRect(x + hr * 0.81, headY - hr * 0.35, hr * 0.14, hr * 0.5);
        var pc = d.older ? '#f3e6d0' : d.pagdi || '#b8312b';
        if (d.role === 'keys') {
          // The keys player keeps it simple: a small cap
          g.fillStyle = roundLit(pc, x - hr, x + hr); g.beginPath(); g.moveTo(x - hr * 0.98, headY - hr * 0.35); g.lineTo(x - hr * 0.8, headY - hr * 1.15); g.quadraticCurveTo(x, headY - hr * 1.35, x + hr * 0.8, headY - hr * 1.15); g.lineTo(x + hr * 0.98, headY - hr * 0.35); g.quadraticCurveTo(x, headY - hr * 0.55, x - hr * 0.98, headY - hr * 0.35); g.fill();
        } else {
          g.fillStyle = roundLit(pc, x - hr * 1.2, x + hr * 1.2); g.beginPath(); g.moveTo(x - hr * 1.05, headY - hr * 0.25); g.quadraticCurveTo(x - hr * 1.3, headY - hr * 1.5, x, headY - hr * 1.62); g.quadraticCurveTo(x + hr * 1.3, headY - hr * 1.5, x + hr * 1.05, headY - hr * 0.25); g.quadraticCurveTo(x, headY - hr * 0.55, x - hr * 1.05, headY - hr * 0.25); g.fill();
          // The wraps: diagonal folds across the front, each edged in a darker shade, bandhani dots over them
          g.save(); g.clip();
          for (var wf = 0; wf < 5; wf++) { var wy = headY - hr * (0.4 + wf * 0.26); g.strokeStyle = shade(pc, -0.3); g.lineWidth = Math.max(0.7, h * 0.006); g.beginPath(); g.moveTo(x - hr * 1.3, wy + hr * 0.3); g.quadraticCurveTo(x, wy - hr * 0.1, x + hr * 1.3, wy - hr * 0.35); g.stroke(); g.strokeStyle = shade(pc, 0.25); g.lineWidth = Math.max(0.5, h * 0.003); g.beginPath(); g.moveTo(x - hr * 1.3, wy + hr * 0.36); g.quadraticCurveTo(x, wy - hr * 0.04, x + hr * 1.3, wy - hr * 0.29); g.stroke(); }
          g.fillStyle = 'rgba(255,248,230,.6)'; for (var bd = 0; bd < 14; bd++) g.fillRect(x + (((bd * 37) % 20) / 10 - 1) * hr * 0.9, headY - hr * (0.45 + ((bd * 13) % 11) / 10), Math.max(0.6, h * 0.004), Math.max(0.6, h * 0.004));
          g.restore();
          // A kalgi brooch with a little plume, the singer's in gold and pearls
          g.fillStyle = gold; g.beginPath(); g.arc(x + hr * 0.25, headY - hr * 1.05, Math.max(1, h * 0.01), 0, TAU); g.fill();
          if (d.role === 'singer' || d.role === 'dhol') { g.strokeStyle = d.role === 'singer' ? '#fffaf0' : '#f6c342'; g.lineWidth = Math.max(0.8, h * 0.006); g.beginPath(); g.moveTo(x + hr * 0.25, headY - hr * 1.1); g.quadraticCurveTo(x + hr * 0.5, headY - hr * 1.7, x + hr * 0.2, headY - hr * 2.0); g.stroke(); }
          var tail = reduce ? 0 : Math.sin(T * 2.2 + d.ph) * h * 0.012; g.strokeStyle = shade(pc, -0.1); g.lineWidth = Math.max(1.4, h * 0.026); g.beginPath(); g.moveTo(x - hr * 0.9, headY - hr * 0.7); g.quadraticCurveTo(x - h * 0.13 + tail, y - h * 0.86, x - h * 0.115 + tail, y - h * 0.7); g.stroke();
        }
        if (d.role === 'singer') { g.strokeStyle = '#fffaf0'; g.lineWidth = Math.max(0.8, h * 0.006); g.beginPath(); g.arc(x, y - h * 0.83, h * 0.045, 0.12 * Math.PI, 0.88 * Math.PI); g.stroke(); }
      }

      /* Arms: sleeves from the shoulder, bare forearms or long sleeves, bangles, hands */
      var arms = armsFor(d, x, shy, h, sw, walking, false, up, tw), le = arms[0], lh = arms[1], re = arms[2], rh = arms[3];
      var Ls = [x - h * 0.078, shy], Rs = [x + h * 0.078, shy], sleeve = d.man ? main : trim, longSleeve = d.man;
      [[Ls, le, lh], [Rs, re, rh]].forEach(function (arm) {
        var a = arm[0], e = arm[1], hd = arm[2];
        if (longSleeve) { seg(a, e, h * 0.05, h * 0.042, roundLit(sleeve, e[0] - h * 0.03, e[0] + h * 0.03)); seg(e, hd, h * 0.042, h * 0.036, roundLit(sleeve, hd[0] - h * 0.025, hd[0] + h * 0.025)); var cuff = [lerp(e[0], hd[0], 0.86), lerp(e[1], hd[1], 0.86)]; seg(cuff, hd, h * 0.04, h * 0.036, trim); }
        else { var pf = [lerp(a[0], e[0], 0.45), lerp(a[1], e[1], 0.45)]; seg(a, e, h * 0.04, h * 0.034, roundLit(skinC, e[0] - h * 0.025, e[0] + h * 0.025)); seg(e, hd, h * 0.034, h * 0.028, roundLit(skinC, hd[0] - h * 0.02, hd[0] + h * 0.02)); seg(a, pf, h * 0.058, h * 0.052, roundLit(sleeve, pf[0] - h * 0.03, pf[0] + h * 0.03)); g.strokeStyle = gold; g.lineWidth = Math.max(0.7, h * 0.006); g.beginPath(); g.arc(pf[0], pf[1], h * 0.026, 0, TAU); g.stroke(); }
        g.fillStyle = roundLit(skinC, hd[0] - h * 0.02, hd[0] + h * 0.02); g.beginPath(); g.arc(hd[0], hd[1], h * 0.021, 0, TAU); g.fill();
        if (!d.man) { var bgA = [lerp(e[0], hd[0], 0.72), lerp(e[1], hd[1], 0.72)], bgB = [lerp(e[0], hd[0], 0.86), lerp(e[1], hd[1], 0.86)]; g.strokeStyle = '#c0392b'; g.lineWidth = Math.max(0.8, h * 0.009); g.beginPath(); g.moveTo(bgA[0] - h * 0.018, bgA[1]); g.lineTo(bgA[0] + h * 0.018, bgA[1]); g.stroke(); g.strokeStyle = gold; g.beginPath(); g.moveTo(bgB[0] - h * 0.018, bgB[1]); g.lineTo(bgB[0] + h * 0.018, bgB[1]); g.moveTo(lerp(bgA[0], bgB[0], 0.5) - h * 0.018, lerp(bgA[1], bgB[1], 0.5)); g.lineTo(lerp(bgA[0], bgB[0], 0.5) + h * 0.018, lerp(bgA[1], bgB[1], 0.5)); g.stroke(); }
        else if (d.role !== 'keys') { g.strokeStyle = gold; g.lineWidth = Math.max(0.8, h * 0.008); g.beginPath(); g.arc(hd[0], hd[1] - h * 0.02, h * 0.018, 0, Math.PI); g.stroke(); }
      });

      /* What's in their hands */
      if (d.role === 'singer') {
        // The handheld mic: black body, a silver grille that catches the light
        var mx0 = lh[0], my0 = lh[1], ang = -1.1;
        g.strokeStyle = '#1b1b1d'; g.lineWidth = Math.max(1.4, h * 0.022); g.beginPath(); g.moveTo(mx0 + Math.cos(ang + Math.PI) * h * 0.05, my0 + Math.sin(ang + Math.PI) * h * 0.05); g.lineTo(mx0 + Math.cos(ang) * h * 0.035, my0 + Math.sin(ang) * h * 0.035); g.stroke();
        var gx = mx0 + Math.cos(ang) * h * 0.05, gy = my0 + Math.sin(ang) * h * 0.05, gr0 = g.createRadialGradient(gx - h * 0.006, gy - h * 0.006, 0.5, gx, gy, h * 0.022); gr0.addColorStop(0, '#f4f4f6'); gr0.addColorStop(1, '#6b6f75');
        g.fillStyle = gr0; g.beginPath(); g.arc(gx, gy, h * 0.02, 0, TAU); g.fill();
        g.strokeStyle = '#111'; g.lineWidth = Math.max(0.8, h * 0.004); g.beginPath(); g.moveTo(mx0 - h * 0.02, my0 + h * 0.04); g.quadraticCurveTo(mx0 - h * 0.05, y - h * 0.3, x - h * 0.2, groundY); g.stroke();
      }
      if (d.role === 'dhol') {
        // The dhol slung across the waist: lacquered barrel, laced ropes with brass rings, a head at each end,
        // the thick curved dagga in one hand and the thin cane in the other
        var dx0 = x, dy0 = y - h * 0.48, dw = h * 0.19, drr = h * 0.11, bsn = Math.sin(BEAT * Math.PI), hitL = Math.max(0, bsn), hitR = Math.max(0, -bsn);
        g.strokeStyle = '#2a1a10'; g.lineWidth = Math.max(1, h * 0.012); g.beginPath(); g.moveTo(x - h * 0.07, y - h * 0.79); g.lineTo(dx0 + dw * 0.8, dy0 - drr); g.stroke();
        var dg = g.createLinearGradient(0, dy0 - drr, 0, dy0 + drr); dg.addColorStop(0, '#b56a32'); dg.addColorStop(0.35, '#8a4a22'); dg.addColorStop(0.75, '#5c2c12'); dg.addColorStop(1, '#2e1608');
        g.fillStyle = dg; g.beginPath(); g.moveTo(dx0 - dw, dy0 - drr * 0.92); g.quadraticCurveTo(dx0, dy0 - drr * 1.12, dx0 + dw, dy0 - drr * 0.92); g.lineTo(dx0 + dw, dy0 + drr * 0.92); g.quadraticCurveTo(dx0, dy0 + drr * 1.12, dx0 - dw, dy0 + drr * 0.92); g.closePath(); g.fill();
        g.strokeStyle = '#e8d2a0'; g.lineWidth = Math.max(0.6, h * 0.005); g.beginPath(); for (var lz = 0; lz <= 12; lz++) { var lxz = dx0 - dw + lz / 12 * dw * 2, lyz = lz % 2 ? dy0 + drr * 0.95 : dy0 - drr * 0.95; if (lz) g.lineTo(lxz, lyz); else g.moveTo(lxz, lyz); } g.stroke();
        for (var rgi = 1; rgi < 12; rgi += 2) { g.fillStyle = gold; g.beginPath(); g.arc(dx0 - dw + rgi / 12 * dw * 2, dy0 + drr * 0.6, Math.max(0.7, h * 0.006), 0, TAU); g.fill(); }
        g.strokeStyle = TH.flags[0]; g.lineWidth = Math.max(0.8, h * 0.008); g.beginPath(); g.moveTo(dx0 - dw, dy0); g.quadraticCurveTo(dx0, dy0 + drr * 0.12, dx0 + dw, dy0); g.stroke();
        [-1, 1].forEach(function (sd) { g.fillStyle = sd < 0 ? '#efe2c4' : '#e2d2ae'; g.beginPath(); g.ellipse(dx0 + sd * dw, dy0, drr * 0.28, drr, 0, 0, TAU); g.fill(); g.strokeStyle = '#3a2413'; g.lineWidth = Math.max(0.8, h * 0.008); g.stroke(); });
        if (hitL > 0.85) glow(dx0 - dw, dy0, h * 0.08, '#ffe7b0', (hitL - 0.85) * 5);
        if (hitR > 0.85) glow(dx0 + dw, dy0, h * 0.07, '#ffe7b0', (hitR - 0.85) * 5);
        var sl0 = h * 0.2;
        g.strokeStyle = '#3b2213'; g.lineWidth = Math.max(1.4, h * 0.02); g.beginPath(); g.moveTo(lh[0], lh[1]); g.quadraticCurveTo(lh[0] + sl0 * 0.2, lh[1] + sl0 * 0.4, dx0 - dw * 0.95, dy0 - drr * (0.1 + 0.9 * (1 - hitL))); g.stroke();
        g.strokeStyle = '#c9a56b'; g.lineWidth = Math.max(0.8, h * 0.008); g.beginPath(); g.moveTo(rh[0], rh[1]); g.lineTo(dx0 + dw * 0.9, dy0 - drr * (0.15 + 0.9 * (1 - hitR))); g.stroke();
      }
      // Rim light: a thin bright edge down the side the backlight catches
      g.globalCompositeOperation = 'lighter'; g.strokeStyle = 'rgba(' + beam + ',' + 0.35 * bright + ')'; g.lineWidth = Math.max(1, h * 0.008);
      g.beginPath(); g.arc(x, headY, hr * 0.98, -1.25, 0.2); g.moveTo(x + h * 0.086, y - h * 0.79); g.lineTo(x + h * 0.086, y - h * 0.62); g.stroke();
      if (d.flash > 0.05) glow(x, shy - h * 0.27, Math.max(1, h * 0.03 * (1 + d.flash)), '#fff0d0', d.flash);
      g.restore();
    }
    // A mic on a boom stand: tripod legs, the pole, the boom arm, and the mic in its clip
    function micStand(x, y, z) {
      var base = P(x, y, z), top = P(x, y + 1.35, z); if (!base || !top) return;
      var s = base.s, lw = Math.max(0.8, s * 0.018);
      g.strokeStyle = '#161618'; g.lineWidth = lw; g.lineCap = 'round';
      g.beginPath(); g.moveTo(base.x - s * 0.2, base.y + s * 0.02); g.lineTo(base.x, base.y - s * 0.12); g.lineTo(base.x + s * 0.2, base.y + s * 0.02); g.moveTo(base.x, base.y - s * 0.12); g.lineTo(base.x + s * 0.03, base.y + s * 0.05); g.stroke();
      g.beginPath(); g.moveTo(base.x, base.y - s * 0.12); g.lineTo(top.x, top.y); g.lineTo(top.x + s * 0.3, top.y - s * 0.12); g.stroke();
      g.fillStyle = '#2b2b2f'; g.beginPath(); g.arc(top.x, top.y, Math.max(1, s * 0.025), 0, TAU); g.fill();
      if (s > 40) { var gr0 = g.createRadialGradient(top.x + s * 0.3, top.y - s * 0.14, 0.5, top.x + s * 0.32, top.y - s * 0.12, s * 0.045); gr0.addColorStop(0, '#f2f2f4'); gr0.addColorStop(1, '#5d6066'); g.fillStyle = gr0; g.beginPath(); g.arc(top.x + s * 0.33, top.y - s * 0.13, s * 0.035, 0, TAU); g.fill(); }
    }
    // The DJ's booth: a table draped in bandhani, a laptop, a controller that blinks on the beat, a steel jug of chhas
    // and a stack of cups. The DJ sits behind it on a stool, headphones round the neck, sipping chhas from a paper cup.
    var djMan = { role: 'dj', man: true, sitting: true, rest: { y: 0.8 }, col: '#1d1b26', top: '#1d1b26', pagdi: '#1f130d', stole: '#d8453a', legs: '#2a2733', h: 1.74, ph: 0.45, flash: 0, moustache: true, vest: '#8e1b2c' };
    var djTalk = { text: '', t: 0 };
    // A speaker cabinet facing you: grille, woofer that kicks on the beat, a horn tweeter and a maker's plate
    function cabinet(x, y0, z, w, hgt) {
      var a = P(x - w / 2, y0, z), b = P(x + w / 2, y0 + hgt, z); if (!a || !b) return;
      var L = a.x, R = b.x, T0 = b.y, B = a.y, cw = R - L, ch = B - T0; if (cw < 2) return;
      var gr = g.createLinearGradient(L, 0, R, 0); gr.addColorStop(0, '#151414'); gr.addColorStop(0.5, '#222020'); gr.addColorStop(1, '#121111');
      g.fillStyle = gr; g.fillRect(L, T0, cw, ch);
      g.strokeStyle = 'rgba(255,255,255,.12)'; g.lineWidth = Math.max(0.6, cw * 0.02); g.strokeRect(L + 0.5, T0 + 0.5, cw - 1, ch - 1);
      if (cw > 14) { g.fillStyle = 'rgba(255,255,255,.05)'; for (var gy = T0 + ch * 0.08; gy < B - ch * 0.06; gy += Math.max(2, cw * 0.07)) for (var gx = L + cw * 0.08; gx < R - cw * 0.06; gx += Math.max(2, cw * 0.07)) g.fillRect(gx, gy, 1, 1); }
      var wr = cw * 0.36 * (1 + 0.05 * pulse), wy = T0 + ch * 0.62;
      g.strokeStyle = 'rgba(255,255,255,.2)'; g.lineWidth = Math.max(0.7, cw * 0.025); g.beginPath(); g.arc(L + cw / 2, wy, wr, 0, TAU); g.stroke();
      g.fillStyle = '#0b0a0a'; g.beginPath(); g.arc(L + cw / 2, wy, wr * 0.8, 0, TAU); g.fill();
      g.fillStyle = 'rgba(255,255,255,.14)'; g.beginPath(); g.arc(L + cw / 2, wy, wr * 0.22, 0, TAU); g.fill();
      g.fillStyle = '#0b0a0a'; g.beginPath(); g.moveTo(L + cw * 0.3, T0 + ch * 0.12); g.lineTo(R - cw * 0.3, T0 + ch * 0.12); g.lineTo(R - cw * 0.38, T0 + ch * 0.28); g.lineTo(L + cw * 0.38, T0 + ch * 0.28); g.closePath(); g.fill();
      g.fillStyle = 'rgba(232,176,75,.55)'; g.fillRect(L + cw * 0.36, B - ch * 0.08, cw * 0.28, Math.max(1, ch * 0.025));
      if (st.on) glow(R - cw * 0.14, T0 + ch * 0.06, Math.max(0.6, cw * 0.03), '#6dff9a', 0.8);
    }
    // The laptop's logo, lit through the lid: a pineapple with a bite out of it. Drawn once per size on its own
    // canvas, so the bite cuts only the logo.
    var pineCache = {};
    function pineSprite(r) {
      var key = Math.max(3, Math.round(r)), hit = pineCache[key];
      if (hit) return hit;
      var pad = Math.ceil(key * 0.4), size = key * 3 + pad * 2, cv = document.createElement('canvas'); cv.width = cv.height = size;
      var c = cv.getContext('2d'), cx = size / 2, cy = size / 2 + key * 0.25, R = key;
      c.fillStyle = '#ffffff';
      // The crown: five leaves fanning up
      for (var lf = -2; lf <= 2; lf++) {
        var la = -Math.PI / 2 + lf * 0.34, ll = R * (lf === 0 ? 1.05 : Math.abs(lf) === 1 ? 0.9 : 0.68), bx = cx + lf * R * 0.08, by = cy - R * 0.62;
        c.beginPath(); c.moveTo(bx - R * 0.1, by); c.quadraticCurveTo(bx + Math.cos(la - 0.35) * ll * 0.6, by + Math.sin(la - 0.35) * ll * 0.6, bx + Math.cos(la) * ll, by + Math.sin(la) * ll);
        c.quadraticCurveTo(bx + Math.cos(la + 0.35) * ll * 0.6, by + Math.sin(la + 0.35) * ll * 0.6, bx + R * 0.1, by); c.closePath(); c.fill();
      }
      // The body, with its diamond skin
      c.beginPath(); c.ellipse(cx, cy + R * 0.12, R * 0.52, R * 0.72, 0, 0, TAU); c.fill();
      if (R > 5) {
        c.save(); c.beginPath(); c.ellipse(cx, cy + R * 0.12, R * 0.5, R * 0.7, 0, 0, TAU); c.clip();
        c.strokeStyle = 'rgba(130,138,148,.6)'; c.lineWidth = Math.max(0.5, R * 0.05);
        for (var dg = -3; dg <= 3; dg++) { c.beginPath(); c.moveTo(cx - R + dg * R * 0.3, cy - R * 0.7); c.lineTo(cx + R + dg * R * 0.3, cy + R); c.moveTo(cx + R + dg * R * 0.3, cy - R * 0.7); c.lineTo(cx - R + dg * R * 0.3, cy + R); c.stroke(); }
        c.restore();
      }
      // The bite out of its right side
      c.globalCompositeOperation = 'destination-out';
      c.beginPath(); c.arc(cx + R * 0.6, cy - R * 0.02, R * 0.24, 0, TAU); c.fill();
      hit = pineCache[key] = { cv: cv, size: size, ox: cx, oy: cy };
      return hit;
    }
    function pineapple(cx, cy, r) {
      var sp = pineSprite(r), k = r / Math.max(3, Math.round(r));
      g.save();
      g.globalAlpha = 0.62 + 0.3 * bright;
      g.shadowColor = 'rgba(210,230,255,' + 0.8 * bright + ')'; g.shadowBlur = r * 0.9;
      g.drawImage(sp.cv, cx - sp.ox * k, cy - sp.oy * k, sp.size * k, sp.size * k);
      g.restore();
    }
    function djBooth(b, t) {
      var x = b.x, z = b.z, tw = 0.8, th = 0.74, td = 0.34, near = P(x, th, z - td);
      if (st.djSay !== djTalk.text) { djTalk.text = st.djSay; djTalk.t0 = performance.now(); }
      djTalk.t = (performance.now() - (djTalk.t0 || 0)) / 1000; djMan.talking = !!djTalk.text && djTalk.t < 1.6;
      // The stall: two bamboo poles and a crossbar, with a mirror-work toran and a sagging string of bulbs
      var ph0 = 2.45, pz = z + 0.95, poles = [-1.15, 1.15].map(function (u) { return [P(x + u, 0, pz), P(x + u, ph0, pz)]; });
      if (poles[0][0] && poles[0][1] && poles[1][0] && poles[1][1]) {
        g.strokeStyle = '#9b7a45'; g.lineWidth = Math.max(1, poles[0][0].s * 0.06);
        g.beginPath(); poles.forEach(function (p) { g.moveTo(p[0].x, p[0].y); g.lineTo(p[1].x, p[1].y); }); g.moveTo(poles[0][1].x, poles[0][1].y); g.lineTo(poles[1][1].x, poles[1][1].y); g.stroke();
        g.strokeStyle = 'rgba(60,40,20,.5)'; g.lineWidth = Math.max(0.6, poles[0][0].s * 0.012);
        poles.forEach(function (p) { for (var nd = 1; nd < 5; nd++) { var ny = lerp(p[0].y, p[1].y, nd / 5); g.beginPath(); g.moveTo(p[0].x - p[0].s * 0.035, ny); g.lineTo(p[0].x + p[0].s * 0.035, ny); g.stroke(); } });
        // Marigold strings wound down the poles
        poles.forEach(function (p, pi) { for (var mk = 0; mk < 14; mk++) { var mu = mk / 14, my = lerp(p[1].y, p[0].y, mu * 0.75), mx = p[0].x + Math.sin(mu * 18 + pi) * p[0].s * 0.04; g.fillStyle = mk % 3 ? '#f08a24' : '#f6c342'; g.beginPath(); g.arc(mx, my, Math.max(0.8, p[0].s * 0.03), 0, TAU); g.fill(); } });
        for (var tk = 0; tk < 13; tk++) {
          var tu = (tk + 0.5) / 13, ta = P(lerp(x - 1.15, x + 1.15, tu - 0.5 / 13), ph0, pz), tb = P(lerp(x - 1.15, x + 1.15, tu + 0.5 / 13), ph0, pz), tp = P(lerp(x - 1.15, x + 1.15, tu), ph0 - 0.22 - (tk % 2) * 0.05 + (reduce ? 0 : Math.sin(t * 1.4 + tk) * 0.015), pz);
          if (!ta || !tb || !tp) continue;
          g.fillStyle = TH.flags[tk % TH.flags.length]; g.beginPath(); g.moveTo(ta.x, ta.y); g.lineTo(tb.x, tb.y); g.lineTo(tp.x, tp.y); g.closePath(); g.fill();
          glow((ta.x + tb.x + tp.x) / 3, (ta.y + tb.y + tp.y) / 3, Math.max(0.6, ta.s * 0.014), '#ffffff', 0.35 + 0.35 * Math.max(0, Math.sin(t * 2 + tk)));
        }
        for (var k = 0; k <= 10; k++) { var u = k / 10, bp = P(lerp(x - 1.15, x + 1.15, u), ph0 - 0.35 - Math.sin(u * Math.PI) * 0.28, pz); if (bp) glow(bp.x, bp.y, Math.max(0.7, Math.min(3, bp.s * 0.05)), TH.bulbs[k % TH.bulbs.length], (0.75 + 0.25 * pulse) * bright); }
      }
      // Speakers on tripod stands at each end of the table
      [-1, 1].forEach(function (sd) {
        var sx = x + sd * 1.28, sb0 = P(sx, 0, z + 0.2), sb1 = P(sx, 1.22, z + 0.2); if (!sb0 || !sb1) return;
        g.strokeStyle = '#1b1814'; g.lineWidth = Math.max(1, sb0.s * 0.025); g.beginPath(); g.moveTo(sb0.x - sb0.s * 0.22, sb0.y); g.lineTo(sb1.x, sb1.y - sb1.s * 0.5); g.lineTo(sb0.x + sb0.s * 0.22, sb0.y); g.moveTo(sb0.x, sb0.y - sb0.s * 0.05); g.lineTo(sb1.x, sb1.y); g.stroke();
        cabinet(sx, 1.2, z + 0.2, 0.44, 0.66);
      });
      // The DJ on his stool, lit from below by the screen
      var dp = P(x, 0.8, z + 0.55);
      if (dp) {
        var stool = P(x, 0, z + 0.55); if (stool) { g.strokeStyle = '#3a2a1c'; g.lineWidth = Math.max(1, stool.s * 0.05); g.beginPath(); g.moveTo(stool.x - stool.s * 0.18, stool.y); g.lineTo(dp.x, dp.y); g.lineTo(stool.x + stool.s * 0.18, stool.y); g.stroke(); }
        var glowR = dp.s * 0.9, lg0 = g.createRadialGradient(dp.x, dp.y - dp.s * 1.1, 1, dp.x, dp.y - dp.s * 1.1, glowR); lg0.addColorStop(0, 'rgba(170,200,255,' + 0.22 * bright + ')'); lg0.addColorStop(1, 'rgba(170,200,255,0)'); g.fillStyle = lg0; g.beginPath(); g.arc(dp.x, dp.y - dp.s * 1.1, glowR, 0, TAU); g.fill();
        figure(dp, djMan, T, false, BEAT, 1);
      }
      // Table top with a lit edge, and a maroon bandhani cloth with gold borders
      fillPoly([[x - tw, th, z - td], [x + tw, th, z - td], [x + tw, th, z + td], [x - tw, th, z + td]], '#4a2e1b');
      fillPoly([[x - tw, th - 0.03, z - td], [x + tw, th - 0.03, z - td], [x + tw, th, z - td], [x - tw, th, z - td]], '#7a5232');
      fillPoly([[x - tw, 0, z - td], [x + tw, 0, z - td], [x + tw, th - 0.03, z - td], [x - tw, th - 0.03, z - td]], '#8e1b2c');
      fillPoly([[x - tw, th - 0.15, z - td - 0.005], [x + tw, th - 0.15, z - td - 0.005], [x + tw, th - 0.03, z - td - 0.005], [x - tw, th - 0.03, z - td - 0.005]], '#e8b04b');
      fillPoly([[x - tw, 0, z - td - 0.005], [x + tw, 0, z - td - 0.005], [x + tw, 0.07, z - td - 0.005], [x - tw, 0.07, z - td - 0.005]], '#e8b04b');
      if (near && near.s > 40) {
        // Bandhani: rows of tiny tie-dye dots in white and yellow, sparser near the sign
        for (var br = 0; br < 5; br++) for (var bc = 0; bc < 22; bc++) {
          var bu = (bc + (br % 2) * 0.5 + 0.5) / 22.5, bq = P(lerp(x - tw, x + tw, bu), 0.12 + br * 0.1, z - td - 0.01); if (!bq) continue;
          if (Math.abs(bu - 0.5) < 0.2 && br > 0 && br < 4) continue;
          g.fillStyle = (br + bc) % 3 ? 'rgba(255,246,230,.8)' : 'rgba(246,195,66,.85)'; g.beginPath(); g.arc(bq.x, bq.y, Math.max(0.6, bq.s * 0.009), 0, TAU); g.fill();
        }
      }
      // Mirror-work triangles hanging from the table's front edge, then a marigold scallop
      for (var mt = 0; mt < 16; mt++) { var m0 = P(lerp(x - tw, x + tw, mt / 16), th - 0.15, z - td - 0.015), m1 = P(lerp(x - tw, x + tw, (mt + 1) / 16), th - 0.15, z - td - 0.015), m2 = P(lerp(x - tw, x + tw, (mt + 0.5) / 16), th - 0.26, z - td - 0.015); if (!m0 || !m1 || !m2) continue; g.fillStyle = mt % 2 ? '#2f8f5b' : '#c2185b'; g.beginPath(); g.moveTo(m0.x, m0.y); g.lineTo(m1.x, m1.y); g.lineTo(m2.x, m2.y); g.closePath(); g.fill(); if (m0.s > 30) glow((m0.x + m1.x) / 2, m0.y + (m2.y - m0.y) * 0.4, Math.max(0.6, m0.s * 0.01), '#ffffff', 0.5 + 0.4 * Math.max(0, Math.sin(t * 3 + mt))); }
      for (var mg = 0; mg <= 24; mg++) { var mu2 = mg / 24, mq = P(lerp(x - tw, x + tw, mu2), th - 0.03 - Math.abs(Math.sin(mu2 * Math.PI * 4)) * 0.06, z - td - 0.02); if (mq && mq.s > 6) { g.fillStyle = mg % 3 ? '#f08a24' : '#f6c342'; g.beginPath(); g.arc(mq.x, mq.y, Math.max(0.8, mq.s * 0.026), 0, TAU); g.fill(); } }
      // A lit sign board on the cloth: DJ in neon inside a ring of marquee bulbs
      var sgA = P(x - 0.25, 0.22, z - td - 0.02), sgB = P(x + 0.25, 0.46, z - td - 0.02);
      if (sgA && sgB && sgA.s > 10) {
        var sL = sgA.x, sR = sgB.x, sT = sgB.y, sB = sgA.y, nc = 'rgb(' + TH.beams[0] + ')';
        g.fillStyle = '#140c0a'; roundRect(sL, sT, sR - sL, sB - sT, (sB - sT) * 0.2); g.fill();
        for (var mb = 0; mb < 16; mb++) { var mu3 = mb / 16, per = mu3 * 2 * ((sR - sL) + (sB - sT)), bx0, by0, wq = sR - sL, hq = sB - sT; if (per < wq) { bx0 = sL + per; by0 = sT; } else if (per < wq + hq) { bx0 = sR; by0 = sT + per - wq; } else if (per < 2 * wq + hq) { bx0 = sR - (per - wq - hq); by0 = sB; } else { bx0 = sL; by0 = sB - (per - 2 * wq - hq); } glow(bx0, by0, Math.max(0.6, sgA.s * 0.012), TH.bulbs[mb % TH.bulbs.length], Math.floor(t * 4) % 2 === mb % 2 ? 1 : 0.45); }
        var nf = (sB - sT) * 0.62;
        g.save(); g.font = '800 ' + nf + 'px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.shadowColor = nc; g.shadowBlur = nf * (0.5 + 0.4 * pulse); g.fillStyle = '#fff6e6'; g.fillText('DJ', (sL + sR) / 2, (sT + sB) / 2 + nf * 0.04);
        g.restore();
      }
      // Laptop: an aluminium lid facing you, stickers on it, the screen's light leaking over the top
      var l0 = P(x - 0.36, th + 0.012, z + 0.02), l1 = P(x + 0.1, th + 0.012, z + 0.02), l2 = P(x + 0.1, th + 0.3, z + 0.1), l3 = P(x - 0.36, th + 0.3, z + 0.1);
      if (l0 && l1 && l2 && l3) {
        var bs0 = P(x - 0.38, th, z - 0.04), bs1 = P(x + 0.12, th + 0.014, z - 0.04); if (bs0 && bs1) { g.fillStyle = '#9ea3aa'; g.fillRect(bs0.x, bs1.y, bs1.x - bs0.x, Math.max(1.5, bs0.y - bs1.y + 1)); }
        var alu = g.createLinearGradient(l3.x, l3.y, l1.x, l1.y); alu.addColorStop(0, '#c5c9cf'); alu.addColorStop(0.55, '#9da2a9'); alu.addColorStop(1, '#7d8289');
        g.fillStyle = alu; g.beginPath(); g.moveTo(l0.x, l0.y); g.lineTo(l1.x, l1.y); g.lineTo(l2.x, l2.y); g.lineTo(l3.x, l3.y); g.closePath(); g.fill();
        g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 1; g.stroke();
        var rim = g.createLinearGradient(0, l3.y - 6, 0, l3.y + 2); rim.addColorStop(0, 'rgba(170,200,255,0)'); rim.addColorStop(1, 'rgba(170,200,255,' + 0.55 * bright + ')'); g.fillStyle = rim; g.fillRect(l3.x, l3.y - 6, l2.x - l3.x, 8);
        var lw0 = l1.x - l0.x;
        if (lw0 > 20) {
          var gc = P(x - 0.13, th + 0.15, z + 0.06); if (gc) pineapple(gc.x, gc.y, lw0 * 0.15);
          var st1 = P(x - 0.3, th + 0.24, z + 0.09); if (st1) { g.save(); g.translate(st1.x, st1.y); g.rotate(-0.25); g.fillStyle = '#f6c342'; roundRect(0, 0, lw0 * 0.16, lw0 * 0.07, lw0 * 0.02); g.fill(); g.fillStyle = '#8e1b2c'; g.font = '700 ' + Math.max(4, lw0 * 0.045) + 'px system-ui'; g.textBaseline = 'middle'; g.fillText('ગરબા', lw0 * 0.015, lw0 * 0.036); g.restore(); }
          var st2 = P(x + 0.03, th + 0.07, z + 0.04); if (st2) { g.fillStyle = '#2f8f5b'; g.beginPath(); for (var sp2 = 0; sp2 < 10; sp2++) { var sa = sp2 / 10 * TAU - Math.PI / 2, sr = sp2 % 2 ? lw0 * 0.025 : lw0 * 0.055; g.lineTo(st2.x + Math.cos(sa) * sr, st2.y + Math.sin(sa) * sr); } g.closePath(); g.fill(); }
        }
      }
      // Controller: two jog wheels turning with the music, a mixer with faders and knobs, pads lighting on the beat
      var c0 = P(x + 0.16, th + 0.01, z - 0.2), c1 = P(x + 0.7, th + 0.05, z - 0.2);
      if (c0 && c1) {
        var cw0 = c1.x - c0.x, cy0 = c1.y, chh = Math.max(3, c0.y - c1.y + c0.s * 0.03);
        g.fillStyle = '#16161a'; roundRect(c0.x, cy0, cw0, chh, chh * 0.25); g.fill(); g.strokeStyle = 'rgba(255,255,255,.12)'; g.lineWidth = 1; g.stroke();
        [0.2, 0.8].forEach(function (u, ji) { var jx = c0.x + cw0 * u, jy = cy0 + chh * 0.45, jr = cw0 * 0.15, ang = reduce ? 0 : T * 3 * (ji ? -1 : 1); g.fillStyle = '#2a2b31'; g.beginPath(); g.ellipse(jx, jy, jr, jr * 0.38, 0, 0, TAU); g.fill(); g.strokeStyle = 'rgba(' + TH.beams[ji % TH.beams.length] + ',.8)'; g.lineWidth = Math.max(0.8, jr * 0.08); g.beginPath(); g.ellipse(jx, jy, jr, jr * 0.38, 0, 0, TAU); g.stroke(); g.strokeStyle = 'rgba(255,255,255,.7)'; g.beginPath(); g.moveTo(jx, jy); g.lineTo(jx + Math.cos(ang) * jr * 0.8, jy + Math.sin(ang) * jr * 0.3); g.stroke(); });
        for (var fd = 0; fd < 3; fd++) { var fx = c0.x + cw0 * (0.43 + fd * 0.07), fy = cy0 + chh * (0.3 + 0.35 * (0.5 + 0.5 * Math.sin(T * 0.7 + fd * 2))); g.fillStyle = '#000'; g.fillRect(fx - 0.5, cy0 + chh * 0.2, 1, chh * 0.6); g.fillStyle = '#d9d9de'; g.fillRect(fx - cw0 * 0.012, fy - 1, cw0 * 0.024, 2); }
        for (var kn = 0; kn < 4; kn++) { g.fillStyle = '#8c8f96'; g.beginPath(); g.arc(c0.x + cw0 * (0.4 + (kn % 2) * 0.2), cy0 + chh * (kn < 2 ? 0.14 : 0.86), Math.max(0.7, cw0 * 0.012), 0, TAU); g.fill(); }
        for (var pd = 0; pd < 8; pd++) { var pside = pd < 4 ? 0.2 : 0.8, px0 = c0.x + cw0 * (pside - 0.09 + (pd % 4) * 0.06), py0 = cy0 + chh * 0.88; g.fillStyle = (Math.floor(BEAT * 2) + pd) % 4 === 0 ? 'rgb(' + TH.beams[pd % TH.beams.length] + ')' : 'rgba(255,255,255,.12)'; g.fillRect(px0, py0 - Math.max(1, chh * 0.08), Math.max(1.5, cw0 * 0.045), Math.max(1, chh * 0.08)); }
      }
      // A small brass diya, the steel jug of chhas and a stack of paper cups
      var dy = P(x + 0.72, th, z + 0.12); if (dy) { var dr = Math.max(1.2, dy.s * 0.04); g.fillStyle = '#b8862e'; g.beginPath(); g.ellipse(dy.x, dy.y, dr, dr * 0.45, 0, 0, Math.PI); g.fill(); glow(dy.x, dy.y - dr * 0.9, dr * (0.9 + 0.15 * Math.sin(t * 9)), '#ffcf7a', 0.95); }
      var jg = P(x - 0.62, th, z - 0.05), jt = P(x - 0.62, th + 0.2, z - 0.05);
      if (jg && jt) { var jw = jg.s * 0.07; var jgr = g.createLinearGradient(jg.x - jw, 0, jg.x + jw, 0); jgr.addColorStop(0, '#6f7378'); jgr.addColorStop(0.45, '#e6e9ec'); jgr.addColorStop(1, '#7c8086'); g.fillStyle = jgr; g.beginPath(); g.moveTo(jg.x - jw, jg.y); g.lineTo(jg.x + jw, jg.y); g.lineTo(jt.x + jw * 0.75, jt.y); g.lineTo(jt.x - jw * 0.75, jt.y); g.closePath(); g.fill(); g.strokeStyle = 'rgba(80,84,90,.9)'; g.lineWidth = Math.max(1, jw * 0.12); g.beginPath(); g.arc(jg.x + jw * 1.05, lerp(jg.y, jt.y, 0.55), jw * 0.45, -Math.PI / 2, Math.PI / 2); g.stroke(); }
      var cs = P(x - 0.45, th, z - 0.18), ct2 = P(x - 0.45, th + 0.14, z - 0.18);
      if (cs && ct2) { var cw = cs.s * 0.035; g.fillStyle = '#f4efe4'; g.beginPath(); g.moveTo(cs.x - cw * 0.8, cs.y); g.lineTo(cs.x + cw * 0.8, cs.y); g.lineTo(ct2.x + cw, ct2.y); g.lineTo(ct2.x - cw, ct2.y); g.closePath(); g.fill(); g.strokeStyle = 'rgba(0,0,0,.18)'; g.lineWidth = 0.7; for (var cl = 1; cl < 4; cl++) { var cy = lerp(cs.y, ct2.y, cl / 4); g.beginPath(); g.moveTo(cs.x - cw * 0.9, cy); g.lineTo(cs.x + cw * 0.9, cy); g.stroke(); } }
      if (djTalk.text && djTalk.t < 3.2) djBubble(dp, djTalk);
    }
    // What the DJ says: a round speech bubble centred over his head, its tail pointing down at him
    function djBubble(dp, talk) {
      if (!dp) return;
      var h = djMan.h * dp.s, hx = dp.x, headTop = dp.y + 0.48 * h - h * 1.0;
      var pop = reduce ? 1 : Math.min(1, talk.t / 0.2), ease0 = 1 - Math.pow(1 - pop, 3), fadeOut = Math.max(0, Math.min(1, (3.2 - talk.t) / 0.4)), k = 0.7 + 0.3 * ease0;
      var fs = Math.max(15, Math.min(32, h * 0.08)) * k;
      g.save(); g.globalAlpha = fadeOut; g.font = '700 ' + fs + 'px ' + GU_FONT; g.textAlign = 'center'; g.textBaseline = 'middle';
      var tw0 = g.measureText(talk.text).width, bw = tw0 + fs * 1.6, bh = fs * 2, tail = fs * 0.7, gap = fs * 0.35;
      var by = headTop - gap - tail - bh, bx = hx - bw / 2;
      bx = Math.max(8, Math.min(W - bw - 8, bx)); by = Math.max(8, by);
      var tx = Math.max(bx + bh * 0.5, Math.min(bx + bw - bh * 0.5, hx));
      g.shadowColor = 'rgba(0,0,0,.4)'; g.shadowBlur = 12; g.shadowOffsetY = 3;
      g.fillStyle = '#fff8ec'; roundRect(bx, by, bw, bh, bh / 2); g.fill();
      g.shadowBlur = 0; g.shadowOffsetY = 0;
      g.beginPath(); g.moveTo(tx - tail * 0.6, by + bh - 1); g.quadraticCurveTo(tx, by + bh + tail * 0.3, hx, headTop - gap); g.quadraticCurveTo(tx + tail * 0.2, by + bh + tail * 0.2, tx + tail * 0.6, by + bh - 1); g.closePath(); g.fill();
      g.strokeStyle = 'rgba(232,176,75,.9)'; g.lineWidth = Math.max(1.5, fs * 0.08); roundRect(bx + 1.5, by + 1.5, bw - 3, bh - 3, bh / 2 - 1.5); g.stroke();
      g.fillStyle = '#6b1420'; g.fillText(talk.text, bx + bw / 2, by + bh * 0.54);
      g.restore();
    }
    // Life round the booth: kids dancing, a friend on a chair with his phone, a water cooler, crates of cold drinks,
    // stacked chairs and a few stones. Made once per venue and drawn in depth with everything else.
    var djLife = {};
    function djAround(id) {
      if (djLife[id]) return djLife[id];
      var b = DJ[id], out = { people: [], props: [] };
      out.people.push({ x: b.x - 1.75, z: b.z + 0.45, d: person({ kid: true, man: false, h: 1.0, col: '#c2185b', top: '#f6c342' }) });
      out.people.push({ x: b.x - 2.2, z: b.z + 0.95, d: person({ kid: true, h: 1.12, man: true, col: '#2f6fa8', top: '#2f6fa8', pagdi: '#1f130d', ph: 1.2 }) });
      out.people.push({ x: b.x + 1.85, z: b.z + 0.75, seat: true, d: person({ man: true, sitting: true, rest: { y: 0.45 }, holding: 'phone', col: '#f3e6d0', top: '#3b4cc0', h: 1.72 }) });
      out.people.push({ x: b.x + 0.98, z: b.z + 0.02, d: person({ kid: true, stander: true, h: 0.98, man: true, col: '#e67e22', top: '#e67e22', pagdi: '#1f130d', sway: 0.3 }) });
      out.people.push({ x: b.x - 2.6, z: b.z + 0.1, d: person({ stander: true, man: false, holding: 'tea', col: '#2f8f5b', top: '#d6a24a', h: 1.6, sway: 1.1 }) });
      out.props.push({ kind: 'cooler', x: b.x - 1.6, z: b.z + 0.55 });
      out.props.push({ kind: 'crates', x: b.x - 1.95, z: b.z + 0.05 });
      out.props.push({ kind: 'chairs', x: b.x + 2.4, z: b.z + 1.25 });
      out.props.push({ kind: 'plasticChair', x: b.x + 1.85, z: b.z + 0.75, col: '#2f6fa8' });
      [[-1.1, -0.75, 0.13], [-0.7, -0.9, 0.1], [1.15, -0.8, 0.12], [1.5, -0.6, 0.09], [2.0, -0.2, 0.14]].forEach(function (s0) { out.props.push({ kind: 'stone', x: b.x + s0[0], z: b.z + s0[1], r: s0[2] }); });
      djLife[id] = out; return out;
    }
    function djProp(o, t) {
      if (o.kind === 'stone') { var p = P(o.x, 0, o.z); if (!p) return; var r = o.r * p.s; g.fillStyle = '#6d6259'; g.beginPath(); g.ellipse(p.x, p.y - r * 0.35, r, r * 0.55, 0, Math.PI, 0); g.lineTo(p.x + r, p.y); g.lineTo(p.x - r, p.y); g.fill(); g.fillStyle = 'rgba(255,240,220,.12)'; g.beginPath(); g.ellipse(p.x - r * 0.3, p.y - r * 0.6, r * 0.4, r * 0.15, 0, 0, TAU); g.fill(); return; }
      if (o.kind === 'cooler') {
        // A blue water drum on a stand with a tap and a steel glass on a chain
        fillPoly([[o.x - 0.25, 0, o.z], [o.x + 0.25, 0, o.z], [o.x + 0.25, 0.5, o.z], [o.x - 0.25, 0.5, o.z]], '#3a2a1c');
        var c0 = P(o.x - 0.24, 0.5, o.z - 0.01), c1 = P(o.x + 0.24, 1.08, o.z - 0.01); if (!c0 || !c1) return;
        var bg = g.createLinearGradient(c0.x, 0, c1.x, 0); bg.addColorStop(0, '#1d4f8a'); bg.addColorStop(0.45, '#3f7fc4'); bg.addColorStop(1, '#173f6e');
        g.fillStyle = bg; roundRect(c0.x, c1.y, c1.x - c0.x, c0.y - c1.y, (c1.x - c0.x) * 0.18); g.fill();
        g.strokeStyle = 'rgba(255,255,255,.2)'; g.lineWidth = 1; [0.3, 0.7].forEach(function (u) { var yy = lerp(c1.y, c0.y, u); g.beginPath(); g.moveTo(c0.x, yy); g.lineTo(c1.x, yy); g.stroke(); });
        var tp0 = P(o.x, 0.58, o.z - 0.02); if (tp0) { g.fillStyle = '#c9ccd1'; g.fillRect(tp0.x - tp0.s * 0.02, tp0.y - tp0.s * 0.02, tp0.s * 0.04, tp0.s * 0.07); }
        return;
      }
      if (o.kind === 'crates') {
        // Two red crates of cold drinks, bottle caps showing
        for (var cr = 0; cr < 2; cr++) { var y0 = cr * 0.28, xo = cr * 0.04; fillPoly([[o.x - 0.3 + xo, y0, o.z], [o.x + 0.3 + xo, y0, o.z], [o.x + 0.3 + xo, y0 + 0.27, o.z], [o.x - 0.3 + xo, y0 + 0.27, o.z]], cr ? '#a8201a' : '#8c1a15'); var cp = P(o.x + xo, y0 + 0.2, o.z - 0.01); if (cp && cp.s > 30) { g.fillStyle = 'rgba(0,0,0,.35)'; for (var hs = -2; hs <= 2; hs++) g.fillRect(cp.x + hs * cp.s * 0.1 - cp.s * 0.03, cp.y - cp.s * 0.04, cp.s * 0.06, cp.s * 0.05); } }
        for (var bt = 0; bt < 5; bt++) { var bq = P(o.x - 0.22 + bt * 0.11 + 0.04, 0.6, o.z + 0.1); if (bq) { g.fillStyle = bt % 2 ? '#e8b04b' : '#d8453a'; g.beginPath(); g.arc(bq.x, bq.y, Math.max(0.8, bq.s * 0.025), 0, TAU); g.fill(); } }
        return;
      }
      if (o.kind === 'chairs') { for (var sc = 0; sc < 5; sc++) plasticChair(o.x, o.z, '#ece6da', sc * 0.09); return; }
      if (o.kind === 'plasticChair') plasticChair(o.x, o.z, o.col, 0);
    }
    // A moulded plastic chair seen from the front: seat, splayed legs and a slatted back
    function plasticChair(x, z, col, lift) {
      var y = 0.45 + (lift || 0);
      fillPoly([[x - 0.22, y, z - 0.2], [x + 0.22, y, z - 0.2], [x + 0.22, y, z + 0.2], [x - 0.22, y, z + 0.2]], col);
      var lf = [[-0.22, -0.2], [0.22, -0.2], [-0.21, 0.2], [0.21, 0.2]];
      g.strokeStyle = col; lf.forEach(function (l) { var a = P(x + l[0] * 1.08, lift || 0, z + l[1] * 1.05), b = P(x + l[0], y, z + l[1]); if (a && b) { g.lineWidth = Math.max(1, a.s * 0.03); g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke(); } });
      fillPoly([[x - 0.22, y, z + 0.2], [x + 0.22, y, z + 0.2], [x + 0.2, y + 0.45, z + 0.24], [x - 0.2, y + 0.45, z + 0.24]], col);
      var sl0 = P(x, y + 0.15, z + 0.215); if (sl0 && sl0.s > 25) { g.fillStyle = 'rgba(0,0,0,.18)'; for (var sl = -2; sl <= 2; sl++) g.fillRect(sl0.x + sl * sl0.s * 0.07 - sl0.s * 0.012, sl0.y - sl0.s * 0.12, sl0.s * 0.024, sl0.s * 0.2); }
    }
    // What each singer is doing: a small plan that keeps changing, so they never loop. They sing at a spot with
    // their own gestures, stroll to another spot along the front, wave to the crowd, and now and then dance a few
    // garba steps, clapping on the beat. With the music stopped they chat and wait.
    // The singers on stage are the song's singers: one, two or three of them, each dressed for who they are and
    // wearing their portrait when there is one. The page sends the lineup and a key for the song; a new key walks
    // the old lineup off stage left and the new one on from the right.
    var WOMEN_DRESS = [{ col: '#c2185b', top: '#f0c24b', odhni: '#f0c24b' }, { col: '#2f8f5b', top: '#e8a33d', odhni: '#c0392b' }, { col: '#6b2a8e', top: '#f3e6d0', odhni: '#e8b04b' }];
    var MEN_DRESS = [{ col: '#f0c24b', top: '#8e44ad', pagdi: '#b8312b' }, { col: '#f3e6d0', top: '#8e1b2c', pagdi: '#e67e22' }, { col: '#3b4cc0', top: '#e8b04b', pagdi: '#c0392b' }];
    var DEFAULT_LINEUP = [{ man: false }, { man: true }];
    var faceCache = {}, lineupKeys = {}, outKeys = {}, pace = { p: null };
    // The song's pace, read from its progress: how long it runs and how much is left. Only the song's own position
    // counts, so a pause holds it.
    function paceFrom(pr) {
      var now = performance.now() / 1000;
      if (pace.p == null || pr < pace.p - 0.002 || pr - pace.p > 0.15) { pace = { p: pr, p0: pr, t0: now, t: now, rate: 0 }; return; }
      if (pr <= pace.p) return;
      if (now - pace.t > 1.5) { pace.p0 = pace.p; pace.t0 = now - 0.25; }
      pace.p = pr; pace.t = now;
      if (now - pace.t0 >= 2) pace.rate = (pr - pace.p0) / (now - pace.t0);
    }
    function songLeft() { return pace.rate > 0 && pace.p != null ? (1 - pace.p) / pace.rate : Infinity; }
    // A singer walks on or off in a little over two seconds whatever the stage's width, so a change of song reads as
    // one five-second handover: the old lineup off to the left, then the new one in from the right.
    function walkPace(from, to) { return Math.max(1.3, Math.min(4.5, Math.abs(to - from) / 2.3)); }
    function leaveLineup(b, o, lead) {
      var n = 0;
      b.forEach(function (m) {
        if (m.role !== 'singer' || m.leaving || m.waiting) return;
        m.wingL = o.x0 + 0.2; m.wingR = o.x1 - 0.2; m.leaving = true; m.entering = false; m.act = 'exit'; m.tx = o.x0 + 0.2;
        m.spd = walkPace(m.cx == null ? m.x : m.cx, m.tx); m.leaveAt = T + lead + n++ * 0.25; m.cue = null;
        m.wingAt = m.tx; m.fadeSpan = Math.max(0.3, Math.min(1.3, Math.abs((m.cx == null ? m.x : m.cx) - m.tx) * 0.8));
      });
      return n;
    }
    // Your view walks back from the DJ's table before the handover starts, so you see it
    function camLead() { return walk ? Math.max(0, walk.dur - walk.t) + 0.2 : 0; }
    function faceImg(url) {
      var r = faceCache[url];
      if (!r) { r = faceCache[url] = { img: null }; var im = new Image(); im.decoding = 'async'; im.onload = function () { r.img = im; }; im.src = url; }
      return r.img;
    }
    function lineupFor(list) {
      var src = (list && list.length ? list : DEFAULT_LINEUP).slice(0, 3), known = src.filter(function (x) { return x.man === true || x.man === false; });
      // Singers the page couldn't place get the voice the lineup is missing, so a duet is a man and a woman
      var nextMan = known.length ? !known[known.length - 1].man : false;
      return src.map(function (x) {
        var man = x.man;
        if (man !== true && man !== false) { man = nextMan; nextMan = !nextMan; }
        return { man: man, url: x.url || null, name: x.name || '' };
      });
    }
    function syncLineup(id, o) {
      var b = band[id], key = st.songKey || 'default', list = st.singers;
      var lineKey = key + '|' + (list || []).map(function (x) { return (x.name || '') + (x.man ? 'm' : 'w'); }).join(',');
      if (lineupKeys[id] === lineKey) return;
      var instant = lineupKeys[id] == null || lineupKeys[id].indexOf('default|') === 0 || reduce;
      lineupKeys[id] = lineKey; outKeys[id] = null;
      var w = o.x1 - o.x0, mid = (o.x0 + o.x1) / 2, now = T, lead = camLead();
      // Songs skipped quickly: singers who hadn't come on yet never do, and any still walking on turn back
      for (var k1 = b.length - 1; k1 >= 0; k1--) if (b[k1].role === 'singer' && b[k1].waiting) b.splice(k1, 1);
      b.forEach(function (m) { if (m.role === 'singer' && m.entering) { m.entering = false; m.leaving = true; m.act = 'exit'; m.tx = o.x1 - 0.2; m.leaveAt = now; m.wingAt = m.tx; m.fadeSpan = Math.max(0.3, Math.min(1.3, Math.abs(m.cx - m.tx) * 0.8)); } });
      if (instant) for (var k0 = b.length - 1; k0 >= 0; k0--) if (b[k0].role === 'singer') b.splice(k0, 1);
      var old = instant ? 0 : leaveLineup(b, o, lead);
      var lu = lineupFor(list), wi = 0, mi = 0;
      // Each singer has a lane of their own across the front, wide enough to walk and dance in without meeting the next
      var n = lu.length, spread = n > 1 ? Math.min(w * 0.5, (n - 1) * 3.4) : 0, gap = n > 1 ? spread / (n - 1) : w * 0.4, half = n > 1 ? gap * 0.38 : Math.min(2.4, w * 0.14);
      lu.forEach(function (sg, i) {
        var slot = n === 1 ? mid : mid - spread / 2 + gap * i, dress = sg.man ? MEN_DRESS[mi++ % MEN_DRESS.length] : WOMEN_DRESS[wi++ % WOMEN_DRESS.length];
        var m = { role: 'singer', lineup: true, man: sg.man, faceUrl: sg.url, name: sg.name, col: dress.col, top: dress.top, odhni: dress.odhni, pagdi: dress.pagdi, h: sg.man ? 1.74 : 1.62, ph: 1.1 + i * 1.1, flash: 0, x: slot, tx: slot, lane: [slot - half, slot + half] };
        if (instant) { m.cx = slot; m.act = 'sing'; m.until = now + 1.5 + i * 1.3 + rnd() * 2; }
        else { m.cx = o.x1 - 0.2; m.entering = true; m.waiting = true; m.enterAt = now + lead + (old ? 2 : 0.4) + i * 0.45; m.spd = walkPace(m.cx, slot); m.wingAt = m.cx; m.fadeSpan = Math.max(0.3, Math.min(1.3, Math.abs(slot - m.cx) * 0.8)); m.act = 'enter'; m.until = now + 60; }
        m.wingL = o.x0 + 0.2; m.wingR = o.x1 - 0.2;
        if (sg.url) faceImg(sg.url);
        b.push(m);
      });
    }
    function singerPlan(m, singers, o) {
      var now = T, dt = Math.min(0.1, Math.max(0, now - (m.lastT == null ? now : m.lastT))); m.lastT = now;
      var lo = m.lane ? m.lane[0] : o.x0 + (o.x1 - o.x0) * 0.3, hi = m.lane ? m.lane[1] : o.x0 + (o.x1 - o.x0) * 0.7;
      if (m.cx == null) { m.cx = m.x; m.tx = m.x; m.act = 'sing'; m.until = now + 2 + rnd() * 3; }
      // A change of song: the singers who were on walk off to the left, then the new ones walk in from the right
      if (m.leaving || m.waiting || m.entering) {
        var go = m.leaving ? now >= m.leaveAt : now >= m.enterAt;
        m.waiting = !m.leaving && !go; m.dancing = false; m.cheer = 0; m.twirl = 0; m.pose = null; m.hopK = 0; m.spinK = 0;
        if (!go) { m.walking = false; return; }
        var dv = m.tx - m.cx, step0 = Math.sign(dv) * Math.min(Math.abs(dv), (reduce ? 99 : m.spd || 2) * dt);
        m.cx += step0; m.step = (m.step || 0) + Math.abs(step0) * 9; m.walking = Math.abs(dv) > 0.05 && !reduce;
        if (m.leaving && Math.abs(dv) <= 0.05) m.gone = true;
        if (m.entering && Math.abs(dv) <= 0.05) { m.entering = false; m.act = 'wave'; m.t0 = now; m.until = now + 1.8; }
        return;
      }
      if (reduce) { m.cx = m.x; m.act = 'sing'; m.walking = false; m.dancing = false; m.cheer = 0; m.twirl = 0; return; }
      var MOVE_LEN = { hop: 1.5, spin: 2.2, point: 2, clapup: 2.6, dance: 4, wave: 2.2 };
      if (m.cue && now >= m.cue.at) {
        // Changing sides for a new song: each singer walks across to where the other stood, mirrored across the stage
        if (m.cue.act === 'swap') { m.act = 'walk'; m.tx = m.lane ? lo + hi - m.cx : Math.max(lo, Math.min(hi, lo + hi - m.cx)); m.t0 = now; m.until = now + 6; m.cued = true; }
        else { m.act = m.cue.act; m.t0 = now; m.until = now + MOVE_LEN[m.act]; m.cued = true; }
        m.cue = null;
      }
      if (now > m.until || (!m.cued && ((!st.on && m.act !== 'idle') || (st.on && m.act === 'idle')))) {
        // Each singer does their own thing: a move someone else is already doing is picked again
        var r = rnd(), busy = singers.filter(function (x) { return x !== m && x.act !== 'sing' && x.act !== 'walk'; }).map(function (x) { return x.act; });
        var pick = function (r0) { return r0 < 0.34 ? 'walk' : r0 < 0.46 ? 'dance' : r0 < 0.56 ? 'wave' : r0 < 0.62 ? 'hop' : r0 < 0.68 ? 'spin' : r0 < 0.74 ? 'point' : r0 < 0.8 ? 'clapup' : 'sing'; };
        for (var tries0 = 0; tries0 < 4 && busy.indexOf(pick(r)) >= 0; tries0++) r = rnd();
        m.cued = false; m.t0 = now;
        if (!st.on) { m.act = 'idle'; m.until = now + 3 + rnd() * 4; }
        else if (r < 0.34) {
          // A new spot in their own lane, a good step from where they are
          m.act = 'walk'; var tx, tries = 0;
          do { tx = lerp(lo, hi, rnd()); } while (tries++ < 8 && Math.abs(tx - m.cx) < (hi - lo) * 0.3);
          m.tx = tx; m.until = now + 6;
        }
        else if (r < 0.46) { m.act = 'dance'; m.until = now + 3.5 + rnd() * 2.5; }
        else if (r < 0.56) { m.act = 'wave'; m.until = now + 1.8 + rnd() * 1.5; }
        else if (r < 0.62) { m.act = 'hop'; m.until = now + MOVE_LEN.hop; }
        else if (r < 0.68) { m.act = 'spin'; m.until = now + MOVE_LEN.spin; }
        else if (r < 0.74) { m.act = 'point'; m.until = now + MOVE_LEN.point; }
        else if (r < 0.8) { m.act = 'clapup'; m.until = now + MOVE_LEN.clapup; }
        else { m.act = 'sing'; m.until = now + 3 + rnd() * 4; m.gest = rnd(); }
      }
      // Walking along the front at an easy pace, legs stepping
      var d0 = m.tx - m.cx, spd = m.act === 'walk' ? 0.75 : 0.25;
      if (Math.abs(d0) > 0.03) { var stp = Math.sign(d0) * Math.min(Math.abs(d0), spd * dt); m.cx += stp; m.step = (m.step || 0) + Math.abs(stp) * 9; }
      m.walking = m.act === 'walk' && Math.abs(d0) > 0.06;
      if (m.act === 'walk' && !m.walking) { m.act = 'sing'; m.until = now + 2.5 + rnd() * 3; }
      // Dancing: a few steps side to side with a turn, a clap on each beat
      var danceK = m.act === 'dance' ? Math.min(1, (m.until - now) / 0.6, (now - (m.until - 6)) / 0.6) : 0;
      m.dancing = m.act === 'dance'; m.twirl = Math.max(0, danceK) * (0.5 + 0.4 * Math.max(0, Math.sin(now * 2.4)));
      if (m.dancing) { m.cx += Math.sin(now * 2.2 + m.ph) * 0.35 * dt; var bi = Math.floor(BEAT); if (bi !== m.lastBeat) { m.lastBeat = bi; m.flash = 1; } }
      m.flash = (m.flash || 0) * Math.exp(-dt * 6);
      m.cheer = m.act === 'wave' ? 1 : 0;
      m.idle = m.act === 'idle';
      // A hop twice on the beat, a full twirl that flares the skirt, a point out to the crowd, a clap over the head
      var mu = m.t0 != null && m.until > m.t0 ? Math.max(0, Math.min(1, (now - m.t0) / (m.until - m.t0))) : 1, env = Math.sin(Math.PI * mu);
      m.hopK = m.act === 'hop' ? Math.abs(Math.sin(mu * Math.PI * 3)) * env : 0;
      if (m.act === 'spin') { m.twirl = Math.max(m.twirl, env); m.spinK = env; } else m.spinK = 0;
      m.pose = m.act === 'point' || m.act === 'clapup' ? m.act : null; m.poseK = m.pose ? Math.min(1, env * 1.6) : 0;
      if (m.act === 'clapup') { var cb = Math.floor(BEAT); if (cb !== m.lastClap) { m.lastClap = cb; m.flash = 1; } }
      m.cx = m.lane ? Math.max(lo - 0.15, Math.min(hi + 0.15, m.cx)) : Math.max(lo - 0.6, Math.min(hi + 0.6, m.cx));
    }
    function speakerPole(x, z, h) {
      var b = P(x, 0, z), t0 = P(x, h, z); if (!b || !t0) return;
      g.strokeStyle = '#1f1914'; g.lineWidth = Math.max(1, b.s * 0.12); g.beginPath(); g.moveTo(b.x, b.y); g.lineTo(t0.x, t0.y); g.stroke();
      cabinet(x, h, z, 0.9, 1.2);
    }
    // Chhatris: mirror-work umbrellas hung over the circles, turning slowly
    function chhatri(x, y, z, t, i, hangY) {
      var top = P(x, hangY || y + 2.2, z), c = P(x, y, z); if (!top || !c || c.z < 4) return;
      var r = Math.min(40, c.s * 1.1), ry = r * Math.max(0.18, Math.min(0.5, (cam.y - y) / c.z * 0.9 + 0.25)), rot = reduce ? 0 : t * 0.25 + i;
      g.strokeStyle = 'rgba(90,70,50,.6)'; g.lineWidth = 0.8; g.beginPath(); g.moveTo(top.x, top.y); g.lineTo(c.x, c.y - ry * 1.4); g.stroke();
      var cols = [TH.flags[0], '#f6c342', TH.flags[2 % TH.flags.length], '#2f8f5b', TH.flags[1 % TH.flags.length], '#3b4cc0'];
      for (var k = 0; k < 12; k++) {
        var a0 = rot + k / 12 * TAU, a1 = rot + (k + 1) / 12 * TAU;
        g.fillStyle = cols[k % cols.length]; g.beginPath(); g.moveTo(c.x, c.y - ry * 1.4); g.lineTo(c.x + Math.cos(a0) * r, c.y + Math.sin(a0) * ry); g.lineTo(c.x + Math.cos(a1) * r, c.y + Math.sin(a1) * ry); g.closePath(); g.fill();
      }
      for (var m = 0; m < 12; m++) { var am = rot + (m + 0.5) / 12 * TAU, mx = c.x + Math.cos(am) * r * 0.6, my = c.y - ry * 0.45 + Math.sin(am) * ry * 0.55; g.fillStyle = 'rgba(255,250,235,' + (0.55 + 0.4 * Math.sin(t * 3 + m)) + ')'; g.beginPath(); g.arc(mx, my, Math.max(0.6, r * 0.04), 0, TAU); g.fill(); }
      for (var q = 0; q < 12; q++) { var aq = rot + q / 12 * TAU, qx = c.x + Math.cos(aq) * r, qy = c.y + Math.sin(aq) * ry; if (Math.sin(aq) < -0.3) continue; g.strokeStyle = cols[(q + 2) % cols.length]; g.lineWidth = Math.max(0.7, r * 0.04); g.beginPath(); g.moveTo(qx, qy); g.lineTo(qx, qy + r * 0.28); g.stroke(); g.fillStyle = '#e8b04b'; g.beginPath(); g.arc(qx, qy + r * 0.3, Math.max(0.6, r * 0.035), 0, TAU); g.fill(); }
    }
    function chhatris(y, t, hangY) { for (var i = 0; i < 6; i++) { var a = i / 6 * TAU + 0.3; chhatri(Math.cos(a) * 8.5, y, 4 + Math.sin(a) * 8.5, t, i, hangY); } }
    // Outdoors the chhatris hang from a ring of cable over the circle, guyed out to the two light towers and the stage truss
    function chhatriRig(y) {
      var ring = [], n = 24; for (var k = 0; k <= n; k++) { var a = k / n * TAU + 0.3, hang = Math.abs(Math.sin(a * 3)) ; ring.push([Math.cos(a) * 8.5, y - 0.25 * (1 - hang), 4 + Math.sin(a) * 8.5]); }
      g.strokeStyle = 'rgba(150,128,104,.55)'; g.lineWidth = 1.2;
      [[[-31, 11, 16], [-8.5, y, 4]], [[31, 11, 16], [8.5, y, 4]], [[0, 10.5, 46], [0, y, 12.5]]].forEach(function (gw) { g.beginPath(); var on = false; for (var k2 = 0; k2 <= 20; k2++) { var q = sag(gw[0], gw[1], 0.5, k2 / 20), pq = P(q[0], q[1], q[2]); if (!pq) { on = false; continue; } if (on) g.lineTo(pq.x, pq.y); else { g.moveTo(pq.x, pq.y); on = true; } } g.stroke(); });
      g.beginPath(); var on2 = false; ring.forEach(function (q) { var pq = P(q[0], q[1], q[2]); if (!pq) { on2 = false; return; } if (on2) g.lineTo(pq.x, pq.y); else { g.moveTo(pq.x, pq.y); on2 = true; } }); g.stroke();
    }
    function outdoorsOver(t) {
      chhatriRig(10);
      chhatris(7.2, t, 10);
      // Poles with strings of bulbs and bunting crossing the ground
      var zs = [-10, 5, 20, 35], X = 24, h = 7.4;
      zs.forEach(function (z) { [-X, X].forEach(function (x) { var b = P(x, 0, z), tp = P(x, h, z); if (b && tp) { g.strokeStyle = '#22180f'; g.lineWidth = Math.max(1, b.s * 0.12); g.beginPath(); g.moveTo(b.x, b.y); g.lineTo(tp.x, tp.y); g.stroke(); } }); });
      var strands = [];
      zs.forEach(function (z, i) { strands.push([[-X, h, z], [X, h, z], i % 2 ? 'flags' : 'bulbs']); if (i < zs.length - 1) { strands.push([[-X, h, z], [X, h, zs[i + 1]], 'bulbs']); strands.push([[X, h, z], [-X, h, zs[i + 1]], 'bulbs']); } });
      strands.sort(function (a, b) { return (b[0][2] + b[1][2]) - (a[0][2] + a[1][2]); });
      strands.forEach(function (s, si) { drawStrand(s[0], s[1], 1.5, s[2], t, si); });
    }
    function drawStrand(a, b, drop, kind, t, seed) {
      var len = Math.hypot(b[0] - a[0], b[2] - a[2]), n = Math.round(len / (kind === 'flags' ? 0.9 : 1.25));
      g.strokeStyle = 'rgba(70,52,36,.7)'; g.lineWidth = 0.8; g.beginPath(); var st0 = false;
      for (var i = 0; i <= 30; i++) { var q = sag(a, b, drop, i / 30), p = P(q[0], q[1], q[2]); if (!p) { st0 = false; continue; } if (st0) g.lineTo(p.x, p.y); else { g.moveTo(p.x, p.y); st0 = true; } }
      g.stroke();
      for (var j = 1; j < n; j++) {
        var qq = sag(a, b, drop, j / n), pp = P(qq[0], qq[1], qq[2]); if (!pp || pp.y < -20 || pp.x < -20 || pp.x > W + 20) continue;
        if (kind === 'flags') { var fs = Math.min(9, pp.s * 0.35); g.fillStyle = TH.flags[(j + seed) % TH.flags.length]; g.globalAlpha = 0.9; g.beginPath(); g.moveTo(pp.x - fs, pp.y); g.lineTo(pp.x + fs, pp.y); g.lineTo(pp.x, pp.y + fs * 1.6); g.closePath(); g.fill(); g.globalAlpha = 1; }
        else { var tw = reduce ? 1 : 0.72 + 0.28 * Math.sin(t * 2.6 + j * 1.7 + seed); glow(pp.x, pp.y + 1, Math.min(3.2, Math.max(0.9, pp.s * 0.09)), TH.bulbs[(j + seed) % TH.bulbs.length], (tw + pulse * 0.25) * bright); }
      }
    }
    function lantern(x, y, z, col, t, i, topY) {
      var sw = reduce ? 0 : Math.sin(t * 1.3 + i) * 0.12, top = P(x, topY || y + 1, z), p = P(x + sw, y, z); if (!p || !top) return;
      g.strokeStyle = 'rgba(80,60,40,.6)'; g.lineWidth = 0.7; g.beginPath(); g.moveTo(top.x, top.y); g.lineTo(p.x, p.y); g.stroke();
      if (p.z < 5) return;
      var r = Math.min(10, p.s * 0.32); glow(p.x, p.y + r, r * 0.9, col, 0.55 * bright + pulse * 0.1);
      g.fillStyle = col; g.globalAlpha = 0.85; g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(p.x + r, p.y + r * 0.8); g.lineTo(p.x + r * 0.7, p.y + r * 2); g.lineTo(p.x - r * 0.7, p.y + r * 2); g.lineTo(p.x - r, p.y + r * 0.8); g.closePath(); g.fill();
      g.fillStyle = '#d6b06f'; g.fillRect(p.x - r * 0.1, p.y + r * 2, r * 0.2, r * 0.7); g.globalAlpha = 1;
    }

    function stadiumBack(t) {
      var L = layout('stadium'), i;
      // Wooden floor boards running away from you
      g.strokeStyle = 'rgba(255,220,170,.035)'; g.lineWidth = 1;
      for (var fx = -24; fx <= 24; fx += 1.6) { var f0 = P(fx, 0, Math.max(cam.z + 1.5, -14)), f1 = P(fx, 0, 42); if (f0 && f1) { g.beginPath(); g.moveTo(f0.x, f0.y); g.lineTo(f1.x, f1.y); g.stroke(); } }
      // Ceiling, risers and the seated crowd only change when the camera moves, so they are cached while the view is still
      cachedLayer('stadiumCeiling', drawCeiling);
      standsLayer(L);
      // LED ribbon along the front of the stands
      var hue = TH.hues[0];
      [[[-28, 0.2, 41.9], [28, 0.2, 41.9]], [[-24.9, 0.2, -34], [-24.9, 0.2, 41.9]], [[24.9, 0.2, -34], [24.9, 0.2, 41.9]]].forEach(function (seg, si) {
        var a0 = seg[0], b0 = seg[1];
        if (poly([[a0[0], 0.2, a0[2]], [b0[0], 0.2, b0[2]], [b0[0], 1.2, b0[2]], [a0[0], 1.2, a0[2]]])) {
          var pa = P(a0[0], 0.7, Math.max(a0[2], cam.z + 1)), pb = P(b0[0], 0.7, b0[2]);
          if (pa && pb) { var lg = g.createLinearGradient(pa.x, pa.y, pb.x, pb.y); for (var k = 0; k <= 5; k++) lg.addColorStop(k / 5, 'hsl(' + (TH.hues[(k + si) % TH.hues.length] + 20 * Math.sin(t * TH.speed + k)) + ',' + TH.sat + '%,' + (30 + 12 * bright + 8 * pulse) + '%)'); g.fillStyle = lg; g.fill(); }
        }
      });
      // Phone lights twinkle over the cached crowd
      for (i = 0; i < L.stands.length; i++) {
        var pp = L.stands[i]; if (pp.p < 0 || !st.on || Math.sin(t * 1.7 + pp.p) <= 0.55) continue;
        var p = pp.side === 0 ? P(pp.u, 1.3 + pp.row * 0.95 + 0.35, 42 + pp.row * 1.5 + 0.4) : P(pp.side * (25 + pp.row * 1.5 + 0.4), 1.3 + pp.row * 0.95 + 0.35, pp.u);
        if (!p || p.x < -4 || p.x > W + 4) continue;
        var sz = Math.max(1, p.s * 0.34); glow(p.x, p.y - sz, Math.max(0.8, sz * 0.4), '#f4f7ff', 0.9);
      }
      stage({ x0: -8, x1: 8, z: 35.5, h: 1.4, screenTop: 6.8, truss: 8.4, arrays: 10 }, t, 'stadium');
      // Banners hanging over the stands, exit signs by the aisles, and big screens up in the corners
      [-1, 1].forEach(function (sd) {
        for (var bz = -24; bz <= 36; bz += 10) {
          var bx = sd * 25.1, col = TH.flags[((bz + 40) / 10 + (sd > 0 ? 1 : 0)) % TH.flags.length];
          fillPoly([[bx, 5.5, bz - 1.1], [bx, 5.5, bz + 1.1], [bx, 2.4, bz + 1.1], [bx, 1.8, bz], [bx, 2.4, bz - 1.1]], col);
          fillPoly([[bx - sd * 0.01, 5.1, bz - 0.8], [bx - sd * 0.01, 5.1, bz + 0.8], [bx - sd * 0.01, 4.9, bz + 0.8], [bx - sd * 0.01, 4.9, bz - 0.8]], '#e8b04b');
          var ex = P(sd * 25.05, 1.9, bz + 5); if (ex) { var es = Math.max(2, ex.s * 0.5); g.fillStyle = '#1f8f4b'; g.fillRect(ex.x - es / 2, ex.y - es * 0.3, es, es * 0.6); }
        }
        // Big screens hung from the girders in the far corners, below the shamiana's edge
        if (poly([[sd * 33, 7.4, 40], [sd * 23, 7.4, 40], [sd * 23, 10.9, 40], [sd * 33, 10.9, 40]])) {
          var sc = P(sd * 28, 9.15, 40), sw = P(sd * 33, 9.15, 40);
          var lg = g.createLinearGradient(sw.x, 0, sc.x, 0); lg.addColorStop(0, 'hsl(' + TH.hues[0] + ',' + TH.sat + '%,' + (14 + 6 * bright) + '%)'); lg.addColorStop(1, 'hsl(' + TH.hues[TH.hues.length - 1] + ',' + TH.sat + '%,' + (20 + 10 * pulse) + '%)');
          g.fillStyle = lg; g.fill();
          if (sc) { g.strokeStyle = 'rgba(255,236,200,' + (0.25 + 0.3 * pulse) + ')'; g.lineWidth = 1; g.beginPath(); g.arc(sc.x, sc.y, sc.s * 1.8, 0, TAU); g.stroke(); }
          [24, 32].forEach(function (cx) { var c0 = P(sd * cx, 10.9, 40), c1 = P(sd * cx, 16.1, 40); if (c0 && c1) { g.strokeStyle = 'rgba(40,36,48,.9)'; g.lineWidth = 1; g.beginPath(); g.moveTo(c0.x, c0.y); g.lineTo(c1.x, c1.y); g.stroke(); } });
        }
      });
    }
    var standsCache = null, standsKey = '';
    function standsLayer(L) {
      var settled = camSettled;
      var key = [W, H, BX, BY, BW, BH, cam.x.toFixed(2), cam.y.toFixed(2), cam.z.toFixed(2), (st.density * QD).toFixed(2)].join('|');
      if (settled && standsCache && standsKey === key) { g.drawImage(standsCache, 0, 0, W, H); return; }
      if (!settled) { drawStands(L); return; }
      standsCache = standsCache || document.createElement('canvas');
      standsCache.width = canvas.width; standsCache.height = canvas.height;
      var live = g, cg = standsCache.getContext('2d'); cg.setTransform(DPR, 0, 0, DPR, 0, 0); cg.clearRect(0, 0, W, H);
      g = cg; drawStands(L); g = live; standsKey = key;
      g.drawImage(standsCache, 0, 0, W, H);
    }
    function drawStands(L) {
      // Stands: risers first, far end then sides
      for (var row = 10; row >= 0; row--) {
        var zf = 42 + row * 1.5, yf = 1.3 + row * 0.95;
        fillPoly([[-28, yf - 0.95, zf], [28, yf - 0.95, zf], [28, yf, zf], [-28, yf, zf]], 'rgb(' + (26 + row) + ',' + (22 + row) + ',' + (34 + row) + ')');
      }
      [-1, 1].forEach(function (s) {
        for (var row = 8; row >= 0; row--) { var xr = s * (25 + row * 1.5), y = 1.3 + row * 0.95; fillPoly([[xr, y - 0.95, -34], [xr, y - 0.95, 42], [xr, y, 42], [xr, y, -34]], 'rgb(' + (22 + row) + ',' + (19 + row) + ',' + (30 + row) + ')'); }
      });
      var cols = ['#c9a37a', '#b76b5a', '#8f7aa8', '#d4b58c', '#6c8fa3', '#caa0b8'];
      for (var i = 0; i < L.stands.length; i++) {
        var pp = L.stands[i], p;
        if (pp.c / 6 + (i % 7) / 42 > 0.25 + (st.density * QD)) continue;
        if (pp.side === 0) p = P(pp.u, 1.3 + pp.row * 0.95 + 0.35, 42 + pp.row * 1.5 + 0.4);
        else p = P(pp.side * (25 + pp.row * 1.5 + 0.4), 1.3 + pp.row * 0.95 + 0.35, pp.u);
        if (!p || p.x < -4 || p.x > W + 4 || p.y < -4 || p.y > H) continue;
        var sz = Math.max(1, p.s * 0.34);
        g.fillStyle = cols[pp.c]; g.globalAlpha = 0.75; g.fillRect(p.x - sz / 2, p.y - sz, sz, sz); g.globalAlpha = 1;
      }
    }
    /* ---------- the hall's ceiling ----------
       A steel roof of lattice girders over the hall, and under it, over the dance floor, a shamiana: a tent ceiling of
       pleated cloth in saffron, cream and maroon, gathered to a point over the middle, sagging a little between its
       seams, and finished at the edge with a scalloped jhalar and gold fringe. Jhummar chandeliers hang below it. */
    var CEIL = { roof: 17, apex: [0, 13.4, 10], edge: 11.2, x0: -24, x1: 24, z0: -14, z1: 34 };
    function shamianaEdge() {
      var pts = [], per = 12, c = CEIL;
      for (var k = 0; k < per; k++) pts.push([lerp(c.x0, c.x1, k / per), c.edge, c.z1]);
      for (k = 0; k < per; k++) pts.push([c.x1, c.edge, lerp(c.z1, c.z0, k / per)]);
      for (k = 0; k < per; k++) pts.push([lerp(c.x1, c.x0, k / per), c.edge, c.z0]);
      for (k = 0; k < per; k++) pts.push([c.x0, c.edge, lerp(c.z0, c.z1, k / per)]);
      return pts;
    }
    function drawCeiling() {
      var c = CEIL, zn = Math.max(cam.z + 1, -34), k;
      // The roof deck and the walls above the stands
      fillPoly([[-40, c.roof, zn], [40, c.roof, zn], [40, c.roof, 60], [-40, c.roof, 60]], '#130e19');
      fillPoly([[-40, 10.8, 58], [40, 10.8, 58], [40, c.roof, 58], [-40, c.roof, 58]], '#191320');
      [-1, 1].forEach(function (sd) { fillPoly([[sd * 38, 8.9, zn], [sd * 38, 8.9, 58], [sd * 38, c.roof, 58], [sd * 38, c.roof, zn]], '#161120'); });
      for (k = 0; k < 9; k++) { var vx = -32 + k * 8, va = P(vx - 2, 14.8, 57.9), vb = P(vx + 2, 16, 57.9); if (va && vb) { g.fillStyle = 'rgba(255,190,120,.12)'; g.fillRect(va.x, vb.y, vb.x - va.x, va.y - vb.y); } }
      // Lattice girders across the hall, and purlins running its length
      g.strokeStyle = 'rgba(150,140,172,.42)'; g.lineWidth = 1;
      for (var z = zn < -30 ? -30 : Math.ceil(zn / 6) * 6; z <= 57; z += 6) {
        g.beginPath(); var on = false, prevB = null;
        for (var xx = -38; xx <= 38; xx += 2.5) {
          var tp = P(xx, c.roof, z), bt = P(xx + 1.25, c.roof - 0.9, z); if (!tp || !bt) { on = false; continue; }
          if (on) g.lineTo(tp.x, tp.y); else { g.moveTo(tp.x, tp.y); on = true; }
        }
        g.stroke();
        g.beginPath(); on = false;
        for (xx = -38; xx <= 38; xx += 2.5) {
          var t0 = P(xx, c.roof, z), b0 = P(xx + 1.25, c.roof - 0.9, z), t1 = P(xx + 2.5, c.roof, z); if (!t0 || !b0 || !t1) continue;
          g.moveTo(t0.x, t0.y); g.lineTo(b0.x, b0.y); g.lineTo(t1.x, t1.y); if (prevB) { g.moveTo(prevB.x, prevB.y); g.lineTo(b0.x, b0.y); } prevB = b0;
        }
        g.stroke();
      }
      for (var px = -36; px <= 36; px += 9) { var pa = P(px, c.roof, zn), pb = P(px, c.roof, 58); if (pa && pb) { g.beginPath(); g.moveTo(pa.x, pa.y); g.lineTo(pb.x, pb.y); g.stroke(); } }
      // The shamiana: panels from the apex to the edge, each sagging at the middle, sorted far to near
      var edge = shamianaEdge(), A = c.apex, cols = ['#c85a17', '#d8c49c', '#7e1827', '#d8c49c'], faces = [];
      for (k = 0; k < edge.length; k++) {
        var e0 = edge[k], e1 = edge[(k + 1) % edge.length];
        var m0 = [lerp(A[0], e0[0], 0.55), lerp(A[1], c.edge, 0.55) - 0.35, lerp(A[2], e0[2], 0.55)], m1 = [lerp(A[0], e1[0], 0.55), lerp(A[1], c.edge, 0.55) - 0.35, lerp(A[2], e1[2], 0.55)];
        var col = cols[k % cols.length];
        // Further cloth is dimmer: the lanterns and chandeliers light what's over the floor near you
        var far0 = Math.max(0, Math.min(1, ((A[2] + e0[2]) / 2 - cam.z - 14) / 40)) * 0.3;
        faces.push({ pts: [A, m0, m1], col: shade(col, -0.3 - far0), z: (A[2] + m0[2] + m1[2]) / 3 });
        faces.push({ pts: [m0, e0, e1, m1], col: shade(col, -0.06 - far0), z: (m0[2] + e0[2] + e1[2] + m1[2]) / 4 });
      }
      faces.sort(function (a, b) { return b.z - a.z; });
      faces.forEach(function (f) {
        if (!poly(f.pts)) return;
        g.fillStyle = f.col; g.fill();
        g.strokeStyle = 'rgba(40,10,10,.25)'; g.lineWidth = 1; g.stroke();
      });
      // Warm light washing up onto the cloth from the lanterns below
      var ap = P(A[0], A[1] - 1, A[2]);
      if (ap) { g.save(); g.globalCompositeOperation = 'lighter'; var wr = Math.max(60, ap.s * 12), wg = g.createRadialGradient(ap.x, ap.y, 4, ap.x, ap.y, wr); wg.addColorStop(0, 'rgba(255,190,120,.18)'); wg.addColorStop(1, 'rgba(255,190,120,0)'); g.fillStyle = wg; g.fillRect(ap.x - wr, ap.y - wr, wr * 2, wr * 2); g.restore(); }
      // The jhalar round the edge: maroon scallops with a gold fringe and a mirror on each
      for (k = 0; k < edge.length; k++) {
        var a0 = edge[k], a1 = edge[(k + 1) % edge.length], mid = [(a0[0] + a1[0]) / 2, c.edge - 0.8, (a0[2] + a1[2]) / 2];
        var j0 = P(a0[0], c.edge, a0[2]), j1 = P(a1[0], c.edge, a1[2]), jm = P(mid[0], mid[1], mid[2]), jd0 = P(a0[0], c.edge - 0.45, a0[2]), jd1 = P(a1[0], c.edge - 0.45, a1[2]);
        if (!j0 || !j1 || !jm || !jd0 || !jd1) continue;
        g.fillStyle = '#6b1020'; g.beginPath(); g.moveTo(j0.x, j0.y); g.lineTo(j1.x, j1.y); g.lineTo(jd1.x, jd1.y); g.quadraticCurveTo(jm.x, jm.y + (jm.y - (jd0.y + jd1.y) / 2) * 0.6, jd0.x, jd0.y); g.closePath(); g.fill();
        g.strokeStyle = '#d6a64a'; g.lineWidth = Math.max(1, jm.s * 0.06); g.beginPath(); g.moveTo(jd0.x, jd0.y); g.quadraticCurveTo(jm.x, jm.y + (jm.y - (jd0.y + jd1.y) / 2) * 0.6, jd1.x, jd1.y); g.stroke();
        g.fillStyle = 'rgba(235,245,255,.7)'; g.beginPath(); g.arc((j0.x + j1.x) / 2, (j0.y + jd0.y) / 2 + (jm.y - jd0.y) * 0.2, Math.max(0.8, jm.s * 0.05), 0, TAU); g.fill();
      }
    }
    // Jhummar: brass chandeliers in three tiers of glowing drops, hung on chains from the shamiana
    function jhummar(x, z, t, i) {
      var top = P(x, CEIL.edge + 1.2, z), crown = P(x, 11, z); if (!top || !crown || crown.z < 3) return;
      g.strokeStyle = 'rgba(214,166,74,.7)'; g.lineWidth = Math.max(0.7, crown.s * 0.03); g.beginPath(); g.moveTo(top.x, top.y); g.lineTo(crown.x, crown.y); g.stroke();
      [[11, 0.95, 12], [10.55, 0.72, 10], [10.15, 0.45, 8]].forEach(function (tier, ti) {
        var cp = P(x, tier[0], z), ep = P(x + tier[1], tier[0], z); if (!cp || !ep) return;
        var rx = Math.abs(ep.x - cp.x), ry = rx * 0.28;
        g.strokeStyle = '#c9963f'; g.lineWidth = Math.max(0.7, cp.s * 0.04); g.beginPath(); g.ellipse(cp.x, cp.y, rx, ry, 0, 0, TAU); g.stroke();
        for (var k = 0; k < tier[2]; k++) {
          var a = k / tier[2] * TAU + ti * 0.3 + (reduce ? 0 : t * 0.1), dx = cp.x + Math.cos(a) * rx, dy = cp.y + Math.sin(a) * ry, drop = Math.max(1.5, cp.s * 0.18), tw = reduce ? 0.8 : 0.65 + 0.35 * Math.sin(t * 3 + k * 1.9 + i);
          g.strokeStyle = 'rgba(255,240,210,.5)'; g.lineWidth = 0.7; g.beginPath(); g.moveTo(dx, dy); g.lineTo(dx, dy + drop); g.stroke();
          glow(dx, dy + drop, Math.max(0.9, cp.s * 0.06), '#fff1d0', tw * bright);
        }
      });
      var fin = P(x, 9.7, z); if (fin) { glow(fin.x, fin.y, Math.max(1.4, fin.s * 0.12), '#ffd58a', (0.7 + 0.3 * pulse) * bright); var halo = Math.max(12, crown.s * 1.8), hg = g.createRadialGradient(crown.x, crown.y + halo * 0.25, 1, crown.x, crown.y + halo * 0.25, halo); hg.addColorStop(0, 'rgba(255,214,160,' + 0.16 * bright + ')'); hg.addColorStop(1, 'rgba(255,214,160,0)'); g.save(); g.globalCompositeOperation = 'lighter'; g.fillStyle = hg; g.fillRect(crown.x - halo, crown.y - halo * 0.75, halo * 2, halo * 2); g.restore(); }
    }
    function stadiumOver(t) {
      [[-12, 2], [12, 2], [-12, 20], [12, 20], [0, 26]].forEach(function (j, ji) { jhummar(j[0], j[1], t, ji); });
      chhatris(8.2, t, 12.1);
      // Marigold curtains falling from the truss either side of the stage
      [-1, 1].forEach(function (sd) {
        for (var k = 0; k < 6; k++) {
          var x = sd * (9.2 + k * 0.35), a = P(x, 8.2, 35.2 - k * 0.05), b = P(x, 2.4, 35.2 - k * 0.05); if (!a || !b) continue;
          var dot = Math.max(1.2, a.s * 0.14), gap = Math.max(1, a.s * 0.18);
          g.lineCap = 'round'; g.lineWidth = dot;
          g.setLineDash([0.01, gap + dot]); g.strokeStyle = '#f29a2e'; g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke();
          g.lineDashOffset = -(gap + dot) / 2; g.strokeStyle = '#f6c342'; g.stroke();
          g.setLineDash([]); g.lineDashOffset = 0;
        }
      });
      // Bunting across the hall, then hanging lanterns, then moving spotlights
      [2, 18, 32].forEach(function (z, i) { drawStrand([-24, 11, z], [24, 11, z], 1.6, 'flags', t, i); });
      var lc = ['#ff9f5a', '#ff6fa3', '#7fe0a0', '#ffd58a'], n = 0;
      [34, 22, 10, -2].forEach(function (z) { [-15, -5, 5, 15].forEach(function (x) { lantern(x, 9.5 + (n % 2) * 0.8, z, lc[n % 4], t, n, Math.abs(x) < 24 && z > -14 && z < 34 ? 11.6 : 16); n++; }); });
      g.save(); g.globalCompositeOperation = 'lighter';
      var heads = [[-18, 0], [-6, 0], [6, 0], [18, 0], [-12, 22], [12, 22]], bc = heads.map(function (h0, i0) { return TH.beams[i0 % TH.beams.length]; });
      heads.forEach(function (h, i) {
        var hp = P(h[0], 15.8, h[1]); if (!hp) return;
        if (hp.s > 6) { var fx2 = hp.s * 0.35; g.globalCompositeOperation = 'source-over'; g.fillStyle = '#1b1920'; g.fillRect(hp.x - fx2 * 0.6, hp.y - fx2 * 0.9, fx2 * 1.2, fx2 * 0.3); g.fillRect(hp.x - fx2 * 0.35, hp.y - fx2 * 0.6, fx2 * 0.7, fx2 * 0.8); g.globalCompositeOperation = 'lighter'; }
        var tt = reduce ? 0 : t * TH.speed / 0.3, tx = h[0] * 0.4 + Math.sin(tt * 0.35 + i * 1.9) * 9, tz = h[1] + Math.cos(tt * 0.27 + i) * 9;
        var fp = P(tx, 0, tz); if (!fp) return;
        var spread = fp.s * 2.4;
        var gr = g.createLinearGradient(hp.x, hp.y, fp.x, fp.y); var nearFade = Math.min(1, hp.z / 25); gr.addColorStop(0, 'rgba(' + bc[i] + ',' + 0.2 * bright * nearFade + ')'); gr.addColorStop(1, 'rgba(' + bc[i] + ',' + 0.05 * bright * nearFade + ')');
        g.fillStyle = gr; g.beginPath(); g.moveTo(hp.x - 2, hp.y); g.lineTo(hp.x + 2, hp.y); g.lineTo(fp.x + spread, fp.y); g.lineTo(fp.x - spread, fp.y); g.closePath(); g.fill();
        g.fillStyle = 'rgba(' + bc[i] + ',' + 0.12 * bright + ')'; g.beginPath(); g.ellipse(fp.x, fp.y, spread, spread * 0.3, 0, 0, TAU); g.fill();
        glow(hp.x, hp.y, 2, 'rgb(' + bc[i] + ')', 0.9);
      });
      g.restore();
    }

    var layerCache = {};
    function cachedLayer(name, draw) {
      var settled = camSettled;
      var key = [W, H, BX, BY, BW, BH, cam.x.toFixed(2), cam.y.toFixed(2), cam.z.toFixed(2)].join('|'), c = layerCache[name];
      if (settled && c && c.key === key) { g.drawImage(c.cv, 0, 0, W, H); return; }
      if (!settled) { draw(true); return; }
      c = layerCache[name] = layerCache[name] || { cv: document.createElement('canvas') };
      c.cv.width = canvas.width; c.cv.height = canvas.height;
      var live = g, cg = c.cv.getContext('2d'); cg.setTransform(DPR, 0, 0, DPR, 0, 0); cg.clearRect(0, 0, W, H);
      g = cg; draw(false); g = live; c.key = key; g.drawImage(c.cv, 0, 0, W, H);
    }
    function drawPaving(quick) {
      var r3 = seeded(5), z0 = Math.max(Math.floor(cam.z + 1.5), -24);
      for (var z = z0; z < 72; z += 1.3) {
        var off = (Math.round(z / 1.3) % 2) * 0.6;
        for (var x = -7 + off; x < 7; x += 1.2) {
          var tone = 30 + Math.floor(r3() * 14), x1 = Math.min(7, x + 1.14), xa = Math.max(-7, x);
          if (quick && (Math.round(z) % 3)) continue;
          fillPoly([[xa, 0, z], [x1, 0, z], [x1, 0, z + 1.24], [xa, 0, z + 1.24]], 'rgb(' + (tone + 8) + ',' + (tone - 2) + ',' + (tone - 10) + ')');
        }
      }
      // A worn, slightly glossy strip down the middle where most feet go
      var m0 = P(0, 0, z0 + 1), m1 = P(0, 0, 72); if (m0 && m1) { var gr = g.createLinearGradient(0, m1.y, 0, m0.y); gr.addColorStop(0, 'rgba(255,210,150,0)'); gr.addColorStop(1, 'rgba(255,210,150,.06)'); if (poly([[-2.4, 0.005, z0 + 1], [2.4, 0.005, z0 + 1], [1.2, 0.005, 72], [-1.2, 0.005, 72]])) { g.fillStyle = gr; g.fill(); } }
    }
    function sheriBack(t) {
      var L = layout('sheri');
      // Stone paving: laid in courses, each stone a slightly different tone, kept as an image while the view is still
      cachedLayer('sheriPaving', drawPaving);
      [-1, 1].forEach(function (sd) {
        fillPoly([[sd * 7.2, 0.01, Math.max(cam.z + 1, -40)], [sd * 6.9, 0.01, Math.max(cam.z + 1, -40)], [sd * 6.9, 0.01, 72], [sd * 7.2, 0.01, 72]], 'rgba(0,0,0,.35)');
        fillPoly([[sd * 7.25, 0, Math.max(cam.z + 1, -40)], [sd * 7.25, 0.45, Math.max(cam.z + 1, -40)], [sd * 7.25, 0.45, 72], [sd * 7.25, 0, 72]], '#3a3040');
      });
      // A temple spire rising behind the end of the lane, outlined in bulbs
      var sb = P(0, 12, 78), st2 = P(0, 22, 78), sw0 = P(3.2, 12, 78);
      if (sb && st2 && sw0) {
        var hw = sw0.x - sb.x;
        g.fillStyle = '#231a2c'; g.beginPath(); g.moveTo(sb.x - hw, sb.y); g.bezierCurveTo(sb.x - hw * 0.95, sb.y - (sb.y - st2.y) * 0.6, sb.x - hw * 0.35, st2.y + (sb.y - st2.y) * 0.1, sb.x, st2.y); g.bezierCurveTo(sb.x + hw * 0.35, st2.y + (sb.y - st2.y) * 0.1, sb.x + hw * 0.95, sb.y - (sb.y - st2.y) * 0.6, sb.x + hw, sb.y); g.closePath(); g.fill();
        for (var tb = 0; tb <= 14; tb++) { var u = tb / 14, bx2 = sb.x - hw + hw * 2 * u, by2 = sb.y - (sb.y - st2.y) * Math.sin(u * Math.PI) * 0.98; glow(bx2, by2, Math.max(0.6, sb.s * 0.06), TH.bulbs[tb % TH.bulbs.length], 0.8 * bright); }
        g.strokeStyle = '#3a2413'; g.lineWidth = 1; g.beginPath(); g.moveTo(sb.x, st2.y); g.lineTo(sb.x, st2.y - sb.s * 1.6); g.stroke();
        g.fillStyle = '#d8453a'; g.beginPath(); g.moveTo(sb.x, st2.y - sb.s * 1.6); g.lineTo(sb.x + sb.s * 1.1, st2.y - sb.s * 1.3 + (reduce ? 0 : Math.sin(t * 4) * sb.s * 0.1)); g.lineTo(sb.x, st2.y - sb.s * 1.0); g.fill();
      }
      // House at the end of the lane with a small shrine
      fillPoly([[-8.2, 0, 72], [8.2, 0, 72], [8.2, 12, 72], [-8.2, 12, 72]], '#2c2338');
      var sh = P(0, 0, 71.8);
      if (sh) {
        var sw = sh.s * 1.3, shh = sh.s * 2.7;
        glow(sh.x, sh.y - shh * 0.5, sw * 0.8, '#ff9a4a', 0.45 * bright);
        g.fillStyle = '#7a1a14'; g.beginPath(); g.moveTo(sh.x - sw, sh.y); g.lineTo(sh.x - sw, sh.y - shh * 0.7); g.quadraticCurveTo(sh.x, sh.y - shh * 1.25, sh.x + sw, sh.y - shh * 0.7); g.lineTo(sh.x + sw, sh.y); g.closePath(); g.fill();
        g.strokeStyle = '#e8b04b'; g.lineWidth = Math.max(1, sh.s * 0.12); g.stroke();
        for (var d = 0; d < 5; d++) glow(sh.x + (d - 2) * sw * 0.4, sh.y - sh.s * 0.2, Math.max(0.8, sh.s * 0.08), '#ffcf7a', 0.9);
        for (var wv = 0; wv < 4; wv++) { var wp = P(-6 + wv * 4, 7.5, 71.8); if (wp) { g.fillStyle = wv % 2 ? 'rgba(255,190,100,.6)' : 'rgba(40,30,60,.9)'; g.fillRect(wp.x - wp.s * 0.5, wp.y - wp.s * 0.8, wp.s, wp.s * 1.6); } }
      }
      // The society's projector screen, tied up high on the wall over the shrine, clear of the stage's canopy
      fillPoly([[-3.45, 5.05, 71.75], [3.45, 5.05, 71.75], [3.45, 8.15, 71.75], [-3.45, 8.15, 71.75]], '#14100c');
      screenPanel(-3.3, 3.3, 5.15, 8.05, 71.7, t, 'sheri');
      // House fronts on both sides, far to near
      var hs = L.houses.slice().sort(function (a, b) { return b.z1 - a.z1; });
      hs.forEach(function (h) { house(h, t); });
      // Street lamps on brackets, each throwing a pool of warm light
      for (var lz = 62; lz >= -20; lz -= 14) [-1, 1].forEach(function (sd, k) {
        var z0 = lz + k * 7, arm0 = P(sd * 8, 5.2, z0), arm1 = P(sd * 6.6, 5.2, z0), pool = P(sd * 5.8, 0, z0);
        if (pool) { var pr = pool.s * 4, pg = g.createRadialGradient(pool.x, pool.y, 1, pool.x, pool.y, pr); pg.addColorStop(0, 'rgba(255,200,130,' + 0.16 * bright + ')'); pg.addColorStop(1, 'rgba(255,200,130,0)'); g.fillStyle = pg; g.beginPath(); g.ellipse(pool.x, pool.y, pr, pr * 0.3, 0, 0, TAU); g.fill(); }
        if (arm0 && arm1) { g.strokeStyle = '#1b1510'; g.lineWidth = Math.max(1, arm0.s * 0.08); g.beginPath(); g.moveTo(arm0.x, arm0.y); g.lineTo(arm1.x, arm1.y); g.stroke(); glow(arm1.x, arm1.y + 2, Math.max(1, Math.min(4, arm1.s * 0.14)), '#ffd9a0', bright); }
      });
      // Musicians by the shrine, with a speaker on a stand each side
      [-4.6, 4.6].forEach(function (x) { speakerPole(x, 64, 1.8); });
      // A low wooden takht for the musicians by the shrine
      fillPoly([[-3.4, 0, 63.9], [3.4, 0, 63.9], [3.4, 0.6, 63.9], [-3.4, 0.6, 63.9]], '#4a2a16');
      fillPoly([[-3.4, 0.6, 63.9], [3.4, 0.6, 63.9], [3.4, 0.6, 66], [-3.4, 0.6, 66]], '#6b3f1f');
      fillPoly([[-3.4, 0.45, 63.88], [3.4, 0.45, 63.88], [3.4, 0.6, 63.88], [-3.4, 0.6, 63.88]], '#9b1f1a');
      // A durrie on the takht: stripes across it, and round bolsters at the back for the players
      for (var ds = 0; ds < 7; ds++) fillPoly([[-3.3, 0.605, 64 + ds * 0.28], [3.3, 0.605, 64 + ds * 0.28], [3.3, 0.605, 64.14 + ds * 0.28], [-3.3, 0.605, 64.14 + ds * 0.28]], ds % 2 ? 'rgba(242,154,46,.45)' : 'rgba(142,27,44,.5)');
      [-2.2, 0, 2.2].forEach(function (bx) { var bp = P(bx, 0.78, 65.85); if (bp) { g.fillStyle = '#8e1b2c'; g.beginPath(); g.ellipse(bp.x, bp.y, bp.s * 0.55, bp.s * 0.17, 0, 0, TAU); g.fill(); g.strokeStyle = '#e8b04b'; g.lineWidth = Math.max(0.7, bp.s * 0.03); g.stroke(); } });
      // A small mandap over the takht: four cloth-wrapped posts and a cloth roof; the back two go behind the band
      sheriMandap('back', t);
      bandOn('sheri', 0.6, 64.5, { x0: -3.2, x1: 3.2 });
      sheriMandap('front', t);
    }
    function sheriMandap(part, t) {
      var zs = part === 'back' ? [66] : [63.9], hgt = 3.5;
      zs.forEach(function (z) { [-3.35, 3.35].forEach(function (x) {
        var b = P(x, 0.6, z), tp = P(x, hgt, z); if (!b || !tp) return;
        var w = Math.max(1.5, b.s * 0.12), pg = g.createLinearGradient(b.x - w, 0, b.x + w, 0); pg.addColorStop(0, '#5a0f18'); pg.addColorStop(0.4, '#c0392b'); pg.addColorStop(1, '#4a0c14');
        g.fillStyle = pg; g.fillRect(b.x - w / 2, tp.y, w, b.y - tp.y);
        g.strokeStyle = '#e8b04b'; g.lineWidth = Math.max(0.7, b.s * 0.02); for (var k = 0; k < 7; k++) { var yy = lerp(tp.y, b.y, k / 7); g.beginPath(); g.moveTo(b.x - w / 2, yy); g.lineTo(b.x + w / 2, yy + (b.y - tp.y) / 14); g.stroke(); }
      }); });
      if (part === 'back') {
        fillPoly([[-3.45, hgt, 63.9], [3.45, hgt, 63.9], [3.45, hgt + 0.5, 66], [-3.45, hgt + 0.5, 66]], '#6b1020');
        for (var r = 0; r < 6; r++) fillPoly([[-3.45 + r * 1.15, hgt + 0.01, 63.9], [-3.45 + r * 1.15 + 0.5, hgt + 0.01, 63.9], [-3.45 + r * 1.15 + 0.5, hgt + 0.51, 66], [-3.45 + r * 1.15, hgt + 0.51, 66]], 'rgba(242,154,46,.35)');
        return;
      }
      // The front: a scalloped valance with a gold edge, and a marigold toran along the beam
      var va = P(-3.45, hgt, 63.88), vb = P(3.45, hgt - 0.5, 63.88); if (!va || !vb) return;
      var n = 7, sw = (vb.x - va.x) / n, dp = vb.y - va.y;
      g.fillStyle = '#6b1020'; g.beginPath(); g.moveTo(va.x, va.y); g.lineTo(vb.x, va.y); for (var k2 = n; k2 > 0; k2--) { var xr = va.x + k2 * sw, xl = xr - sw; g.lineTo(xr, va.y + dp * 0.6); g.quadraticCurveTo((xl + xr) / 2, va.y + dp * 1.4, xl, va.y + dp * 0.6); } g.closePath(); g.fill();
      g.strokeStyle = '#d6a64a'; g.lineWidth = Math.max(0.8, va.s * 0.04); g.beginPath(); for (var k3 = 0; k3 < n; k3++) { var xl2 = va.x + k3 * sw; g.moveTo(xl2, va.y + dp * 0.6); g.quadraticCurveTo(xl2 + sw / 2, va.y + dp * 1.4, xl2 + sw, va.y + dp * 0.6); } g.stroke();
      for (var k4 = 0; k4 <= 28; k4++) { var tq = P(lerp(-3.4, 3.4, k4 / 28), hgt - 0.02, 63.86); if (!tq) continue; g.fillStyle = k4 % 3 ? '#f29a2e' : '#f6c342'; g.beginPath(); g.arc(tq.x, tq.y, Math.max(0.9, tq.s * 0.06), 0, TAU); g.fill(); if (k4 % 4 === 2) { g.fillStyle = '#2f8f5b'; g.beginPath(); g.moveTo(tq.x - tq.s * 0.05, tq.y); g.lineTo(tq.x + tq.s * 0.05, tq.y); g.lineTo(tq.x, tq.y + tq.s * 0.22); g.closePath(); g.fill(); } }
    }
    function house(h, t) {
      var X = h.side * 8;
      if (h.z2 < cam.z + NEAR) return;
      if (!poly([[X, 0, h.z1], [X, h.h, h.z1], [X, h.h, h.z2], [X, 0, h.z2]])) return;
      g.fillStyle = h.col; g.fill();
      g.fillStyle = 'rgba(0,0,0,' + (0.25 + 0.2 * (h.side > 0 ? 1 : 0)) + ')'; g.fill();
      // Cornice line
      fillPoly([[X, h.h - 0.4, h.z1], [X, h.h, h.z1], [X, h.h, h.z2], [X, h.h - 0.4, h.z2]], 'rgba(214,176,111,.18)');
      var w = h.z2 - h.z1, cols = Math.max(2, Math.round(w / 2.2)), f, c;
      for (f = 0; f < h.floors; f++) {
        var y0 = 0.9 + f * 3.1;
        for (c = 0; c < cols; c++) {
          var zc = h.z1 + w * (c + 0.5) / cols, door = f === 0 && c === Math.floor(cols / 2);
          var ww = door ? 0.75 : 0.5, wh = door ? 2.3 : 1.5, yb = door ? 0 : y0;
          var lit = ((h.lit * 10 + f * 3 + c) % 3) < 1.6;
          if (door) archWindow(X, yb, zc, ww + 0.14, wh + 0.16, '#7a4a22');
          archWindow(X, yb, zc, ww, wh, door ? '#3a1f12' : lit ? 'rgba(255,186,96,.8)' : 'rgba(22,16,34,.95)');
          if (!door && f > 0) [-1, 1].forEach(function (sd2) { fillPoly([[X - h.side * 0.02, yb, zc + sd2 * ww], [X - h.side * 0.02, yb, zc + sd2 * (ww + 0.34)], [X - h.side * 0.02, yb + wh * 0.72, zc + sd2 * (ww + 0.34)], [X - h.side * 0.02, yb + wh * 0.72, zc + sd2 * ww]], ['#2f5d4a', '#3a4f7a', '#6b3a1c'][h.hue % 3]); });
          if (door) {
            // Toran over the door and marigold strands
            for (var k = 0; k < 7; k++) { var tp = P(X, 2.7, zc - 0.9 + k * 0.3); if (tp) { var fs = tp.s * 0.12; g.fillStyle = ['#f08a24', '#2f8f5b', '#c2185b', '#ffc861'][k % 4]; g.beginPath(); g.moveTo(tp.x - fs, tp.y); g.lineTo(tp.x + fs, tp.y); g.lineTo(tp.x, tp.y + fs * 2); g.closePath(); g.fill(); } }
            [-1, 1].forEach(function (s) { var a = P(X, 2.6, zc + s * 0.85), b = P(X, 0.8, zc + s * 0.85); if (a && b) { g.strokeStyle = '#f2a33a'; g.lineWidth = Math.max(1, a.s * 0.1); g.setLineDash([Math.max(1, a.s * 0.08), Math.max(1, a.s * 0.05)]); g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke(); g.setLineDash([]); } });
          } else if (lit && f < h.floors) {
            var dp = P(X - h.side * 0.1, yb - 0.05, zc); if (dp) glow(dp.x, dp.y, Math.max(0.7, dp.s * 0.05), '#ffcf7a', (reduce ? 0.8 : 0.6 + 0.4 * Math.sin(t * 7 + zc * 3)) * bright);
          }
        }
        if (f === 1 && h.balcony) fillPoly([[X - h.side * 0.7, y0 - 0.2, h.z1 + 0.6], [X - h.side * 0.7, y0 + 0.7, h.z1 + 0.6], [X - h.side * 0.7, y0 + 0.7, h.z2 - 0.6], [X - h.side * 0.7, y0 - 0.2, h.z2 - 0.6]], 'rgba(120,80,50,.55)');
      }
      if (h.bulbs) for (var cq = h.z1 + 0.6; cq < h.z2 - 0.3; cq += 1.1) for (var cy2 = h.h - 0.8; cy2 > 1.2; cy2 -= 0.9) { var cp = P(X - h.side * 0.05, cy2, cq); if (cp && cp.x > -10 && cp.x < W + 10) glow(cp.x, cp.y, Math.min(1.6, Math.max(0.5, cp.s * 0.04)), TH.bulbs[(h.hue + Math.round(cy2)) % TH.bulbs.length], (0.55 + 0.35 * Math.sin(t * 3 + cq + cy2 * 2) + pulse * 0.2) * bright); }
      if (h.bulbs) for (var q = h.z1 + 0.3; q < h.z2; q += 0.7) { var bp = P(X, h.h - 0.1, q); if (bp) glow(bp.x, bp.y, Math.min(2.4, Math.max(0.6, bp.s * 0.06)), TH.bulbs[h.hue % TH.bulbs.length], (0.75 + pulse * 0.25) * bright); }
      if (h.rangoli) { var rp = P(X - h.side * 1.4, 0, (h.z1 + h.z2) / 2); if (rp) rangoli(rp, h.hue); }
      if (h.hue === 3 && h.z2 - h.z1 > 5.5) {
        // A small kariyana shop: a painted board over the shutter
        var zm = (h.z1 + h.z2) / 2 + 1.4;
        fillPoly([[X - h.side * 0.03, 2.55, zm - 1.3], [X - h.side * 0.03, 2.55, zm + 1.3], [X - h.side * 0.03, 3.15, zm + 1.3], [X - h.side * 0.03, 3.15, zm - 1.3]], '#b8312b');
        var tp2 = P(X - h.side * 0.05, 2.85, zm); if (tp2 && tp2.s > 6) { var fs2 = Math.min(13, tp2.s * 0.32); g.font = '700 ' + fs2 + 'px "Noto Sans Gujarati", "Gujarati Sangam MN", Shruti, "Anek Gujarati", system-ui, sans-serif'; g.textAlign = 'center'; g.fillStyle = '#ffe9b8'; g.fillText('કરિયાણા', tp2.x, tp2.y + fs2 * 0.35); }
      }
      if (h.hue % 2 === 0) { var tz = (h.z1 + h.z2) / 2, tk = P(X + h.side * 1.4, h.h, tz), tk2 = P(X + h.side * 1.4, h.h + 1.2, tz); if (tk && tk2) { var tw2 = Math.max(2, tk.s * 0.6); g.fillStyle = '#16141a'; g.fillRect(tk.x - tw2 / 2, tk2.y, tw2, tk.y - tk2.y); g.fillStyle = '#1f1d24'; g.beginPath(); g.ellipse(tk.x, tk2.y, tw2 / 2, tw2 * 0.12, 0, 0, TAU); g.fill(); } }
      if (h.hue % 3 === 1) { var az = h.z1 + 1, a0 = P(X + h.side * 0.5, h.h, az), a1 = P(X + h.side * 0.5, h.h + 1.6, az); if (a0 && a1) { g.strokeStyle = 'rgba(30,26,34,.9)'; g.lineWidth = 1; g.beginPath(); g.moveTo(a0.x, a0.y); g.lineTo(a1.x, a1.y); g.moveTo(a1.x - a1.s * 0.4, a1.y + a1.s * 0.2); g.lineTo(a1.x + a1.s * 0.4, a1.y + a1.s * 0.2); g.stroke(); } }
    }
    function archWindow(X, y, z, hw, hh, col) {
      var a = P(X, y, z - hw), b = P(X, y, z + hw), c = P(X, y + hh * 0.7, z + hw), d = P(X, y + hh * 0.7, z - hw), top = P(X, y + hh * 1.12, z);
      if (!a || !b || !c || !d || !top) return;
      g.fillStyle = col; g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(d.x, d.y); g.quadraticCurveTo(top.x, top.y, c.x, c.y); g.lineTo(b.x, b.y); g.closePath(); g.fill();
    }
    function rangoli(p, hue) {
      var r = p.s * 0.8, cols = ['#e63946', '#f4a261', '#2a9d8f', '#e9c46a', '#8e44ad', '#ff6fa3'];
      for (var k = 3; k >= 1; k--) { g.fillStyle = cols[(hue + k) % cols.length]; g.globalAlpha = 0.65; g.beginPath(); g.ellipse(p.x, p.y, r * k / 3, r * k / 3 * 0.28, 0, 0, TAU); g.fill(); }
      g.globalAlpha = 1;
    }
    function sheriOver(t) {
      // Electric wires sagging across and along the lane
      g.strokeStyle = 'rgba(12,10,14,.75)'; g.lineWidth = 0.8;
      [[-8, 9, 6, 8, 8.5, 20], [-8, 8.2, 26, 8, 9, 14], [-8, 9.2, 40, 8, 8, 48], [-8, 8.6, 2, 8, 8.8, -4], [-7.8, 9.4, -6, -7.8, 9.4, 60], [7.8, 9, -6, 7.8, 9, 60]].forEach(function (wv) {
        var st0 = false; g.beginPath();
        for (var i = 0; i <= 24; i++) { var q = sag([wv[0], wv[1], wv[2]], [wv[3], wv[4], wv[5]], 0.6, i / 24), pq = P(q[0], q[1], q[2]); if (!pq) { st0 = false; continue; } if (st0) g.lineTo(pq.x, pq.y); else { g.moveTo(pq.x, pq.y); st0 = true; } }
        g.stroke();
      });
      // Fabric canopies (chandarvo) across the lane, printed in triangles
      [12, 21, 34].forEach(function (z, ci) {
        var cols = [TH.flags[ci % TH.flags.length], '#f6c342', '#2f8f5b', '#b8312b'];
        for (var k = 0; k < 10; k++) {
          var u0 = k / 10, u1 = (k + 1) / 10, a = sag([-8, 7.6, z], [8, 7.6, z], 0.9, u0), b = sag([-8, 7.6, z], [8, 7.6, z], 0.9, u1);
          fillPoly([[a[0], a[1], a[2]], [b[0], b[1], b[2]], [b[0], b[1] - 0.2, b[2] + 1.6], [a[0], a[1] - 0.2, a[2] + 1.6]], cols[k % cols.length]);
          var tq = P((a[0] + b[0]) / 2, a[1] - 0.05, a[2]); if (tq) { var fs3 = Math.max(1, tq.s * 0.18); g.fillStyle = cols[(k + 1) % cols.length]; g.beginPath(); g.moveTo(tq.x - fs3, tq.y); g.lineTo(tq.x + fs3, tq.y); g.lineTo(tq.x, tq.y + fs3 * 1.6); g.fill(); }
        }
      });
      var zs = [60, 50, 41, 32, 24, 16, 8, 0, -8], lc = ['#ff9f5a', '#ff6fa3', '#7fe0a0', '#ffd58a'];
      zs.forEach(function (z, i) {
        if (i % 3 === 0) { drawStrand([-8, 6.8, z], [8, 6.8, z + 2], 1.1, 'bulbs', t, i); drawStrand([-8, 6.8, z + 2], [8, 6.8, z], 1.1, 'bulbs', t, i + 3); }
        else drawStrand([-8, 6.4, z], [8, 6.4, z], 1.3, i % 3 === 1 ? 'flags' : 'bulbs', t, i);
        if (i % 2 === 0) lantern(0, 4.4, z + 0.5, lc[i % 4], t, i);
      });
    }

    /* ---------- food stalls ---------- */
    function stall(sl, t) {
      var U = sl.U, V = sl.V, hw = sl.w / 2, D = sl.depth;
      function wpt(u, y, v) { return [sl.x + U[0] * u + V[0] * v, y, sl.z + U[1] * u + V[1] * v]; }
      function at(u, y, v) { var q = wpt(u, y, v); return P(q[0], q[1], q[2]); }
      if (poly([wpt(-hw, 0, D), wpt(hw, 0, D), wpt(hw, 2.4, D), wpt(-hw, 2.4, D)])) { g.fillStyle = '#5a2f17'; g.fill(); g.fillStyle = 'rgba(255,190,110,' + 0.4 * bright + ')'; g.fill(); }
      fillPoly([wpt(-hw, 0, 0), wpt(-hw, 0, D), wpt(-hw, 2.4, D), wpt(-hw, 2.4, 0)], '#32200f');
      fillPoly([wpt(hw, 0, 0), wpt(hw, 0, D), wpt(hw, 2.4, D), wpt(hw, 2.4, 0)], '#32200f');
      var vp = at(0.2, 0, D * 0.55); if (vp) figure(vp, sl.vendor, 0, false, 0);
      fillPoly([wpt(-hw, 0, 0), wpt(hw, 0, 0), wpt(hw, 1, 0), wpt(-hw, 1, 0)], sl.col);
      fillPoly([wpt(-hw, 0.97, 0), wpt(hw, 0.97, 0), wpt(hw, 1.05, -0.25), wpt(-hw, 1.05, -0.25)], '#d9c3a0');
      for (var k = 0; k < 3; k++) { var pot = at(-hw * 0.6 + k * hw * 0.6, 1.05, -0.1); if (pot) { g.fillStyle = ['#c9a37a', '#b5651d', '#e8d5b0'][k]; g.beginPath(); g.ellipse(pot.x, pot.y - pot.s * 0.12, pot.s * 0.18, pot.s * 0.13, 0, 0, TAU); g.fill(); } }
      fillPoly([wpt(-hw - 0.3, 2.75, -0.5), wpt(hw + 0.3, 2.75, -0.5), wpt(hw + 0.3, 2.95, D), wpt(-hw - 0.3, 2.95, D)], 'rgba(40,24,14,.95)');
      var n = 8;
      for (var i = 0; i < n; i++) { var u0 = -hw - 0.3 + (sl.w + 0.6) * i / n, u1 = -hw - 0.3 + (sl.w + 0.6) * (i + 1) / n; fillPoly([wpt(u0, 2.3, -0.5), wpt(u1, 2.3, -0.5), wpt(u1, 2.75, -0.5), wpt(u0, 2.75, -0.5)], i % 2 ? '#efe2c8' : sl.col); }
      for (var bq = 0; bq <= 6; bq++) { var bp = at(-hw + sl.w * bq / 6, 2.24, -0.5); if (bp) glow(bp.x, bp.y, Math.min(3, Math.max(0.8, bp.s * 0.06)), TH.bulbs[bq % TH.bulbs.length], (0.8 + pulse * 0.2) * bright); }
      var sp = at(0, 3.3, -0.5);
      if (sp) {
        var fs = Math.min(14, sp.s * 0.4);
        if (fs >= 6) {
          g.font = '700 ' + fs + 'px "Noto Sans Gujarati", "Gujarati Sangam MN", Shruti, "Anek Gujarati", system-ui, sans-serif'; g.textAlign = 'center';
          var tw = g.measureText(sl.sign).width + fs, fe = fs * 0.55;
          g.fillStyle = 'rgba(24,12,6,.9)'; roundRect(sp.x - tw / 2, sp.y - fs * 1.05, tw, fs * 1.55 + (fe >= 6 ? fe : 0), fs * 0.3); g.fill();
          g.strokeStyle = sl.col; g.lineWidth = 1; g.stroke();
          g.fillStyle = '#ffd58a'; g.fillText(sl.sign, sp.x, sp.y + fs * 0.12);
          if (fe >= 6) { g.font = '600 ' + fe + 'px system-ui, sans-serif'; g.fillStyle = 'rgba(255,230,190,.75)'; g.fillText(sl.en, sp.x, sp.y + fs * 0.12 + fe * 1.15); }
        }
      }
    }

    /* ---------- the mandvi: a small decorated canopy over the central garbo ---------- */
    function mandvi(ctr, part, t) {
      var small = st.venue === 'sheri', cx = ctr.x, cz = ctr.z, r = small ? 0.78 : 1.0, top = small ? 2.4 : 2.85, posts = [[-r, -r], [r, -r], [r, r], [-r, r]];
      // Carved pillars in red and gold bands, front pair drawn after the garbo
      posts.forEach(function (q) {
        var front = q[1] < 0; if ((part === 'front') !== front) return;
        for (var sgi = 0; sgi < 6; sgi++) {
          var a = P(cx + q[0], top * sgi / 6, cz + q[1]), b = P(cx + q[0], top * (sgi + 1) / 6, cz + q[1]); if (!a || !b) continue;
          g.strokeStyle = sgi % 2 ? '#e8b04b' : '#8e1b1b'; g.lineWidth = Math.max(1, a.s * (sgi === 0 ? 0.13 : 0.09)); g.lineCap = 'butt'; g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke();
        }
      });
      if (part === 'back') {
        // A framed image of the goddess, glowing behind the garbo, draped in red cloth
        var fb = P(cx, 0.55, cz + 0.75), ft = P(cx, 1.55, cz + 0.75);
        if (fb && ft) {
          var fw = (fb.y - ft.y) * 0.72, fh = fb.y - ft.y;
          glow(fb.x, ft.y + fh / 2, fw * 0.6, 'rgba(255,180,90,1)', 0.35 * bright);
          g.fillStyle = '#e8b04b'; g.fillRect(fb.x - fw / 2, ft.y, fw, fh);
          var ig = g.createLinearGradient(0, ft.y, 0, fb.y); ig.addColorStop(0, '#f6c35a'); ig.addColorStop(1, '#c0392b');
          g.fillStyle = ig; g.fillRect(fb.x - fw * 0.4, ft.y + fh * 0.08, fw * 0.8, fh * 0.84);
          g.fillStyle = 'rgba(255,240,200,.7)'; g.beginPath(); g.arc(fb.x, ft.y + fh * 0.38, fw * 0.22, 0, TAU); g.fill();
          g.fillStyle = '#9b1f1a'; g.beginPath(); g.moveTo(fb.x - fw * 0.6, ft.y); g.quadraticCurveTo(fb.x, ft.y + fh * 0.25, fb.x + fw * 0.6, ft.y); g.lineTo(fb.x + fw * 0.6, ft.y + fh * 0.5); g.quadraticCurveTo(fb.x + fw * 0.45, ft.y + fh * 0.2, fb.x + fw * 0.35, ft.y + fh * 0.1); g.lineTo(fb.x - fw * 0.35, ft.y + fh * 0.1); g.quadraticCurveTo(fb.x - fw * 0.45, ft.y + fh * 0.2, fb.x - fw * 0.6, ft.y + fh * 0.5); g.closePath(); g.fill();
        }
        return;
      }
      // Marigold garlands swinging between the front pillars and round the sides
      [[[-r, -r], [r, -r]], [[-r, -r], [-r, r]], [[r, -r], [r, r]]].forEach(function (pair, gi) {
        var A = [cx + pair[0][0], top - 0.1, cz + pair[0][1]], B = [cx + pair[1][0], top - 0.1, cz + pair[1][1]];
        for (var k = 0; k <= 12; k++) { var q = sag(A, B, 0.55, k / 12), pp = P(q[0], q[1], q[2]); if (pp) { g.fillStyle = k % 2 ? '#f29a2e' : '#f6c342'; g.beginPath(); g.arc(pp.x, pp.y, Math.max(0.8, pp.s * 0.07), 0, TAU); g.fill(); } }
      });
      // Tiered roof: a scalloped dome, a smaller dome above it, a kalash and a red flag
      var c = P(cx, top, cz), apex = P(cx, top + 0.9, cz), apex2 = P(cx, top + 1.45, cz); if (!c || !apex || !apex2) return;
      var ex = P(cx + r * 1.15, top, cz); var rx = ex ? Math.abs(ex.x - c.x) : c.s * r, ry = rx * Math.max(0.12, (cam.y - top) / Math.max(4, c.z) * 0.9 + 0.08);
      g.fillStyle = '#5a1510'; g.beginPath(); g.ellipse(c.x, c.y, rx, Math.abs(ry), 0, 0, TAU); g.fill();
      function dome(cy, ay, w, c1, c2) { g.beginPath(); g.moveTo(cx0 - w, cy); g.quadraticCurveTo(cx0 - w * 0.25, ay - (cy - ay) * 0.1, cx0, ay); g.quadraticCurveTo(cx0 + w * 0.25, ay - (cy - ay) * 0.1, cx0 + w, cy); g.closePath(); var dg = g.createLinearGradient(0, ay, 0, cy); dg.addColorStop(0, c1); dg.addColorStop(1, c2); g.fillStyle = dg; g.fill(); }
      var cx0 = c.x;
      dome(c.y, apex.y, rx, '#f0c24b', '#9b1f1a');
      g.strokeStyle = 'rgba(255,230,170,.6)'; g.lineWidth = Math.max(0.6, c.s * 0.02);
      for (var rb = -2; rb <= 2; rb++) { g.beginPath(); g.moveTo(cx0 + rb * rx * 0.38, c.y); g.quadraticCurveTo(cx0 + rb * rx * 0.2, apex.y + (c.y - apex.y) * 0.3, cx0, apex.y); g.stroke(); }
      dome(apex.y + (c.y - apex.y) * 0.15, apex2.y, rx * 0.35, '#f6d27a', '#c0392b');
      g.fillStyle = '#e8b04b'; g.beginPath(); g.arc(cx0, apex2.y - c.s * 0.1, Math.max(1, c.s * 0.11), 0, TAU); g.fill();
      var fp0 = apex2.y - c.s * 0.15, fp1 = apex2.y - c.s * 0.75, wave = reduce ? 0 : Math.sin(t * 4) * c.s * 0.06;
      g.strokeStyle = '#3a2413'; g.lineWidth = Math.max(0.7, c.s * 0.025); g.beginPath(); g.moveTo(cx0, fp0); g.lineTo(cx0, fp1); g.stroke();
      g.fillStyle = '#d8453a'; g.beginPath(); g.moveTo(cx0, fp1); g.lineTo(cx0 + c.s * 0.42, fp1 + c.s * 0.12 + wave); g.lineTo(cx0, fp1 + c.s * 0.26); g.closePath(); g.fill();
      // Scalloped edge with bulbs, a toran fringe and small bells
      for (var k = 0; k < 18; k++) {
        var an = k / 18 * TAU, bx = cx0 + Math.cos(an) * rx, by = c.y + Math.sin(an) * Math.abs(ry);
        if (Math.sin(an) > -0.25) {
          var fs = Math.max(1, c.s * 0.1); g.fillStyle = TH.flags[k % TH.flags.length]; g.beginPath(); g.moveTo(bx - fs, by); g.lineTo(bx + fs, by); g.lineTo(bx, by + fs * 1.8); g.closePath(); g.fill();
          if (k % 3 === 0) { g.strokeStyle = '#8a6a2a'; g.lineWidth = 0.8; g.beginPath(); g.moveTo(bx, by); g.lineTo(bx, by + c.s * 0.35); g.stroke(); g.fillStyle = '#e8b04b'; g.beginPath(); g.arc(bx, by + c.s * 0.4, Math.max(0.8, c.s * 0.05), 0, TAU); g.fill(); }
        }
        glow(bx, by, Math.max(0.7, Math.min(2.2, c.s * 0.05)), TH.bulbs[k % TH.bulbs.length], (0.7 + 0.3 * Math.sin(t * 3 + k) + pulse * 0.2) * bright);
      }
    }
    // Rangoli under the garbo: petals, a ring of dots and a bright centre, laid on the ground in perspective
    function rangoliAt(ctr, t) {
      var cols = [TH.flags[0], '#f4a261', '#2a9d8f', TH.flags[2 % TH.flags.length], '#e9c46a'];
      function blob(pts, col, a) { var first = true; g.beginPath(); for (var i = 0; i < pts.length; i++) { var q = P(pts[i][0], 0.01, pts[i][1]); if (!q) return; if (first) { g.moveTo(q.x, q.y); first = false; } else g.lineTo(q.x, q.y); } g.closePath(); g.globalAlpha = a; g.fillStyle = col; g.fill(); g.globalAlpha = 1; }
      var ring = []; for (var k = 0; k < 24; k++) { var a0 = k / 24 * TAU; ring.push([ctr.x + Math.cos(a0) * 1.6, ctr.z + Math.sin(a0) * 1.6]); }
      blob(ring, '#3a1d12', 0.55);
      for (var pt = 0; pt < 8; pt++) {
        var an = pt / 8 * TAU, pts = [];
        for (var j = 0; j <= 10; j++) { var u = j / 10 * TAU, px = Math.cos(u) * 0.55 + 0.75, pz = Math.sin(u) * 0.24; pts.push([ctr.x + Math.cos(an) * px - Math.sin(an) * pz, ctr.z + Math.sin(an) * px + Math.cos(an) * pz]); }
        blob(pts, cols[pt % cols.length], 0.85);
      }
      var inner = []; for (var m = 0; m < 16; m++) { var a1 = m / 16 * TAU; inner.push([ctr.x + Math.cos(a1) * 0.5, ctr.z + Math.sin(a1) * 0.5]); }
      blob(inner, '#f6c342', 0.9);
      for (var d = 0; d < 20; d++) { var a2 = d / 20 * TAU, q = P(ctr.x + Math.cos(a2) * 1.45, 0.01, ctr.z + Math.sin(a2) * 1.45); if (q) { g.fillStyle = '#fff3d6'; g.beginPath(); g.arc(q.x, q.y, Math.max(0.5, q.s * 0.04), 0, TAU); g.fill(); } }
      // Diyas round the rangoli, flickering
      for (var dy = 0; dy < 12; dy++) {
        var a3 = (dy + 0.5) / 12 * TAU, qd = P(ctr.x + Math.cos(a3) * 1.85, 0, ctr.z + Math.sin(a3) * 1.85); if (!qd) continue;
        g.fillStyle = '#7a3b1a'; g.beginPath(); g.ellipse(qd.x, qd.y, Math.max(1, qd.s * 0.09), Math.max(0.5, qd.s * 0.035), 0, 0, TAU); g.fill();
        var fl = reduce ? 1 : 0.75 + 0.25 * Math.sin(t * 9 + dy * 1.7);
        glow(qd.x, qd.y - qd.s * 0.07, Math.max(0.6, qd.s * 0.035 * fl), '#ffd27a', (st.on ? 0.95 : 0.6) * fl);
      }
    }

    /* ---------- the garbo ---------- */
    function garbo(p, lit, t, main) {
      var s = p.s, x = p.x, y = p.y, L = 0.45 + 0.55 * lit;
      if (lit > 0.02) { var hr = s * (main ? 2.6 : 2); var hg = g.createRadialGradient(x, y - s * 1.05, 1, x, y - s * 1.05, hr); hg.addColorStop(0, 'rgba(255,180,90,' + 0.42 * lit + ')'); hg.addColorStop(1, 'rgba(255,180,90,0)'); g.fillStyle = hg; g.beginPath(); g.arc(x, y - s * 1.05, hr, 0, TAU); g.fill(); }
      // Low wooden stand draped in a red cloth
      g.fillStyle = '#3b2213'; g.fillRect(x - s * 0.34, y - s * 0.5, s * 0.07, s * 0.5); g.fillRect(x + s * 0.27, y - s * 0.5, s * 0.07, s * 0.5);
      g.fillStyle = '#9b1f1a'; g.beginPath(); g.moveTo(x - s * 0.42, y - s * 0.56); g.lineTo(x + s * 0.42, y - s * 0.56); g.lineTo(x + s * 0.36, y - s * 0.3); g.lineTo(x, y - s * 0.18); g.lineTo(x - s * 0.36, y - s * 0.3); g.closePath(); g.fill();
      g.fillStyle = '#e8b04b'; for (var k = 0; k < 5; k++) g.fillRect(x - s * 0.36 + k * s * 0.18, y - s * 0.3 + (k % 2) * s * 0.05, s * 0.03, s * 0.03);
      // Clay pot
      var cy = y - s * 0.9, r = s * 0.3;
      var body = g.createRadialGradient(x - r * 0.35, cy - r * 0.3, r * 0.1, x, cy, r * 1.2);
      body.addColorStop(0, 'rgb(' + Math.round(205 * L) + ',' + Math.round(110 * L) + ',' + Math.round(58 * L) + ')'); body.addColorStop(1, 'rgb(' + Math.round(96 * L) + ',' + Math.round(40 * L) + ',' + Math.round(20 * L) + ')');
      g.fillStyle = body; g.beginPath(); g.ellipse(x, cy, r, r * 0.92, 0, 0, TAU); g.fill();
      // Perforations: light spills through when lit
      var fl = reduce ? 1 : 0.8 + 0.2 * Math.sin(t * 11) * Math.sin(t * 7.3);
      g.fillStyle = lit > 0.05 ? 'rgba(255,' + Math.round(210 + 30 * fl) + ',130,' + (0.25 + 0.75 * lit * fl) + ')' : 'rgba(40,16,8,.9)';
      var rows = [[-0.5, 5], [-0.15, 7], [0.2, 7], [0.52, 5]];
      rows.forEach(function (rw, ri) { var yy = cy + rw[0] * r, span = Math.sqrt(1 - rw[0] * rw[0]) * r * 1.6; for (var j = 0; j < rw[1]; j++) { var xx = x - span / 2 + span * (j + 0.5) / rw[1]; g.beginPath(); if (ri % 2) { g.moveTo(xx, yy - r * 0.1); g.lineTo(xx + r * 0.08, yy + r * 0.07); g.lineTo(xx - r * 0.08, yy + r * 0.07); g.closePath(); } else g.arc(xx, yy, r * 0.055, 0, TAU); g.fill(); } });
      // Neck with a marigold garland, then the diya on top
      g.fillStyle = 'rgb(' + Math.round(120 * L) + ',' + Math.round(50 * L) + ',' + Math.round(24 * L) + ')';
      g.beginPath(); g.ellipse(x, cy - r * 0.88, r * 0.42, r * 0.14, 0, 0, TAU); g.fill();
      for (var m = 0; m < 9; m++) { var ma = Math.PI * (m / 8); g.fillStyle = m % 2 ? '#f29a2e' : '#f6c342'; g.beginPath(); g.arc(x - Math.cos(ma) * r * 0.5, cy - r * 0.78 + Math.sin(ma) * r * 0.16, r * 0.075, 0, TAU); g.fill(); }
      g.fillStyle = '#6a2c14'; g.beginPath(); g.ellipse(x, cy - r * 1.02, r * 0.26, r * 0.08, 0, 0, TAU); g.fill();
      if (lit > 0.25) {
        var f = (lit - 0.25) / 0.75, fh = r * (0.55 + (reduce ? 0 : 0.08 * Math.sin(t * 9) + 0.04 * Math.sin(t * 23))) * f, swy = reduce ? 0 : Math.sin(t * 5) * r * 0.04, base = cy - r * 1.05;
        glow(x, base - fh * 0.4, r * 0.18, 'rgba(255,200,110,1)', 0.5 * f);
        g.beginPath(); g.moveTo(x - r * 0.1, base); g.quadraticCurveTo(x - r * 0.12, base - fh * 0.6, x + swy, base - fh); g.quadraticCurveTo(x + r * 0.12, base - fh * 0.6, x + r * 0.1, base); g.closePath();
        var ff = g.createLinearGradient(0, base - fh, 0, base); ff.addColorStop(0, 'rgba(255,244,200,' + f + ')'); ff.addColorStop(0.55, 'rgba(255,190,70,' + f + ')'); ff.addColorStop(1, 'rgba(230,90,30,' + f + ')');
        g.fillStyle = ff; g.fill();
      }
    }

    /* ---------- dancers ---------- */
    function circleCentre(c, T) {
      if (c.parent) return circleCentre(c.parent, T);
      // The garbo and its mandvi stand exactly at the centre; only the smaller circles drift
      if (c.main) return { x: c.x0, z: c.z0 };
      var d = reduce ? 0 : 1;
      return { x: c.x0 + d * 0.7 * Math.sin(T * 0.09 + c.ph[0]), z: c.z0 + d * 0.6 * Math.sin(T * 0.07 + c.ph[1]) };
    }
    function dancerWorld(c, d, T, ctr) {
      var a = d.a0 + c.spin + (reduce ? 0 : 0.06 * Math.sin(T * 0.5 + d.ph2));
      var rr = c.R * (1 + c.wob * (0.07 * Math.sin(2 * a + c.ph[2] + T * 0.15) + 0.045 * Math.sin(3 * a + c.ph[3] - T * 0.11))) + (reduce ? 0 : 0.22 * Math.sin(T * 0.8 + d.ph));
      return { x: ctr.x + Math.cos(a) * rr, z: ctr.z + Math.sin(a) * rr, a: a };
    }
    // Figures are drawn from the feet up in units of their height. near (0 to 1) darkens a figure that passes
    // right in front of the camera into a silhouette, so it frames the view instead of blocking it.
    var SKIN = ['#c99a72', '#b98563', '#d9b48c', '#a8744f', '#c08a60'];
    // Colours are darkened towards shadow (f) and faded into the night haze with distance (FOGF), cached by value
    var tintCache = {}, FOGF = 0;
    function tint(hex, f) {
      if (!f && !FOGF) return hex;
      var q = Math.round((f || 0) * 20), qf = Math.round(FOGF * 20), key = hex + q + '/' + qf, hit = tintCache[key]; if (hit) return hit;
      var n = parseInt(hex.slice(1), 16), r = n >> 16, gg = (n >> 8) & 255, bb = n & 255, ff = q / 20, fg = qf / 20;
      r = lerp(lerp(r, 16, ff), 26, fg); gg = lerp(lerp(gg, 10, ff), 20, fg); bb = lerp(lerp(bb, 8, ff), 38, fg);
      return (tintCache[key] = 'rgb(' + Math.round(r) + ',' + Math.round(gg) + ',' + Math.round(bb) + ')');
    }
    // Four kinds of dandiya: lacquered spiral stripes, maroon with mirror work, gold gota with a tassel, bright bands
    var STICKS = [
      { bands: ['#c0392b', '#2f8f5b', '#f0c24b'], ends: '#e8b04b' },
      { bands: ['#6b1a1a'], ends: '#e8b04b', mirrors: true },
      { bands: ['#e8b04b', '#d69a2d'], ends: '#b8312b', tassel: '#c2185b' },
      { bands: ['#f0c24b', '#c2185b', '#3b4cc0', '#16a085'], ends: '#f3e6d0', tassel: '#f08a24' }
    ];
    function dandiya(x0, y0, ang, len, kind, dk, fine) {
      var sd = STICKS[kind % STICKS.length], n = sd.bands.length > 1 ? 6 : 1, dx = Math.cos(ang) * len, dy = Math.sin(ang) * len;
      var x1 = x0 - dx * 0.22, y1 = y0 - dy * 0.22, w = Math.max(0.9, len * 0.08);
      g.lineCap = 'butt'; g.lineWidth = w;
      for (var i = 0; i < n; i++) {
        var a0 = i / n, a1 = (i + 1) / n;
        g.strokeStyle = tint(sd.bands[i % sd.bands.length], dk);
        g.beginPath(); g.moveTo(x1 + (dx * 1.22) * a0, y1 + (dy * 1.22) * a0); g.lineTo(x1 + (dx * 1.22) * a1, y1 + (dy * 1.22) * a1); g.stroke();
      }
      g.lineCap = 'round'; g.strokeStyle = tint(sd.ends, dk); g.lineWidth = w * 1.25;
      g.beginPath(); g.moveTo(x1 + dx * 1.2, y1 + dy * 1.2); g.lineTo(x1 + dx * 1.22, y1 + dy * 1.22); g.stroke();
      if (fine && sd.mirrors) { g.fillStyle = 'rgba(255,250,235,.9)'; for (var m = 1; m < 5; m++) { g.beginPath(); g.arc(x1 + dx * 1.22 * m / 5, y1 + dy * 1.22 * m / 5, w * 0.35, 0, TAU); g.fill(); } }
      if (sd.tassel) { g.strokeStyle = tint(sd.tassel, dk); g.lineWidth = Math.max(0.7, w * 0.45); g.beginPath(); for (var k = -1; k <= 1; k++) { g.moveTo(x1, y1); g.lineTo(x1 + k * w * 0.9, y1 + len * 0.16); } g.stroke(); }
    }
    // Where the elbows and hands go for what the person is doing: playing, singing, holding something, dancing
    function armsFor(d, x, shy, h, sw, walking, dancing, up, tw) {
      var le, lh, re, rh;
      if (d.role === 'singer' && d.idle) { le = [x - h * 0.12, shy + h * 0.15]; lh = [x - h * 0.08, shy + h * 0.27]; var tk2 = reduce ? 0 : Math.max(0, Math.sin(T * 1.7 + d.ph)); re = [x + h * 0.13, shy + h * 0.12]; rh = [x + h * (0.12 + 0.06 * tk2), shy + h * (0.28 - 0.14 * tk2)]; }
      else if (d.role === 'singer' && !d.dancing) {
        // The mic in one hand; the other hand draws the phrase: an open palm, a reach to the crowd, a hand on the heart
        le = [x - h * 0.13, shy + h * 0.12]; lh = [x - h * 0.03, shy - h * 0.09];
        if (d.cheer) { var wv = reduce ? 0 : Math.sin(T * 7) * h * 0.04; re = [x + h * 0.15, shy - h * 0.13]; rh = [x + h * 0.2 + wv, shy - h * 0.32]; }
        else { var gp = reduce ? 0 : Math.sin(T * 1.3 + d.ph) * 0.5 + Math.sin(T * 0.47 + d.ph * 2) * 0.5, g0 = (d.gest || 0) < 0.33 ? 0 : (d.gest || 0) < 0.66 ? 1 : 2;
          if (g0 === 2) { re = [x + h * 0.12, shy + h * 0.1]; rh = [x + h * 0.02, shy + h * (0.06 + 0.02 * gp)]; }
          else { re = [x + h * (0.15 + 0.03 * gp), shy + h * (0.04 - 0.05 * gp) - sw * h * 0.03]; rh = [x + h * (0.22 + 0.06 * gp + (g0 ? 0.04 : 0)), shy - h * (0.06 + 0.1 * gp + (g0 ? 0.05 : 0)) - sw * h * 0.05]; } } }
      else if (d.role === 'tabla') { var tk = reduce ? 0 : Math.sin(T * 9 + d.ph); le = [x - h * 0.15, shy + h * 0.14]; lh = [x - h * 0.13, shy + h * (0.28 - 0.04 * Math.max(0, tk))]; re = [x + h * 0.15, shy + h * 0.14]; rh = [x + h * 0.13, shy + h * (0.29 - 0.04 * Math.max(0, -tk))]; }
      else if (d.role === 'dhol') { var hit = Math.max(0, sw); le = [x - h * 0.16, shy + h * 0.1]; lh = [x - h * 0.22, shy + h * (0.2 - 0.06 * hit)]; re = [x + h * 0.16, shy + h * 0.1]; rh = [x + h * 0.22, shy + h * (0.2 - 0.06 * Math.max(0, -sw))]; }
      else if (d.role === 'dj') {
        // One hand on the laptop; the other holds a cup of chhas and brings it up for a sip every few seconds
        var sp = reduce ? 0 : Math.max(0, Math.sin(((T + d.ph * 10) % 7) / 7 * TAU * 1 - 1.2)), sip = sp > 0.6 && !d.talking ? Math.min(1, (sp - 0.6) / 0.3) : 0;
        // Every few bars, while the music plays, he lifts one headphone cup to his ear to cue the next song
        var cueT = (T + d.ph * 5) % 14, cue = st.on && !reduce && !d.talking && cueT > 8.5 && cueT < 12.5 ? Math.min(1, (cueT - 8.5) / 0.35, (12.5 - cueT) / 0.35) : 0;
        le = [x - h * lerp(0.14, 0.15, cue), shy + h * lerp(0.14, 0.03, cue)]; lh = [x - h * lerp(0.06 - sw * 0.015, 0.075, cue), shy + h * lerp(0.24, -0.1, cue)];
        re = [x + h * 0.15, shy + h * (0.13 - 0.1 * sip)]; rh = [x + h * lerp(0.14, 0.035, sip), shy + h * lerp(0.1, -0.06, sip)];
        d.cupAt = rh; d.cueAt = cue > 0.5 ? lh : null;
      }
      else if (d.role === 'benjo') { le = [x - h * 0.15, shy + h * 0.12]; lh = [x - h * 0.2, shy + h * 0.2]; re = [x + h * 0.14, shy + h * 0.12]; rh = [x + h * 0.16, shy + h * (0.2 + 0.03 * sw)]; }
      else if (d.role === 'keys') { var rip = reduce ? 0 : Math.sin(T * 7 + d.ph) * h * 0.02; le = [x - h * 0.14, shy + h * 0.14]; lh = [x - h * 0.1 + sw * h * 0.02 + rip, shy + h * 0.26]; re = [x + h * 0.14, shy + h * 0.14]; rh = [x + h * 0.1 - sw * h * 0.02 + rip * 0.7, shy + h * 0.26]; }
      else if (d.holding === 'tea') { le = [x - h * 0.12, shy + h * 0.15]; lh = [x - h * 0.13, shy + h * 0.3]; re = [x + h * 0.12, shy + h * 0.16]; rh = [x + h * 0.07, shy + h * 0.06]; d.cupAt = rh; }
      else if (d.holding === 'phone') { le = [x - h * 0.11, shy + h * 0.14]; lh = [x - h * 0.02, shy + h * 0.12]; re = [x + h * 0.11, shy + h * 0.14]; rh = [x + h * 0.02, shy + h * 0.12]; }
      else if (d.sitting && !d.role) { le = [x - h * 0.11, shy + h * 0.15]; lh = [x - h * 0.06, shy + h * 0.29]; re = [x + h * 0.11, shy + h * 0.15]; rh = [x + h * 0.06, shy + h * 0.29]; }
      else if (d.stander && d.phone) { le = [x - h * 0.13, shy + h * 0.15]; lh = [x - h * 0.13, shy + h * 0.3]; re = [x + h * 0.1, shy - h * 0.06]; rh = [x + h * 0.06, shy - h * 0.2]; }
      else if (d.stander && d.chat && Math.sin(T * 1.3 + d.sway) > 0.4) { le = [x - h * 0.12, shy + h * 0.15]; lh = [x - h * 0.13, shy + h * 0.3]; re = [x + h * 0.16, shy + h * 0.12]; rh = [x + h * 0.22, shy + h * (0.02 + 0.04 * Math.sin(T * 5 + d.sway))]; }
      else if (d.photo && !walking) { le = [x - h * 0.12, shy + h * 0.06]; lh = [x - h * 0.04, shy - h * 0.1]; re = [x + h * 0.12, shy + h * 0.06]; rh = [x + h * 0.04, shy - h * 0.1]; }
      else if (d.reach) { var rs = d.reach; le = [x + rs * h * 0.06, shy + h * 0.1]; lh = [x + rs * h * 0.24, shy + h * 0.08]; re = [x + rs * h * 0.16, shy + h * 0.06]; rh = [x + rs * h * 0.27, shy + h * 0.02]; }
      else if (tw > 0.3) { le = [x - h * 0.17, shy - h * 0.1]; lh = [x - h * 0.24, shy - h * 0.24]; re = [x + h * 0.17, shy - h * 0.1]; rh = [x + h * 0.24, shy - h * 0.24]; }
      else if (up && st.style === 'dandiya') { le = [x - h * 0.13, shy - h * 0.12]; lh = [x - h * 0.012, shy - h * 0.27]; re = [x + h * 0.13, shy - h * 0.12]; rh = [x + h * 0.012, shy - h * 0.27]; }
      else if (dancing) { le = [x - h * 0.18, shy + h * (0.02 - 0.06 * sw)]; lh = [x - h * 0.22, shy - h * (0.1 + 0.14 * sw)]; re = [x + h * 0.18, shy + h * (0.02 + 0.06 * sw)]; rh = [x + h * 0.22, shy - h * (0.1 - 0.14 * sw)]; }
      else { var a1 = walking ? sw * 0.05 : 0; le = [x - h * 0.11, shy + h * 0.15]; lh = [x - h * (0.12 + a1), shy + h * 0.3]; re = [x + h * 0.11, shy + h * 0.15]; rh = [x + h * (0.12 - a1), shy + h * 0.3]; }
      // A clap you can see: the hands travel in and meet palm to palm, in front of the chest or, for some, overhead,
      // then part again
      if (st.style !== 'dandiya' && (d.clapK || 0) > 0.02 && !d.role && !d.holding && !(d.stander && d.phone) && tw <= 0.3) {
        var ck = d.clapK * d.clapK * (3 - 2 * d.clapK), hi0 = !!d.clapHigh, my0 = shy + h * (hi0 ? -0.25 : -0.02);
        le = [lerp(le[0], x - h * 0.15, ck), lerp(le[1], shy + h * (hi0 ? -0.1 : 0.08), ck)]; re = [lerp(re[0], x + h * 0.15, ck), lerp(re[1], shy + h * (hi0 ? -0.1 : 0.08), ck)];
        lh = [lerp(lh[0], x - h * 0.012, ck), lerp(lh[1], my0, ck)]; rh = [lerp(rh[0], x + h * 0.012, ck), lerp(rh[1], my0, ck)];
      }
      // The flourishes and cued moves reshape the arms, easing in and out
      if (d.fk > 0.02) {
        var fk = d.fk;
        if (d.flair === 'raise') { var fq0 = Math.sin(T * 14 + d.ph) * h * 0.03; le = [lerp(le[0], x - h * 0.15, fk), lerp(le[1], shy - h * 0.12, fk)]; lh = [lerp(lh[0], x - h * 0.13, fk), lerp(lh[1], shy - h * 0.32 + fq0, fk)]; re = [lerp(re[0], x + h * 0.15, fk), lerp(re[1], shy - h * 0.12, fk)]; rh = [lerp(rh[0], x + h * 0.13, fk), lerp(rh[1], shy - h * 0.32 - fq0, fk)]; }
        if (d.flair === 'handup') { re = [lerp(re[0], x + h * 0.16, fk), lerp(re[1], shy - h * 0.12, fk)]; rh = [lerp(rh[0], x + h * 0.21, fk), lerp(rh[1], shy - h * 0.34 + Math.sin(T * 6) * h * 0.02, fk)]; }
        if (d.flair === 'flurry') { var fq1 = Math.sin(T * 24 + d.ph); lh = [lh[0], lh[1] - Math.max(0, fq1) * h * 0.05 * fk]; rh = [rh[0], rh[1] - Math.max(0, -fq1) * h * 0.05 * fk]; }
      }
      if (d.pose && d.poseK > 0.02) {
        var pk = d.poseK;
        if (d.pose === 'point') { re = [lerp(re[0], x + h * 0.17, pk), lerp(re[1], shy - h * 0.03, pk)]; rh = [lerp(rh[0], x + h * 0.31, pk), lerp(rh[1], shy - h * 0.13, pk)]; }
        else { var cl = reduce ? 0.5 : Math.abs(Math.sin(BEAT * Math.PI)); le = [lerp(le[0], x - h * 0.13, pk), lerp(le[1], shy - h * 0.15, pk)]; lh = [lerp(lh[0], x - h * (0.02 + 0.06 * cl), pk), lerp(lh[1], shy - h * 0.33, pk)]; re = [lerp(re[0], x + h * 0.13, pk), lerp(re[1], shy - h * 0.15, pk)]; rh = [lerp(rh[0], x + h * (0.02 + 0.06 * cl), pk), lerp(rh[1], shy - h * 0.33, pk)]; }
      }
      return [le, lh, re, rh];
    }
    function figure(p, d, T, isYou, beatPh, fade) {
      if (d.coupleRole && st.listener !== 'circle' && d.alt) { var a0 = d.alt; ['flash', 'twirl', 'atHome', 'walking', 'step', 'sitting', 'rest', 'ph'].forEach(function (k) { a0[k] = d[k]; }); d = a0; }
      var s = p.s, x = p.x, y = p.y, h = d.h * s, up = d.flash > 0.25;
      var walking = ((d.walker && d.moving) || d.walking) && !reduce, dancing = (d.pair && d.pair.on && !d.moving) || !d.walker && !d.role && !d.watcher && !d.stander && !d.sitting && st.on && !reduce && !d.walking && d.atHome !== false, playing = d.role && st.on && !reduce, tw = d.twirl || 0;
      var groundY = null;
      if (d.sitting) { groundY = p.y + ((d.rest && d.rest.y) || 0) * s; y = p.y + 0.48 * h; }
      var ph = walking ? d.step : beatPh * Math.PI + d.ph, sw = walking || dancing || playing ? Math.sin(ph) : 0;
      if (!d.sitting) y -= (walking ? 0.025 : dancing ? 0.05 : 0.015) * Math.abs(sw) * s;
      if (d.stander && !reduce) x += Math.sin(T * 0.8 + d.sway) * h * 0.02;
      if (d.role && !st.on && !reduce) { x += Math.sin(T * 0.6 + d.ph * 3) * h * 0.012; y -= Math.max(0, Math.sin(T * 1.1 + d.ph)) * h * 0.004; }
      if (d.fk > 0.02) { if (d.flair === 'sway' || d.flair === 'step' || d.flair === 'lean') x += Math.sin(T * 3.4 + d.ph) * h * 0.06 * d.fk; if (d.flair === 'lean' || d.flair === 'raise') y -= Math.abs(Math.sin(T * 6.5 + d.ph)) * h * 0.025 * d.fk; if (d.flair === 'shake') x += Math.sin(T * 17) * h * 0.012 * d.fk; }
      if (d.hopK) y -= d.hopK * h * 0.13;
      var near = fade == null ? 0 : 1 - fade, dk = near * 0.88;
      FOGF = isYou || d.coupleRole || near ? 0 : Math.max(0, Math.min(0.62, ((st.listener === 'stage' || st.dj ? p.z - 21.5 : p.z + cam.z - 9)) / 55));
      if (h < 1.5) return;
      g.globalAlpha = 1 - Math.min(1, p.z / 70) * 0.4;
      // Light falls off away from the garbo: people out at the edges are a shade darker than those by the lamp
      if (!near && !isYou && !d.coupleRole && !d.role && lightAt) { var ld = Math.hypot(p.x - lightAt.x, (p.y - lightAt.y) * 2.2) / Math.max(1, W * 0.9); dk = Math.max(dk, Math.min(0.42, ld * 0.5) * (st.on ? 0.8 : 1)); }
      if (!near && h > 16) { g.fillStyle = 'rgba(0,0,0,.3)'; g.beginPath(); g.ellipse(x, groundY != null ? groundY : p.y, h * 0.2, h * 0.045, 0, 0, TAU); g.fill(); }
      var skin = tint(SKIN[Math.floor((d.ph || 0) * 10) % SKIN.length], dk), main = tint(d.col, dk), top = tint(d.top, dk), gold = tint('#e8b04b', dk);
      var fine = (h > 26 || (d.coupleRole && h > 12)) && !near, lw = Math.max(0.8, h * 0.034);
      // Big enough to see properly (the ring nearest you, the couple): cloth with volume, shaped limbs, faces
      var rich = h >= 56 && !near && QP >= 1;
      if (h < 11 && !isYou && !d.coupleRole) {
        // Far away: a few shapes read as a person and keep a big crowd cheap to draw
        if (d.man) { g.fillStyle = tint('#efe6d6', dk); g.fillRect(x - h * 0.07, y - h * 0.44, h * 0.14, h * 0.44); g.fillStyle = main; g.beginPath(); g.moveTo(x - h * 0.09, y - h * 0.8); g.lineTo(x + h * 0.09, y - h * 0.8); g.lineTo(x + h * 0.2, y - h * 0.42); g.lineTo(x - h * 0.2, y - h * 0.42); g.fill(); }
        else { var fl0 = h * (0.25 + 0.12 * tw); g.fillStyle = main; g.beginPath(); g.moveTo(x - h * 0.08, y - h * 0.56); g.lineTo(x + h * 0.08, y - h * 0.56); g.lineTo(x + fl0, y); g.lineTo(x - fl0, y); g.fill(); g.fillStyle = top; g.fillRect(x - h * 0.075, y - h * 0.79, h * 0.15, h * 0.24); }
        g.fillStyle = skin; g.beginPath(); g.arc(x, y - h * 0.885, h * 0.078, 0, TAU); g.fill();
        if (up || dancing || tw > 0.3) { g.strokeStyle = skin; g.lineWidth = Math.max(0.6, h * 0.05); g.beginPath(); var ay = up ? 0.27 : 0.14 + 0.1 * sw; g.moveTo(x - h * 0.08, y - h * 0.76); g.lineTo(x - h * 0.18, y - h * (0.76 + ay)); g.moveTo(x + h * 0.08, y - h * 0.76); g.lineTo(x + h * 0.18, y - h * (0.76 + (up ? 0.27 : 0.14 - 0.1 * sw))); g.stroke(); }
        if (d.flash > 0.05) glow(x, y - h * 1.03, Math.max(0.8, h * 0.05), '#fff0d0', d.flash);
        g.globalAlpha = 1; return;
      }
      g.lineCap = 'round'; g.lineJoin = 'round';
      if (d.man) {
        // Churidar legs and mojari
        g.strokeStyle = tint(d.legs || '#efe6d6', dk); g.lineWidth = Math.max(1, h * 0.055);
        var lx = walking ? sw * h * 0.06 : sw * h * 0.03;
        if (d.sitting && groundY - (y - h * 0.44) < h * 0.1) {
          // Sitting cross-legged on the ground
          g.fillStyle = tint(d.legs || '#efe6d6', dk); g.beginPath(); g.ellipse(x, groundY - h * 0.03, h * 0.2, h * 0.05, 0, 0, TAU); g.fill();
        } else if (d.sitting) {
          g.beginPath(); g.moveTo(x - h * 0.05, y - h * 0.44); g.lineTo(x - h * 0.08, groundY - h * 0.01); g.moveTo(x + h * 0.05, y - h * 0.44); g.lineTo(x + h * 0.08, groundY - h * 0.01); g.stroke();
          g.fillStyle = tint('#3a1f12', dk); g.beginPath(); g.ellipse(x - h * 0.09, groundY, h * 0.04, h * 0.018, 0, 0, TAU); g.ellipse(x + h * 0.09, groundY, h * 0.04, h * 0.018, 0, 0, TAU); g.fill();
        } else {
        if (rich) { var legC0 = tint(d.legs || '#efe6d6', dk); [[-1, -lx], [1, lx]].forEach(function (lg) { var sd = lg[0], a = [x + sd * h * 0.045, y - h * 0.44], k0 = [x + sd * h * 0.052 + lg[1] * 0.5, y - h * 0.23], f0 = [x + sd * h * 0.06 + lg[1], y - h * 0.03]; seg(a, k0, h * 0.06, h * 0.048, roundLit(legC0, k0[0] - h * 0.03, k0[0] + h * 0.03)); seg(k0, f0, h * 0.048, h * 0.034, roundLit(legC0, f0[0] - h * 0.025, f0[0] + h * 0.025)); }); }
        else { g.beginPath(); g.moveTo(x - h * 0.045, y - h * 0.44); g.lineTo(x - h * 0.06 - lx, y - h * 0.02); g.moveTo(x + h * 0.045, y - h * 0.44); g.lineTo(x + h * 0.06 + lx, y - h * 0.02); g.stroke(); }
        g.fillStyle = tint('#3a1f12', dk); g.beginPath(); g.ellipse(x - h * 0.07 - lx, y, h * 0.04, h * 0.018, 0, 0, TAU); g.ellipse(x + h * 0.07 + lx, y, h * 0.04, h * 0.018, 0, 0, TAU); g.fill();
        }
        // Kediyu: fitted at the chest, flared frill below
        var fl = h * (0.2 + (dancing ? 0.04 * sw : 0));
        g.fillStyle = rich ? roundLit(main, x - fl, x + fl) : main; g.beginPath();
        g.moveTo(x - h * 0.08, y - h * 0.8); g.lineTo(x + h * 0.08, y - h * 0.8); g.lineTo(x + h * 0.085, y - h * 0.62);
        g.quadraticCurveTo(x + fl * 0.8, y - h * 0.52, x + fl, y - h * 0.42); g.quadraticCurveTo(x, y - h * 0.38, x - fl, y - h * 0.42);
        g.quadraticCurveTo(x - fl * 0.8, y - h * 0.52, x - h * 0.085, y - h * 0.62); g.closePath(); g.fill();
        if (rich) { g.strokeStyle = 'rgba(0,0,0,.2)'; g.lineWidth = Math.max(0.6, h * 0.005); for (var kp = -4; kp <= 4; kp++) { g.beginPath(); g.moveTo(x + kp * h * 0.018, y - h * 0.6); g.quadraticCurveTo(x + kp * fl * 0.16, y - h * 0.5, x + kp * fl * 0.23, y - h * 0.41); g.stroke(); } }
        if (fine) { g.fillStyle = gold; for (var em = -2; em <= 2; em++) { g.beginPath(); g.arc(x + em * h * 0.032, y - h * 0.7 + Math.abs(em) * h * 0.012, Math.max(0.6, h * 0.01), 0, TAU); g.fill(); } }
        if (fine) { g.strokeStyle = gold; g.lineWidth = Math.max(1, h * 0.02); g.beginPath(); g.moveTo(x - fl, y - h * 0.425); g.quadraticCurveTo(x, y - h * 0.385, x + fl, y - h * 0.425); g.stroke(); g.beginPath(); g.moveTo(x, y - h * 0.8); g.lineTo(x, y - h * 0.63); g.stroke(); }
      } else {
        // Chaniya with a bordered hem, then the choli and a strip of waist
        var flare = h * (0.25 + (dancing ? 0.045 * sw : walking ? 0.01 * sw : 0) + 0.16 * tw + (d.sitting ? 0.06 : 0)), hem = d.sitting ? groundY : y - h * 0.01 - h * 0.03 * tw;
        g.fillStyle = rich ? roundLit(main, x - flare, x + flare) : main; g.beginPath(); g.moveTo(x - h * 0.075, y - h * 0.55); g.lineTo(x + h * 0.075, y - h * 0.55);
        g.quadraticCurveTo(x + flare * 0.75, y - h * 0.22, x + flare, hem); g.quadraticCurveTo(x, hem + h * 0.05, x - flare, hem); g.quadraticCurveTo(x - flare * 0.75, y - h * 0.22, x - h * 0.075, y - h * 0.55); g.fill();
        g.strokeStyle = gold; g.lineWidth = Math.max(1, h * 0.035); g.beginPath(); g.moveTo(x - flare * 0.97, hem - h * 0.015); g.quadraticCurveTo(x, hem + h * 0.035, x + flare * 0.97, hem - h * 0.015); g.stroke();
        if (fine) {
          var ty = y - h * 0.3, tfl = h * 0.075 + (flare - h * 0.075) * 0.55;
          g.strokeStyle = tint(d.tier || d.top, dk); g.lineWidth = Math.max(1, h * 0.028); g.beginPath(); g.moveTo(x - tfl, ty); g.quadraticCurveTo(x, ty + h * 0.03, x + tfl, ty); g.stroke();
          if (dancing || walking) { g.fillStyle = tint('#7a1a14', dk); var fx = sw * h * 0.04; g.beginPath(); g.ellipse(x - h * 0.06 + fx, y + h * 0.01, h * 0.035, h * 0.014, 0, 0, TAU); g.ellipse(x + h * 0.06 - fx, y + h * 0.01, h * 0.035, h * 0.014, 0, 0, TAU); g.fill(); }
        }
        if (fine) {
          g.strokeStyle = 'rgba(0,0,0,.14)'; g.lineWidth = 1;
          for (var pl = rich ? -4 : -2; pl <= (rich ? 4 : 2); pl++) { g.beginPath(); g.moveTo(x + pl * h * (rich ? 0.012 : 0.02), y - h * 0.5); g.lineTo(x + pl * flare * (rich ? 0.2 : 0.33), hem); g.stroke(); }
          g.fillStyle = 'rgba(255,248,225,.8)'; for (var m = 0; m < 6; m++) { var mu = (m + 0.5) / 6 * 2 - 1; g.beginPath(); g.arc(x + mu * flare * 0.82, hem - h * 0.07 + Math.abs(mu) * h * 0.02, Math.max(0.7, h * 0.011), 0, TAU); g.fill(); }
        }
        g.fillStyle = skin; g.fillRect(x - h * 0.06, y - h * 0.6, h * 0.12, h * 0.06);
        g.fillStyle = rich ? roundLit(top, x - h * 0.08, x + h * 0.08) : top; g.beginPath(); g.moveTo(x - h * 0.08, y - h * 0.79); g.lineTo(x + h * 0.08, y - h * 0.79); g.lineTo(x + h * 0.07, y - h * 0.6); g.lineTo(x - h * 0.07, y - h * 0.6); g.closePath(); g.fill();
        if (rich) { g.strokeStyle = gold; g.lineWidth = Math.max(0.7, h * 0.007); g.beginPath(); g.moveTo(x - h * 0.05, y - h * 0.79); g.quadraticCurveTo(x, y - h * 0.74, x + h * 0.05, y - h * 0.79); g.moveTo(x - h * 0.07, y - h * 0.605); g.lineTo(x + h * 0.07, y - h * 0.605); g.stroke(); }
        // Odhni over one shoulder, falling behind
        g.strokeStyle = tint(d.odhni || d.top, dk); g.globalAlpha *= 0.85; g.lineWidth = Math.max(1, h * 0.04);
        g.beginPath(); g.moveTo(x - h * 0.08, y - h * 0.78); g.quadraticCurveTo(x + h * 0.02, y - h * 0.62, x + h * 0.09, y - h * 0.56); g.quadraticCurveTo(x + h * (0.16 + 0.04 * sw + 0.1 * tw), y - h * 0.48, x + h * (0.18 + 0.05 * sw + 0.14 * tw), y - h * 0.3); g.stroke();
        g.globalAlpha /= 0.85;
        if (fine) { g.fillStyle = 'rgba(255,248,225,.75)'; [0.25, 0.5, 0.75].forEach(function (u) { var ox = lerp(x - h * 0.08, x + h * 0.09, u), oy = lerp(y - h * 0.78, y - h * 0.56, u); g.beginPath(); g.arc(ox, oy, Math.max(0.6, h * 0.009), 0, TAU); g.fill(); }); }
      }
      // A mirror-work vest over the kediyu (the DJ wears one), and an older sitter's shawl round the shoulders
      if (d.vest && d.man && h > 30) {
        g.fillStyle = tint(d.vest, dk);
        [-1, 1].forEach(function (sd) { g.beginPath(); g.moveTo(x + sd * h * 0.012, y - h * 0.79); g.lineTo(x + sd * h * 0.085, y - h * 0.8); g.lineTo(x + sd * h * 0.095, y - h * 0.55); g.lineTo(x + sd * h * 0.03, y - h * 0.52); g.closePath(); g.fill(); });
        g.fillStyle = gold; for (var vm = 0; vm < 6; vm++) { var vy = y - h * (0.76 - (vm % 3) * 0.08), vx = x + (vm < 3 ? -1 : 1) * h * 0.055; g.beginPath(); g.arc(vx, vy, Math.max(0.7, h * 0.01), 0, TAU); g.fill(); }
        g.fillStyle = 'rgba(235,245,255,.9)'; for (var vm2 = 0; vm2 < 4; vm2++) { g.beginPath(); g.arc(x + (vm2 < 2 ? -1 : 1) * h * 0.06, y - h * (0.72 - (vm2 % 2) * 0.1), Math.max(0.6, h * 0.006), 0, TAU); g.fill(); }
      }
      if (d.sitting && d.older && h > 18) { g.strokeStyle = tint(d.shawl || '#8c6a4f', dk); g.lineWidth = Math.max(1.5, h * 0.06); g.beginPath(); g.moveTo(x - h * 0.1, y - h * 0.74); g.quadraticCurveTo(x, y - h * 0.7, x + h * 0.1, y - h * 0.74); g.stroke(); }
      // The couple's finery: her heavy gold hem and necklace, his gold stole and pagdi band
      if (d.coupleRole === 'w' && fine) {
        g.strokeStyle = gold; g.lineWidth = Math.max(1.2, h * 0.05); g.beginPath(); g.moveTo(x - flare * 0.95, hem - h * 0.05); g.quadraticCurveTo(x, hem - h * 0.01, x + flare * 0.95, hem - h * 0.05); g.stroke();
        g.strokeStyle = gold; g.lineWidth = Math.max(0.8, h * 0.012); g.beginPath(); g.moveTo(x - h * 0.08, y - h * 0.785); g.quadraticCurveTo(x + h * 0.02, y - h * 0.63, x + h * 0.09, y - h * 0.565); g.stroke();
      }
      // The singers dress up: her chaniya has a mirror-work border that catches the lights, bandhani dots and a heavy
      // gold hem; he wears a gold stole over the kediyu, and the tail of his safa falls behind
      if (d.role === 'singer' && h > 18) {
        if (!d.man) {
          g.strokeStyle = gold; g.lineWidth = Math.max(1.2, h * 0.045); g.beginPath(); g.moveTo(x - flare * 0.95, hem - h * 0.05); g.quadraticCurveTo(x, hem - h * 0.01, x + flare * 0.95, hem - h * 0.05); g.stroke();
          g.fillStyle = 'rgba(255,248,230,.55)';
          for (var br = 0; br < 3; br++) for (var bc = -3; bc <= 3; bc++) { var bu = bc / 3.6, by2 = lerp(y - h * 0.46, hem - h * 0.12, br / 2.2), bw2 = lerp(h * 0.08, flare * 0.85, (by2 - (y - h * 0.55)) / Math.max(1, hem - (y - h * 0.55))); g.beginPath(); g.arc(x + bu * bw2, by2, Math.max(0.5, h * 0.007), 0, TAU); g.fill(); }
          for (var mw = 0; mw < 9; mw++) { var mu2 = (mw + 0.5) / 9 * 2 - 1, gx2 = x + mu2 * flare * 0.9, gy2 = hem - h * 0.035 + Math.abs(mu2) * h * 0.02, tw2 = reduce ? 0.5 : 0.5 + 0.5 * Math.sin(T * 5 + mw * 1.7 + d.ph * 3); g.fillStyle = 'rgba(235,245,255,' + (0.45 + 0.5 * tw2) + ')'; g.beginPath(); g.arc(gx2, gy2, Math.max(0.7, h * 0.012), 0, TAU); g.fill(); if (tw2 > 0.93) glow(gx2, gy2, Math.max(1, h * 0.028), '#ffffff', (tw2 - 0.93) * 9); }
        } else {
          g.strokeStyle = gold; g.lineWidth = Math.max(1, h * 0.032); g.beginPath(); g.moveTo(x + h * 0.08, y - h * 0.8); g.quadraticCurveTo(x - h * 0.02, y - h * 0.62, x - h * 0.12, y - h * 0.44); g.stroke();
        }
      }
      if (d.coupleRole === 'm') { g.strokeStyle = tint(d.stole, dk); g.lineWidth = Math.max(1, h * 0.035); g.beginPath(); g.moveTo(x + h * 0.08, y - h * 0.8); g.quadraticCurveTo(x - h * 0.02, y - h * 0.62, x - h * 0.12, y - h * 0.44); g.stroke(); }
      // Neck and head
      g.fillStyle = skin; g.fillRect(x - h * 0.022, y - h * 0.83, h * 0.044, h * 0.05);
      if (rich) g.fillStyle = roundLit(skin, x - h * 0.068, x + h * 0.068);
      g.beginPath(); g.arc(x, y - h * 0.885, h * 0.068, 0, TAU); g.fill();
      if (rich && h >= 70) {
        // A face: brows, eyes (they blink), the shadow of the nose, and a smile that opens on a cheer
        var fy = y - h * 0.885, hr0 = h * 0.068, ink0 = tint('#1f130d', dk), blink0 = !reduce && ((T + d.ph * 7) % 4.7) < 0.12;
        g.strokeStyle = ink0; g.lineWidth = Math.max(0.7, h * 0.005);
        g.beginPath(); g.moveTo(x - hr0 * 0.55, fy - hr0 * 0.34); g.quadraticCurveTo(x - hr0 * 0.33, fy - hr0 * 0.46, x - hr0 * 0.12, fy - hr0 * 0.36); g.moveTo(x + hr0 * 0.12, fy - hr0 * 0.36); g.quadraticCurveTo(x + hr0 * 0.33, fy - hr0 * 0.46, x + hr0 * 0.55, fy - hr0 * 0.34); g.stroke();
        if (blink0) { g.beginPath(); g.moveTo(x - hr0 * 0.46, fy - hr0 * 0.05); g.lineTo(x - hr0 * 0.2, fy - hr0 * 0.05); g.moveTo(x + hr0 * 0.2, fy - hr0 * 0.05); g.lineTo(x + hr0 * 0.46, fy - hr0 * 0.05); g.stroke(); }
        else { g.fillStyle = ink0; g.beginPath(); g.arc(x - hr0 * 0.32, fy - hr0 * 0.05, Math.max(0.7, hr0 * 0.09), 0, TAU); g.arc(x + hr0 * 0.32, fy - hr0 * 0.05, Math.max(0.7, hr0 * 0.09), 0, TAU); g.fill(); }
        g.strokeStyle = shade(skin, -0.3); g.beginPath(); g.moveTo(x + hr0 * 0.05, fy + hr0 * 0.08); g.quadraticCurveTo(x + hr0 * 0.13, fy + hr0 * 0.3, x - hr0 * 0.04, fy + hr0 * 0.34); g.stroke();
        var open0 = up || d.cheer ? 1 : 0; g.strokeStyle = d.man ? shade(skin, -0.45) : tint('#a3303a', dk); g.lineWidth = Math.max(0.8, h * 0.006);
        if (open0) { g.fillStyle = '#5a1712'; g.beginPath(); g.ellipse(x, fy + hr0 * 0.56, hr0 * 0.18, hr0 * 0.12, 0, 0, TAU); g.fill(); }
        else { g.beginPath(); g.moveTo(x - hr0 * 0.22, fy + hr0 * 0.52); g.quadraticCurveTo(x, fy + hr0 * 0.64, x + hr0 * 0.22, fy + hr0 * 0.52); g.stroke(); }
        if (!d.man) { g.fillStyle = '#b3141f'; g.beginPath(); g.arc(x, fy - hr0 * 0.3, Math.max(0.5, h * 0.004), 0, TAU); g.fill(); }
      }
      if (d.coupleRole === 'w' && fine) { g.strokeStyle = gold; g.lineWidth = Math.max(0.8, h * 0.014); g.beginPath(); g.arc(x, y - h * 0.83, h * 0.05, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke(); }
      if (d.man) {
        if (fine && d.moustache) { g.strokeStyle = tint('#1f130d', dk); g.lineWidth = Math.max(0.8, h * 0.012); g.beginPath(); g.moveTo(x - h * 0.03, y - h * 0.862); g.quadraticCurveTo(x, y - h * 0.872, x + h * 0.03, y - h * 0.862); g.stroke(); }
        g.fillStyle = tint(d.older ? '#f3e6d0' : d.pagdi || '#b8312b', dk);
        g.beginPath(); g.ellipse(x, y - h * 0.935, h * 0.078, h * 0.052, 0, Math.PI, 0); g.lineTo(x + h * 0.078, y - h * 0.925); g.lineTo(x - h * 0.078, y - h * 0.925); g.fill();
        if (rich) { var pgc = tint(d.older ? '#f3e6d0' : d.pagdi || '#b8312b', dk); g.strokeStyle = shade(pgc, -0.3); g.lineWidth = Math.max(0.6, h * 0.005); for (var wf0 = 0; wf0 < 3; wf0++) { var wy0 = y - h * (0.93 + wf0 * 0.016); g.beginPath(); g.moveTo(x - h * 0.075, wy0 + h * 0.006); g.quadraticCurveTo(x, wy0 - h * 0.004, x + h * 0.075, wy0 - h * 0.01); g.stroke(); } g.fillStyle = pgc; }
        if (d.coupleRole === 'm') { g.strokeStyle = gold; g.lineWidth = Math.max(0.8, h * 0.012); g.beginPath(); g.moveTo(x - h * 0.078, y - h * 0.93); g.lineTo(x + h * 0.078, y - h * 0.93); g.stroke(); }
        if (d.role === 'dj') { g.beginPath(); g.ellipse(x + h * 0.012, y - h * 0.975, h * 0.055, h * 0.03, -0.25, 0, TAU); g.fill(); }
        if (fine) { g.beginPath(); g.moveTo(x + h * 0.06, y - h * 0.94); g.quadraticCurveTo(x + h * 0.13, y - h * 0.9, x + h * 0.1, y - h * 0.84); g.lineWidth = Math.max(1, h * 0.02); g.strokeStyle = g.fillStyle; g.stroke(); }
      } else {
        g.fillStyle = tint(d.older ? '#9a948c' : '#1f130d', dk); g.beginPath(); g.ellipse(x, y - h * 0.905, h * 0.074, h * 0.05, 0, Math.PI, 0); g.fill();
        g.beginPath(); g.arc(x, y - h * 0.965, h * 0.034, 0, TAU); g.fill();
        if (rich) { dotRow(alongQuad(x - h * 0.034, y - h * 0.96, x, y - h * 1.012, x + h * 0.034, y - h * 0.96, 7), Math.max(0.6, h * 0.005), '#fffaf0'); g.strokeStyle = 'rgba(255,255,255,.12)'; g.lineWidth = Math.max(0.5, h * 0.004); g.beginPath(); g.moveTo(x, y - h * 0.952); g.lineTo(x, y - h * 0.93); g.stroke(); }
        if (fine) { g.strokeStyle = gold; g.lineWidth = Math.max(0.6, h * 0.008); g.beginPath(); g.moveTo(x, y - h * 0.955); g.lineTo(x, y - h * 0.925); g.stroke(); g.fillStyle = gold; g.beginPath(); g.arc(x, y - h * 0.922, Math.max(0.7, h * 0.012), 0, TAU); g.fill(); g.fillStyle = '#c0392b'; g.beginPath(); g.arc(x, y - h * 0.9, Math.max(0.6, h * 0.008), 0, TAU); g.fill(); g.fillStyle = gold; g.beginPath(); g.arc(x - h * 0.066, y - h * 0.87, Math.max(0.6, h * 0.01), 0, TAU); g.arc(x + h * 0.066, y - h * 0.87, Math.max(0.6, h * 0.01), 0, TAU); g.fill(); }
      }
      // The singers' jewellery and his safa tail
      if (d.role === 'singer' && h > 18) {
        if (!d.man) { g.fillStyle = gold; [-1, 1].forEach(function (sd) { g.beginPath(); g.arc(x + sd * h * 0.066, y - h * 0.862, Math.max(0.7, h * 0.012), 0, TAU); g.fill(); g.beginPath(); g.arc(x + sd * h * 0.066, y - h * 0.84, Math.max(0.8, h * 0.016), 0, TAU); g.fill(); }); }
        else { var tail = reduce ? 0 : Math.sin(T * 2.2 + d.ph) * h * 0.012; g.strokeStyle = tint(d.pagdi || '#b8312b', dk); g.lineWidth = Math.max(1, h * 0.028); g.beginPath(); g.moveTo(x - h * 0.06, y - h * 0.93); g.quadraticCurveTo(x - h * 0.13 + tail, y - h * 0.86, x - h * 0.11 + tail, y - h * 0.74); g.stroke(); }
      }
      // Arms: shoulder, elbow, hand
      var shy = y - h * 0.76, L = [x - h * 0.08, shy], R = [x + h * 0.08, shy], arms = armsFor(d, x, shy, h, sw, walking, dancing, up, tw), le = arms[0], lh = arms[1], re = arms[2], rh = arms[3];
      if (rich) {
        // Shaped arms: his long sleeves, her short puffed ones with bare forearms, a hand at the end of each
        var slvC = d.man ? main : top;
        [[L, le, lh], [R, re, rh]].forEach(function (arm) {
          if (d.man) { seg(arm[0], arm[1], h * 0.048, h * 0.04, roundLit(slvC, arm[1][0] - h * 0.03, arm[1][0] + h * 0.03)); seg(arm[1], arm[2], h * 0.04, h * 0.034, roundLit(slvC, arm[2][0] - h * 0.025, arm[2][0] + h * 0.025)); }
          else { var pf0 = [lerp(arm[0][0], arm[1][0], 0.45), lerp(arm[0][1], arm[1][1], 0.45)]; seg(arm[0], arm[1], h * 0.038, h * 0.032, roundLit(skin, arm[1][0] - h * 0.025, arm[1][0] + h * 0.025)); seg(arm[1], arm[2], h * 0.032, h * 0.027, roundLit(skin, arm[2][0] - h * 0.02, arm[2][0] + h * 0.02)); seg(arm[0], pf0, h * 0.054, h * 0.05, roundLit(slvC, pf0[0] - h * 0.03, pf0[0] + h * 0.03)); }
          g.fillStyle = skin; g.beginPath(); g.arc(arm[2][0], arm[2][1], h * 0.02, 0, TAU); g.fill();
        });
      } else {
      g.strokeStyle = skin; g.lineWidth = lw;
      g.beginPath(); g.moveTo(L[0], L[1]); g.lineTo(le[0], le[1]); g.lineTo(lh[0], lh[1]); g.moveTo(R[0], R[1]); g.lineTo(re[0], re[1]); g.lineTo(rh[0], rh[1]); g.stroke();
      }
      if (fine && !d.man) { g.strokeStyle = gold; g.lineWidth = Math.max(1, h * 0.02); g.beginPath(); g.moveTo(lh[0], lh[1]); g.lineTo(lerp(le[0], lh[0], 0.8), lerp(le[1], lh[1], 0.8)); g.moveTo(rh[0], rh[1]); g.lineTo(lerp(re[0], rh[0], 0.8), lerp(re[1], rh[1], 0.8)); g.stroke(); }
      if (d.stander && d.phone) { g.fillStyle = '#111'; g.fillRect(rh[0] - h * 0.03, rh[1] - h * 0.07, h * 0.06, h * 0.1); g.fillStyle = 'rgba(200,225,255,.9)'; g.fillRect(rh[0] - h * 0.022, rh[1] - h * 0.06, h * 0.044, h * 0.08); if (st.on) glow(rh[0], rh[1] - h * 0.02, Math.max(0.8, h * 0.03), '#eaf3ff', 0.5); }
      if (d.photo && !walking) { g.fillStyle = '#151515'; g.fillRect(x - h * 0.07, shy - h * 0.16, h * 0.14, h * 0.08); if (d.snap > 0) glow(x, shy - h * 0.12, Math.max(1.5, h * 0.06 * (1 + d.snap)), '#ffffff', d.snap); }
      if (d.role === 'dj' && h > 50) {
        // Up close the DJ has a face: eyes, brows, and a grin that opens when he talks
        var fy = y - h * 0.885, ink = '#1f130d';
        g.fillStyle = ink; g.beginPath(); g.arc(x - h * 0.024, fy - h * 0.006, Math.max(1, h * 0.0085), 0, TAU); g.arc(x + h * 0.024, fy - h * 0.006, Math.max(1, h * 0.0085), 0, TAU); g.fill();
        g.strokeStyle = ink; g.lineWidth = Math.max(1, h * 0.006); g.beginPath(); g.moveTo(x - h * 0.038, fy - h * 0.024); g.lineTo(x - h * 0.012, fy - h * 0.028); g.moveTo(x + h * 0.012, fy - h * 0.028); g.lineTo(x + h * 0.038, fy - h * 0.024); g.stroke();
        // A smile under the moustache, opening into a grin as he talks
        var talkOpen = d.talking && !reduce ? Math.abs(Math.sin(T * 14)) : 0, my0 = fy + h * 0.034;
        if (talkOpen > 0.05) { g.fillStyle = '#7a2418'; g.beginPath(); g.moveTo(x - h * 0.022, my0); g.quadraticCurveTo(x, my0 + h * (0.012 + 0.02 * talkOpen), x + h * 0.022, my0); g.closePath(); g.fill(); g.fillStyle = '#fff8ec'; g.fillRect(x - h * 0.014, my0, h * 0.028, h * 0.004); }
        else { g.strokeStyle = '#7a2418'; g.lineWidth = Math.max(1, h * 0.006); g.lineCap = 'round'; g.beginPath(); g.moveTo(x - h * 0.02, my0 - h * 0.002); g.quadraticCurveTo(x, my0 + h * 0.014, x + h * 0.02, my0 - h * 0.002); g.stroke(); g.lineCap = 'butt'; }
        g.strokeStyle = '#e8b04b'; g.lineWidth = Math.max(1, h * 0.008); g.beginPath(); g.arc(x, y - h * 0.8, h * 0.05, 0.2 * Math.PI, 0.8 * Math.PI); g.stroke();
      }
      if (d.holding === 'tea' && d.cupAt && h > 14) { var tc = d.cupAt; g.fillStyle = '#f4efe4'; g.fillRect(tc[0] - h * 0.018, tc[1] - h * 0.045, h * 0.036, h * 0.045); g.fillStyle = '#b07a4a'; g.fillRect(tc[0] - h * 0.015, tc[1] - h * 0.043, h * 0.03, h * 0.008); if (!reduce && h > 30) { g.strokeStyle = 'rgba(255,255,255,.18)'; g.lineWidth = 1; g.beginPath(); g.moveTo(tc[0], tc[1] - h * 0.05); g.quadraticCurveTo(tc[0] + h * 0.02 * Math.sin(T * 2), tc[1] - h * 0.08, tc[0], tc[1] - h * 0.11); g.stroke(); } }
      if (d.holding === 'phone' && h > 14) { g.fillStyle = '#111'; g.fillRect(x - h * 0.025, shy + h * 0.06, h * 0.05, h * 0.075); g.fillStyle = 'rgba(200,225,255,.9)'; g.fillRect(x - h * 0.02, shy + h * 0.065, h * 0.04, h * 0.065); glow(x, shy + h * 0.1, Math.max(1, h * 0.06), '#cfe0ff', 0.35); }
      if (d.role === 'dj' && d.cupAt) {
        // Headphones round the neck, and the paper cup of chhas
        g.strokeStyle = '#111'; g.lineWidth = Math.max(1, h * 0.02);
        var cupL = d.cueAt ? [d.cueAt[0] + h * 0.012, d.cueAt[1] - h * 0.01] : [x - h * 0.07, y - h * 0.79];
        g.beginPath(); if (d.cueAt) { g.moveTo(cupL[0], cupL[1]); g.quadraticCurveTo(x - h * 0.02, y - h * 0.74, x + h * 0.07, y - h * 0.79); } else g.arc(x, y - h * 0.8, h * 0.07, 0.1 * Math.PI, 0.9 * Math.PI); g.stroke();
        g.fillStyle = '#1a1a1a'; g.beginPath(); g.arc(cupL[0], cupL[1], h * 0.03, 0, TAU); g.arc(x + h * 0.07, y - h * 0.79, h * 0.03, 0, TAU); g.fill();
        if (h > 60) { g.fillStyle = 'rgb(' + TH.beams[0] + ')'; g.beginPath(); g.arc(cupL[0], cupL[1], h * 0.011, 0, TAU); g.arc(x + h * 0.07, y - h * 0.79, h * 0.011, 0, TAU); g.fill(); }
        var cx0 = d.cupAt[0], cy0 = d.cupAt[1], cw0 = h * 0.03, ch0 = h * 0.075;
        g.fillStyle = 'rgba(248,246,238,.95)'; g.beginPath(); g.moveTo(cx0 - cw0 * 0.75, cy0 + ch0 * 0.35); g.lineTo(cx0 + cw0 * 0.75, cy0 + ch0 * 0.35); g.lineTo(cx0 + cw0, cy0 - ch0 * 0.65); g.lineTo(cx0 - cw0, cy0 - ch0 * 0.65); g.closePath(); g.fill();
        g.strokeStyle = 'rgba(0,0,0,.2)'; g.lineWidth = Math.max(0.6, h * 0.006); g.stroke();
        g.fillStyle = '#fbfaf3'; g.beginPath(); g.ellipse(cx0, cy0 - ch0 * 0.65, cw0, cw0 * 0.3, 0, 0, TAU); g.fill();
      }
      if (d.role === 'singer') { g.strokeStyle = tint('#222222', dk); g.lineWidth = Math.max(1, h * 0.025); g.beginPath(); g.moveTo(lh[0], lh[1]); g.lineTo(lh[0] + h * 0.02, lh[1] + h * 0.08); g.stroke(); }
      if (st.style === 'dandiya' && !d.walker && !d.role) {
        // On the beat the two sticks cross and strike; between beats they are held out, swinging with the step
        var len = h * 0.3, la, ra;
        if (up && d.strikeDir && !d.walker) { var toward = d.strikeDir > 0 ? -0.5 : -Math.PI + 0.5; la = toward - 0.18; ra = toward + 0.18; }
        else if (up) { la = -Math.PI / 2 + 0.55; ra = -Math.PI / 2 - 0.55; }
        else { la = -Math.PI / 2 - 0.35 - 0.25 * sw; ra = -Math.PI / 2 + 0.35 - 0.25 * sw; }
        dandiya(lh[0], lh[1], la, len, d.stick || 0, dk, fine);
        dandiya(rh[0], rh[1], ra, len, d.stick || 0, dk, fine);
        if (up && d.flash > 0.4) glow(x + (d.strikeDir || 0) * h * 0.28, lh[1] - len * (d.strikeDir ? 0.35 : 0.62), Math.max(1, h * 0.035), '#fff3c4', d.flash);
      }
      if (d.flash > 0.05) glow(x, shy - h * 0.27, Math.max(1, h * 0.03 * (1 + d.flash)), '#fff0d0', d.flash);
      g.globalAlpha = 1;
      if (isYou) {
        g.fillStyle = 'rgba(214,176,111,' + (0.25 + youGlow * 0.5) + ')'; g.beginPath(); g.ellipse(x, p.y, h * (0.32 + youGlow * 0.12), h * 0.09, 0, 0, TAU); g.fill();
        youLabel = { x: x, y: y - h * (d.man ? 0.985 : 1.0), h: h, man: d.coupleRole === 'm', hx: x, hy: y - h * 0.97 };
      }
    }
    function fogBand(f) {
      var s0 = F / f.z, yG = HOR + cam.y * s0, yT = Math.max(0, HOR + (cam.y - 11) * s0), yB = Math.min(H, yG + (yG - HOR) * 0.25 + 6);
      if (yG < 0 || yT >= H) return;
      var col = st.venue === 'stadium' ? '26,19,28' : st.venue === 'sheri' ? '22,17,32' : '20,15,30';
      var gr = g.createLinearGradient(0, yT, 0, yB);
      gr.addColorStop(0, 'rgba(' + col + ',0)'); gr.addColorStop(Math.max(0.01, Math.min(0.98, (HOR - yT) / Math.max(1, yB - yT))), 'rgba(' + col + ',' + f.a + ')');
      gr.addColorStop(Math.max(0.02, Math.min(0.99, (yG - yT) / Math.max(1, yB - yT))), 'rgba(' + col + ',' + f.a * 0.85 + ')'); gr.addColorStop(1, 'rgba(' + col + ',0)');
      g.fillStyle = gr;
      if (st.venue === 'sheri') { var l = P(-7.2, 0, cam.z + f.z), r = P(7.2, 0, cam.z + f.z); if (l && r) g.fillRect(l.x, yT, r.x - l.x, yB - yT); }
      else g.fillRect(0, yT, W, yB - yT);
    }
    // A soft warm follow-spot on you and your partner
    function followSpot(p, d) {
      var h = d.h * p.s, cy = p.y - h * 0.5, r = h * 0.9;
      var sg = g.createRadialGradient(p.x, cy, h * 0.05, p.x, cy, r); sg.addColorStop(0, 'rgba(255,214,150,' + (0.3 + 0.2 * youGlow) + ')'); sg.addColorStop(1, 'rgba(255,214,150,0)');
      g.fillStyle = sg; g.beginPath(); g.arc(p.x, cy, r, 0, TAU); g.fill();
    }
    // You over you, and yours over your partner, on a small leaf-shaped tag
    // A canvas font can't use CSS variables: a font string with var() is ignored and the last font stays in use
    var GU_FONT = 'system-ui, -apple-system, "Segoe UI", "Noto Sans Gujarati", "Gujarati Sangam MN", Shruti, "Anek Gujarati", FreeSerif, sans-serif';
    function coupleWord(you, man) { return you ? 'you' : 'yours'; }
    function tagSize(h, compact) { var fs = compact ? Math.max(10, Math.min(13, h * 0.08)) : Math.max(12, Math.min(17, h * 0.15)); return { fs: fs, hh: fs * 1.55, tip: fs * 0.55 }; }
    function tag(x, y, h, you, man, T0, compact, lead) {
      var text = coupleWord(you, man), z = tagSize(h, compact), fs = z.fs;
      g.font = '700 ' + fs + 'px ' + GU_FONT; g.textAlign = 'center';
      var w = Math.max(fs * 1.9, g.measureText(text).width + fs * 1.1), hh = z.hh, bob = reduce ? 0 : Math.sin(T0 * 2.2 + (you ? 0 : 1.3)) * 1.5, top = y - hh - z.tip - 3 + bob;
      x = Math.max(w / 2 + 4, Math.min(W - w / 2 - 4, x));
      if (lead) { g.strokeStyle = you ? 'rgba(232,176,75,.8)' : 'rgba(243,230,208,.6)'; g.lineWidth = 1; g.beginPath(); g.moveTo(x, top + hh + z.tip); g.lineTo(lead.x, lead.y); g.stroke(); }
      if (you) glow(x, top + hh * 0.5, hh * 0.5, 'rgba(255,210,130,1)', 0.2 + youGlow * 0.35);
      g.beginPath(); g.moveTo(x - w / 2, top + hh * 0.35); g.quadraticCurveTo(x - w / 2, top, x - w / 2 + hh * 0.35, top); g.lineTo(x + w / 2 - hh * 0.35, top); g.quadraticCurveTo(x + w / 2, top, x + w / 2, top + hh * 0.35);
      g.lineTo(x + w / 2, top + hh * 0.7); g.quadraticCurveTo(x + w / 2, top + hh, x + w / 2 - hh * 0.3, top + hh); g.lineTo(x + fs * 0.35, top + hh); g.lineTo(x, top + hh + fs * 0.55); g.lineTo(x - fs * 0.35, top + hh); g.lineTo(x - w / 2 + hh * 0.3, top + hh); g.quadraticCurveTo(x - w / 2, top + hh, x - w / 2, top + hh * 0.7); g.closePath();
      g.fillStyle = you ? '#e8b04b' : 'rgba(243,230,208,.94)'; g.fill();
      g.strokeStyle = you ? '#fff1c2' : 'rgba(142,27,44,.5)'; g.lineWidth = 1; g.stroke();
      g.fillStyle = you ? '#2a1208' : '#6b1420'; g.fillText(text, x, top + hh * 0.7);
    }
    // Pictograms over the two of you, like the signs on a door: a woman in a dress and a man. Yours glows gold.
    function marker(x, y, h, you, T0, man) {
      var r = Math.max(8, Math.min(13, h * 0.11)) * (you ? 1 : 0.85), bob = reduce ? 0 : Math.sin(T0 * 2.4 + (you ? 0 : 1.2)) * r * 0.25, cy = y - r * 2.4 + bob;
      var col = you ? '#f3c766' : 'rgba(243,230,208,.9)';
      if (you) glow(x, cy + r * 0.1, r * 0.8, 'rgba(255,210,130,1)', 0.18 + youGlow * 0.3);
      // A small round badge so the sign reads against the lit crowd
      g.fillStyle = 'rgba(11,6,5,.72)'; g.beginPath(); g.arc(x, cy + r * 0.12, r * 1.55, 0, TAU); g.fill();
      g.strokeStyle = you ? '#e8b04b' : 'rgba(243,230,208,.35)'; g.lineWidth = you ? 1.6 : 1; g.stroke();
      g.fillStyle = 'rgba(11,6,5,.72)'; g.beginPath(); g.moveTo(x - r * 0.35, cy + r * 1.55); g.lineTo(x + r * 0.35, cy + r * 1.55); g.lineTo(x, cy + r * 2.05); g.closePath(); g.fill();
      r *= 0.72; cy += r * 0.2;
      g.fillStyle = col;
      g.beginPath(); g.arc(x, cy - r * 0.95, r * 0.36, 0, TAU); g.fill();
      if (man) {
        roundRect(x - r * 0.42, cy - r * 0.5, r * 0.84, r * 1.05, r * 0.2); g.fill();
        g.fillRect(x - r * 0.36, cy + r * 0.45, r * 0.3, r * 0.95); g.fillRect(x + r * 0.06, cy + r * 0.45, r * 0.3, r * 0.95);
      } else {
        g.beginPath(); g.moveTo(x - r * 0.24, cy - r * 0.52); g.lineTo(x + r * 0.24, cy - r * 0.52); g.lineTo(x + r * 0.62, cy + r * 0.72); g.lineTo(x - r * 0.62, cy + r * 0.72); g.closePath(); g.fill();
        g.fillRect(x - r * 0.3, cy + r * 0.7, r * 0.22, r * 0.72); g.fillRect(x + r * 0.08, cy + r * 0.7, r * 0.22, r * 0.72);
      }
    }
    function partnerMark(p, d) {
      var h = d.h * p.s;
      g.fillStyle = 'rgba(214,176,111,.22)'; g.beginPath(); g.ellipse(p.x, p.y, h * 0.3, h * 0.08, 0, 0, TAU); g.fill();
      var by = p.y - (st.on && !reduce ? Math.abs(Math.sin(BEAT * Math.PI + d.ph)) * 0.05 * p.s : 0);
      partnerLabel = { x: p.x, y: by - h * (d.man ? 0.985 : 1.0), h: h, man: d.coupleRole === 'm', hx: p.x, hy: by - h * 0.97 };
    }
    function label(text, x, y, h, soft) {
      var fs = Math.max(soft ? 10 : 11, Math.min(soft ? 12.5 : 14, h * 0.2));
      g.font = '700 ' + fs + 'px system-ui, -apple-system, sans-serif'; g.textAlign = 'center';
      var w = g.measureText(text).width + 12;
      g.fillStyle = 'rgba(11,6,5,.72)'; roundRect(x - w / 2, y - fs - 4, w, fs + 8, (fs + 8) / 2); g.fill();
      g.fillStyle = soft ? '#e8c98f' : '#f3e6d0'; g.fillText(text, x, y + 0.5);
    }
    function roundRect(x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }

    /* ---------- where you sit when watching from far away ---------- */
    function seat(k) {
      if (k < 0.02) return;
      g.save(); g.translate(BX, BY); g.globalAlpha = Math.min(1, k * 1.4);
      var W = BW, H = BH, yb = H, u = Math.min(1.45, W / 380), v = st.venue, x0 = W * 0.5;
      if (v === 'stadium') {
        for (var r = 0; r < 2; r++) {
          var yy = yb - H * 0.05 - r * H * 0.075;
          g.fillStyle = r ? '#1b1624' : '#231c2e'; g.fillRect(0, yy - H * 0.02, W, H * 0.08);
          for (var sx = (r ? 14 : 0) * u; sx < W; sx += 30 * u) { g.fillStyle = r ? '#3a2b4a' : '#4a3459'; roundRect(sx + 3 * u, yy - H * 0.05, 24 * u, H * 0.035, 5 * u); g.fill(); }
        }
        g.strokeStyle = 'rgba(214,176,111,.35)'; g.lineWidth = 2 * u; g.beginPath(); g.moveTo(0, yb - H * 0.19); g.lineTo(W, yb - H * 0.19); g.stroke();
        for (var q = 0; q < 7; q++) if (q !== 3) spectator(W * (0.08 + q * 0.14), yb - H * 0.13 - (q % 2) * H * 0.075, u, q);
        seated(x0, yb - H * 0.13, u);
      } else if (v === 'outdoors') {
        g.fillStyle = 'rgba(12,8,6,.8)'; g.fillRect(0, yb - H * 0.07, W, H * 0.07);
        // A row of plastic chairs as wide as the screen, most taken, with you on one near the middle
        var nC = Math.max(6, Math.round(W / (62 * u))), mine = Math.floor(nC / 2) - (nC % 2 ? 0 : 1);
        for (var c = 0; c < nC; c++) { var cx = W * (c + 0.5) / nC; g.fillStyle = ['#b73a2e', '#2f6fa8', '#d9d2c5'][c % 3]; roundRect(cx - 17 * u, yb - H * 0.11, 34 * u, 7 * u, 3 * u); g.fill(); g.fillRect(cx - 15 * u, yb - H * 0.11 - 26 * u, 30 * u, 5 * u); g.fillRect(cx - 14 * u, yb - H * 0.11, 3 * u, H * 0.06); g.fillRect(cx + 11 * u, yb - H * 0.11, 3 * u, H * 0.06); }
        for (var sc2 = 0; sc2 < nC; sc2++) if (sc2 !== mine && (sc2 * 7) % 5 !== 2) spectator(W * (sc2 + 0.5) / nC, yb - H * 0.11, u, sc2);
        seated(W * (mine + 0.5) / nC, yb - H * 0.11, u);
      } else {
        g.fillStyle = '#2a2330'; g.fillRect(0, yb - H * 0.1, W * 0.78, H * 0.1);
        g.fillStyle = '#3a3140'; g.fillRect(0, yb - H * 0.1, W * 0.78, 5 * u);
        g.fillStyle = '#1b1420'; g.fillRect(0, 0, W * 0.07, yb);
        for (var tt = 0; tt < 5; tt++) { g.fillStyle = ['#f08a24', '#2f8f5b', '#c2185b', '#ffc861', '#3b4cc0'][tt]; g.beginPath(); g.moveTo(W * 0.07, H * 0.1 + tt * 16 * u); g.lineTo(W * 0.07 + 10 * u, H * 0.1 + tt * 16 * u + 7 * u); g.lineTo(W * 0.07, H * 0.1 + tt * 16 * u + 14 * u); g.fill(); }
        glow(W * 0.66, yb - H * 0.1 - 3 * u, 2.5 * u, '#ffcf7a', 0.9 + (reduce ? 0 : 0.1 * Math.sin(clock() * 9)));
        spectator(W * 0.2, yb - H * 0.1, u, 5);
        seated(W * 0.42, yb - H * 0.1, u);
      }
      g.globalAlpha = 1; g.restore();
    }
    function spectator(x, y, u, i) {
      g.fillStyle = ['#2a1f2e', '#33242a', '#1f2a33'][i % 3];
      g.beginPath(); g.moveTo(x - 11 * u, y); g.quadraticCurveTo(x - 12 * u, y - 24 * u, x, y - 26 * u); g.quadraticCurveTo(x + 12 * u, y - 24 * u, x + 11 * u, y); g.closePath(); g.fill();
      g.beginPath(); g.arc(x, y - 33 * u, 7.5 * u, 0, TAU); g.fill();
    }
    function seated(x, y, u) {
      // Your partner sits beside you
      var px = x + 28 * u;
      g.fillStyle = '#d6a24a';
      g.beginPath(); g.moveTo(px - 10 * u, y); g.quadraticCurveTo(px - 11 * u, y - 22 * u, px, y - 24 * u); g.quadraticCurveTo(px + 11 * u, y - 22 * u, px + 10 * u, y); g.closePath(); g.fill();
      g.beginPath(); g.arc(px, y - 30.5 * u, 7 * u, 0, TAU); g.fill();

      g.fillStyle = 'rgba(214,176,111,' + (0.22 + youGlow * 0.5) + ')'; g.beginPath(); g.ellipse(x, y - 18 * u, 24 * u * (1 + youGlow * 0.2), 30 * u * (1 + youGlow * 0.2), 0, 0, TAU); g.fill();
      g.fillStyle = '#f3e6d0';
      g.beginPath(); g.moveTo(x - 11 * u, y); g.quadraticCurveTo(x - 12 * u, y - 24 * u, x, y - 26 * u); g.quadraticCurveTo(x + 12 * u, y - 24 * u, x + 11 * u, y); g.closePath(); g.fill();
      g.beginPath(); g.arc(x, y - 33 * u, 7.5 * u, 0, TAU); g.fill();
      var youMan = st.youAs === 'man'; marker(x, y - 44 * u, 70 * u, true, clock(), youMan); marker(x + 28 * u, y - 40 * u, 64 * u, false, clock(), !youMan);
    }

    /* ---------- echoes: where they come from in each venue ---------- */
    function reflectors(listener) {
      var v = venues[st.venue], out = [], taps, i;
      if (!v || !v.ir) return out;
      if (st.venue === 'outdoors') {
        taps = v.ir.taps.filter(function (tp) { return tp[0] > 0.05; });
        if (taps[0]) { out.push({ x: -14, y: 3, z: 45, d: taps[0][0], l: taps[0][1] * 2.4 }); out.push({ x: 14, y: 3, z: 45, d: taps[0][0] + 0.005, l: taps[0][1] * 2.4 }); }
        if (taps[1]) out.push({ x: 0, y: 5, z: 47, d: taps[1][0], l: taps[1][1] * 2.4 });
        for (i = 2; i < taps.length; i++) out.push({ x: (i % 2 ? -1 : 1) * 30, y: 3, z: 80 + i * 8, d: taps[i][0], l: taps[i][1] * 2.4 });
      } else if (st.venue === 'stadium') {
        taps = v.ir.taps;
        if (taps[0]) { out.push({ x: 0, y: 5, z: 46, d: taps[0][0], l: taps[0][1] * 1.8 }); out.push({ x: -27, y: 5, z: listener.z, d: taps[0][0] * 0.7, l: taps[0][1] * 1.5 }); out.push({ x: 27, y: 5, z: listener.z, d: taps[0][0] * 0.72, l: taps[0][1] * 1.5 }); }
        if (taps[1]) { out.push({ x: -20, y: 6, z: 46, d: taps[1][0], l: taps[1][1] * 1.8 }); out.push({ x: 20, y: 6, z: 46, d: taps[1][0] + 0.01, l: taps[1][1] * 1.8 }); }
      } else if (v.ir.flutter) {
        var fl = v.ir.flutter;
        for (i = 0; i < 6; i++) out.push({ x: i % 2 ? 8 : -8, y: 3, z: listener.z + 1.5, d: fl.period * (i + 1), l: fl.first * Math.pow(fl.decay, i) * 2 });
      }
      return out;
    }

    /* ---------- beats and waves ---------- */
    var V = 80; // how fast the waves cross the ground on screen, in metres per second (slowed so you can watch them)
    function listenerPos(L, T) {
      if (st.listener === 'far') return { x: cam.x, z: cam.z + 3 };
      var d0 = L.circles[0].dancers[st.youAs === 'man' ? 1 : 0];
      if (d0.x != null) return { x: d0.x, z: d0.z };
      var c = L.circles[0], w = dancerWorld(c, d0, T, circleCentre(c, T));
      return { x: w.x, z: w.z };
    }
    // When the music stops the dancers drift off to rest: to the sides, the stalls and the water, or to sit on an
    // otla. When it starts they walk back, one by one, and the circles form again.
    function restSpot(id, L, d) {
      if (d.coupleRole) { var cs = d.coupleRole === 'w' ? -0.35 : 0.35; return id === 'sheri' ? { x: -2.6 + cs, z: -2.2 } : { x: -3.4 + cs, z: -3.8 }; }
      var r = rnd(), side = rnd() < 0.5 ? -1 : 1;
      if (id === 'sheri') {
        if (r < 0.6) return { x: side * 6.85, z: lerp(-4, 56, rnd()), y: 0.45, sit: true };
        return { x: side * lerp(5, 6.3, rnd()), z: lerp(-2, 58, rnd()) };
      }
      if (L.stalls.length && r < 0.3) { var sl = L.stalls[Math.floor(rnd() * L.stalls.length)]; return { x: sl.front.x + (rnd() - 0.5) * 2.4, z: sl.front.z + (rnd() - 0.5) * 2.4 }; }
      if (id === 'stadium') return { x: side * lerp(19.5, 23.5, rnd()), z: lerp(-4, 32, rnd()), sit: rnd() < 0.35 };
      if (r < 0.45) return { x: side * lerp(16, 23, rnd()), z: lerp(0, 36, rnd()), sit: rnd() < 0.3 };
      return { x: lerp(-18, 18, rnd()), z: lerp(33, 41, rnd()), sit: rnd() < 0.25 };
    }
    // Walking about on a laptop: the arrow keys (or WASD) take the two of you out of the circle with the view following,
    // walking up to a stall brings the seller's call, and Escape walks you back to your place in the circle
    var WALK_BOUNDS = { outdoors: [-25.5, 25.5, -8, 40], stadium: [-21, 21, -8, 33], sheri: [-5.4, 5.4, -10, 60] };
    var STALL_CALLS = { Chai: 'Cutting chai?', Dabeli: 'Garam dabeli!', 'Pani puri': 'Pani puri, teekha?', Water: 'Thandu paani!', 'Ice cream': 'Kulfi, kesar pista!', Snacks: 'Fafda jalebi!' };
    var walkMe = { on: false, x: 0, z: 0, x0: 0, z0: 0, keys: {}, ox: 0, oz: 0, used: false, shownAt: 0 };
    var canWalk = !!(window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches);
    function walkStep(dt) {
      var free = st.listener === 'circle' && !st.dj;
      if (!free && walkMe.on) walkMe.on = false;
      var k = walkMe.keys, vx = (k.right ? 1 : 0) - (k.left ? 1 : 0), vz = (k.up ? 1 : 0) - (k.down ? 1 : 0);
      if ((vx || vz) && free) {
        if (!walkMe.on) { var me = listenerPos(layout(st.venue), T); walkMe.on = true; walkMe.used = true; walkMe.x = walkMe.x0 = me.x; walkMe.z = walkMe.z0 = me.z; }
        var l = Math.hypot(vx, vz), b = WALK_BOUNDS[st.venue] || WALK_BOUNDS.outdoors;
        walkMe.x = Math.max(b[0], Math.min(b[1], walkMe.x + vx / l * 2.6 * dt)); walkMe.z = Math.max(b[2], Math.min(b[3], walkMe.z + vz / l * 2.6 * dt));
      }
      // The view follows you, easing, and eases back when you return
      var e = Math.min(1, dt * 3);
      walkMe.ox += ((walkMe.on ? walkMe.x - walkMe.x0 : 0) - walkMe.ox) * e; walkMe.oz += ((walkMe.on ? walkMe.z - walkMe.z0 : 0) - walkMe.oz) * e;
    }
    // The stall you've walked up to, if any
    function stallNear(L) {
      if (!walkMe.on) return null;
      var best = null, bd = 2.8;
      L.stalls.forEach(function (sl) { var d = Math.hypot(sl.front.x - walkMe.x, sl.front.z - walkMe.z); if (d < bd) { bd = d; best = sl; } });
      return best;
    }
    // The seller's call over the stall you've walked up to, and on a laptop a quiet hint that you can walk
    function walkOverlay(L, t) {
      var sl = stallNear(L);
      if (sl) {
        var sp = P(sl.x, 3.35, sl.z);
        if (sp && sp.z > 1) {
          var txt = sl.sign + ' · ' + (STALL_CALLS[sl.en] || sl.en), fs = Math.max(13, Math.min(22, sp.s * 0.2));
          g.save(); g.font = '700 ' + fs + 'px ' + GU_FONT; g.textAlign = 'center'; g.textBaseline = 'middle';
          var tw = g.measureText(txt).width, bw = tw + fs * 1.6, bh = fs * 2, bx = Math.max(8, Math.min(W - bw - 8, sp.x - bw / 2)), by = Math.max(8, sp.y - bh - fs * 0.6);
          g.shadowColor = 'rgba(0,0,0,.4)'; g.shadowBlur = 12; g.shadowOffsetY = 3; g.fillStyle = '#fff8ec'; roundRect(bx, by, bw, bh, bh / 2); g.fill();
          g.shadowBlur = 0; g.shadowOffsetY = 0; g.strokeStyle = sl.col; g.lineWidth = Math.max(1.5, fs * 0.1); roundRect(bx + 1.5, by + 1.5, bw - 3, bh - 3, bh / 2 - 1.5); g.stroke();
          g.fillStyle = '#3a1f14'; g.fillText(txt, bx + bw / 2, by + bh * 0.54); g.restore();
          if (sl.vendor) sl.vendor.flash = Math.max(sl.vendor.flash || 0, 0.6);
        }
      }
      if (canWalk && !walkMe.used && st.listener === 'circle' && !st.dj && !reduce) {
        if (!walkMe.shownAt) walkMe.shownAt = t;
        var age = t - walkMe.shownAt;
        if (age > 1.5 && age < 11) {
          var me = listenerPos(L, T), mp = P(me.x, 0, me.z);
          if (mp && mp.z > 1) {
            var a0 = Math.min(1, (age - 1.5) / 0.6, (11 - age) / 0.8), hf = 13;
            g.save(); g.globalAlpha = a0 * 0.92; g.font = '600 ' + hf + 'px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
            var ht = 'Use the arrow keys to walk around', hw0 = g.measureText(ht).width + 26;
            g.fillStyle = 'rgba(11,6,5,.62)'; roundRect(mp.x - hw0 / 2, mp.y + 14, hw0, 28, 14); g.fill();
            g.fillStyle = '#f6e7c8'; g.fillText(ht, mp.x, mp.y + 28); g.restore();
          }
        }
      }
    }
    function travel(d, slot, dt) {
      var L0 = layout(st.venue), goHome = st.on || (walkMe.on && !!d.coupleRole);
      if (!d.rest) d.rest = restSpot(st.venue, L0, d);
      if (d.x == null || reduce) { var start = goHome ? slot : d.rest; d.x = start.x; d.z = start.z; d.wantHome = goHome; d.wait = 0; }
      if (d.wantHome !== goHome) { d.wantHome = goHome; d.wait = d.delay; d.around = 0; }
      var target = goHome ? slot : d.rest, dx = target.x - d.x, dz = target.z - d.z, dist = Math.hypot(dx, dz);
      if (walkMe.on && d.coupleRole) d.wait = 0;
      if (d.wait > 0) d.wait -= dt;
      else if (dist > 0.2) {
        var step = Math.min(dist, d.speed * dt * (goHome && dist < 2 ? 0.6 + dist * 0.2 : 1)), mx = dx / dist, mz = dz / dist, rc = Math.hypot(d.x, d.z);
        // Walk round the centre rather than across it
        var rd = roundCentre(d, mx, mz, dx, dz); mx = rd[0]; mz = rd[1];
        d.x += mx * step; d.z += mz * step; clearOfCentre(d); d.step = (d.step || 0) + step * 5.5;
      }
      if (goHome && dist < 0.35) { d.x = slot.x; d.z = slot.z; }
      d.walking = dist > 0.35 && d.wait <= 0 && !reduce;
      d.atHome = goHome && dist < 0.35;
      d.sitting = !goHome && !d.walking && !!d.rest.sit && dist < 0.35;
      return { x: d.x, z: d.z };
    }
    // How close someone's hands are to meeting in a clap: they come together over the quarter second before it
    // lands, meet on it, and part again as it fades
    function clapNear(d, t) {
      if (d.clapAt) return Math.max(0, Math.min(1, 1 - (d.clapAt - t) / 0.22));
      return Math.min(1, (d.flash || 0) * 1.7);
    }
    function spawnBeat(bt, T) {
      var L = layout(st.venue), you = listenerPos(L, T), far = st.listener === 'far';
      var col = st.style === 'dandiya' ? '232,163,61' : '243,230,208', firstT0 = bt;
      L.circles.forEach(function (c, ci) {
        var ctr = circleCentre(c, T), dd = Math.max(0, Math.hypot(you.x - ctr.x, you.z - ctr.z) - c.R), t0 = bt - dd / V;
        firstT0 = Math.min(firstT0, t0);
        var share = 0.5 + 0.45 * st.level;
        c.dancers.forEach(function (d, di) { if (d.atHome && ((ci === 0 && di === 0 && !far) || rnd() < share)) { d.clapAt = t0 + d.lag; d.clapHigh = rnd() < 0.25; } if (d.atHome && !(ci === 0 && di === 0) && rnd() < 0.04) d.twirl = 1; });
        if ((c.present || 0) < 0.15 || c.small) return;
        waves.push({ kind: 'front', c: c, t0: t0, a: (c.main ? 0.6 : 0.42) * (far ? 1.1 : 1) * Math.min(1, (c.present || 0) * 1.2), col: col, lim: Math.max(10, dd + 3) });
      });
      arrivals.push({ t: bt, g: 1 });
      L.watchers.forEach(function (wt) { if (rnd() < 0.12) wt.clapAt = bt; });
      L.standers.forEach(function (sd0) { if (!sd0.phone && rnd() < 0.1) sd0.clapAt = bt; });
      reflectors(you).forEach(function (r) {
        var dr = Math.hypot(you.x - r.x, you.z - r.z), s0 = Math.max(firstT0, bt + r.d - dr / V);
        waves.push({ kind: 'echo', x: r.x, y: r.y, z: r.z, t0: s0, a: Math.min(0.5, 0.1 + r.l), lim: dr * 1.05, aim: Math.atan2(you.z - r.z, you.x - r.x) });
        arrivals.push({ t: bt + r.d, g: Math.min(0.55, r.l * 1.4) });
      });
      haze = Math.min(1, haze + ({ outdoors: 0.05, sheri: 0.12, stadium: 0.22 }[st.venue] || 0.1) * (far ? 1.3 : 1));
      pulse = 1;
    }
    // With no clap sound playing, the circle still claps as it dances, silently, on every other beat of its own step
    var silentIdx = null;
    function silentBeat(bt) {
      layout(st.venue).circles.forEach(function (c) { c.dancers.forEach(function (d) { if (d.atHome && !d.coupleRole && rnd() < 0.75) { d.clapAt = bt + (d.lag || 0); d.clapHigh = rnd() < 0.25; } }); });
    }
    function scheduleBeats(t, T) {
      var b = opts.beats ? opts.beats() : null;
      if (!b && st.on && !reduce) {
        visIdx = null;
        var per = 1 / 1.8; if (silentIdx === null) silentIdx = Math.ceil(T / per);
        while (silentIdx * per - 0.6 < T) { var bT = silentIdx * per; if (silentIdx % 2 === 0 && bT > T) silentBeat(t + (bT - T)); silentIdx++; }
        return;
      }
      silentIdx = null;
      if (!b || !st.on || reduce || st.mode === 'crowd' || st.mode === 'off') { visIdx = null; return; }
      var key = b.anchor.toFixed(4) + '|' + b.period.toFixed(5) + '|' + b.cycle + '|' + b.hits.join(',');
      if (key !== beatKey) { beatKey = key; visIdx = null; }
      var ahead = 0.6;
      if (visIdx === null) visIdx = Math.ceil((t - b.anchor) / b.period);
      while (b.anchor + visIdx * b.period - ahead < t) {
        var bt = b.anchor + visIdx * b.period, pos = ((visIdx % b.cycle) + b.cycle) % b.cycle;
        if (b.hits.indexOf(pos) >= 0 && bt > t) spawnBeat(bt, T);
        visIdx++;
      }
    }

    /* ---------- the song's progress, traced counterclockwise round the garbo, just outside its rangoli ---------- */
    function progressRing(ctr, r, t) {
      var start = -Math.PI / 2;
      g.lineCap = 'round';
      if (st.live) {
        var sw = reduce ? 0 : (t * 0.35) % 1;
        g.strokeStyle = 'rgba(216,69,58,.8)'; g.lineWidth = 2.4; groundRing(ctr.x, ctr.z, r, start + sw * TAU, start + sw * TAU + 0.9, 20); g.stroke();
      } else if (st.progress > 0) {
        g.strokeStyle = '#d6b06f'; g.lineWidth = 2.6; groundRing(ctr.x, ctr.z, r, start, start + Math.min(1, st.progress) * TAU, 72); g.stroke();
      }
      if (st.chapters) st.chapters.forEach(function (f, i) {
        var a = start + f * TAU, p = P(ctr.x + Math.cos(a) * r, 0, ctr.z + Math.sin(a) * r); if (!p) return;
        g.fillStyle = i <= st.chapterIndex ? '#d6b06f' : 'rgba(243,230,208,.4)';
        g.beginPath(); g.arc(p.x, p.y, i === st.chapterIndex ? 3.6 : 2.2, 0, TAU); g.fill();
      });
      g.lineCap = 'butt';
    }

    /* ---------- frame ---------- */
    var camVenue = null, camNow = [0, 4.4, -12.5], horNow = 0.3, camSettled = true, walk = null, camKeyNow = '';
    var T = 0, lampAt = { x: 0.5, y: 0.6, r: 0.08 }, youLabel = null, partnerLabel = null, lightAt = null;
    function frame(ms) {
      if (!running) return;
      var dt = Math.min(0.05, lastMs ? (ms - lastMs) / 1000 : 0.016);
      if (lastMs && !document.hidden) {
        var gap = ms - lastMs; if (gap < 250) frameMs += (gap - frameMs) * 0.05;
        slowFor = frameMs > 28 ? slowFor + gap : 0;
        if (slowFor > 2500 && (QP > 0.5 || QD > 0.55)) { if (QP > 0.5) { QP = Math.max(0.5, QP - 0.25); resize(); } else QD = Math.max(0.55, QD - 0.2); slowFor = 0; frameMs = 20; }
      }
      lastMs = ms;
      var t = clock();
      if (!reduce) T += dt;
      TH = THEMES[st.theme] || THEMES.traditional;
      var bb = opts.beats && opts.beats(); BEAT = bb ? ((t - bb.anchor) / bb.period) % 2 : T * 1.8;
      var target = st.listener === 'far' ? 1 : 0;
      // You walk between the places you can stand: a second or two along an eased path, lifted over the crowd on
      // a long walk, with a step in it. A new venue starts in place.
      walkStep(dt);
      var ct = st.dj ? djCam(st.venue) : (CAMS[st.venue] || CAMS.outdoors)[st.listener] || CAMS.outdoors.circle, hf = st.dj ? 0.2 : { circle: 0.3, far: 0.4, stage: 0.44 }[st.listener] || 0.3;
      if (!st.dj && st.listener === 'circle' && (Math.abs(walkMe.ox) > 0.01 || Math.abs(walkMe.oz) > 0.01)) ct = [ct[0] + walkMe.ox, ct[1], ct[2] + walkMe.oz];
      // On a wide screen the DJ stands right of centre, leaving the left for the laptop's song list
      if (st.dj && W > H * 1.1) { ct[0] -= 1.35; ct[1] += 0.12; ct[2] -= 1.3; }
      var camKey = st.venue + '/' + (st.dj ? 'dj' : st.listener);
      if (camVenue !== st.venue || reduce) { camVenue = st.venue; camNow = ct.slice(); horNow = hf; walk = null; camKeyNow = camKey; }
      else if (camKey !== camKeyNow) { camKeyNow = camKey; var wd = Math.hypot(ct[0] - camNow[0], ct[1] - camNow[1], ct[2] - camNow[2]); walk = { from: camNow.slice(), h0: horNow, t: 0, dur: Math.min(1.8, 0.8 + wd / 45), lift: Math.min(2.6, wd * 0.06) }; }
      if (walk) {
        walk.t += dt;
        var wp = Math.min(1, walk.t / walk.dur), we = wp < 0.5 ? 2 * wp * wp : 1 - Math.pow(-2 * wp + 2, 2) / 2, arc = Math.sin(wp * Math.PI);
        for (var ci0 = 0; ci0 < 3; ci0++) camNow[ci0] = walk.from[ci0] + (ct[ci0] - walk.from[ci0]) * we;
        camNow[1] += arc * walk.lift + Math.sin(wp * Math.PI * 7) * 0.05 * arc; camNow[0] += Math.sin(wp * Math.PI * 3.5) * 0.06 * arc;
        horNow = walk.h0 + (hf - walk.h0) * we;
        if (wp >= 1) walk = null;
      } else {
        var ek = Math.min(1, dt * 2.4);
        camNow[0] += (ct[0] - camNow[0]) * ek; camNow[1] += (ct[1] - camNow[1]) * ek; camNow[2] += (ct[2] - camNow[2]) * ek; horNow += (hf - horNow) * ek;
      }
      camSettled = Math.abs(ct[0] - camNow[0]) + Math.abs(ct[1] - camNow[1]) + Math.abs(ct[2] - camNow[2]) < 0.02;
      view.k += (target - view.k) * Math.min(1, dt * (reduce ? 60 : 2.6));
      var ce = CAMS[st.venue] || CAMS.outdoors, e = ease(Math.max(0, Math.min(1, view.k)));
      HOR = BY + BH * horNow;
      cam.x = camNow[0]; cam.y = camNow[1]; cam.z = camNow[2];
      bright += ((st.on ? 1 : 0.55) - bright) * Math.min(1, dt * 3);
      pulse *= Math.exp(-dt * 5);
      var L = layout(st.venue);
      if (st.on && !reduce) L.circles.forEach(function (c) { c.spin += c.w * dt; });

      scheduleBeats(t, T);
      if (st.on && !reduce && st.mode === 'crowd' && Math.random() < dt * 8) {
        var mc = L.circles[Math.floor(Math.random() * L.circles.length)], md = mc.dancers[Math.floor(Math.random() * mc.dancers.length)], mw = dancerWorld(mc, md, T, circleCentre(mc, T));
        waves.push({ kind: 'murmur', x: mw.x, z: mw.z, t0: t, a: 0.22 });
      }

      g.setTransform(DPR, 0, 0, DPR, 0, 0);
      g.drawImage(sky(st.venue), 0, 0, W, H);
      if (st.venue === 'outdoors') outdoorsBack(t); else if (st.venue === 'stadium') stadiumBack(t); else sheriBack(t);

      // Reverb haze: how long the venue keeps ringing after each clap
      haze *= Math.exp(-dt / (({ outdoors: 0.5, sheri: 0.9, stadium: 2.2 }[st.venue] || 1) / 2.5));
      var mainP = P(0, 0, 0);
      if (haze > 0.01 && mainP) { var hz = g.createRadialGradient(mainP.x, mainP.y, 4, mainP.x, mainP.y, W * 0.8); hz.addColorStop(0, 'rgba(255,200,130,' + haze * 0.2 + ')'); hz.addColorStop(1, 'rgba(255,200,130,0)'); g.fillStyle = hz; g.fillRect(0, 0, W, H); }

      // Floor rings, then every dancer and garbo sorted far to near
      var items = [], beatPh = 0, b = opts.beats && opts.beats();
      if (b) beatPh = ((t - b.anchor) / b.period) % 2; else beatPh = T * 1.8;
      L.circles.forEach(function (c, ci) {
        c.shown = !(ci > 1 && (ci - 1) / L.circles.length > (st.density * QD));
        if (!c.shown) return;
        var ctr = circleCentre(c, T);
        if (c.main) { rangoliAt(ctr, t); progressRing(ctr, 2.25, t); var lp = P(ctr.x, 0, ctr.z); if (lp) items.push({ z: lp.z, kind: 'lamp', p: lp, main: true, ctr: ctr }); }
        var home = 0;
        c.dancers.forEach(function (d, di) {
          if (d.clapAt && t >= d.clapAt) { d.flash = 1; d.clapAt = 0; }
          d.flash *= Math.exp(-dt * 7); d.twirl *= Math.exp(-dt * 2.2); d.clapK = clapNear(d, t);
          var slot = walkMe.on && d.coupleRole ? { x: walkMe.x + (d.coupleRole === 'w' ? -0.35 : 0.35), z: walkMe.z } : dancerWorld(c, d, T, ctr), w = travel(d, slot, dt);
          d.wx = w.x; d.wz = w.z;
          if (d.atHome) home++;
          var p = P(w.x, d.sitting ? (d.rest.y || 0) : 0, w.z); d._px = p ? p.x : null;
          var fd = p ? Math.max(0, Math.min(1, (p.z - 3) / 4)) : 0;
          if (p && p.z > 2.2 && p.x > -60 && p.x < W + 60) items.push({ z: p.z, kind: 'dancer', p: p, d: d, fade: fd, you: !!d.coupleRole && d.coupleRole === (st.youAs === 'man' ? 'm' : 'w') && st.listener === 'circle' && view.k < 0.5 && !st.dj, partner: !!d.coupleRole && d.coupleRole !== (st.youAs === 'man' ? 'm' : 'w') && st.listener === 'circle' && view.k < 0.5 && !st.dj });
        });
        c.present = home / c.dancers.length;
        // Raas: neighbours pair up and strike each other's sticks, so each turns toward the other on the beat
        for (var pi = 0; pi + 1 < c.dancers.length; pi += 2) { var da = c.dancers[pi], db = c.dancers[pi + 1]; if (da._px != null && db._px != null) { da.strikeDir = db._px >= da._px ? 1 : -1; db.strikeDir = -da.strikeDir; } else { da.strikeDir = db.strikeDir = 0; } }
      });
      if (!reduce) { moveWalkers(L, st.venue, dt); moveKids(L, st.venue, dt); }
      L.standers.forEach(function (sd0) { if (sd0.clapAt && t >= sd0.clapAt) { sd0.flash = 1; sd0.clapAt = 0; } sd0.flash *= Math.exp(-dt * 4); sd0.clapK = clapNear(sd0, t); var p = P(sd0.x, 0, sd0.z); if (p && p.z > (st.dj ? 3 : 2.5) && p.x > -30 && p.x < W + 30) items.push({ z: p.z, kind: 'dancer', p: p, d: sd0, fade: Math.max(0, Math.min(1, (p.z - 3) / 4)) }); });
      var nearCut = st.dj ? 3 : 2.5;
      L.kids.forEach(function (k) { var p = P(k.x, 0, k.z); if (p && p.z > nearCut && p.x > -30 && p.x < W + 30) items.push({ z: p.z, kind: 'dancer', p: p, d: k, fade: Math.max(0, Math.min(1, (p.z - 3) / 4)) }); });
      L.walkers.forEach(function (w, wi) { if (!w.pair && wi / L.walkers.length > (st.density * QD)) return; var p = P(w.x, 0, w.z), fd = p ? Math.max(0, Math.min(1, (p.z - 4) / 3)) : 0; if (p && fd > 0 && p.z > nearCut && p.x > -40 && p.x < W + 40) items.push({ z: p.z, kind: 'dancer', p: p, d: w, fade: fd }); });
      L.stalls.forEach(function (sl) { var p = P(sl.x, 0, sl.z); if (p) items.push({ z: p.z + 1.5, kind: 'stall', sl: sl, p: p }); });
      L.trees.forEach(function (tr) { if (tr.z >= 44) return; var p = P(tr.x, 0, tr.z); if (p && p.z > 1.5) items.push({ z: p.z, kind: 'tree', tr: tr }); });
      if (DJ[st.venue]) { var djb = DJ[st.venue], djp = P(djb.x, 0, djb.z); if (djp && djp.z > 1 && djp.x > -80 && djp.x < W + 80) items.push({ z: djp.z + 0.3, kind: 'dj', b: djb }); }
      if (DJ[st.venue]) { var life = djAround(st.venue);
        life.props.forEach(function (o) { var p = P(o.x, 0, o.z); if (p && p.z > 1.2 && p.x > -60 && p.x < W + 60) items.push({ z: p.z + (o.kind === 'plasticChair' ? 0.02 : 0), kind: 'djprop', o: o }); });
        life.people.forEach(function (q) { var p = P(q.x, q.seat ? 0.45 : 0, q.z); if (p && p.z > 1.6 && p.x > -60 && p.x < W + 60) items.push({ z: p.z - 0.01, kind: 'dancer', p: p, d: q.d, fade: 1 }); }); }
      L.props.forEach(function (o) { var p = P(o.x, 0, o.z); if (p && p.z > 2 && p.x > -60 && p.x < W + 60) items.push({ z: p.z, kind: 'prop', o: o }); });
      L.gallery.forEach(function (ga) {
        if (ga.kind === 'runner') playKid(ga, L.gallery, dt);
        var p = P(ga.x, ga.y + (ga.hopY || 0), ga.z); if (p && p.z > 0.9 && p.x > -60 && p.x < W + 60) items.push({ z: p.z + (ga.kind === 'step' ? 0.6 : 0), kind: 'gallery', ga: ga, p: p });
      });
      L.seats.forEach(function (se) { var p = P(se.x, se.y != null ? se.y : 0.45, se.z); if (p && p.z > 2.2 && p.x > -30 && p.x < W + 30) items.push({ z: p.z, kind: 'seat', se: se, p: p, fade: Math.max(0, Math.min(1, (p.z - 3) / 4)) }); });
      L.watchers.forEach(function (wt) { if (wt.clapAt && t >= wt.clapAt) { wt.flash = 1; wt.clapAt = 0; } wt.flash *= Math.exp(-dt * 3); wt.clapK = clapNear(wt, t); var p = P(wt.x, 0, wt.z); if (p && p.z > 2.2 && p.x > -30 && p.x < W + 30) items.push({ z: p.z, kind: 'dancer', p: p, d: wt, fade: Math.max(0, Math.min(1, (p.z - 3) / 4)) }); });
      items.sort(function (a, b2) { return b2.z - a.z; });
      var lc0 = P(circleCentre(L.circles[0], T).x, 1, circleCentre(L.circles[0], T).z); lightAt = lc0 ? { x: lc0.x, y: lc0.y } : null;
      youLabel = null; partnerLabel = null;
      var lit = st.lit != null ? st.lit : st.on ? 1 : 0.35;
      // Depth: veils of night air laid between layers of the crowd, thicker the further back, so the circle round
      // the garbo stays crisp and everything behind it recedes instead of piling into one cluster
      var D0 = -cam.z, FOG = [{ z: st.listener === 'stage' || st.dj ? 60 : D0 + 40, a: 0.42 }], fi = 0;
      items.forEach(function (it) {
        while (fi < FOG.length && it.z < FOG[fi].z) fogBand(FOG[fi++]);
        if (it.kind === 'lamp') { var lp2 = it.main && opts.lampScale ? { x: it.p.x, y: it.p.y, s: it.p.s * opts.lampScale, z: it.p.z } : it.p; mandvi(it.ctr, 'back', t); garbo(lp2, it.main ? lit : lit * 0.8, t, it.main); mandvi(it.ctr, 'front', t); it.p = lp2; if (it.main) lampAt = { x: it.p.x / W, y: (it.p.y - it.p.s * 0.9) / H, r: it.p.s * 0.9 / W }; }
        else if (it.kind === 'stall') stall(it.sl, t);
        else if (it.kind === 'tree') drawTree(it.tr, t);
        else if (it.kind === 'prop') prop(it.o, t);
        else if (it.kind === 'dj') djBooth(it.b, t);
        else if (it.kind === 'djprop') djProp(it.o, t);
        else if (it.kind === 'gallery') galleryItem(it.ga, it.p, T);
        else if (it.kind === 'seat') { if (!it.se.kind) chair(it.se); if (it.se.who) figure(it.p, it.se.who, T, false, beatPh, it.fade); }
        else { if (it.you || it.partner) followSpot(it.p, it.d); figure(it.p, it.d, T, it.you, beatPh, it.you || it.partner ? 1 : it.fade); if (it.partner) partnerMark(it.p, it.d); }
      });

      while (fi < FOG.length) fogBand(FOG[fi++]);
      FOGF = 0;
      if (st.venue === 'outdoors') outdoorsOver(t); else if (st.venue === 'stadium') stadiumOver(t); else sheriOver(t);
      droneInSky(t);
      walkOverlay(L, t);
      // Your label always sits on top, so you can find yourself in the crowd
      // Each tag rests on its own head. If the two would overlap, your partner's is lifted above yours with a line down to their head.
      var compact = st.listener !== 'circle', lead = null;
      if (partnerLabel && youLabel) {
        var zs = tagSize(youLabel.h, compact), need = zs.hh + zs.tip + 6, wide = zs.fs * 2.6;
        if (Math.abs(partnerLabel.x - youLabel.x) < wide && Math.abs(partnerLabel.y - youLabel.y) < need) { lead = { x: partnerLabel.hx, y: partnerLabel.y - 2 }; partnerLabel.y = Math.min(partnerLabel.y, youLabel.y) - need; }
      }
      if (partnerLabel) tag(partnerLabel.x, partnerLabel.y, partnerLabel.h, false, partnerLabel.man, T, compact, lead);
      if (youLabel) tag(youLabel.x, youLabel.y, youLabel.h, true, youLabel.man, T, compact, null);

      // Dust and moths drifting up through the light
      if (!reduce && st.venue !== 'sheri') {
        g.save(); g.globalCompositeOperation = 'lighter';
        L.motes.forEach(function (m) {
          m[1] += m[3] * dt; if (m[1] > 9) m[1] = 0.3;
          var q = P(m[0] + Math.sin(T * 0.4 + m[4]) * 0.4, m[1], m[2]); if (!q || q.x < 0 || q.x > W) return;
          g.fillStyle = 'rgba(' + TH.glowTint + ',' + 0.35 * bright * (0.6 + 0.4 * Math.sin(T * 2 + m[4])) + ')';
          g.fillRect(q.x, q.y, Math.max(1, q.s * 0.03), Math.max(1, q.s * 0.03));
        });
        g.restore();
      }

      // Waves
      for (var i = waves.length - 1; i >= 0; i--) {
        var w = waves[i], age = t - w.t0; if (age < 0) continue;
        var r = age * V;
        if (w.kind === 'murmur') {
          var ml = 1.6; if (age * 3 > ml) { waves.splice(i, 1); continue; }
          g.strokeStyle = 'rgba(243,230,208,' + w.a * (1 - age * 3 / ml) + ')'; g.lineWidth = 1; groundRing(w.x, w.z, age * 3, 0, TAU, 24); g.stroke(); continue;
        }
        if (r > w.lim) { waves.splice(i, 1); continue; }
        if (w.kind === 'front') {
          var ctr2 = circleCentre(w.c, T), fa = w.a * Math.pow(1 - r / w.lim, 1.2);
          g.strokeStyle = 'rgba(' + w.col + ',' + fa + ')'; g.lineWidth = 2; groundRing(ctr2.x, ctr2.z, w.c.R + r, 0, TAU, 72); g.stroke();
          g.strokeStyle = 'rgba(' + w.col + ',' + fa * 0.2 + ')'; g.lineWidth = 7; g.stroke();
        } else {
          var ea = w.a * Math.pow(1 - r / w.lim, 1.1), rp = P(w.x, w.y, w.z);
          if (rp && age < 0.2) glow(rp.x, rp.y, Math.max(2, rp.s * 0.6), 'rgba(255,196,110,1)', (1 - age / 0.2) * w.a * 1.5);
          g.strokeStyle = 'rgba(232,163,61,' + ea + ')'; g.lineWidth = 1.6; groundRing(w.x, w.z, r, w.aim - 0.75, w.aim + 0.75, 28); g.stroke();
        }
      }
      for (var j = arrivals.length - 1; j >= 0; j--) if (arrivals[j].t <= t) { youGlow = Math.max(youGlow, arrivals[j].g); arrivals.splice(j, 1); }
      youGlow *= Math.exp(-dt * 6);


      // Soft vignette, then the fade from the previous venue
      var vg = g.createRadialGradient(W / 2, H * 0.55, H * 0.25, W / 2, H * 0.55, H * 0.85); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.5)');
      g.fillStyle = vg; g.fillRect(0, 0, W, H);
      if (fade && fadeA > 0) { g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = fadeA; g.drawImage(fade, 0, 0); g.globalAlpha = 1; fadeA -= dt * (reduce ? 10 : 2); g.setTransform(DPR, 0, 0, DPR, 0, 0); }
      if (opts.overlay) opts.overlay(g, W, H);
      if (opts.onFrame) opts.onFrame(lampAt);
      if (!opts.manual) requestAnimationFrame(frame);
    }

    function resize() {
      var r = canvas.getBoundingClientRect();
      W = Math.max(1, r.width); H = Math.max(1, r.height);
      // At most about 2.4 million pixels a frame: phones keep full sharpness, big screens draw a little softer
      DPR = Math.max(0.75, Math.min(2, window.devicePixelRatio || 1, Math.sqrt(PIXELS * QP * QP / (W * H))));
      canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
      layoutBox(); statics = {}; fade = null;
    }
    function layoutBox() {
      BX = box ? box.x : 0; BY = box ? box.y : 0; BW = box ? box.w : W; BH = box ? box.h : H;
      HOR = BY + BH * 0.3; F = Math.min(BW, BH * 1.05) * 0.95;
    }
    var faces = [];
    function loadFaces(list) {
      var next = (list || []).filter(function (f) { return f && f.url; }).slice(0, 4);
      faces = next.map(function (f) {
        var old = faces.filter(function (o) { return o.url === f.url; })[0];
        if (old) { old.man = !!f.man; return old; }
        var rec = { url: f.url, man: !!f.man, img: null }, im = new Image(); im.decoding = 'async'; im.onload = function () { rec.img = im; }; im.src = f.url; return rec;
      });
    }
    function set(patch) {
      // Singer heads for the song's artists: singerFaces is a list, singerFace a single one
      if (patch.singerFaces !== undefined) loadFaces(patch.singerFaces);
      else if (patch.singerFace !== undefined) loadFaces(patch.singerFace ? [patch.singerFace] : []);
      if (patch.venue && patch.venue !== st.venue && W > 1) {
        fade = fade || document.createElement('canvas'); fade.width = canvas.width; fade.height = canvas.height;
        fade.getContext('2d').drawImage(canvas, 0, 0); fadeA = 1; waves = []; arrivals = [];
      }
      if (patch.listener && patch.listener !== st.listener) { waves = []; arrivals = []; }
      // A new song: its progress starts again from the top, and the singers change sides for it
      if (patch.singers !== undefined) st.singers = Array.isArray(patch.singers) ? patch.singers.slice(0, 3) : null;
      if (patch.songKey !== undefined) { st.songKey = patch.songKey ? String(patch.songKey) : null; st.songKeySeen = true; }
      if (patch.progress != null) paceFrom(+patch.progress || 0);
      if (patch.progress != null && !st.songKeySeen) { if ((st.progress || 0) > 0.3 && patch.progress < 0.05) swapSingers(); }
      for (var k in patch) st[k] = patch[k];
    }
    if (window.ResizeObserver) new ResizeObserver(resize).observe(canvas); else window.addEventListener('resize', resize);
    // Shift on a keyboard cues the singers' next move, except while typing
    var WALK_KEYS = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', w: 'up', s: 'down', a: 'left', d: 'right', W: 'up', S: 'down', A: 'left', D: 'right' };
    function walkKeyTarget(e) {
      var tgt = e.composedPath ? e.composedPath()[0] : e.target;
      // Buttons don't use the arrow keys, so a focused Play or rail button still lets you walk; anything that
      // steers with them (the genre dial, tabs, sliders, lists, an open card) keeps them
      if (e.defaultPrevented || document.querySelector('[aria-modal="true"]:not([hidden])')) return false;
      return !(tgt && tgt.closest && tgt.closest('input, textarea, select, [contenteditable], [role="tab"], [role="tablist"], [role="slider"], [role="listbox"], [role="option"], [role="radio"], [role="radiogroup"], [role="menu"], [role="menuitem"], [role="dialog"], #dial'));
    }
    if (opts.keys !== false && canWalk) {
      window.addEventListener('keydown', function (e) {
        if (!running || e.metaKey || e.ctrlKey || e.altKey) return;
        if (e.key === 'Escape' && walkMe.on) { walkMe.on = false; walkMe.keys = {}; return; }
        var dir = WALK_KEYS[e.key];
        if (!dir || st.listener !== 'circle' || st.dj || !walkKeyTarget(e)) return;
        e.preventDefault(); walkMe.keys[dir] = true;
      });
      window.addEventListener('keyup', function (e) { var dir = WALK_KEYS[e.key]; if (dir) walkMe.keys[dir] = false; });
      window.addEventListener('blur', function () { walkMe.keys = {}; });
    }
    if (opts.keys !== false) window.addEventListener('keydown', function (e) {
      if (e.key !== 'Shift' || e.repeat || !running) return;
      var tgt = e.composedPath ? e.composedPath()[0] : e.target;
      if (tgt && tgt.closest && tgt.closest('input, textarea, select, [contenteditable]')) return;
      cueSingers();
    });
    resize();
    if (!opts.manual) requestAnimationFrame(frame);
    return {
      set: set, resize: resize,
      // Where the scene composes itself inside the canvas, in CSS pixels. Omit to use the whole canvas.
      setBox: function (b) { box = b; layoutBox(); statics = {}; },
      draw: frame,
      lamp: function () { return lampAt; },
      // The singers' next move, as Shift does it; returns the move's name
      cueSingers: cueSingers,
      stop: function () { running = false; }
    };
  }

  window.GarbaVenueScene = { create: create, moonInfo: moonInfo };
})();
