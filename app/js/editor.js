'use strict';
/* ============================================================
   Editor core: mounting, saving, undo history, selection,
   block & inline operations, markdown triggers, keyboard.
   ============================================================ */
const BLOCK_TAGS = /^(P|H1|H2|H3|UL|OL|PRE|BLOCKQUOTE|TABLE|HR|FIGURE|DIV)$/;
const isAtomEl = el => el && el.nodeType === 1 && (el.getAttribute('contenteditable') === 'false');

const Editor = {
  el: null, noteId: null, readOnly: false, dirty: false,
  lastRange: null, selFig: null, lastPre: null, comp: null,
  hist: new Map(), justTyped: 0, selStack: [],

  /* ---------------- lifecycle ---------------- */
  mount(id) {
    const n = S.notes[id];
    this.flush();
    this.closeCompletion();
    Overlays.hideAll();
    const slot = $('#editorSlot');
    if (!n) { this.el = null; this.noteId = null; slot.innerHTML = ''; App.showEmpty(true); Gutter.render(); return; }
    App.showEmpty(false);
    const ed = h('div#editor', { contenteditable: this.readOnly ? 'false' : 'true', spellcheck: SETTINGS.spellcheck ? 'true' : 'false', 'data-note': id, autocapitalize: 'sentences' });
    ed.innerHTML = scrubHtml(n.html) || '<p><br></p>';
    if (!ed.firstChild) ed.innerHTML = '<p><br></p>';
    slot.innerHTML = ''; slot.appendChild(ed);
    this.el = ed; this.noteId = id; this.dirty = false;
    this.decorate(ed);
    $('#title').value = n.title || '';
    $('#title').readOnly = this.readOnly;
    this.renderMeta();
    try { document.execCommand('defaultParagraphSeparator', false, 'p'); } catch (e) {}
    const sc = $('#edScroll'); sc.scrollTop = (n._scroll || 0);
    Gutter.render(); Outline.refresh(); App.updateStatus();
    Find.onMount();
  },
  /** Post-process a freshly loaded/restored editor DOM. */
  decorate(root = this.el) {
    if (!root) return;
    root.querySelectorAll('pre').forEach(p => { p.spellcheck = false; preCode(p); if (!p.querySelector('code').textContent.endsWith('\n')) p.querySelector('code').appendChild(document.createTextNode('\n')); highlightPre(p); });
    root.querySelectorAll('figure.img').forEach(f => { f.setAttribute('contenteditable', 'false'); const img = f.querySelector('img'); if (img) { img.draggable = false; if (!img.complete) img.addEventListener('load', () => Gutter.schedule(), { once: true }); } });
    root.querySelectorAll('.math, .math-block').forEach(m => { m.setAttribute('contenteditable', 'false'); renderMath(m); });
    root.querySelectorAll('a.wikilink').forEach(a => { a.setAttribute('contenteditable', 'false'); refreshWikilink(a); });
    root.querySelectorAll('.ts').forEach(t => t.setAttribute('contenteditable', 'false'));
    root.querySelectorAll('blockquote.callout').forEach(decorateCallout);
    root.querySelectorAll('a[href]:not(.wikilink)').forEach(a => a.title = 'Ctrl+Click to open ' + a.getAttribute('href'));
    applyFolds(root);
    if (!root.lastElementChild || !/^(P|H1|H2|H3|UL|OL|BLOCKQUOTE)$/.test(root.lastElementChild.tagName)) root.appendChild(emptyP());
  },
  syncTitle() { const n = S.notes[this.noteId]; if (n && document.activeElement !== $('#title')) $('#title').value = n.title || ''; },
  renderMeta() {
    const n = S.notes[this.noteId]; const m = $('#docmeta'); if (!n) { m.textContent = ''; return; }
    const path = notePathLabel(n) || 'Unsorted';
    const ix = noteIndex(n);
    m.textContent = `/** ${path} · ${fmtDate(n.created, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })} · edited ${ago(n.updated)} · ${ix.words.toLocaleString()} words */`;
  },
  setReadOnly(on) {
    this.readOnly = !!on;
    if (this.el) this.el.contentEditable = on ? 'false' : 'true';
    $('#title').readOnly = !!on;
    App.updateStatus();
  },

  /* ---------------- saving ---------------- */
  saveT: null,
  changed(opts = {}) {
    if (!this.el) return;
    this.dirty = true;
    clearTimeout(this.saveT);
    this.saveT = setTimeout(() => this.flush(), clamp(SETTINGS.autosaveDelay || 500, 150, 5000));
    Gutter.schedule();
    if (Find.open) findRerun();
    if (!opts.light) { Outline.schedule(); App.scheduleStats(); }
  },
  flush() {
    clearTimeout(this.saveT); this.saveT = null;
    const n = S.notes[this.noteId];
    if (!n || !this.el || !this.dirty) return;
    n.html = serializeEditor(this.el);
    const t = $('#title').value.trim(); if (t) n.title = t;
    n.updated = Date.now(); this.dirty = false;
    n._scroll = $('#edScroll').scrollTop;
    Store.saveNote(n);
    this.renderMeta();
    App.onNoteSaved(n);
  },
  discard() { clearTimeout(this.saveT); this.dirty = false; this.noteId = null; this.el = null; $('#editorSlot').innerHTML = ''; },
  rememberScroll() { const n = S.notes[this.noteId]; if (n) n._scroll = $('#edScroll').scrollTop; },

  /* ---------------- completion popup ---------------- */
  closeCompletion() { if (this.comp) { const c = this.comp; this.comp = null; c.popup.close(); } },
};

/* ---------------- serialisation ---------------- */
function scrubHtml(html) {
  const t = document.createElement('template'); t.innerHTML = html || '';
  t.content.querySelectorAll('script,iframe,object,embed,style,link,meta,form,input,button,textarea,select').forEach(x => x.remove());
  t.content.querySelectorAll('*').forEach(x => {
    for (const a of [...x.attributes]) {
      if (/^on/i.test(a.name) || ((a.name === 'href' || a.name === 'src') && /^\s*javascript:/i.test(a.value))) x.removeAttribute(a.name);
    }
  });
  t.content.querySelectorAll('img[data-file]').forEach(i => i.setAttribute('src', 'lnimg://img/' + encodeURIComponent(i.dataset.file)));
  return t.innerHTML;
}
function serializeEditor(ed) {
  const c = ed.cloneNode(true);
  c.querySelectorAll('.co-head, .img-handle').forEach(x => x.remove());
  c.querySelectorAll('figure.uploading').forEach(f => f.remove());
  c.querySelectorAll('.fold-hidden').forEach(x => x.classList.remove('fold-hidden'));
  c.querySelectorAll('.sel, .is-cur, .flash').forEach(x => x.classList.remove('sel', 'is-cur', 'flash'));
  c.querySelectorAll('.math, .math-block').forEach(m => { m.innerHTML = ''; });
  c.querySelectorAll('img').forEach(i => {
    if (i.dataset.file) i.setAttribute('src', 'lnimg://img/' + encodeURIComponent(i.dataset.file));
    else if (/^blob:/.test(i.getAttribute('src') || '')) (i.closest('figure') || i).remove();
  });
  c.querySelectorAll('pre code').forEach(code => { /* keep highlighted spans: cheap to re-render, keeps size small enough */ });
  c.querySelectorAll('[class=""]').forEach(x => x.removeAttribute('class'));
  c.querySelectorAll('a[title]:not(.wikilink)').forEach(a => a.removeAttribute('title'));
  let html = c.innerHTML.replace(/​/g, '');
  return html;
}

