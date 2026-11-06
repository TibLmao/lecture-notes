'use strict';
/* ============================================================
   Settings dialog (Ctrl+Alt+S): searchable tree of pages,
   live preview, OK / Cancel / Apply like IntelliJ
   ============================================================ */
const SETTINGS_PAGES = [
  { id: 'appearance', group: 'Appearance & Behavior', title: 'Appearance', keywords: 'theme dark light accent colour ui font size compact new classic background image zoom stripes' },
  { id: 'toolbars', group: 'Appearance & Behavior', title: 'Menus and Toolbars', keywords: 'formatting toolbar floating status bar breadcrumbs tabs' },
  { id: 'system', group: 'Appearance & Behavior', title: 'System Settings', keywords: 'autosave startup confirm delete notes folder updates' },
  { id: 'keymap', group: null, title: 'Keymap', keywords: 'shortcuts keyboard hotkeys bindings vs code intellij' },
  { id: 'editor', group: 'Editor', title: 'General', keywords: 'line numbers current line heading markers folding focus typewriter spell check width spacing callout' },
  { id: 'font', group: 'Editor', title: 'Font', keywords: 'font family size line height ligatures heading code text mono serif' },
  { id: 'colors', group: 'Editor', title: 'Color Scheme', keywords: 'colour scheme syntax highlight heading link code background selection palette' },
  { id: 'code', group: 'Editor', title: 'Code Blocks', keywords: 'syntax highlighting tab size indent auto pair brackets wrap language' },
  { id: 'images', group: 'Editor', title: 'Images', keywords: 'image width resize quality rounded shadow caption paste' },
  { id: 'typing', group: 'Editor', title: 'Smart Keys', keywords: 'markdown shortcuts slash commands symbols arrows paste links' },
  { id: 'plugins', group: null, title: 'Plugins', keywords: 'plugins extensions math katex wiki backlinks timer todo folding history' },
  { id: 'timer', group: 'Tools', title: 'Lecture Timer', keywords: 'timer timestamp lecture recording run' },
  { id: 'history', group: 'Tools', title: 'Local History', keywords: 'versions history backup snapshot restore trash' },
  { id: 'advanced', group: null, title: 'Advanced Settings', keywords: 'project view sort dates counts single click folders' },
];
SETTINGS_PAGES.forEach(p => { p.path = (p.group ? p.group + ' › ' : '') + p.title; });

