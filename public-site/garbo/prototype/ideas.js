/* Garbo player: the idea box.
   Loaded the first time someone opens the Ideas card. Anyone can ask for a feature through PlayGarba's Tally form
   (a name and the idea, no account). Tally files each answer in a Google Sheet, and that sheet, published as CSV,
   is read back here as the list of features other Garbaholics asked for, newest first.
   The owner hides a row by typing "yes" in the sheet's Hide column.
   Everything shown is someone else's words: it goes on the page as text only, never as markup or instructions. */
(function () {
  'use strict';
  var FORM_ID = '0QXgY9';
  var FORM_URL = 'https://tally.so/r/' + FORM_ID;
  var EMBED_URL = 'https://tally.so/embed/' + FORM_ID + '?hideTitle=1&transparentBackground=1&alignLeft=1&dynamicHeight=1';
  // The Google Sheet Tally fills, published to the web as CSV (File → Share → Publish to web → .csv)
  var LIST_CSV = window.GARBO_IDEAS_CSV || '';
  var MAX_SHOWN = 40;

  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }

  /* ---------- the published sheet ---------- */
  function parseCsv(text) {
    var rows = [], row = [], cell = '', q = false;
    for (var i = 0; i < text.length; i++) {
      var c = text[i];
      if (q) {
        if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
        else cell += c;
      } else if (c === '"') q = true;
      else if (c === ',') { row.push(cell); cell = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(cell); rows.push(row); row = []; cell = '';
      } else cell += c;
    }
    if (cell || row.length) { row.push(cell); rows.push(row); }
    return rows;
  }
  function column(head, test, skip) {
    for (var i = 0; i < head.length; i++) if (i !== skip && test.test(head[i])) return i;
    return -1;
  }
  function requests(csv) {
    var rows = parseCsv(csv).filter(function (r) { return r.some(function (c) { return c.trim(); }); });
    if (rows.length < 2) return [];
    var head = rows[0].map(function (h) { return h.trim(); });
    var name = column(head, /name/i);
    var idea = column(head, /should|add|feature|idea|request/i, name);
    var when = column(head, /submitted|date|time/i);
    var hide = column(head, /^hide$/i);
    if (idea < 0) return [];
    return rows.slice(1).map(function (r, n) {
      return { n: n, name: name >= 0 ? (r[name] || '').trim() : '', idea: (r[idea] || '').trim(), at: when >= 0 ? Date.parse(r[when]) : NaN, hidden: hide >= 0 && /^(y|yes|true|1|x|hide)$/i.test((r[hide] || '').trim()) };
    }).filter(function (x) { return x.idea && !x.hidden; })
      .sort(function (a, b) { return (isNaN(b.at) || isNaN(a.at)) ? b.n - a.n : b.at - a.at; })
      .slice(0, MAX_SHOWN);
  }

  function renderList(list, status) {
    if (!LIST_CSV) return;
    status.textContent = 'Loading requests…';
    fetch(LIST_CSV + (LIST_CSV.indexOf('?') < 0 ? '?' : '&') + 't=' + Math.floor(Date.now() / 60000), { cache: 'no-store' })
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.text(); })
      .then(function (csv) {
        var items = requests(csv);
        list.textContent = '';
        items.forEach(function (x) {
          var li = el('li', 'idea-item');
          li.append(el('p', 'idea-said', x.idea));
          var by = el('p', 'idea-by', (x.name ? x.name : 'A Garbaholic') + (isNaN(x.at) ? '' : ' · ' + new Date(x.at).toLocaleDateString([], { day: 'numeric', month: 'short' })));
          li.append(by);
          list.append(li);
        });
        status.textContent = items.length ? '' : 'No requests yet. Yours could be the first.';
      })
      .catch(function () { status.textContent = "The list couldn't load right now."; });
  }

  /* ---------- the card ---------- */
  function style() {
    if (document.getElementById('garbo-ideas-style')) return;
    var s = document.createElement('style'); s.id = 'garbo-ideas-style';
    s.textContent = [
      '.idea-form { margin: 0 -6px; }',
      '.idea-form iframe { display: block; width: 100%; height: 360px; border: 0; background: transparent; }',
      '.idea-open { display: block; text-align: center; font-size: 13px; color: var(--brass, #d6b06f); }',
      '.idea-wall { display: grid; gap: 10px; border-top: 1px solid var(--line, rgba(246,236,215,.14)); padding-top: 16px; text-align: left; }',
      '.idea-wall h3 { margin: 0; font: 600 13px/1.3 var(--ui, system-ui, sans-serif); letter-spacing: .04em; text-transform: uppercase; color: var(--brass, #d6b06f); text-align: center; }',
      '.idea-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }',
      '.idea-item { padding: 10px 12px; border-radius: 12px; background: rgba(246, 236, 215, .05); border: 1px solid var(--line, rgba(246,236,215,.12)); }',
      '.idea-said { margin: 0; font-size: 14px; line-height: 1.45; white-space: pre-wrap; overflow-wrap: anywhere; color: var(--ivory, #f6ecd7); }',
      '.idea-by { margin: 4px 0 0; font-size: 12px; color: var(--ivory-2, rgba(246,236,215,.66)); }',
      '.idea-status:empty { display: none; }',
      '.idea-status { margin: 0; font-size: 13px; text-align: center; color: var(--ivory-2, rgba(246,236,215,.66)); }'
    ].join('\n');
    document.head.appendChild(s);
  }

  function mount() {
    var card = document.getElementById('ideaCard');
    var body = card && card.querySelector('.idea-body');
    if (!body || body.dataset.tally) return;
    body.dataset.tally = '1';
    style();
    body.textContent = '';
    body.append(el('p', 'atmo-desc', 'What should PlayGarba do next? Add your name and your idea.'));

    var box = el('div', 'idea-form');
    var frame = document.createElement('iframe');
    frame.src = EMBED_URL;
    frame.title = 'Ask for a feature';
    frame.loading = 'lazy';
    box.append(frame);
    body.append(box);
    var open = el('a', 'idea-open', 'Form not showing? Open it in a new tab');
    open.href = FORM_URL; open.target = '_blank'; open.rel = 'noopener';
    body.append(open);

    var wall = el('section', 'idea-wall'), list = el('ul', 'idea-list'), status = el('p', 'idea-status');
    status.setAttribute('aria-live', 'polite');
    wall.setAttribute('aria-labelledby', 'ideaWallT');
    var h = el('h3', null, 'Features requested by other Garbaholics'); h.id = 'ideaWallT';
    wall.append(h, list, status);
    wall.hidden = !LIST_CSV;
    body.append(wall);
    renderList(list, status);

    // Tally tells the page when the form resizes and when someone sends it; a new request shows up after the sheet updates
    window.addEventListener('message', function (e) {
      if (!/(^|\.)tally\.so$/.test(new URL(e.origin || 'https://x.invalid').hostname)) return;
      var data = e.data;
      try { if (typeof data === 'string') data = JSON.parse(data); } catch (err) { return; }
      if (!data || typeof data !== 'object') return;
      var ev = String(data.event || '');
      var height = data.payload && data.payload.height || data.height;
      if (/resize|height/i.test(ev) && height > 120) frame.style.height = Math.min(900, Math.ceil(height)) + 'px';
      if (/FormSubmitted/i.test(ev)) { setTimeout(function () { renderList(list, status); }, 5000); setTimeout(function () { renderList(list, status); }, 20000); }
    });
  }

  // Older pages call send(); it now opens the form
  function send() { window.open(FORM_URL, '_blank', 'noopener'); return Promise.resolve({ how: 'tally', url: FORM_URL }); }

  window.GarboIdeas = { send: send, mount: mount, parseCsv: parseCsv, requests: requests };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
})();
