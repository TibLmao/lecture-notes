'use strict';
/* ============================================================
   Atoms & rich blocks: math, note links, timestamps, callouts,
   images, heading folding
   ============================================================ */

/* ---------------- math ---------------- */
function mathAtom(tex, block) {
  const el = h(block ? 'div.math-block' : 'span.math', { contenteditable: 'false', 'data-tex': tex });
  renderMath(el); return el;
}
function renderMath(el) {
  const tex = el.dataset.tex || '';
  const block = el.classList.contains('math-block');
  if (!tex.trim()) { el.innerHTML = `<span class="math-empty">${block ? 'Empty equation: click to edit' : '∑'}</span>`; return; }
  if (window.katex && plugin('math')) {
    try {
      katex.render(tex, el, { throwOnError: false, displayMode: block, output: document.querySelector('link[href*="katex"]') ? 'htmlAndMathml' : 'mathml', strict: 'ignore', trust: false });
      return;
    } catch (e) { /* fall through */ }
  }
  el.innerHTML = `<code class="math-src">${esc(block ? '$$' + tex + '$$' : '$' + tex + '$')}</code>`;
}
function editMath(el) {
  const block = el.classList.contains('math-block');
  const ta = h('textarea.field.mono.no-enter', { rows: block ? 5 : 2, spellcheck: 'false', placeholder: block ? '\\int_0^1 x^2\\,dx = \\frac{1}{3}' : 'e^{i\\pi} + 1 = 0' });
  ta.value = el.dataset.tex || '';
  const prev = h('div.math-preview');
  const upd = () => { const tmp = h(block ? 'div.math-block' : 'span.math', { 'data-tex': ta.value }); renderMath(tmp); prev.innerHTML = ''; prev.appendChild(tmp); };
  ta.addEventListener('input', upd); upd();
  const tips = h('div.dlg-hint', 'LaTeX: ^ superscript · _ subscript · \\frac{a}{b} · \\sqrt{x} · \\sum_{i=1}^n · \\alpha \\beta · \\le \\ge · \\in · \\mathbb{R}');
  ta.addEventListener('keydown', e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey || !block)) { e.preventDefault(); d.primary(); } });
  const d = Dialog.open({ title: block ? 'Edit Equation' : 'Edit Inline Math', width: 520, body: h('div', ta, h('div.dlg-label', 'Preview'), prev, tips), footerLeft: h('button.btn', { onclick: () => { d.close(); Hist.record('op'); const nx = el.nextSibling; el.remove(); if (nx && nx.nodeType === 3) setCaret(nx, 0); Editor.changed(); } }, 'Delete'), buttons: [
    { label: 'Cancel', value: null },
    { label: 'Done', primary: true, run: () => { Hist.record('op'); el.dataset.tex = ta.value.trim(); renderMath(el); Editor.changed(); setTimeout(() => { Editor.el && Editor.el.focus({ preventScroll: true }); try { const r = document.createRange(); r.setStartAfter(el); r.collapse(true); getSel().removeAllRanges(); getSel().addRange(r); } catch (e) {} }, 0); } },
  ] });
  setTimeout(() => { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }, 30);
}
function insertMath(block) {
  if (!ensureFocus()) return;
  Hist.record('op');
  const s = getSel(); const selected = s.isCollapsed ? '' : s.toString();
  const el = mathAtom(selected, block);
  if (block) insertBlock(el); else insertNodeAtCaret(el);
  Editor.changed();
  if (!selected) setTimeout(() => editMath(el), 10);
}

