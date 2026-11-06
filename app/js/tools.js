'use strict';
/* ============================================================
   Lecture timer, Local History & Trash, import / export
   ============================================================ */
const Timer = {
  running: false, paused: false, startAt: 0, pausedAt: 0, pausedTotal: 0, noteId: null, stamps: 0, iv: null,
  init() {
    const t = lsGet('ln2.timer', null);
    if (t && t.running) { Object.assign(this, t); this.loop(); }
  },
  persist() { lsSet('ln2.timer', { running: this.running, paused: this.paused, startAt: this.startAt, pausedAt: this.pausedAt, pausedTotal: this.pausedTotal, noteId: this.noteId, stamps: this.stamps }); },
  elapsed() { if (!this.running) return 0; const now = this.paused ? this.pausedAt : Date.now(); return Math.max(0, (now - this.startAt - this.pausedTotal) / 1000); },
  start() {
    if (this.running) return;
    this.running = true; this.paused = false; this.startAt = Date.now(); this.pausedTotal = 0; this.noteId = S.active; this.stamps = 0;
    this.persist(); this.loop(); App.refreshChrome();
    const n = S.notes[S.active];
    notify('Lecture timer started', n ? `Recording “${n.title}”. Press ${fmtCombo(Keymap.first('insertTimestamp'))} to add a timestamp.` : 'Press ' + fmtCombo(Keymap.first('insertTimestamp')) + ' to add a timestamp.', 'success', { timeout: 4500 });
  },
  pauseToggle() {
    if (!this.running) return;
    if (this.paused) { this.pausedTotal += Date.now() - this.pausedAt; this.paused = false; }
    else { this.paused = true; this.pausedAt = Date.now(); }
    this.persist(); App.refreshChrome();
  },
  stop() {
    if (!this.running) return;
    const sec = this.elapsed(); const n = S.notes[this.noteId];
    this.running = false; this.paused = false; clearInterval(this.iv); this.iv = null; this.persist();
    if (n) { n.duration = Math.round(sec); n.updated = Date.now(); Store.saveNote(n); }
    App.refreshChrome();
    notify('Lecture recorded', `${fmtDuration(sec, true)}${this.stamps ? ` · ${this.stamps} timestamp${this.stamps > 1 ? 's' : ''}` : ''}${n ? ' in “' + n.title + '”' : ''}`, 'info');
  },
  loop() { clearInterval(this.iv); this.iv = setInterval(() => this.tick(), 1000); this.tick(); },
  tick() {
    const el = $('#runTime'); if (el) el.textContent = fmtDuration(this.elapsed(), SETTINGS.timerHours);
    const st = $('#stTimer'); if (st) st.innerHTML = this.running ? `${icon(this.paused ? 'timer' : 'dot', this.paused ? 'c-orange' : 'c-red rec')}${fmtDuration(this.elapsed(), SETTINGS.timerHours)}` : '';
  },
  insertStamp() {
    if (!Editor.el) return;
    if (!this.running) this.start();
    Hist.record('op');
    insertNodeAtCaret(tsAtom(this.elapsed()), ' ');
    this.stamps++; this.persist(); Editor.changed();
  },
};

