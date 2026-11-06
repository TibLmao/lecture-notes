'use strict';
/* ============================================================
   Search Everywhere, Find Action, Recent Notes, Note Structure,
   Ctrl+Tab switcher
   ============================================================ */
const Popups = {
  stack: [],
  push(p) { this.stack.push(p); },
  remove(p) { this.stack = this.stack.filter(x => x !== p); },
  get top() { return this.stack[this.stack.length - 1] || null; },
  handleKey(e) { const p = this.top; return p ? !!p.handleKey(e) : false; },
  closeAll() { [...this.stack].forEach(p => p.close()); },
};
document.addEventListener('mousedown', e => { const p = Popups.top; if (p && p.el && !p.el.contains(e.target) && !e.target.closest('.menu')) p.close(); }, true);

/* ---------------- Search Everywhere ---------------- */
const SE_TABS = [['all', 'All'], ['notes', 'Notes'], ['headings', 'Headings'], ['text', 'Text'], ['actions', 'Actions']];
const SearchEverywhere = {
  el: null, tab: 'all', items: [], idx: 0, open: false,
  show(tab = 'all') {
    if (this.open) { this.setTab(tab); this.input.select(); return; }
    Menu.closeAll(); Editor.flush();
    this.tab = tab; this.open = true;
    const input = h('input.se-input', { placeholder: 'Type / to see commands', spellcheck: 'false', autocomplete: 'off' });
    this.input = input;
    const tabs = h('div.se-tabs', SE_TABS.map(([id, l]) => h('button.se-tab' + (id === tab ? '.on' : ''), { 'data-tab': id, onclick: () => { this.setTab(id); input.focus(); } }, l)), h('span.se-hint', 'Tab to switch'));
    const list = h('div.se-list');
    const foot = h('div.se-foot');
    this.el = h('div.se', tabs, h('div.se-field', { html: icon('search') }, input), list, foot);
    this.list = list; this.foot = foot;
    document.body.appendChild(this.el);
    requestAnimationFrame(() => this.el.classList.add('show'));
    input.addEventListener('input', () => { this.idx = 0; this.update(); });
    list.addEventListener('mousemove', e => { const r = e.target.closest('.se-row'); if (r && +r.dataset.i !== this.idx) { this.idx = +r.dataset.i; this.paint(); } });
    list.addEventListener('mousedown', e => { const r = e.target.closest('.se-row'); if (r) { e.preventDefault(); this.idx = +r.dataset.i; this.pick(); } });
    Popups.push(this);
    input.focus();
    this.update();
  },
  setTab(t) { this.tab = t; this.idx = 0; this.el.querySelectorAll('.se-tab').forEach(b => b.classList.toggle('on', b.dataset.tab === t)); this.update(); },
  close() { if (!this.open) return; this.open = false; Popups.remove(this); const el = this.el; el.classList.remove('show'); setTimeout(() => el.remove(), 100); if (Editor.el && S.active) Editor.el.focus({ preventScroll: true }); },
  handleKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); this.close(); return true; }
    if (e.key === 'ArrowDown') { e.preventDefault(); this.move(1); return true; }
    if (e.key === 'ArrowUp') { e.preventDefault(); this.move(-1); return true; }
    if (e.key === 'PageDown') { e.preventDefault(); this.move(8); return true; }
    if (e.key === 'PageUp') { e.preventDefault(); this.move(-8); return true; }
    if (e.key === 'Enter') { e.preventDefault(); this.pick(); return true; }
    if (e.key === 'Tab') { e.preventDefault(); const i = SE_TABS.findIndex(t => t[0] === this.tab); this.setTab(SE_TABS[(i + (e.shiftKey ? -1 : 1) + SE_TABS.length) % SE_TABS.length][0]); return true; }
    return false;
  },
  move(d) { const sel = this.items.filter(x => !x.header); if (!sel.length) return; const pos = sel.indexOf(this.items[this.idx]); const np = clamp(pos + d, 0, sel.length - 1); this.idx = this.items.indexOf(sel[np]); this.paint(); },
  pick() { const it = this.items[this.idx]; if (!it || it.header) return; this.close(); setTimeout(() => it.run(), 0); },
  sources(q) {
    const out = {};
    const qq = q.trim();
    // notes
    if (!qq) out.notes = S.recent.map(id => S.notes[id]).filter(Boolean).slice(0, 12).map(n => this.noteItem(n, []));
    else out.notes = Object.values(S.notes).map(n => { const m = fuzzy(qq, n.title || ''); const p = m ? null : fuzzy(qq, notePathLabel(n) + ' ' + (n.title || '')); return m && m.score > -6 ? { n, score: m.score + (n.starred ? 3 : 0), idx: m.idx } : p && p.score > -4 ? { n, score: p.score - 30, idx: [] } : null; }).filter(Boolean).sort((a, b) => b.score - a.score).slice(0, 40).map(x => this.noteItem(x.n, x.idx));
    // headings
    if (qq) {
      const hs = [];
      for (const n of Object.values(S.notes)) noteIndex(n).headings.forEach(hd => { const m = fuzzy(qq, hd.text); if (m && m.score > -6) hs.push({ n, hd, score: m.score - hd.level, idx: m.idx }); });
      out.headings = hs.sort((a, b) => b.score - a.score).slice(0, 40).map(x => ({ icon: 'heading', html: `<span class="hbadge h${x.hd.level}">H${x.hd.level}</span>${markIdx(x.hd.text, x.idx)}`, right: esc(x.n.title), run: () => { App.open(x.n.id); setTimeout(() => { const el = Editor.el && Editor.el.querySelectorAll(':scope > h1, :scope > h2, :scope > h3')[x.hd.i]; if (el) revealBlock(el); }, 30); } }));
    } else out.headings = [];
    // text
    if (qq.length >= 2) {
      const lq = qq.toLowerCase(); const tx = [];
      for (const n of Object.values(S.notes)) {
        const ix = noteIndex(n); if (!ix.text.includes(lq)) continue;
        let k = 0;
        ix.lines.forEach(line => { let p = line.toLowerCase().indexOf(lq); while (p >= 0) { if (tx.length < 80) tx.push({ n, line, p, k }); k++; p = line.toLowerCase().indexOf(lq, p + lq.length); } });
      }
      out.text = tx.slice(0, 60).map(x => { const a = Math.max(0, x.p - 30); return { icon: 'reformat', html: esc((a ? '…' : '') + x.line.slice(a, x.p)) + '<b class="fz">' + esc(x.line.slice(x.p, x.p + qq.length)) + '</b>' + esc(x.line.slice(x.p + qq.length, x.p + qq.length + 70)), right: esc(x.n.title), run: () => { App.open(x.n.id); setTimeout(() => Find.reveal(qq, { cs: false, ww: false, re: false }, x.k), 30); } }; });
    } else out.text = [];
    // actions (+ settings pages, themes)
    const acts = [];
    const pool = Actions.list.filter(a => !(a.enabled && !a.enabled()) || qq);
    for (const a of pool) {
      if (a.hidden && !qq) continue;
      const m = qq ? (fuzzy(qq, a.name) || (a.keywords && fuzzy(qq, a.keywords) ? { score: -10, idx: [] } : null) || fuzzy(qq, a.group + ' ' + a.name)) : { score: 0, idx: [] };
      if (!m || (qq && m.score < -6)) continue;
      const disabled = a.enabled && !a.enabled();
      acts.push({ score: m.score - (disabled ? 30 : 0), item: { icon: a.icon || 'dot', html: markIdx(a.name, a.idx || m.idx) + `<span class="se-grp">${esc(a.group)}</span>`, right: a.toggle ? `<span class="switch sm${a.toggle() ? ' on' : ''}"></span>` : esc(fmtCombo(Keymap.first(a.id))), disabled, run: () => Actions.run(a.id) } });
    }
    if (qq) {
      for (const t of THEMES) { const m = fuzzy(qq, 'Theme: ' + t.name) || fuzzy(qq, t.name); if (m) acts.push({ score: m.score - 2, item: { icon: 'palette', html: 'Theme: ' + esc(t.name) + '<span class="se-grp">Appearance</span>', right: SETTINGS.theme === t.id ? icon('check') : `<span class="swatch" style="background:${t.ui.editor};border-color:${t.ed.h1}"></span>`, run: () => setSetting('theme', t.id) } }); }
      for (const pg of SETTINGS_PAGES) { const m = fuzzy(qq, pg.title) || fuzzy(qq, (pg.keywords || '')); if (m) acts.push({ score: m.score - 4, item: { icon: 'settings', html: 'Settings › ' + esc(pg.path) + '<span class="se-grp">Settings</span>', right: '', run: () => SettingsUI.show(pg.id) } }); }
    }
    acts.sort((a, b) => b.score - a.score);
    out.actions = acts.slice(0, qq ? 40 : 60).map(x => x.item);
    return out;
  },
  noteItem(n, idx) { return { icon: 'noteMd', iconCls: 'c-blue', html: markIdx(n.title || 'Untitled', idx) + (n.starred ? icon('starFill', 'c-yellow sm') : ''), right: esc(notePathLabel(n)), run: () => App.open(n.id) }; },
  update() {
    let q = this.input.value;
    if (q.startsWith('/') && this.tab === 'all') { q = q.slice(1); }
    const src = this.sources(q);
    const items = [];
    if (this.tab === 'all' || this.input.value.startsWith('/')) {
      const sec = (title, arr, n) => { if (!arr.length) return; items.push({ header: title }); items.push(...arr.slice(0, n)); };
      if (this.input.value.startsWith('/')) sec('Actions', src.actions, 40);
      else { sec(q.trim() ? 'Notes' : 'Recent Notes', src.notes, q.trim() ? 6 : 10); sec('Headings', src.headings, 4); sec('Actions', src.actions, q.trim() ? 5 : 0); sec('Text', src.text, 4); }
    } else items.push(...(src[this.tab] || []));
    this.items = items;
    if (this.items[this.idx] && this.items[this.idx].header) this.idx++;
    if (this.idx >= this.items.length) this.idx = this.items.findIndex(x => !x.header);
    if (this.idx < 0) this.idx = 0;
    this.list.innerHTML = items.length ? items.map((it, i) => it.header ? `<div class="se-sec">${esc(it.header)}</div>` : `<div class="se-row${i === this.idx ? ' hl' : ''}${it.disabled ? ' disabled' : ''}" data-i="${i}"><span class="se-ic">${icon(it.icon, it.iconCls)}</span><span class="se-l">${it.html}</span><span class="se-r">${it.right || ''}</span></div>`).join('')
      : `<div class="se-empty">${q.trim() ? 'Nothing found' : this.tab === 'text' ? 'Type at least 2 characters' : 'Start typing to search'}</div>`;
    const tips = { all: 'Notes, headings, actions and text in one place', notes: 'Fuzzy search: “ds lec3” finds “Data Structures / Lecture 3”', headings: 'Jump to any heading in any note', text: 'Full-text search across every note', actions: 'Every command, setting and theme' };
    this.foot.innerHTML = `<span>${esc(tips[this.tab])}</span><span class="se-keys">${esc(fmtCombo(Keymap.first('findInFiles')))} Find in Notes</span>`;
    this.paint();
  },
  paint() { this.list.querySelectorAll('.se-row').forEach(r => r.classList.toggle('hl', +r.dataset.i === this.idx)); const c = this.list.querySelector('.se-row.hl'); if (c) c.scrollIntoView({ block: 'nearest' }); },
};

