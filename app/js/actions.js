'use strict';
/* ============================================================
   Actions, keymap (with presets) and the main menu model
   ============================================================ */
const Actions = {
  map: new Map(), list: [],
  reg(id, name, opts = {}) {
    const a = { id, name, group: opts.group || 'Other', icon: opts.icon || null, keys: opts.keys || {}, run: opts.run || (() => {}), toggle: opts.toggle || null, enabled: opts.enabled || null, ctx: opts.ctx || 'global', edit: !!opts.edit, native: !!opts.native, desc: opts.desc || '', anywhere: !!opts.anywhere, hidden: !!opts.hidden, keywords: opts.keywords || '' };
    this.map.set(id, a); this.list.push(a); return a;
  },
  get(id) { return this.map.get(id) || null; },
  run(id, ...args) {
    const a = this.get(id); if (!a) return false;
    if (a.enabled && !a.enabled()) return false;
    try {
      if (a.edit && Editor.el) { if (Editor.readOnly) { App.status('Note is read-only (click the lock in the status bar to edit)'); return true; } ensureFocus(); }
      a.run(...args);
    } catch (e) { console.error(e); notify('Action failed', a.name + ': ' + (e && e.message || e), 'error'); }
    if (a.toggle) App.refreshChrome();
    return true;
  },
};