/* ---------------- note links ---------------- */
function wikiAtom(note, titleIfMissing) {
  if (note) return h('a.wikilink', { contenteditable: 'false', 'data-note': note.id }, note.title || 'Untitled');
  return h('a.wikilink.broken', { contenteditable: 'false', 'data-title': titleIfMissing }, titleIfMissing);
}
function refreshWikilink(a) {
  const n = a.dataset.note ? S.notes[a.dataset.note] : null;
  if (n) { a.textContent = n.title || 'Untitled'; a.classList.remove('broken'); a.removeAttribute('data-title'); }
  else if (a.dataset.title) { const m = noteByTitle(a.dataset.title); if (m) { a.dataset.note = m.id; a.textContent = m.title; a.classList.remove('broken'); a.removeAttribute('data-title'); } else a.classList.add('broken'); }
  else a.classList.add('broken');
}
async function followWikilink(a) {
  const n = S.notes[a.dataset.note];
  if (n) { App.open(n.id); return; }
  const title = a.dataset.title || a.textContent;
  const ok = await Dialog.confirm({ title: 'Create Note', message: `“${title}” doesn’t exist yet. Create it in the same module?`, okText: 'Create' });
  if (!ok) return;
  const cur = S.notes[Editor.noteId];
  const nn = createNote(cur ? cur.folderId : defaultFolderId(), { title });
  a.dataset.note = nn.id; refreshWikilink(a); Editor.changed(); Editor.flush();
  App.open(nn.id);
}

/* ---------------- timestamps ---------------- */
function tsAtom(sec) { return h('span.ts', { contenteditable: 'false', 'data-t': String(Math.round(sec)) }, fmtDuration(sec, SETTINGS.timerHours)); }

/* ---------------- callouts ---------------- */
function decorateCallout(bq) {
  const type = normCallout(bq.dataset.type);
  bq.dataset.type = type;
  const [label, ic] = CALLOUTS[type];
  let head = bq.querySelector(':scope > .co-head');
  if (!head) { head = h('div.co-head', { contenteditable: 'false' }); bq.prepend(head); }
  head.innerHTML = `${icon(ic)}<span class="co-title">${esc(bq.dataset.title || label)}</span><span class="co-type">${icon('caretDown')}</span>`;
  if (!bq.querySelector(':scope > p, :scope > ul, :scope > ol, :scope > pre, :scope > table')) bq.appendChild(emptyP());
}
function calloutMenu(bq, rect) {
  const items = Object.entries(CALLOUTS).map(([k, [label, ic]]) => ({ label, icon: ic, checked: bq.dataset.type === k, run: () => { Hist.record('op'); bq.dataset.type = k; decorateCallout(bq); Editor.changed(); } }));
  items.push('-', { label: 'Rename Title…', icon: 'edit', run: async () => { const t = await Dialog.prompt({ title: 'Callout Title', value: bq.dataset.title || CALLOUTS[bq.dataset.type][0], okText: 'Rename' }); if (t == null) return; Hist.record('op'); if (t === CALLOUTS[bq.dataset.type][0]) delete bq.dataset.title; else bq.dataset.title = t; decorateCallout(bq); Editor.changed(); } },
    { label: 'Convert to Quote', icon: 'quote', run: () => { Hist.record('op'); bq.classList.remove('callout'); delete bq.dataset.type; delete bq.dataset.title; bq.querySelector('.co-head')?.remove(); Editor.changed(); } },
    { label: 'Remove Callout', icon: 'trash', run: () => { Hist.record('op'); unwrapQuote(bq); Editor.changed(); } });
  Menu.open(items, { rect });
}

