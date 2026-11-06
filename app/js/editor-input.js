'use strict';
/* ============================================================
   Editor input: events, completion (/ and [[), overlays
   (image bar, code tools, floating toolbar, link previews),
   tables, editor context menu
   ============================================================ */

/* ---------------- completion: slash commands & note links ---------------- */
const SLASH_ITEMS = () => {
  const items = [
    { label: 'Text', icon: 'paragraph', key: 'p paragraph', run: () => setBlockType('p') },
    { label: 'Heading 1', icon: 'heading', hint: '#', key: 'h1 title', run: () => setBlockType('h1') },
    { label: 'Heading 2', icon: 'heading', hint: '##', key: 'h2 subtitle', run: () => setBlockType('h2') },
    { label: 'Heading 3', icon: 'heading', hint: '###', key: 'h3', run: () => setBlockType('h3') },
    { label: 'Bullet List', icon: 'listBullet', hint: '-', key: 'ul unordered', run: () => setBlockType('ul') },
    { label: 'Numbered List', icon: 'listNumber', hint: '1.', key: 'ol ordered', run: () => setBlockType('ol') },
    { label: 'Checklist', icon: 'checklist', hint: '[]', key: 'todo task checkbox', run: () => setBlockType('check') },
    { label: 'Quote', icon: 'quote', hint: '>', key: 'blockquote', run: () => setBlockType('quote') },
  ];
  for (const [k, [label, ic]] of Object.entries(CALLOUTS)) items.push({ label: label + ' Box', icon: ic, hint: 'callout', key: 'callout ' + k, run: () => setBlockType('callout:' + k) });
  items.push(
    { label: 'Code Block', icon: 'codeBlock', hint: '```', key: 'pre snippet program', run: () => toggleCodeBlock() },
    { label: 'Table', icon: 'table', key: 'grid', run: () => insertTable() },
    { label: 'Image', icon: 'image', key: 'picture photo screenshot', run: () => pickImages() },
    { label: 'Divider', icon: 'hr', hint: '---', key: 'hr line separator', run: () => insertHR() },
  );
  if (plugin('math')) items.push({ label: 'Equation', icon: 'sigma', hint: '$$', key: 'math latex formula block', run: () => insertMath(true) }, { label: 'Inline Math', icon: 'sigma', hint: '$x$', key: 'math latex', run: () => insertMath(false) });
  if (plugin('wiki')) items.push({ label: 'Link to Note', icon: 'wikilink', hint: '[[', key: 'wiki reference', run: () => startWikiCompletion() });
  if (plugin('timer')) items.push({ label: 'Timestamp', icon: 'timer', key: 'time lecture', run: () => Timer.insertStamp() });
  items.push({ label: 'Today’s Date', icon: 'calendar', key: 'date now', run: () => insertNodeAtCaret(document.createTextNode(new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })), ' ') });
  return items;
};
function caretRect() {
  const s = getSel(); if (!s.rangeCount) return { x: 100, y: 100, h: 18 };
  const r = s.getRangeAt(0).cloneRange(); r.collapse(true);
  let rect = r.getClientRects()[0];
  if (!rect || (!rect.width && !rect.height && !rect.left)) { const b = topBlock(s.anchorNode) || (s.anchorNode.nodeType === 1 ? s.anchorNode : s.anchorNode.parentElement); rect = b.getBoundingClientRect(); return { x: rect.left, y: rect.top, h: 20 }; }
  return { x: rect.left, y: rect.top, h: rect.height || 18 };
}
function openCompletion(kind, node, start) {
  Editor.closeCompletion();
  const prefix = kind === 'slash' ? 1 : 2;
  const render = it => `<span class="lp-ic">${icon(it.icon || 'note')}</span><span class="lp-l">${it.html || esc(it.label)}</span>${it.hint ? `<span class="lp-k">${esc(it.hint)}</span>` : ''}`;
  const popup = ListPopup({ anchor: caretRect(), items: [], render, width: kind === 'slash' ? 290 : 360, cls: 'completion', empty: kind === 'slash' ? 'No matching blocks' : 'No notes found',
    onPick: it => {
      const c = { node, start, prefix };
      const s = getSel();
      try { const r = document.createRange(); r.setStart(c.node, c.start); r.setEnd(s.anchorNode, s.anchorOffset); r.deleteContents(); } catch (e) {}
      if (c.node.parentNode && !c.node.textContent && c.node.parentNode.childNodes.length === 1) { c.node.parentNode.appendChild(document.createElement('br')); setCaret(c.node.parentNode, 0); }
      it.run();
      Editor.changed();
    }, onClose: () => { if (Editor.comp && Editor.comp.popup === popup) Editor.comp = null; } });
  Editor.comp = { kind, node, start, prefix, popup };
  updateCompletion();
}
function updateCompletion() {
  const c = Editor.comp; if (!c) return;
  const s = getSel();
  if (!s.rangeCount || s.anchorNode !== c.node || s.anchorOffset < c.start + c.prefix) { Editor.closeCompletion(); return; }
  const q = c.node.textContent.slice(c.start + c.prefix, s.anchorOffset);
  if (/\n/.test(q) || q.length > 40 || (c.kind === 'slash' && /\s{2}|^\s/.test(q)) || (c.kind === 'wiki' && q.includes(']]'))) { Editor.closeCompletion(); return; }
  let items;
  if (c.kind === 'slash') {
    const lq = q.toLowerCase();
    items = SLASH_ITEMS().map(it => {
      const ml = fuzzy(q, it.label);
      const labelOk = ml && (!lq || it.label.toLowerCase().includes(lq) || ml.score > 12);
      const keyOk = lq && (it.key || '').split(' ').some(w => w.startsWith(lq));
      if (!labelOk && !keyOk) return null;
      return { ...it, score: labelOk ? ml.score : -20, html: labelOk ? markIdx(it.label, ml.idx) : null };
    }).filter(Boolean);
    if (q) items.sort((a, b) => b.score - a.score);
    items = items.slice(0, 14);
  } else {
    const cur = Editor.noteId;
    items = Object.values(S.notes).filter(n => n.id !== cur).map(n => { const m = fuzzy(q, n.title || ''); return m ? { n, score: m.score + (n.folderId === (S.notes[cur] || {}).folderId ? 4 : 0) + (S.recent.indexOf(n.id) >= 0 ? 3 - S.recent.indexOf(n.id) * 0.1 : 0), idx: m.idx } : null; })
      .filter(Boolean).sort((a, b) => b.score - a.score).slice(0, 10)
      .map(({ n, idx }) => ({ label: n.title, icon: 'noteMd', html: markIdx(n.title || 'Untitled', idx) + `<span class="lp-path">${esc(notePathLabel(n))}</span>`, run: () => insertNodeAtCaret(wikiAtom(n)) }));
    if (q.trim() && !noteByTitle(q)) items.push({ label: `Create “${q.trim()}”`, icon: 'noteAdd', hint: 'new note', run: () => { const curN = S.notes[Editor.noteId]; const nn = createNote(curN ? curN.folderId : defaultFolderId(), { title: q.trim() }); insertNodeAtCaret(wikiAtom(nn)); App.refresh(); } });
  }
  c.popup.update(items);
  c.popup.place(caretRect());
}
function startWikiCompletion() {
  if (!ensureFocus()) return;
  const s = getSel(); const r = s.getRangeAt(0); r.deleteContents();
  const t = document.createTextNode('[['); r.insertNode(t); setCaret(t, 2);
  openCompletion('wiki', t, 0);
}

