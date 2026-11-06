'use strict';
/* ============================================================
   App shell: toolbar, menus, tabs, status bar, navigation, boot
   ============================================================ */
const App = {
  closedTabs: [], pastePlainOnce: false, pendingContext: null,

  /* ---------------- chrome ---------------- */
  refreshChrome(full) {
    this.renderToolbar(); this.renderMenubar(); this.renderFmtBar(); this.renderTabs(); this.updateStatus();
    if (full) { ToolWindows.render(); Panels.refreshAll(); if (Editor.el) { Editor.el.querySelectorAll('pre').forEach(highlightPre); Editor.el.querySelectorAll('.math,.math-block').forEach(renderMath); } }
    Gutter.schedule();
  },
  refresh() { this.renderTabs(); this.renderToolbar(); Panels.refreshAll(); ToolWindows.renderBadgesSoon(); this.updateStatus(); if (Editor.el) { Editor.renderMeta(); Editor.el.querySelectorAll('a.wikilink').forEach(refreshWikilink); } },
  onNoteSaved(n) { this.refreshTitles(); Panels.refresh('info'); if (ToolWindows.isOpen('todo')) Panels.refresh('todo'); ToolWindows.renderBadgesSoon(); },
  refreshTitles: debounce(function () { App.renderTabs(); renderProjectTree(); App.renderToolbar(); App.updateStatus(); Panels.refresh('bookmarks'); }, 120),
  renderToolbar() {
    const n = S.notes[S.active];
    const pw = $('#projWidget'); pw.querySelector('.w-name').textContent = Store.info.name || 'lectures';
    pw.querySelector('.proj-tile').textContent = (Store.info.name || 'LN').replace(/[^A-Za-z0-9]/g, '').slice(0, 2).toUpperCase() || 'LN';
    const mw = $('#modWidget'); const f = n ? folderById(n.folderId) : null;
    mw.style.display = f ? '' : 'none';
    if (f) { mw.querySelector('.w-name').textContent = folderPath(f.id).map(x => x.name).join(' / '); mw.querySelector('.w-ic').innerHTML = icon('folder', f.color ? 'c-' + inheritColor(f) : 'c-folder'); }
    const title = $('#tbTitle'); title.textContent = n ? `${Store.info.name || 'lectures'} – ${n.title || 'Untitled'}` : (Store.info.name || 'Lecture Notes');
    document.title = n ? `${n.title || 'Untitled'} – Lecture Notes` : 'Lecture Notes';
    // run widget
    const rw = $('#runWidget'); rw.style.display = plugin('timer') ? '' : 'none';
    if (plugin('timer')) {
      const running = Timer.running;
      const target = running ? S.notes[Timer.noteId] : n;
      rw.innerHTML = `<button class="widget run-cfg" data-tip="Lecture timer" ${running ? '' : ''}>${icon('timer')}<span class="w-name">${running ? `<b id="runTime">${fmtDuration(Timer.elapsed(), SETTINGS.timerHours)}</b>` : esc(target ? target.title : 'Lecture timer')}</span>${icon('caretDown', 'caret')}</button>` +
        (running ? `<button class="ibtn tbtn" data-act="pause" data-tip="${Timer.paused ? 'Resume' : 'Pause'}">${icon(Timer.paused ? 'run' : 'timer', Timer.paused ? 'c-green' : '')}</button><button class="ibtn tbtn" data-act="stamp" data-tip="Insert timestamp" data-tip-action="insertTimestamp">${icon('plus')}</button><button class="ibtn tbtn" data-act="stop" data-tip="Stop" data-tip-action="timerStop">${icon('stop', 'c-red')}</button>`
          : `<button class="ibtn tbtn run" data-act="start" data-tip="Start lecture timer" data-tip-action="timerStart">${icon('run', 'c-green')}</button>`);
    }
  },
  renderMenubar() {
    const mb = $('#menubar');
    const menus = mainMenu();
    mb.innerHTML = menus.map((m, i) => `<button class="menubar-item" data-i="${i}">${esc(m.label)}</button>`).join('');
  },
  openMenubar(i, keyboard) {
    const menus = mainMenu(); const btns = $$('#menubar .menubar-item');
    i = (i + menus.length) % menus.length;
    btns.forEach(b => b.classList.toggle('open', +b.dataset.i === i));
    Menu.open(menus[i].items, { rect: btns[i].getBoundingClientRect() }, { keyboard, onClose: () => btns.forEach(b => b.classList.remove('open')), onArrow: d => this.openMenubar(i + d, true) });
  },
  openMainMenu(rect) {
    const menus = mainMenu();
    Menu.open(menus.map(m => ({ label: m.label, sub: m.items })), { rect }, { keyboard: true });
  },
  renderFmtBar() {
    const bar = $('#fmtbar');
    if (bar.dataset.built) return;
    bar.dataset.built = '1';
    const B = (action, ic, extra = '') => `<button class="fbtn" data-action="${action}" data-tip="${esc(Actions.get(action).name)}" data-tip-action="${action}">${ic ? icon(ic) : extra}</button>`;
    bar.innerHTML = `<button class="fbtn style-dd" id="styleDD" data-tip="Text style"><span id="styleName">Text</span>${icon('caretDown')}</button><span class="fsep"></span>` +
      B('bold', 'bold') + B('italic', 'italic') + B('underline', 'underline') + B('strike', 'strike') + B('highlight', 'highlight') + B('inlineCode', 'code') + B('insertLink', 'link') + '<span class="fsep"></span>' +
      B('bulletList', 'listBullet') + B('numberedList', 'listNumber') + B('checklist', 'checklist') + B('quote', 'quote') + `<button class="fbtn" id="calloutDD" data-tip="Callout box">${icon('callout')}${icon('caretDown', 'dd')}</button>` + '<span class="fsep"></span>' +
      B('insertImage', 'image') + B('codeBlock', 'codeBlock') + B('insertTable', 'table') + `<span class="fx-math">${B('mathBlock', 'sigma')}</span>` + B('insertHr', 'hr') + `<span class="fx-wiki">${B('insertWikilink', 'wikilink')}</span>` + '<span class="fsep"></span>' +
      B('undo', 'undo') + B('redo', 'redo') + B('clearFormat', 'clearFormat') + '<span class="fgrow"></span>' + B('find', 'search');
    bar.addEventListener('mousedown', e => { if (e.target.closest('.fbtn')) e.preventDefault(); });
    bar.addEventListener('click', e => {
      const b = e.target.closest('.fbtn'); if (!b || !Editor.el) return;
      if (b.id === 'styleDD') { Menu.open([{ action: 'paragraph' }, { action: 'h1' }, { action: 'h2' }, { action: 'h3' }, '-', { action: 'bulletList' }, { action: 'numberedList' }, { action: 'checklist' }, { action: 'quote' }, { action: 'codeBlock' }], { rect: b.getBoundingClientRect() }); return; }
      if (b.id === 'calloutDD') { Menu.open(calloutSubmenu(), { rect: b.getBoundingClientRect() }); return; }
      Actions.run(b.dataset.action); this.refreshFormatState();
    });
  },
  refreshFormatState: rafThrottle(() => {
    if (!Editor.el) return;
    const a = anchor(); if (!inEditor(a)) return;
    $$('#fmtbar .fbtn[data-action], #floatBar [data-action]').forEach(b => { const act = Actions.get(b.dataset.action); b.classList.toggle('on', !!(act && act.toggle && act.toggle())); });
    const b = curBlock(); const t = b ? b.tagName : 'P';
    const names = { P: 'Text', H1: 'Heading 1', H2: 'Heading 2', H3: 'Heading 3', UL: closestIn(a, 'ul.checklist') ? 'Checklist' : 'Bullet list', OL: 'Numbered list', BLOCKQUOTE: closestIn(a, '.callout') ? (CALLOUTS[(closestIn(a, '.callout').dataset.type)] || ['Callout'])[0] : 'Quote', PRE: 'Code', TABLE: 'Table', FIGURE: 'Image', HR: 'Divider' };
    const sn = $('#styleName'); if (sn) sn.textContent = names[t] || 'Text';
    $$('#fmtbar .fx-math').forEach(x => x.style.display = plugin('math') ? '' : 'none');
    $$('#fmtbar .fx-wiki').forEach(x => x.style.display = plugin('wiki') ? '' : 'none');
  }),
  renderTabs() {
    const el = $('#tabs');
    const ordered = [...S.tabs.filter(id => S.pinned.includes(id)), ...S.tabs.filter(id => !S.pinned.includes(id))];
    el.innerHTML = ordered.filter(id => S.notes[id]).map(id => {
      const n = S.notes[id]; const f = folderById(n.folderId); const fc = SETTINGS.fileColors && f ? inheritColor(f) : '';
      const pinned = S.pinned.includes(id);
      return `<div class="tab${id === S.active ? ' active' : ''}${pinned ? ' pinned' : ''}${fc ? ' fc-' + fc : ''}" data-id="${id}" draggable="true" data-tip="${esc(notePathLabel(n) + ' / ' + (n.title || 'Untitled'))}">${icon('noteMd', 'c-blue')}<span class="tab-n">${esc(n.title || 'Untitled')}</span>${pinned ? `<button class="tab-x pin" data-pin="1">${icon('pin')}</button>` : `<button class="tab-x" data-close="1" data-tip="Close" data-tip-action="closeTab">${icon('closeSmall')}</button>`}</div>`;
    }).join('') + `<div class="tabs-fill"></div>` + (S.tabs.length ? `<button class="ibtn sm tabs-more" data-tip="Open tabs">${icon('chevronDown')}</button>` : '');
    const a = el.querySelector('.tab.active'); if (a) a.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  },
  initTabs() {
    const el = $('#tabs');
    el.addEventListener('click', e => {
      if (e.target.closest('.tabs-more')) { Menu.open(S.tabs.filter(id => S.notes[id]).map(id => ({ label: S.notes[id].title || 'Untitled', icon: 'noteMd', checked: id === S.active, run: () => this.open(id) })), { rect: e.target.closest('.tabs-more').getBoundingClientRect(), alignRight: true }); return; }
      const t = e.target.closest('.tab'); if (!t) return;
      if (e.target.closest('[data-close]')) { this.closeTab(t.dataset.id); return; }
      if (e.target.closest('[data-pin]')) { this.togglePin(t.dataset.id); return; }
      this.open(t.dataset.id);
    });
    el.addEventListener('auxclick', e => { const t = e.target.closest('.tab'); if (t && e.button === 1) { e.preventDefault(); this.closeTab(t.dataset.id); } });
    el.addEventListener('dblclick', e => { if (e.target.closest('.tab')) ToolWindows.hideAll(); });
    el.addEventListener('contextmenu', e => {
      const t = e.target.closest('.tab'); if (!t) return; e.preventDefault(); const id = t.dataset.id;
      Menu.open([
        { label: 'Close', icon: 'close', hint: fmtCombo(Keymap.first('closeTab')), run: () => this.closeTab(id) },
        { label: 'Close Other Tabs', run: () => this.closeOthers(id) }, { label: 'Close Tabs to the Right', run: () => { const i = S.tabs.indexOf(id); S.tabs.slice(i + 1).filter(x => !S.pinned.includes(x)).forEach(x => this.closeTab(x, true)); this.afterTabs(); } },
        { label: 'Close All Tabs', run: () => this.closeAll() }, '-',
        { label: S.pinned.includes(id) ? 'Unpin Tab' : 'Pin Tab', icon: 'pin', run: () => this.togglePin(id) },
        { label: 'Select in Project View', icon: 'locate', run: () => { this.open(id); Panels.locate(); } },
        { label: S.notes[id].starred ? 'Remove from Bookmarks' : 'Add to Bookmarks', icon: 'bookmark', run: () => toggleStar(id) },
      ], { x: e.clientX, y: e.clientY });
    });
    let dragId = null;
    el.addEventListener('dragstart', e => { const t = e.target.closest('.tab'); if (!t) return; dragId = t.dataset.id; e.dataTransfer.setData('application/x-ln-note', dragId); e.dataTransfer.effectAllowed = 'copyMove'; });
    el.addEventListener('dragover', e => { if (dragId) { e.preventDefault(); const t = e.target.closest('.tab'); $$('#tabs .tab.dropl, #tabs .tab.dropr').forEach(x => x.classList.remove('dropl', 'dropr')); if (t && t.dataset.id !== dragId) { const r = t.getBoundingClientRect(); t.classList.add(e.clientX < r.left + r.width / 2 ? 'dropl' : 'dropr'); } } });
    el.addEventListener('drop', e => {
      const t = e.target.closest('.tab'); $$('#tabs .tab.dropl, #tabs .tab.dropr').forEach(x => x.classList.remove('dropl', 'dropr'));
      if (!dragId || !t || t.dataset.id === dragId) { dragId = null; return; }
      e.preventDefault(); const r = t.getBoundingClientRect(); const after = e.clientX > r.left + r.width / 2;
      S.tabs = S.tabs.filter(x => x !== dragId); let i = S.tabs.indexOf(t.dataset.id) + (after ? 1 : 0); S.tabs.splice(i, 0, dragId); dragId = null; saveSession(); this.renderTabs();
    });
    el.addEventListener('dragend', () => { dragId = null; });
    el.addEventListener('wheel', e => { if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) { el.scrollLeft += e.deltaY; e.preventDefault(); } }, { passive: false });
  },

  /* ---------------- status bar ---------------- */
  updateStatus() {
    const n = S.notes[S.active];
    const left = $('#stLeft');
    if (SETTINGS.uiStyle === 'classic') left.innerHTML = this.lastMsg ? `<span class="st-msg">${esc(this.lastMsg)}</span>` : '';
    else left.innerHTML = n ? `<span class="nav">${icon('module', 'c-blue')}${esc(Store.info.name || 'lectures')}</span>` + folderPath(n.folderId).map(f => `<span class="nav-sep">${icon('chevronRight')}</span><span class="nav" data-folder="${f.id}">${icon('folder', f.color ? 'c-' + f.color : 'c-folder')}${esc(f.name)}</span>`).join('') + `<span class="nav-sep">${icon('chevronRight')}</span><span class="nav">${icon('noteMd', 'c-blue')}${esc(n.title || 'Untitled')}.md</span>` : '';
    $('#stLock').innerHTML = icon(Editor.readOnly ? 'lock' : 'unlock', Editor.readOnly ? 'c-orange' : '');
    $('#stLock').dataset.tip = Editor.readOnly ? 'Read-only. Click to make editable' : 'Click to make read-only';
    $('#stLock').style.display = n ? '' : 'none';
    $$('#statusbar .st-doc').forEach(x => x.style.display = n ? '' : 'none');
    this.updateCaret(); this.updateStats(); Timer.tick();
  },
  updateCaret: rafThrottle(() => {
    const el = $('#stCaret'); if (!Editor.el) { el.textContent = ''; return; }
    const i = Gutter.currentIndex(); const s = getSel();
    if (i < 0 || !s.rangeCount) { el.textContent = ''; return; }
    const ln = Gutter.lines[i]; let col = 1;
    try { const r = document.createRange(); const base = ln.pre != null ? preCode(ln.el) : (ln.el.nodeType === 1 ? ln.el : topBlock(s.anchorNode)); r.setStart(base, 0); r.setEnd(s.focusNode, s.focusOffset); col = (ln.pre != null ? r.toString().split('\n').pop().length : r.toString().length) + 1; } catch (e) {}
    const selLen = s.isCollapsed ? '' : ` (${s.toString().length} chars)`;
    el.textContent = `${i + 1}:${col}${selLen}`;
  }),
  scheduleStats: debounce(() => App.updateStats(), 500),
  updateStats() {
    const el = $('#stWords'); const n = S.notes[S.active]; if (!n || !Editor.el) { el.textContent = ''; return; }
    const w = wordCount(blockLines(Editor.el).join('\n')); el.textContent = `${w.toLocaleString()} word${w === 1 ? '' : 's'}`;
    Panels.refresh('info');
  },
  status(msg) { this.lastMsg = msg; const t = $('#stToast'); t.textContent = msg; t.classList.add('show'); clearTimeout(this._st); this._st = setTimeout(() => t.classList.remove('show'), 2600); if (SETTINGS.uiStyle === 'classic') this.updateStatus(); },
  progress(on, msg) { const p = $('#stProgress'); p.classList.toggle('show', !!on); p.innerHTML = on ? `<span class="spin"></span>${esc(msg || '')}` : ''; },
  onNotify(entry) { this.lastMsg = entry.title + (entry.text ? ': ' + entry.text : ''); if (ToolWindows.isOpen('notifications')) Panels.refresh('notifications'); else ToolWindows.render(); if (SETTINGS.uiStyle === 'classic') this.updateStatus(); },
  setSaveState(state, msg) {
    const el = $('#stSave');
    if (state === 'saving') el.innerHTML = `<span class="spin sm"></span>`;
    else if (state === 'error') el.innerHTML = icon('warning', 'c-orange');
    else el.innerHTML = icon('check', 'c-green');
    el.dataset.tip = state === 'saving' ? 'Saving…' : state === 'error' ? (msg || 'Save failed') : (IS_DESKTOP ? 'All changes saved to ' + (Store.info.root || 'disk') : 'All changes saved in this browser');
    if (state === 'error') notify('Save failed', msg, 'error');
  },

  /* ---------------- notes & tabs ---------------- */
  open(id, opts = {}) {
    if (!S.notes[id]) return;
    if (S.active === id && Editor.noteId === id) { if (opts.focus !== false && Editor.el) Editor.el.focus({ preventScroll: true }); return; }
    Editor.rememberScroll(); Editor.flush();
    if (S.active && S.active !== id && !opts.noHistory) { S.back.push(S.active); if (S.back.length > 60) S.back.shift(); S.fwd = []; }
    S.active = id;
    if (!S.tabs.includes(id)) { const i = S.tabs.indexOf(S.back[S.back.length - 1]); if (i >= 0) S.tabs.splice(i + 1, 0, id); else S.tabs.push(id); }
    S.recent = [id, ...S.recent.filter(x => x !== id)].slice(0, 50);
    S.treeSel = 'n:' + id;
    Editor.mount(id);
    this.afterTabs();
    if (opts.focus !== false && Editor.el) setTimeout(() => { if (Editor.el && document.activeElement !== $('#title')) Editor.el.focus({ preventScroll: true }); }, 0);
  },
  afterTabs() { this.renderTabs(); this.renderToolbar(); renderProjectTree(); Panels.refresh('bookmarks'); Panels.refresh('structure'); Panels.refresh('info'); Panels.refresh('todo'); this.updateStatus(); saveSession(); },
  openActive() { if (S.active && S.notes[S.active]) Editor.mount(S.active); else { S.active = null; Editor.mount(null); } this.afterTabs(); },
  closeTab(id, batch) {
    const i = S.tabs.indexOf(id); if (i < 0) return;
    if (Editor.noteId === id) { Editor.rememberScroll(); Editor.flush(); }
    S.tabs.splice(i, 1); S.pinned = S.pinned.filter(x => x !== id);
    this.closedTabs.push(id); if (this.closedTabs.length > 30) this.closedTabs.shift();
    if (S.active === id) {
      const prev = S.recent.find(x => x !== id && S.tabs.includes(x));
      S.active = prev || S.tabs[Math.min(i, S.tabs.length - 1)] || null;
      if (!batch) { if (S.active) Editor.mount(S.active); else Editor.mount(null); }
    }
    if (!batch) this.afterTabs();
  },
  closeOthers(id) { S.tabs.filter(x => x !== id && !S.pinned.includes(x)).forEach(x => this.closeTab(x, true)); if (S.active !== id) this.open(id); this.afterTabs(); },
  closeAll() { [...S.tabs].filter(x => !S.pinned.includes(x)).forEach(x => this.closeTab(x, true)); S.active = S.tabs[0] || null; Editor.mount(S.active); this.afterTabs(); },
  reopenClosed() { while (this.closedTabs.length) { const id = this.closedTabs.pop(); if (S.notes[id]) { this.open(id); return; } } },
  togglePin(id) { if (S.pinned.includes(id)) S.pinned = S.pinned.filter(x => x !== id); else S.pinned.push(id); saveSession(); this.renderTabs(); },
  cycleTab(d) { const ordered = [...S.tabs.filter(id => S.pinned.includes(id)), ...S.tabs.filter(id => !S.pinned.includes(id))]; const i = ordered.indexOf(S.active); const id = ordered[(i + d + ordered.length) % ordered.length]; if (id) this.open(id); },
  navBack() { const id = S.back.pop(); if (!id || !S.notes[id]) return; if (S.active) S.fwd.push(S.active); this.open(id, { noHistory: true }); },
  navForward() { const id = S.fwd.pop(); if (!id || !S.notes[id]) return; if (S.active) S.back.push(S.active); this.open(id, { noHistory: true }); },
  showEmpty(on) {
    document.body.classList.toggle('no-editor', on);
    if (on) this.renderEmpty();
  },
  renderEmpty() {
    const el = $('#empty');
    const k = id => esc(fmtCombo(Keymap.first(id)));
    if (!S.folders.length && !Object.keys(S.notes).length) {
      el.innerHTML = `<div class="welcome"><div class="wl-logo">${appLogo(64)}</div><h1>Welcome to Lecture Notes</h1><p class="dim">Your lecture notes, with the power of an IDE.</p>
        <div class="wl-actions"><button class="wl-btn primary" data-act="newFolder">${icon('folderAdd', '', 20)}<b>New Module</b><span>One per course, e.g. “CS101 Algorithms”</span></button>
        <button class="wl-btn" data-act="importMarkdown">${icon('import', '', 20)}<b>Import Markdown</b><span>Bring notes from Obsidian or elsewhere</span></button>
        ${IS_DESKTOP ? `<button class="wl-btn" data-act="openFolder">${icon('folderOpen', '', 20)}<b>Open Folder</b><span>Use an existing notes folder</span></button>` : ''}</div>
        <div class="wl-tips"><span><kbd>Double Shift</kbd> search everything</span><span><kbd>/</kbd> insert any block</span><span><kbd>${esc(fmtCombo(Keymap.first('settings')))}</kbd> settings</span><span>Paste screenshots straight in</span></div>
        <div class="wl-custom"><span class="dim">Theme</span>${THEMES.slice(0, 8).map(t => `<button class="wl-theme${SETTINGS.theme === t.id ? ' on' : ''}" data-theme="${t.id}" title="${esc(t.name)}" style="background:${t.ed.bg};border-color:${t.ui.accent}"><i style="background:${t.ed.h1}"></i><i style="background:${t.ed.str}"></i></button>`).join('')}<button class="linkbtn" data-act="settings">More settings…</button></div></div>`;
    } else {
      el.innerHTML = `<div class="hints">
        <div class="hint-row"><span>Search Everywhere</span><kbd>${k('searchEverywhere')}</kbd></div>
        <div class="hint-row"><span>Go to Note</span><kbd>${k('gotoNote')}</kbd></div>
        <div class="hint-row"><span>Recent Notes</span><kbd>${k('recentNotes')}</kbd></div>
        <div class="hint-row"><span>New Note</span><kbd>${k('newNote')}</kbd></div>
        <div class="hint-row"><span>Find in Notes</span><kbd>${k('findInFiles')}</kbd></div>
        <div class="hint-row"><span>Settings</span><kbd>${k('settings')}</kbd></div>
        <div class="hint-row dim"><span>Drop .md files here to import them</span></div></div>`;
    }
  },
  async newNote(folderId) {
    const fid = folderId || defaultFolderId();
    if (!fid) { const f = await this.newFolder(null); if (!f) return; return; }
    const n = createNote(fid);
    this.open(n.id);
    setTimeout(() => { const t = $('#title'); t.focus(); t.select(); }, 30);
    renderProjectTree();
  },
  async newFolder(parentId) {
    const name = await Dialog.prompt({ title: parentId ? 'New Folder' : 'New Module', label: parentId ? `Inside “${folderById(parentId).name}”` : 'Name (e.g. CS101 Algorithms)', placeholder: parentId ? 'Week 1' : 'Module name', okText: 'Create' });
    if (!name) return null;
    const f = createFolder(parentId, name);
    S.treeSel = 'f:' + f.id; ToolWindows.open('project');
    renderProjectTree();
    const n = createNote(f.id); this.open(n.id);
    setTimeout(() => { const t = $('#title'); t.focus(); t.select(); }, 30);
    return f;
  },
  newPopup(rect) {
    const fid = defaultFolderId();
    const items = [{ label: 'Note', icon: 'noteAdd', hint: fmtCombo(Keymap.first('newNote')), run: () => this.newNote() }, { label: 'Module', icon: 'folderAdd', run: () => this.newFolder(null) }, fid ? { label: 'Folder in “' + folderById(fid).name + '”', icon: 'folderAdd', run: () => this.newFolder(fid) } : null, '-', { label: 'Import Markdown…', icon: 'import', run: () => Exporter.importMarkdown() }].filter(Boolean);
    if (rect) Menu.open(items, { rect }, { keyboard: true });
    else { const r = caretRect(); Menu.open(items, { x: innerWidth / 2 - 100, y: 120 }, { keyboard: true }); }
  },
  renameSelected() {
    const sel = S.treeSel || '';
    if (document.activeElement && document.activeElement.closest && document.activeElement.closest('#projTree') && sel) {
      if (sel.startsWith('f:')) return this.renameInline('f', sel.slice(2));
      if (sel.startsWith('n:')) return this.renameInline('n', sel.slice(2));
    }
    if (S.active) { const t = $('#title'); t.focus(); t.select(); }
  },
  renameInline(kind, id) {
    ToolWindows.open('project'); if (kind === 'n') folderPath(S.notes[id].folderId).forEach(f => S.expanded[f.id] = true);
    renderProjectTree();
    const row = $(`#projTree .row[data-id="${id}"]`); if (!row) return;
    const nm = row.querySelector('.nm'); const old = kind === 'n' ? S.notes[id].title : folderById(id).name;
    const inp = h('input.rename', { value: old, spellcheck: 'false' }); nm.replaceWith(inp); inp.focus(); inp.select();
    let done = false;
    const commit = ok => { if (done) return; done = true; const v = inp.value.trim(); inp.remove(); if (ok && v && v !== old) { if (kind === 'n') renameNote(id, v); else renameFolder(id, v); } renderProjectTree(); $('#projTree').focus(); this.renderTabs(); this.renderToolbar(); };
    inp.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') commit(true); if (e.key === 'Escape') commit(false); });
    inp.addEventListener('blur', () => commit(true));
    inp.addEventListener('click', e => e.stopPropagation());
  },
  async moveNoteDialog(id) {
    const n = S.notes[id]; if (!n) return;
    const opts = []; const walk = (pid, d) => sortItems(childFolders(pid), 'f').forEach(f => { opts.push([f.id, '  '.repeat(d) + f.name]); walk(f.id, d + 1); });
    walk(null, 0);
    const v = await Dialog.choose({ title: 'Move “' + n.title + '”', label: 'To module or folder', options: opts, value: n.folderId, okText: 'Move' });
    if (v && v !== n.folderId) { moveNote(id, v); this.status('Moved to ' + folderById(v).name); }
  },
  async deleteNoteConfirm(id) {
    const n = S.notes[id]; if (!n) return;
    if (SETTINGS.confirmDelete) { const ok = await Dialog.confirm({ title: 'Delete Note', message: `Delete “${n.title || 'Untitled'}”?${IS_DESKTOP ? ' You can restore it later from File › Restore Deleted Note.' : ' This can’t be undone.'}`, okText: 'Delete', danger: true }); if (!ok) return; }
    removeNote(id); this.status('Deleted “' + (n.title || 'Untitled') + '”');
    if (IS_DESKTOP) notify('Note deleted', n.title, 'info', { actions: [{ label: 'Undo', run: async () => { const r = await Store.trashRestore(id); if (r) { S.notes[id] = { ...r, id }; Store.saveNote(S.notes[id]); this.refresh(); this.open(id); } } }], timeout: 7000 });
  },
  async deleteFolderConfirm(id) {
    const f = folderById(id); if (!f) return;
    const cnt = folderNoteCount(id);
    const ok = await Dialog.confirm({ title: 'Delete Module', message: `Delete “${f.name}”${cnt ? ` and its ${cnt} note${cnt > 1 ? 's' : ''}` : ''}?${IS_DESKTOP && cnt ? ' Notes can be restored from File › Restore Deleted Note.' : ''}`, okText: 'Delete', danger: true });
    if (!ok) return;
    deleteFolder(id); this.openActive(); this.status('Deleted “' + f.name + '”');
  },
  toggleZen() { document.body.classList.toggle('zen'); Gutter.schedule(); if (document.body.classList.contains('zen')) App.status('Zen Mode. Press ' + fmtCombo(Keymap.first('zen')) + ' or Esc to exit'); },
  escape() {
    if (document.body.classList.contains('zen')) { this.toggleZen(); return true; }
    if ($('#lightbox').classList.contains('show')) { $('#lightbox').classList.remove('show'); return true; }
    const ae = document.activeElement;
    if (ae && ae.closest && ae.closest('.twside') && Editor.el) { Editor.el.focus({ preventScroll: true }); return true; }
    return false;
  },
  quickSwitch() {
    const n = (i, label, sub) => ({ label: `${i}. ${label}`, sub });
    Menu.open([
      n(1, 'Theme', THEMES.map(t => ({ label: t.name, checked: SETTINGS.theme === t.id, color: t.ed.bg, run: () => setSetting('theme', t.id) }))),
      n(2, 'UI Style', [{ action: 'uiNew' }, { action: 'uiClassic' }]),
      n(3, 'Keymap', Object.entries(KEYMAP_PRESETS).map(([k, l]) => ({ label: l, checked: SETTINGS.keymapPreset === k, run: () => { setSetting('keymapPreset', k); Keymap.rebuild(); } }))),
      n(4, 'View Mode', [{ action: 'zen' }, { action: 'focusMode' }, { action: 'typewriter' }, { action: 'readOnly' }, { action: 'toggleCompact' }]),
      n(5, 'Editor Font Size', [{ action: 'editorFontUp' }, { action: 'editorFontDown' }, { label: 'Reset to 15', run: () => setSetting('fontSize', 15) }]),
      n(6, 'Accent Colour', ACCENTS.map(([c, l]) => ({ label: l, checked: (SETTINGS.accent || '') === c, color: c || null, run: () => setSetting('accent', c) }))),
    ], { x: innerWidth / 2 - 130, y: 110 }, { keyboard: true });
  },
  contextActions() {
    if (!Editor.el) return;
    const a = anchor(); const b = curBlock(); const items = [];
    const r = caretRect();
    const pre = closestIn(a, 'pre'), cell = closestIn(a, 'td,th'), co = closestIn(a, 'blockquote.callout'), li = closestIn(a, 'li'), hd = closestIn(a, 'h1,h2,h3');
    if (pre) items.push({ label: 'Change Language…', icon: 'codeBlock', sub: () => langMenu(pre) }, { action: 'commentLine' }, { label: 'Copy Code', icon: 'copy', run: () => copyText(preCode(pre).textContent.replace(/\n$/, '')) }, { label: 'Convert to Paragraphs', icon: 'paragraph', run: () => toggleCodeBlock() }, '-');
    if (cell) items.push(...tableMenuItems(cell), '-');
    if (co) items.push({ label: 'Change Callout Type', icon: 'callout', sub: Object.entries(CALLOUTS).map(([k, [l, ic]]) => ({ label: l, icon: ic, checked: co.dataset.type === k, run: () => { Hist.record('op'); co.dataset.type = k; decorateCallout(co); Editor.changed(); } })) }, { label: 'Remove Callout', icon: 'trash', run: () => { Hist.record('op'); unwrapQuote(co); Editor.changed(); } }, '-');
    if (hd) items.push({ label: hd.dataset.folded ? 'Expand Section' : 'Collapse Section', icon: 'chevronDown', run: () => toggleFold(hd) }, { label: 'Convert to Text', icon: 'paragraph', run: () => setBlockType('p') }, ...['h1', 'h2', 'h3'].filter(x => x !== hd.tagName.toLowerCase()).map(x => ({ label: 'Change to Heading ' + x[1], icon: 'heading', run: () => setBlockType(x) })), '-');
    if (li) {
      const list = li.parentNode;
      if (list.classList.contains('checklist')) items.push({ label: 'Mark All Done', icon: 'check', run: () => { Hist.record('op'); list.querySelectorAll('li').forEach(x => x.classList.add('done')); Editor.changed(); } }, { label: 'Remove Completed Items', icon: 'trash', run: () => { Hist.record('op'); list.querySelectorAll('li.done').forEach(x => x.remove()); if (!list.children.length) list.replaceWith(emptyP()); Editor.changed(); } });
      items.push({ label: 'Sort Items A → Z', icon: 'sort', run: () => { Hist.record('op'); [...list.children].sort((x, y) => x.textContent.localeCompare(y.textContent, undefined, { numeric: true })).forEach(x => list.appendChild(x)); Editor.changed(); } },
        { label: 'Convert List', icon: 'listBullet', sub: [{ action: 'bulletList' }, { action: 'numberedList' }, { action: 'checklist' }, { label: 'Paragraphs', icon: 'paragraph', run: () => { const isCheck = list.classList.contains('checklist'); setBlockType(list.tagName === 'OL' ? 'ol' : isCheck ? 'check' : 'ul'); } }] }, '-');
    }
    if (b && b.tagName === 'P') items.push({ label: 'Convert to', icon: 'paragraph', sub: [{ action: 'h1' }, { action: 'h2' }, { action: 'h3' }, '-', { action: 'bulletList' }, { action: 'numberedList' }, { action: 'checklist' }, '-', { action: 'quote' }, { action: 'codeBlock' }] }, { label: 'Wrap in Callout', icon: 'callout', sub: calloutSubmenu() }, '-');
    items.push({ action: 'moveUp' }, { action: 'moveDown' }, { action: 'duplicateLine' }, { action: 'deleteLine' }, '-', { label: 'Insert', icon: 'plus', sub: insertMenuItems() });
    Menu.open(items, { x: r.x, y: r.y + r.h + 4 }, { keyboard: true });
  },
  keymapReference() {
    const q = h('input.field', { placeholder: 'Filter', spellcheck: 'false' });
    const list = h('div.kref');
    const render = () => {
      const f = q.value.toLowerCase(); const groups = {};
      for (const a of Actions.list) { const k = Keymap.keysFor(a.id); if (!k.length || a.hidden) continue; if (f && !(a.name + ' ' + a.group + ' ' + k.map(fmtCombo).join(' ')).toLowerCase().includes(f)) continue; (groups[a.group] = groups[a.group] || []).push(a); }
      list.innerHTML = Object.entries(groups).map(([g, as]) => `<div class="kref-g"><h4>${esc(g)}</h4>${as.map(a => `<div class="kref-r"><span>${esc(a.name)}</span><span>${Keymap.keysFor(a.id).map(k => `<kbd>${esc(fmtCombo(k))}</kbd>`).join(' ')}</span></div>`).join('')}</div>`).join('');
    };
    q.addEventListener('input', render); render();
    Dialog.open({ title: 'Keyboard Shortcuts (' + KEYMAP_PRESETS[SETTINGS.keymapPreset] + ')', width: 'min(900px, 94vw)', body: h('div', q, list), footerLeft: h('button.linkbtn', { onclick: () => { Dialog.top.close(); SettingsUI.show('keymap'); } }, 'Customise in Settings › Keymap'), buttons: [{ label: 'Close', primary: true, value: null }] });
  },
  markdownHelp() { Dialog.open({ title: 'Typing Shortcuts', width: 560, body: h('div.cheat', { html: CHEAT_SHEET_HTML }), buttons: [{ label: 'Close', primary: true, value: null }] }); },
  async checkUpdates(manual) {
    if (!IS_DESKTOP) return;
    try {
      const r = await BRIDGE.checkUpdates();
      if (r && r.newer) notify('Update available', `Version ${r.latest} is ready (you have ${r.current}).`, 'info', { timeout: 0, actions: [{ label: 'Download', run: () => openExternal(r.url) }] });
      else if (manual) notify('You’re up to date', 'Lecture Notes ' + ((r && r.current) || ''), 'success');
    } catch (e) { if (manual) notify('Couldn’t check for updates', String(e && e.message || e), 'warning'); }
  },
  about() {
    Dialog.open({ title: 'About', width: 460, body: h('div.about', { html: `${appLogo(72)}<h2>Lecture Notes</h2><p class="dim">Version ${esc(Store.info.version || '2.0.0')}${IS_DESKTOP ? ' · Electron ' + esc(Store.info.electron || '') : ''}</p><p>An IDE-flavoured notebook for university lectures: themes, keymaps, tool windows and plugins, with maths, code and images built in.</p><p class="dim small">Built with Electron, KaTeX, highlight.js, JetBrains Mono and Inter (open-source licences).</p>` }), buttons: [{ label: 'Close', primary: true, value: null }] });
  },
};
function appLogo(size) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 64 64" aria-hidden="true"><defs><linearGradient id="lg${size}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FF8A3D"/><stop offset=".5" stop-color="#F0397B"/><stop offset="1" stop-color="#7B5CFF"/></linearGradient></defs><rect x="2" y="2" width="60" height="60" rx="14" fill="url(#lg${size})"/><rect x="11" y="11" width="42" height="42" rx="6" fill="#101114"/><path d="M17.5 23.5v13h8" fill="none" stroke="#fff" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/><path d="M30 36.5v-13l9 13v-13" fill="none" stroke="#fff" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/><rect x="17" y="43" width="16" height="3.4" rx="1.2" fill="#fff"/></svg>`;
}