/* ---------------- undo history ---------------- */
const Hist = {
  state(id = Editor.noteId) {
    if (!Editor.hist.has(id)) Editor.hist.set(id, { undo: [], redo: [], at: 0, kind: '' });
    return Editor.hist.get(id);
  },
  snap() { return { html: Editor.el.innerHTML, sel: saveSel(), scroll: $('#edScroll').scrollTop }; },
  record(kind = 'op') {
    if (!Editor.el || Editor.readOnly) return;
    const st = this.state(); const now = performance.now();
    if (kind === 'type' && st.kind === 'type' && now - st.at < 1500) { st.at = now; return; }
    if (kind === 'op' && st.kind === 'op' && now - st.at < 40) return;
    st.undo.push(this.snap());
    if (st.undo.length > 400) st.undo.shift();
    st.redo.length = 0; st.at = now; st.kind = kind;
  },
  breakTyping() { const st = this.state(); if (st.kind === 'type') st.kind = ''; },
  undo() {
    if (!Editor.el) return;
    const st = this.state(); if (!st.undo.length) { App.status('Nothing to undo'); return; }
    st.redo.push(this.snap()); this.apply(st.undo.pop()); st.kind = ''; st.at = 0;
  },
  redo() {
    if (!Editor.el) return;
    const st = this.state(); if (!st.redo.length) { App.status('Nothing to redo'); return; }
    st.undo.push(this.snap()); this.apply(st.redo.pop()); st.kind = ''; st.at = 0;
  },
  apply(s) {
    Editor.el.innerHTML = s.html;
    Editor.el.querySelectorAll('.math, .math-block').forEach(m => { if (!m.innerHTML) renderMath(m); });
    Editor.el.focus({ preventScroll: true });
    restoreSel(s.sel);
    $('#edScroll').scrollTop = s.scroll;
    Editor.changed();
    Overlays.hideAll();
  },
};

/* ---------------- selection helpers ---------------- */
const getSel = () => document.getSelection();
function anchor() { const s = getSel(); return s && s.rangeCount ? s.anchorNode : null; }
function inEditor(n) { return !!(Editor.el && n && Editor.el.contains(n)); }
function closestIn(n, selector) {
  if (!n || !Editor.el) return null;
  const e = n.nodeType === 1 ? n : n.parentElement;
  const r = e && e.closest(selector);
  return r && r !== Editor.el && Editor.el.contains(r) ? r : null;
}
function topBlock(n) {
  const ed = Editor.el; if (!n || !ed || !ed.contains(n)) return null;
  if (n === ed) { const s = getSel(); n = ed.childNodes[s.anchorOffset] || ed.childNodes[s.anchorOffset - 1] || ed.lastChild; if (!n) return null; }
  while (n && n.parentNode !== ed) n = n.parentNode;
  return n;
}
const curBlock = () => topBlock(anchor());
function setCaret(node, off) { const r = document.createRange(); r.setStart(node, off); r.collapse(true); const s = getSel(); s.removeAllRanges(); s.addRange(r); }
function caretEnd(node) { const r = document.createRange(); r.selectNodeContents(node); r.collapse(false); const s = getSel(); s.removeAllRanges(); s.addRange(r); }
function caretStart(node) {
  const w = textWalker(node); const t = w.nextNode();
  if (t) setCaret(t, 0); else setCaret(node, 0);
}
function textBefore(container) {
  const s = getSel(); if (!s.rangeCount) return '';
  const r = document.createRange();
  try { r.setStart(container, 0); r.setEnd(s.anchorNode, s.anchorOffset); } catch (e) { return ''; }
  return r.toString();
}
function atBlockStart(container) { return textBefore(container).replace(/​/g, '') === ''; }
function atBlockEnd(container) {
  const s = getSel(); if (!s.rangeCount) return false;
  const r = document.createRange();
  try { r.setStart(s.focusNode, s.focusOffset); r.setEnd(container, container.childNodes.length); } catch (e) { return false; }
  return r.toString().replace(/[​\n]/g, '') === '';
}
function selectNodeContents(node) { const r = document.createRange(); r.selectNodeContents(node); const s = getSel(); s.removeAllRanges(); s.addRange(r); }
function emptyP() { const p = document.createElement('p'); p.innerHTML = '<br>'; return p; }
function idxOf(n) { return Array.prototype.indexOf.call(n.parentNode.childNodes, n); }
function exec(cmd, v) { try { return document.execCommand(cmd, false, v == null ? null : v); } catch (e) { return false; } }