/* ---------------- tables ---------------- */
function tableOp(op, cell) {
  const table = cell.closest('table'); const tr = cell.closest('tr');
  const rows = [...table.querySelectorAll('tr')];
  const ci = [...tr.children].indexOf(cell);
  Hist.record('op');
  const mkCell = tag => { const c = document.createElement(tag); c.innerHTML = '<br>'; return c; };
  if (op === 'rowAbove' || op === 'rowBelow') {
    const nr = document.createElement('tr'); for (let i = 0; i < tr.children.length; i++) nr.appendChild(mkCell('td'));
    if (op === 'rowAbove' && tr === rows[0]) { tr.after(nr); } else if (op === 'rowAbove') tr.before(nr); else tr.after(nr);
    setCaret(nr.children[Math.min(ci, nr.children.length - 1)], 0);
  } else if (op === 'colLeft' || op === 'colRight') {
    rows.forEach((r, ri) => { const ref = r.children[ci]; const c = mkCell(ri === 0 && r.firstElementChild.tagName === 'TH' ? 'th' : 'td'); if (!ref) r.appendChild(c); else if (op === 'colLeft') ref.before(c); else ref.after(c); });
  } else if (op === 'delRow') {
    if (rows.length <= 1) { table.replaceWith(emptyP()); } else { const nx = tr.nextElementSibling || tr.previousElementSibling; tr.remove(); setCaret(nx.children[Math.min(ci, nx.children.length - 1)], 0); }
  } else if (op === 'delCol') {
    if (tr.children.length <= 1) table.replaceWith(emptyP()); else rows.forEach(r => r.children[ci] && r.children[ci].remove());
  } else if (op === 'delTable') { const p = emptyP(); table.replaceWith(p); setCaret(p, 0); }
  else if (op === 'header') {
    const first = rows[0]; const toTh = first.firstElementChild.tagName !== 'TH';
    [...first.children].forEach(c => { const n = document.createElement(toTh ? 'th' : 'td'); while (c.firstChild) n.appendChild(c.firstChild); c.replaceWith(n); });
  }
  Editor.changed();
}
function tableMenuItems(cell) {
  return [
    { label: 'Insert Row Above', icon: 'arrowUp', run: () => tableOp('rowAbove', cell) },
    { label: 'Insert Row Below', icon: 'arrowDown', run: () => tableOp('rowBelow', cell) },
    { label: 'Insert Column Left', icon: 'arrowLeft', run: () => tableOp('colLeft', cell) },
    { label: 'Insert Column Right', icon: 'arrowRight', run: () => tableOp('colRight', cell) },
    '-',
    { label: 'Toggle Header Row', icon: 'table', run: () => tableOp('header', cell) },
    '-',
    { label: 'Delete Row', icon: 'minus', run: () => tableOp('delRow', cell) },
    { label: 'Delete Column', icon: 'minus', run: () => tableOp('delCol', cell) },
    { label: 'Delete Table', icon: 'trash', danger: true, run: () => tableOp('delTable', cell) },
  ];
}

/* ---------------- list indent / outdent ---------------- */
function indentLi(li) {
  const prev = li.previousElementSibling; if (!prev) return false;
  Hist.record('op'); const sv = saveSel();
  const list = li.parentNode;
  let sub = [...prev.children].reverse().find(c => c.tagName === 'UL' || c.tagName === 'OL');
  if (!sub) { sub = document.createElement(list.tagName); if (list.className) sub.className = list.className; prev.appendChild(sub); }
  sub.appendChild(li);
  restoreSel(sv); Editor.changed(); return true;
}
function outdentLi(li) {
  Hist.record('op'); const sv = saveSel();
  const list = li.parentNode; const parentLi = list.parentNode.closest && list.parentNode.tagName === 'LI' ? list.parentNode : null;
  // gather following siblings to keep order
  const after = []; let n = li.nextElementSibling; while (n) { after.push(n); n = n.nextElementSibling; }
  if (after.length) { const sub = document.createElement(list.tagName); if (list.className) sub.className = list.className; after.forEach(x => sub.appendChild(x)); li.appendChild(sub); }
  const empty = !li.textContent.replace(/[\u200b\s]/g, '') && !li.querySelector('img,.math,.wikilink,.ts');
  let target = li;
  if (parentLi) { parentLi.after(li); if (!list.children.length) list.remove(); }
  else {
    // leave the list entirely → paragraph(s); split the list if items follow
    const p = document.createElement('p'); const subs = [];
    for (const c of [...li.childNodes]) { if (c.nodeType === 1 && (c.tagName === 'UL' || c.tagName === 'OL')) subs.push(c); else p.appendChild(c); }
    if (!p.firstChild) p.innerHTML = '<br>';
    const restItems = []; let nx = li.nextElementSibling; while (nx) { restItems.push(nx); nx = nx.nextElementSibling; }
    list.after(p);
    if (restItems.length) { const nl = list.cloneNode(false); restItems.forEach(x => nl.appendChild(x)); p.after(nl); }
    subs.reverse().forEach(s2 => p.after(s2)); li.remove(); if (!list.children.length) list.remove();
    target = p;
  }
  if (empty) caretStart(target); else restoreSel(sv);
  Editor.changed(); return true;
}