/* ---------------- Keymap ---------------- */
const KEYMAP_PRESETS = { intellij: 'IntelliJ IDEA', vscode: 'VS Code' };
const Keymap = {
  index: new Map(),
  keysFor(id) {
    const ov = SETTINGS.keymap && SETTINGS.keymap[id];
    if (Array.isArray(ov)) return ov;
    const a = Actions.get(id); if (!a) return [];
    const p = SETTINGS.keymapPreset || 'intellij';
    return (a.keys[p] !== undefined ? a.keys[p] : a.keys.intellij) || [];
  },
  first(id) { return this.keysFor(id)[0] || ''; },
  rebuild() {
    this.index.clear();
    for (const a of Actions.list) for (const k of this.keysFor(a.id)) {
      const c = normCombo(k); if (!this.index.has(c)) this.index.set(c, []); this.index.get(c).push(a);
    }
  },
  conflicts(combo, exceptId) { return (this.index.get(normCombo(combo)) || []).filter(a => a.id !== exceptId); },
  setKeys(id, keys) { SETTINGS.keymap = { ...SETTINGS.keymap, [id]: keys }; this.rebuild(); saveSettings(); },
  reset(id) { const k = { ...SETTINGS.keymap }; delete k[id]; SETTINGS.keymap = k; this.rebuild(); saveSettings(); },
  isEditorFocus() { const ae = document.activeElement; return !!(Editor.el && ae && (ae === Editor.el || Editor.el.contains(ae))); },
  isTextField(el) { return el && (el.tagName === 'INPUT' && !/^(checkbox|radio|button|color|range)$/.test(el.type) || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || (el.isContentEditable && el !== Editor.el && !(Editor.el && Editor.el.contains(el)))); },
  shiftDown: 0, lastShiftUp: 0, otherKey: false,
  init() {
    this.rebuild();
    document.addEventListener('keydown', e => this.onKeyDown(e), true);
    document.addEventListener('keyup', e => this.onKeyUp(e), true);
  },
  onKeyDown(e) {
    if (e.key === 'Shift') { if (!e.repeat) { this.otherKey = false; } return; }
    this.otherKey = true;
    if (KeyRecorder.active) return;
    if (Menu.isOpen && Menu.handleKey(e)) return;
    if (Dialog.top) { if (Dialog.handleKey(e)) return; if (!e.target.closest('.dlg')) { e.preventDefault(); } if (!(e.ctrlKey || e.metaKey || e.altKey) || /^F\d/.test(e.key)) return; }
    if (Popups.handleKey(e)) return;
    if (Editor.comp && Editor.comp.popup.handleKey(e)) return;
    if (e.key === 'Tab' && e.ctrlKey) { e.preventDefault(); Switcher.step(e.shiftKey ? -1 : 1); return; }
    if (e.key === 'Escape') { if (Find.open && (this.isEditorFocus() || e.target.closest('#findbar'))) { e.preventDefault(); Find.hide(); return; } if (Overlays) Overlays.hideAll(); if (Editor.selFig) { Overlays.hideImg(); } if (App.escape()) { e.preventDefault(); return; } return; }
    const combo = comboFromEvent(e); if (!combo) return;
    const cands = this.index.get(combo); if (!cands) return;
    const inText = this.isTextField(e.target);
    const edFocus = this.isEditorFocus();
    for (const a of cands) {
      if (a.native) continue;
      if (a.ctx === 'editor' && !edFocus) continue;
      if (a.ctx === 'global' && inText && !a.anywhere && !(e.target.id === 'title' && a.group !== 'Edit')) continue;
      if (a.enabled && !a.enabled()) continue;
      e.preventDefault(); e.stopPropagation();
      Actions.run(a.id);
      return;
    }
  },
  onKeyUp(e) {
    if (e.key === 'Control' && Switcher.open) { Switcher.commit(); return; }
    if (e.key !== 'Shift' || KeyRecorder.active) return;
    if (this.otherKey) { this.lastShiftUp = 0; return; }
    const now = performance.now();
    if (now - this.lastShiftUp < 380) {
      this.lastShiftUp = 0;
      const cands = this.index.get('Shift Shift') || [];
      const a = cands.find(x => !x.enabled || x.enabled());
      if (a && !Dialog.top) Actions.run(a.id);
    } else this.lastShiftUp = now;
  },
};
/** Captures the next key combination (Keymap settings). */
const KeyRecorder = {
  active: false,
  capture() {
    return new Promise(res => {
      this.active = true;
      const onKey = e => {
        if (['Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) return;
        e.preventDefault(); e.stopPropagation();
        document.removeEventListener('keydown', onKey, true);
        this.active = false;
        if (e.key === 'Escape' && !e.ctrlKey && !e.altKey && !e.shiftKey) return res(null);
        res(comboFromEvent(e));
      };
      document.addEventListener('keydown', onKey, true);
    });
  },
};

/* ---------------- action definitions ---------------- */
function registerActions() {
  const R = (id, name, o) => Actions.reg(id, name, o);
  const ed = () => !!Editor.el;
  const edw = () => !!Editor.el && !Editor.readOnly;
  const K = (intellij, vscode) => ({ intellij: intellij || [], vscode: vscode === undefined ? undefined : vscode });

  /* Navigate */
  R('searchEverywhere', 'Search Everywhere', { group: 'Navigate', icon: 'search', keys: K(['Shift Shift'], ['Shift Shift']), run: () => SearchEverywhere.show('all'), anywhere: true, keywords: 'find quick open' });
  R('findAction', 'Find Action…', { group: 'Navigate', icon: 'search', keys: K(['Mod+Shift+A'], ['Mod+Shift+P', 'F1']), run: () => SearchEverywhere.show('actions'), anywhere: true, keywords: 'command palette' });
  R('gotoNote', 'Go to Note…', { group: 'Navigate', icon: 'noteMd', keys: K(['Mod+Shift+N', 'Mod+N'], ['Mod+P']), run: () => SearchEverywhere.show('notes'), anywhere: true, keywords: 'open file' });
  R('gotoHeading', 'Go to Heading…', { group: 'Navigate', icon: 'heading', keys: K(['Mod+Alt+Shift+N'], ['Mod+T']), run: () => SearchEverywhere.show('headings'), anywhere: true, keywords: 'symbol section' });
  R('recentNotes', 'Recent Notes…', { group: 'Navigate', icon: 'history', keys: K(['Mod+E'], ['Mod+R']), run: () => RecentPopup.show(), anywhere: true });
  R('fileStructure', 'Note Structure…', { group: 'Navigate', icon: 'structure', keys: K(['Mod+F12'], ['Mod+Shift+O']), run: () => StructurePopup.show(), enabled: ed });
  R('gotoLine', 'Go to Line…', { group: 'Navigate', icon: 'arrowRight', keys: K(['Mod+G'], ['Mod+G']), run: goToLine, enabled: ed });
  R('back', 'Back', { group: 'Navigate', icon: 'back', keys: K(['Mod+Alt+Left'], ['Alt+Left']), run: () => App.navBack(), enabled: () => S.back.length > 0 });
  R('forward', 'Forward', { group: 'Navigate', icon: 'forward', keys: K(['Mod+Alt+Right'], ['Alt+Right']), run: () => App.navForward(), enabled: () => S.fwd.length > 0 });
  R('nextTab', 'Select Next Tab', { group: 'Navigate', icon: 'chevronRight', keys: K(['Alt+Right'], ['Ctrl+PageDown']), run: () => App.cycleTab(1), enabled: () => S.tabs.length > 1 });
  R('prevTab', 'Select Previous Tab', { group: 'Navigate', icon: 'chevronLeft', keys: K(['Alt+Left'], ['Ctrl+PageUp']), run: () => App.cycleTab(-1), enabled: () => S.tabs.length > 1 });
  R('selectInProject', 'Select in Project View', { group: 'Navigate', icon: 'locate', keys: K(['Alt+F1']), run: () => Panels.locate(), enabled: () => !!S.active });

  /* Find */
  R('find', 'Find…', { group: 'Find', icon: 'search', keys: K(['Mod+F'], ['Mod+F']), run: () => Find.show(false), enabled: ed, anywhere: true });
  R('replace', 'Replace…', { group: 'Find', icon: 'replace', keys: K(['Mod+R'], ['Mod+H']), run: () => Find.show(true), enabled: edw, anywhere: true });
  R('findNext', 'Find Next', { group: 'Find', icon: 'arrowDown', keys: K(['F3'], ['F3']), run: () => Find.open ? Find.next(1) : Find.show(false), enabled: ed, anywhere: true });
  R('findPrev', 'Find Previous', { group: 'Find', icon: 'arrowUp', keys: K(['Shift+F3'], ['Shift+F3']), run: () => Find.open ? Find.next(-1) : Find.show(false), enabled: ed, anywhere: true });
  R('findInFiles', 'Find in Notes…', { group: 'Find', icon: 'find', keys: K(['Mod+Shift+F'], ['Mod+Shift+F']), run: () => Panels.findInFiles(), anywhere: true, keywords: 'search all files' });

  /* File / notes */
  R('newPopup', 'New…', { group: 'File', icon: 'plus', keys: K(['Alt+Insert'], ['Mod+Alt+Insert']), run: () => App.newPopup() });
  R('newNote', 'New Note', { group: 'File', icon: 'noteAdd', keys: K(['Mod+Alt+N'], ['Mod+N']), run: () => App.newNote(), keywords: 'create lecture' });
  R('newFolder', 'New Module…', { group: 'File', icon: 'folderAdd', keys: K(['Mod+Alt+Shift+M']), run: () => App.newFolder(null), keywords: 'create folder course' });
  R('newSubfolder', 'New Folder in Module…', { group: 'File', icon: 'folderAdd', run: () => App.newFolder(defaultFolderId()), enabled: () => !!defaultFolderId(), keywords: 'week subfolder' });
  R('rename', 'Rename…', { group: 'File', icon: 'edit', keys: K(['Shift+F6'], ['F2']), run: () => App.renameSelected() });
  R('duplicateNote', 'Duplicate Note', { group: 'File', icon: 'duplicate', run: () => { const c = duplicateNote(S.active); if (c) App.open(c.id); }, enabled: () => !!S.active });
  R('moveNote', 'Move Note to…', { group: 'File', icon: 'folderOpen', run: () => App.moveNoteDialog(S.active), enabled: () => !!S.active });
  R('deleteNote', 'Delete Note…', { group: 'File', icon: 'trash', run: () => App.deleteNoteConfirm(S.active), enabled: () => !!S.active });
  R('toggleBookmark', 'Toggle Bookmark', { group: 'File', icon: 'bookmark', keys: K(['F11'], ['Mod+Alt+K']), run: () => toggleStar(S.active), enabled: () => !!S.active, toggle: () => !!(S.notes[S.active] && S.notes[S.active].starred), keywords: 'star favourite pin' });
  R('importMarkdown', 'Import Markdown…', { group: 'File', icon: 'import', run: () => Exporter.importMarkdown() });
  R('exportMarkdown', 'Export Note as Markdown…', { group: 'File', icon: 'export', run: () => Exporter.exportNote('md'), enabled: () => !!S.active });
  R('exportHtml', 'Export Note as HTML…', { group: 'File', icon: 'export', run: () => Exporter.exportNote('html'), enabled: () => !!S.active });
  R('exportPdf', 'Export Note as PDF…', { group: 'File', icon: 'export', keys: K(['Mod+P'], ['Mod+Alt+P']), run: () => Exporter.exportNote('pdf'), enabled: () => !!S.active && IS_DESKTOP, keywords: 'print' });
  R('exportFolder', 'Export Module as Markdown…', { group: 'File', icon: 'export', run: () => Exporter.exportFolder(), enabled: () => !!defaultFolderId() && IS_DESKTOP });
  R('copyMarkdown', 'Copy Note as Markdown', { group: 'File', icon: 'copy', run: () => { Editor.flush(); copyText(htmlToMd(S.notes[S.active].html)); }, enabled: () => !!S.active });
  R('localHistory', 'Show Local History…', { group: 'File', icon: 'history', run: () => HistoryUI.show(S.active), enabled: () => !!S.active && IS_DESKTOP && plugin('history'), keywords: 'versions revisions restore' });
  R('restoreDeleted', 'Restore Deleted Note…', { group: 'File', icon: 'trash', run: () => HistoryUI.trash(), enabled: () => IS_DESKTOP, keywords: 'trash recycle undelete' });
  R('openFolder', 'Open Notes Folder…', { group: 'File', icon: 'folderOpen', run: () => BRIDGE.chooseVault(), enabled: () => IS_DESKTOP, keywords: 'vault project onedrive' });
  R('revealFolder', 'Show Notes Folder in Explorer', { group: 'File', icon: 'external', run: () => BRIDGE.openFolder(), enabled: () => IS_DESKTOP });
  R('settings', 'Settings…', { group: 'File', icon: 'settings', keys: K(['Mod+Alt+S'], ['Mod+,']), run: () => SettingsUI.show(), anywhere: true, keywords: 'preferences options' });
  R('exit', 'Exit', { group: 'File', icon: 'close', run: () => BRIDGE.quit(), enabled: () => IS_DESKTOP });

  /* Edit */
  R('undo', 'Undo', { group: 'Edit', icon: 'undo', keys: K(['Mod+Z'], ['Mod+Z']), run: () => Hist.undo(), ctx: 'editor', enabled: edw });
  R('redo', 'Redo', { group: 'Edit', icon: 'redo', keys: K(['Mod+Shift+Z'], ['Mod+Y', 'Mod+Shift+Z']), run: () => Hist.redo(), ctx: 'editor', enabled: edw });
  R('cut', 'Cut', { group: 'Edit', icon: 'scissors', keys: K(['Mod+X']), native: true, run: () => { ensureFocus(); exec('cut'); } });
  R('copy', 'Copy', { group: 'Edit', icon: 'copy', keys: K(['Mod+C']), native: true, run: () => { ensureFocus(); exec('copy'); } });
  R('paste', 'Paste', { group: 'Edit', icon: 'paste', keys: K(['Mod+V']), native: true, run: () => { ensureFocus(); if (IS_DESKTOP) BRIDGE.paste(); else exec('paste'); } });
  R('pastePlain', 'Paste as Plain Text', { group: 'Edit', icon: 'paste', keys: K(['Mod+Shift+V'], ['Mod+Shift+V']), ctx: 'editor', run: () => { App.pastePlainOnce = true; if (IS_DESKTOP) BRIDGE.paste(); else { App.pastePlainOnce = false; App.status('Use Ctrl+Shift+V in the browser to paste plain text'); } } });
  R('selectAll', 'Select All', { group: 'Edit', icon: 'selectAll', keys: K(['Mod+A']), native: true, run: () => { ensureFocus(); selectNodeContents(Editor.el); } });
  R('duplicateLine', 'Duplicate Line or Selection', { group: 'Edit', icon: 'duplicate', keys: K(['Mod+D'], ['Alt+Shift+Down']), ctx: 'editor', run: duplicateUnit, enabled: edw });
  R('deleteLine', 'Delete Line', { group: 'Edit', icon: 'trash', keys: K(['Mod+Y'], ['Mod+Shift+K']), ctx: 'editor', run: deleteUnit, enabled: edw });
  R('moveUp', 'Move Line Up', { group: 'Edit', icon: 'moveUp', keys: K(['Alt+Shift+Up', 'Mod+Shift+Up'], ['Alt+Up']), ctx: 'editor', run: () => moveUnit(-1), enabled: edw });
  R('moveDown', 'Move Line Down', { group: 'Edit', icon: 'moveDown', keys: K(['Alt+Shift+Down', 'Mod+Shift+Down'], ['Alt+Down']), ctx: 'editor', run: () => moveUnit(1), enabled: edw });
  R('extendSelection', 'Extend Selection', { group: 'Edit', icon: 'selectAll', keys: K(['Mod+W'], ['Alt+Shift+Right']), ctx: 'editor', run: extendSelection, enabled: ed });
  R('shrinkSelection', 'Shrink Selection', { group: 'Edit', icon: 'selectAll', keys: K(['Mod+Shift+W'], ['Alt+Shift+Left']), ctx: 'editor', run: shrinkSelection, enabled: ed });
  R('toggleCase', 'Toggle Case', { group: 'Edit', icon: 'case', keys: K(['Mod+Shift+U'], ['Mod+Shift+U']), ctx: 'editor', run: toggleCase, enabled: edw });
  R('commentLine', 'Comment with Line Comment', { group: 'Edit', icon: 'comment', keys: K(['Mod+/'], ['Mod+/']), ctx: 'editor', run: () => { const pre = closestIn(anchor(), 'pre'); if (pre) toggleLineComment(pre); else setBlockType('quote'); }, enabled: edw });
  R('reformat', 'Reformat Note', { group: 'Edit', icon: 'reformat', keys: K(['Mod+Alt+L'], ['Alt+Shift+F']), ctx: 'editor', run: reformatNote, enabled: edw, keywords: 'clean tidy' });
  R('contextActions', 'Show Context Actions', { group: 'Edit', icon: 'bulb', keys: K(['Alt+Enter'], ['Mod+.']), ctx: 'editor', run: () => App.contextActions(), enabled: ed, keywords: 'intention quick fix' });
  R('toggleTodo', 'Toggle Checkbox', { group: 'Edit', icon: 'checklist', keys: K(['Mod+Enter'], ['Mod+Enter']), ctx: 'editor', run: toggleTodoAtCaret, enabled: edw, keywords: 'done complete task' });

  /* Format */
  R('bold', 'Bold', { group: 'Format', icon: 'bold', keys: K(['Mod+B']), ctx: 'editor', edit: true, run: () => inlineCmd('bold'), toggle: () => fmtState('bold') });
  R('italic', 'Italic', { group: 'Format', icon: 'italic', keys: K(['Mod+I']), ctx: 'editor', edit: true, run: () => inlineCmd('italic'), toggle: () => fmtState('italic') });
  R('underline', 'Underline', { group: 'Format', icon: 'underline', keys: K(['Mod+U']), ctx: 'editor', edit: true, run: () => inlineCmd('underline'), toggle: () => fmtState('underline') });
  R('strike', 'Strikethrough', { group: 'Format', icon: 'strike', keys: K(['Mod+Shift+X'], ['Alt+Shift+5']), ctx: 'editor', edit: true, run: () => inlineCmd('strikeThrough'), toggle: () => fmtState('strikeThrough') });
  R('highlight', 'Highlight', { group: 'Format', icon: 'highlight', keys: K(['Mod+Shift+H']), ctx: 'editor', edit: true, run: () => inlineCmd('highlight'), toggle: () => !!closestIn(anchor(), 'span.hl'), keywords: 'marker' });
  R('inlineCode', 'Inline Code', { group: 'Format', icon: 'code', keys: K(['Mod+Shift+C'], ['Mod+Shift+C']), ctx: 'editor', edit: true, run: () => inlineCmd('code'), toggle: () => !!closestIn(anchor(), 'code') && !closestIn(anchor(), 'pre') });
  R('insertLink', 'Link…', { group: 'Format', icon: 'link', keys: K(['Mod+K']), ctx: 'editor', edit: true, run: insertLink, toggle: () => !!closestIn(anchor(), 'a[href]') });
  R('clearFormat', 'Clear Formatting', { group: 'Format', icon: 'clearFormat', keys: K(['Mod+\\']), ctx: 'editor', edit: true, run: () => { Hist.record('op'); exec('removeFormat'); exec('unlink'); const s = getSel(); if (!s.isCollapsed) { /* also remove highlight spans */ document.querySelectorAll('#editor span.hl').forEach(x => { if (s.containsNode(x, true)) { const f = document.createDocumentFragment(); while (x.firstChild) f.appendChild(x.firstChild); x.replaceWith(f); } }); } Editor.changed(); } });
  R('paragraph', 'Text', { group: 'Format', icon: 'paragraph', keys: K(['Mod+Alt+0']), ctx: 'editor', edit: true, run: () => setBlockType('p'), toggle: () => blockIs('P') });
  R('h1', 'Heading 1', { group: 'Format', icon: 'heading', keys: K(['Mod+Alt+1']), ctx: 'editor', edit: true, run: () => setBlockType('h1'), toggle: () => blockIs('H1') });
  R('h2', 'Heading 2', { group: 'Format', icon: 'heading', keys: K(['Mod+Alt+2']), ctx: 'editor', edit: true, run: () => setBlockType('h2'), toggle: () => blockIs('H2') });
  R('h3', 'Heading 3', { group: 'Format', icon: 'heading', keys: K(['Mod+Alt+3']), ctx: 'editor', edit: true, run: () => setBlockType('h3'), toggle: () => blockIs('H3') });
  R('bulletList', 'Bullet List', { group: 'Format', icon: 'listBullet', keys: K(['Mod+Shift+8']), ctx: 'editor', edit: true, run: () => setBlockType('ul'), toggle: () => !!closestIn(anchor(), 'ul:not(.checklist)') });
  R('numberedList', 'Numbered List', { group: 'Format', icon: 'listNumber', keys: K(['Mod+Shift+7']), ctx: 'editor', edit: true, run: () => setBlockType('ol'), toggle: () => !!closestIn(anchor(), 'ol') });
  R('checklist', 'Checklist', { group: 'Format', icon: 'checklist', keys: K(['Mod+Shift+9']), ctx: 'editor', edit: true, run: () => setBlockType('check'), toggle: () => !!closestIn(anchor(), 'ul.checklist') });
  R('quote', 'Quote', { group: 'Format', icon: 'quote', keys: K(['Mod+Shift+.']), ctx: 'editor', edit: true, run: () => setBlockType('quote'), toggle: () => !!closestIn(anchor(), 'blockquote:not(.callout)') });
  R('callout', 'Callout', { group: 'Format', icon: 'callout', keys: K(['Mod+Alt+Q']), ctx: 'editor', edit: true, run: () => setBlockType('callout:' + (SETTINGS.calloutDefault || 'important')), toggle: () => !!closestIn(anchor(), 'blockquote.callout'), keywords: 'box definition theorem example note warning' });
  for (const [k, [label, ic]] of Object.entries(CALLOUTS)) R('callout_' + k, 'Callout: ' + label, { group: 'Format', icon: ic, ctx: 'editor', edit: true, run: () => setBlockType('callout:' + k), hidden: true, keywords: 'box ' + k });
  R('codeBlock', 'Code Block', { group: 'Format', icon: 'codeBlock', keys: K(['Mod+Alt+C']), ctx: 'editor', edit: true, run: toggleCodeBlock, toggle: () => !!closestIn(anchor(), 'pre') });
  R('fold', 'Collapse Section', { group: 'Format', icon: 'chevronDown', keys: K(['Mod+-'], ['Mod+Shift+[']), ctx: 'editor', run: () => foldAtCaret(true), enabled: () => ed() && plugin('folding') });
  R('unfold', 'Expand Section', { group: 'Format', icon: 'chevronRight', keys: K(['Mod+='], ['Mod+Shift+]']), ctx: 'editor', run: () => foldAtCaret(false), enabled: () => ed() && plugin('folding') });
  R('foldAll', 'Collapse All Sections', { group: 'Format', icon: 'collapseAll', keys: K(['Mod+Shift+-'], ['Mod+Alt+[']), ctx: 'editor', run: () => foldAll(true), enabled: () => ed() && plugin('folding') });
  R('unfoldAll', 'Expand All Sections', { group: 'Format', icon: 'expandAll', keys: K(['Mod+Shift+='], ['Mod+Alt+]']), ctx: 'editor', run: () => foldAll(false), enabled: () => ed() && plugin('folding') });

  /* Insert */
  R('insertImage', 'Image…', { group: 'Insert', icon: 'image', keys: K(['Mod+Shift+I']), ctx: 'editor', edit: true, run: pickImages, keywords: 'picture photo screenshot' });
  R('insertTable', 'Table', { group: 'Insert', icon: 'table', ctx: 'editor', edit: true, run: () => insertTable() });
  R('insertHr', 'Divider', { group: 'Insert', icon: 'hr', ctx: 'editor', edit: true, run: insertHR, keywords: 'horizontal rule line' });
  R('mathInline', 'Inline Math', { group: 'Insert', icon: 'sigma', keys: K(['Mod+M']), ctx: 'editor', edit: true, run: () => insertMath(false), enabled: () => plugin('math'), keywords: 'latex equation formula' });
  R('mathBlock', 'Equation', { group: 'Insert', icon: 'sigma', keys: K(['Mod+Shift+M']), ctx: 'editor', edit: true, run: () => insertMath(true), enabled: () => plugin('math'), keywords: 'latex formula block' });
  R('insertWikilink', 'Link to Note…', { group: 'Insert', icon: 'wikilink', keys: K(['Mod+Shift+K']), ctx: 'editor', edit: true, run: startWikiCompletion, enabled: () => plugin('wiki'), keywords: 'wiki reference [[' });
  R('insertTimestamp', 'Timestamp', { group: 'Insert', icon: 'timer', keys: K(['Alt+Shift+T']), ctx: 'editor', edit: true, run: () => Timer.insertStamp(), enabled: () => plugin('timer') });
  R('insertDate', 'Today’s Date', { group: 'Insert', icon: 'calendar', ctx: 'editor', edit: true, run: () => insertNodeAtCaret(document.createTextNode(new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })), ' ') });

  /* Run (lecture timer) */
  R('timerStart', 'Start Lecture Timer', { group: 'Run', icon: 'run', keys: K(['Shift+F10'], ['F5']), run: () => Timer.start(), enabled: () => plugin('timer') && !Timer.running, keywords: 'record lecture run' });
  R('timerStop', 'Stop Lecture Timer', { group: 'Run', icon: 'stop', keys: K(['Mod+F2'], ['Shift+F5']), run: () => Timer.stop(), enabled: () => Timer.running });
  R('timerPause', 'Pause / Resume Timer', { group: 'Run', icon: 'timer', run: () => Timer.pauseToggle(), enabled: () => Timer.running });

  /* View */
  R('twProject', 'Project', { group: 'Tool Windows', icon: 'folder', keys: K(['Alt+1'], ['Mod+Shift+E']), run: () => ToolWindows.toggle('project'), toggle: () => ToolWindows.isOpen('project'), anywhere: true });
  R('twBookmarks', 'Bookmarks', { group: 'Tool Windows', icon: 'bookmark', keys: K(['Alt+2']), run: () => ToolWindows.toggle('bookmarks'), toggle: () => ToolWindows.isOpen('bookmarks'), anywhere: true });
  R('twFind', 'Find', { group: 'Tool Windows', icon: 'find', keys: K(['Alt+3']), run: () => ToolWindows.toggle('find'), toggle: () => ToolWindows.isOpen('find'), anywhere: true });
  R('twTodo', 'TODO', { group: 'Tool Windows', icon: 'todo', keys: K(['Alt+6']), run: () => ToolWindows.toggle('todo'), toggle: () => ToolWindows.isOpen('todo'), enabled: () => plugin('todo'), anywhere: true });
  R('twStructure', 'Structure', { group: 'Tool Windows', icon: 'structure', keys: K(['Alt+7']), run: () => ToolWindows.toggle('structure'), toggle: () => ToolWindows.isOpen('structure'), anywhere: true });
  R('twInfo', 'Note Info', { group: 'Tool Windows', icon: 'info', keys: K(['Alt+8']), run: () => ToolWindows.toggle('info'), toggle: () => ToolWindows.isOpen('info'), anywhere: true, keywords: 'backlinks properties statistics' });
  R('twNotifications', 'Notifications', { group: 'Tool Windows', icon: 'bell', keys: K(['Alt+9']), run: () => ToolWindows.toggle('notifications'), toggle: () => ToolWindows.isOpen('notifications'), anywhere: true });
  R('hideAllTW', 'Hide All Tool Windows', { group: 'View', icon: 'maximize', keys: K(['Mod+Shift+F12'], ['Mod+K Mod+B']), run: () => ToolWindows.hideAll(), anywhere: true });
  R('zen', 'Zen Mode', { group: 'View', icon: 'zen', keys: K(['Alt+Shift+Z'], ['Alt+Shift+Z']), run: () => App.toggleZen(), toggle: () => document.body.classList.contains('zen'), anywhere: true, keywords: 'distraction free fullscreen' });
  R('focusMode', 'Focus Mode', { group: 'View', icon: 'focus', run: () => { setSetting('focusMode', !SETTINGS.focusMode); FocusMode.update(); }, toggle: () => SETTINGS.focusMode, keywords: 'dim paragraphs' });
  R('typewriter', 'Typewriter Scrolling', { group: 'View', icon: 'typewriter', run: () => setSetting('typewriter', !SETTINGS.typewriter), toggle: () => SETTINGS.typewriter });
  R('readOnly', 'Read-only Mode', { group: 'View', icon: 'lock', run: () => Editor.setReadOnly(!Editor.readOnly), toggle: () => Editor.readOnly, enabled: ed, keywords: 'lock' });
  R('toggleLineNumbers', 'Show Line Numbers', { group: 'View', icon: 'listNumber', run: () => setSetting('lineNumbers', !SETTINGS.lineNumbers), toggle: () => SETTINGS.lineNumbers });
  R('toggleFormatBar', 'Show Formatting Toolbar', { group: 'View', icon: 'bold', run: () => setSetting('showFormatBar', !SETTINGS.showFormatBar), toggle: () => SETTINGS.showFormatBar });
  R('toggleFloatBar', 'Show Floating Toolbar on Selection', { group: 'View', icon: 'bold', run: () => setSetting('floatingBar', !SETTINGS.floatingBar), toggle: () => SETTINGS.floatingBar });
  R('toggleStatusBar', 'Show Status Bar', { group: 'View', icon: 'layout', run: () => setSetting('showStatusBar', !SETTINGS.showStatusBar), toggle: () => SETTINGS.showStatusBar });
  R('toggleBreadcrumbs', 'Show Breadcrumbs', { group: 'View', icon: 'chevronRight', run: () => setSetting('showBreadcrumbs', !SETTINGS.showBreadcrumbs), toggle: () => SETTINGS.showBreadcrumbs });
  R('toggleStripes', 'Show Tool Window Bars', { group: 'View', icon: 'sidebarLeft', run: () => setSetting('showStripes', !SETTINGS.showStripes), toggle: () => SETTINGS.showStripes });
  R('toggleCompact', 'Compact Mode', { group: 'View', icon: 'minimize', run: () => setSetting('compact', !SETTINGS.compact), toggle: () => SETTINGS.compact });
  R('quickSwitch', 'Quick Switch Scheme…', { group: 'View', icon: 'palette', keys: K(['Ctrl+`'], ['Ctrl+`']), run: () => App.quickSwitch(), anywhere: true, keywords: 'theme' });
  R('nextTheme', 'Switch to Next Theme', { group: 'View', icon: 'palette', run: () => { const i = THEMES.findIndex(t => t.id === SETTINGS.theme); setSetting('theme', THEMES[(i + 1) % THEMES.length].id); App.status('Theme: ' + THEME_BY_ID[SETTINGS.theme].name); } });
  R('uiNew', 'Use New UI', { group: 'View', icon: 'layout', run: () => setSetting('uiStyle', 'new'), toggle: () => SETTINGS.uiStyle !== 'classic' });
  R('uiClassic', 'Use Classic UI', { group: 'View', icon: 'window', run: () => setSetting('uiStyle', 'classic'), toggle: () => SETTINGS.uiStyle === 'classic' });
  R('zoomIn', 'Zoom In', { group: 'View', icon: 'plus', keys: K(['Mod+Alt+='], ['Mod+=']), run: () => setSetting('zoom', clamp((SETTINGS.zoom || 100) + 10, 60, 200)), enabled: () => IS_DESKTOP });
  R('zoomOut', 'Zoom Out', { group: 'View', icon: 'minus', keys: K(['Mod+Alt+-'], ['Mod+-']), run: () => setSetting('zoom', clamp((SETTINGS.zoom || 100) - 10, 60, 200)), enabled: () => IS_DESKTOP });
  R('zoomReset', 'Reset Zoom', { group: 'View', icon: 'refresh', keys: K(['Mod+0'], ['Mod+0']), run: () => setSetting('zoom', 100), enabled: () => IS_DESKTOP });
  R('fullscreen', 'Toggle Full Screen', { group: 'View', icon: 'fullscreen', keys: K(['Mod+Shift+F11'], ['F11']), run: () => BRIDGE.toggleFullscreen(), enabled: () => IS_DESKTOP });
  R('editorFontUp', 'Increase Editor Font Size', { group: 'View', icon: 'font', run: () => setSetting('fontSize', clamp((SETTINGS.fontSize || 15) + 1, 10, 32)), keywords: 'bigger text zoom' });
  R('editorFontDown', 'Decrease Editor Font Size', { group: 'View', icon: 'font', run: () => setSetting('fontSize', clamp((SETTINGS.fontSize || 15) - 1, 10, 32)), keywords: 'smaller text zoom' });

  /* Window */
  R('closeTab', 'Close Tab', { group: 'Window', icon: 'close', keys: K(['Mod+F4'], ['Mod+W', 'Mod+F4']), run: () => App.closeTab(S.active), enabled: () => !!S.active, anywhere: true });
  R('closeOthers', 'Close Other Tabs', { group: 'Window', icon: 'close', run: () => App.closeOthers(S.active), enabled: () => S.tabs.length > 1 });
  R('closeAll', 'Close All Tabs', { group: 'Window', icon: 'close', keys: K(['Mod+Shift+F4']), run: () => App.closeAll(), enabled: () => S.tabs.length > 0 });
  R('reopenTab', 'Reopen Closed Tab', { group: 'Window', icon: 'history', keys: K(['Mod+Shift+T'], ['Mod+Shift+T']), run: () => App.reopenClosed(), enabled: () => App.closedTabs.length > 0 });
  R('pinTab', 'Pin Tab', { group: 'Window', icon: 'pin', run: () => App.togglePin(S.active), toggle: () => S.pinned.includes(S.active), enabled: () => !!S.active });
  R('resetLayout', 'Restore Default Layout', { group: 'Window', icon: 'layout', run: () => ToolWindows.resetLayout() });
  R('devtools', 'Toggle Developer Tools', { group: 'Help', icon: 'code', keys: K(['F12'], ['F12']), run: () => BRIDGE.toggleDevTools(), enabled: () => IS_DESKTOP });

  /* Main menu */
  R('mainMenu', 'Main Menu', { group: 'View', icon: 'menu', keys: K(['Alt+\\']), anywhere: true, run: () => { if (SETTINGS.uiStyle === 'classic') App.openMenubar(0, true); else App.openMainMenu($('#mainMenuBtn').getBoundingClientRect()); } });
  [['F', 'File'], ['E', 'Edit'], ['V', 'View'], ['N', 'Navigate'], ['I', 'Insert'], ['O', 'Format'], ['U', 'Run'], ['W', 'Window'], ['H', 'Help']].forEach(([key, label]) => R('menu' + label, 'Open ' + label + ' Menu', { group: 'View', hidden: true, keys: K(['Alt+' + key]), anywhere: true, run: () => {
    const menus = mainMenu(); const i = menus.findIndex(m => m.label === label); if (i < 0) return;
    if (SETTINGS.uiStyle === 'classic') App.openMenubar(i, true);
    else Menu.open(menus[i].items, { rect: $('#mainMenuBtn').getBoundingClientRect() }, { keyboard: true });
  } }));

  /* Help */
  R('keymapRef', 'Keyboard Shortcuts', { group: 'Help', icon: 'keyboard', keys: K(['Mod+Shift+/'], ['Mod+K Mod+S']), run: () => App.keymapReference(), anywhere: true, keywords: 'keymap cheatsheet' });
  R('markdownHelp', 'Typing Shortcuts Cheat Sheet', { group: 'Help', icon: 'help', run: () => App.markdownHelp(), keywords: 'markdown syntax' });
  R('checkUpdates', 'Check for Updates…', { group: 'Help', icon: 'update', run: () => App.checkUpdates(true), enabled: () => IS_DESKTOP });
  R('about', 'About Lecture Notes', { group: 'Help', icon: 'info', run: () => App.about() });
}
function fmtState(cmd) { try { return document.queryCommandState(cmd); } catch (e) { return false; } }
function blockIs(tag) { const b = curBlock(); return !!(b && b.tagName === tag); }