/* ---------------- images ---------------- */
const OK_IMAGE = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml'];
function makeFigure(src) {
  const f = h('figure.img', { contenteditable: 'false' });
  const img = h('img', { src, alt: '', draggable: 'false' });
  img.addEventListener('load', () => Gutter.schedule(), { once: true });
  f.appendChild(img);
  if (SETTINGS.imgWidth) img.style.width = SETTINGS.imgWidth + '%';
  return f;
}
async function insertImages(files, opts = {}) {
  files = [...files].filter(f => f && (/^image\//.test(f.type || '') || /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(f.name || '')));
  if (!files.length || !Editor.el) return;
  Hist.record('op');
  for (const f of files) {
    const ed = Editor.el, noteId = Editor.noteId;
    const fig = makeFigure(URL.createObjectURL(f)); fig.classList.add('uploading');
    insertBlock(fig);
    const img = fig.querySelector('img');
    App.progress(true, 'Saving image…');
    try {
      let blob = f;
      if (!OK_IMAGE.includes(f.type) || f.size > 6e6) blob = await downscaleImage(f, SETTINGS.imgMaxDim || 2400, SETTINGS.imgQuality || 0.88);
      else if (Math.max((await loadImageEl(f)).naturalWidth, 0) > (SETTINGS.imgMaxDim || 2400) * 1.5) blob = await downscaleImage(f, SETTINGS.imgMaxDim || 2400, SETTINGS.imgQuality || 0.88);
      const r = await Store.saveImage(blob);
      img.src = r.src; if (r.file) img.dataset.file = r.file;
      fig.classList.remove('uploading');
      if (ed === Editor.el) Editor.changed();
      else { const n = S.notes[noteId]; if (n) { n.html = serializeEditor(ed); n.updated = Date.now(); Store.saveNote(n); } }
    } catch (e) {
      fig.remove();
      notify('Couldn’t add image', String(e && e.message || e), 'error');
    } finally { App.progress(false); }
  }
}
function pickImages() {
  const inp = h('input', { type: 'file', accept: 'image/*', multiple: true });
  inp.addEventListener('change', () => insertImages(inp.files));
  inp.click();
}

/* ---------------- heading folding ---------------- */
function applyFolds(root = Editor.el) {
  if (!root) return;
  let hideLvl = 0;
  for (const b of root.children) {
    const hm = /^H([1-3])$/.exec(b.tagName);
    if (hm) {
      const lvl = +hm[1];
      if (hideLvl && lvl <= hideLvl) hideLvl = 0;
      b.classList.toggle('fold-hidden', !!hideLvl);
      if (!hideLvl && b.dataset.folded) hideLvl = lvl;
    } else b.classList.toggle('fold-hidden', !!hideLvl);
  }
}
function toggleFold(hd, force) {
  if (!hd || !/^H[1-3]$/.test(hd.tagName)) return;
  const on = force != null ? force : !hd.dataset.folded;
  if (on) {
    // move caret out of the section that will be hidden
    hd.dataset.folded = '1';
    const s = getSel(); if (s.rangeCount && inEditor(s.anchorNode)) { const b = topBlock(s.anchorNode); applyFolds(); if (b && b.classList.contains('fold-hidden')) caretEnd(hd); }
  } else delete hd.dataset.folded;
  applyFolds(); Editor.changed({ light: true }); Gutter.schedule();
}
function sectionHeadingFor(b) {
  let n = b; while (n && !/^H[1-3]$/.test(n.tagName)) n = n.previousElementSibling; return n;
}
function unfoldFor(b) {
  let n = b.previousElementSibling; let guard = 0;
  while (n && guard++ < 5000) { if (/^H[1-3]$/.test(n.tagName) && n.dataset.folded) delete n.dataset.folded; n = n.previousElementSibling; }
  applyFolds(); Gutter.schedule();
}
function foldAll(on) {
  if (!Editor.el) return;
  Editor.el.querySelectorAll(':scope > h1, :scope > h2, :scope > h3').forEach(hd => { if (on) hd.dataset.folded = '1'; else delete hd.dataset.folded; });
  if (on) { const s = getSel(); const b = topBlock(anchor()); applyFolds(); if (b && b.classList.contains('fold-hidden')) caretEnd(sectionHeadingFor(b) || Editor.el.firstElementChild); }
  applyFolds(); Editor.changed({ light: true }); Gutter.schedule();
}
function foldAtCaret(on) {
  const b = curBlock(); if (!b) return;
  const hd = /^H[1-3]$/.test(b.tagName) ? b : sectionHeadingFor(b);
  if (hd) toggleFold(hd, on);
}
