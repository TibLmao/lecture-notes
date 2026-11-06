'use strict';
/* ============================================================
   Settings: defaults, persistence and live application
   ============================================================ */
const FONTS = [
  // name, kind, CSS stack, fontsource package (bundled in the desktop app)
  ['JetBrains Mono', 'mono', "'JetBrains Mono', 'Cascadia Mono', Consolas, ui-monospace, monospace", 'jetbrains-mono'],
  ['Fira Code', 'mono', "'Fira Code', 'Cascadia Mono', Consolas, monospace", 'fira-code'],
  ['IBM Plex Mono', 'mono', "'IBM Plex Mono', Consolas, monospace", 'ibm-plex-mono'],
  ['Source Code Pro', 'mono', "'Source Code Pro', Consolas, monospace", 'source-code-pro'],
  ['Cascadia Code', 'mono', "'Cascadia Code', 'Cascadia Mono', Consolas, monospace", null],
  ['Consolas', 'mono', "Consolas, 'Courier New', monospace", null],
  ['Inter', 'sans', "'Inter', 'Segoe UI Variable', 'Segoe UI', system-ui, sans-serif", 'inter'],
  ['Segoe UI', 'sans', "'Segoe UI Variable', 'Segoe UI', system-ui, sans-serif", null],
  ['IBM Plex Sans', 'sans', "'IBM Plex Sans', 'Segoe UI', sans-serif", 'ibm-plex-sans'],
  ['Atkinson Hyperlegible', 'sans', "'Atkinson Hyperlegible', 'Segoe UI', sans-serif", 'atkinson-hyperlegible'],
  ['Lexend', 'sans', "'Lexend', 'Segoe UI', sans-serif", 'lexend'],
  ['Source Serif 4', 'serif', "'Source Serif 4', Georgia, serif", 'source-serif-4'],
  ['Literata', 'serif', "'Literata', Georgia, serif", 'literata'],
  ['Georgia', 'serif', "Georgia, 'Times New Roman', serif", null],
  ['System UI', 'sans', "system-ui, -apple-system, 'Segoe UI', sans-serif", null],
];
const FONT_BY_NAME = Object.fromEntries(FONTS.map(f => [f[0], f]));

const PLUGINS = [
  // id, name, icon, description, default
  ['markdown', 'Markdown Shortcuts', 'heading', 'Type # for headings, - for lists, [] for checkboxes, ``` for code, **bold**, `code` and more.', true],
  ['slash', 'Slash Commands', 'sparkle', 'Type / on an empty line for a menu of every block you can insert.', true],
  ['math', 'Math (KaTeX)', 'sigma', 'Inline $x^2$ and block $$…$$ LaTeX equations, rendered instantly.', true],
  ['wiki', 'Note Links & Backlinks', 'wikilink', 'Link notes with [[ and see what links back to the current note.', true],
  ['syntax', 'Syntax Highlighting', 'codeBlock', 'Colours code blocks in 30+ languages using your colour scheme.', true],
  ['timer', 'Lecture Timer', 'timer', 'Run widget that times a lecture and drops timestamps into your notes.', true],
  ['todo', 'TODO Tool Window', 'todo', 'Collects every unchecked checkbox from every note in one place.', true],
  ['folding', 'Heading Folding', 'chevronDown', 'Collapse a heading’s section from the gutter.', true],
  ['smartPaste', 'Smart Paste', 'paste', 'Converts pasted Markdown and web pages into clean notes.', true],
  ['symbols', 'Smart Symbols', 'sparkle', 'Turns -> into →, => into ⇒, != into ≠, <= into ≤ while you type.', true],
  ['history', 'Local History', 'history', 'Keeps earlier versions of every note so you can look back and restore.', true],
  ['hover', 'Link Preview', 'eye', 'Hover a note link to preview the note.', true],
];