/* ---------------- main menu model ---------------- */
function mainMenu() {
  const themeItems = THEMES.map(t => ({ label: t.name, checked: SETTINGS.theme === t.id, run: () => setSetting('theme', t.id), color: t.ui.editor }));
  const recentVaults = (Store.info.recent || []).filter(p => p !== Store.info.root).slice(0, 8).map(p => ({ label: p, icon: 'folder', run: () => BRIDGE.switchVault(p) }));
  return [
    { label: 'File', items: [
      { label: 'New', icon: 'plus', sub: [{ action: 'newNote' }, { action: 'newFolder' }, { action: 'newSubfolder' }] },
      IS_DESKTOP ? { action: 'openFolder' } : null,
      IS_DESKTOP && recentVaults.length ? { label: 'Recent Notes Folders', icon: 'history', sub: recentVaults } : null,
      '-', { action: 'importMarkdown' },
      { label: 'Export', icon: 'export', sub: [{ action: 'exportMarkdown' }, { action: 'exportHtml' }, IS_DESKTOP ? { action: 'exportPdf' } : null, IS_DESKTOP ? { action: 'exportFolder' } : null, '-', { action: 'copyMarkdown' }].filter(Boolean) },
      '-', IS_DESKTOP ? { action: 'localHistory' } : null, IS_DESKTOP ? { action: 'restoreDeleted' } : null, IS_DESKTOP ? { action: 'revealFolder' } : null,
      '-', { action: 'settings' }, IS_DESKTOP ? '-' : null, IS_DESKTOP ? { action: 'exit' } : null,
    ].filter(Boolean) },
    { label: 'Edit', items: [{ action: 'undo' }, { action: 'redo' }, '-', { action: 'cut' }, { action: 'copy' }, { action: 'paste' }, { action: 'pastePlain' }, { action: 'selectAll' }, '-',
      { label: 'Find', icon: 'search', sub: [{ action: 'find' }, { action: 'replace' }, { action: 'findNext' }, { action: 'findPrev' }, '-', { action: 'findInFiles' }] }, '-',
      { action: 'duplicateLine' }, { action: 'deleteLine' }, { action: 'moveUp' }, { action: 'moveDown' }, '-', { action: 'extendSelection' }, { action: 'shrinkSelection' }, { action: 'toggleCase' }, { action: 'toggleTodo' }, '-', { action: 'copyMarkdown' }] },
    { label: 'View', items: [
      { label: 'Tool Windows', icon: 'sidebarLeft', sub: [{ action: 'twProject' }, { action: 'twBookmarks' }, { action: 'twFind' }, plugin('todo') ? { action: 'twTodo' } : null, { action: 'twStructure' }, { action: 'twInfo' }, { action: 'twNotifications' }].filter(Boolean) },
      { label: 'Appearance', icon: 'layout', sub: [{ action: 'zen' }, { action: 'focusMode' }, { action: 'typewriter' }, '-', { action: 'toggleFormatBar' }, { action: 'toggleFloatBar' }, { action: 'toggleStatusBar' }, { action: 'toggleBreadcrumbs' }, { action: 'toggleLineNumbers' }, { action: 'toggleStripes' }, { action: 'toggleCompact' }, '-', { action: 'uiNew' }, { action: 'uiClassic' }] },
      { label: 'Theme', icon: 'palette', sub: themeItems }, { action: 'quickSwitch' }, '-',
      { action: 'readOnly' }, '-',
      IS_DESKTOP ? { action: 'zoomIn' } : null, IS_DESKTOP ? { action: 'zoomOut' } : null, IS_DESKTOP ? { action: 'zoomReset' } : null, IS_DESKTOP ? { action: 'fullscreen' } : null, '-',
      { action: 'editorFontUp' }, { action: 'editorFontDown' }, '-', { action: 'hideAllTW' }].filter(Boolean) },
    { label: 'Navigate', items: [{ action: 'back' }, { action: 'forward' }, '-', { action: 'searchEverywhere' }, { action: 'gotoNote' }, { action: 'gotoHeading' }, { action: 'recentNotes' }, { action: 'fileStructure' }, { action: 'gotoLine' }, '-', { action: 'nextTab' }, { action: 'prevTab' }, '-', { action: 'selectInProject' }, { action: 'findAction' }] },
    { label: 'Insert', items: [{ action: 'insertImage' }, { action: 'insertTable' }, { action: 'codeBlock' }, plugin('math') ? { action: 'mathBlock' } : null, plugin('math') ? { action: 'mathInline' } : null, { action: 'insertHr' }, '-', { label: 'Callout', icon: 'callout', sub: calloutSubmenu() }, { action: 'quote' }, '-', { action: 'insertLink' }, plugin('wiki') ? { action: 'insertWikilink' } : null, plugin('timer') ? { action: 'insertTimestamp' } : null, { action: 'insertDate' }].filter(Boolean) },
    { label: 'Format', items: [{ action: 'bold' }, { action: 'italic' }, { action: 'underline' }, { action: 'strike' }, { action: 'highlight' }, { action: 'inlineCode' }, '-', { action: 'paragraph' }, { action: 'h1' }, { action: 'h2' }, { action: 'h3' }, '-', { action: 'bulletList' }, { action: 'numberedList' }, { action: 'checklist' }, '-', { action: 'clearFormat' }, { action: 'reformat' }, { action: 'commentLine' }, '-', { label: 'Folding', icon: 'chevronDown', sub: [{ action: 'fold' }, { action: 'unfold' }, { action: 'foldAll' }, { action: 'unfoldAll' }] }] },
    plugin('timer') ? { label: 'Run', items: [{ action: 'timerStart' }, { action: 'timerPause' }, { action: 'timerStop' }, '-', { action: 'insertTimestamp' }] } : null,
    { label: 'Window', items: [{ action: 'closeTab' }, { action: 'closeOthers' }, { action: 'closeAll' }, { action: 'reopenTab' }, { action: 'pinTab' }, '-', { action: 'resetLayout' }, IS_DESKTOP ? { action: 'devtools' } : null].filter(Boolean) },
    { label: 'Help', items: [{ action: 'findAction' }, { action: 'keymapRef' }, { action: 'markdownHelp' }, '-', IS_DESKTOP ? { action: 'checkUpdates' } : null, { action: 'about' }].filter(Boolean) },
  ].filter(Boolean);
}
