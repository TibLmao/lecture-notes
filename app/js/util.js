'use strict';
/* ============================================================
   unicode: shared helpers
   ============================================================ */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = (p = '') => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const raf = () => new Promise(r => requestAnimationFrame(r));

const IS_MAC = /Mac|iPhone|iPad/i.test(navigator.platform || '') || /Mac OS X/.test(navigator.userAgent);
const BRIDGE = window.lnApp || null;
const IS_DESKTOP = !!BRIDGE;

/** Tiny hyperscript: h('div.cls#id', {attrs}, ...children) */
function h(sel, attrs, ...kids) {
  const m = sel.match(/^([a-z0-9-]+)?((?:[.#][\w-]+)*)$/i);
  const node = document.createElement((m && m[1]) || 'div');
  if (m && m[2]) for (const part of m[2].match(/[.#][\w-]+/g) || []) {
    if (part[0] === '.') node.classList.add(part.slice(1)); else node.id = part.slice(1);
  }
  if (attrs && (typeof attrs !== 'object' || attrs instanceof Node || Array.isArray(attrs))) { kids.unshift(attrs); attrs = null; }
  if (attrs) for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') node.className += (node.className ? ' ' : '') + v;
    else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
    else if (k === 'html') node.innerHTML = v;
    else if (k === 'text') node.textContent = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else if (v === true) node.setAttribute(k, '');
    else node.setAttribute(k, v);
  }
  const add = k => {
    if (k == null || k === false) return;
    if (Array.isArray(k)) k.forEach(add);
    else node.appendChild(k instanceof Node ? k : document.createTextNode(String(k)));
  };
  kids.forEach(add);
  return node;
}

function debounce(fn, ms) {
  let t = null, args = null;
  const f = (...a) => { args = a; clearTimeout(t); t = setTimeout(() => { t = null; fn(...args); }, ms); };
  f.cancel = () => { clearTimeout(t); t = null; };
  f.flush = () => { if (t) { clearTimeout(t); t = null; fn(...(args || [])); } };
  f.pending = () => !!t;
  return f;
}
function rafThrottle(fn) {
  let queued = false;
  return () => { if (queued) return; queued = true; requestAnimationFrame(() => { queued = false; fn(); }); };
}

function lsGet(k, d = null) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }
function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }

/* ---------- colours ---------- */
function hexToRgb(hex) {
  let x = String(hex || '').trim().replace('#', '');
  if (x.length === 3) x = x.split('').map(c => c + c).join('');
  if (!/^[0-9a-f]{6}$/i.test(x)) return [128, 128, 128];
  return [parseInt(x.slice(0, 2), 16), parseInt(x.slice(2, 4), 16), parseInt(x.slice(4, 6), 16)];
}
const rgbToHex = (r, g, b) => '#' + [r, g, b].map(v => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('').toUpperCase();
/** mix(a, b, w): w of a, (1-w) of b */
function mix(a, b, w) {
  const A = hexToRgb(a), B = hexToRgb(b);
  return rgbToHex(A[0] * w + B[0] * (1 - w), A[1] * w + B[1] * (1 - w), A[2] * w + B[2] * (1 - w));
}
function luminance(hex) {
  const c = hexToRgb(hex).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
const isDarkColor = hex => luminance(hex) < 0.2;
const contrastText = hex => (luminance(hex) > 0.4 ? '#111111' : '#FFFFFF');
const validHex = v => /^#?[0-9a-f]{6}$/i.test(String(v || '').trim());
const normHex = v => { v = String(v || '').trim(); if (!v.startsWith('#')) v = '#' + v; return v.toUpperCase(); };

/* ---------- fuzzy matching (IntelliJ-ish) ---------- */
/** Returns {score, idx} or null. Rewards prefix, word starts, consecutive runs. */
function fuzzy(query, text) {
  if (!query) return { score: 0, idx: [] };
  const q = query.toLowerCase(), t = text.toLowerCase();
  // Fast path: contiguous substring
  const sub = t.indexOf(q);
  if (sub >= 0) {
    const idx = []; for (let i = 0; i < q.length; i++) idx.push(sub + i);
    let score = 100 - sub + (sub === 0 ? 60 : 0) + (sub > 0 && /[\s\-_./(]/.test(t[sub - 1]) ? 30 : 0) - (t.length - q.length) * 0.1;
    return { score, idx };
  }
  let ti = 0, score = 0, run = 0; const idx = [];
  for (let qi = 0; qi < q.length; qi++) {
    const ch = q[qi];
    if (ch === ' ') continue;
    let found = -1;
    // Prefer word-start matches
    for (let j = ti; j < t.length; j++) {
      if (t[j] === ch && (j === 0 || /[\s\-_./(]/.test(t[j - 1]) || (text[j] !== t[j] && text[j - 1] === t[j - 1]))) { found = j; break; }
    }
    if (found < 0) found = t.indexOf(ch, ti);
    if (found < 0) return null;
    const wordStart = found === 0 || /[\s\-_./(]/.test(t[found - 1]);
    if (idx.length && found === idx[idx.length - 1] + 1) { run++; score += 6 + run; } else { run = 0; score -= Math.min(found - ti, 8); }
    if (wordStart) score += 12;
    idx.push(found); ti = found + 1;
  }
  return { score: score - t.length * 0.05, idx };
}
function markIdx(text, idx) {
  if (!idx || !idx.length) return esc(text);
  const set = new Set(idx); let out = '', open = false;
  for (let i = 0; i < text.length; i++) {
    const m = set.has(i);
    if (m && !open) { out += '<b class="fz">'; open = true; }
    if (!m && open) { out += '</b>'; open = false; }
    out += esc(text[i]);
  }
  if (open) out += '</b>';
  return out;
}

/* ---------- dates ---------- */
function fmtDate(t, opts) { if (!t) return ''; return new Date(t).toLocaleDateString(undefined, opts || { day: 'numeric', month: 'short', year: 'numeric' }); }
function fmtDateTime(t) { if (!t) return ''; const d = new Date(t); return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) + ', ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }); }
function ago(t) {
  if (!t) return '';
  const s = (Date.now() - t) / 1000;
  if (s < 45) return 'just now';
  if (s < 3600) return Math.round(s / 60) + ' min ago';
  if (s < 86400) return Math.round(s / 3600) + ' hr ago';
  if (s < 86400 * 7) return Math.round(s / 86400) + ' days ago';
  return fmtDate(t);
}
function fmtDuration(sec, withHours) {
  sec = Math.max(0, Math.floor(sec));
  const hh = Math.floor(sec / 3600), mm = Math.floor((sec % 3600) / 60), ss = sec % 60;
  const p = n => String(n).padStart(2, '0');
  return (hh || withHours) ? `${hh}:${p(mm)}:${p(ss)}` : `${p(mm)}:${p(ss)}`;
}

/* ---------- keys ---------- */
const KEY_NAMES = { ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right', ' ': 'Space', Escape: 'Esc' };
const CODE_KEYS = { Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']', Backslash: '\\', Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/', Backquote: '`', Space: 'Space', NumpadAdd: '+', NumpadSubtract: '-' };
/** Normalised combo for a keyboard event, e.g. "Ctrl+Shift+F" (Mod is resolved to Ctrl/Meta). */
function comboFromEvent(e) {
  let key;
  if (/^Key[A-Z]$/.test(e.code)) key = e.code.slice(3);
  else if (/^Digit\d$/.test(e.code)) key = e.code.slice(5);
  else if (/^Numpad\d$/.test(e.code)) key = e.code.slice(6);
  else if (CODE_KEYS[e.code]) key = CODE_KEYS[e.code];
  else key = KEY_NAMES[e.key] || e.key;
  if (!key || ['Control', 'Shift', 'Alt', 'Meta', 'AltGraph', 'CapsLock'].includes(key)) return null;
  if (key.length === 1) key = key.toUpperCase();
  const parts = [];
  if (e.ctrlKey) parts.push('Ctrl');
  if (e.metaKey) parts.push('Meta');
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey) parts.push('Shift');
  parts.push(key);
  return parts.join('+');
}
/** Resolve "Mod" to the platform key and order modifiers canonically. */
function normCombo(c) {
  if (!c) return c;
  if (c === 'Shift Shift') return c;
  const parts = c.split('+'); const key = parts.pop();
  const mods = new Set(parts.map(p => p === 'Mod' ? (IS_MAC ? 'Meta' : 'Ctrl') : p === 'Cmd' ? 'Meta' : p === 'Option' ? 'Alt' : p));
  const out = []; ['Ctrl', 'Meta', 'Alt', 'Shift'].forEach(m => { if (mods.has(m)) out.push(m); });
  out.push(key.length === 1 ? key.toUpperCase() : key);
  return out.join('+');
}
function fmtCombo(c) {
  if (!c) return '';
  if (c === 'Shift Shift') return IS_MAC ? '⇧⇧' : 'Double Shift';
  const n = normCombo(c); const parts = n.split('+'); const key = parts.pop();
  if (IS_MAC) {
    const sym = { Ctrl: '⌃', Alt: '⌥', Shift: '⇧', Meta: '⌘' };
    const ks = { Up: '↑', Down: '↓', Left: '←', Right: '→', Enter: '↩', Backspace: '⌫', Delete: '⌦', Esc: '⎋', Tab: '⇥', Space: 'Space' };
    return parts.map(p => sym[p]).join('') + (ks[key] || key);
  }
  const ks = { Up: '↑', Down: '↓', Left: '←', Right: '→' };
  return [...parts, ks[key] || key].join('+');
}

/* ---------- DOM text helpers ---------- */
function textWalker(root, filter) {
  return document.createTreeWalker(root, NodeFilter.SHOW_TEXT, filter ? { acceptNode: filter } : null);
}
function htmlToText(html) {
  const t = document.createElement('template'); t.innerHTML = html || '';
  return t.content.textContent || '';
}
function downloadName(s) { return String(s || 'untitled').replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim().slice(0, 120) || 'untitled'; }
function wordCount(text) { return (String(text).match(/[\p{L}\p{N}][\p{L}\p{N}'’_-]*/gu) || []).length; }