/* ---------------- overlays ---------------- */
const Overlays = {
  hideAll() { this.hideImg(); this.hideCode(); this.hideFloat(); this.hideHover(); },
  /* image bar */
  showImg(fig) {
    if (Editor.selFig && Editor.selFig !== fig) Editor.selFig.classList.remove('sel');
    Editor.selFig = fig; fig.classList.add('sel');
    const bar = $('#imgBar'); const img = fig.querySelector('img');
    const w = (img.style.width || '').replace('%', '');
    bar.querySelectorAll('[data-w]').forEach(b => b.classList.toggle('on', b.dataset.w === w));
    bar.querySelectorAll('[data-align]').forEach(b => b.classList.toggle('on', (fig.dataset.align || 'center') === b.dataset.align));
    bar.style.display = 'flex'; this.placeImg();
    getSel().removeAllRanges();
  },
  placeImg() {
    const fig = Editor.selFig; if (!fig || !fig.isConnected) return this.hideImg();
    const bar = $('#imgBar'); const img = fig.querySelector('img'); const r = img.getBoundingClientRect();
    const bw = bar.offsetWidth; let x = r.left + r.width / 2 - bw / 2; x = clamp(x, 8, innerWidth - bw - 8);
    const top = $('#edScroll').getBoundingClientRect().top;
    let y = r.height > 140 ? Math.max(r.top + 10, top + 8) : r.top - bar.offsetHeight - 8;
    if (y < top + 4) y = Math.min(r.bottom + 8, innerHeight - 60);
    if (r.height > 140 && y > r.bottom - bar.offsetHeight - 10) y = r.bottom + 8;
    bar.style.left = x + 'px'; bar.style.top = y + 'px';
    const hd = $('#imgHandle'); hd.style.display = 'block'; hd.style.left = (r.right - 7) + 'px'; hd.style.top = (r.bottom - 7) + 'px';
  },
  hideImg() { if (Editor.selFig) Editor.selFig.classList.remove('sel'); Editor.selFig = null; $('#imgBar').style.display = 'none'; $('#imgHandle').style.display = 'none'; },
  /* code tools */
  codePre: null,
  showCode(pre) {
    this.codePre = pre; const t = $('#codeTools');
    t.querySelector('.ct-lang').textContent = pre.dataset.lang ? (LANG_LABEL[normLang(pre.dataset.lang)] || pre.dataset.lang) : (pre.dataset.label ? pre.dataset.label : 'Auto-detect');
    t.style.display = 'flex'; this.placeCode();
  },
  placeCode() {
    const pre = this.codePre; if (!pre || !pre.isConnected) return this.hideCode();
    const t = $('#codeTools'); const page = $('#edPage').getBoundingClientRect(); const r = pre.getBoundingClientRect();
    t.style.top = (r.top - page.top + 4) + 'px'; t.style.left = (r.right - page.left - t.offsetWidth - 6) + 'px';
  },
  hideCode() { this.codePre = null; $('#codeTools').style.display = 'none'; },
  /* floating format bar */
  floatT: null,
  scheduleFloat() { clearTimeout(this.floatT); this.floatT = setTimeout(() => this.updateFloat(), 180); },
  updateFloat() {
    const bar = $('#floatBar'); const s = getSel();
    if (!SETTINGS.floatingBar || !s.rangeCount || s.isCollapsed || !inEditor(s.anchorNode) || closestIn(s.anchorNode, 'pre') || Editor.readOnly || document.activeElement !== Editor.el || Editor.comp) { this.hideFloat(); return; }
    const r = s.getRangeAt(0).getBoundingClientRect(); if (!r.width && !r.height) { this.hideFloat(); return; }
    bar.style.display = 'flex';
    const bw = bar.offsetWidth; let x = r.left + r.width / 2 - bw / 2; x = clamp(x, 8, innerWidth - bw - 8);
    let y = r.top - bar.offsetHeight - 8; if (y < $('#edScroll').getBoundingClientRect().top) y = r.bottom + 8;
    bar.style.left = x + 'px'; bar.style.top = y + 'px';
    App.refreshFormatState();
  },
  hideFloat() { clearTimeout(this.floatT); const b = $('#floatBar'); if (b) b.style.display = 'none'; },
  /* link hover preview */
  hoverT: null, hoverFor: null,
  scheduleHover(a) {
    if (!plugin('hover')) return;
    clearTimeout(this.hoverT); this.hoverFor = a;
    this.hoverT = setTimeout(() => this.showHover(a), 450);
  },
  showHover(a) {
    const n = S.notes[a.dataset.note]; const card = $('#hoverCard');
    if (!n || !a.isConnected) return;
    const t = document.createElement('div'); t.innerHTML = scrubHtml(n.html);
    const blocks = [...t.children].slice(0, 8); const body = document.createElement('div');
    blocks.forEach(b => body.appendChild(b));
    body.querySelectorAll('.math,.math-block').forEach(renderMath);
    body.querySelectorAll('blockquote.callout').forEach(decorateCallout);
    card.innerHTML = `<div class="hc-h">${icon('noteMd', 'c-blue')}<b>${esc(n.title)}</b><span>${esc(notePathLabel(n))}</span></div><div class="hc-b doc-render"></div>`;
    card.querySelector('.hc-b').appendChild(body);
    card.style.display = 'block';
    const r = a.getBoundingClientRect(); const cw = card.offsetWidth, ch = card.offsetHeight;
    let y = r.bottom + 6; if (y + ch > innerHeight - 10) y = r.top - ch - 6;
    card.style.left = clamp(r.left, 8, innerWidth - cw - 8) + 'px'; card.style.top = Math.max(8, y) + 'px';
  },
  hideHover() { clearTimeout(this.hoverT); this.hoverFor = null; const c = $('#hoverCard'); if (c) c.style.display = 'none'; },
};