/* Offsets that treat atoms (math, links, chips) as a single unit */
function posToOffset(root, node, offset) {
  let count = 0, done = false;
  const target = node.nodeType === 1 ? (node.childNodes[offset] || null) : null;
  (function walk(n) {
    for (const c of n.childNodes) {
      if (done) return;
      if (n === node && c === target) { done = true; return; }
      if (c === node && node.nodeType === 3) { count += offset; done = true; return; }
      if (c.nodeType === 3) count += c.length;
      else if (c.nodeType === 1) {
        if (isAtomEl(c) || c.tagName === 'BR' || c.tagName === 'HR') { if (c.contains(node) && c !== node) { done = true; return; } count += 1; }
        else { walk(c); }
      }
    }
    if (!done && n === node && target === null) done = true;
  })(root);
  return count;
}
function offsetToPos(root, off) {
  let rem = off, res = null;
  (function walk(n) {
    for (const c of n.childNodes) {
      if (res) return;
      if (c.nodeType === 3) { if (rem <= c.length) { res = [c, rem]; return; } rem -= c.length; }
      else if (c.nodeType === 1) {
        if (isAtomEl(c) || c.tagName === 'BR' || c.tagName === 'HR') { if (rem === 0) { res = [c.parentNode, idxOf(c)]; return; } rem -= 1; if (rem === 0 && !(c.nextSibling && c.nextSibling.nodeType === 3)) { res = [c.parentNode, idxOf(c) + 1]; return; } }
        else walk(c);
      }
    }
  })(root);
  if (!res) { const last = root.lastChild; if (last) { const r = document.createRange(); r.selectNodeContents(root); r.collapse(false); return [r.endContainer, r.endOffset]; } return [root, 0]; }
  return res;
}
function saveSel() {
  const s = getSel(); if (!s.rangeCount || !inEditor(s.anchorNode)) return null;
  const ed = Editor.el;
  const rel = (node, off) => { const b = topBlock(node); if (!b || b === node && node === ed) return null; const i = Array.prototype.indexOf.call(ed.children, b); return i < 0 ? null : [i, posToOffset(b, node, off)]; };
  return { a: posToOffset(ed, s.anchorNode, s.anchorOffset), f: posToOffset(ed, s.focusNode, s.focusOffset), n: ed.children.length, ra: rel(s.anchorNode, s.anchorOffset), rf: rel(s.focusNode, s.focusOffset) };
}
function restoreSel(sv) {
  const ed = Editor.el; if (!ed) return;
  if (!sv) { caretEnd(ed.lastElementChild || ed); return; }
  let A, F;
  if (sv.n === ed.children.length && sv.ra && sv.rf && ed.children[sv.ra[0]] && ed.children[sv.rf[0]]) {
    A = offsetToPos(ed.children[sv.ra[0]], sv.ra[1]); F = offsetToPos(ed.children[sv.rf[0]], sv.rf[1]);
  } else { A = offsetToPos(ed, sv.a); F = offsetToPos(ed, sv.f); }
  const s = getSel();
  try { s.setBaseAndExtent(A[0], A[1], F[0], F[1]); } catch (e) { caretEnd(ed); }
}
function ensureFocus() {
  if (!Editor.el || Editor.readOnly) return false;
  if (document.activeElement !== Editor.el) {
    Editor.el.focus({ preventScroll: true });
    const lr = Editor.lastRange;
    if (lr && Editor.el.contains(lr.startContainer)) { const s = getSel(); s.removeAllRanges(); s.addRange(lr); }
    else caretEnd(Editor.el.lastElementChild || Editor.el);
  }
  return true;
}
function selectedBlocks() {
  const s = getSel(); if (!s.rangeCount) return [];
  const r = s.getRangeAt(0);
  let a = topBlock(r.startContainer), b = topBlock(r.endContainer);
  if (!a) return [];
  if (!b) b = a;
  if (r.endContainer === Editor.el && !r.collapsed) b = topBlock(Editor.el.childNodes[Math.max(0, r.endOffset - 1)]) || b;
  const out = []; let n = a;
  while (n) { if (n.nodeType === 1 && !n.classList.contains('co-head')) out.push(n); if (n === b) break; n = n.nextSibling; }
  return out;
}

/* ---------------- normalisation ---------------- */
function needsNormalize(ed) {
  for (const n of ed.childNodes) {
    if (n.nodeType === 3) return true;
    if (n.nodeType !== 1) continue;
    if (!BLOCK_TAGS.test(n.tagName) || n.tagName === 'BR') return true;
    if (n.tagName === 'DIV' && !n.classList.contains('math-block')) return true;
    if (n.tagName === 'P' && n.firstElementChild && n.querySelector(':scope > ul, :scope > ol, :scope > p, :scope > h1, :scope > h2, :scope > h3, :scope > pre, :scope > blockquote, :scope > table, :scope > figure')) return true;
    if (n.tagName === 'BLOCKQUOTE') { for (const c of n.childNodes) { if (c.nodeType === 3 ? c.textContent.trim() : (c.nodeType === 1 && !BLOCK_TAGS.test(c.tagName) && !c.classList.contains('co-head'))) return true; } if (!n.querySelector(':scope > p, :scope > ul, :scope > ol, :scope > pre')) return true; }
  }
  const last = ed.lastElementChild;
  return !ed.firstChild || !!(last && (/^(FIGURE|TABLE|PRE|HR)$/.test(last.tagName) || last.classList.contains('math-block')));
}
function normalizeEditor() {
  const ed = Editor.el; if (!ed) return;
  if (!needsNormalize(ed)) return;
  const sv = saveSel(); let moved = false;
  for (const n of [...ed.childNodes]) {
    if (n.nodeType === 3) {
      if (!n.textContent.replace(/[\s​]/g, '').length && !n.textContent.includes(' ')) { n.remove(); continue; }
      const p = document.createElement('p'); n.before(p); p.appendChild(n); moved = true;
    } else if (n.nodeType === 1 && !BLOCK_TAGS.test(n.tagName)) {
      if (n.tagName === 'BR') { n.remove(); moved = true; continue; }
      const p = document.createElement('p'); n.before(p); p.appendChild(n); moved = true;
    } else if (n.nodeType === 1 && n.tagName === 'DIV' && !n.classList.contains('math-block')) {
      const p = document.createElement('p'); while (n.firstChild) p.appendChild(n.firstChild); n.replaceWith(p); moved = true;
    } else if (n.nodeType === 1 && n.tagName === 'P' && n.querySelector(':scope > ul, :scope > ol, :scope > p, :scope > h1, :scope > h2, :scope > h3, :scope > pre, :scope > blockquote, :scope > table, :scope > figure')) {
      const frag = document.createDocumentFragment(); let run = null;
      for (const c of [...n.childNodes]) {
        if (c.nodeType === 1 && BLOCK_TAGS.test(c.tagName)) { run = null; frag.appendChild(c); }
        else { if ((c.nodeType === 3 && !c.textContent.trim() || c.nodeType === 1 && c.tagName === 'BR') && !run) continue; if (!run) { run = document.createElement('p'); frag.appendChild(run); } run.appendChild(c); }
      }
      n.replaceWith(frag); moved = true;
    }
  }
  // blockquotes must contain blocks
  ed.querySelectorAll(':scope > blockquote').forEach(bq => {
    let p = null;
    for (const c of [...bq.childNodes]) {
      if (c.nodeType === 1 && (BLOCK_TAGS.test(c.tagName) || c.classList.contains('co-head'))) { p = null; continue; }
      if (c.nodeType === 3 && !c.textContent.trim()) { if (!p) { c.remove(); continue; } }
      if (!p) { p = document.createElement('p'); c.before(p); } p.appendChild(c); moved = true;
    }
    if (!bq.querySelector(':scope > p, :scope > ul, :scope > ol, :scope > pre')) { bq.appendChild(emptyP()); moved = true; }
  });
  if (!ed.firstChild) { ed.appendChild(emptyP()); moved = true; }
  const last = ed.lastElementChild;
  if (last && /^(FIGURE|TABLE|PRE|HR)$/.test(last.tagName) || (last && last.classList.contains('math-block'))) { ed.appendChild(emptyP()); }
  if (moved && sv) restoreSel(sv);
}