const DEFAULT_SETTINGS = {
  v: 2,
  // Appearance
  theme: 'dark', syncOS: false, themeLight: 'light', themeDark: 'dark', uiStyle: 'new', accent: '', uiFont: 'Inter', uiSize: 13, compact: false, zoom: 100,
  animations: true, stripeNames: false, fileColors: true, showStatusBar: true, showBreadcrumbs: true,
  showFormatBar: true, floatingBar: true, showStripes: true,
  bgImage: '', bgOpacity: 10, bgFit: 'cover', bgTarget: 'editor',
  // Editor
  textFont: 'JetBrains Mono', headingFont: 'JetBrains Mono', codeFont: 'JetBrains Mono',
  fontSize: 15, codeSize: 13.5, lineHeight: 1.7, ligatures: true, paraSpacing: 0.55, editorWidth: 860,
  lineNumbers: true, currentLine: true, headingMarkers: true, foldIcons: true, smoothCaret: true,
  focusMode: false, typewriter: false, spellcheck: true, spellLang: 'en-GB', autoPairs: true,
  codeTab: 4, wrapCode: false, codeLang: '', calloutDefault: 'important',
  imgWidth: '', imgMaxDim: 2400, imgQuality: 0.88, imgRounded: true, imgShadow: true, imgCaptions: true,
  // Keymap
  keymapPreset: 'intellij', keymap: {},
  // Plugins
  plugins: Object.fromEntries(PLUGINS.map(p => [p[0], p[4]])),
  // Colour scheme overrides per theme id
  schemeOverrides: {},
  // Behaviour
  autosaveDelay: 500, confirmDelete: true, restoreSession: true, singleClickOpen: true,
  projectSort: 'created', projectDates: true, projectCounts: true, foldersFirst: true,
  timerHeadings: false, timerHours: false, historyMinutes: 5, historyDays: 30,
  checkUpdates: true, dateStyle: 'medium',
};

let SETTINGS = structuredClone(DEFAULT_SETTINGS);

function mergeSettings(saved) {
  const s = structuredClone(DEFAULT_SETTINGS);
  if (saved && typeof saved === 'object') {
    for (const [k, v] of Object.entries(saved)) {
      if (!(k in s)) continue;
      if (k === 'plugins' || k === 'keymap' || k === 'schemeOverrides') s[k] = { ...s[k], ...(v || {}) };
      else s[k] = v;
    }
  }
  if (!THEME_BY_ID[s.theme]) s.theme = 'dark';
  return s;
}
const plugin = id => !!(SETTINGS.plugins && SETTINGS.plugins[id]);

/* ---------- font loading ---------- */
const loadedFonts = new Set();
function ensureFont(name) {
  const f = FONT_BY_NAME[name];
  if (!f || loadedFonts.has(name)) return;
  loadedFonts.add(name);
  if (f[3] && IS_DESKTOP) {
    for (const w of ['400', '500', '600', '700', '400-italic']) {
      document.head.appendChild(h('link', { rel: 'stylesheet', href: `../node_modules/@fontsource/${f[3]}/${w}.css`, onerror: e => e.target.remove() }));
    }
  } else if (f[3] && navigator.onLine) {
    const fam = name.replace(/ /g, '+');
    document.head.appendChild(h('link', { rel: 'stylesheet', href: `https://fonts.googleapis.com/css2?family=${fam}:ital,wght@0,400;0,500;0,600;0,700;1,400&display=swap` }));
  }
}
const fontStack = name => (FONT_BY_NAME[name] || FONT_BY_NAME['JetBrains Mono'])[2];

