// Codebook: Electron main process
const { app, BrowserWindow, ipcMain, protocol, net, shell, Menu, dialog, session, nativeTheme } = require('electron');
const path = require('path');
const fs = require('fs');
const fsp = require('fs/promises');
const os = require('os');
const { pathToFileURL } = require('url');

protocol.registerSchemesAsPrivileged([{ scheme: 'lnimg', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }]);
app.setAppUserModelId('com.codebook.app');
if (!app.requestSingleInstanceLock()) { app.quit(); }

const USER = () => app.getPath('userData');
const CONFIG = () => path.join(USER(), 'config.json');
const SETTINGS = () => path.join(USER(), 'settings.json');
const WINSTATE = () => path.join(USER(), 'window.json');
let config = { vault: '', recent: [] };
let win = null;
let quitting = false;

const readJSON = async (file, fallback) => { try { return JSON.parse(await fsp.readFile(file, 'utf8')); } catch (e) { return fallback; } };
const recentWrites = new Map();
async function writeAtomic(file, text) {
  await fsp.mkdir(path.dirname(file), { recursive: true });
  const tmp = file + '.' + process.pid + '.tmp';
  await fsp.writeFile(tmp, text, 'utf8');
  await fsp.rename(tmp, file);
  recentWrites.set(path.basename(file), Date.now());
}
const safeId = id => { if (typeof id !== 'string' || !/^[\w-]{1,80}$/.test(id)) throw new Error('Invalid id'); return id; };
const safeName = n => String(n || 'untitled').replace(/[\\/:*?"<>|]+/g, '-').trim().slice(0, 150) || 'untitled';

/* ---------------- vault (notes folder) ---------------- */
const V = {
  root: () => config.vault,
  notes: () => path.join(config.vault, 'notes'),
  images: () => path.join(config.vault, 'images'),
  history: () => path.join(config.vault, '.history'),
  trash: () => path.join(config.vault, '.trash'),
  ws: () => path.join(config.vault, 'workspace.json'),
};
async function ensureVault() {
  if (!config.vault) {
    // people upgrading from "Lecture Notes" keep their existing folder
    const old = path.join(app.getPath('documents'), 'LectureNotes');
    const neu = path.join(app.getPath('documents'), 'Codebook');
    config.vault = (!fs.existsSync(neu) && fs.existsSync(path.join(old, 'notes'))) ? old : neu;
  }
  for (const d of [V.notes(), V.images(), V.history(), V.trash()]) await fsp.mkdir(d, { recursive: true });
  config.recent = [config.vault, ...(config.recent || []).filter(p => p !== config.vault)].slice(0, 10);
  await writeAtomic(CONFIG(), JSON.stringify(config, null, 1));
}
let watcher = null;
function watchVault() {
  try { if (watcher) watcher.close(); } catch (e) {}
  const pending = new Set(); let t = null;
  try {
    watcher = fs.watch(V.notes(), (ev, file) => {
      if (!file || !file.endsWith('.json')) return;
      const w = recentWrites.get(file); if (w && Date.now() - w < 2500) return;
      pending.add(file.slice(0, -5)); clearTimeout(t);
      t = setTimeout(() => { if (win && !win.isDestroyed()) win.webContents.send('external-change', [...pending]); pending.clear(); }, 400);
    });
  } catch (e) { /* watching is best-effort */ }
}

/* ---------------- history & trash ---------------- */
const lastSnap = new Map();
async function snapshot(id, opts) {
  const minutes = opts && opts.historyMinutes; if (!minutes) return;
  const now = Date.now(); const last = lastSnap.get(id) || 0;
  if (now - last < minutes * 60000) return;
  const file = path.join(V.notes(), id + '.json');
  let prev; try { prev = await fsp.readFile(file, 'utf8'); } catch (e) { return; }
  const dir = path.join(V.history(), id); await fsp.mkdir(dir, { recursive: true });
  await fsp.writeFile(path.join(dir, now + '.json'), prev, 'utf8');
  lastSnap.set(id, now);
  // prune
  const days = (opts && opts.historyDays) || 30; const cutoff = now - days * 86400000;
  const files = (await fsp.readdir(dir)).filter(f => f.endsWith('.json')).sort();
  const excess = files.length - 100;
  for (let i = 0; i < files.length; i++) { const ts = parseInt(files[i]); if (ts < cutoff || i < excess) await fsp.rm(path.join(dir, files[i]), { force: true }); }
}

/* ---------------- IPC ---------------- */
function registerIpc() {
  const H = (ch, fn) => ipcMain.handle(ch, async (e, ...a) => fn(...a));
  H('load', async () => {
    await ensureVault(); watchVault();
    const workspace = await readJSON(V.ws(), {});
    const notes = {};
    for (const f of await fsp.readdir(V.notes())) {
      if (!f.endsWith('.json')) continue;
      const d = await readJSON(path.join(V.notes(), f), null); if (d) notes[f.slice(0, -5)] = d;
    }
    // first run: migrate v1 notes stored in Documents/LectureNotes by the first version
    const settings = await readJSON(SETTINGS(), null);
    const pkg = require('./package.json');
    let build = 0; try { build = require('./app/build.json').build || 0; } catch (e) {}
    return { info: { root: V.root(), name: path.basename(V.root()), platform: process.platform, version: pkg.version + (build ? ' (build ' + build + ')' : ''), electron: process.versions.electron, recent: config.recent }, workspace, notes, settings };
  });
  H('readNote', async id => readJSON(path.join(V.notes(), safeId(id) + '.json'), null));
  H('saveNote', async (id, data, opts) => { safeId(id); await snapshot(id, opts).catch(() => {}); await writeAtomic(path.join(V.notes(), id + '.json'), JSON.stringify(data)); });
  H('deleteNote', async id => {
    safeId(id); const src = path.join(V.notes(), id + '.json');
    const d = await readJSON(src, null); if (!d) return;
    await writeAtomic(path.join(V.trash(), id + '.json'), JSON.stringify({ ...d, deletedAt: Date.now() }));
    recentWrites.set(id + '.json', Date.now());
    await fsp.rm(src, { force: true });
  });
  H('saveWorkspace', async data => writeAtomic(V.ws(), JSON.stringify(data, null, 1)));
  H('saveSettings', async data => writeAtomic(SETTINGS(), JSON.stringify(data, null, 1)));
  H('discordPresence', async (clientId, activity) => { Discord.configure(clientId); if (Discord.clientId) Discord.set(activity || null); return { connected: Discord.ready }; });
  H('saveImage', async (bytes, type) => {
    const ext = ({ 'image/png': '.png', 'image/jpeg': '.jpg', 'image/gif': '.gif', 'image/webp': '.webp', 'image/svg+xml': '.svg' })[type] || '.png';
    const d = new Date(); const stamp = d.toISOString().slice(0, 10);
    const name = `${stamp}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}${ext}`;
    await fsp.writeFile(path.join(V.images(), name), Buffer.from(bytes));
    return { name, url: 'lnimg://img/' + encodeURIComponent(name) };
  });
  H('historyList', async id => {
    const dir = path.join(V.history(), safeId(id));
    let files = []; try { files = (await fsp.readdir(dir)).filter(f => f.endsWith('.json')); } catch (e) { return []; }
    const out = [];
    for (const f of files) { const st = await fsp.stat(path.join(dir, f)); out.push({ ts: parseInt(f), size: st.size }); }
    return out.sort((a, b) => b.ts - a.ts);
  });
  H('historyRead', async (id, ts) => readJSON(path.join(V.history(), safeId(id), parseInt(ts) + '.json'), null));
  H('trashList', async () => {
    const out = [];
    for (const f of await fsp.readdir(V.trash())) { if (!f.endsWith('.json')) continue; const d = await readJSON(path.join(V.trash(), f), null); if (d) out.push({ id: f.slice(0, -5), title: d.title, deletedAt: d.deletedAt || 0, folderId: d.folderId }); }
    return out.sort((a, b) => b.deletedAt - a.deletedAt);
  });
  H('trashRestore', async id => {
    const file = path.join(V.trash(), safeId(id) + '.json'); const d = await readJSON(file, null); if (!d) return null;
    delete d.deletedAt; await writeAtomic(path.join(V.notes(), id + '.json'), JSON.stringify(d)); await fsp.rm(file, { force: true }); return d;
  });
  /* export */
  H('exportMarkdown', async ({ name, md, images }) => {
    const r = await dialog.showSaveDialog(win, { defaultPath: path.join(app.getPath('documents'), safeName(name)), filters: [{ name: 'Markdown', extensions: ['md'] }] });
    if (r.canceled || !r.filePath) return null;
    await fsp.writeFile(r.filePath, md, 'utf8');
    if (images && images.length) { const dir = path.join(path.dirname(r.filePath), 'images'); await fsp.mkdir(dir, { recursive: true }); for (const im of images) await fsp.copyFile(path.join(V.images(), path.basename(im)), path.join(dir, path.basename(im))).catch(() => {}); }
    return r.filePath;
  });
  const inlineImages = async html => {
    const names = [...new Set([...html.matchAll(/lnimg:\/\/img\/([^"')\s]+)/g)].map(m => decodeURIComponent(m[1])))];
    for (const n of names) {
      try { const buf = await fsp.readFile(path.join(V.images(), path.basename(n))); const ext = path.extname(n).slice(1).replace('jpg', 'jpeg').replace('svg', 'svg+xml'); html = html.split('lnimg://img/' + encodeURIComponent(n)).join(`data:image/${ext};base64,${buf.toString('base64')}`); } catch (e) {}
    }
    return html;
  };
  H('exportHtml', async ({ name, html }) => {
    const r = await dialog.showSaveDialog(win, { defaultPath: path.join(app.getPath('documents'), safeName(name)), filters: [{ name: 'Web page', extensions: ['html'] }] });
    if (r.canceled || !r.filePath) return null;
    await fsp.writeFile(r.filePath, await inlineImages(html), 'utf8');
    return r.filePath;
  });
  H('exportPdf', async ({ name, html }) => {
    const r = await dialog.showSaveDialog(win, { defaultPath: path.join(app.getPath('documents'), safeName(name)), filters: [{ name: 'PDF', extensions: ['pdf'] }] });
    if (r.canceled || !r.filePath) return null;
    const tmp = path.join(os.tmpdir(), 'codebook-export-' + Date.now() + '.html');
    await fsp.writeFile(tmp, await inlineImages(html), 'utf8');
    const pw = new BrowserWindow({ show: false, webPreferences: { sandbox: true, javascript: false } });
    try {
      await pw.loadFile(tmp);
      const pdf = await pw.webContents.printToPDF({ printBackground: true, pageSize: 'A4', margins: { top: 0.6, bottom: 0.6, left: 0.6, right: 0.6 } });
      await fsp.writeFile(r.filePath, pdf);
    } finally { pw.destroy(); fsp.rm(tmp, { force: true }).catch(() => {}); }
    return r.filePath;
  });
  H('exportFolder', async ({ name, files, images }) => {
    const r = await dialog.showOpenDialog(win, { title: 'Export to folder', properties: ['openDirectory', 'createDirectory'], defaultPath: app.getPath('documents') });
    if (r.canceled || !r.filePaths[0]) return null;
    const root = path.join(r.filePaths[0], safeName(name) + ' (Markdown)');
    for (const f of files) { const parts = f.path.split('/').map(safeName); const target = path.join(root, ...parts); await fsp.mkdir(path.dirname(target), { recursive: true }); await fsp.writeFile(target, f.text, 'utf8'); }
    if (images && images.length) { const dir = path.join(root, 'images'); await fsp.mkdir(dir, { recursive: true }); for (const im of images) await fsp.copyFile(path.join(V.images(), path.basename(im)), path.join(dir, path.basename(im))).catch(() => {}); }
    return root;
  });
  /* vaults & shell */
  H('chooseVault', async () => {
    const r = await dialog.showOpenDialog(win, { title: 'Open notes folder', properties: ['openDirectory', 'createDirectory'], defaultPath: config.vault });
    if (r.canceled || !r.filePaths[0]) return false;
    config.vault = r.filePaths[0]; await ensureVault(); win.reload(); return true;
  });
  H('switchVault', async p => { if (!p || !fs.existsSync(p)) { dialog.showErrorBox('Folder not found', p || ''); return false; } config.vault = p; await ensureVault(); win.reload(); return true; });
  H('openFolder', async () => shell.openPath(V.root()));
  H('showPath', async (p, open) => { if (open) return shell.openPath(p); shell.showItemInFolder(p); });
  H('showImage', async name => shell.showItemInFolder(path.join(V.images(), path.basename(String(name || '')))));
  H('openExternal', async url => { if (/^(https?:|mailto:)/i.test(url)) await shell.openExternal(url); });
  H('setTitleBarOverlay', async o => { if (process.platform !== 'darwin' && win && win.setTitleBarOverlay) { try { win.setTitleBarOverlay({ color: o.color, symbolColor: o.symbolColor, height: o.height || 40 }); } catch (e) {} } if (win) win.setBackgroundColor(o.color); });
  H('setZoom', async f => { if (win) win.webContents.setZoomFactor(Math.min(2, Math.max(0.6, Number(f) || 1))); });
  H('setSpellLanguages', async langs => { try { session.defaultSession.setSpellCheckerEnabled(langs.length > 0); if (langs.length && process.platform !== 'darwin') session.defaultSession.setSpellCheckerLanguages(langs.filter(l => session.defaultSession.availableSpellCheckerLanguages.includes(l))); } catch (e) {} });
  H('replaceMisspelling', async w => win && win.webContents.replaceMisspelling(w));
  H('addToDictionary', async w => session.defaultSession.addWordToSpellCheckerDictionary(w));
  H('paste', async () => win && win.webContents.paste());
  H('toggleDevTools', async () => win && win.webContents.toggleDevTools());
  H('toggleFullscreen', async () => win && win.setFullScreen(!win.isFullScreen()));
  H('toggleMaximize', async () => { if (!win) return; if (win.isMaximized()) win.unmaximize(); else win.maximize(); });
  H('quit', async () => app.quit());
  H('checkUpdates', async () => {
    const pkg = require('./package.json');
    const repo = String((pkg.repository && pkg.repository.url) || pkg.repository || '').replace(/^github:/, '').replace(/^https:\/\/github.com\//, '').replace(/\.git$/, '');
    let build = 0; try { build = require('./app/build.json').build || 0; } catch (e) {}
    if (!repo || !repo.includes('/')) throw new Error('No update source configured');
    const res = await net.fetch(`https://api.github.com/repos/${repo}/releases/latest`, { headers: { 'User-Agent': 'Codebook', Accept: 'application/vnd.github+json' } });
    if (!res.ok) throw new Error(res.status === 404 ? 'No public releases found' : 'GitHub returned ' + res.status);
    const j = await res.json();
    const latestBuild = parseInt(((j.tag_name || '').match(/build(\d+)/) || [])[1] || '0');
    const asset = (j.assets || []).find(a => /\.exe$/i.test(a.name));
    return { current: pkg.version + (build ? ' (build ' + build + ')' : ''), latest: j.name || j.tag_name, newer: latestBuild > build, url: asset ? asset.browser_download_url : j.html_url };
  });
}

/* ---------------- window ---------------- */
async function createWindow() {
  const st = await readJSON(WINSTATE(), {});
  const settings = await readJSON(SETTINGS(), {});
  const dark = !settings || !settings.theme || !/light/.test(settings.theme);
  const bg = dark ? '#2B2D30' : '#F7F8FA';
  const mac = process.platform === 'darwin';
  win = new BrowserWindow({
    width: (st.bounds && st.bounds.width) || 1360, height: (st.bounds && st.bounds.height) || 880,
    x: st.bounds && st.bounds.x, y: st.bounds && st.bounds.y,
    minWidth: 640, minHeight: 420, backgroundColor: bg, title: 'Codebook', show: false,
    icon: path.join(__dirname, 'build', 'icon.png'),
    titleBarStyle: mac ? 'hiddenInset' : 'hidden',
    titleBarOverlay: mac ? undefined : { color: bg, symbolColor: dark ? '#CED0D6' : '#6C707E', height: 40 },
    trafficLightPosition: mac ? { x: 14, y: 13 } : undefined,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: true },
  });
  if (st.maximized) win.maximize();
  win.once('ready-to-show', () => win.show());
  const saveState = () => { if (!win || win.isDestroyed()) return; const b = win.isMaximized() ? (st.bounds || win.getNormalBounds()) : win.getBounds(); st.bounds = win.isMaximized() ? win.getNormalBounds() : b; st.maximized = win.isMaximized(); fsp.writeFile(WINSTATE(), JSON.stringify(st)).catch(() => {}); };
  win.on('resize', debounce(saveState, 500)); win.on('move', debounce(saveState, 500)); win.on('close', saveState);
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:\/\//i.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith('file:')) { e.preventDefault(); if (/^https?:\/\//i.test(url)) shell.openExternal(url); } });
  win.webContents.on('context-menu', (_e, p) => {
    if (!p.isEditable) return;
    win.webContents.send('context-menu', { misspelledWord: p.misspelledWord, dictionarySuggestions: p.dictionarySuggestions, x: p.x, y: p.y });
  });
  win.on('close', e => {
    if (quitting) return;
    e.preventDefault();
    win.webContents.send('before-quit');
    const t = setTimeout(() => { quitting = true; win.destroy(); }, 2000);
    ipcMain.once('quit-ready', () => { clearTimeout(t); quitting = true; win.destroy(); });
  });
  win.loadFile(path.join(__dirname, 'app', 'index.html'));
}
function debounce(fn, ms) { let t; return () => { clearTimeout(t); t = setTimeout(fn, ms); }; }

app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
/* carry settings over from the app's old name ("Lecture Notes") */
async function migrateUserData() {
  try {
    const oldDir = path.join(app.getPath('appData'), 'Lecture Notes');
    if (oldDir === USER() || fs.existsSync(CONFIG()) || !fs.existsSync(path.join(oldDir, 'config.json'))) return;
    await fsp.mkdir(USER(), { recursive: true });
    for (const f of ['config.json', 'settings.json', 'window.json']) await fsp.copyFile(path.join(oldDir, f), path.join(USER(), f)).catch(() => {});
  } catch (e) { /* best effort */ }
}

/* ---------------- Discord Rich Presence ----------------
   Talks to the Discord desktop app over its local IPC pipe (no extra packages).
   Frame = int32LE opcode, int32LE length, JSON. 0 handshake, 1 frame, 2 close, 3 ping, 4 pong. */
const Discord = {
  sock: null, clientId: '', ready: false, retry: null, want: null, sent: 0, timer: null, startedAt: Date.now(), buf: Buffer.alloc(0), nonce: 0,
  pipePath(i) {
    if (process.platform === 'win32') return '\\\\?\\pipe\\discord-ipc-' + i;
    const base = process.env.XDG_RUNTIME_DIR || process.env.TMPDIR || process.env.TMP || process.env.TEMP || '/tmp';
    return path.join(base.replace(/\/$/, ''), 'discord-ipc-' + i);
  },
  configure(clientId) {
    clientId = String(clientId || '').trim();
    if (!/^\d{15,25}$/.test(clientId)) clientId = '';
    if (clientId === this.clientId) { if (clientId && !this.sock) this.connect(); return; }
    this.stop(); this.clientId = clientId;
    if (clientId) this.connect();
  },
  connect(i = 0) {
    if (!this.clientId || this.sock) return;
    if (i > 9) return this.later();
    const net_ = require('net');
    const s = net_.createConnection(this.pipePath(i));
    let opened = false;
    s.once('connect', () => {
      opened = true; this.sock = s; this.buf = Buffer.alloc(0);
      this.write(0, { v: 1, client_id: this.clientId });
    });
    s.on('data', d => this.onData(s, d));
    s.on('error', () => { if (!opened) { s.destroy(); this.connect(i + 1); } });
    s.on('close', () => { if (opened && this.sock === s) { this.sock = null; this.ready = false; this.later(); } });
  },
  write(op, obj, s = this.sock) {
    if (!s) return;
    const body = Buffer.from(JSON.stringify(obj), 'utf8');
    const head = Buffer.alloc(8); head.writeInt32LE(op, 0); head.writeInt32LE(body.length, 4);
    try { s.write(Buffer.concat([head, body])); } catch (e) {}
  },
  onData(s, d) {
    this.buf = Buffer.concat([this.buf, d]);
    while (this.buf.length >= 8) {
      const op = this.buf.readInt32LE(0), len = this.buf.readInt32LE(4);
      if (this.buf.length < 8 + len) break;
      let msg = null; try { msg = JSON.parse(this.buf.slice(8, 8 + len).toString('utf8')); } catch (e) {}
      this.buf = this.buf.slice(8 + len);
      if (op === 3) this.write(4, msg, s);                       // ping -> pong
      else if (op === 2) { s.destroy(); }                         // Discord closed us (e.g. bad client id)
      else if (op === 1 && msg && msg.cmd === 'DISPATCH' && msg.evt === 'READY') { this.ready = true; this.flush(true); }
    }
  },
  later() { clearTimeout(this.retry); if (this.clientId) this.retry = setTimeout(() => this.connect(), 20000); },
  set(activity) { this.want = activity; this.flush(); },
  flush(now) {
    if (!this.ready) return;
    // Discord allows ~5 updates per 20s: send at most one every 4s, latest wins
    const wait = now ? 0 : Math.max(0, this.sent + 4000 - Date.now());
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      if (!this.ready) return;
      this.sent = Date.now();
      const a = this.want;
      const activity = a ? {
        details: a.details ? String(a.details).slice(0, 128) : undefined,
        state: a.state ? String(a.state).slice(0, 128) : undefined,
        timestamps: a.noTime ? undefined : { start: a.start || this.startedAt },
        assets: { large_image: 'codebook', large_text: 'Codebook', ...(a.small ? { small_image: a.small, small_text: a.smallText || '' } : {}) },
        instance: false,
      } : undefined;
      this.write(1, { cmd: 'SET_ACTIVITY', args: { pid: process.pid, activity }, nonce: String(++this.nonce) });
    }, wait);
  },
  stop() {
    clearTimeout(this.retry); clearTimeout(this.timer);
    const s = this.sock; this.sock = null; this.ready = false;
    if (s) { try { this.write(1, { cmd: 'SET_ACTIVITY', args: { pid: process.pid }, nonce: String(++this.nonce) }, s); s.end(); } catch (e) {} }
  },
};

app.whenReady().then(async () => {
  await migrateUserData();
  config = await readJSON(CONFIG(), { vault: '', recent: [] });
  await ensureVault();
  protocol.handle('lnimg', req => {
    const u = new URL(req.url);
    const name = path.basename(decodeURIComponent(u.pathname));
    return net.fetch(pathToFileURL(path.join(V.images(), name)).toString());
  });
  registerIpc();
  if (process.platform === 'darwin') {
    Menu.setApplicationMenu(Menu.buildFromTemplate([{ role: 'appMenu' }, { role: 'editMenu' }, { role: 'windowMenu' }]));
  } else Menu.setApplicationMenu(null);
  await createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('will-quit', () => Discord.stop());