const SettingsUI = {
  dlg: null, page: 'appearance', original: null, q: '',
  show(page) {
    if (this.dlg) { if (page) this.go(page); return; }
    this.original = structuredClone(SETTINGS);
    this.q = ''; SETTINGS_PAGES.forEach(p => { p._text = null; });
    if (page) this.page = page;
    const search = h('input.field.st-search', { placeholder: 'Search settings', spellcheck: 'false' });
    const tree = h('div.st-tree');
    const crumb = h('div.st-crumb');
    const pane = h('div.st-pane');
    const body = h('div.st', h('div.st-side', h('div.st-sw', { html: icon('search') }, search), tree), h('div.st-main', crumb, pane));
    this.tree = tree; this.pane = pane; this.crumb = crumb; this.search = search;
    this.dlg = Dialog.open({ title: 'Settings', body, width: 'min(1040px, 94vw)', cls: 'settings', onClose: v => this.closed(v),
      footerLeft: h('button.linkbtn', { onclick: () => this.resetPage() }, 'Reset page to defaults'),
      buttons: [
        { label: 'Cancel', value: 'cancel' },
        { label: 'Apply', id: 'apply', run: () => { this.apply(); return false; } },
        { label: 'OK', primary: true, value: 'ok' },
      ] });
    search.addEventListener('input', () => { this.q = search.value.trim().toLowerCase(); this.renderTree(); this.renderPage(); });
    search.addEventListener('keydown', e => { if (e.key === 'ArrowDown') { e.preventDefault(); const vis = this.visiblePages(); const i = vis.findIndex(p => p.id === this.page); if (vis[i + 1]) this.go(vis[i + 1].id); } if (e.key === 'ArrowUp') { e.preventDefault(); const vis = this.visiblePages(); const i = vis.findIndex(p => p.id === this.page); if (vis[i - 1]) this.go(vis[i - 1].id); } });
    this.renderTree(); this.renderPage();
    setTimeout(() => search.focus(), 30);
  },
  closed(v) {
    if (v !== 'ok') { SETTINGS = this.original; applySettings(); Keymap.rebuild(); saveSettings(); App.refreshChrome(true); }
    else this.apply();
    this.dlg = null;
  },
  apply() { saveSettings(); this.original = structuredClone(SETTINGS); Keymap.rebuild(); App.refreshChrome(true); App.status('Settings saved'); },
  changed(rerender) { applySettings(); Keymap.rebuild(); App.refreshChrome(true); if (rerender) this.renderPage(); },
  set(k, v, rerender) { SETTINGS[k] = v; this.changed(rerender); },
  go(id) { this.page = id; this.renderTree(); this.renderPage(); },
  pageText(p) { if (!p._text) { const el = this.build(p.id); p._text = (p.title + ' ' + p.keywords + ' ' + el.textContent).toLowerCase(); } return p._text; },
  visiblePages() { return this.q ? SETTINGS_PAGES.filter(p => this.pageText(p).includes(this.q)) : SETTINGS_PAGES; },
  renderTree() {
    const vis = new Set(this.visiblePages().map(p => p.id));
    if (this.q && !vis.has(this.page) && vis.size) this.page = [...vis][0];
    const groups = []; const seen = new Set();
    for (const p of SETTINGS_PAGES) {
      if (!vis.has(p.id)) continue;
      if (p.group && !seen.has(p.group)) { seen.add(p.group); groups.push({ head: p.group }); }
      groups.push(p);
    }
    this.tree.innerHTML = groups.map(g => g.head ? `<div class="st-g">${icon('chevronDown')}${esc(g.head)}</div>` : `<div class="stt-i${g.group ? ' sub' : ''}${g.id === this.page ? ' sel' : ''}" data-p="${g.id}">${esc(g.title)}</div>`).join('') || '<div class="st-none">Nothing found</div>';
    this.tree.onclick = e => { const i = e.target.closest('.stt-i'); if (i) this.go(i.dataset.p); };
  },
  renderPage() {
    const p = SETTINGS_PAGES.find(x => x.id === this.page) || SETTINGS_PAGES[0];
    this.crumb.innerHTML = (p.group ? `<span>${esc(p.group)}</span>${icon('chevronRight')}` : '') + `<b>${esc(p.title)}</b>`;
    const el = this.build(p.id);
    this.pane.innerHTML = ''; this.pane.appendChild(el);
    if (this.q) {
      const w = textWalker(el); let n; const hits = [];
      while ((n = w.nextNode())) { const i = n.textContent.toLowerCase().indexOf(this.q); if (i >= 0 && !n.parentElement.closest('select,option,textarea')) hits.push([n, i]); }
      hits.slice(0, 60).forEach(([node, i]) => { const r = document.createRange(); r.setStart(node, i); r.setEnd(node, i + this.q.length); const m = document.createElement('mark'); try { r.surroundContents(m); } catch (e) {} });
    }
  },
  resetPage() {
    const keys = { appearance: ['theme', 'uiStyle', 'accent', 'uiFont', 'uiSize', 'compact', 'zoom', 'animations', 'stripeNames', 'fileColors', 'showStripes', 'bgImage', 'bgOpacity', 'bgFit', 'bgTarget', 'syncOS', 'themeLight', 'themeDark'],
      toolbars: ['showFormatBar', 'floatingBar', 'showStatusBar', 'showBreadcrumbs'], system: ['autosaveDelay', 'confirmDelete', 'restoreSession', 'checkUpdates'],
      editor: ['lineNumbers', 'currentLine', 'headingMarkers', 'foldIcons', 'focusMode', 'typewriter', 'spellcheck', 'spellLang', 'editorWidth', 'paraSpacing', 'calloutDefault'],
      font: ['textFont', 'headingFont', 'codeFont', 'fontSize', 'codeSize', 'lineHeight', 'ligatures'], code: ['codeTab', 'autoPairs', 'wrapCode', 'codeLang'],
      images: ['imgWidth', 'imgMaxDim', 'imgQuality', 'imgRounded', 'imgShadow', 'imgCaptions'], timer: ['timerHeadings', 'timerHours'], history: ['historyMinutes', 'historyDays'],
      advanced: ['projectSort', 'projectDates', 'projectCounts', 'foldersFirst', 'singleClickOpen'] }[this.page] || [];
    keys.forEach(k => { if (k in DEFAULT_SETTINGS) SETTINGS[k] = structuredClone(DEFAULT_SETTINGS[k]); });
    if (this.page === 'keymap') { SETTINGS.keymap = {}; SETTINGS.keymapPreset = 'intellij'; }
    if (this.page === 'colors') { SETTINGS.schemeOverrides = { ...SETTINGS.schemeOverrides, [SETTINGS.theme]: {} }; }
    if (this.page === 'plugins' || this.page === 'typing') SETTINGS.plugins = structuredClone(DEFAULT_SETTINGS.plugins);
    this.changed(true);
  },

  /* ---------------- page builders ---------------- */
  build(id) {
    const B = this.builders[id]; const el = h('div.st-page');
    try { B.call(this, el); } catch (e) { console.error(e); el.appendChild(h('p', 'Error rendering page: ' + e.message)); }
    return el;
  },
  builders: {
    appearance(el) {
      const S_ = SETTINGS;
      el.appendChild(sec('Theme'));
      const grid = h('div.theme-grid');
      THEMES.forEach(t => {
        const card = h('button.theme-card' + (S_.theme === t.id ? '.on' : ''), { type: 'button', onclick: () => { this.set('theme', t.id, true); } },
          h('div.tc-prev', { style: { background: t.ui.win } },
            h('div.tc-bar', { style: { background: t.ui.win, borderColor: t.ui.border } }, h('i', { style: { background: t.ui.accent } })),
            h('div.tc-body', h('div.tc-side', { style: { background: t.ui.panel, borderColor: t.ui.border } }, ...[0, 1, 2].map(i => h('b', { style: { background: i === 1 ? t.ui.sel : mix(t.ui.fg, t.ui.panel, 0.25) } }))),
              h('div.tc-ed', { style: { background: t.ed.bg } }, h('b', { style: { background: t.ed.h1, width: '46%' } }), h('b', { style: { background: t.ed.text, width: '80%', opacity: .55 } }), h('b', { style: { background: t.ed.text, width: '64%', opacity: .55 } }), h('b', { style: { background: t.ed.kw, width: '30%' } }), h('b', { style: { background: t.ed.str, width: '52%' } })))),
          h('div.tc-name', t.name, S_.theme === t.id ? h('span', { html: icon('check') }) : null));
        grid.appendChild(card);
      });
      el.appendChild(grid);
      el.appendChild(row('Sync with OS', h('div.inline', toggleSwitch(S_.syncOS, v => this.set('syncOS', v, true)), h('span.hint', 'Switch between a light and dark theme automatically'))));
      if (S_.syncOS) {
        el.appendChild(row('Light theme', selectBox(THEMES.filter(t => !t.dark).map(t => [t.id, t.name]), S_.themeLight, v => this.set('themeLight', v))));
        el.appendChild(row('Dark theme', selectBox(THEMES.filter(t => t.dark).map(t => [t.id, t.name]), S_.themeDark, v => this.set('themeDark', v))));
      }
      el.appendChild(sec('Interface'));
      el.appendChild(row('UI style', h('div.seg', ...[['new', 'New UI', 'Rounded, airy, icon-only tool window bars'], ['classic', 'Classic UI', 'Dense menu bar, labelled tool window bars']].map(([v, l, d]) => h('button.seg-b' + ((S_.uiStyle === v || (v === 'new' && S_.uiStyle !== 'classic')) ? '.on' : ''), { type: 'button', onclick: () => this.set('uiStyle', v, true) }, h('b', l), h('span', d))))));
      const acc = h('div.swatches', ...ACCENTS.map(([c, l]) => h('button.sw' + ((S_.accent || '') === c ? '.on' : ''), { type: 'button', title: l, style: { background: c || resolveTheme({ ...S_, accent: '' }).ui.accent }, onclick: () => this.set('accent', c, true) }, c ? '' : h('span', 'A'))));
      const custom = h('input', { type: 'color', value: validHex(S_.accent) ? S_.accent : '#3574F0', title: 'Custom accent' });
      custom.addEventListener('input', () => this.set('accent', custom.value.toUpperCase()));
      custom.addEventListener('change', () => this.renderPage());
      acc.appendChild(h('label.sw.custom', { title: 'Custom colour' }, custom, h('span', { html: icon('plus') })));
      el.appendChild(row('Accent colour', acc));
      el.appendChild(row('UI font', h('div.inline', selectBox(FONTS.filter(f => f[1] !== 'serif').map(f => [f[0], f[0]]), S_.uiFont, v => this.set('uiFont', v)), h('span.lbl', 'Size'), numberField(S_.uiSize, { min: 10, max: 18, step: 0.5 }, v => this.set('uiSize', v)))));
      if (IS_DESKTOP) el.appendChild(row('Zoom', h('div.inline', h('input.range', { type: 'range', min: 60, max: 200, step: 5, value: S_.zoom, oninput: e => { this.set('zoom', +e.target.value); e.target.nextSibling.textContent = e.target.value + '%'; } }), h('span.lbl', S_.zoom + '%'))));
      el.appendChild(cbs([
        ['Compact mode', 'compact', 'Smaller paddings everywhere'], ['Enable animations', 'animations'], ['Show tool window bars', 'showStripes'],
        ['Show tool window names on bars', 'stripeNames', 'Always on in Classic UI'], ['File colours', 'fileColors', 'Tint tabs and notes with their module’s colour'],
      ], this));
      el.appendChild(sec('Background Image'));
      const bgRow = h('div.inline',
        h('button.btn', { type: 'button', onclick: () => chooseBackground(this) }, S_.bgImage ? 'Change Image…' : 'Choose Image…'),
        S_.bgImage ? h('button.btn', { type: 'button', onclick: () => this.set('bgImage', '', true) }, 'Remove') : null,
        S_.bgImage ? h('span.bg-thumb', { style: { backgroundImage: `url("${S_.bgImage}")` } }) : h('span.hint', 'Like IntelliJ’s “Set Background Image”'));
      el.appendChild(row('Image', bgRow));
      if (S_.bgImage) {
        el.appendChild(row('Opacity', h('div.inline', h('input.range', { type: 'range', min: 2, max: 60, value: S_.bgOpacity, oninput: e => { this.set('bgOpacity', +e.target.value); e.target.nextSibling.textContent = e.target.value + '%'; } }), h('span.lbl', S_.bgOpacity + '%'))));
        el.appendChild(row('Fill', selectBox([['cover', 'Fill'], ['contain', 'Fit'], ['tile', 'Tile']], S_.bgFit, v => this.set('bgFit', v))));
        el.appendChild(row('Show behind', selectBox([['editor', 'Editor only'], ['frame', 'Whole window']], S_.bgTarget, v => this.set('bgTarget', v))));
      }
    },
    toolbars(el) {
      el.appendChild(sec('Editor'));
      el.appendChild(cbs([['Show formatting toolbar', 'showFormatBar', 'The row of formatting buttons above the editor'], ['Show floating toolbar on selection', 'floatingBar', 'Bold, italic, link… right where you selected'], ['Show breadcrumbs', 'showBreadcrumbs', 'Heading path at the bottom of the editor']], this));
      el.appendChild(sec('Window'));
      el.appendChild(cbs([['Show status bar', 'showStatusBar'], ['Show tool window bars', 'showStripes']], this));
    },
    system(el) {
      el.appendChild(sec('Startup & Saving'));
      el.appendChild(cbs([['Reopen notes from last session on startup', 'restoreSession'], ['Confirm before deleting', 'confirmDelete'], IS_DESKTOP ? ['Check for updates on startup', 'checkUpdates'] : null].filter(Boolean), this));
      el.appendChild(row('Autosave after', h('div.inline', numberField(SETTINGS.autosaveDelay, { min: 150, max: 5000, step: 50 }, v => this.set('autosaveDelay', v)), h('span.lbl', 'ms of inactivity'))));
      if (IS_DESKTOP) {
        el.appendChild(sec('Notes Folder'));
        el.appendChild(row('Location', h('div.inline.wrap', h('code.path', Store.info.root || ''), h('button.btn', { type: 'button', onclick: () => BRIDGE.chooseVault() }, 'Change…'), h('button.btn', { type: 'button', onclick: () => BRIDGE.openFolder() }, 'Open'))));
        el.appendChild(h('p.hint.block', 'Tip: put your notes folder inside OneDrive, Google Drive or Dropbox to sync it between computers.'));
      }
    },
    keymap(el) {
      const top = h('div.inline.wrap',
        selectBox(Object.entries(KEYMAP_PRESETS), SETTINGS.keymapPreset, v => { this.set('keymapPreset', v, true); }),
        h('input.field.km-q', { placeholder: 'Search actions', spellcheck: 'false', value: this._kmq || '', oninput: e => { this._kmq = e.target.value; renderList(); } }),
        h('button.btn', { type: 'button', onclick: async () => { const b = top.querySelector('.km-rec'); b.textContent = 'Press keys…'; const c = await KeyRecorder.capture(); b.textContent = 'Find by Shortcut'; this._kmCombo = c ? normCombo(c) : null; renderList(); } }, h('span.km-rec', 'Find by Shortcut')),
        h('span.hint', Object.keys(SETTINGS.keymap || {}).length ? `${Object.keys(SETTINGS.keymap).length} customised` : ''));
      el.appendChild(top);
      const list = h('div.km-list'); el.appendChild(list);
      const renderList = () => {
        const q = (this._kmq || '').toLowerCase(); const combo = this._kmCombo;
        const groups = {};
        for (const a of Actions.list) {
          const keys = Keymap.keysFor(a.id);
          if (q && !(a.name.toLowerCase().includes(q) || a.group.toLowerCase().includes(q) || keys.some(k => fmtCombo(k).toLowerCase().includes(q)))) continue;
          if (combo && !keys.some(k => normCombo(k) === combo)) continue;
          (groups[a.group] = groups[a.group] || []).push(a);
        }
        list.innerHTML = '';
        if (combo) list.appendChild(h('div.km-filter', 'Showing actions bound to ', h('kbd', fmtCombo(combo)), ' ', h('button.linkbtn', { onclick: () => { this._kmCombo = null; renderList(); } }, 'Clear')));
        for (const [g, acts] of Object.entries(groups)) {
          list.appendChild(h('div.km-g', g));
          for (const a of acts) {
            const keys = Keymap.keysFor(a.id); const custom = SETTINGS.keymap && SETTINGS.keymap[a.id];
            const r = h('div.km-row' + (custom ? '.custom' : ''), h('span.km-ic', { html: a.icon ? icon(a.icon) : '' }), h('span.km-n', a.name), h('span.km-k', ...keys.map(k => h('kbd', fmtCombo(k)))));
            r.addEventListener('click', e => Menu.open([
              { label: 'Add Keyboard Shortcut…', icon: 'keyboard', run: () => recordShortcut(a, () => { renderList(); this.changed(); }) },
              ...keys.map(k => ({ label: 'Remove ' + fmtCombo(k), icon: 'minus', run: () => { Keymap.setKeys(a.id, keys.filter(x => x !== k)); renderList(); this.changed(); } })),
              custom ? '-' : null, custom ? { label: 'Reset Shortcuts', icon: 'refresh', run: () => { Keymap.reset(a.id); renderList(); this.changed(); } } : null,
            ].filter(Boolean), { x: e.clientX, y: e.clientY }));
            list.appendChild(r);
          }
        }
        if (!list.children.length) list.appendChild(h('div.tw-empty', h('p.dim', 'No actions match')));
      };
      renderList();
    },
    editor(el) {
      el.appendChild(sec('Appearance'));
      el.appendChild(cbs([['Show line numbers', 'lineNumbers'], ['Highlight current line', 'currentLine'], ['Show # markers before headings', 'headingMarkers'], ['Show folding arrows in the gutter', 'foldIcons']], this));
      el.appendChild(row('Text width', selectBox([['680', 'Narrow (680px)'], ['860', 'Medium (860px)'], ['1080', 'Wide (1080px)'], ['0', 'Full width']], String(SETTINGS.editorWidth), v => this.set('editorWidth', +v))));
      el.appendChild(row('Paragraph spacing', h('div.inline', h('input.range', { type: 'range', min: 0, max: 1.4, step: 0.05, value: SETTINGS.paraSpacing, oninput: e => { this.set('paraSpacing', +e.target.value); e.target.nextSibling.textContent = (+e.target.value).toFixed(2) + ' em'; } }), h('span.lbl', SETTINGS.paraSpacing.toFixed(2) + ' em'))));
      el.appendChild(sec('Writing Modes'));
      el.appendChild(cbs([['Focus mode', 'focusMode', 'Dim everything except the paragraph you’re writing'], ['Typewriter scrolling', 'typewriter', 'Keep the line you’re typing in the middle of the screen']], this));
      el.appendChild(sec('Spelling'));
      el.appendChild(cbs([['Check spelling as you type', 'spellcheck']], this));
      el.appendChild(row('Language', selectBox([['en-GB', 'English (UK)'], ['en-US', 'English (US)'], ['fr', 'French'], ['de', 'German'], ['es', 'Spanish'], ['it', 'Italian'], ['pt-BR', 'Portuguese (Brazil)'], ['nl', 'Dutch']], SETTINGS.spellLang, v => this.set('spellLang', v))));
      el.appendChild(sec('Callouts'));
      el.appendChild(row('Default callout (!! + space)', selectBox(Object.entries(CALLOUTS).map(([k, v]) => [k, v[0]]), SETTINGS.calloutDefault, v => this.set('calloutDefault', v))));
    },
    font(el) {
      const fopts = kind => FONTS.filter(f => !kind || f[1] === kind || kind === 'any').map(f => [f[0], f[0] + (f[1] === 'mono' ? '  · mono' : f[1] === 'serif' ? '  · serif' : '')]);
      el.appendChild(sec('Text'));
      el.appendChild(row('Font', h('div.inline', selectBox(fopts('any'), SETTINGS.textFont, v => this.set('textFont', v, true)), h('span.lbl', 'Size'), numberField(SETTINGS.fontSize, { min: 10, max: 32, step: 0.5 }, v => this.set('fontSize', v, true)), h('span.lbl', 'Line height'), numberField(SETTINGS.lineHeight, { min: 1, max: 2.6, step: 0.05 }, v => this.set('lineHeight', v, true)))));
      el.appendChild(row('Headings', selectBox(fopts('any'), SETTINGS.headingFont, v => this.set('headingFont', v, true))));
      el.appendChild(sec('Code'));
      el.appendChild(row('Font', h('div.inline', selectBox(fopts('mono'), SETTINGS.codeFont, v => this.set('codeFont', v, true)), h('span.lbl', 'Size'), numberField(SETTINGS.codeSize, { min: 9, max: 28, step: 0.5 }, v => this.set('codeSize', v, true)))));
      el.appendChild(cbs([['Enable font ligatures', 'ligatures', 'Turns != into ≠ and -> into → in fonts that support it (JetBrains Mono, Fira Code)']], this));
      el.appendChild(sec('Preview'));
      el.appendChild(h('div.font-prev.doc-render', { html: `<h2>Quicksort</h2><p>Divide and conquer: pick a <strong>pivot</strong>, partition, recurse. Average <code>O(n log n)</code>, worst <code>O(n²)</code>.</p><pre><code>${esc('def quicksort(xs):\n    if len(xs) <= 1: return xs  # base case\n    p, *rest = xs\n    return quicksort([x for x in rest if x < p]) + [p] + quicksort([x for x in rest if x >= p])')}\n</code></pre>` }));
      const pre = el.querySelector('.font-prev pre'); if (pre) { pre.dataset.lang = 'python'; highlightPre(pre); }
    },
    colors(el) {
      const t = resolveTheme(SETTINGS); const base = THEME_BY_ID[SETTINGS.theme];
      const ov = (SETTINGS.schemeOverrides || {})[SETTINGS.theme] || {};
      el.appendChild(row('Scheme', h('div.inline.wrap', selectBox(THEMES.map(x => [x.id, x.name]), SETTINGS.theme, v => this.set('theme', v, true)),
        h('button.btn', { type: 'button', onclick: () => { SETTINGS.schemeOverrides = { ...SETTINGS.schemeOverrides, [SETTINGS.theme]: {} }; this.changed(true); } }, 'Reset All'),
        h('button.btn', { type: 'button', onclick: () => copyText(JSON.stringify({ theme: SETTINGS.theme, colors: t.ed }, null, 1)) }, 'Copy as JSON'),
        h('button.btn', { type: 'button', onclick: () => importScheme(this) }, 'Paste JSON…'),
        Object.keys(ov).length ? h('span.hint', `${Object.keys(ov).length} customised`) : null)));
      const wrap = h('div.cs-wrap'); const list = h('div.cs-list'); const prev = h('div.cs-prev.doc-render');
      let group = '';
      for (const [k, label, g] of SCHEME_KEYS) {
        if (g !== group) { group = g; list.appendChild(h('div.cs-g', g)); }
        const val = t.ed[k]; const isOv = k in ov;
        const color = h('input', { type: 'color', value: validHex(val) ? normHex(val) : '#808080' });
        const hex = h('input.field.hex', { value: normHex(val), spellcheck: 'false', maxlength: 7 });
        const setVal = (v, rr) => { const o = { ...((SETTINGS.schemeOverrides || {})[SETTINGS.theme] || {}) }; if (v == null || normHex(v) === normHex(base.ed[k])) delete o[k]; else o[k] = normHex(v); SETTINGS.schemeOverrides = { ...SETTINGS.schemeOverrides, [SETTINGS.theme]: o }; this.changed(rr); };
        color.addEventListener('input', () => { hex.value = color.value.toUpperCase(); setVal(color.value); });
        color.addEventListener('change', () => this.renderPage());
        hex.addEventListener('change', () => { if (validHex(hex.value)) { color.value = normHex(hex.value); setVal(hex.value, true); } else hex.value = normHex(val); });
        list.appendChild(h('div.cs-row' + (isOv ? '.ov' : ''), h('span.cs-l', label), h('label.cs-sw', { style: { background: val } }, color), hex, h('button.ibtn.sm', { html: icon('refresh'), title: 'Reset to theme default', disabled: isOv ? null : true, onclick: () => setVal(null, true) })));
      }
      prev.innerHTML = `<h1>Lecture 4: Graphs</h1><p>A <strong>graph</strong> is a pair <span class="math" data-tex="G = (V, E)"></span>. See <a class="wikilink">Lecture 3</a> and <a href="#">this link</a>. <span class="hl">Exam favourite.</span> Use <code>adj[v]</code> for neighbours.</p><h2>Traversal</h2><blockquote class="callout" data-type="definition"><p>BFS visits vertices in order of distance from the source.</p></blockquote><h3>Complexity</h3><ul class="checklist"><li class="done">Read chapter 22</li><li>Do problem sheet</li></ul><blockquote><p>“Premature optimisation is the root of all evil.”</p></blockquote><pre data-lang="python"><code>${esc('def bfs(g, s):\n    seen = {s}  # visited set\n    queue = deque([s])\n    while queue:\n        v = queue.popleft()\n        for w in g[v]:\n            if w not in seen: seen.add(w); queue.append(w)\n    return len(seen) * 2')}\n</code></pre><table><tbody><tr><th>Algorithm</th><th>Time</th></tr><tr><td>BFS</td><td>O(V + E)</td></tr></tbody></table>`;
      prev.querySelectorAll('.math').forEach(renderMath); prev.querySelectorAll('blockquote.callout').forEach(decorateCallout); prev.querySelectorAll('pre').forEach(highlightPre);
      wrap.append(list, prev); el.appendChild(wrap);
    },
    code(el) {
      el.appendChild(cbs([['Syntax highlighting', null, 'Colour code blocks using the colour scheme', () => plugin('syntax'), v => { togglePlugin('syntax', v); Editor.el && Editor.el.querySelectorAll('pre').forEach(highlightPre); }], ['Auto-close brackets and quotes', 'autoPairs'], ['Soft-wrap long lines in code blocks', 'wrapCode']], this));
      el.appendChild(row('Tab size', selectBox([['2', '2 spaces'], ['4', '4 spaces'], ['8', '8 spaces']], String(SETTINGS.codeTab), v => this.set('codeTab', +v))));
      el.appendChild(row('Default language', selectBox([['', 'Auto-detect'], ...HL_LANGS.map(l => [l, LANG_LABEL[l] || l])], SETTINGS.codeLang, v => this.set('codeLang', v))));
    },
    images(el) {
      el.appendChild(row('Default width', selectBox([['', 'Original size'], ['25', '25%'], ['50', '50%'], ['75', '75%'], ['100', 'Full width']], String(SETTINGS.imgWidth), v => this.set('imgWidth', v))));
      el.appendChild(row('Downscale larger than', h('div.inline', numberField(SETTINGS.imgMaxDim, { min: 600, max: 8000, step: 100 }, v => this.set('imgMaxDim', v)), h('span.lbl', 'px'))));
      el.appendChild(row('JPEG quality', h('div.inline', h('input.range', { type: 'range', min: 0.5, max: 1, step: 0.02, value: SETTINGS.imgQuality, oninput: e => { this.set('imgQuality', +e.target.value); e.target.nextSibling.textContent = Math.round(e.target.value * 100) + '%'; } }), h('span.lbl', Math.round(SETTINGS.imgQuality * 100) + '%'))));
      el.appendChild(cbs([['Rounded corners', 'imgRounded'], ['Drop shadow', 'imgShadow'], ['Show captions', 'imgCaptions']], this));
      el.appendChild(h('p.hint.block', 'Paste a screenshot (Win+Shift+S then Ctrl+V), drag a file in, or press ' + fmtCombo(Keymap.first('insertImage')) + '. Click an image to resize it, drag its corner, or double-click to see it full size.'));
    },
    typing(el) {
      el.appendChild(cbs(PLUGINS.filter(p => ['markdown', 'slash', 'symbols', 'smartPaste', 'wiki'].includes(p[0])).map(p => [p[1], null, p[3], () => plugin(p[0]), v => togglePlugin(p[0], v)]), this));
      el.appendChild(sec('Cheat Sheet'));
      el.appendChild(h('div.cheat', { html: CHEAT_SHEET_HTML }));
    },
    plugins(el) {
      el.appendChild(h('p.hint.block', 'All plugins are bundled. Turn off anything you don’t use.'));
      const grid = h('div.pl-grid');
      for (const [id, name, ic, desc] of PLUGINS) {
        grid.appendChild(h('div.pl-card' + (plugin(id) ? '.on' : ''), h('div.pl-ic', { html: icon(ic, '', 22) }), h('div.pl-t', h('b', name), h('span', 'Bundled')), h('p', desc), toggleSwitch(plugin(id), v => { togglePlugin(id, v); this.renderPage(); if (Editor.el) { Editor.mount(Editor.noteId); } })));
      }
      el.appendChild(grid);
    },
    timer(el) {
      el.appendChild(h('p.hint.block', `Start the timer with the ▶ button in the toolbar (${fmtCombo(Keymap.first('timerStart'))}). Press ${fmtCombo(Keymap.first('insertTimestamp'))} to drop a timestamp into your notes, so you can find that moment in the lecture recording later.`));
      el.appendChild(cbs([['Add a timestamp to new headings while recording', 'timerHeadings'], ['Always show hours (0:05:12)', 'timerHours']], this));
    },
    history(el) {
      el.appendChild(cbs([['Keep Local History of notes', null, 'Earlier versions are saved next to your notes so you can restore them', () => plugin('history'), v => togglePlugin('history', v)]], this));
      el.appendChild(row('Save a version at most every', h('div.inline', numberField(SETTINGS.historyMinutes, { min: 1, max: 120 }, v => this.set('historyMinutes', v)), h('span.lbl', 'minutes'))));
      el.appendChild(row('Keep versions for', h('div.inline', numberField(SETTINGS.historyDays, { min: 1, max: 365 }, v => this.set('historyDays', v)), h('span.lbl', 'days'))));
      if (IS_DESKTOP) el.appendChild(h('div.inline', h('button.btn', { type: 'button', onclick: () => { this.dlg.close('ok'); HistoryUI.trash(); } }, 'Restore Deleted Notes…')));
    },
    advanced(el) {
      el.appendChild(sec('Project View'));
      el.appendChild(row('Sort notes by', selectBox([['created', 'Date created'], ['name', 'Name'], ['updated', 'Last modified']], SETTINGS.projectSort, v => this.set('projectSort', v))));
      el.appendChild(cbs([['Show dates next to notes', 'projectDates'], ['Show note counts next to modules', 'projectCounts'], ['Folders always on top', 'foldersFirst'], ['Open notes with a single click', 'singleClickOpen']], this));
    },
  },
};
function sec(t) { return h('div.st-sec', t); }
function row(label, control, hint) { return h('div.st-row', h('label.st-l', label), h('div.st-c', control, hint ? h('div.hint', hint) : null)); }
function cbs(list, ctx) {
  const wrap = h('div.st-cbs');
  for (const it of list) {
    const [label, key, hint, get, set] = it;
    const on = get ? get() : SETTINGS[key];
    wrap.appendChild(checkbox(label, on, v => { if (set) set(v); else ctx.set(key, v); }, hint));
  }
  return wrap;
}
async function recordShortcut(a, done) {
  const disp = h('div.rec-k', 'Press a key combination…');
  const warn = h('div.rec-w');
  let combo = null;
  const d = Dialog.open({ title: 'Keyboard Shortcut: ' + a.name, width: 440, body: h('div', disp, warn, h('div.hint', 'Press Esc to cancel. Combinations with Ctrl, Alt or Shift work best.')), buttons: [{ label: 'Cancel', value: null }, { label: 'OK', primary: true, disabled: true, run: () => { if (!combo) return false; Keymap.setKeys(a.id, [...Keymap.keysFor(a.id).filter(k => normCombo(k) !== combo), combo]); done(); } }] });
  const c = await KeyRecorder.capture();
  if (!c) { d.close(null); return; }
  combo = normCombo(c); disp.textContent = fmtCombo(combo); disp.classList.add('set');
  const conf = Keymap.conflicts(combo, a.id);
  warn.textContent = conf.length ? `Also assigned to: ${conf.map(x => x.name).join(', ')}` : '';
  d.buttons.OK.disabled = false; d.buttons.OK.focus();
}
function chooseBackground(ctx) {
  const inp = h('input', { type: 'file', accept: 'image/*' });
  inp.addEventListener('change', async () => {
    const f = inp.files[0]; if (!f) return;
    try { const small = await downscaleImage(f, 2200, 0.85); const url = await blobToDataURL(small); ctx.set('bgImage', url, true); }
    catch (e) { notify('Couldn’t use that image', String(e.message || e), 'error'); }
  });
  inp.click();
}
async function importScheme(ctx) {
  const ta = h('textarea.field.mono.no-enter', { rows: 10, placeholder: '{ "colors": { "h1": "#FF8800", … } }' });
  Dialog.open({ title: 'Paste Colour Scheme JSON', width: 520, body: ta, buttons: [{ label: 'Cancel', value: null }, { label: 'Import', primary: true, run: () => {
    try { const j = JSON.parse(ta.value); const colors = j.colors || j; const o = {}; for (const [k] of SCHEME_KEYS) if (colors[k] && validHex(colors[k])) o[k] = normHex(colors[k]); SETTINGS.schemeOverrides = { ...SETTINGS.schemeOverrides, [SETTINGS.theme]: o }; ctx.changed(true); }
    catch (e) { notify('Invalid JSON', e.message, 'error'); return false; }
  } }] });
}
const CHEAT_SHEET_HTML = `<table><tbody>
<tr><td><code># </code> <code>## </code> <code>### </code></td><td>Headings</td></tr>
<tr><td><code>- </code> <code>1. </code> <code>[] </code></td><td>Bullet, numbered and checkbox lists</td></tr>
<tr><td><code>&gt; </code> <code>!! </code></td><td>Quote and callout box</td></tr>
<tr><td><code>\`\`\`python</code> + Enter</td><td>Code block in a language</td></tr>
<tr><td><code>$$</code> + Enter, <code>$x^2$</code></td><td>Equation and inline maths</td></tr>
<tr><td><code>---</code> + Enter</td><td>Divider</td></tr>
<tr><td><code>**bold**</code> <code>*italic*</code> <code>\`code\`</code> <code>==mark==</code> <code>~~strike~~</code></td><td>Inline formatting</td></tr>
<tr><td><code>[[</code></td><td>Link to another note</td></tr>
<tr><td><code>/</code></td><td>Insert anything</td></tr>
<tr><td><code>-&gt;</code> <code>=&gt;</code> <code>!=</code> <code>&lt;=</code></td><td>→ ⇒ ≠ ≤</td></tr>
</tbody></table>`;