/* ---------------- block conversion ---------------- */
function flattenList(list, tag) {
  const out = [];
  (function walk(l) {
    for (const li of [...l.children]) {
      const b = document.createElement(tag); const subs = [];
      for (const c of [...li.childNodes]) { if (c.nodeType === 1 && (c.tagName === 'UL' || c.tagName === 'OL')) subs.push(c); else b.appendChild(c); }
      if (!b.firstChild || !b.textContent.trim() && !b.querySelector('br,.math,.wikilink,.ts')) b.innerHTML = b.innerHTML || '<br>';
      out.push(b); subs.forEach(walk);
    }
  })(list);
  return out;
}
function blockToInline(b, tag) {
  // returns array of new blocks of `tag` carrying b's inline content
  const t = b.tagName;
  if (t === 'UL' || t === 'OL') return flattenList(b, tag);
  if (t === 'BLOCKQUOTE') { const out = []; for (const c of [...b.children]) { if (c.classList.contains('co-head')) continue; out.push(...blockToInline(c, tag)); } return out.length ? out : [Object.assign(document.createElement(tag), { innerHTML: '<br>' })]; }
  if (t === 'PRE') return preCode(b).textContent.replace(/\n$/, '').split('\n').map(l => { const e = document.createElement(tag); if (l) e.textContent = l; else e.innerHTML = '<br>'; return e; });
  if (t === 'FIGURE' || t === 'TABLE' || t === 'HR' || b.classList.contains('math-block')) return null;
  const e = document.createElement(tag); while (b.firstChild) e.appendChild(b.firstChild); if (!e.firstChild) e.innerHTML = '<br>';
  return [e];
}
/** Convert selected blocks: 'p','h1','h2','h3','ul','ol','check','quote','callout:<type>','code' */
function setBlockType(type) {
  if (!ensureFocus()) return;
  if (type === 'code') { toggleCodeBlock(); return; }
  Hist.record('op');
  const sv = saveSel();
  const blocks = selectedBlocks(); if (!blocks.length) return;
  const first = blocks[0];
  const isEmpty = el => !el.textContent.replace(/[\u200b\s]/g, '') && !el.querySelector('img,.math,.wikilink,.ts,figure');
  const isList = el => el.tagName === 'UL' || el.tagName === 'OL';
  const wasEmpty = blocks.length === 1 && isEmpty(first);
  const created = [];
  if (/^(p|h1|h2|h3)$/.test(type)) {
    const tag = type.toUpperCase();
    const allSame = blocks.every(b => b.tagName === tag);
    const target = allSame && tag !== 'P' ? 'p' : type;
    for (const b of blocks) { const nb = blockToInline(b, target); if (!nb) continue; b.replaceWith(...nb); created.push(...nb); }
  } else if (type === 'ul' || type === 'ol' || type === 'check') {
    const wantTag = type === 'ol' ? 'OL' : 'UL'; const wantCheck = type === 'check';
    const isSame = b => b.tagName === wantTag && b.classList.contains('checklist') === wantCheck;
    const mk = () => { const nl = document.createElement(wantTag); if (wantCheck) nl.className = 'checklist'; return nl; };
    if (blocks.every(isSame)) {
      for (const b of blocks) { const nb = flattenList(b, 'p'); b.replaceWith(...nb); created.push(...nb); }
    } else if (blocks.length === 1 && isList(first)) {
      const nl = mk(); while (first.firstChild) nl.appendChild(first.firstChild); first.replaceWith(nl); created.push(nl.querySelector('li'));
      nl.querySelectorAll('ul, ol').forEach(sub => { if (sub.tagName !== wantTag || sub.classList.contains('checklist') !== wantCheck) { const r = mk(); while (sub.firstChild) r.appendChild(sub.firstChild); sub.replaceWith(r); } });
    } else {
      const nl = mk(); first.before(nl);
      for (const b of blocks) {
        if (isList(b)) { while (b.firstChild) nl.appendChild(b.firstChild); b.remove(); continue; }
        const parts = blockToInline(b, 'li'); if (!parts) continue;
        parts.forEach(x => nl.appendChild(x)); b.remove(); created.push(...parts);
      }
      if (!nl.children.length) nl.remove();
    }
  } else if (type === 'quote' || type.startsWith('callout')) {
    const ctype = type.startsWith('callout') ? (type.split(':')[1] || SETTINGS.calloutDefault || 'note') : null;
    const bq0 = first.tagName === 'BLOCKQUOTE' ? first : null;
    if (bq0 && blocks.length === 1) {
      const isC = bq0.classList.contains('callout');
      if (ctype && (!isC || bq0.dataset.type !== ctype)) { bq0.classList.add('callout'); bq0.dataset.type = ctype; decorateCallout(bq0); }
      else if (!ctype && isC) { bq0.classList.remove('callout'); delete bq0.dataset.type; delete bq0.dataset.title; const hd = bq0.querySelector('.co-head'); if (hd) hd.remove(); }
      else unwrapQuote(bq0);
    } else {
      const bq = document.createElement('blockquote');
      if (ctype) { bq.className = 'callout'; bq.dataset.type = ctype; }
      first.before(bq);
      for (const b of blocks) {
        if (b.tagName === 'BLOCKQUOTE') { for (const c of [...b.children]) if (!c.classList.contains('co-head')) bq.appendChild(c); b.remove(); }
        else if (/^(H1|H2|H3)$/.test(b.tagName)) { const p = document.createElement('p'); while (b.firstChild) p.appendChild(b.firstChild); bq.appendChild(p); b.remove(); }
        else bq.appendChild(b);
      }
      if (!bq.querySelector(':scope > p, :scope > ul, :scope > ol, :scope > pre, :scope > table')) bq.appendChild(emptyP());
      if (ctype) decorateCallout(bq);
      created.push(bq.querySelector(':scope > p, :scope > ul li, :scope > ol li') || bq);
    }
  }
  normalizeEditor();
  if (wasEmpty && created[0] && created[0].isConnected) caretStart(created[0]); else restoreSel(sv);
  Editor.changed(); App.refreshFormatState();
}
function unwrapQuote(bq) {
  const sv = saveSel();
  const kids = [...bq.childNodes].filter(c => !(c.nodeType === 1 && c.classList.contains('co-head')));
  const frag = document.createDocumentFragment(); let p = null;
  for (const n of kids) {
    if (n.nodeType === 1 && BLOCK_TAGS.test(n.tagName)) { p = null; frag.appendChild(n); }
    else { if (!p) { p = document.createElement('p'); frag.appendChild(p); } p.appendChild(n); }
  }
  if (!frag.childNodes.length) frag.appendChild(emptyP());
  bq.replaceWith(frag);
  if (sv) restoreSel(sv);
}

