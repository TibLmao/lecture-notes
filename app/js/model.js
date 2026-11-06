'use strict';
/* ============================================================
   Model: folders (modules), notes, session state, indexes
   ============================================================ */
const S = {
  folders: [], notes: {},
  tabs: [], pinned: [], active: null,
  back: [], fwd: [], recent: [],
  expanded: {}, treeSel: 'root',
  tw: { left: 'project', leftBottom: null, right: null, leftW: 290, rightW: 310, split: 0.6 },
  loaded: false,
};

/* ---------- session (per notes folder) ---------- */
const sessionKey = () => 'ln2.session:' + (Store.info.root || 'local');
function loadSession() {
  const s = lsGet(sessionKey(), null);
  if (!s) return;
  if (Array.isArray(s.tabs)) S.tabs = s.tabs;
  if (Array.isArray(s.pinned)) S.pinned = s.pinned;
  if (Array.isArray(s.recent)) S.recent = s.recent;
  if (s.active) S.active = s.active;
  if (s.expanded) S.expanded = s.expanded;
  if (s.tw) S.tw = { ...S.tw, ...s.tw };
}
const saveSession = debounce(() => {
  lsSet(sessionKey(), { tabs: S.tabs, pinned: S.pinned, recent: S.recent.slice(0, 40), active: S.active, expanded: S.expanded, tw: S.tw });
}, 300);

/* ---------- folders ---------- */
const folderById = id => S.folders.find(f => f.id === id) || null;
const childFolders = pid => S.folders.filter(f => (f.parentId || null) === (pid || null));
function notesInFolder(fid) { return Object.values(S.notes).filter(n => n.folderId === fid); }
function folderPath(fid) {
  const out = []; let f = folderById(fid); let guard = 0;
  while (f && guard++ < 50) { out.unshift(f); f = folderById(f.parentId); }
  return out;
}
function descendantFolderIds(fid) {
  const out = [fid]; for (let i = 0; i < out.length; i++) childFolders(out[i]).forEach(c => out.push(c.id));
  return out;
}
function folderNoteCount(fid) { const ids = new Set(descendantFolderIds(fid)); return Object.values(S.notes).filter(n => ids.has(n.folderId)).length; }
function sortItems(arr, kind) {
  const by = SETTINGS.projectSort;
  const name = x => (kind === 'f' ? x.name : x.title || '').toLowerCase();
  return arr.slice().sort((a, b) => {
    if (by === 'name') return name(a).localeCompare(name(b), undefined, { numeric: true });
    if (by === 'updated' && kind === 'n') return (b.updated || 0) - (a.updated || 0);
    return (a.created || 0) - (b.created || 0) || name(a).localeCompare(name(b), undefined, { numeric: true });
  });
}
function createFolder(parentId, name) {
  const f = { id: uid('f'), name: name || 'New Module', parentId: parentId || null, color: '', created: Date.now() };
  S.folders.push(f); S.expanded[f.id] = true; if (parentId) S.expanded[parentId] = true;
  Store.saveWorkspace(); saveSession();
  return f;
}
function renameFolder(id, name) { const f = folderById(id); if (!f || !name) return; f.name = name; Store.saveWorkspace(); App.refresh(); }
function setFolderColor(id, color) { const f = folderById(id); if (!f) return; f.color = color; Store.saveWorkspace(); App.refresh(); }
function moveFolder(id, parentId) {
  if (id === parentId) return false;
  if (parentId && descendantFolderIds(id).includes(parentId)) return false;
  const f = folderById(id); if (!f) return false;
  f.parentId = parentId || null; if (parentId) S.expanded[parentId] = true;
  Store.saveWorkspace(); App.refresh(); return true;
}
function deleteFolder(id) {
  const ids = new Set(descendantFolderIds(id));
  for (const n of Object.values(S.notes)) if (ids.has(n.folderId)) removeNote(n.id, true);
  S.folders = S.folders.filter(f => !ids.has(f.id));
  Store.saveWorkspace(); App.refresh();
}

