'use strict';
/* ============================================================
   Tool windows: Project, Bookmarks, Find, TODO, Structure,
   Note Info, Notifications
   ============================================================ */
const TOOL_WINDOWS = [
  { id: 'project', title: 'Project', icon: 'folder', side: 'left', action: 'twProject' },
  { id: 'bookmarks', title: 'Bookmarks', icon: 'bookmark', side: 'left', action: 'twBookmarks' },
  { id: 'find', title: 'Find', icon: 'find', side: 'left', action: 'twFind' },
  { id: 'todo', title: 'TODO', icon: 'todo', side: 'left', action: 'twTodo', plugin: 'todo' },
  { id: 'structure', title: 'Structure', icon: 'structure', side: 'leftBottom', action: 'twStructure' },
  { id: 'info', title: 'Note Info', icon: 'info', side: 'right', action: 'twInfo' },
  { id: 'notifications', title: 'Notifications', icon: 'bell', side: 'right', action: 'twNotifications' },
];
const TW_BY_ID = Object.fromEntries(TOOL_WINDOWS.map(t => [t.id, t]));

const ToolWindows = {
  isOpen(id) { const t = TW_BY_ID[id]; return !!t && S.tw[t.side] === id; },
  available(t) { return !t.plugin || plugin(t.plugin); },
  open(id, focus) {
    const t = TW_BY_ID[id]; if (!t || !this.available(t)) return;
    S.tw[t.side] = id; saveSession(); this.render();
    if (focus) setTimeout(() => { const el = $('#tw-' + id); const f = el && (el.querySelector('.tw-focus') || el.querySelector('input') || el.querySelector('.tw-list')); if (f) f.focus(); }, 0);
  },
  toggle(id) {
    const t = TW_BY_ID[id]; if (!t) return;
    if (S.tw[t.side] === id) {
      // if open but not focused → focus it (IntelliJ behaviour), else hide
      const el = $('#tw-' + id); if (el && !el.contains(document.activeElement) && id !== 'notifications') { this.open(id, true); return; }
      S.tw[t.side] = null; saveSession(); this.render(); if (Editor.el) Editor.el.focus({ preventScroll: true });
    } else this.open(id, true);
  },
  hideAll() {
    const any = S.tw.left || S.tw.leftBottom || S.tw.right;
    if (any) { this._saved = { ...S.tw }; S.tw.left = S.tw.leftBottom = S.tw.right = null; }
    else if (this._saved) { S.tw = { ...S.tw, left: this._saved.left, leftBottom: this._saved.leftBottom, right: this._saved.right }; }
    saveSession(); this.render();
  },
  resetLayout() { S.tw = { left: 'project', leftBottom: null, right: null, leftW: 290, rightW: 310, split: 0.6 }; saveSession(); this.render(); },
  render() {
    // stripes
    const mk = (t) => {
      const on = this.isOpen(t.id);
      const badge = t.id === 'todo' ? Panels.todoCount() : t.id === 'notifications' ? Notify.log.filter(x => !x.read).length : 0;
      return `<button class="sb${on ? ' on' : ''}" data-tw="${t.id}" data-tip="${esc(t.title)}" data-tip-action="${t.action}">${icon(t.icon)}<span class="sb-n">${esc(t.title)}</span>${badge ? `<span class="badge">${badge > 99 ? '99+' : badge}</span>` : ''}</button>`;
    };
    const avail = TOOL_WINDOWS.filter(t => this.available(t));
    $('#stripeL').innerHTML = `<div class="sb-group">${avail.filter(t => t.side === 'left').map(mk).join('')}</div><div class="sb-group bottom">${avail.filter(t => t.side === 'leftBottom').map(mk).join('')}</div>`;
    $('#stripeR').innerHTML = `<div class="sb-group">${avail.filter(t => t.side === 'right').map(mk).join('')}</div>`;
    // panels
    const L = S.tw.left && this.available(TW_BY_ID[S.tw.left]) ? S.tw.left : null;
    const LB = S.tw.leftBottom;
    const R = S.tw.right;
    const left = $('#twLeft'), right = $('#twRight');
    left.style.display = (L || LB) ? 'flex' : 'none';
    $('#splitL').style.display = (L || LB) ? 'block' : 'none';
    right.style.display = R ? 'flex' : 'none';
    $('#splitR').style.display = R ? 'block' : 'none';
    left.style.width = S.tw.leftW + 'px'; right.style.width = S.tw.rightW + 'px';
    this.mount($('#twLeftTop'), L); this.mount($('#twLeftBottom'), LB); this.mount($('#twRightTop'), R);
    $('#twLeftTop').style.display = L ? 'flex' : 'none';
    $('#twLeftBottom').style.display = LB ? 'flex' : 'none';
    $('#splitLH').style.display = (L && LB) ? 'block' : 'none';
    if (L && LB) { $('#twLeftTop').style.flex = `${S.tw.split} 1 0`; $('#twLeftBottom').style.flex = `${1 - S.tw.split} 1 0`; }
    else { $('#twLeftTop').style.flex = '1 1 0'; $('#twLeftBottom').style.flex = '1 1 0'; }
    Gutter.schedule();
  },
  mount(slot, id) {
    if (!id) { slot.innerHTML = ''; slot.dataset.tw = ''; return; }
    if (slot.dataset.tw === id && slot.firstChild) { Panels.refresh(id); return; }
    slot.dataset.tw = id; slot.innerHTML = '';
    const t = TW_BY_ID[id];
    const el = h('div.tw#tw-' + id, h('div.tw-h', h('span.tw-t', t.title), h('span.tw-acts'), h('button.ibtn.sm', { html: icon('minus'), 'data-tip': 'Hide', onclick: () => this.toggle(id) })), h('div.tw-c'));
    slot.appendChild(el);
    Panels.build(id, el);
  },
  initResizers() {
    const drag = (handle, onMove) => handle.addEventListener('pointerdown', e => {
      e.preventDefault(); handle.classList.add('drag'); document.body.classList.add('resizing');
      const mv = ev => onMove(ev); const up = () => { handle.classList.remove('drag'); document.body.classList.remove('resizing'); removeEventListener('pointermove', mv); removeEventListener('pointerup', up); saveSession(); Gutter.schedule(); };
      addEventListener('pointermove', mv); addEventListener('pointerup', up);
    });
    drag($('#splitL'), ev => { const x = ev.clientX - $('#twLeft').getBoundingClientRect().left; S.tw.leftW = clamp(x, 180, innerWidth * 0.5); $('#twLeft').style.width = S.tw.leftW + 'px'; });
    drag($('#splitR'), ev => { const x = $('#twRight').getBoundingClientRect().right - ev.clientX; S.tw.rightW = clamp(x, 200, innerWidth * 0.45); $('#twRight').style.width = S.tw.rightW + 'px'; });
    drag($('#splitLH'), ev => { const r = $('#twLeft').getBoundingClientRect(); S.tw.split = clamp((ev.clientY - r.top) / r.height, 0.15, 0.85); $('#twLeftTop').style.flex = `${S.tw.split} 1 0`; $('#twLeftBottom').style.flex = `${1 - S.tw.split} 1 0`; });
    for (const id of ['stripeL', 'stripeR']) $('#' + id).addEventListener('click', e => { const b = e.target.closest('[data-tw]'); if (b) this.toggle(b.dataset.tw); });
  },
};