/* ---------------- editor context menu ---------------- */
function editorMenuItems(target, spell) {
  const a = anchor();
  const items = [];
  if (spell && spell.misspelledWord) {
    if (spell.dictionarySuggestions && spell.dictionarySuggestions.length) spell.dictionarySuggestions.slice(0, 5).forEach(sg => items.push({ label: sg, html: `<b>${esc(sg)}</b>`, run: () => BRIDGE.replaceMisspelling(sg) }));
    else items.push({ label: 'No spelling suggestions', disabled: true });
    items.push({ label: `Add “${spell.misspelledWord}” to Dictionary`, icon: 'book', run: () => BRIDGE.addToDictionary(spell.misspelledWord) }, '-');
  }
  const fig = target && target.closest && target.closest('figure.img');
  if (fig) {
    Overlays.showImg(fig);
    items.push({ label: 'View Full Size', icon: 'eye', run: () => openLightbox(fig.querySelector('img').src) },
      { label: 'Edit Caption…', icon: 'edit', run: () => editCaption(fig) },
      { label: 'Size', icon: 'maximize', sub: ['25', '50', '75', '100', ''].map(w => ({ label: w ? w + '%' : 'Original', checked: (fig.querySelector('img').style.width || '') === (w ? w + '%' : ''), run: () => setImgWidth(fig, w) })) },
      IS_DESKTOP && fig.querySelector('img').dataset.file ? { label: 'Show in Explorer', icon: 'folderOpen', run: () => BRIDGE.showImage(fig.querySelector('img').dataset.file) } : null,
      { label: 'Delete Image', icon: 'trash', danger: true, run: () => { Hist.record('op'); Overlays.hideImg(); fig.remove(); Editor.changed(); } }, '-');
    return items.filter(Boolean);
  }
  items.push({ action: 'cut', icon: 'scissors' }, { action: 'copy', icon: 'copy' }, { action: 'paste', icon: 'paste' }, { action: 'pastePlain' }, '-');
  const cell = closestIn(a, 'td, th');
  if (cell) items.push({ label: 'Table', icon: 'table', sub: tableMenuItems(cell) }, '-');
  const pre = closestIn(a, 'pre');
  if (pre) items.push({ label: 'Language', icon: 'codeBlock', sub: () => langMenu(pre) }, { action: 'commentLine' }, { label: 'Copy Code', icon: 'copy', run: () => copyText(preCode(pre).textContent.replace(/\n$/, '')) }, '-');
  items.push(
    { label: 'Format', icon: 'bold', sub: [{ action: 'bold' }, { action: 'italic' }, { action: 'underline' }, { action: 'strike' }, { action: 'highlight' }, { action: 'inlineCode' }, '-', { action: 'clearFormat' }] },
    { label: 'Paragraph', icon: 'paragraph', sub: [{ action: 'paragraph' }, { action: 'h1' }, { action: 'h2' }, { action: 'h3' }, '-', { action: 'bulletList' }, { action: 'numberedList' }, { action: 'checklist' }, '-', { action: 'quote' }, { label: 'Callout', icon: 'callout', sub: calloutSubmenu() }, { action: 'codeBlock' }] },
    { label: 'Insert', icon: 'plus', sub: insertMenuItems() },
    '-', { action: 'contextActions' }, { action: 'selectAll', icon: 'selectAll' },
  );
  return items;
}
function calloutSubmenu() { return Object.entries(CALLOUTS).map(([k, [label, ic]]) => ({ label, icon: ic, run: () => setBlockType('callout:' + k) })); }
function insertMenuItems() {
  return [{ action: 'insertImage' }, { action: 'insertTable' }, { action: 'codeBlock' }, plugin('math') ? { action: 'mathBlock' } : null, plugin('math') ? { action: 'mathInline' } : null, { action: 'insertHr' }, '-', { action: 'insertLink' }, plugin('wiki') ? { action: 'insertWikilink' } : null, plugin('timer') ? { action: 'insertTimestamp' } : null].filter(Boolean);
}
function langMenu(pre) {
  const cur = normLang(pre.dataset.lang || '');
  return [{ label: 'Auto-detect', checked: !cur, run: () => setPreLang(pre, '') }, '-', ...HL_LANGS.map(l => ({ label: LANG_LABEL[l] || l, checked: cur === l, run: () => setPreLang(pre, l) }))];
}
function setPreLang(pre, l) { Hist.record('op'); if (l) pre.dataset.lang = l; else delete pre.dataset.lang; highlightPre(pre); Editor.changed(); Overlays.showCode(pre); }
async function editCaption(fig) {
  const v = await Dialog.prompt({ title: 'Image Caption', label: 'Caption (leave empty to remove)', value: fig.dataset.caption || '', okText: 'Save', validate: () => '' });
  if (v == null) return;
  Hist.record('op'); if (v) fig.dataset.caption = v; else delete fig.dataset.caption; Editor.changed();
}
function setImgWidth(fig, w) { Hist.record('op'); const img = fig.querySelector('img'); img.style.width = w ? w + '%' : ''; if (!img.getAttribute('style')) img.removeAttribute('style'); Editor.changed(); Overlays.showImg(fig); }
function openLightbox(src) { const l = $('#lightbox'); l.querySelector('img').src = src; l.classList.add('show'); }
async function copyText(t) { try { await navigator.clipboard.writeText(t); App.status('Copied to clipboard'); } catch (e) { const ta = h('textarea', { style: { position: 'fixed', opacity: '0' } }); ta.value = t; document.body.appendChild(ta); ta.select(); exec('copy'); ta.remove(); App.status('Copied to clipboard'); } }