/* ---------- apply ---------- */
let currentTheme = null;
function effectiveThemeId(s = SETTINGS) {
  if (s.syncOS) { const dark = matchMedia('(prefers-color-scheme: dark)').matches; const id = dark ? s.themeDark : s.themeLight; if (THEME_BY_ID[id]) return id; }
  return s.theme;
}
function applySettings(s = SETTINGS) {
  const t = resolveTheme({ ...s, theme: effectiveThemeId(s) });
  currentTheme = t;
  const root = document.documentElement;
  root.style.cssText = themeCssVars(t);
  [s.uiFont, s.textFont, s.headingFont, s.codeFont].forEach(ensureFont);
  const st = root.style;
  st.setProperty('--font-ui', fontStack(s.uiFont));
  st.setProperty('--font-text', fontStack(s.textFont));
  st.setProperty('--font-head', fontStack(s.headingFont));
  st.setProperty('--font-code', fontStack(s.codeFont));
  st.setProperty('--ui-size', (s.uiSize || 13) + 'px');
  st.setProperty('--ed-size', (s.fontSize || 15) + 'px');
  st.setProperty('--code-size', (s.codeSize || 13.5) + 'px');
  st.setProperty('--ed-lh', String(s.lineHeight || 1.7));
  st.setProperty('--para', (s.paraSpacing ?? 0.55) + 'em');
  st.setProperty('--ed-width', s.editorWidth ? s.editorWidth + 'px' : 'none');
  st.setProperty('--bg-op', String((s.bgOpacity || 0) / 100));
  st.setProperty('--liga', s.ligatures ? 'normal' : 'none');
  st.setProperty('--mi-timer', iconMask('timer'));
  const b = document.body;
  const cls = {
    'ui-new': s.uiStyle !== 'classic', 'ui-classic': s.uiStyle === 'classic', 'theme-dark': t.dark, 'theme-light': !t.dark,
    compact: !!s.compact, 'no-anim': !s.animations, 'no-ln': !s.lineNumbers, 'no-curline': !s.currentLine,
    'no-hmark': !s.headingMarkers, 'no-fold': !s.foldIcons || !plugin('folding'), 'focus-mode': !!s.focusMode, 'wrap-code': !!s.wrapCode,
    'img-rounded': !!s.imgRounded, 'img-shadow': !!s.imgShadow, 'no-captions': !s.imgCaptions, 'stripe-names': !!s.stripeNames || s.uiStyle === 'classic',
    'no-status': !s.showStatusBar, 'no-crumbs': !s.showBreadcrumbs, 'no-fmtbar': !s.showFormatBar, 'no-stripes': !s.showStripes,
    'file-colors': !!s.fileColors, 'has-bg': !!s.bgImage, 'bg-frame': s.bgTarget === 'frame', 'smooth-caret': !!s.smoothCaret,
    'is-desktop': IS_DESKTOP, 'is-mac': IS_MAC, 'is-win': !IS_MAC && /Win/.test(navigator.platform || navigator.userAgent),
  };
  for (const [k, v] of Object.entries(cls)) b.classList.toggle(k, v);
  for (const id of ['bgImage', 'bgEditor']) {
    const bg = $('#' + id); if (!bg) continue;
    bg.style.backgroundImage = s.bgImage ? `url("${s.bgImage}")` : '';
    bg.style.backgroundSize = s.bgFit === 'tile' ? 'auto' : s.bgFit === 'contain' ? 'contain' : 'cover';
    bg.style.backgroundRepeat = s.bgFit === 'tile' ? 'repeat' : 'no-repeat';
  }
  if (typeof Editor !== 'undefined' && Editor.el) Editor.el.spellcheck = !!s.spellcheck;
  if (IS_DESKTOP) {
    try { BRIDGE.setTitleBarOverlay({ color: t.ui.win, symbolColor: t.ui.icon, height: s.uiStyle === 'classic' ? 30 : s.compact ? 34 : 40 }); } catch (e) {}
    try { BRIDGE.setZoom((s.zoom || 100) / 100); } catch (e) {}
    try { BRIDGE.setSpellLanguages(s.spellcheck ? [s.spellLang || 'en-GB'] : []); } catch (e) {}
  }
  document.dispatchEvent(new CustomEvent('ln:settings'));
}

let saveSettingsT = null;
function saveSettings() {
  clearTimeout(saveSettingsT);
  saveSettingsT = setTimeout(() => Store.saveSettings(SETTINGS), 150);
}
function setSetting(k, v, quiet) {
  SETTINGS[k] = v; applySettings(); saveSettings();
  if (!quiet && typeof App !== 'undefined') App.refreshChrome();
}
function togglePlugin(id, on) {
  SETTINGS.plugins = { ...SETTINGS.plugins, [id]: on == null ? !plugin(id) : !!on };
  applySettings(); saveSettings();
  if (typeof App !== 'undefined') App.refreshChrome(true);
}
