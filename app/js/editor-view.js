'use strict';
/* ============================================================
   Editor view: gutter (line numbers + folding), current line,
   breadcrumbs, structure outline, focus & typewriter modes,
   find / replace
   ============================================================ */
const GUTTER_ROW = 18;
const Gutter = {
  lines: [],
  schedule: null,
  lineHeightOf(el) {
    const cs = getComputedStyle(el); let lh = cs.lineHeight;
    if (lh.endsWith('px')) return parseFloat(lh);
    const fs = parseFloat(cs.fontSize) || 15; return lh === 'normal' ? fs * 1.3 : parseFloat(lh) * fs;
  },
  collect() {
    const out = []; const ed = Editor.el; if (!ed) return out;
    const pageTop = $('#edPage').getBoundingClientRect().top;
    const sr = $('#edScroll').getBoundingClientRect();
    const minY = sr.top - 600, maxY = sr.bottom + 600;
    const edLH = this.lineHeightOf(ed);
    const cache = {};
    const lhOf = el => { const k = el.tagName; return cache[k] || (cache[k] = this.lineHeightOf(el)); };
    const preM = {};
    const at = (el, extra = 0, lh = edLH) => { const r = el.getBoundingClientRect(); return r.top - pageTop + extra + (lh - GUTTER_ROW) / 2; };
    const wrap = document.body.classList.contains('wrap-code');
    for (const b of ed.children) {
      if (b.classList.contains('fold-hidden') || b.classList.contains('co-head')) continue;
      const t = b.tagName;
      const br = b.getBoundingClientRect();
      const visible = br.bottom >= minY && br.top <= maxY;
      if (t === 'UL' || t === 'OL') { b.querySelectorAll('li').forEach(li => out.push({ y: visible ? at(li) : null, el: li, block: b })); continue; }
      if (t === 'BLOCKQUOTE') { for (const c of b.children) { if (c.classList.contains('co-head')) continue; if (c.tagName === 'UL' || c.tagName === 'OL') c.querySelectorAll('li').forEach(li => out.push({ y: visible ? at(li) : null, el: li, block: b })); else out.push({ y: visible ? at(c) : null, el: c, block: b }); } continue; }
      if (t === 'TABLE') { let pt = 0, lh = edLH; if (visible) { const c0 = b.querySelector('td, th'); if (c0) { pt = parseFloat(getComputedStyle(c0).paddingTop) || 0; lh = this.lineHeightOf(c0); } } b.querySelectorAll('tr').forEach(tr => out.push({ y: visible ? at(tr, pt, lh) : null, el: tr, block: b })); continue; }
      if (t === 'PRE') {
        if (!preM.lh && visible) { const cs = getComputedStyle(b); preM.lh = this.lineHeightOf(b); preM.pt = parseFloat(cs.paddingTop) + parseFloat(cs.borderTopWidth); }
        const lh = preM.lh || 21, pt = preM.pt || 13;
        if (wrap) { out.push({ y: visible ? br.top - pageTop + pt + (lh - GUTTER_ROW) / 2 : null, el: b, block: b, pre: 0 }); continue; }
        const n = Math.max(1, preCode(b).textContent.replace(/\n$/, '').split('\n').length);
        for (let i = 0; i < n; i++) out.push({ y: visible ? br.top - pageTop + pt + i * lh + (lh - GUTTER_ROW) / 2 : null, el: b, block: b, pre: i, lh, pt });
        continue;
      }
      if (t === 'HR') { out.push({ y: visible ? br.top - pageTop + br.height / 2 - GUTTER_ROW / 2 : null, el: b, block: b }); continue; }
      if (t === 'FIGURE' || b.classList.contains('math-block')) { out.push({ y: visible ? br.top - pageTop + (Math.min(br.height, edLH) - GUTTER_ROW) / 2 : null, el: b, block: b }); continue; }
      const hd = /^H[1-3]$/.test(t);
      const lh = hd ? lhOf(b) : edLH;
      out.push({ y: visible ? br.top - pageTop + (lh - GUTTER_ROW) / 2 : null, el: b, block: b, heading: hd ? b : null });
    }
    return out;
  },
  render() {
    const g = $('#gutter'); if (!g) return;
    if (!Editor.el) { g.innerHTML = ''; $('#curline').style.display = 'none'; return; }
    this.lines = this.collect();
    let html = '';
    this.lines.forEach((ln, i) => {
      if (ln.y == null) return;
      html += `<div class="ln" data-i="${i}" style="top:${ln.y.toFixed(1)}px">${i + 1}</div>`;
      if (ln.heading) html += `<div class="fold${ln.heading.dataset.folded ? ' on' : ''}" data-i="${i}" style="top:${ln.y.toFixed(1)}px" title="${ln.heading.dataset.folded ? 'Expand section' : 'Collapse section'}">${icon(ln.heading.dataset.folded ? 'chevronRight' : 'chevronDown')}</div>`;
    });
    g.innerHTML = html;
    g.style.height = $('#edPage').scrollHeight + 'px';
    this.curLine();
  },
  currentIndex() {
    const s = getSel(); if (!s.rangeCount || !inEditor(s.anchorNode)) return -1;
    const a = s.anchorNode;
    const pre = closestIn(a, 'pre');
    if (pre) {
      const lineNo = textBefore(preCode(pre)).split('\n').length - 1;
      return this.lines.findIndex(l => l.el === pre && (l.pre === lineNo || (l.pre === 0 && document.body.classList.contains('wrap-code'))));
    }
    const li = closestIn(a, 'li'); if (li) return this.lines.findIndex(l => l.el === li);
    const tr = closestIn(a, 'tr'); if (tr) return this.lines.findIndex(l => l.el === tr);
    const bqc = closestIn(a, 'blockquote > *'); if (bqc) return this.lines.findIndex(l => l.el === bqc);
    const b = topBlock(a); return this.lines.findIndex(l => l.el === b);
  },
  curLine() {
    const cl = $('#curline'); const g = $('#gutter');
    const i = (Editor.el && document.activeElement === Editor.el) ? this.currentIndex() : -1;
    g.querySelectorAll('.ln.cur').forEach(x => x.classList.remove('cur'));
    if (i < 0) { cl.style.display = 'none'; return; }
    const ln = this.lines[i]; if (!ln) { cl.style.display = 'none'; return; }
    const lnEl = g.querySelector(`.ln[data-i="${i}"]`); if (lnEl) lnEl.classList.add('cur');
    const pageTop = $('#edPage').getBoundingClientRect().top;
    let top, hgt;
    if (ln.pre != null && ln.lh) { const r = ln.el.getBoundingClientRect(); top = r.top - pageTop + ln.pt + ln.pre * ln.lh; hgt = ln.lh; }
    else { const r = ln.el.getBoundingClientRect(); top = r.top - pageTop; hgt = r.height; if (ln.el.tagName === 'LI') { const sub = ln.el.querySelector('ul,ol'); if (sub) hgt = sub.getBoundingClientRect().top - r.top; } }
    cl.style.top = top + 'px'; cl.style.height = Math.max(hgt, 16) + 'px'; cl.style.display = 'block';
  },
};
Gutter.schedule = (() => {
  let last = 0, t = null, queued = false;
  const run = () => { queued = false; t = null; last = performance.now(); Gutter.render(); };
  return () => {
    if (queued) return; queued = true;
    const wait = Math.max(0, (Editor.el && Editor.el.children.length > 150 ? 140 : 0) - (performance.now() - last));
    if (wait) t = setTimeout(() => requestAnimationFrame(run), wait); else requestAnimationFrame(run);
  };
})();