/* ---------------- event wiring ---------------- */
function initEditorEvents() {
  const doc = $('#edDoc');
  const title = $('#title');

  title.addEventListener('input', () => { const n = S.notes[Editor.noteId]; if (!n) return; n.title = title.value; Editor.changed({ light: true }); App.refreshTitles(); });
  title.addEventListener('keydown', e => {
    if ((e.key === 'Enter' || e.key === 'ArrowDown') && !e.isComposing) { e.preventDefault(); if (Editor.el) { Editor.el.focus(); caretStart(Editor.el.firstElementChild || Editor.el); } }
  });

  doc.addEventListener('beforeinput', e => {
    if (!Editor.el || !Editor.el.contains(e.target)) return;
    if (e.inputType === 'historyUndo') { e.preventDefault(); Hist.undo(); return; }
    if (e.inputType === 'historyRedo') { e.preventDefault(); Hist.redo(); return; }
    const typing = /^(insertText|insertCompositionText|deleteContentBackward|deleteContentForward|deleteWordBackward|deleteWordForward|insertReplacementText)$/.test(e.inputType);
    Hist.record(typing ? 'type' : 'op');
    if (e.inputType === 'insertParagraph' || e.inputType === 'insertLineBreak') Hist.breakTyping();
  });

  doc.addEventListener('input', e => {
    if (!Editor.el || !Editor.el.contains(e.target)) return;
    Editor.justTyped = performance.now();
    const it = e.inputType || '';
    if (it === 'insertText' && e.data === ' ') { if (!tryBlockMarkdown()) tryInlineMarkdown(' '); }
    else if (it === 'insertText' && e.data && /[`*_=~$>\-.)]/.test(e.data.slice(-1))) tryInlineMarkdown(e.data.slice(-1));
    if (it === 'insertText' && e.data === '/' && plugin('slash') && !Editor.comp) {
      const s = getSel(); const n = s.anchorNode; const b = topBlock(n);
      if (n && n.nodeType === 3 && b && /^(P|LI|H1|H2|H3)$/.test((closestIn(n, 'li') || b).tagName) && !closestIn(n, 'pre') && !closestIn(n, 'code')) {
        const before = n.textContent.slice(0, s.anchorOffset);
        if (before === '/' || /\s\/$/.test(before) || (before.endsWith('/') && textBefore(closestIn(n, 'li') || b).replace(/​/g, '') === '/')) openCompletion('slash', n, s.anchorOffset - 1);
      }
    }
    if (it === 'insertText' && e.data === '[' && plugin('wiki') && !Editor.comp) {
      const s = getSel(); const n = s.anchorNode;
      if (n && n.nodeType === 3 && n.textContent.slice(0, s.anchorOffset).endsWith('[[') && !closestIn(n, 'pre') && !closestIn(n, 'code')) openCompletion('wiki', n, s.anchorOffset - 2);
    }
    if (Editor.comp) updateCompletion();
    if (it === 'insertParagraph') {
      const li = closestIn(anchor(), 'ul.checklist > li'); if (li && !li.textContent.trim()) li.classList.remove('done');
      if (SETTINGS.timerHeadings && Timer.running) { /* stamp handled on heading creation */ }
    }
    const pre = closestIn(anchor(), 'pre');
    if (pre) { pre._dirty = true; const code = preCode(pre); if (!code.textContent.endsWith('\n')) code.appendChild(document.createTextNode('\n')); }
    normalizeEditor();
    Editor.changed();
    Overlays.hideFloat();
    if (SETTINGS.typewriter) Typewriter.center();
  });

  doc.addEventListener('keydown', e => {
    if (!Editor.el || !Editor.el.contains(e.target) || e.isComposing) return;
    const a = anchor(); const s = getSel(); const mod = e.ctrlKey || e.metaKey;
    if (Editor.selFig && !mod) {
      if (e.key === 'Backspace' || e.key === 'Delete') { e.preventDefault(); Hist.record('op'); const f = Editor.selFig; const nx = f.nextElementSibling || f.previousElementSibling; Overlays.hideImg(); f.remove(); if (nx) caretStart(nx); Editor.changed(); return; }
      if (e.key === 'Enter') { e.preventDefault(); const f = Editor.selFig; Overlays.hideImg(); const p = emptyP(); f.after(p); setCaret(p, 0); Editor.changed(); return; }
      if (/^Arrow/.test(e.key)) { e.preventDefault(); const f = Editor.selFig; Overlays.hideImg(); const t = (e.key === 'ArrowUp' || e.key === 'ArrowLeft') ? f.previousElementSibling : f.nextElementSibling; if (t) { if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') caretEnd(t); else caretStart(t); } return; }
      if (e.key.length === 1) Overlays.hideImg();
    }
    const pre = closestIn(a, 'pre');
    /* ---------- code block keys ---------- */
    if (pre) {
      const code = preCode(pre);
      if (e.key === 'Tab') {
        e.preventDefault(); Hist.record('op');
        const tab = ' '.repeat(SETTINGS.codeTab || 4);
        const [l1, l2] = codeLines(pre);
        if (l1 !== l2 || e.shiftKey) preTransformLines(pre, l => e.shiftKey ? l.replace(new RegExp('^ {1,' + tab.length + '}'), '') : tab + l);
        else { const col = textBefore(code).split('\n').pop().length; preInsert(pre, ' '.repeat(tab.length - (col % tab.length))); }
        Editor.changed(); return;
      }
      if (e.key === 'Enter' && !e.shiftKey && !mod) {
        e.preventDefault(); Hist.record('op');
        const before = textBefore(code); const full = code.textContent;
        const atEnd = before.length >= full.length - 1;
        const lastLine = before.split('\n').pop();
        if (atEnd && before.includes('\n') && /^[ \t]*$/.test(lastLine) && full.replace(/\s/g, '').length > 0) {
          code.textContent = before.replace(/\n[ \t]*$/, '') + '\n';
          let nx = pre.nextElementSibling; if (!nx || nx.tagName !== 'P') { nx = emptyP(); pre.after(nx); }
          caretStart(nx); highlightPre(pre);
        } else {
          const line = before.split('\n').pop(); let indent = (line.match(/^\s*/) || [''])[0];
          const prevCh = before.trimEnd().slice(-1); const nextCh = full.slice(before.length, before.length + 1);
          if (/[{[(:]$/.test(before.trimEnd()) && SETTINGS.autoPairs) indent += ' '.repeat(SETTINGS.codeTab || 4);
          if (/[{[(]/.test(prevCh) && /[}\])]/.test(nextCh)) { preInsert(pre, '\n' + indent + '\n' + indent.slice(SETTINGS.codeTab || 4), ('\n' + indent.slice(SETTINGS.codeTab || 4)).length); }
          else preInsert(pre, '\n' + indent);
        }
        Editor.changed(); return;
      }
      if (e.key === 'Backspace' && s.isCollapsed && !mod) {
        if (!code.textContent.replace(/\n/g, '')) { e.preventDefault(); Hist.record('op'); const p = emptyP(); pre.replaceWith(p); setCaret(p, 0); Editor.changed(); return; }
        const before = textBefore(code);
        if (!before) { e.preventDefault(); return; }
        const pairs = { '(': ')', '[': ']', '{': '}', '"': '"', "'": "'", '`': '`' };
        const pc = before.slice(-1), nc = code.textContent.charAt(before.length);
        if (SETTINGS.autoPairs && pairs[pc] && pairs[pc] === nc) { e.preventDefault(); Hist.record('type'); const full = code.textContent; code.textContent = full.slice(0, before.length - 1) + full.slice(before.length + 1); const [n, o] = offsetToPos(code, before.length - 1); setCaret(n, o); pre._dirty = true; Editor.changed(); return; }
        const line = before.split('\n').pop();
        if (line.length && /^ +$/.test(line)) { e.preventDefault(); Hist.record('type'); const tab = SETTINGS.codeTab || 4; const del = ((line.length - 1) % tab) + 1; const full = code.textContent; code.textContent = full.slice(0, before.length - del) + full.slice(before.length); const [n, o] = offsetToPos(code, before.length - del); setCaret(n, o); pre._dirty = true; Editor.changed(); return; }
      }
      if (SETTINGS.autoPairs && !mod && !e.altKey && e.key.length === 1) {
        const open = { '(': ')', '[': ']', '{': '}', '"': '"', "'": "'", '`': '`' }; const closers = ')]}"\'`';
        const before = textBefore(code); const nc = code.textContent.charAt(before.length);
        if (closers.includes(e.key) && nc === e.key && s.isCollapsed) { e.preventDefault(); const [n, o] = offsetToPos(code, before.length + 1); setCaret(n, o); return; }
        if (open[e.key]) {
          const pc = before.slice(-1);
          if (!s.isCollapsed) { e.preventDefault(); Hist.record('op'); const t = s.toString(); preInsert(pre, e.key + t + open[e.key], 1); Editor.changed(); return; }
          if (/["'`]/.test(e.key) && /[\w]/.test(pc)) return;
          if (!nc || /[\s)\]},;:]/.test(nc) || nc === '\n') { e.preventDefault(); Hist.record('type'); preInsert(pre, e.key + open[e.key], 1); Editor.changed(); return; }
        }
      }
      return;
    }
    /* ---------- Tab: tables & lists ---------- */
    if (e.key === 'Tab' && !mod) {
      const cell = closestIn(a, 'td, th');
      if (cell) {
        e.preventDefault();
        const table = cell.closest('table'); const cells = [...table.querySelectorAll('td, th')]; let i = cells.indexOf(cell) + (e.shiftKey ? -1 : 1);
        if (i >= cells.length) { tableOp('rowBelow', cell); return; }
        if (i >= 0) selectNodeContents(cells[i]);
        return;
      }
      const li = closestIn(a, 'li');
      if (li) { e.preventDefault(); if (e.shiftKey) outdentLi(li); else indentLi(li); return; }
      e.preventDefault(); return;
    }
    /* ---------- Enter ---------- */
    if (e.key === 'Enter' && !e.shiftKey && !mod && !e.altKey) {
      const b = topBlock(a);
      if (b && b.tagName === 'P') {
        const t = b.textContent.replace(/ /g, ' ').replace(/​/g, '').trim();
        let m;
        if (plugin('markdown') && (m = t.match(/^```\s*([\w#+.-]*)$/))) { e.preventDefault(); Hist.record('op'); const np = makePre('', normLang(m[1]) || SETTINGS.codeLang || ''); b.replaceWith(np); if (!np.nextElementSibling) np.after(emptyP()); setCaret(np.querySelector('code').firstChild, 0); Editor.lastPre = np; highlightPre(np); Editor.changed(); return; }
        if (plugin('markdown') && plugin('math') && t === '$$') { e.preventDefault(); Hist.record('op'); const m2 = mathAtom('', true); b.replaceWith(m2); const p = emptyP(); m2.after(p); setCaret(p, 0); Editor.changed(); setTimeout(() => editMath(m2), 10); return; }
        if (plugin('markdown') && /^(-{3,}|\*{3,}|_{3,})$/.test(t)) { e.preventDefault(); Hist.record('op'); const hr = document.createElement('hr'); const p = emptyP(); b.replaceWith(hr); hr.after(p); setCaret(p, 0); Editor.changed(); return; }
      }
      const bq = closestIn(a, 'blockquote');
      if (bq) {
        const inner = closestIn(a, 'blockquote > p, blockquote > h1, blockquote > h2, blockquote > h3') || null;
        if (inner && !inner.textContent.replace(/[​\s]/g, '') && !inner.querySelector('img,.math,.wikilink,.ts')) {
          e.preventDefault(); Hist.record('op');
          const rest = []; let n = inner.nextElementSibling; while (n) { rest.push(n); n = n.nextElementSibling; }
          inner.remove();
          const p = emptyP(); bq.after(p);
          if (rest.length) { const nb = bq.cloneNode(false); rest.forEach(r => nb.appendChild(r)); p.after(nb); if (nb.classList.contains('callout')) { delete nb.dataset.title; decorateCallout(nb); } }
          if (!bq.querySelector(':scope > p, :scope > ul, :scope > ol, :scope > pre')) bq.remove();
          setCaret(p, 0); Editor.changed(); return;
        }
      }
      const hd = closestIn(a, 'h1, h2, h3');
      if (hd && topBlock(a) === hd) {
        if (atBlockEnd(hd)) { e.preventDefault(); Hist.record('op'); const p = emptyP(); hd.after(p); setCaret(p, 0); if (hd.dataset.folded) toggleFold(hd, false); if (Timer.running && SETTINGS.timerHeadings && !hd.querySelector('.ts')) { hd.appendChild(document.createTextNode(' ')); hd.appendChild(tsAtom(Timer.elapsed())); } Editor.changed(); Outline.schedule(); return; }
        if (atBlockStart(hd) && hd.textContent.trim()) { e.preventDefault(); Hist.record('op'); hd.before(emptyP()); Editor.changed(); return; }
      }
      const cell = closestIn(a, 'td, th');
      if (cell) { e.preventDefault(); Hist.record('op'); exec('insertLineBreak'); Editor.changed(); return; }
      const li = closestIn(a, 'li');
      if (li && !li.textContent.replace(/[​\s]/g, '') && !li.querySelector('img,.math,.wikilink,.ts,ul,ol')) {
        e.preventDefault(); outdentLi(li); return;
      }
    }
    /* ---------- Backspace ---------- */
    if (e.key === 'Backspace' && !mod && s.isCollapsed) {
      const blk = closestIn(a, 'h1, h2, h3');
      if (blk && topBlock(a) === blk && atBlockStart(blk)) { e.preventDefault(); Hist.record('op'); const p = document.createElement('p'); while (blk.firstChild) p.appendChild(blk.firstChild); if (!p.firstChild) p.innerHTML = '<br>'; blk.replaceWith(p); caretStart(p); Editor.changed(); Outline.schedule(); return; }
      const bq = closestIn(a, 'blockquote');
      if (bq) {
        const first = [...bq.children].find(c => !c.classList.contains('co-head'));
        const inner = closestIn(a, 'blockquote > *');
        if (inner === first && atBlockStart(first)) { e.preventDefault(); Hist.record('op'); unwrapQuote(bq); Editor.changed(); return; }
      }
      const li = closestIn(a, 'li');
      if (li && atBlockStart(li) && !li.previousElementSibling && li.parentNode.parentNode === Editor.el) { e.preventDefault(); outdentLi(li); return; }
      const b = topBlock(a);
      if (b && b.tagName === 'P' && atBlockStart(b)) {
        const prev = b.previousElementSibling;
        if (prev && (prev.tagName === 'FIGURE' || prev.classList.contains('math-block'))) { e.preventDefault(); if (!b.textContent.trim() && !b.querySelector('img,.math')) { Hist.record('op'); b.remove(); } if (prev.tagName === 'FIGURE') Overlays.showImg(prev); else { const r = document.createRange(); r.selectNode(prev); getSel().removeAllRanges(); getSel().addRange(r); } return; }
        if (prev && prev.tagName === 'HR') { e.preventDefault(); Hist.record('op'); prev.remove(); Editor.changed(); return; }
        if (prev && prev.tagName === 'PRE') { e.preventDefault(); if (!b.textContent.trim()) { Hist.record('op'); b.remove(); Editor.changed(); } const code = preCode(prev); const [n, o] = offsetToPos(code, Math.max(0, code.textContent.length - 1)); setCaret(n, o); return; }
        if (prev && prev.tagName === 'TABLE') { e.preventDefault(); if (!b.textContent.trim()) { Hist.record('op'); b.remove(); Editor.changed(); } caretEnd(prev.querySelector('tr:last-child > :last-child')); return; }
      }
    }
    if (e.key === 'Delete' && !mod && s.isCollapsed) {
      const b = topBlock(a);
      if (b && atBlockEnd(b)) { const nx = b.nextElementSibling; if (nx && nx.tagName === 'FIGURE') { e.preventDefault(); Overlays.showImg(nx); return; } }
    }
    if (e.key.length === 1 && !mod && Editor.selFig) Overlays.hideImg();
  });

  /* ---------- clipboard ---------- */
  doc.addEventListener('copy', e => onCopy(e, false));
  doc.addEventListener('cut', e => onCopy(e, true));
  function onCopy(e, cut) {
    if (!Editor.el || !Editor.el.contains(getSel().anchorNode)) return;
    const s = getSel(); if (!s.rangeCount || s.isCollapsed) { if (Editor.selFig) { e.preventDefault(); const w = document.createElement('div'); w.appendChild(Editor.selFig.cloneNode(true)); e.clipboardData.setData('application/x-ln-html', serializeEditor(w)); e.clipboardData.setData('text/html', serializeEditor(w)); if (cut) { Hist.record('op'); const f = Editor.selFig; Overlays.hideImg(); f.remove(); Editor.changed(); } } return; }
    if (closestIn(s.anchorNode, 'pre') && closestIn(s.focusNode, 'pre')) return; // plain text in code
    const frag = s.getRangeAt(0).cloneContents(); const w = document.createElement('div'); w.appendChild(frag);
    const html = serializeEditor(w);
    e.clipboardData.setData('application/x-ln-html', html);
    e.clipboardData.setData('text/html', html);
    e.clipboardData.setData('text/plain', s.toString());
    e.preventDefault();
    if (cut) { Hist.record('op'); s.deleteFromDocument(); normalizeEditor(); Editor.changed(); }
  }
  doc.addEventListener('paste', e => {
    if (!Editor.el || !Editor.el.contains(e.target)) return;
    const cd = e.clipboardData; if (!cd) return;
    Editor.closeCompletion();
    let files = [...(cd.files || [])].filter(f => /^image\//.test(f.type));
    if (!files.length && cd.items) files = [...cd.items].filter(i => i.kind === 'file' && /^image\//.test(i.type)).map(i => i.getAsFile()).filter(Boolean);
    if (files.length) { e.preventDefault(); insertImages(files); return; }
    const a = anchor(); const pre = closestIn(a, 'pre');
    const plain = cd.getData('text/plain') || '';
    if (pre) { e.preventDefault(); Hist.record('op'); preInsert(pre, plain.replace(/\r\n?/g, '\n')); highlightPre(pre); Editor.changed(); return; }
    if (App.pastePlainOnce) { App.pastePlainOnce = false; e.preventDefault(); Hist.record('op'); pastePlainText(plain); return; }
    const internal = cd.getData('application/x-ln-html');
    if (internal) { e.preventDefault(); Hist.record('op'); insertFragmentHtml(scrubHtml(internal)); return; }
    const s = getSel();
    if (/^https?:\/\/\S+$/.test(plain.trim()) && !s.isCollapsed && !closestIn(a, 'a')) { e.preventDefault(); Hist.record('op'); exec('createLink', plain.trim()); Editor.changed(); return; }
    if (plugin('smartPaste') && plain && looksLikeMarkdown(plain) && (!cd.getData('text/html') || /```|^#{1,6}\s|\$\$/m.test(plain) && !/<(table|ul|ol|h[1-6])/i.test(cd.getData('text/html')))) {
      e.preventDefault(); Hist.record('op'); insertFragmentHtml(mdToHtml(plain)); return;
    }
    const html = cd.getData('text/html');
    if (html && plugin('smartPaste')) { e.preventDefault(); Hist.record('op'); insertFragmentHtml(sanitizePaste(html)); return; }
    if (plain.includes('\n')) { e.preventDefault(); Hist.record('op'); pastePlainText(plain); return; }
  });
  function pastePlainText(plain) {
    const lines = plain.replace(/\r\n?/g, '\n').split('\n');
    if (lines.length === 1) { exec('insertText', plain); Editor.changed(); return; }
    insertFragmentHtml(lines.map(l => '<p>' + (esc(l) || '<br>') + '</p>').join(''));
  }

  /* ---------- drag & drop ---------- */
  const sc = $('#edScroll'); let depth = 0;
  const hasFiles = e => e.dataTransfer && [...e.dataTransfer.types].includes('Files');
  sc.addEventListener('dragenter', e => { if (!Editor.el) return; if (hasFiles(e)) { depth++; $('#dropzone').classList.add('show'); } });
  sc.addEventListener('dragleave', e => { if (hasFiles(e)) { depth = Math.max(0, depth - 1); if (!depth) $('#dropzone').classList.remove('show'); } });
  sc.addEventListener('dragover', e => { if (!Editor.el) return; const t = e.dataTransfer && [...e.dataTransfer.types]; if (t && (t.includes('Files') || t.includes('application/x-ln-note'))) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; } });
  sc.addEventListener('drop', e => {
    depth = 0; $('#dropzone').classList.remove('show');
    if (!Editor.el || Editor.readOnly) return;
    const dt = e.dataTransfer; if (!dt) return;
    const placeCaret = () => {
      let r = null;
      if (document.caretRangeFromPoint) r = document.caretRangeFromPoint(e.clientX, e.clientY);
      else if (document.caretPositionFromPoint) { const p = document.caretPositionFromPoint(e.clientX, e.clientY); if (p) { r = document.createRange(); r.setStart(p.offsetNode, p.offset); } }
      Editor.el.focus({ preventScroll: true });
      if (r && Editor.el.contains(r.startContainer)) { getSel().removeAllRanges(); getSel().addRange(r); } else caretEnd(Editor.el.lastElementChild || Editor.el);
    };
    const noteId = dt.getData('application/x-ln-note');
    if (noteId && S.notes[noteId]) { e.preventDefault(); placeCaret(); Hist.record('op'); insertNodeAtCaret(wikiAtom(S.notes[noteId])); Editor.changed(); return; }
    const files = [...(dt.files || [])]; if (!files.length) return;
    e.preventDefault(); placeCaret();
    const imgs = files.filter(f => /^image\//.test(f.type));
    const mds = files.filter(f => /\.(md|markdown|txt)$/i.test(f.name));
    if (imgs.length) insertImages(imgs);
    if (mds.length) mds.forEach(async f => { const t = await f.text(); Hist.record('op'); insertFragmentHtml(mdToHtml(t)); });
  });

  /* ---------- mouse ---------- */
  doc.addEventListener('mousedown', e => {
    if (!Editor.el || !Editor.el.contains(e.target)) return;
    const img = e.target.closest('figure.img img');
    if (img) { e.preventDefault(); Editor.el.focus({ preventScroll: true }); Overlays.showImg(img.closest('figure')); return; }
    if (Editor.selFig && !e.target.closest('figure.img')) Overlays.hideImg();
    const li = e.target.closest('ul.checklist > li');
    if (li && e.target === li) { const r = li.getBoundingClientRect(); if (e.clientX - r.left < 26 && e.clientY - r.top < 28) { e.preventDefault(); Hist.record('op'); li.classList.toggle('done'); Editor.changed(); Panels.refresh('todo'); } }
  });
  doc.addEventListener('click', e => {
    if (!Editor.el || !Editor.el.contains(e.target)) return;
    const wl = e.target.closest('a.wikilink'); if (wl) { e.preventDefault(); Overlays.hideHover(); followWikilink(wl); return; }
    const m = e.target.closest('.math, .math-block'); if (m && !Editor.readOnly) { e.preventDefault(); editMath(m); return; }
    const head = e.target.closest('.co-head'); if (head && !Editor.readOnly) { e.preventDefault(); calloutMenu(head.parentNode, head.querySelector('.co-title').getBoundingClientRect()); return; }
    const a = e.target.closest('a[href]');
    if (a && (e.ctrlKey || e.metaKey)) { e.preventDefault(); openExternal(a.getAttribute('href')); }
  });
  doc.addEventListener('dblclick', e => {
    const img = e.target.closest && e.target.closest('#editor figure.img img'); if (img) { openLightbox(img.src); return; }
    const fig = e.target.closest && e.target.closest('#editor figure.img'); if (fig) editCaption(fig);
  });
  doc.addEventListener('mouseover', e => {
    if (!Editor.el) return;
    const wl = e.target.closest && e.target.closest('#editor a.wikilink');
    if (wl) { if (Overlays.hoverFor !== wl) Overlays.scheduleHover(wl); } else if (Overlays.hoverFor && !e.target.closest('#hoverCard')) Overlays.hideHover();
    const pre = e.target.closest && e.target.closest('#editor pre');
    if (pre && Overlays.codePre !== pre) Overlays.showCode(pre);
  });
  doc.addEventListener('contextmenu', e => {
    if (!Editor.el || !Editor.el.contains(e.target)) return;
    if (IS_DESKTOP) { App.pendingContext = { target: e.target, x: e.clientX, y: e.clientY, t: Date.now() }; return; } // main process sends spelling info
    e.preventDefault();
    Menu.open(editorMenuItems(e.target, null), { x: e.clientX, y: e.clientY });
  });
  $('#hoverCard').addEventListener('mouseleave', () => Overlays.hideHover());

  /* ---------- selection tracking ---------- */
  document.addEventListener('selectionchange', () => {
    if (!Editor.el) return;
    const s = getSel(); if (!s.rangeCount) return;
    const a = s.anchorNode;
    if (!Editor.el.contains(a)) { Gutter.curLine(); return; }
    Editor.lastRange = s.getRangeAt(0).cloneRange();
    if (performance.now() - Editor.justTyped > 80) Hist.breakTyping();
    const pre = closestIn(a, 'pre');
    if (Editor.lastPre && Editor.lastPre !== pre && Editor.lastPre.isConnected && Editor.lastPre._dirty) highlightPre(Editor.lastPre);
    Editor.lastPre = pre;
    if (pre) Overlays.showCode(pre);
    const b = topBlock(a);
    if (b && b.classList && b.classList.contains('fold-hidden')) unfoldFor(b);
    if (Editor.comp) updateCompletion();
    Gutter.curLine(); App.updateCaret(); App.refreshFormatState(); Outline.highlight();
    Overlays.scheduleFloat();
    if (SETTINGS.focusMode) FocusMode.update();
  });
  $('#edScroll').addEventListener('scroll', () => { if (Editor.el && Editor.el.children.length > 60) Gutter.schedule(); if (Editor.selFig) Overlays.placeImg(); if (Overlays.codePre) Overlays.placeCode(); Overlays.hideFloat(); Overlays.hideHover(); if (Editor.comp) Editor.closeCompletion(); }, { passive: true });
  window.addEventListener('resize', rafThrottle(() => { Gutter.render(); if (Editor.selFig) Overlays.placeImg(); if (Overlays.codePre) Overlays.placeCode(); }));
  new ResizeObserver(() => Gutter.schedule()).observe($('#edDoc'));

  /* ---------- overlays: image bar ---------- */
  const ib = $('#imgBar');
  ib.addEventListener('mousedown', e => e.preventDefault());
  ib.addEventListener('click', e => {
    const b = e.target.closest('button'); const fig = Editor.selFig; if (!b || !fig) return;
    if (b.dataset.w !== undefined) setImgWidth(fig, b.dataset.w);
    else if (b.dataset.align) { Hist.record('op'); if (b.dataset.align === 'center') delete fig.dataset.align; else fig.dataset.align = b.dataset.align; Editor.changed(); Overlays.showImg(fig); }
    else if (b.dataset.act === 'view') openLightbox(fig.querySelector('img').src);
    else if (b.dataset.act === 'caption') editCaption(fig);
    else if (b.dataset.act === 'reveal') BRIDGE && BRIDGE.showImage(fig.querySelector('img').dataset.file);
    else if (b.dataset.act === 'del') { Hist.record('op'); Overlays.hideImg(); const nx = fig.nextElementSibling; fig.remove(); if (nx) caretStart(nx); Editor.changed(); }
  });
  // resize handle
  $('#imgHandle').addEventListener('pointerdown', e => {
    const fig = Editor.selFig; if (!fig) return; e.preventDefault();
    const img = fig.querySelector('img'); const edW = Editor.el.clientWidth; const startX = e.clientX; const startW = img.getBoundingClientRect().width;
    Hist.record('op');
    const mv = ev => { const w = clamp(startW + (ev.clientX - startX) * (fig.dataset.align && fig.dataset.align !== 'center' ? 1 : 2), 40, edW); img.style.width = Math.round(w / edW * 100) + '%'; Overlays.placeImg(); };
    const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); Editor.changed(); Overlays.showImg(fig); };
    addEventListener('pointermove', mv); addEventListener('pointerup', up);
  });
  $('#lightbox').addEventListener('click', () => $('#lightbox').classList.remove('show'));
  /* ---------- overlays: code tools ---------- */
  const ct = $('#codeTools');
  ct.addEventListener('mousedown', e => e.preventDefault());
  ct.querySelector('.ct-lang').addEventListener('click', e => { const pre = Overlays.codePre; if (pre) Menu.open(langMenu(pre), { rect: e.currentTarget.getBoundingClientRect(), alignRight: true }); });
  ct.querySelector('.ct-copy').addEventListener('click', () => { const pre = Overlays.codePre; if (pre) copyText(preCode(pre).textContent.replace(/\n$/, '')); });
  /* ---------- overlays: floating bar ---------- */
  const fb = $('#floatBar');
  fb.addEventListener('mousedown', e => e.preventDefault());
  fb.addEventListener('click', e => { const b = e.target.closest('[data-action]'); if (b) { Actions.run(b.dataset.action); Overlays.scheduleFloat(); } });
}
function insertFragmentHtml(html) {
  if (!html) return;
  ensureFocus();
  const t = document.createElement('template'); t.innerHTML = html;
  const nodes = [...t.content.childNodes];
  const allBlocks = nodes.length && nodes.every(n => n.nodeType === 1 && BLOCK_TAGS.test(n.tagName));
  const single = nodes.length === 1 && nodes[0].nodeType === 1 && nodes[0].tagName === 'P';
  if (single || !allBlocks) {
    const content = single ? nodes[0].innerHTML : html;
    exec('insertHTML', content);
  } else {
    const s = getSel(); const b = topBlock(anchor());
    const frag = document.createDocumentFragment(); nodes.forEach(n => frag.appendChild(n));
    const last = nodes[nodes.length - 1];
    if (b && b.tagName === 'P' && !b.textContent.replace(/[​\s]/g, '') && !b.querySelector('img,.math,.wikilink')) b.replaceWith(frag);
    else if (b && b.tagName === 'P' && !atBlockEnd(b)) {
      const r = document.createRange(); r.setStart(s.anchorNode, s.anchorOffset); r.setEnd(b, b.childNodes.length);
      const tail = document.createElement('p'); tail.appendChild(r.extractContents()); if (!tail.textContent.trim()) tail.innerHTML = '<br>';
      b.after(frag); last.after(tail); if (!b.textContent.trim() && !b.querySelector('img,.math')) b.remove();
    } else if (b) b.after(frag); else Editor.el.appendChild(frag);
    if (last.isConnected) { if (/^(P|H1|H2|H3|LI)$/.test(last.tagName)) caretEnd(last); else { const p = last.nextElementSibling && last.nextElementSibling.tagName === 'P' ? last.nextElementSibling : (() => { const x = emptyP(); last.after(x); return x; })(); caretStart(p); } }
  }
  Editor.decorate(Editor.el);
  normalizeEditor(); Editor.changed(); Outline.schedule();
}
function openExternal(href) {
  if (!href) return;
  if (IS_DESKTOP) BRIDGE.openExternal(href);
  else { const a = h('a', { href, target: '_blank', rel: 'noopener' }); document.body.appendChild(a); a.click(); a.remove(); }
}