/* ---------------- generic filterable popup ---------------- */
function FilterPopup({ title, items, render, onPick, width = 520, placeholder = 'Type to filter', left, emptyText = 'Nothing here' }) {
  const input = h('input.fp-input', { placeholder, spellcheck: 'false' });
  const list = h('div.fp-list');
  const el = h('div.fp', { style: { width: width + 'px' } }, h('div.fp-h', h('span', title), input), h('div.fp-body', left || null, list));
  document.body.appendChild(el);
  const api = {
    el, idx: 0, shown: [],
    update() {
      const q = input.value.trim();
      this.shown = q ? items.map(it => { const m = fuzzy(q, it.label); return m ? { it, m } : null; }).filter(Boolean).sort((a, b) => b.m.score - a.m.score).map(x => ({ ...x.it, _idx: x.m.idx })) : items;
      this.idx = clamp(this.idx, 0, Math.max(0, this.shown.length - 1));
      list.innerHTML = this.shown.length ? this.shown.map((it, i) => `<div class="fp-row${i === this.idx ? ' hl' : ''}" data-i="${i}">${render(it, it._idx)}</div>`).join('') : `<div class="se-empty">${esc(emptyText)}</div>`;
    },
    paint() { list.querySelectorAll('.fp-row').forEach(r => r.classList.toggle('hl', +r.dataset.i === this.idx)); const c = list.querySelector('.fp-row.hl'); if (c) c.scrollIntoView({ block: 'nearest' }); },
    pick() { const it = this.shown[this.idx]; if (!it) return; this.close(); setTimeout(() => onPick(it), 0); },
    close() { Popups.remove(this); el.remove(); if (Editor.el) Editor.el.focus({ preventScroll: true }); },
    handleKey(e) {
      if (e.key === 'Escape') { e.preventDefault(); this.close(); return true; }
      if (e.key === 'ArrowDown') { e.preventDefault(); this.idx = Math.min(this.idx + 1, this.shown.length - 1); this.paint(); return true; }
      if (e.key === 'ArrowUp') { e.preventDefault(); this.idx = Math.max(this.idx - 1, 0); this.paint(); return true; }
      if (e.key === 'Enter') { e.preventDefault(); this.pick(); return true; }
      return false;
    },
  };
  input.addEventListener('input', () => { api.idx = 0; api.update(); });
  list.addEventListener('mousedown', e => { const r = e.target.closest('.fp-row'); if (r) { e.preventDefault(); api.idx = +r.dataset.i; api.pick(); } });
  list.addEventListener('mousemove', e => { const r = e.target.closest('.fp-row'); if (r && +r.dataset.i !== api.idx) { api.idx = +r.dataset.i; api.paint(); } });
  Popups.push(api); api.update(); input.focus();
  requestAnimationFrame(() => el.classList.add('show'));
  return api;
}
const RecentPopup = {
  show() {
    Editor.flush();
    const ids = S.recent.filter(id => S.notes[id]);
    const items = ids.map(id => ({ label: S.notes[id].title || 'Untitled', n: S.notes[id] }));
    const left = h('div.fp-left', h('div.fp-sec', 'Tool Windows'), ...TOOL_WINDOWS.filter(t => ToolWindows.available(t)).map(t => h('button.fp-tw', { html: icon(t.icon) + esc(t.title) + `<span>${esc(fmtCombo(Keymap.first(t.action)))}</span>`, onclick: () => { p.close(); ToolWindows.open(t.id, true); } })));
    const p = FilterPopup({ title: 'Recent Notes', items, left, width: 640, emptyText: 'No recent notes', render: (it, idx) => `${icon('noteMd', 'c-blue')}<span class="fp-l">${markIdx(it.label, idx)}</span><span class="fp-r">${esc(notePathLabel(it.n))}</span>`, onPick: it => App.open(it.n.id) });
    // IntelliJ selects the previous file by default
    if (items.length > 1 && items[0].n.id === S.active) { p.idx = 1; p.paint(); }
  },
};
const StructurePopup = {
  show() {
    if (!Editor.el) return;
    const hs = Outline.headings();
    const items = hs.map((hd, i) => ({ label: hd.textContent.trim() || '…', level: +hd.tagName[1], i }));
    FilterPopup({ title: 'Structure of ' + ((S.notes[Editor.noteId] || {}).title || 'note'), items, width: 480, emptyText: 'No headings in this note', render: (it, idx) => `<span style="width:${(it.level - 1) * 14}px;flex:none"></span><span class="hbadge h${it.level}">H${it.level}</span><span class="fp-l">${markIdx(it.label, idx)}</span>`, onPick: it => { const hd = Outline.headings()[it.i]; if (hd) revealBlock(hd); } });
  },
};
const Switcher = {
  open: false, el: null, list: [], idx: 0,
  step(d) {
    if (!this.open) {
      this.list = [...new Set([S.active, ...S.recent, ...S.tabs])].filter(id => id && S.notes[id]);
      if (!this.list.length) return;
      this.open = true; this.idx = this.list.length > 1 ? 1 : 0;
      this.el = h('div.switcher', h('div.sw-h', 'Switcher'), h('div.sw-list'));
      document.body.appendChild(this.el);
    } else this.idx = (this.idx + d + this.list.length) % this.list.length;
    this.render();
  },
  render() {
    this.el.querySelector('.sw-list').innerHTML = this.list.map((id, i) => `<div class="sw-row${i === this.idx ? ' hl' : ''}">${icon('noteMd', 'c-blue')}<span>${esc(S.notes[id].title || 'Untitled')}</span><em>${esc(notePathLabel(S.notes[id]))}</em></div>`).join('');
  },
  commit() { if (!this.open) return; this.open = false; const id = this.list[this.idx]; this.el.remove(); if (id) App.open(id); },
};