/* ---------- notes ---------- */
function nextTitle(folderId) {
  const ns = sortItems(notesInFolder(folderId), 'n');
  for (let i = ns.length - 1; i >= 0; i--) {
    const m = (ns[i].title || '').match(/^(.*?)(\d+)\s*$/);
    if (m) {
      let max = 0; const pre = m[1];
      ns.forEach(n => { const mm = (n.title || '').match(/^(.*?)(\d+)\s*$/); if (mm && mm[1] === pre) max = Math.max(max, +mm[2]); });
      return pre + (max + 1);
    }
  }
  return 'Lecture ' + (ns.length + 1);
}
function createNote(folderId, opts = {}) {
  const now = Date.now();
  const n = { id: uid('n'), title: opts.title || nextTitle(folderId), folderId, html: opts.html || '<p><br></p>', created: now, updated: now, starred: false };
  S.notes[n.id] = n; S.expanded[folderId] = true;
  Store.saveNote(n);
  return n;
}
function renameNote(id, title) {
  const n = S.notes[id]; if (!n || !title) return;
  n.title = title; n.updated = Date.now(); Store.saveNote(n);
  if (Editor.noteId === id) Editor.syncTitle();
  App.refresh();
}
function moveNote(id, folderId) {
  const n = S.notes[id]; if (!n || !folderById(folderId)) return;
  if (Editor.noteId === id) Editor.flush();
  n.folderId = folderId; n.updated = Date.now(); S.expanded[folderId] = true; Store.saveNote(n); App.refresh();
}
function duplicateNote(id) {
  const n = S.notes[id]; if (!n) return null;
  if (Editor.noteId === id) Editor.flush();
  const c = createNote(n.folderId, { title: n.title + ' copy', html: n.html });
  return c;
}
function removeNote(id, silent) {
  const n = S.notes[id]; if (!n) return;
  if (Editor.noteId === id) Editor.discard();
  delete S.notes[id];
  S.tabs = S.tabs.filter(t => t !== id); S.pinned = S.pinned.filter(t => t !== id); S.recent = S.recent.filter(t => t !== id);
  if (S.active === id) S.active = S.tabs[S.tabs.length - 1] || null;
  Store.deleteNote(id);
  if (!silent) { App.openActive(); App.refresh(); }
}
function toggleStar(id) { const n = S.notes[id]; if (!n) return; n.starred = !n.starred; Store.saveNote(n); App.refresh(); }
function defaultFolderId() {
  if (S.active && S.notes[S.active] && folderById(S.notes[S.active].folderId)) return S.notes[S.active].folderId;
  if (S.treeSel && S.treeSel.startsWith('f:') && folderById(S.treeSel.slice(2))) return S.treeSel.slice(2);
  const top = sortItems(childFolders(null), 'f'); return top[0] ? top[0].id : null;
}
function notePathLabel(n) { return folderPath(n.folderId).map(f => f.name).join(' / '); }
function noteByTitle(title) {
  const t = String(title || '').trim().toLowerCase();
  return Object.values(S.notes).find(n => (n.title || '').trim().toLowerCase() === t) || null;
}

/* ---------- derived index (cached per note version) ---------- */
function isAtom(el) { return el.nodeType === 1 && (el.getAttribute('contenteditable') === 'false' || el.classList.contains('co-head')); }
function atomText(el) {
  if (el.classList.contains('math')) return '$' + (el.dataset.tex || '') + '$';
  if (el.classList.contains('math-block')) return '$$' + (el.dataset.tex || '') + '$$';
  if (el.classList.contains('wikilink')) return el.textContent;
  if (el.classList.contains('ts')) return '[' + el.textContent + ']';
  return '';
}
/** Plain text per visual line of a note (shared by indexing and Find in Files). */
function blockLines(root) {
  const lines = [];
  const textOf = node => {
    let s = '';
    for (const c of node.childNodes) {
      if (c.nodeType === 3) s += c.textContent;
      else if (c.nodeType === 1) {
        if (c.classList.contains('co-head')) continue;
        if (isAtom(c)) { s += atomText(c); continue; }
        if (c.tagName === 'BR') { s += ' '; continue; }
        if (c.tagName === 'UL' || c.tagName === 'OL') continue;
        s += textOf(c);
      }
    }
    return s;
  };
  const walkList = list => { for (const li of list.children) { lines.push(textOf(li)); for (const sub of li.children) if (sub.tagName === 'UL' || sub.tagName === 'OL') walkList(sub); } };
  for (const b of root.children) {
    if (b.tagName === 'UL' || b.tagName === 'OL') walkList(b);
    else if (b.tagName === 'PRE') b.textContent.replace(/\n$/, '').split('\n').forEach(l => lines.push(l));
    else if (b.tagName === 'TABLE') for (const tr of b.querySelectorAll('tr')) lines.push([...tr.children].map(c => c.textContent).join(' | '));
    else if (b.tagName === 'BLOCKQUOTE') { for (const c of b.children) if (!c.classList.contains('co-head')) lines.push(textOf(c)); }
    else if (b.classList && b.classList.contains('math-block')) lines.push(atomText(b));
    else if (b.tagName === 'FIGURE') lines.push(b.dataset.caption || '');
    else lines.push(textOf(b));
  }
  return lines;
}
function noteIndex(n) {
  if (n._ix && n._ixv === n.updated && n._ixh === n.html.length) return n._ix;
  const t = document.createElement('template'); t.innerHTML = n.html || '';
  const root = t.content;
  const wrap = document.createElement('div'); wrap.appendChild(root);
  const lines = blockLines(wrap);
  const headings = [...wrap.querySelectorAll(':scope > h1, :scope > h2, :scope > h3')].map((el, i) => ({ level: +el.tagName[1], text: el.textContent.trim(), i }));
  const todos = [...wrap.querySelectorAll('ul.checklist li')].map((li, i) => ({ text: [...li.childNodes].filter(c => !(c.nodeType === 1 && (c.tagName === 'UL' || c.tagName === 'OL'))).map(c => c.textContent).join('').trim(), done: li.classList.contains('done'), i }));
  const links = new Set([...wrap.querySelectorAll('a.wikilink[data-note]')].map(a => a.dataset.note));
  const raw = lines.join('\n');
  const ix = { lines, raw, text: raw.toLowerCase(), headings, todos, links, words: wordCount(raw), images: wrap.querySelectorAll('figure.img').length, chars: raw.replace(/\s/g, '').length };
  n._ix = ix; n._ixv = n.updated; n._ixh = (n.html || '').length;
  return ix;
}
function backlinksTo(id) { return Object.values(S.notes).filter(n => n.id !== id && (n.html || '').includes('data-note="' + id + '"')); }
