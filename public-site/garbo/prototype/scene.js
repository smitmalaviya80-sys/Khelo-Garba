/* Garbo scene renderer: the lamp, its light, the dancers and the floor circle.
   Pure canvas drawing. The player logic in garbo.js feeds it state; it never owns playback. */
(function () {
  'use strict';

  var TAU = Math.PI * 2;
  var SKIRTS = ['#c0392b', '#d6246e', '#e8a33d', '#2f8f5b', '#3b4cc0', '#8e44ad', '#e67e22', '#b83227', '#16a085'];

  function seeded(seed) { return function () { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }; }

  function glowSprite(size, rgb) {
    var c = document.createElement('canvas'); c.width = c.height = size;
    var g = c.getContext('2d'), r = size / 2;
    var grad = g.createRadialGradient(r, r, 0, r, r, r);
    grad.addColorStop(0, 'rgba(' + rgb + ',1)');
    grad.addColorStop(0.35, 'rgba(' + rgb + ',.45)');
    grad.addColorStop(1, 'rgba(' + rgb + ',0)');
    g.fillStyle = grad; g.fillRect(0, 0, size, size);
    return c;
  }

  /* Shared drawing: the garbo on its low stand, used by the live scene and the share card.
     x and base are the foot of the stand on the floor; m is pixels per metre. The pot is about
     60 cm across, so it reads as a lamp at the centre of the circle, not a giant. */
  function drawPot(ctx, x, base, m, lit, t) {
    var L = 0.45 + 0.55 * lit, r = m * 0.3, cy = base - m * 0.9;
    ctx.save();
    if (lit > 0.02) {
      var hr = m * 2.4, hg = ctx.createRadialGradient(x, cy, 1, x, cy, hr);
      hg.addColorStop(0, 'rgba(255,180,90,' + 0.45 * lit + ')'); hg.addColorStop(1, 'rgba(255,180,90,0)');
      ctx.fillStyle = hg; ctx.beginPath(); ctx.arc(x, cy, hr, 0, TAU); ctx.fill();
    }
    // Low wooden stand draped in a red cloth with a gold border
    ctx.fillStyle = '#3b2213'; ctx.fillRect(x - m * 0.34, base - m * 0.5, m * 0.07, m * 0.5); ctx.fillRect(x + m * 0.27, base - m * 0.5, m * 0.07, m * 0.5);
    ctx.fillStyle = '#9b1f1a'; ctx.beginPath(); ctx.moveTo(x - m * 0.42, base - m * 0.56); ctx.lineTo(x + m * 0.42, base - m * 0.56); ctx.lineTo(x + m * 0.36, base - m * 0.3); ctx.lineTo(x, base - m * 0.18); ctx.lineTo(x - m * 0.36, base - m * 0.3); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#e8b04b'; ctx.lineWidth = Math.max(1, m * 0.02); ctx.stroke();
    // Clay pot
    var body = ctx.createRadialGradient(x - r * 0.35, cy - r * 0.3, r * 0.1, x, cy, r * 1.2);
    body.addColorStop(0, 'rgb(' + Math.round(205 * L) + ',' + Math.round(110 * L) + ',' + Math.round(58 * L) + ')');
    body.addColorStop(1, 'rgb(' + Math.round(96 * L) + ',' + Math.round(40 * L) + ',' + Math.round(20 * L) + ')');
    ctx.fillStyle = body; ctx.beginPath(); ctx.ellipse(x, cy, r, r * 0.92, 0, 0, TAU); ctx.fill();
    // Painted bands and perforations; light spills through when lit
    ctx.strokeStyle = 'rgba(40,14,6,.45)'; ctx.lineWidth = Math.max(1, r * 0.03);
    [-0.33, 0.36].forEach(function (b) { ctx.beginPath(); ctx.ellipse(x, cy + b * r, Math.sqrt(1 - b * b) * r, r * 0.08, 0, 0, Math.PI); ctx.stroke(); });
    var fl = 0.8 + 0.2 * Math.sin(t * 11) * Math.sin(t * 7.3);
    ctx.fillStyle = lit > 0.05 ? 'rgba(255,' + Math.round(210 + 30 * fl) + ',130,' + (0.25 + 0.75 * lit * fl) + ')' : 'rgba(40,16,8,.9)';
    ctx.shadowColor = 'rgba(255,190,90,' + lit + ')'; ctx.shadowBlur = r * 0.15 * lit;
    [[-0.52, 5], [-0.16, 7], [0.18, 7], [0.54, 5]].forEach(function (rw, ri) {
      var yy = cy + rw[0] * r, span = Math.sqrt(1 - rw[0] * rw[0]) * r * 1.6;
      for (var j = 0; j < rw[1]; j++) {
        var xx = x - span / 2 + span * (j + 0.5) / rw[1];
        ctx.beginPath();
        if (ri % 2) { ctx.moveTo(xx, yy - r * 0.1); ctx.lineTo(xx + r * 0.08, yy + r * 0.07); ctx.lineTo(xx - r * 0.08, yy + r * 0.07); ctx.closePath(); }
        else ctx.arc(xx, yy, r * 0.055, 0, TAU);
        ctx.fill();
      }
    });
    ctx.shadowBlur = 0;
    // Neck, a marigold garland, and the diya on the mouth
    ctx.fillStyle = 'rgb(' + Math.round(120 * L) + ',' + Math.round(50 * L) + ',' + Math.round(24 * L) + ')';
    ctx.beginPath(); ctx.ellipse(x, cy - r * 0.88, r * 0.42, r * 0.14, 0, 0, TAU); ctx.fill();
    for (var k = 0; k < 9; k++) { var ma = Math.PI * (k / 8); ctx.fillStyle = k % 2 ? '#f29a2e' : '#f6c342'; ctx.beginPath(); ctx.arc(x - Math.cos(ma) * r * 0.5, cy - r * 0.78 + Math.sin(ma) * r * 0.16, r * 0.075, 0, TAU); ctx.fill(); }
    ctx.fillStyle = '#6a2c14'; ctx.beginPath(); ctx.ellipse(x, cy - r * 1.02, r * 0.26, r * 0.08, 0, 0, TAU); ctx.fill();
    var mouth = cy - r * 1.05;
    if (lit > 0.3) {
      var f = (lit - 0.3) / 0.7, fh = r * (0.55 + 0.08 * Math.sin(t * 9) + 0.04 * Math.sin(t * 23)) * f, sway = Math.sin(t * 5) * r * 0.04;
      var fg = ctx.createRadialGradient(x, mouth - fh * 0.4, 1, x, mouth - fh * 0.4, r * 0.7);
      fg.addColorStop(0, 'rgba(255,200,110,' + 0.5 * f + ')'); fg.addColorStop(1, 'rgba(255,160,60,0)');
      ctx.fillStyle = fg; ctx.beginPath(); ctx.arc(x, mouth - fh * 0.4, r * 0.7, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.moveTo(x - r * 0.1, mouth); ctx.quadraticCurveTo(x - r * 0.12, mouth - fh * 0.6, x + sway, mouth - fh); ctx.quadraticCurveTo(x + r * 0.12, mouth - fh * 0.6, x + r * 0.1, mouth); ctx.closePath();
      var ff = ctx.createLinearGradient(0, mouth - fh, 0, mouth);
      ff.addColorStop(0, 'rgba(255,244,200,' + f + ')'); ff.addColorStop(0.55, 'rgba(255,190,70,' + f + ')'); ff.addColorStop(1, 'rgba(230,90,30,' + f + ')');
      ctx.fillStyle = ff; ctx.fill();
    } else if (lit > 0.12) {
      // Ember: a small glowing wick while paused
      ctx.fillStyle = 'rgba(255,140,60,' + Math.min(1, lit * 2.2) + ')';
      ctx.beginPath(); ctx.arc(x, mouth - r * 0.04, r * 0.06, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }

  function drawDancer(ctx, x, y, sc, col, phase, moving, alpha) {
    ctx.save(); ctx.globalAlpha = alpha;
    var sw = 7.5 * sc * (1 + (moving ? 0.18 * Math.sin(phase) : 0));
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.moveTo(x - sw, y); ctx.quadraticCurveTo(x, y + 3 * sc, x + sw, y); ctx.lineTo(x + 2.2 * sc, y - 11 * sc); ctx.lineTo(x - 2.2 * sc, y - 11 * sc); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#e4c29a'; ctx.fillRect(x - 1.7 * sc, y - 17 * sc, 3.4 * sc, 6.5 * sc);
    ctx.fillStyle = '#2a1a12'; ctx.beginPath(); ctx.arc(x, y - 19.8 * sc, 2.6 * sc, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#e4c29a'; ctx.lineWidth = 1.2 * sc; ctx.lineCap = 'round';
    var up = moving && Math.sin(phase) > 0;
    ctx.beginPath();
    if (up) { ctx.moveTo(x - 1.5 * sc, y - 15 * sc); ctx.lineTo(x - 4 * sc, y - 22 * sc); ctx.moveTo(x + 1.5 * sc, y - 15 * sc); ctx.lineTo(x + 4 * sc, y - 22 * sc); }
    else { ctx.moveTo(x - 1.5 * sc, y - 15 * sc); ctx.lineTo(x - 5 * sc, y - 11 * sc); ctx.moveTo(x + 1.5 * sc, y - 15 * sc); ctx.lineTo(x + 5 * sc, y - 11 * sc); }
    ctx.stroke(); ctx.restore();
  }

  function Scene(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.state = { mode: 'ember', progress: 0, chapters: null, chapterIndex: -1, live: false };
    this.lit = 0.22; this.speed = 0; this.angle = 0; this.outerAngle = 0;
    this.geom = null; this.scrimTop = null;
    this.glow = glowSprite(64, '255,200,125');
    var rnd = seeded(7);
    this.dots = [];
    for (var i = 0; i < 220; i++) this.dots.push({ a: rnd() * TAU, d: 0.12 + Math.pow(rnd(), 0.7) * 0.9, s: 0.8 + rnd() * 1.8, ph: rnd() * TAU, f: 1.5 + rnd() * 3 });
    this.inner = []; for (var k = 0; k < 18; k++) this.inner.push({ off: k / 18 * TAU, col: SKIRTS[k % SKIRTS.length], ph: rnd() * TAU });
    this.outer = []; for (var m = 0; m < 30; m++) this.outer.push({ off: m / 30 * TAU, col: SKIRTS[(m + 3) % SKIRTS.length], ph: rnd() * TAU });
    this.resize();
  }

  Scene.prototype.resize = function () {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.W = window.innerWidth; this.H = window.innerHeight;
    this.canvas.width = Math.round(this.W * dpr); this.canvas.height = Math.round(this.H * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };

  /* slot: the lamp slot's client rect. np: the now-playing rect, where the controls begin. */
  Scene.prototype.layout = function (slot, np) {
    var ps = Math.max(0.5, Math.min(slot.height / 260, slot.width / 300, 1.35));
    var cx = slot.left + slot.width / 2;
    var cy = slot.top + Math.max(62 * ps + 34 * ps, slot.height * 0.46);
    var R = Math.min(slot.width * 0.44, slot.height * 0.62, 190);
    var fy = cy + 76 * ps;
    var ry = R * 0.3;
    var overflow = fy + ry + 6 - (slot.top + slot.height);
    if (overflow > 0) { cy -= overflow; fy -= overflow; }
    this.geom = { cx: cx, cy: cy, ps: ps, R: R, ry: ry, fy: fy };
    // Controls sit below the lamp in portrait and beside it in landscape.
    this.scrim = np.left >= slot.right - 10 ? { side: true, at: np.left } : { side: false, at: np.top };
  };

  Scene.prototype.set = function (patch) { for (var k in patch) this.state[k] = patch[k]; };

  Scene.prototype.frame = function (t, dt) {
    var st = this.state, g = this.geom, ctx = this.ctx, W = this.W, H = this.H;
    if (!g) return;
    var litTarget = { playing: 1, live: 1, loading: 0.55, ember: 0.22, paused: 0.22, offline: 0.06, unavailable: 0.1 }[st.mode];
    if (litTarget == null) litTarget = 0.22;
    if (st.mode === 'loading' && !st.still) litTarget += 0.18 * Math.sin(t * 13) * Math.sin(t * 5);
    var speedTarget = st.mode === 'playing' ? 0.5 : st.mode === 'live' ? 0.62 : 0;
    var k = Math.min(1, dt * 2.4);
    this.lit += (litTarget - this.lit) * k;
    this.speed += (speedTarget - this.speed) * Math.min(1, dt * 1.6);
    this.angle -= this.speed * dt;
    this.outerAngle -= this.speed * 0.55 * dt;
    if (st.still) { this.lit = litTarget; this.speed = 0; }
    var lit = Math.max(0, Math.min(1, this.lit));
    var moving = this.speed > 0.05;

    ctx.fillStyle = '#0b0605'; ctx.fillRect(0, 0, W, H);
    var room = ctx.createRadialGradient(g.cx, g.fy, 20, g.cx, g.fy, Math.max(W, H) * 0.75);
    room.addColorStop(0, 'rgba(92,38,17,' + (0.16 + 0.32 * lit) + ')'); room.addColorStop(1, 'rgba(11,6,5,0)');
    ctx.fillStyle = room; ctx.fillRect(0, 0, W, H);

    // Light thrown through the perforations onto the walls and floor
    if (lit > 0.03) {
      var D = Math.max(W, H) * 0.85;
      for (var i = 0; i < this.dots.length; i++) {
        var p = this.dots[i], ca = Math.cos(p.a), sa = Math.sin(p.a), dist = p.d * D;
        var x = g.cx + ca * dist, y = sa > 0 ? g.fy - 10 + sa * dist * 0.34 : g.cy + sa * dist;
        var b = lit * (0.6 + 0.4 * Math.sin(t * p.f + p.ph)) * Math.max(0, 1 - p.d);
        if (b < 0.02) continue;
        var rad = p.s * (1 + p.d * 2.4) * 2.4;
        ctx.globalAlpha = Math.min(1, b * 0.95);
        ctx.drawImage(this.glow, x - rad, y - rad, rad * 2, rad * 2);
      }
      ctx.globalAlpha = 1;
    }

    // Outer ring: the circle grows ring by ring. Only its far half is drawn.
    var oR = g.R * 1.55, ory = g.ry * 1.5;
    for (var o = 0; o < this.outer.length; o++) {
      var od = this.outer[o], oa = this.outerAngle + od.off, os = Math.sin(oa);
      if (os > -0.08) continue;
      var osc = g.ps * 0.62;
      var bob = moving ? Math.abs(Math.sin(t * 4.6 + od.ph)) * 1.6 * osc : 0;
      drawDancer(ctx, g.cx + Math.cos(oa) * oR, g.fy + os * ory - bob, osc, od.col, t * 4.6 + od.ph, moving, 0.18 + 0.4 * lit);
    }

    // Floor circle and progress, traced counterclockwise from the front
    var fr = g.R + 16 * g.ps, fry = g.ry + 7 * g.ps;
    ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(243,230,208,.13)';
    ctx.beginPath(); ctx.ellipse(g.cx, g.fy, fr, fry, 0, 0, TAU); ctx.stroke();
    var start = Math.PI / 2;
    if (st.mode === 'live') {
      var sweep = (t * 0.35) % 1;
      ctx.lineWidth = 2.2; ctx.strokeStyle = 'rgba(216,69,58,.75)';
      ctx.beginPath(); ctx.ellipse(g.cx, g.fy, fr, fry, 0, start - sweep * TAU, start - sweep * TAU - 0.9, true); ctx.stroke();
    } else if (st.progress > 0) {
      ctx.lineWidth = 2.4; ctx.strokeStyle = '#d6b06f'; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.ellipse(g.cx, g.fy, fr, fry, 0, start, start - Math.min(1, st.progress) * TAU, true); ctx.stroke();
    }
    if (st.chapters && st.chapters.length) {
      for (var c = 0; c < st.chapters.length; c++) {
        var ang = start - st.chapters[c] * TAU;
        var tx = g.cx + Math.cos(ang) * fr, ty = g.fy + Math.sin(ang) * fry;
        ctx.fillStyle = c <= st.chapterIndex ? '#d6b06f' : 'rgba(243,230,208,.35)';
        ctx.beginPath(); ctx.arc(tx, ty, c === st.chapterIndex ? 3.4 : 2, 0, TAU); ctx.fill();
      }
    }

    var self = this;
    function ring(front) {
      for (var d = 0; d < self.inner.length; d++) {
        var dn = self.inner[d], a = self.angle + dn.off, s = Math.sin(a);
        if ((s > 0) !== front) continue;
        var sc = g.ps * (0.74 + 0.26 * (s + 1) / 2);
        var bob = moving ? Math.abs(Math.sin(t * 5.2 + dn.ph)) * 2.2 * sc : 0;
        var shade = 0.35 + 0.65 * lit * (0.55 + 0.45 * (s + 1) / 2);
        drawDancer(ctx, g.cx + Math.cos(a) * g.R, g.fy + s * g.ry - bob, sc, dn.col, t * 5.2 + dn.ph, moving, 0.35 + 0.65 * shade);
      }
    }
    ring(false);
    drawPot(ctx, g.cx, g.fy, g.ps * 64, lit, t);
    ring(true);

    // Keep the controls legible over the light
    if (this.scrim) {
      var a = this.scrim.at - 30, sg;
      if (this.scrim.side) {
        sg = ctx.createLinearGradient(a, 0, a + 110, 0);
        sg.addColorStop(0, 'rgba(11,6,5,0)'); sg.addColorStop(1, 'rgba(11,6,5,.86)');
        ctx.fillStyle = sg; ctx.fillRect(a, 0, 110, H);
        ctx.fillStyle = 'rgba(11,6,5,.86)'; ctx.fillRect(a + 110, 0, W, H);
      } else {
        sg = ctx.createLinearGradient(0, a, 0, a + 110);
        sg.addColorStop(0, 'rgba(11,6,5,0)'); sg.addColorStop(1, 'rgba(11,6,5,.86)');
        ctx.fillStyle = sg; ctx.fillRect(0, a, W, 110);
        ctx.fillStyle = 'rgba(11,6,5,.86)'; ctx.fillRect(0, a + 110, W, H);
      }
    }
  };

  /* Share card: a still of the lit garbo with the song's title. */
  function drawCard(canvas, info) {
    var ctx = canvas.getContext('2d'), W = canvas.width, H = canvas.height;
    ctx.fillStyle = '#0b0605'; ctx.fillRect(0, 0, W, H);
    var room = ctx.createRadialGradient(W / 2, H * 0.42, 40, W / 2, H * 0.42, H * 0.8);
    room.addColorStop(0, 'rgba(120,48,20,.55)'); room.addColorStop(1, 'rgba(11,6,5,0)');
    ctx.fillStyle = room; ctx.fillRect(0, 0, W, H);
    var rnd = seeded(3), glow = glowSprite(64, '255,200,125');
    for (var i = 0; i < 260; i++) {
      var a = rnd() * TAU, d = (0.1 + Math.pow(rnd(), 0.7) * 0.9) * H * 0.75, x = W / 2 + Math.cos(a) * d, y = H * 0.4 + Math.sin(a) * d * (Math.sin(a) > 0 ? 0.4 : 1);
      var r = (2 + rnd() * 4) * (1 + d / H * 2) * 2;
      ctx.globalAlpha = Math.max(0, 0.9 * (1 - d / (H * 0.75)));
      ctx.drawImage(glow, x - r, y - r, r * 2, r * 2);
    }
    ctx.globalAlpha = 1;
    drawPot(ctx, W / 2, H * 0.4 + 360, 400, 1, 0.8);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#d6b06f'; ctx.font = '700 30px "Anek Gujarati", system-ui, sans-serif';
    ctx.fillText(info.eyebrow || '', W / 2, H * 0.7);
    ctx.fillStyle = '#f3e6d0'; ctx.font = '600 84px Rasa, Georgia, serif';
    wrap(ctx, info.title, W / 2, H * 0.7 + 100, W - 160, 88, 2);
    ctx.fillStyle = '#cdbca3'; ctx.font = '400 38px "Anek Gujarati", system-ui, sans-serif';
    ctx.fillText(info.artist, W / 2, H * 0.7 + 250, W - 160);
    ctx.fillStyle = '#978672'; ctx.font = '600 30px "Anek Gujarati", system-ui, sans-serif';
    ctx.fillText('playgarba.com', W / 2, H - 70);
  }

  function wrap(ctx, text, x, y, max, lh, lines) {
    var words = String(text).split(' '), line = '', n = 0;
    for (var i = 0; i < words.length; i++) {
      var test = line ? line + ' ' + words[i] : words[i];
      if (ctx.measureText(test).width > max && line) {
        if (n === lines - 1) { ctx.fillText(line + '…', x, y + n * lh); return; }
        ctx.fillText(line, x, y + n * lh); line = words[i]; n++;
      } else line = test;
    }
    ctx.fillText(line, x, y + n * lh);
  }

  /* Abhla mirror band for the Explore header: small mirrors that catch a moving light. */
  function MirrorBand(canvas) {
    this.canvas = canvas; this.ctx = canvas.getContext('2d'); this.light = null;
    var self = this;
    canvas.parentElement.addEventListener('pointermove', function (e) { var r = canvas.getBoundingClientRect(); self.light = { x: e.clientX - r.left, y: e.clientY - r.top, until: performance.now() + 2000 }; });
  }
  MirrorBand.prototype.resize = function () {
    var dpr = Math.min(window.devicePixelRatio || 1, 2), r = this.canvas.getBoundingClientRect();
    this.w = r.width; this.h = r.height; this.canvas.width = r.width * dpr; this.canvas.height = r.height * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    var THREADS = ['#d6246e', '#f07c1e', '#f2c230', '#3aa35b', '#3b4cc0'];
    var base = document.createElement('canvas'); base.width = this.canvas.width; base.height = this.canvas.height;
    var b = base.getContext('2d'); b.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.mirrors = [];
    var sp = 30, row = 0;
    for (var y = 12; y < this.h + 12; y += sp * 0.8, row++) {
      for (var x = (row % 2 ? sp / 2 : 0) + 6; x < this.w + 12; x += sp) {
        var ci = (row + Math.round(x / sp)) % 5;
        for (var q = 0; q < 10; q++) { var a = q / 10 * TAU; b.fillStyle = THREADS[ci]; b.beginPath(); b.arc(x + Math.cos(a) * 7.5, y + Math.sin(a) * 7.5, 1.2, 0, TAU); b.fill(); }
        for (var p = 0; p < 6; p++) { var ap = p / 6 * TAU + 0.5; b.save(); b.translate(x + Math.cos(ap) * 11.5, y + Math.sin(ap) * 11.5); b.rotate(ap); b.fillStyle = THREADS[(ci + 2) % 5]; b.beginPath(); b.ellipse(0, 0, 3, 1.4, 0, 0, TAU); b.fill(); b.restore(); }
        this.mirrors.push({ x: x, y: y });
      }
    }
    this.base = base;
  };
  MirrorBand.prototype.frame = function (t) {
    if (!this.base) return;
    var ctx = this.ctx, lx, ly;
    if (this.light && performance.now() < this.light.until) { lx = this.light.x; ly = this.light.y; }
    else { lx = this.w * (0.5 + 0.5 * Math.sin(t * 0.5)); ly = this.h * (0.5 + 0.6 * Math.cos(t * 0.8)); }
    ctx.clearRect(0, 0, this.w, this.h);
    ctx.drawImage(this.base, 0, 0, this.w, this.h);
    for (var i = 0; i < this.mirrors.length; i++) {
      var m = this.mirrors[i], d = Math.hypot(m.x - lx, m.y - ly), I = Math.exp(-Math.pow(d / 70, 2));
      var hi = Math.round(95 + 160 * I), lo = Math.round(35 + 60 * I);
      var gr = ctx.createRadialGradient(m.x - 1.5, m.y - 1.5, 0, m.x, m.y, 5);
      gr.addColorStop(0, 'rgb(' + hi + ',' + hi + ',' + Math.min(255, hi + 8) + ')'); gr.addColorStop(1, 'rgb(' + lo + ',' + lo + ',' + (lo + 6) + ')');
      ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(m.x, m.y, 5, 0, TAU); ctx.fill();
      if (I > 0.65) { var L = 9 * (I - 0.5) * 2; ctx.strokeStyle = 'rgba(255,255,255,' + (I - 0.5) + ')'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(m.x - L, m.y); ctx.lineTo(m.x + L, m.y); ctx.moveTo(m.x, m.y - L); ctx.lineTo(m.x, m.y + L); ctx.stroke(); }
    }
  };

  /* The venue stage: when the shared Garba venue scene has loaded, the player stands inside it (the
     circles, the venue, the waves and the lamp). Same interface as Scene, so garbo.js can use either. */
  function VenueStage(canvas, hooks) {
    var self = this;
    this.state = { mode: 'ember', progress: 0, chapters: null, chapterIndex: -1, live: false };
    this.lit = 0.22; this.scrim = null; this.top = 0;
    this.v = window.GarbaVenueScene.create(canvas, {
      manual: true, lampScale: 1.35, venues: hooks.venues,
      // The stage screen uses the same lettering and garbo mark as this player's top-left logo
      brand: { text: 'PlayGarba.com', font: '600 {s}px Rasa, "Iowan Old Style", Georgia, serif', mark: true, spacing: -0.01 }, clock: hooks.clock, beats: hooks.beats, reduceMotion: hooks.reduce,
      overlay: function (g, W, H) { self.drawScrim(g, W, H); },
      onFrame: hooks.onLamp
    });
  }
  VenueStage.prototype.resize = function () { this.v.resize(); };
  VenueStage.prototype.layout = function (slot, np) {
    // At the DJ's table the scene has the whole screen: on a phone the DJ sits above the laptop, on a wide screen beside it
    if (this.dj) { var W = window.innerWidth, H = window.innerHeight; this.v.setBox(W > H * 1.1 ? { x: 0, y: 0, w: W, h: H } : { x: 0, y: 40, w: W, h: H * 0.5 }); this.top = 0; this.scrim = null; return; }
    this.v.setBox({ x: slot.left, y: slot.top, w: slot.width, h: slot.height });
    this.scrim = np.left >= slot.right - 10 ? { side: true, at: np.left } : { side: false, at: np.top };
    this.top = slot.top;
  };
  VenueStage.prototype.set = function (patch) { for (var k in patch) this.state[k] = patch[k]; };
  VenueStage.prototype.atmosphere = function (patch) { this.v.set(patch); };
  VenueStage.prototype.frame = function (t, dt) {
    var st = this.state;
    var target = { playing: 1, live: 1, loading: 0.55, ember: 0.22, paused: 0.22, offline: 0.06, unavailable: 0.1 }[st.mode];
    if (target == null) target = 0.22;
    if (st.mode === 'loading' && !st.still) target += 0.18 * Math.sin(t * 13) * Math.sin(t * 5);
    this.lit += (target - this.lit) * Math.min(1, dt * 2.4);
    if (st.still) this.lit = target;
    this.v.set({
      on: st.mode === 'playing' || st.mode === 'live', lit: Math.max(0, Math.min(1, this.lit)),
      progress: st.progress || 0, chapters: st.chapters, chapterIndex: st.chapterIndex, live: st.mode === 'live'
    });
    this.v.draw(performance.now());
  };
  // Keep the top bar and the controls legible over the venue
  VenueStage.prototype.drawScrim = function (ctx, W, H) {
    var top = this.dj ? 56 : this.top;
    var tg = ctx.createLinearGradient(0, 0, 0, top + 40);
    tg.addColorStop(0, 'rgba(11,6,5,.92)'); tg.addColorStop(Math.min(0.9, top / (top + 40)), 'rgba(11,6,5,.7)'); tg.addColorStop(1, 'rgba(11,6,5,0)');
    ctx.fillStyle = tg; ctx.fillRect(0, 0, W, top + 40);
    if (!this.scrim || this.dj) return;
    var a = this.scrim.at - 40, sg;
    if (this.scrim.side) {
      sg = ctx.createLinearGradient(a, 0, a + 120, 0);
      sg.addColorStop(0, 'rgba(11,6,5,0)'); sg.addColorStop(1, 'rgba(11,6,5,.9)');
      ctx.fillStyle = sg; ctx.fillRect(a, 0, 120, H);
      ctx.fillStyle = 'rgba(11,6,5,.9)'; ctx.fillRect(a + 120, 0, W, H);
    } else {
      sg = ctx.createLinearGradient(0, a, 0, a + 120);
      sg.addColorStop(0, 'rgba(11,6,5,0)'); sg.addColorStop(1, 'rgba(11,6,5,.9)');
      ctx.fillStyle = sg; ctx.fillRect(0, a, W, 120);
      ctx.fillStyle = 'rgba(11,6,5,.9)'; ctx.fillRect(0, a + 120, W, H);
    }
  };

  window.GarboScene = { Scene: Scene, VenueStage: VenueStage, MirrorBand: MirrorBand, drawCard: drawCard };
})();
