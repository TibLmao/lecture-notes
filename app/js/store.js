'use strict';
/* ============================================================
   Storage. Desktop: files in the notes folder via the Electron
   bridge. Fallback (dev/testing): localStorage.
   ============================================================ */
const LOCAL_DATA = 'ln2.data', LOCAL_SETTINGS = 'ln2.settings';

const Store = {
  mode: IS_DESKTOP ? 'desktop' : 'local',
  info: { root: '', name: 'lectures', platform: IS_MAC ? 'darwin' : 'win32', version: '2.0.0' },
  pending: 0,
  queues: {},
  listeners: new Set(),

  onStatus(fn) { this.listeners.add(fn); },
  emit(state, msg) { this.listeners.forEach(fn => { try { fn(state, msg); } catch (e) {} }); },

  async load() {
    if (this.mode === 'desktop') {
      const d = await BRIDGE.load();
      Object.assign(this.info, d.info || {});
      return { folders: (d.workspace && d.workspace.folders) || null, legacyModules: d.workspace && d.workspace.modules, notes: d.notes || {}, settings: d.settings || null };
    }
    const d = lsGet(LOCAL_DATA, { workspace: {}, notes: {} });
    this.info.root = 'Browser storage';
    return { folders: (d.workspace && d.workspace.folders) || null, legacyModules: d.workspace && d.workspace.modules, notes: d.notes || {}, settings: lsGet(LOCAL_SETTINGS, null) };
  },

  /** Serialise writes per key: only the latest pending write runs. */
  write(key, fn) {
    const q = this.queues[key] || (this.queues[key] = { running: null, next: null });
    q.next = fn;
    if (q.running) return q.running;
    this.pending++; this.emit('saving');
    q.running = (async () => {
      while (q.next) {
        const f = q.next; q.next = null;
        try { await f(); }
        catch (e) {
          await sleep(400);
          try { await f(); } catch (e2) { console.error(e2); this.emit('error', 'Couldn’t save: ' + (e2 && e2.message || e2)); }
        }
      }
      q.running = null; this.pending--;
      if (this.pending <= 0) { this.pending = 0; this.emit('saved'); }
    })();
    return q.running;
  },
  busy(key) { const q = this.queues[key]; return !!(q && (q.running || q.next)); },

  notePayload(n) {
    return { title: n.title || '', folderId: n.folderId || '', html: n.html || '', created: n.created || Date.now(), updated: n.updated || Date.now(), starred: !!n.starred, duration: n.duration || 0 };
  },
  saveNote(n) {
    const data = this.notePayload(n);
    if (this.mode === 'desktop') return this.write('n:' + n.id, () => BRIDGE.saveNote(n.id, data, { historyMinutes: plugin('history') ? SETTINGS.historyMinutes : 0, historyDays: SETTINGS.historyDays }));
    return this.write('local', () => this.saveLocal());
  },
  deleteNote(id) {
    if (this.mode === 'desktop') return this.write('n:' + id, () => BRIDGE.deleteNote(id));
    return this.write('local', () => this.saveLocal());
  },
  saveWorkspace() {
    const data = { v: 2, folders: S.folders.map(f => ({ id: f.id, name: f.name, parentId: f.parentId || null, color: f.color || '', created: f.created || 0 })) };
    if (this.mode === 'desktop') return this.write('ws', () => BRIDGE.saveWorkspace(data));
    return this.write('local', () => this.saveLocal());
  },
  saveSettings(s) {
    if (this.mode === 'desktop') return this.write('settings', () => BRIDGE.saveSettings(s));
    lsSet(LOCAL_SETTINGS, s);
  },
  async saveLocal() {
    const notes = {};
    for (const [id, n] of Object.entries(S.notes)) notes[id] = this.notePayload(n);
    const ok = lsSet(LOCAL_DATA, { workspace: { v: 2, folders: S.folders }, notes });
    if (!ok) throw new Error('browser storage is full');
  },
  /** Store an image; returns {src, file} */
  async saveImage(blob) {
    if (this.mode === 'desktop') {
      const buf = new Uint8Array(await blob.arrayBuffer());
      const r = await BRIDGE.saveImage(buf, blob.type);
      return { src: r.url, file: r.name };
    }
    const small = await downscaleImage(blob, 1600, 0.8);
    return { src: await blobToDataURL(small), file: '' };
  },
  async historyList(id) { return this.mode === 'desktop' ? BRIDGE.historyList(id) : []; },
  async historyRead(id, ts) { return this.mode === 'desktop' ? BRIDGE.historyRead(id, ts) : null; },
  async trashList() { return this.mode === 'desktop' ? BRIDGE.trashList() : []; },
  async trashRestore(id) { return this.mode === 'desktop' ? BRIDGE.trashRestore(id) : null; },
};

/* ---------- image helpers ---------- */
function loadImageEl(blob) {
  return new Promise((res, rej) => { const u = URL.createObjectURL(blob); const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = u; });
}
async function downscaleImage(blob, max, quality) {
  const img = await loadImageEl(blob);
  let w = img.naturalWidth, hh = img.naturalHeight;
  const k = Math.min(1, max / Math.max(w, hh));
  if (k === 1 && blob.size < 3e6 && /png|jpeg|webp|gif/.test(blob.type)) return blob;
  w = Math.max(1, Math.round(w * k)); hh = Math.max(1, Math.round(hh * k));
  const c = document.createElement('canvas'); c.width = w; c.height = hh;
  const x = c.getContext('2d');
  const keepPng = blob.type === 'image/png' && w * hh < 4e6;
  if (!keepPng) { x.fillStyle = '#fff'; x.fillRect(0, 0, w, hh); }
  x.drawImage(img, 0, 0, w, hh);
  return new Promise((r, j) => c.toBlob(b => b ? r(b) : j(new Error('encode failed')), keepPng ? 'image/png' : 'image/jpeg', quality));
}
function blobToDataURL(b) { return new Promise((r, j) => { const f = new FileReader(); f.onload = () => r(f.result); f.onerror = j; f.readAsDataURL(b); }); }