/* ---------------- Local History & Trash ---------------- */
const HistoryUI = {
  async show(noteId) {
    const n = S.notes[noteId]; if (!n) return;
    if (Editor.noteId === noteId) Editor.flush();
    const list = await Store.historyList(noteId);
    const items = [{ ts: 'current', label: 'Current version', time: n.updated, html: n.html }, ...list.map(v => ({ ts: v.ts, time: v.ts, label: fmtDateTime(v.ts), size: v.size }))];
    const side = h('div.lh-list'); const prev = h('div.lh-prev.doc-render');
    let sel = 0;
    const render = async () => {
      side.innerHTML = items.map((it, i) => `<div class="lh-row${i === sel ? ' sel' : ''}" data-i="${i}">${icon(i === 0 ? 'noteMd' : 'history', i === 0 ? 'c-blue' : '')}<div><b>${esc(i === 0 ? 'Current' : ago(it.time))}</b><span>${esc(fmtDateTime(it.time))}</span></div></div>`).join('');
      const it = items[sel];
      if (it.html == null) { prev.innerHTML = '<div class="dim pad">Loading…</div>'; const v = await Store.historyRead(noteId, it.ts); it.html = v ? v.html : ''; it.title = v ? v.title : ''; }
      prev.innerHTML = scrubHtml(it.html || '<p class="dim">(empty)</p>');
      prev.querySelectorAll('.math,.math-block').forEach(renderMath); prev.querySelectorAll('blockquote.callout').forEach(decorateCallout); prev.querySelectorAll('pre').forEach(highlightPre);
      d.buttons['Revert to This Version'].disabled = sel === 0;
    };
    side.addEventListener('click', e => { const r = e.target.closest('.lh-row'); if (r) { sel = +r.dataset.i; render(); } });
    const d = Dialog.open({ title: 'Local History: ' + n.title, width: 'min(1000px, 94vw)', cls: 'lh', body: h('div.lh-grid', side, prev),
      footerLeft: h('span.hint', items.length > 1 ? `${items.length - 1} saved version${items.length > 2 ? 's' : ''}` : 'No earlier versions yet. Versions are saved every few minutes while you edit.'),
      buttons: [{ label: 'Close', value: null }, { label: 'Revert to This Version', primary: true, run: () => {
        const it = items[sel]; if (!it || sel === 0) return false;
        if (Editor.noteId === noteId && Editor.el) { Hist.record('op'); Editor.el.innerHTML = scrubHtml(it.html); Editor.decorate(); Editor.changed(); Editor.flush(); }
        else { n.html = it.html; n.updated = Date.now(); Store.saveNote(n); }
        App.status('Reverted to version from ' + fmtDateTime(it.time));
      } }] });
    render();
  },
  async trash() {
    const items = await Store.trashList();
    const list = h('div.trash-list');
    const paint = () => {
      list.innerHTML = items.length ? items.map((t, i) => `<div class="row" data-i="${i}"><span class="ti">${icon('noteMd', 'c-blue')}</span><span class="nm">${esc(t.title || 'Untitled')}</span><span class="meta">deleted ${esc(ago(t.deletedAt))}</span><button class="btn sm" data-restore="${i}">Restore</button></div>`).join('') : '<div class="tw-empty"><p class="dim">The trash is empty.</p></div>';
    };
    list.addEventListener('click', async e => {
      const b = e.target.closest('[data-restore]'); if (!b) return;
      const t = items[+b.dataset.restore];
      const note = await Store.trashRestore(t.id);
      if (note) {
        if (!folderById(note.folderId)) { const f = S.folders[0] || createFolder(null, 'Restored'); note.folderId = f.id; }
        S.notes[t.id] = { ...note, id: t.id }; Store.saveNote(S.notes[t.id]);
        items.splice(+b.dataset.restore, 1); paint(); App.refresh(); App.status('Restored “' + (note.title || 'note') + '”');
      }
    });
    paint();
    Dialog.open({ title: 'Restore Deleted Notes', width: 560, body: list, buttons: [{ label: 'Close', primary: true, value: null }] });
  },
};

