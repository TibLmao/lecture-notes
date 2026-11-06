// Codebook: the small, safe API the editor page is allowed to use.
const { contextBridge, ipcRenderer } = require('electron');
const inv = (ch) => (...a) => ipcRenderer.invoke(ch, ...a);

contextBridge.exposeInMainWorld('lnApp', {
  load: inv('load'), readNote: inv('readNote'), saveNote: inv('saveNote'), deleteNote: inv('deleteNote'),
  saveWorkspace: inv('saveWorkspace'), saveSettings: inv('saveSettings'), saveImage: inv('saveImage'), discordPresence: inv('discordPresence'),
  historyList: inv('historyList'), historyRead: inv('historyRead'), trashList: inv('trashList'), trashRestore: inv('trashRestore'),
  exportMarkdown: inv('exportMarkdown'), exportHtml: inv('exportHtml'), exportPdf: inv('exportPdf'), exportFolder: inv('exportFolder'),
  chooseVault: inv('chooseVault'), switchVault: inv('switchVault'), openFolder: inv('openFolder'), showPath: inv('showPath'), showImage: inv('showImage'),
  openExternal: inv('openExternal'), setTitleBarOverlay: inv('setTitleBarOverlay'), setZoom: inv('setZoom'), setSpellLanguages: inv('setSpellLanguages'),
  replaceMisspelling: inv('replaceMisspelling'), addToDictionary: inv('addToDictionary'), paste: inv('paste'),
  toggleDevTools: inv('toggleDevTools'), toggleFullscreen: inv('toggleFullscreen'), toggleMaximize: inv('toggleMaximize'), quit: inv('quit'),
  checkUpdates: inv('checkUpdates'),
  onContextMenu: cb => ipcRenderer.on('context-menu', (_e, p) => cb(p)),
  onExternalChange: cb => ipcRenderer.on('external-change', (_e, ids) => cb(ids)),
  onBeforeQuit: cb => ipcRenderer.on('before-quit', async () => { try { await cb(); } catch (e) {} ipcRenderer.send('quit-ready'); }),
});