/* ---------------- boot ---------------- */
async function boot() {
  Tip.init();
  Store.onStatus((s, m) => App.setSaveState(s, m));
  let data;
  try { data = await Store.load(); }
  catch (e) { console.error(e); notify('Couldn’t open notes folder', String(e && e.message || e), 'error', { timeout: 0 }); data = { folders: [], notes: {}, settings: null }; }
  SETTINGS = mergeSettings(data.settings);
  applySettings();
  // data + migration from v1 (modules → folders)
  if (data.folders) S.folders = data.folders;
  else if (data.legacyModules) S.folders = data.legacyModules.map(m => ({ id: m.id, name: m.name, parentId: null, color: '', created: 0 }));
  for (const [id, n] of Object.entries(data.notes || {})) S.notes[id] = { ...n, id, folderId: n.folderId || n.moduleId || '' };
  if (!data.folders && data.legacyModules) Store.saveWorkspace();
  loadSession();
  if (!SETTINGS.restoreSession) { S.tabs = []; S.active = null; }
  S.tabs = S.tabs.filter(id => S.notes[id]); S.pinned = S.pinned.filter(id => S.notes[id]); S.recent = S.recent.filter(id => S.notes[id]);
  if (S.active && !S.notes[S.active]) S.active = S.tabs[0] || null;
  if (S.active && !S.tabs.includes(S.active)) S.tabs.push(S.active);
  S.loaded = true;

  registerActions(); Keymap.init();
  initEditorEvents(); Find.init(); App.initTabs(); ToolWindows.initResizers(); Timer.init();
  wireChrome();
  App.refreshChrome(true);
  Editor.mount(S.active);
  App.afterTabs();
  App.setSaveState('saved');
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (SETTINGS.syncOS) { applySettings(); App.refreshChrome(true); } });
  if (IS_DESKTOP) {
    BRIDGE.onContextMenu && BRIDGE.onContextMenu(p => {
      const pc = App.pendingContext; App.pendingContext = null;
      if (pc && Date.now() - pc.t < 1500) { Menu.open(editorMenuItems(pc.target, p), { x: pc.x, y: pc.y }); return; }
      // plain text fields (title, search boxes)
      const el = document.activeElement; if (!el || !(el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) return;
      const items = [];
      if (p.misspelledWord) { (p.dictionarySuggestions || []).slice(0, 4).forEach(sg => items.push({ label: sg, html: `<b>${esc(sg)}</b>`, run: () => BRIDGE.replaceMisspelling(sg) })); items.push('-'); }
      items.push({ label: 'Cut', icon: 'scissors', hint: fmtCombo('Mod+X'), run: () => { el.focus(); exec('cut'); } }, { label: 'Copy', icon: 'copy', hint: fmtCombo('Mod+C'), run: () => { el.focus(); exec('copy'); } }, { label: 'Paste', icon: 'paste', hint: fmtCombo('Mod+V'), run: () => { el.focus(); BRIDGE.paste(); } }, '-', { label: 'Select All', icon: 'selectAll', hint: fmtCombo('Mod+A'), run: () => { el.focus(); el.select(); } });
      Menu.open(items, { x: p.x, y: p.y });
    });
    BRIDGE.onExternalChange && BRIDGE.onExternalChange(async ids => {
      for (const id of ids) {
        const d = await BRIDGE.readNote(id);
        if (!d) { if (S.notes[id] && !Store.busy('n:' + id)) { delete S.notes[id]; if (S.active === id) App.closeTab(id); } continue; }
        const cur = S.notes[id];
        if (cur && (cur.updated || 0) >= (d.updated || 0)) continue;
        S.notes[id] = { ...d, id };
        if (Editor.noteId === id && !Editor.dirty) Editor.mount(id);
      }
      App.refresh();
    });
    BRIDGE.onBeforeQuit && BRIDGE.onBeforeQuit(async () => { Editor.flush(); saveSession.flush(); while (Store.pending > 0) await sleep(50); return true; });
    if (SETTINGS.checkUpdates) setTimeout(() => App.checkUpdates(false), 8000);
  }
  window.addEventListener('beforeunload', () => { Editor.flush(); saveSession.flush(); });
}
function wireChrome() {
  $('#tbSettings').innerHTML = icon('settings');
  const fb = $('#floatBar');
  fb.innerHTML = [['bold', 'bold'], ['italic', 'italic'], ['underline', 'underline'], ['strike', 'strike'], ['highlight', 'highlight'], ['inlineCode', 'code'], ['insertLink', 'link'], '|', ['h1', null, 'H1'], ['h2', null, 'H2'], ['bulletList', 'listBullet'], ['checklist', 'checklist'], ['quote', 'quote'], '|', ['mathInline', 'sigma']]
    .map(x => x === '|' ? '<span class="psep"></span>' : `<button data-action="${x[0]}" data-tip="${esc(Actions.get(x[0]).name)}" data-tip-action="${x[0]}">${x[1] ? icon(x[1]) : `<b style="font:700 11px var(--font-ui)">${x[2]}</b>`}</button>`).join('');
  $('#mainMenuBtn').addEventListener('click', e => App.openMainMenu(e.currentTarget.getBoundingClientRect()));
  $('#menubar').addEventListener('mousedown', e => { const b = e.target.closest('.menubar-item'); if (!b) return; e.preventDefault(); if (b.classList.contains('open')) { Menu.closeAll(); return; } App.openMenubar(+b.dataset.i); });
  $('#menubar').addEventListener('mouseover', e => { const b = e.target.closest('.menubar-item'); if (b && Menu.isOpen && $('#menubar .menubar-item.open') && !b.classList.contains('open')) App.openMenubar(+b.dataset.i); });
  $('#projWidget').addEventListener('click', e => {
    const items = [{ label: 'New Module…', icon: 'folderAdd', run: () => App.newFolder(null) }];
    if (IS_DESKTOP) {
      items.push({ label: 'Open Notes Folder…', icon: 'folderOpen', run: () => BRIDGE.chooseVault() }, { label: 'Show in Explorer', icon: 'external', run: () => BRIDGE.openFolder() });
      const rec = (Store.info.recent || []).filter(p => p !== Store.info.root);
      if (rec.length) { items.push('-', { label: 'Recent Folders', disabled: true }); rec.slice(0, 8).forEach(p => items.push({ label: p.split(/[\\/]/).pop(), hint: p.length > 40 ? '…' + p.slice(-38) : p, icon: 'folder', run: () => BRIDGE.switchVault(p) })); }
    }
    items.push('-', { action: 'settings' });
    Menu.open(items, { rect: e.currentTarget.getBoundingClientRect() });
  });
  $('#modWidget').addEventListener('click', e => {
    const n = S.notes[S.active]; if (!n) return;
    const f = folderById(n.folderId);
    const notes = sortItems(notesInFolder(n.folderId), 'n');
    Menu.open([{ label: 'Select in Project View', icon: 'locate', run: () => Panels.locate() }, { label: 'New Note Here', icon: 'noteAdd', run: () => App.newNote(n.folderId) }, '-', ...notes.slice(0, 25).map(x => ({ label: x.title || 'Untitled', icon: 'noteMd', checked: x.id === S.active, run: () => App.open(x.id) }))], { rect: e.currentTarget.getBoundingClientRect() });
  });
  $('#runWidget').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    const act = b.dataset.act;
    if (act === 'start') Timer.start(); else if (act === 'stop') Timer.stop(); else if (act === 'pause') Timer.pauseToggle(); else if (act === 'stamp') Timer.insertStamp();
    else if (b.classList.contains('run-cfg')) Menu.open([{ action: 'timerStart' }, { action: 'timerPause' }, { action: 'timerStop' }, '-', { action: 'insertTimestamp' }, '-', { label: 'Timer Settings…', icon: 'settings', run: () => SettingsUI.show('timer') }], { rect: b.getBoundingClientRect() });
  });
  $('#toolbar').addEventListener('click', e => { const b = e.target.closest('[data-action]'); if (b) Actions.run(b.dataset.action); });
  $('#toolbar').addEventListener('dblclick', e => { if (IS_DESKTOP && (e.target.id === 'tbDrag' || e.target.id === 'tbTitle')) BRIDGE.toggleMaximize(); });
  $('#stLock').addEventListener('click', () => Actions.run('readOnly'));
  $('#stCaret').addEventListener('click', () => Actions.run('gotoLine'));
  $('#stLeft').addEventListener('click', e => { const f = e.target.closest('[data-folder]'); if (f) { S.treeSel = 'f:' + f.dataset.folder; S.expanded[f.dataset.folder] = true; ToolWindows.open('project'); renderProjectTree(); } });
  $('#empty').addEventListener('click', e => {
    const b = e.target.closest('[data-act]'); if (b) Actions.run(b.dataset.act);
    const t = e.target.closest('[data-theme]'); if (t) { setSetting('theme', t.dataset.theme); App.renderEmpty(); }
  });
  $('#crumbs').addEventListener('click', e => { const c = e.target.closest('.cr'); if (!c) return; const el = $('#crumbs'); if (c.dataset.top) { $('#edScroll').scrollTo({ top: 0, behavior: 'smooth' }); return; } const hd = (el._path || [])[+c.dataset.h]; if (hd) revealBlock(hd, false); });
  $('#gutter').addEventListener('mousedown', e => {
    const f = e.target.closest('.fold'); if (f) { e.preventDefault(); const ln = Gutter.lines[+f.dataset.i]; if (ln && ln.heading) toggleFold(ln.heading); return; }
    const l = e.target.closest('.ln'); if (l && Editor.el) { e.preventDefault(); const ln = Gutter.lines[+l.dataset.i]; if (!ln) return; Editor.el.focus({ preventScroll: true }); const r = document.createRange(); if (ln.pre != null) { const code = preCode(ln.el); const lines = code.textContent.split('\n'); let off = 0; for (let i = 0; i < ln.pre; i++) off += lines[i].length + 1; const [a, ao] = offsetToPos(code, off); const [b, bo] = offsetToPos(code, off + lines[ln.pre].length); getSel().setBaseAndExtent(a, ao, b, bo); } else { r.selectNodeContents(ln.el); getSel().removeAllRanges(); getSel().addRange(r); } }
  });
  $('#edScroll').addEventListener('wheel', e => { if (e.ctrlKey && !e.altKey) { e.preventDefault(); setSetting('fontSize', clamp((SETTINGS.fontSize || 15) + (e.deltaY < 0 ? 0.5 : -0.5), 10, 32), true); } }, { passive: false });
  $('#edPage').addEventListener('mousedown', e => {
    // clicking the empty area below the content puts the caret at the end
    if (!Editor.el || e.target !== $('#edPage') && e.target !== $('#edDoc') && e.target !== $('#editorSlot')) return;
    const last = Editor.el.lastElementChild; if (!last) return;
    if (e.clientY > last.getBoundingClientRect().bottom) { e.preventDefault(); Editor.el.focus({ preventScroll: true }); if (last.tagName !== 'P' || last.textContent.trim()) { const p = emptyP(); Editor.el.appendChild(p); } caretEnd(Editor.el.lastElementChild); Editor.changed({ light: true }); }
  });
  document.addEventListener('ln:settings', () => { Gutter.schedule(); if (Editor.el) FocusMode.update(); });
  window.addEventListener('focus', () => App.updateStatus());
  window.addEventListener('dragover', e => { if (!e.target.closest || !e.target.closest('#edScroll, #projTree, #tabs')) e.preventDefault(); });
  window.addEventListener('drop', e => {
    if (e.target.closest && e.target.closest('#edScroll, #projTree, #tabs')) return;
    e.preventDefault();
    const files = [...(e.dataTransfer && e.dataTransfer.files || [])].filter(f => /\.(md|markdown|txt)$/i.test(f.name));
    if (files.length && defaultFolderId()) files.forEach(async f => { const t = await f.text(); const title = f.name.replace(/\.(md|markdown|txt)$/i, ''); const n = createNote(defaultFolderId(), { title, html: mdToHtml(t) }); App.open(n.id); App.refresh(); });
  });
}
document.addEventListener('DOMContentLoaded', boot);