/* ---------------- breadcrumbs (bottom of editor) ---------------- */
const Crumbs = {
  update() {
    const el = $('#crumbs'); if (!el) return;
    const n = S.notes[Editor.noteId];
    if (!n || !Editor.el) { el.innerHTML = ''; return; }
    const b = topBlock(anchor());
    const path = [];
    if (b) {
      let need = /^H([1-3])$/.test(b.tagName) ? +b.tagName[1] : 4;
      if (need < 4) path.unshift(b);
      let p = b.previousElementSibling;
      while (p && need > 1) { const m = /^H([1-3])$/.exec(p.tagName); if (m && +m[1] < need) { path.unshift(p); need = +m[1]; } p = p.previousElementSibling; }
    }
    el.innerHTML = `<span class="cr" data-top="1">${icon('noteMd', 'c-blue')}${esc(n.title || 'Untitled')}</span>` + path.map((hd, i) => `<span class="cr-sep">${icon('chevronRight')}</span><span class="cr" data-h="${i}"><span class="cr-h">H${hd.tagName[1]}</span>${esc(hd.textContent.trim() || '…')}</span>`).join('');
    el._path = path;
  },
};

/* ---------------- structure outline ---------------- */
const Outline = {
  schedule: null,
  refresh() { Panels.refresh('structure'); Crumbs.update(); },
  headings() { return Editor.el ? [...Editor.el.querySelectorAll(':scope > h1, :scope > h2, :scope > h3')] : []; },
  highlight() {
    const list = $('#tw-structure .tw-list'); if (!list || !Editor.el) { Crumbs.update(); return; }
    const b = topBlock(anchor()); let hd = b && /^H[1-3]$/.test(b.tagName) ? b : (b ? sectionHeadingFor(b) : null);
    const hs = this.headings(); const i = hd ? hs.indexOf(hd) : -1;
    list.querySelectorAll('.row').forEach(r => r.classList.toggle('cur', +r.dataset.i === i));
    Crumbs.update();
  },
};
Outline.schedule = debounce(() => Outline.refresh(), 350);