/* ======================= panels ======================= */
const Panels = {
  build(id, el) {
    const c = el.querySelector('.tw-c'), acts = el.querySelector('.tw-acts');
    const btn = (ic, tip, fn, action) => { const b = h('button.ibtn.sm', { html: icon(ic), 'data-tip': tip, 'data-tip-action': action || null, onclick: fn }); acts.appendChild(b); return b; };
    if (id === 'project') {
      btn('plus', 'New…', e => App.newPopup(e.currentTarget.getBoundingClientRect()), 'newPopup');
      btn('locate', 'Select Opened Note', () => this.locate(), 'selectInProject');
      btn('expandAll', 'Expand All', () => { S.folders.forEach(f => S.expanded[f.id] = true); saveSession(); this.refresh('project'); });
      btn('collapseAll', 'Collapse All', () => { S.expanded = {}; saveSession(); this.refresh('project'); });
      btn('more', 'Options', e => Menu.open(projectOptions(), { rect: e.currentTarget.getBoundingClientRect() }));
      const tree = h('div.tw-list.tree.tw-focus#projTree', { tabindex: '0' });
      c.appendChild(h('div.speed#speed')); c.appendChild(tree);
      initProjectTree(tree);
    } else if (id === 'bookmarks') {
      c.appendChild(h('div.tw-list.tw-focus', { tabindex: '0' }));
    } else if (id === 'find') {
      const q = h('input.field.find-q#fifQ', { placeholder: 'Search all notes', spellcheck: 'false' });
      const opts = h('div.fif-opts', ...[['cs', 'Cc', 'Match case'], ['ww', 'W', 'Words'], ['re', '.*', 'Regex']].map(([k, l, t]) => h('button.tgl' + (FIF.opts[k] ? '.on' : ''), { 'data-opt': k, 'data-tip': t }, l)));
      const scope = selectBox([['all', 'All notes'], ['folder', 'Current module']], FIF.scope, v => { FIF.scope = v; FIF.run(); });
      c.appendChild(h('div.fif-top', h('div.fif-row', h('span.fif-ic', { html: icon('search') }), q, opts), h('div.fif-row2', scope, h('span.fif-sum#fifSum'))));
      c.appendChild(h('div.tw-list.fif-res#fifRes', { tabindex: '0' }));
      q.value = FIF.q;
      q.addEventListener('input', debounce(() => { FIF.q = q.value; FIF.run(); }, 160));
      q.addEventListener('keydown', e => { if (e.key === 'Enter') { const f = $('#fifRes .row.hit'); if (f) f.click(); } if (e.key === 'Escape') { ToolWindows.toggle('find'); } });
      opts.addEventListener('click', e => { const b = e.target.closest('[data-opt]'); if (!b) return; FIF.opts[b.dataset.opt] = !FIF.opts[b.dataset.opt]; b.classList.toggle('on'); FIF.run(); });
      btn('refresh', 'Refresh', () => FIF.run());
    } else if (id === 'todo') {
      btn('filter', 'Current note only', e => { this.todoCurrent = !this.todoCurrent; e.currentTarget.classList.toggle('on', this.todoCurrent); this.refresh('todo'); });
      c.appendChild(h('div.tw-list', { tabindex: '0' }));
    } else if (id === 'structure') {
      btn('collapseAll', 'Collapse All Sections', () => foldAll(true), 'foldAll');
      btn('expandAll', 'Expand All Sections', () => foldAll(false), 'unfoldAll');
      c.appendChild(h('div.tw-list', { tabindex: '0' }));
    } else if (id === 'info') {
      c.appendChild(h('div.tw-list.info'));
    } else if (id === 'notifications') {
      btn('trash', 'Clear All', () => { Notify.log.length = 0; this.refresh('notifications'); ToolWindows.render(); });
      c.appendChild(h('div.tw-list'));
    }
    this.refresh(id);
  },
  refresh(id) {
    if (!ToolWindows.isOpen(id)) { if (id === 'todo') ToolWindows.renderBadgesSoon(); return; }
    const el = $('#tw-' + id); if (!el) return;
    const list = el.querySelector('.tw-list');
    if (id === 'project') renderProjectTree();
    else if (id === 'bookmarks') this.renderBookmarks(list);
    else if (id === 'find') FIF.render();
    else if (id === 'todo') this.renderTodo(list);
    else if (id === 'structure') this.renderStructure(list);
    else if (id === 'info') this.renderInfo(list);
    else if (id === 'notifications') this.renderNotifications(list);
  },
  refreshAll() { TOOL_WINDOWS.forEach(t => this.refresh(t.id)); },
  locate() {
    const n = S.notes[S.active]; if (!n) return;
    folderPath(n.folderId).forEach(f => S.expanded[f.id] = true);
    S.treeSel = 'n:' + n.id; ToolWindows.open('project'); saveSession(); renderProjectTree();
    const row = $(`#projTree .row[data-id="${n.id}"]`); if (row) { row.scrollIntoView({ block: 'center' }); $('#projTree').focus(); }
  },
  findInFiles() {
    ToolWindows.open('find', true);
    const s = getSel(); const t = s.rangeCount && inEditor(s.anchorNode) && !s.isCollapsed ? s.toString().trim() : '';
    setTimeout(() => { const q = $('#fifQ'); if (!q) return; if (t && !t.includes('\n')) { q.value = t; FIF.q = t; FIF.run(); } q.focus(); q.select(); }, 20);
  },
  renderBookmarks(list) {
    const items = Object.values(S.notes).filter(n => n.starred).sort((a, b) => (a.title || '').localeCompare(b.title || ''));
    if (!items.length) { list.innerHTML = `<div class="tw-empty">${icon('bookmark', '', 28)}<p>No bookmarks yet.</p><p class="dim">Press ${esc(fmtCombo(Keymap.first('toggleBookmark')) || 'F11')} or right-click a note to bookmark it.</p></div>`; return; }
    list.innerHTML = items.map(n => `<div class="row${n.id === S.active ? ' active' : ''}" data-id="${n.id}" draggable="true"><span class="ti">${icon('starFill', 'c-yellow')}</span><span class="nm">${esc(n.title || 'Untitled')}</span><span class="meta">${esc(notePathLabel(n))}</span></div>`).join('');
    list.onclick = e => { const r = e.target.closest('.row'); if (r) App.open(r.dataset.id); };
    list.oncontextmenu = e => { const r = e.target.closest('.row'); if (!r) return; e.preventDefault(); Menu.open([{ label: 'Open', icon: 'noteMd', run: () => App.open(r.dataset.id) }, { label: 'Remove Bookmark', icon: 'bookmark', run: () => toggleStar(r.dataset.id) }], { x: e.clientX, y: e.clientY }); };
    list.ondragstart = e => { const r = e.target.closest('.row'); if (r) { e.dataTransfer.setData('application/x-ln-note', r.dataset.id); e.dataTransfer.effectAllowed = 'copyMove'; } };
  },
  todoCurrent: false,
  todoCount() { if (!plugin('todo')) return 0; let c = 0; for (const n of Object.values(S.notes)) c += noteIndex(n).todos.filter(t => !t.done).length; return c; },
  renderTodo(list) {
    let notes = Object.values(S.notes);
    if (this.todoCurrent) notes = notes.filter(n => n.id === S.active);
    const groups = notes.map(n => ({ n, items: noteIndex(n).todos.filter(t => !t.done) })).filter(g => g.items.length).sort((a, b) => (b.n.updated || 0) - (a.n.updated || 0));
    if (!groups.length) { list.innerHTML = `<div class="tw-empty">${icon('todo', '', 28)}<p>Nothing to do.</p><p class="dim">Type <code>[] </code> in a note to add a checkbox. Unchecked items show up here.</p></div>`; return; }
    const total = groups.reduce((s, g) => s + g.items.length, 0);
    list.innerHTML = `<div class="tw-sum">${total} item${total > 1 ? 's' : ''} in ${groups.length} note${groups.length > 1 ? 's' : ''}</div>` + groups.map(g => `<div class="row grp" data-id="${g.n.id}"><span class="chev">${icon('chevronDown')}</span><span class="ti">${icon('noteMd', 'c-blue')}</span><span class="nm">${esc(g.n.title || 'Untitled')}</span><span class="meta">${g.items.length}</span></div>` +
      g.items.map(t => `<div class="row todo" data-id="${g.n.id}" data-i="${t.i}" style="padding-left:34px"><span class="todo-box" data-check="1" title="Mark done"></span><span class="nm">${esc(t.text || '(empty)')}</span></div>`).join('')).join('');
    list.onclick = e => {
      const r = e.target.closest('.row'); if (!r) return;
      if (e.target.closest('[data-check]')) { completeTodo(r.dataset.id, +r.dataset.i); return; }
      App.open(r.dataset.id);
      if (r.dataset.i != null) setTimeout(() => { const li = Editor.el && Editor.el.querySelectorAll('ul.checklist li')[+r.dataset.i]; if (li) { const b = topBlock(li); if (b && b.classList.contains('fold-hidden')) unfoldFor(b); Editor.el.focus({ preventScroll: true }); caretEnd(li); li.scrollIntoView({ block: 'center' }); li.classList.add('flash'); setTimeout(() => li.classList.remove('flash'), 1100); } }, 30);
    };
  },
  renderStructure(list) {
    const hs = Outline.headings();
    if (!Editor.el) { list.innerHTML = `<div class="tw-empty"><p class="dim">No note open</p></div>`; return; }
    if (!hs.length) { list.innerHTML = `<div class="tw-empty">${icon('structure', '', 28)}<p>No headings yet.</p><p class="dim">Type <code># </code> at the start of a line to add one.</p></div>`; return; }
    list.innerHTML = hs.map((hd, i) => `<div class="row h${hd.tagName[1]}" data-i="${i}" style="padding-left:${8 + (+hd.tagName[1] - 1) * 16}px"><span class="ti hbadge h${hd.tagName[1]}">H${hd.tagName[1]}</span><span class="nm">${esc(hd.textContent.trim() || '…')}</span>${hd.dataset.folded ? `<span class="meta">${icon('moreH')}</span>` : ''}</div>`).join('');
    list.onclick = e => { const r = e.target.closest('.row'); if (!r) return; const hd = Outline.headings()[+r.dataset.i]; if (hd) revealBlock(hd); };
    Outline.highlight();
  },
  renderInfo(list) {
    const n = S.notes[S.active];
    if (!n) { list.innerHTML = `<div class="tw-empty"><p class="dim">No note open</p></div>`; return; }
    const ix = noteIndex(n);
    const back = backlinksTo(n.id);
    const out = [...ix.links].map(id => S.notes[id]).filter(Boolean);
    const mins = Math.max(1, Math.round(ix.words / 200));
    const prop = (k, v) => `<div class="prop"><span>${esc(k)}</span><b>${v}</b></div>`;
    list.innerHTML = `<div class="info-card"><div class="info-title">${icon('noteMd', 'c-blue')}<span>${esc(n.title || 'Untitled')}</span></div>
      ${prop('Module', esc(notePathLabel(n) || '—'))}${prop('Created', esc(fmtDateTime(n.created)))}${prop('Modified', esc(fmtDateTime(n.updated)))}
      ${prop('Words', ix.words.toLocaleString())}${prop('Characters', ix.chars.toLocaleString())}${prop('Reading time', mins + ' min')}${prop('Images', ix.images)}${prop('Open checkboxes', ix.todos.filter(t => !t.done).length)}
      ${n.duration ? prop('Lecture length', fmtDuration(n.duration, true)) : ''}</div>
      <div class="info-sec">${icon('backlink')} Backlinks <span class="cnt">${back.length}</span></div>
      ${back.length ? back.map(b => `<div class="row" data-id="${b.id}"><span class="ti">${icon('noteMd', 'c-blue')}</span><span class="nm">${esc(b.title)}</span><span class="meta">${esc(notePathLabel(b))}</span></div>`).join('') : `<div class="dim pad">No notes link here yet. Type <code>[[</code> in another note to link to this one.</div>`}
      <div class="info-sec">${icon('wikilink')} Links from this note <span class="cnt">${out.length}</span></div>
      ${out.length ? out.map(b => `<div class="row" data-id="${b.id}"><span class="ti">${icon('noteMd', 'c-blue')}</span><span class="nm">${esc(b.title)}</span><span class="meta">${esc(notePathLabel(b))}</span></div>`).join('') : `<div class="dim pad">None</div>`}`;
    list.onclick = e => { const r = e.target.closest('.row[data-id]'); if (r) App.open(r.dataset.id); };
  },
  renderNotifications(list) {
    Notify.log.forEach(x => x.read = true);
    if (!Notify.log.length) { list.innerHTML = `<div class="tw-empty">${icon('bell', '', 28)}<p>No notifications</p></div>`; return; }
    const ic = { info: ['info', 'c-blue'], warning: ['warning', 'c-orange'], error: ['error', 'c-red'], success: ['success', 'c-green'] };
    list.innerHTML = Notify.log.map(x => `<div class="nrow"><span class="ti">${icon(...(ic[x.type] || ic.info))}</span><div><div class="nt">${esc(x.title)}</div>${x.text ? `<div class="nx">${esc(x.text)}</div>` : ''}<div class="ntime">${esc(ago(x.time))}</div></div></div>`).join('');
    setTimeout(() => ToolWindows.render(), 0);
  },
};
ToolWindows.renderBadgesSoon = debounce(() => { const b = $('#stripeL [data-tw="todo"] .badge'); const c = Panels.todoCount(); const btn = $('#stripeL [data-tw="todo"]'); if (!btn) return; if (b) { if (c) b.textContent = c > 99 ? '99+' : c; else b.remove(); } else if (c) btn.appendChild(h('span.badge', String(c > 99 ? '99+' : c))); }, 400);

function completeTodo(noteId, i) {
  if (Editor.noteId === noteId && Editor.el) {
    const li = Editor.el.querySelectorAll('ul.checklist li')[i]; if (!li) return;
    Hist.record('op'); li.classList.add('done'); Editor.changed(); Editor.flush();
  } else {
    const n = S.notes[noteId]; if (!n) return;
    const t = document.createElement('template'); t.innerHTML = n.html;
    const li = t.content.querySelectorAll('ul.checklist li')[i]; if (!li) return;
    li.classList.add('done'); n.html = t.innerHTML; n.updated = Date.now(); Store.saveNote(n);
  }
  Panels.refresh('todo'); ToolWindows.renderBadgesSoon();
  App.status('Marked as done');
}

/* ---------------- Find in Files ---------------- */
const FIF = {
  q: '', opts: { cs: false, ww: false, re: false }, scope: 'all', results: [],
  run() {
    const q = this.q;
    this.results = [];
    if (q && q.length >= 1) {
      let src = this.opts.re ? q : q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (this.opts.ww) src = '(?<![\\p{L}\\p{N}_])' + src + '(?![\\p{L}\\p{N}_])';
      let rx; try { rx = new RegExp(src, 'gu' + (this.opts.cs ? '' : 'i')); } catch (e) { rx = null; }
      if (rx) {
        let notes = Object.values(S.notes);
        if (this.scope === 'folder') { const fid = defaultFolderId(); const ids = new Set(fid ? descendantFolderIds(fid) : []); notes = notes.filter(n => ids.has(n.folderId)); }
        if (Editor.noteId && Editor.dirty) Editor.flush();
        for (const n of notes) {
          const ix = noteIndex(n); const hits = []; let k = 0;
          ix.lines.forEach((line, li) => { rx.lastIndex = 0; let m; while ((m = rx.exec(line))) { if (!m[0].length) { rx.lastIndex++; continue; } hits.push({ line, li, s: m.index, e: m.index + m[0].length, k: k++ }); if (hits.length > 200) break; } });
          if ((n.title || '').match(rx)) hits.unshift({ title: true, line: n.title, s: (n.title.search(rx)), e: n.title.search(rx) + (n.title.match(rx) || [''])[0].length, k: -1 });
          if (hits.length) this.results.push({ n, hits });
        }
        this.results.sort((a, b) => b.hits.length - a.hits.length);
      }
    }
    this.render();
  },
  render() {
    const res = $('#fifRes'); if (!res) return;
    const sum = $('#fifSum');
    const total = this.results.reduce((s, r) => s + r.hits.length, 0);
    if (sum) sum.textContent = this.q ? `${total} match${total === 1 ? '' : 'es'} in ${this.results.length} note${this.results.length === 1 ? '' : 's'}` : '';
    if (!this.q) { res.innerHTML = `<div class="tw-empty">${icon('find', '', 28)}<p>Search every note</p><p class="dim">Matches are grouped by note. Click one to jump there.</p></div>`; return; }
    if (!this.results.length) { res.innerHTML = `<div class="tw-empty"><p class="dim">No matches</p></div>`; return; }
    const snip = (h0) => { const a = Math.max(0, h0.s - 40); const pre = (a > 0 ? '…' : '') + h0.line.slice(a, h0.s); return esc(pre) + `<mark>${esc(h0.line.slice(h0.s, h0.e))}</mark>` + esc(h0.line.slice(h0.e, h0.e + 80)); };
    res.innerHTML = this.results.map(r => `<div class="row grp" data-id="${r.n.id}"><span class="ti">${icon('noteMd', 'c-blue')}</span><span class="nm">${esc(r.n.title || 'Untitled')}</span><span class="meta">${r.hits.length} · ${esc(notePathLabel(r.n))}</span></div>` +
      r.hits.slice(0, 60).map(x => `<div class="row hit" data-id="${r.n.id}" data-k="${x.k}" style="padding-left:30px"><span class="ln-no">${x.title ? icon('noteMd') : x.li + 1}</span><span class="nm snip">${snip(x)}</span></div>`).join('')).join('');
    res.onclick = e => {
      const r = e.target.closest('.row'); if (!r) return;
      res.querySelectorAll('.row.sel').forEach(x => x.classList.remove('sel')); r.classList.add('sel');
      App.open(r.dataset.id);
      const k = +r.dataset.k;
      if (r.classList.contains('hit') && k >= 0) setTimeout(() => Find.reveal(this.q, this.opts, k), 30);
    };
  },
};

/* ---------------- Project tree ---------------- */
let treeRows = [];
function projectOptions() {
  const sortItem = (v, l) => ({ label: l, checked: SETTINGS.projectSort === v, run: () => { setSetting('projectSort', v); renderProjectTree(); } });
  return [
    { label: 'Sort By', icon: 'sort', sub: [sortItem('created', 'Date Created'), sortItem('name', 'Name'), sortItem('updated', 'Last Modified')] },
    { label: 'Show Dates', checked: SETTINGS.projectDates, run: () => { setSetting('projectDates', !SETTINGS.projectDates); renderProjectTree(); } },
    { label: 'Show Note Counts', checked: SETTINGS.projectCounts, run: () => { setSetting('projectCounts', !SETTINGS.projectCounts); renderProjectTree(); } },
    { label: 'Folders Always on Top', checked: SETTINGS.foldersFirst, run: () => { setSetting('foldersFirst', !SETTINGS.foldersFirst); renderProjectTree(); } },
    { label: 'Open Notes with Single Click', checked: SETTINGS.singleClickOpen, run: () => setSetting('singleClickOpen', !SETTINGS.singleClickOpen) },
  ];
}
function renderProjectTree() {
  const tree = $('#projTree'); if (!tree) return;
  if (tree.querySelector('input.rename')) { clearTimeout(renderProjectTree._t); renderProjectTree._t = setTimeout(renderProjectTree, 400); return; }
  const rows = []; treeRows = rows;
  const rootName = Store.info.name || 'lectures';
  rows.push({ k: 'root', id: 'root', depth: 0, name: rootName, open: true });
  const walk = (pid, depth) => {
    const fs = sortItems(childFolders(pid), 'f');
    const ns = pid ? sortItems(notesInFolder(pid), 'n') : [];
    const addF = () => fs.forEach(f => { const open = !!S.expanded[f.id]; rows.push({ k: 'f', id: f.id, depth, name: f.name, open, f }); if (open) walk(f.id, depth + 1); });
    const addN = () => ns.forEach(n => rows.push({ k: 'n', id: n.id, depth, name: n.title || 'Untitled', n }));
    if (SETTINGS.foldersFirst) { addF(); addN(); } else { addN(); addF(); }
  };
  walk(null, 1);
  const orphans = Object.values(S.notes).filter(n => !folderById(n.folderId));
  if (orphans.length) { rows.push({ k: 'u', id: '_u', depth: 1, name: 'Unsorted', open: true }); sortItems(orphans, 'n').forEach(n => rows.push({ k: 'n', id: n.id, depth: 2, name: n.title || 'Untitled', n })); }
  const sel = S.treeSel;
  const sq = Speed.q.toLowerCase();
  const nm = (t) => { if (!sq) return esc(t); const i = t.toLowerCase().indexOf(sq); return i < 0 ? esc(t) : esc(t.slice(0, i)) + '<span class="speedhit">' + esc(t.slice(i, i + sq.length)) + '</span>' + esc(t.slice(i + sq.length)); };
  let html = '';
  for (const r of rows) {
    const pad = 6 + r.depth * 18;
    const key = r.k === 'n' ? 'n:' + r.id : r.k === 'f' ? 'f:' + r.id : r.k;
    const cls = ['row', 'k-' + r.k]; if (key === sel) cls.push('sel'); if (r.k === 'n' && r.id === S.active) cls.push('active');
    if (r.k === 'root') {
      html += `<div class="${cls.join(' ')}" data-k="root" data-id="root" style="padding-left:6px"><span class="chev">${icon('chevronDown')}</span><span class="ti">${icon('module', 'c-blue')}</span><span class="nm"><b>${esc(r.name)}</b></span><span class="meta path">${esc(Store.info.root || '')}</span></div>`;
    } else if (r.k === 'f' || r.k === 'u') {
      const color = r.f && r.f.color ? 'c-' + r.f.color : 'c-folder';
      const cnt = r.f && SETTINGS.projectCounts ? folderNoteCount(r.f.id) : '';
      html += `<div class="${cls.join(' ')}" data-k="${r.k}" data-id="${r.id}" style="padding-left:${pad}px" draggable="${r.k === 'f'}"><span class="chev">${icon(r.open ? 'chevronDown' : 'chevronRight')}</span><span class="ti">${icon(r.open ? 'folderOpen' : 'folder', color)}</span><span class="nm">${nm(r.name)}</span>${cnt !== '' ? `<span class="meta">${cnt}</span>` : ''}</div>`;
    } else {
      const n = r.n; const f = folderById(n.folderId); const fc = SETTINGS.fileColors && f ? inheritColor(f) : '';
      html += `<div class="${cls.join(' ')}${fc ? ' fc-' + fc : ''}" data-k="n" data-id="${n.id}" style="padding-left:${pad + 2}px" draggable="true"><span class="chev"></span><span class="ti">${icon('noteMd', 'c-blue')}</span><span class="nm">${nm(r.name)}</span>${n.starred ? `<span class="star">${icon('starFill', 'c-yellow')}</span>` : ''}${SETTINGS.projectDates ? `<span class="meta">${esc(fmtDate(n.created, { day: 'numeric', month: 'short' }))}</span>` : ''}</div>`;
    }
  }
  if (!S.folders.length && !Object.keys(S.notes).length) html += `<div class="tree-empty"><p>Start with a module for each course.</p><button class="btn primary sm" data-new-folder>New Module</button><p class="dim">or press ${esc(fmtCombo(Keymap.first('newPopup')))}</p></div>`;
  tree.innerHTML = html;
}
function inheritColor(f) { let x = f, g = 0; while (x && g++ < 30) { if (x.color) return x.color; x = folderById(x.parentId); } return ''; }
const Speed = { q: '', t: null };
function treeKeyOf(row) { const k = row.dataset.k; return k === 'n' ? 'n:' + row.dataset.id : k === 'f' ? 'f:' + row.dataset.id : k; }
function initProjectTree(tree) {
  tree.addEventListener('click', e => {
    if (e.target.closest('[data-new-folder]')) { App.newFolder(null); return; }
    const row = e.target.closest('.row'); if (!row || row.querySelector('input.rename')) return;
    const k = row.dataset.k, id = row.dataset.id;
    S.treeSel = treeKeyOf(row);
    if (k === 'f') { if (e.target.closest('.chev') || e.detail === 2 || true) { S.expanded[id] = !S.expanded[id]; saveSession(); } }
    else if (k === 'n') { if (SETTINGS.singleClickOpen || e.detail === 2) App.open(id); }
    renderProjectTree(); tree.focus();
  });
  tree.addEventListener('dblclick', e => { const row = e.target.closest('.row'); if (row && row.dataset.k === 'n' && !SETTINGS.singleClickOpen) App.open(row.dataset.id); });
  tree.addEventListener('contextmenu', e => {
    const row = e.target.closest('.row'); e.preventDefault();
    if (row) { S.treeSel = treeKeyOf(row); renderProjectTree(); }
    Menu.open(treeMenu(row), { x: e.clientX, y: e.clientY });
  });
  tree.addEventListener('keydown', e => {
    const rows = [...tree.querySelectorAll('.row')]; let i = rows.findIndex(r => r.classList.contains('sel'));
    const cur = rows[i];
    const go = j => { j = clamp(j, 0, rows.length - 1); S.treeSel = treeKeyOf(rows[j]); renderProjectTree(); const r = tree.querySelectorAll('.row')[j]; r && r.scrollIntoView({ block: 'nearest' }); };
    if (e.target.tagName === 'INPUT') return;
    if (e.key === 'ArrowDown') { e.preventDefault(); go(i + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); go(i - 1); }
    else if (e.key === 'Home') { e.preventDefault(); go(0); }
    else if (e.key === 'End') { e.preventDefault(); go(rows.length - 1); }
    else if (e.key === 'ArrowRight' && cur) { e.preventDefault(); if (cur.dataset.k === 'f' && !S.expanded[cur.dataset.id]) { S.expanded[cur.dataset.id] = true; renderProjectTree(); } else go(i + 1); }
    else if (e.key === 'ArrowLeft' && cur) { e.preventDefault(); if (cur.dataset.k === 'f' && S.expanded[cur.dataset.id]) { S.expanded[cur.dataset.id] = false; renderProjectTree(); } else { const pad = parseInt(cur.style.paddingLeft); for (let j = i - 1; j >= 0; j--) if (parseInt(rows[j].style.paddingLeft) < pad) { go(j); break; } } }
    else if (e.key === 'Enter' && cur) { e.preventDefault(); if (cur.dataset.k === 'n') { App.open(cur.dataset.id); Editor.el && Editor.el.focus(); } else if (cur.dataset.k === 'f') { S.expanded[cur.dataset.id] = !S.expanded[cur.dataset.id]; renderProjectTree(); } }
    else if ((e.key === 'Delete' || e.key === 'Backspace' && e.metaKey) && cur) { e.preventDefault(); if (cur.dataset.k === 'n') App.deleteNoteConfirm(cur.dataset.id); else if (cur.dataset.k === 'f') App.deleteFolderConfirm(cur.dataset.id); }
    else if (e.key === 'F2' && cur) { e.preventDefault(); App.renameSelected(); }
    else if (e.key === 'Escape') { if (Speed.q) { Speed.q = ''; $('#speed').classList.remove('show'); renderProjectTree(); e.stopPropagation(); } }
    else if (e.key === 'Backspace' && Speed.q) { e.preventDefault(); Speed.q = Speed.q.slice(0, -1); speedSearch(); }
    else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey && /\S| /.test(e.key)) { e.preventDefault(); Speed.q += e.key; speedSearch(); }
  });
  tree.addEventListener('blur', () => { if (Speed.q) { Speed.q = ''; const sp = $('#speed'); if (sp) sp.classList.remove('show'); renderProjectTree(); } });
  // drag & drop
  tree.addEventListener('dragstart', e => {
    const row = e.target.closest('.row'); if (!row) return;
    e.dataTransfer.setData('application/x-ln-' + (row.dataset.k === 'n' ? 'note' : 'folder'), row.dataset.id);
    e.dataTransfer.setData('text/plain', row.querySelector('.nm').textContent);
    e.dataTransfer.effectAllowed = 'copyMove'; row.classList.add('dragging');
  });
  tree.addEventListener('dragend', () => tree.querySelectorAll('.dragging, .drop').forEach(r => r.classList.remove('dragging', 'drop')));
  tree.addEventListener('dragover', e => {
    const row = e.target.closest('.row'); const t = [...e.dataTransfer.types];
    if (!row || !(t.includes('application/x-ln-note') || t.includes('application/x-ln-folder'))) return;
    if (row.dataset.k === 'f' || row.dataset.k === 'root' || row.dataset.k === 'n') { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; tree.querySelectorAll('.drop').forEach(r => r !== row && r.classList.remove('drop')); row.classList.add('drop'); }
  });
  tree.addEventListener('dragleave', e => { const row = e.target.closest('.row'); if (row) row.classList.remove('drop'); });
  tree.addEventListener('drop', e => {
    const row = e.target.closest('.row'); if (!row) return; e.preventDefault();
    let targetFolder = row.dataset.k === 'f' ? row.dataset.id : row.dataset.k === 'n' ? (S.notes[row.dataset.id] || {}).folderId : null;
    const nid = e.dataTransfer.getData('application/x-ln-note'), fid = e.dataTransfer.getData('application/x-ln-folder');
    if (nid && targetFolder) { moveNote(nid, targetFolder); App.status('Moved to ' + folderById(targetFolder).name); }
    else if (fid) { if (row.dataset.k === 'root') targetFolder = null; if (fid !== targetFolder && !moveFolder(fid, targetFolder)) App.status('Can’t move a module into itself'); }
    renderProjectTree();
  });
}
function speedSearch() {
  const sp = $('#speed'); sp.textContent = Speed.q; sp.classList.toggle('show', !!Speed.q);
  const q = Speed.q.toLowerCase();
  if (q) {
    // expand everything so matches inside closed folders are found
    const hit = Object.values(S.notes).find(n => (n.title || '').toLowerCase().includes(q)) || S.folders.find(f => f.name.toLowerCase().includes(q));
    if (hit) {
      const fid = hit.folderId !== undefined ? hit.folderId : hit.parentId;
      folderPath(fid).forEach(f => S.expanded[f.id] = true);
      S.treeSel = (hit.folderId !== undefined ? 'n:' : 'f:') + hit.id;
    }
    sp.classList.toggle('none', !hit);
  }
  renderProjectTree();
  const r = $('#projTree .row.sel'); if (r) r.scrollIntoView({ block: 'nearest' });
}
function treeMenu(row) {
  const k = row ? row.dataset.k : 'root', id = row ? row.dataset.id : null;
  const colorMenu = fid => FOLDER_COLORS.map(([c, l]) => ({ label: l, checked: (folderById(fid) || {}).color === c, color: c ? `var(--e-${c})` : null, run: () => setFolderColor(fid, c) }));
  if (k === 'n') {
    const n = S.notes[id];
    return [
      { label: 'Open', icon: 'noteMd', run: () => App.open(id) },
      { label: 'New', icon: 'plus', sub: [{ label: 'Note', icon: 'noteAdd', run: () => App.newNote(n.folderId) }, { label: 'Folder', icon: 'folderAdd', run: () => App.newFolder(n.folderId) }] },
      '-', { label: 'Rename…', icon: 'edit', hint: fmtCombo(Keymap.first('rename')), run: () => App.renameInline('n', id) },
      { label: 'Duplicate', icon: 'duplicate', run: () => { const c = duplicateNote(id); if (c) App.open(c.id); } },
      { label: 'Move to…', icon: 'folderOpen', run: () => App.moveNoteDialog(id) },
      { label: n.starred ? 'Remove from Bookmarks' : 'Add to Bookmarks', icon: n.starred ? 'bookmarkFill' : 'bookmark', run: () => toggleStar(id) },
      '-', { label: 'Copy as Markdown', icon: 'copy', run: () => { if (Editor.noteId === id) Editor.flush(); copyText(htmlToMd(S.notes[id].html)); } },
      { label: 'Export', icon: 'export', sub: [{ label: 'Markdown…', run: () => Exporter.exportNote('md', id) }, { label: 'HTML…', run: () => Exporter.exportNote('html', id) }, IS_DESKTOP ? { label: 'PDF…', run: () => Exporter.exportNote('pdf', id) } : null].filter(Boolean) },
      IS_DESKTOP && plugin('history') ? { label: 'Local History…', icon: 'history', run: () => HistoryUI.show(id) } : null,
      '-', { label: 'Delete…', icon: 'trash', danger: true, run: () => App.deleteNoteConfirm(id) },
    ].filter(Boolean);
  }
  if (k === 'f') {
    return [
      { label: 'New', icon: 'plus', sub: [{ label: 'Note', icon: 'noteAdd', run: () => App.newNote(id) }, { label: 'Folder', icon: 'folderAdd', run: () => App.newFolder(id) }] },
      '-', { label: 'Rename…', icon: 'edit', hint: fmtCombo(Keymap.first('rename')), run: () => App.renameInline('f', id) },
      { label: 'Colour', icon: 'palette', sub: colorMenu(id) },
      { label: 'Move to Top Level', icon: 'arrowUp', disabled: !folderById(id).parentId, run: () => moveFolder(id, null) },
      '-', { label: 'Import Markdown into Folder…', icon: 'import', run: () => Exporter.importMarkdown(id) },
      IS_DESKTOP ? { label: 'Export Folder as Markdown…', icon: 'export', run: () => Exporter.exportFolder(id) } : null,
      '-', { label: 'Collapse', icon: 'collapseAll', run: () => { descendantFolderIds(id).forEach(x => S.expanded[x] = false); renderProjectTree(); } },
      { label: 'Expand All', icon: 'expandAll', run: () => { descendantFolderIds(id).forEach(x => S.expanded[x] = true); renderProjectTree(); } },
      '-', { label: 'Delete…', icon: 'trash', danger: true, run: () => App.deleteFolderConfirm(id) },
    ].filter(Boolean);
  }
  return [
    { label: 'New Module…', icon: 'folderAdd', run: () => App.newFolder(null) },
    { label: 'Import Markdown…', icon: 'import', run: () => Exporter.importMarkdown() },
    IS_DESKTOP ? { label: 'Show in Explorer', icon: 'external', run: () => BRIDGE.openFolder() } : null,
    IS_DESKTOP ? { label: 'Open Another Notes Folder…', icon: 'folderOpen', run: () => BRIDGE.chooseVault() } : null,
    '-', { label: 'Collapse All', icon: 'collapseAll', run: () => { S.expanded = {}; renderProjectTree(); } },
  ].filter(Boolean);
}