/* ---------------- import / export ---------------- */
const EXPORT_CSS = `
body{font:15px/1.65 'Inter','Segoe UI',system-ui,sans-serif;color:#1e1f22;max-width:820px;margin:40px auto;padding:0 28px}
h1,h2,h3{font-family:'JetBrains Mono',Consolas,monospace;line-height:1.3}h1.title{font-size:30px;margin-bottom:4px}.meta{color:#6c707e;font-size:12px;margin-bottom:28px}
h1{font-size:24px;color:#0033b3}h2{font-size:19px;color:#00627a}h3{font-size:16px;color:#871094}
code{font-family:'JetBrains Mono',Consolas,monospace;font-size:.88em;background:#f2f3f5;padding:1px 5px;border-radius:4px;color:#067d17}
pre{background:#f7f8fa;border:1px solid #ebecf0;border-radius:6px;padding:12px 14px;overflow:auto;font:13px/1.55 'JetBrains Mono',Consolas,monospace}pre code{background:none;padding:0;color:#080808}
blockquote{margin:0 0 1em;padding:4px 14px;border-left:3px solid #c9ccd6;color:#5a5d63}
blockquote.callout{border-left-width:4px;background:#f5f8fe;border-radius:0 6px 6px 0;color:#1e1f22;padding:8px 14px}
.co-head{font-weight:700;font-size:12px;letter-spacing:.04em;text-transform:uppercase;margin-bottom:2px;display:flex;gap:6px;align-items:center}.co-head svg{width:14px;height:14px}.co-type{display:none}
blockquote.callout[data-type=definition]{border-color:#0e7a82;background:#eef8f8}blockquote.callout[data-type=theorem],blockquote.callout[data-type=important]{border-color:#871094;background:#f8f1fa}
blockquote.callout[data-type=warning],blockquote.callout[data-type=question]{border-color:#d2691e;background:#fdf4ec}blockquote.callout[data-type=danger]{border-color:#e55230;background:#fdf0ed}
blockquote.callout[data-type=example]{border-color:#a68a0d;background:#fbf8ea}blockquote.callout[data-type=tip],blockquote.callout[data-type=summary]{border-color:#208a3c;background:#eef8f1}
ul.checklist{list-style:none;padding-left:4px}ul.checklist li::before{content:'☐';margin-right:8px}ul.checklist li.done::before{content:'☑'}ul.checklist li.done{color:#8c8c8c;text-decoration:line-through}
table{border-collapse:collapse;margin:1em 0}td,th{border:1px solid #dfe1e5;padding:6px 10px}th{background:#f7f8fa;text-align:left}
figure{margin:1em 0;text-align:center}figure img{max-width:100%;border-radius:6px}figure[data-caption]::after{content:attr(data-caption);display:block;color:#6c707e;font-size:13px;margin-top:6px}
figure[data-align=left]{text-align:left}figure[data-align=right]{text-align:right}
.hl{background:#fff0a8;border-radius:2px}a{color:#2a5dd9}a.wikilink{text-decoration:none;border-bottom:1px dashed #2a5dd9}
.ts{font:12px 'JetBrains Mono',monospace;background:#eef3ff;color:#1750eb;border-radius:4px;padding:0 5px}
.math-block{text-align:center;margin:1em 0}hr{border:0;border-top:1px solid #dfe1e5;margin:1.6em 0}
.hljs-keyword,.hljs-literal{color:#0033b3}.hljs-string{color:#067d17}.hljs-number{color:#1750eb}.hljs-comment{color:#8c8c8c;font-style:italic}.hljs-title{color:#00627a}.hljs-attr,.hljs-variable{color:#871094}.hljs-meta{color:#9e880d}
@media print{body{margin:0 auto}pre,blockquote,figure,table{break-inside:avoid}}`;
const Exporter = {
  noteHtmlForExport(n) {
    const t = document.createElement('div'); t.innerHTML = scrubHtml(n.html);
    t.querySelectorAll('.math, .math-block').forEach(m => { const tex = m.dataset.tex || ''; if (window.katex) { try { katex.render(tex, m, { throwOnError: false, displayMode: m.classList.contains('math-block'), output: 'mathml' }); } catch (e) { m.textContent = tex; } } else m.textContent = tex; });
    t.querySelectorAll('blockquote.callout').forEach(decorateCallout);
    t.querySelectorAll('pre').forEach(p => { highlightPre(p); });
    t.querySelectorAll('[contenteditable]').forEach(x => x.removeAttribute('contenteditable'));
    t.querySelectorAll('.fold-hidden').forEach(x => x.classList.remove('fold-hidden'));
    return t.innerHTML;
  },
  standalone(n) {
    const body = this.noteHtmlForExport(n);
    return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(n.title)}</title><style>${EXPORT_CSS}</style></head><body><article><h1 class="title">${esc(n.title)}</h1><div class="meta">${esc(notePathLabel(n))} · ${esc(fmtDate(n.created))}</div>${body}</article></body></html>`;
  },
  imagesOf(html) { const t = document.createElement('template'); t.innerHTML = html; return [...new Set([...t.content.querySelectorAll('img[data-file]')].map(i => i.dataset.file))]; },
  async exportNote(fmt, id = S.active) {
    const n = S.notes[id]; if (!n) return;
    if (Editor.noteId === id) Editor.flush();
    const name = downloadName(n.title);
    try {
      if (fmt === 'md') {
        const md = '# ' + n.title + '\n\n' + htmlToMd(n.html, { imageSrc: img => img.dataset.file ? 'images/' + img.dataset.file : null });
        if (IS_DESKTOP) { const r = await BRIDGE.exportMarkdown({ name: name + '.md', md, images: this.imagesOf(n.html) }); if (r) notify('Exported', r, 'success', { actions: [{ label: 'Show in Explorer', run: () => BRIDGE.showPath(r) }] }); }
        else this.download(name + '.md', md, 'text/markdown');
      } else if (fmt === 'html') {
        const html = this.standalone(n);
        if (IS_DESKTOP) { const r = await BRIDGE.exportHtml({ name: name + '.html', html }); if (r) notify('Exported', r, 'success', { actions: [{ label: 'Open', run: () => BRIDGE.showPath(r, true) }] }); }
        else this.download(name + '.html', html, 'text/html');
      } else if (fmt === 'pdf') {
        App.progress(true, 'Creating PDF…');
        const r = await BRIDGE.exportPdf({ name: name + '.pdf', html: this.standalone(n) });
        App.progress(false);
        if (r) notify('Exported PDF', r, 'success', { actions: [{ label: 'Open', run: () => BRIDGE.showPath(r, true) }] });
      }
    } catch (e) { App.progress(false); notify('Export failed', String(e && e.message || e), 'error'); }
  },
  async exportFolder(fid = defaultFolderId()) {
    const f = folderById(fid); if (!f) return;
    Editor.flush();
    const files = []; const images = new Set();
    const base = folderPath(f.parentId).map(x => x.name);
    for (const id of descendantFolderIds(fid)) {
      const dir = folderPath(id).map(x => downloadName(x.name)).slice(base.length).join('/');
      for (const n of notesInFolder(id)) {
        const depth = dir.split('/').length;
        const md = '# ' + n.title + '\n\n' + htmlToMd(n.html, { imageSrc: img => img.dataset.file ? '../'.repeat(depth) + 'images/' + img.dataset.file : null });
        files.push({ path: dir + '/' + downloadName(n.title) + '.md', text: md });
        this.imagesOf(n.html).forEach(x => images.add(x));
      }
    }
    try { const r = await BRIDGE.exportFolder({ name: downloadName(f.name), files, images: [...images] }); if (r) notify('Exported ' + files.length + ' notes', r, 'success', { actions: [{ label: 'Show in Explorer', run: () => BRIDGE.showPath(r) }] }); }
    catch (e) { notify('Export failed', String(e && e.message || e), 'error'); }
  },
  download(name, text, type) { const a = h('a', { href: URL.createObjectURL(new Blob([text], { type })), download: name }); document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500); },
  importMarkdown(folderId) {
    const fid = folderId || defaultFolderId();
    if (!fid) { App.newFolder(null).then(() => this.importMarkdown()); return; }
    const inp = h('input', { type: 'file', accept: '.md,.markdown,.txt,text/markdown,text/plain', multiple: true });
    inp.addEventListener('change', async () => {
      let first = null, count = 0;
      for (const f of inp.files) {
        const text = await f.text();
        let title = f.name.replace(/\.(md|markdown|txt)$/i, '');
        let md = text.replace(/^﻿/, '');
        const fm = md.match(/^---\n[\s\S]*?\n---\n/); if (fm) md = md.slice(fm[0].length);
        const h1 = md.match(/^\s*#\s+(.+)\n/); if (h1) { title = h1[1].trim(); md = md.slice(h1.index + h1[0].length); }
        const n = createNote(fid, { title, html: mdToHtml(md) || '<p><br></p>' });
        first = first || n; count++;
      }
      App.refresh();
      if (first) { App.open(first.id); notify('Imported ' + count + ' note' + (count > 1 ? 's' : ''), 'Into ' + folderById(fid).name, 'success'); }
    });
    inp.click();
  },
};