/* ---------------- focus & typewriter ---------------- */
const FocusMode = {
  update() {
    if (!Editor.el) return;
    Editor.el.querySelectorAll(':scope > .is-cur').forEach(x => x.classList.remove('is-cur'));
    if (!SETTINGS.focusMode) return;
    const b = topBlock(anchor()); if (b && b.classList) b.classList.add('is-cur');
  },
};
const Typewriter = {
  center() {
    const sc = $('#edScroll'); const r = caretRect(); const sr = sc.getBoundingClientRect();
    const target = sr.top + sr.height * 0.42; const d = r.y - target;
    if (Math.abs(d) > 4) sc.scrollTop += d;
  },
};

/* ---------------- find / replace (IntelliJ-style bar) ---------------- */
const Find = {
  open: false, q: '', rep: '', opts: { cs: false, ww: false, re: false }, matches: [], idx: -1, replaceMode: false,
  show(replace) {
    if (!Editor.el) return;
    this.open = true; this.replaceMode = !!replace;
    const bar = $('#findbar'); bar.classList.add('show'); bar.classList.toggle('replace', this.replaceMode);
    const s = getSel(); const sel = s.rangeCount && inEditor(s.anchorNode) && !s.isCollapsed ? s.toString() : '';
    const inp = $('#findInput');
    if (sel && !sel.includes('\n') && sel.length < 200) inp.value = sel;
    inp.focus(); inp.select();
    this.run(true);
  },
  hide(focusEditor = true) {
    this.open = false; $('#findbar').classList.remove('show');
    if (window.CSS && CSS.highlights) { CSS.highlights.delete('ln-find'); CSS.highlights.delete('ln-find-cur'); }
    if (focusEditor && Editor.el) { const m = this.matches[this.idx]; Editor.el.focus({ preventScroll: true }); if (m) { const r = this.rangeFor(m); if (r) { getSel().removeAllRanges(); getSel().addRange(r); } } }
    this.matches = []; this.idx = -1;
  },
  onMount() { if (this.open) this.run(true); },
  textMap() {
    const segs = []; let text = '';
    const walk = (node) => {
      for (const c of node.childNodes) {
        if (c.nodeType === 3) { segs.push({ node: c, start: text.length, len: c.length }); text += c.textContent; }
        else if (c.nodeType === 1) {
          if (isAtomEl(c) || c.classList.contains('co-head')) { text += '￼'; continue; }
          if (c.tagName === 'BR') { text += '\n'; continue; }
          const blockish = /^(P|H1|H2|H3|LI|TR|TD|TH|BLOCKQUOTE|PRE|UL|OL|TABLE|DIV|FIGURE)$/.test(c.tagName);
          walk(c);
          if (blockish && !text.endsWith('\n')) text += '\n';
        }
      }
    };
    walk(Editor.el);
    return { segs, text };
  },
  buildRegex() {
    const { cs, ww, re } = this.opts; let src = this.q;
    if (!src) return null;
    if (!re) src = src.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (ww) src = '(?<![\\p{L}\\p{N}_])' + src + '(?![\\p{L}\\p{N}_])';
    try { return new RegExp(src, 'gu' + (cs ? '' : 'i')); } catch (e) { return 'error'; }
  },
  run(keepIdx) {
    if (!this.open || !Editor.el) return;
    this.q = $('#findInput').value;
    const rx = this.buildRegex();
    $('#findInput').classList.toggle('bad', rx === 'error');
    this.matches = [];
    if (rx && rx !== 'error') {
      const { segs, text } = this.textMap(); this.map = segs;
      let m; let guard = 0;
      while ((m = rx.exec(text)) && guard++ < 5000) { if (!m[0].length) { rx.lastIndex++; continue; } if (m[0].includes('￼')) continue; this.matches.push({ s: m.index, e: m.index + m[0].length, groups: m }); }
    }
    if (!keepIdx || this.idx >= this.matches.length) this.idx = this.matches.length ? 0 : -1;
    if (keepIdx && this.idx < 0 && this.matches.length) {
      // pick the first match after the caret
      this.idx = 0;
    }
    this.paint();
  },
  rangeFor(m) {
    const segs = this.map || []; let a = null, b = null;
    for (const sg of segs) {
      if (!sg.len) continue;
      if (!a && m.s >= sg.start && m.s < sg.start + sg.len) a = [sg.node, m.s - sg.start];
      if (a && m.e > sg.start && m.e <= sg.start + sg.len) { b = [sg.node, m.e - sg.start]; break; }
    }
    if (!a || !b || !a[0].isConnected || !b[0].isConnected) return null;
    const r = document.createRange(); try { r.setStart(a[0], a[1]); r.setEnd(b[0], b[1]); } catch (e) { return null; }
    return r;
  },
  paint() {
    const cnt = $('#findCount');
    cnt.textContent = this.q ? (this.matches.length ? `${this.idx + 1}/${this.matches.length}` : '0 results') : '';
    cnt.classList.toggle('none', !!this.q && !this.matches.length);
    if (!(window.CSS && CSS.highlights && window.Highlight)) return;
    const all = []; let cur = null;
    this.matches.forEach((m, i) => { const r = this.rangeFor(m); if (!r) return; if (i === this.idx) cur = r; else all.push(r); });
    CSS.highlights.set('ln-find', new Highlight(...all));
    if (cur) CSS.highlights.set('ln-find-cur', new Highlight(cur)); else CSS.highlights.delete('ln-find-cur');
    if (cur) this.scrollTo(cur);
    Scrollmarks.render(this.matches.map(m => this.rangeFor(m)).filter(Boolean));
  },
  scrollTo(r) {
    const n = r.startContainer.parentElement; const b = n && topBlock(n);
    if (b && b.classList.contains('fold-hidden')) { unfoldFor(b); }
    const rect = r.getBoundingClientRect(); const sc = $('#edScroll'); const sr = sc.getBoundingClientRect();
    if (rect.top < sr.top + 40 || rect.bottom > sr.bottom - 40) sc.scrollTop += rect.top - sr.top - sr.height / 3;
  },
  next(d = 1) { if (!this.matches.length) { this.run(); if (!this.matches.length) return; } this.idx = (this.idx + d + this.matches.length) % this.matches.length; this.paint(); },
  replacement(m) {
    const rep = $('#replaceInput').value;
    if (!this.opts.re) return rep;
    return rep.replace(/\$(\d)/g, (_, k) => m.groups[+k] || '').replace(/\\n/g, '\n').replace(/\\t/g, '\t');
  },
  replaceOne() {
    const m = this.matches[this.idx]; if (!m) return;
    Hist.record('op');
    const r = this.rangeFor(m); if (!r) return;
    r.deleteContents(); r.insertNode(document.createTextNode(this.replacement(m)));
    Editor.el.normalize(); Editor.changed(); this.run(true);
  },
  replaceAll() {
    if (!this.matches.length) return;
    Hist.record('op');
    const n = this.matches.length;
    for (let i = this.matches.length - 1; i >= 0; i--) { const m = this.matches[i]; const r = this.rangeFor(m); if (!r) continue; r.deleteContents(); r.insertNode(document.createTextNode(this.replacement(m))); }
    Editor.el.normalize(); Editor.changed(); this.run(); App.status(`Replaced ${n} occurrence${n > 1 ? 's' : ''}`);
  },
  /** Used by Find in Files: open note, select the k-th match of q. */
  reveal(q, opts, k) {
    $('#findInput').value = q; this.opts = { ...opts }; this.syncToggles();
    this.show(false); this.run();
    if (this.matches[k]) { this.idx = k; this.paint(); }
  },
  syncToggles() { $$('#findbar [data-opt]').forEach(b => b.classList.toggle('on', !!this.opts[b.dataset.opt])); },
  init() {
    const inp = $('#findInput'), rep = $('#replaceInput');
    inp.addEventListener('input', debounce(() => this.run(), 80));
    inp.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); this.next(e.shiftKey ? -1 : 1); }
      else if (e.key === 'Escape') { e.preventDefault(); this.hide(); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); this.next(1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); this.next(-1); }
    });
    rep.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); if (e.ctrlKey || e.metaKey || e.altKey) this.replaceAll(); else this.replaceOne(); }
      else if (e.key === 'Escape') { e.preventDefault(); this.hide(); }
    });
    $('#findbar').addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.opt) { this.opts[b.dataset.opt] = !this.opts[b.dataset.opt]; this.syncToggles(); this.run(); inp.focus(); }
      else if (b.dataset.act === 'prev') this.next(-1);
      else if (b.dataset.act === 'next') this.next(1);
      else if (b.dataset.act === 'close') this.hide();
      else if (b.dataset.act === 'replace') this.replaceOne();
      else if (b.dataset.act === 'replaceAll') this.replaceAll();
      else if (b.dataset.act === 'toggleReplace') { this.replaceMode = !this.replaceMode; $('#findbar').classList.toggle('replace', this.replaceMode); (this.replaceMode ? rep : inp).focus(); }
    });
    this.syncToggles();
  },
};
const findRerun = debounce(() => { if (Find.open) Find.run(true); }, 250);

/* ---------------- scrollbar marks (search results / headings) ---------------- */
const Scrollmarks = {
  render(ranges) {
    const el = $('#scrollmarks'); if (!el) return;
    const sc = $('#edScroll'); const total = sc.scrollHeight; if (!total) return;
    const top = sc.getBoundingClientRect().top - sc.scrollTop;
    el.innerHTML = (ranges || []).slice(0, 400).map(r => { const y = (r.getBoundingClientRect().top - top) / total * 100; return `<i style="top:${y.toFixed(2)}%"></i>`; }).join('');
  },
  clear() { const el = $('#scrollmarks'); if (el) el.innerHTML = ''; },
};