/* ---------------- code blocks ---------------- */
function preCode(pre) {
  let c = pre.querySelector(':scope > code');
  if (!c) { c = document.createElement('code'); c.textContent = pre.textContent.replace(/\n?$/, '\n'); pre.textContent = ''; pre.appendChild(c); }
  return c;
}
function makePre(text, lang) {
  const pre = document.createElement('pre'); pre.spellcheck = false;
  if (lang) pre.dataset.lang = lang.toLowerCase();
  const code = document.createElement('code'); code.textContent = (text || '').replace(/\n?$/, '\n');
  pre.appendChild(code); return pre;
}
const HL_LANGS = ['python', 'java', 'javascript', 'typescript', 'c', 'cpp', 'csharp', 'go', 'rust', 'kotlin', 'swift', 'scala', 'php', 'ruby', 'r', 'sql', 'bash', 'shell', 'powershell', 'json', 'yaml', 'xml', 'css', 'scss', 'markdown', 'matlab', 'haskell', 'lua', 'perl', 'x86asm', 'makefile', 'dockerfile', 'ini', 'diff', 'latex', 'plaintext'];
const LANG_LABEL = { cpp: 'C++', csharp: 'C#', javascript: 'JavaScript', typescript: 'TypeScript', python: 'Python', java: 'Java', c: 'C', go: 'Go', rust: 'Rust', kotlin: 'Kotlin', swift: 'Swift', scala: 'Scala', php: 'PHP', ruby: 'Ruby', r: 'R', sql: 'SQL', bash: 'Bash', shell: 'Shell', powershell: 'PowerShell', json: 'JSON', yaml: 'YAML', xml: 'HTML/XML', css: 'CSS', scss: 'SCSS', markdown: 'Markdown', matlab: 'MATLAB', haskell: 'Haskell', lua: 'Lua', perl: 'Perl', x86asm: 'Assembly', makefile: 'Makefile', dockerfile: 'Dockerfile', ini: 'INI', diff: 'Diff', latex: 'LaTeX', plaintext: 'Plain text' };
const LANG_ALIAS = { py: 'python', js: 'javascript', ts: 'typescript', 'c++': 'cpp', 'c#': 'csharp', cs: 'csharp', sh: 'bash', zsh: 'bash', ps: 'powershell', ps1: 'powershell', yml: 'yaml', html: 'xml', md: 'markdown', tex: 'latex', asm: 'x86asm', kt: 'kotlin', rs: 'rust', rb: 'ruby', text: 'plaintext', txt: 'plaintext', golang: 'go', hs: 'haskell', m: 'matlab', docker: 'dockerfile', make: 'makefile' };
const normLang = l => { l = String(l || '').toLowerCase().trim(); return LANG_ALIAS[l] || l; };
function highlightPre(pre) {
  const code = preCode(pre);
  const txt = code.textContent.replace(/\n$/, '');
  const lang = normLang(pre.dataset.lang);
  const hl = window.hljs && plugin('syntax');
  let label = lang ? (LANG_LABEL[lang] || lang) : '';
  if (hl) {
    try {
      let res;
      if (lang && hljs.getLanguage(lang)) res = hljs.highlight(txt, { language: lang, ignoreIllegals: true });
      else if (!lang) { res = hljs.highlightAuto(txt, HL_LANGS.filter(l => hljs.getLanguage(l))); if (!res.language || res.relevance < 5) res = { value: esc(txt), language: '' }; }
      else res = { value: esc(txt), language: '' };
      const active = getSel().rangeCount && code.contains(getSel().anchorNode);
      const sv = active ? posToOffset(code, getSel().anchorNode, getSel().anchorOffset) : -1;
      code.innerHTML = res.value + '\n';
      if (sv >= 0) { const [n, o] = offsetToPos(code, sv); setCaret(n, o); }
      if (!lang && res.language) label = (LANG_LABEL[res.language] || res.language) + ' · auto';
    } catch (e) { /* ignore */ }
  } else if (code.children.length) { code.textContent = code.textContent; }
  pre.dataset.label = label;
  pre._dirty = false;
}
const COMMENT_TOKENS = { python: '#', bash: '#', shell: '#', r: '#', yaml: '#', ruby: '#', perl: '#', powershell: '#', makefile: '#', dockerfile: '#', ini: ';', x86asm: ';', sql: '--', haskell: '--', lua: '--', matlab: '%', latex: '%' };
function codeLines(pre) {
  // returns [startLine, endLine] indexes for current selection inside pre
  const code = preCode(pre); const s = getSel();
  const r = s.getRangeAt(0);
  const pre1 = document.createRange(); pre1.setStart(code, 0); pre1.setEnd(r.startContainer, r.startOffset);
  const pre2 = document.createRange(); pre2.setStart(code, 0); pre2.setEnd(r.endContainer, r.endOffset);
  const a = pre1.toString().split('\n').length - 1, b = pre2.toString().split('\n').length - 1;
  return [a, b, pre1.toString().length, pre2.toString().length];
}
function preTransformLines(pre, fn) {
  const code = preCode(pre);
  const [a, b, so, eo] = codeLines(pre);
  const lines = code.textContent.replace(/\n$/, '').split('\n');
  let delta0 = 0, deltaAll = 0;
  for (let i = a; i <= Math.min(b, lines.length - 1); i++) {
    const before = lines[i]; const after = fn(before, i);
    if (i === a) delta0 = after.length - before.length;
    deltaAll += after.length - before.length; lines[i] = after;
  }
  code.textContent = lines.join('\n') + '\n';
  const s = getSel();
  const [n1, o1] = offsetToPos(code, Math.max(0, so + delta0)); const [n2, o2] = offsetToPos(code, Math.max(0, eo + deltaAll));
  s.setBaseAndExtent(n1, o1, n2, o2);
  pre._dirty = true;
}
function toggleLineComment(pre) {
  Hist.record('op');
  const tok = COMMENT_TOKENS[normLang(pre.dataset.lang || '')] || '//';
  const [a, b] = codeLines(pre);
  const lines = preCode(pre).textContent.replace(/\n$/, '').split('\n').slice(a, b + 1);
  const allCommented = lines.filter(l => l.trim()).every(l => l.trimStart().startsWith(tok));
  preTransformLines(pre, l => allCommented ? l.replace(new RegExp('^(\\s*)' + tok.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&') + ' ?'), '$1') : (l.trim() ? tok + ' ' + l : l));
  highlightPre(pre); Editor.changed();
}
function preInsert(pre, text, caretBack = 0) {
  const code = preCode(pre); const s = getSel();
  const r = s.getRangeAt(0);
  const r1 = document.createRange(); r1.setStart(code, 0); r1.setEnd(r.startContainer, r.startOffset);
  const r2 = document.createRange(); r2.setStart(code, 0); r2.setEnd(r.endContainer, r.endOffset);
  const start = r1.toString().length, end = r2.toString().length;
  const full = code.textContent;
  let nt = full.slice(0, start) + text + full.slice(end);
  if (!nt.endsWith('\n')) nt += '\n';
  code.textContent = nt;
  const [n, o] = offsetToPos(code, start + text.length - caretBack); setCaret(n, o);
  pre._dirty = true;
}
function toggleCodeBlock() {
  if (!ensureFocus()) return;
  Hist.record('op');
  const a = anchor(); const pre = closestIn(a, 'pre');
  if (pre) {
    const lines = preCode(pre).textContent.replace(/\n$/, '').split('\n');
    const ps = lines.map(l => { const p = document.createElement('p'); if (l) p.textContent = l; else p.innerHTML = '<br>'; return p; });
    pre.replaceWith(...ps); if (ps[0]) caretEnd(ps[ps.length - 1]); Editor.changed(); return;
  }
  const blocks = selectedBlocks();
  const text = blocks.map(b => b.tagName === 'PRE' ? preCode(b).textContent.replace(/\n$/, '') : (b.innerText || b.textContent).replace(/\n$/, '')).join('\n').replace(/ /g, ' ').replace(/​/g, '');
  const np = makePre(text.trim() ? text : '', SETTINGS.codeLang || '');
  if (blocks[0]) { blocks[0].before(np); blocks.forEach(b => b.remove()); } else Editor.el.appendChild(np);
  if (!np.nextElementSibling) np.after(emptyP());
  const tn = np.querySelector('code').firstChild; setCaret(tn, Math.max(0, tn.length - 1));
  Editor.lastPre = np; np._dirty = true; highlightPre(np);
  Editor.changed();
}

/* ---------------- inserting blocks ---------------- */
function insertBlock(node, opts = {}) {
  ensureFocus();
  const a = anchor(); let b = inEditor(a) ? topBlock(a) : null;
  if (b && b.nodeType === 1 && b.tagName === 'P' && !b.textContent.replace(/​/g, '').trim() && !b.querySelector('img,.math,.wikilink,.ts')) b.replaceWith(node);
  else if (b && opts.split && b.tagName === 'P' && !atBlockEnd(b) && !atBlockStart(b)) {
    const r = document.createRange(); const s = getSel(); r.setStart(s.anchorNode, s.anchorOffset); r.setEnd(b, b.childNodes.length);
    const tail = r.extractContents(); const p2 = document.createElement('p'); p2.appendChild(tail); if (!p2.textContent.trim()) p2.innerHTML = '<br>';
    b.after(node); node.after(p2);
  }
  else if (b && atBlockStart(b) && b.textContent.trim()) b.before(node);
  else if (b) b.after(node); else Editor.el.appendChild(node);
  let next = node.nextElementSibling;
  if (!next || !/^(P|H1|H2|H3)$/.test(next.tagName)) { next = emptyP(); node.after(next); }
  if (opts.caretInside) return next;
  setCaret(next, 0);
  return next;
}
function insertHTMLAtCaret(html) {
  ensureFocus();
  exec('insertHTML', html);
}
function insertNodeAtCaret(node, trailing = ' ') {
  ensureFocus();
  const s = getSel(); if (!s.rangeCount) return;
  const r = s.getRangeAt(0); r.deleteContents();
  r.insertNode(node);
  const t = document.createTextNode(trailing); node.after(t);
  setCaret(t, trailing.length);
}
function insertTable(rows = 3, cols = 3) {
  Hist.record('op');
  const t = document.createElement('table'); const tb = document.createElement('tbody'); t.appendChild(tb);
  for (let r = 0; r < rows; r++) { const tr = document.createElement('tr'); for (let c = 0; c < cols; c++) { const cell = document.createElement(r === 0 ? 'th' : 'td'); cell.innerHTML = '<br>'; tr.appendChild(cell); } tb.appendChild(tr); }
  insertBlock(t);
  setCaret(t.querySelector('th'), 0);
  Editor.changed();
}
function insertHR() { Hist.record('op'); insertBlock(document.createElement('hr')); Editor.changed(); }

/* ---------------- inline formatting ---------------- */
function inlineCmd(cmd) {
  if (!ensureFocus()) return;
  Hist.record('op');
  if (cmd === 'highlight') {
    const s = getSel(); const a = anchor();
    const ex = closestIn(a, 'span.hl');
    if (ex && s.isCollapsed) { const f = document.createDocumentFragment(); while (ex.firstChild) f.appendChild(ex.firstChild); ex.replaceWith(f); }
    else if (!s.isCollapsed) { wrapSelection('span', 'hl'); }
  } else if (cmd === 'code') toggleInlineCode();
  else exec(cmd);
  Editor.changed(); App.refreshFormatState();
}
function wrapSelection(tag, cls) {
  const s = getSel(); if (!s.rangeCount || s.isCollapsed) return;
  const r = s.getRangeAt(0);
  // if wholly inside an element of that kind → unwrap
  const ex = closestIn(r.commonAncestorContainer, tag + (cls ? '.' + cls : ''));
  if (ex) { const f = document.createDocumentFragment(); while (ex.firstChild) f.appendChild(ex.firstChild); ex.replaceWith(f); return; }
  const blocks = selectedBlocks();
  if (blocks.length > 1) { // wrap per block segment
    const sv = saveSel();
    blocks.forEach((b, i) => {
      const rr = document.createRange();
      if (i === 0) { rr.setStart(r.startContainer, r.startOffset); rr.setEnd(b, b.childNodes.length); }
      else if (i === blocks.length - 1) { rr.setStart(b, 0); rr.setEnd(r.endContainer, r.endOffset); }
      else rr.selectNodeContents(b);
      const w = document.createElement(tag); if (cls) w.className = cls;
      try { w.appendChild(rr.extractContents()); rr.insertNode(w); } catch (e) {}
    });
    restoreSel(sv); return;
  }
  const w = document.createElement(tag); if (cls) w.className = cls;
  w.appendChild(r.extractContents()); r.insertNode(w);
  selectNodeContents(w);
}
function toggleInlineCode() {
  const a = anchor(); const c = closestIn(a, 'code');
  if (c && !closestIn(a, 'pre')) { const t = document.createTextNode(c.textContent.replace(/​/g, '')); c.replaceWith(t); setCaret(t, t.length); return; }
  const s = getSel(); if (!s.rangeCount) return;
  const r = s.getRangeAt(0);
  const code = document.createElement('code');
  if (r.collapsed) { code.textContent = '​'; r.insertNode(code); setCaret(code.firstChild, 1); }
  else { code.textContent = r.toString(); r.deleteContents(); r.insertNode(code); const sp = document.createTextNode('​'); code.after(sp); setCaret(sp, 1); }
}
async function insertLink() {
  const s = getSel(); const range = s.rangeCount ? s.getRangeAt(0).cloneRange() : null;
  const existing = closestIn(anchor(), 'a[href]');
  const url = await Dialog.prompt({ title: existing ? 'Edit Link' : 'Insert Link', label: 'URL', value: existing ? existing.getAttribute('href') : '', placeholder: 'https://…', okText: existing ? 'Update' : 'Insert' });
  if (!url) return;
  const href = /^(https?:|mailto:)/i.test(url) ? url : 'https://' + url;
  ensureFocus(); if (range) { s.removeAllRanges(); s.addRange(range); }
  Hist.record('op');
  if (existing) existing.setAttribute('href', href);
  else if (range && !range.collapsed) exec('createLink', href);
  else { const a = h('a', { href }, url); insertNodeAtCaret(a); }
  Editor.changed();
}

/* ---------------- markdown-as-you-type ---------------- */
function tryBlockMarkdown() {
  if (!plugin('markdown')) return false;
  const a = anchor(); const b = topBlock(a);
  if (!b || b.nodeType !== 1 || b.tagName !== 'P') return false;
  const pre = textBefore(b).replace(/ /g, ' ').replace(/​/g, '');
  const m = pre.match(/^(#{1,3}|[-*+]|1[.)]|>|\[ ?\]|\[x\]|!!) $/);
  if (!m) return false;
  Hist.record('op');
  const s = getSel(); const r = document.createRange(); r.setStart(b, 0); r.setEnd(s.anchorNode, s.anchorOffset); r.deleteContents();
  if (!b.textContent && !b.querySelector('br,img,.math')) b.appendChild(document.createElement('br'));
  const k = m[1];
  const conv = tag => { const e = document.createElement(tag); while (b.firstChild) e.appendChild(b.firstChild); if (!e.firstChild) e.innerHTML = '<br>'; b.replaceWith(e); caretStart(e); return e; };
  const list = (tag, cls, done) => {
    const prev = b.previousElementSibling;
    const li = document.createElement('li'); if (done) li.className = 'done';
    while (b.firstChild) li.appendChild(b.firstChild); if (!li.firstChild) li.innerHTML = '<br>';
    if (prev && prev.tagName === tag.toUpperCase() && (prev.className || '') === (cls || '')) { prev.appendChild(li); b.remove(); }
    else { const l = document.createElement(tag); if (cls) l.className = cls; l.appendChild(li); b.replaceWith(l); }
    caretStart(li);
  };
  if (k[0] === '#') conv('h' + k.length);
  else if (/^[-*+]$/.test(k)) list('ul');
  else if (/^1/.test(k)) list('ol');
  else if (k === '>' || k === '!!') {
    const bq = document.createElement('blockquote'); const p = document.createElement('p');
    while (b.firstChild) p.appendChild(b.firstChild); if (!p.firstChild) p.innerHTML = '<br>';
    bq.appendChild(p); b.replaceWith(bq);
    if (k === '!!') { bq.className = 'callout'; bq.dataset.type = SETTINGS.calloutDefault || 'important'; decorateCallout(bq); }
    caretStart(p);
  }
  else if (k[0] === '[') list('ul', 'checklist', k === '[x]');
  Editor.changed(); Outline.schedule();
  return true;
}
const SYMBOLS = [['->', '→'], ['<-', '←'], ['=>', '⇒'], ['<=>', '⇔'], ['!=', '≠'], ['<=', '≤'], ['>=', '≥'], ['+-', '±'], ['~=', '≈'], ['...', '…'], ['(c)', '©'], ['--', '—']];
function tryInlineMarkdown(ch) {
  const s = getSel(); const n = s.anchorNode; if (!n || n.nodeType !== 3) return false;
  if (closestIn(n, 'pre') || closestIn(n, 'code')) return false;
  const t = n.textContent.slice(0, s.anchorOffset);
  if (plugin('symbols') && ch !== '`' && ch !== '$') {
    for (const [from, to] of SYMBOLS) {
      if (t.endsWith(from) && !(from === '<=' && t.endsWith('<=>')) && !(from === '--' && t.endsWith('---'))) {
        if (from === '--' && !/\s--$/.test(t)) continue;
        if (from === '<-' && t.endsWith('<--')) continue;
        Hist.record('op');
        const st = s.anchorOffset - from.length; n.textContent = n.textContent.slice(0, st) + to + n.textContent.slice(s.anchorOffset);
        setCaret(n, st + to.length); return true;
      }
    }
  }
  if (!plugin('markdown')) return false;
  let m, make;
  if (ch === '`' && (m = t.match(/(^|[^`])`([^`\n]+)`$/))) make = x => { const c = document.createElement('code'); c.textContent = x; return c; };
  else if (ch === '*' && (m = t.match(/(^|[^*])\*\*([^*\n]+?)\*\*$/))) make = x => h('strong', x);
  else if (ch === '*' && (m = t.match(/(^|[^*\w])\*([^*\s][^*\n]*?)\*$/))) make = x => h('em', x);
  else if (ch === '_' && (m = t.match(/(^|[^_\w])_([^_\s][^_\n]*?)_$/))) make = x => h('em', x);
  else if (ch === '=' && (m = t.match(/(^|[^=])==([^=\n]+?)==$/))) make = x => h('span.hl', x);
  else if (ch === '~' && (m = t.match(/(^|[^~])~~([^~\n]+?)~~$/))) make = x => h('s', x);
  else if (ch === '$' && plugin('math') && (m = t.match(/(^|[^$\\])\$([^$\s][^$\n]*?)\$$/)) && !/^\d/.test(m[2])) make = x => mathAtom(x, false);
  if (!m) return false;
  Hist.record('op');
  const len = m[0].length - m[1].length;
  const start = s.anchorOffset - len;
  const r = document.createRange(); r.setStart(n, start); r.setEnd(n, s.anchorOffset); r.deleteContents();
  const node = make(m[2]); r.insertNode(node);
  const sp = document.createTextNode(node.classList && node.classList.contains('math') ? ' ' : '​'); node.after(sp); setCaret(sp, sp.length);
  return true;
}

/* ---------------- block movement & editing actions ---------------- */
function curUnit() {
  // the list item (if in a list) or the top-level block
  const a = anchor(); const li = closestIn(a, 'li'); return li || topBlock(a);
}
function moveUnit(dir) {
  if (!ensureFocus()) return;
  const u = curUnit(); if (!u) return;
  const sib = dir < 0 ? u.previousElementSibling : u.nextElementSibling;
  if (!sib || sib.classList.contains('co-head')) return;
  Hist.record('op');
  const sv = saveSel();
  const before = posToOffset(Editor.el, u, 0);
  const inner = sv ? sv.a - before : 0;
  if (dir < 0) sib.before(u); else sib.after(u);
  const nb = posToOffset(Editor.el, u, 0);
  restoreSel({ a: nb + inner, f: nb + inner + (sv ? sv.f - sv.a : 0) });
  u.scrollIntoView({ block: 'nearest' });
  applyFolds(); Editor.changed();
}
function duplicateUnit() {
  if (!ensureFocus()) return;
  const s = getSel();
  Hist.record('op');
  if (!s.isCollapsed) { const txt = s.toString(); const r = s.getRangeAt(0).cloneRange(); r.collapse(false); const t = document.createTextNode(txt); r.insertNode(t); const r2 = document.createRange(); r2.selectNodeContents(t); s.removeAllRanges(); s.addRange(r2); Editor.changed(); return; }
  const u = curUnit(); if (!u) return;
  const sv = saveSel(); const off = sv ? sv.a - posToOffset(Editor.el, u, 0) : 0;
  const c = u.cloneNode(true); u.after(c); Editor.decorate(c.parentNode === Editor.el ? Editor.el : c);
  const base = posToOffset(Editor.el, c, 0); restoreSel({ a: base + off, f: base + off });
  Editor.changed();
}
function deleteUnit() {
  if (!ensureFocus()) return;
  const u = curUnit(); if (!u) return;
  Hist.record('op');
  const next = u.nextElementSibling || u.previousElementSibling;
  const parentList = u.tagName === 'LI' ? u.parentNode : null;
  u.remove();
  if (parentList && !parentList.children.length) parentList.remove();
  if (!Editor.el.firstElementChild) Editor.el.appendChild(emptyP());
  const tgt = (next && next.isConnected) ? next : Editor.el.firstElementChild;
  caretStart(tgt);
  applyFolds(); Editor.changed();
}
function extendSelection() {
  if (!ensureFocus()) return;
  const s = getSel(); if (!s.rangeCount) return;
  const r = s.getRangeAt(0); Editor.selStack.push(r.cloneRange());
  const b = curUnit();
  if (r.collapsed) {
    const n = s.anchorNode; if (n.nodeType === 3) {
      const t = n.textContent; let a = s.anchorOffset, e = a;
      while (a > 0 && /[\p{L}\p{N}_'-]/u.test(t[a - 1])) a--;
      while (e < t.length && /[\p{L}\p{N}_'-]/u.test(t[e])) e++;
      if (e > a) { s.setBaseAndExtent(n, a, n, e); return; }
    }
  }
  const unitRange = document.createRange(); if (b) unitRange.selectNodeContents(b);
  if (b && !(r.compareBoundaryPoints(Range.START_TO_START, unitRange) <= 0 && r.compareBoundaryPoints(Range.END_TO_END, unitRange) >= 0)) { s.removeAllRanges(); s.addRange(unitRange); return; }
  const top = topBlock(r.commonAncestorContainer);
  if (top && top !== b) { const rr = document.createRange(); rr.selectNodeContents(top); s.removeAllRanges(); s.addRange(rr); return; }
  // section under heading
  let hdr = top; while (hdr && !/^H[1-3]$/.test(hdr.tagName)) hdr = hdr.previousElementSibling;
  if (hdr) {
    const lvl = +hdr.tagName[1]; let end = hdr; let n = hdr.nextElementSibling;
    while (n && !(/^H[1-3]$/.test(n.tagName) && +n.tagName[1] <= lvl)) { end = n; n = n.nextElementSibling; }
    const rr = document.createRange(); rr.setStartBefore(hdr); rr.setEndAfter(end);
    if (!(r.compareBoundaryPoints(Range.START_TO_START, rr) <= 0 && r.compareBoundaryPoints(Range.END_TO_END, rr) >= 0)) { s.removeAllRanges(); s.addRange(rr); return; }
  }
  const all = document.createRange(); all.selectNodeContents(Editor.el); s.removeAllRanges(); s.addRange(all);
}
function shrinkSelection() { const r = Editor.selStack.pop(); if (r && Editor.el.contains(r.startContainer)) { const s = getSel(); s.removeAllRanges(); s.addRange(r); } }
function toggleCase() {
  const s = getSel(); if (!s.rangeCount || s.isCollapsed) { extendSelection(); }
  const txt = getSel().toString(); if (!txt) return;
  Hist.record('op');
  const up = txt !== txt.toUpperCase();
  exec('insertText', up ? txt.toUpperCase() : txt.toLowerCase());
  Editor.changed();
}
function toggleTodoAtCaret() {
  const li = closestIn(anchor(), 'ul.checklist > li');
  if (li) { Hist.record('op'); li.classList.toggle('done'); Editor.changed(); Panels.refresh('todo'); return true; }
  setBlockType('check'); return true;
}
function reformatNote() {
  if (!Editor.el) return;
  Hist.record('op');
  const ed = Editor.el; let removed = 0;
  // collapse runs of empty paragraphs
  let prevEmpty = false;
  for (const b of [...ed.children]) {
    const empty = b.tagName === 'P' && !b.textContent.replace(/[\s​ ]/g, '') && !b.querySelector('img,.math,.wikilink,.ts');
    if (empty && prevEmpty) { b.remove(); removed++; continue; }
    prevEmpty = empty;
  }
  ed.querySelectorAll('p, li, h1, h2, h3, td, th').forEach(e => { e.normalize(); });
  // merge adjacent lists of the same kind
  for (const l of [...ed.querySelectorAll(':scope > ul, :scope > ol')]) {
    const n = l.nextElementSibling;
    if (n && n.tagName === l.tagName && n.className === l.className) { while (n.firstChild) l.appendChild(n.firstChild); n.remove(); }
  }
  ed.querySelectorAll('pre').forEach(highlightPre);
  normalizeEditor(); Editor.changed();
  App.status(`Reformatted note${removed ? ` · removed ${removed} empty line${removed > 1 ? 's' : ''}` : ''}`);
}
async function goToLine() {
  if (!Editor.el) return;
  const max = Editor.el.children.length;
  const v = await Dialog.prompt({ title: 'Go to Line', label: `Line number (1–${max})`, value: '', okText: 'Go', validate: x => (/^\d+$/.test(x) && +x >= 1 && +x <= max) ? '' : 'Enter a number between 1 and ' + max });
  if (!v) return;
  const b = Editor.el.children[+v - 1]; if (!b) return;
  revealBlock(b);
}
function revealBlock(b, flash = true) {
  if (b.classList.contains('fold-hidden')) unfoldFor(b);
  Editor.el.focus({ preventScroll: true });
  caretStart(b);
  b.scrollIntoView({ block: 'center', behavior: SETTINGS.animations ? 'smooth' : 'auto' });
  if (flash) { b.classList.add('flash'); setTimeout(() => b.classList.remove('flash'), 1100); }
}
