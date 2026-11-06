'use strict';
/* ============================================================
   UI components: menus, dialogs, balloons, tooltips, list popups
   ============================================================ */

/* ---------------- Popup menus (with submenus) ---------------- */
const Menu = {
  stack: [],
  open(items, pos, opts = {}) {
    if (!opts.sub) this.closeAll();
    const list = (typeof items === 'function' ? items() : items).filter(Boolean);
    const el = h('div.menu' + (opts.cls ? '.' + opts.cls : ''), { role: 'menu' });
    const m = { el, items: [], index: -1, opts, parent: opts.parent || null, child: null, subTimer: null };
    let lastSep = true;
    list.forEach(it => {
      if (it === '-' || it.sep) { if (!lastSep) { el.appendChild(h('div.msep')); lastSep = true; } return; }
      lastSep = false;
      const act = it.action ? Actions.get(it.action) : null;
      const label = it.label || (act && act.name) || '';
      const checked = it.checked != null ? (typeof it.checked === 'function' ? it.checked() : it.checked) : (act && act.toggle ? act.toggle() : null);
      const disabled = it.disabled != null ? (typeof it.disabled === 'function' ? it.disabled() : it.disabled) : (act && act.enabled ? !act.enabled() : false);
      const sc = it.hint != null ? it.hint : (act ? fmtCombo(Keymap.first(act.id)) : '');
      const ic = it.icon || (act && act.icon) || null;
      const row = h('div.mi' + (disabled ? '.disabled' : '') + (it.danger ? '.danger' : '') + (it.sub ? '.has-sub' : ''), { role: 'menuitem' },
        h('span.mi-ic', { html: checked === true ? icon('check') : (ic ? icon(ic) : '') }),
        h('span.mi-l', { html: it.html || esc(label) }),
        it.sub ? h('span.mi-sub', { html: icon('chevronRight') }) : h('span.mi-k', sc || ''));
      if (it.color) row.querySelector('.mi-ic').innerHTML = `<span class="swatch" style="background:${it.color}"></span>`;
      const entry = { it, row, act, disabled };
      m.items.push(entry);
      row.addEventListener('mouseenter', () => { this.highlight(m, m.items.indexOf(entry)); clearTimeout(m.subTimer); m.subTimer = setTimeout(() => { if (it.sub) this.openSub(m, entry); else this.closeChild(m); }, it.sub ? 110 : 160); });
      row.addEventListener('mousedown', e => e.preventDefault());
      row.addEventListener('click', e => { e.stopPropagation(); this.activate(m, entry); });
      el.appendChild(row);
    });
    if (!m.items.length) el.appendChild(h('div.mi.disabled', h('span.mi-ic'), h('span.mi-l', 'Nothing here'), h('span.mi-k')));
    document.body.appendChild(el);
    this.position(el, pos, opts);
    this.stack.push(m);
    if (opts.sub && m.parent) m.parent.child = m;
    if (opts.select !== false && opts.keyboard) this.highlight(m, this.nextIndex(m, -1, 1));
    requestAnimationFrame(() => el.classList.add('show'));
    return m;
  },
  position(el, pos, opts) {
    const vw = innerWidth, vh = innerHeight; const r = el.getBoundingClientRect();
    let x, y;
    if (pos.rect) {
      const a = pos.rect;
      if (opts.sub) { x = a.right - 2; y = a.top - 5; if (x + r.width > vw - 4) x = a.left - r.width + 2; }
      else { x = pos.alignRight ? a.right - r.width : a.left; y = a.bottom + 3; if (y + r.height > vh - 4 && a.top - r.height - 3 > 0) y = a.top - r.height - 3; }
    } else { x = pos.x; y = pos.y; if (x + r.width > vw - 4) x = Math.max(4, vw - r.width - 4); }
    if (y + r.height > vh - 4) y = Math.max(4, vh - r.height - 4);
    el.style.left = Math.max(4, x) + 'px'; el.style.top = Math.max(4, y) + 'px';
  },
  nextIndex(m, from, dir) {
    const n = m.items.length; if (!n) return -1;
    for (let k = 1; k <= n; k++) { const i = (from + dir * k + n * 4) % n; if (!m.items[i].disabled) return i; }
    return -1;
  },
  highlight(m, i) {
    m.items.forEach((e, j) => e.row.classList.toggle('hl', j === i));
    m.index = i;
    if (i >= 0) m.items[i].row.scrollIntoView({ block: 'nearest' });
  },
  openSub(m, entry) {
    if (m.child && m.child.entry === entry) return;
    this.closeChild(m);
    if (entry.disabled) return;
    const sub = this.open(entry.it.sub, { rect: entry.row.getBoundingClientRect() }, { sub: true, parent: m, onPick: m.opts.onPick });
    sub.entry = entry;
  },
  closeChild(m) {
    if (!m.child) return;
    const c = m.child; this.closeChild(c);
    c.el.remove(); this.stack = this.stack.filter(x => x !== c); m.child = null;
  },
  activate(m, entry) {
    if (!entry || entry.disabled) return;
    if (entry.it.sub) { this.openSub(m, entry); const c = m.child; if (c) this.highlight(c, this.nextIndex(c, -1, 1)); return; }
    const root = this.stack[0];
    this.closeAll();
    const fn = entry.it.run || (entry.act ? () => Actions.run(entry.act.id) : null);
    if (fn) setTimeout(fn, 0);
    if (root && root.opts.onPick) root.opts.onPick(entry.it);
  },
  closeAll() {
    const root = this.stack[0];
    this.stack.forEach(m => { clearTimeout(m.subTimer); m.el.remove(); });
    this.stack = [];
    if (root && root.opts.onClose) root.opts.onClose();
  },
  get isOpen() { return this.stack.length > 0; },
  handleKey(e) {
    if (!this.stack.length) return false;
    const m = this.stack[this.stack.length - 1];
    const k = e.key;
    if (k === 'ArrowDown') this.highlight(m, this.nextIndex(m, m.index, 1));
    else if (k === 'ArrowUp') this.highlight(m, this.nextIndex(m, m.index < 0 ? 0 : m.index, -1));
    else if (k === 'ArrowRight') {
      const en = m.items[m.index];
      if (en && en.it.sub) this.activate(m, en);
      else if (this.stack[0].opts.onArrow) this.stack[0].opts.onArrow(1);
    } else if (k === 'ArrowLeft') {
      if (m.parent) { const p = m.parent; this.closeChild(p); } else if (m.opts.onArrow) m.opts.onArrow(-1);
    } else if (k === 'Enter' || k === ' ') { if (m.index >= 0) this.activate(m, m.items[m.index]); }
    else if (k === 'Escape') { if (m.parent) this.closeChild(m.parent); else this.closeAll(); }
    else if (k === 'Tab') { this.closeAll(); return false; }
    else if (k.length === 1 && /\S/.test(k) && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const lower = k.toLowerCase(); const n = m.items.length;
      for (let s = 1; s <= n; s++) { const i = (m.index + s) % n; const lbl = m.items[i].row.querySelector('.mi-l').textContent.trim().toLowerCase(); if (!m.items[i].disabled && lbl.startsWith(lower)) { this.highlight(m, i); break; } }
    } else return false;
    e.preventDefault(); e.stopPropagation();
    return true;
  },
};
document.addEventListener('mousedown', e => { if (Menu.isOpen && !e.target.closest('.menu') && !e.target.closest('.menubar-item.open')) Menu.closeAll(); }, true);
window.addEventListener('blur', () => { if (Menu.isOpen) Menu.closeAll(); });
window.addEventListener('resize', () => { if (Menu.isOpen) Menu.closeAll(); });

/* ---------------- Dialogs ---------------- */
const Dialog = {
  stack: [],
  open({ title, body, buttons = [], width = 440, cls = '', onClose, footerLeft, noClose }) {
    const ov = h('div.dlg-ov' + (cls ? '.' + cls + '-ov' : ''));
    const head = h('div.dlg-h', h('span.dlg-t', title || ''), noClose ? null : h('button.ibtn.dlg-x', { html: icon('close'), title: 'Close', onclick: () => api.close(null) }));
    const foot = h('div.dlg-f', h('div.dlg-fl', footerLeft || null), h('div.dlg-fr'));
    const box = h('div.dlg' + (cls ? '.' + cls : ''), { style: { width: typeof width === 'number' ? width + 'px' : width }, role: 'dialog' }, head, h('div.dlg-b', body), buttons.length ? foot : null);
    ov.appendChild(box);
    const api = {
      el: box, ov, result: undefined,
      close: (v) => { if (api.closed) return; api.closed = true; ov.classList.remove('show'); setTimeout(() => ov.remove(), 120); this.stack = this.stack.filter(x => x !== api); if (onClose) onClose(v); },
      buttons: {},
    };
    buttons.forEach(b => {
      const btn = h('button.btn' + (b.primary ? '.primary' : '') + (b.danger ? '.danger' : ''), { onclick: async () => { const r = b.run ? await b.run(api) : undefined; if (r !== false) api.close(b.value !== undefined ? b.value : r); } }, b.label);
      if (b.disabled) btn.disabled = true;
      api.buttons[b.id || b.label] = btn;
      foot.querySelector('.dlg-fr').appendChild(btn);
    });
    ov.addEventListener('mousedown', e => { if (e.target === ov && !noClose) api.close(null); });
    // drag by header
    head.addEventListener('pointerdown', e => {
      if (e.target.closest('button')) return;
      const r = box.getBoundingClientRect(); const ox = e.clientX - r.left, oy = e.clientY - r.top;
      box.style.position = 'fixed'; box.style.margin = '0'; box.style.left = r.left + 'px'; box.style.top = r.top + 'px';
      const mv = ev => { box.style.left = clamp(ev.clientX - ox, 0, innerWidth - 80) + 'px'; box.style.top = clamp(ev.clientY - oy, 0, innerHeight - 40) + 'px'; };
      const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); };
      addEventListener('pointermove', mv); addEventListener('pointerup', up);
    });
    api.primary = () => { const b = buttons.find(x => x.primary); if (b) api.buttons[b.id || b.label].click(); };
    document.body.appendChild(ov);
    this.stack.push(api);
    requestAnimationFrame(() => { ov.classList.add('show'); const f = box.querySelector('[autofocus], input:not([type=checkbox]):not([type=color]), select, textarea') || box.querySelector('.btn.primary'); if (f) { f.focus(); if (f.select && f.tagName === 'INPUT') f.select(); } });
    return api;
  },
  get top() { return this.stack[this.stack.length - 1] || null; },
  handleKey(e) {
    const d = this.top; if (!d) return false;
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); d.close(null); return true; }
    if (e.key === 'Enter' && !e.shiftKey && !(e.target && (e.target.tagName === 'TEXTAREA' || e.target.closest('.no-enter')))) {
      if (e.target && e.target.tagName === 'BUTTON' && !e.target.classList.contains('primary')) return false;
      e.preventDefault(); d.primary(); return true;
    }
    return false;
  },
  prompt({ title, label, value = '', placeholder = '', okText = 'OK', validate }) {
    return new Promise(res => {
      const input = h('input.field', { value, placeholder, spellcheck: 'false', autocomplete: 'off' });
      const err = h('div.dlg-err');
      const body = h('div', label ? h('label.dlg-label', label) : null, input, err);
      const d = this.open({ title, body, onClose: v => res(v == null ? null : v), buttons: [
        { label: 'Cancel', value: null },
        { label: okText, primary: true, run: () => { const v = input.value.trim(); const msg = !v ? 'Please enter a name' : validate ? validate(v) : ''; if (msg) { err.textContent = msg; input.focus(); return false; } return v; } },
      ] });
      input.addEventListener('input', () => err.textContent = '');
      return d;
    });
  },
  confirm({ title, message, okText = 'OK', danger = false, cancelText = 'Cancel' }) {
    return new Promise(res => {
      this.open({ title, width: 420, body: h('div.dlg-msg', h('span.dlg-msg-ic', { html: icon(danger ? 'warning' : 'help', danger ? 'c-orange' : 'c-blue', 32) }), h('div', message)), onClose: v => res(!!v), buttons: [
        { label: cancelText, value: false }, { label: okText, primary: true, danger, value: true },
      ] });
    });
  },
  choose({ title, label, options, value, okText = 'OK' }) {
    return new Promise(res => {
      const sel = h('select.field', options.map(([v, l]) => h('option', { value: v, selected: v === value ? true : null }, l)));
      this.open({ title, body: h('div', label ? h('label.dlg-label', label) : null, sel), onClose: v => res(v == null ? null : v), buttons: [{ label: 'Cancel', value: null }, { label: okText, primary: true, run: () => sel.value }] });
    });
  },
};

/* ---------------- Balloon notifications ---------------- */
const Notify = {
  log: [],
  show({ title = '', text = '', type = 'info', actions = [], timeout = 6000 } = {}) {
    const entry = { id: uid('nt'), title, text, type, time: Date.now(), read: false };
    this.log.unshift(entry); if (this.log.length > 100) this.log.pop();
    let wrap = $('#balloons'); if (!wrap) { wrap = h('div#balloons'); document.body.appendChild(wrap); }
    const ic = { info: 'info', warning: 'warning', error: 'error', success: 'success' }[type] || 'info';
    const b = h('div.balloon.' + type,
      h('span.bl-ic', { html: icon(ic, 'c-' + ({ info: 'blue', warning: 'orange', error: 'red', success: 'green' }[type])) }),
      h('div.bl-body', title ? h('div.bl-t', title) : null, text ? h('div.bl-x', text) : null,
        actions.length ? h('div.bl-acts', actions.map(a => h('button.linkbtn', { onclick: () => { close(); a.run(); } }, a.label))) : null),
      h('button.ibtn.sm.bl-close', { html: icon('closeSmall'), onclick: () => close() }));
    const close = () => { b.classList.remove('show'); setTimeout(() => b.remove(), 180); };
    wrap.appendChild(b);
    requestAnimationFrame(() => b.classList.add('show'));
    if (timeout) { let t = setTimeout(close, timeout); b.addEventListener('mouseenter', () => clearTimeout(t)); b.addEventListener('mouseleave', () => { t = setTimeout(close, 2500); }); }
    if (typeof App !== 'undefined') App.onNotify(entry);
    return close;
  },
};
const notify = (title, text, type, extra) => Notify.show({ title, text, type, ...(extra || {}) });

/* ---------------- Tooltips ---------------- */
const Tip = {
  el: null, timer: null, target: null,
  init() {
    this.el = h('div#tooltip'); document.body.appendChild(this.el);
    document.addEventListener('mouseover', e => {
      const t = e.target.closest && e.target.closest('[data-tip]');
      if (t === this.target) return;
      this.hide(); if (!t) return;
      this.target = t;
      this.timer = setTimeout(() => this.show(t), 550);
    });
    document.addEventListener('mousedown', () => this.hide(), true);
    document.addEventListener('wheel', () => this.hide(), { passive: true, capture: true });
  },
  show(t) {
    if (!t.isConnected) return;
    const a = t.dataset.tipAction ? Actions.get(t.dataset.tipAction) : null;
    const k = a ? fmtCombo(Keymap.first(a.id)) : (t.dataset.tipKey || '');
    this.el.innerHTML = esc(t.dataset.tip) + (k ? `<span class="tt-k">${esc(k)}</span>` : '');
    this.el.style.display = 'block';
    const r = t.getBoundingClientRect(), w = this.el.offsetWidth, hh = this.el.offsetHeight;
    let x = r.left + r.width / 2 - w / 2, y = r.bottom + 6;
    if (y + hh > innerHeight - 4) y = r.top - hh - 6;
    if (t.closest('.stripe')) { x = t.closest('.stripe.right') ? r.left - w - 8 : r.right + 8; y = r.top + r.height / 2 - hh / 2; }
    this.el.style.left = clamp(x, 4, innerWidth - w - 4) + 'px'; this.el.style.top = clamp(y, 4, innerHeight - hh - 4) + 'px';
    this.el.classList.add('show');
  },
  hide() { clearTimeout(this.timer); this.target = null; if (this.el) { this.el.classList.remove('show'); this.el.style.display = 'none'; } },
};

/* ---------------- List popup (completion / switchers) ---------------- */
function ListPopup({ anchor, items, render, onPick, onClose, width = 320, cls = '', empty = 'No matches', header }) {
  const el = h('div.lpop' + (cls ? '.' + cls : ''), { style: { width: width + 'px' } });
  const head = header ? h('div.lpop-h', header) : null;
  const list = h('div.lpop-list');
  if (head) el.appendChild(head);
  el.appendChild(list);
  document.body.appendChild(el);
  const api = {
    el, items: [], index: 0, closed: false,
    update(newItems) {
      this.items = newItems || []; this.index = Math.min(this.index, Math.max(0, this.items.length - 1));
      list.innerHTML = '';
      if (!this.items.length) { list.appendChild(h('div.lpop-empty', empty)); return; }
      this.items.forEach((it, i) => {
        const row = h('div.lpop-row' + (i === this.index ? '.hl' : ''), { html: render(it) });
        row.addEventListener('mousedown', e => { e.preventDefault(); this.index = i; this.pick(); });
        row.addEventListener('mousemove', () => { if (this.index !== i) { this.index = i; this.paint(); } });
        list.appendChild(row);
      });
      this.place();
    },
    paint() { [...list.children].forEach((r, i) => r.classList.toggle('hl', i === this.index)); const c = list.children[this.index]; if (c) c.scrollIntoView({ block: 'nearest' }); },
    move(d) { if (!this.items.length) return; this.index = (this.index + d + this.items.length) % this.items.length; this.paint(); },
    pick() { const it = this.items[this.index]; if (!it) return; this.close(true); onPick && onPick(it); },
    close(picked) { if (this.closed) return; this.closed = true; el.remove(); onClose && onClose(picked); },
    place(a) {
      if (a) anchor = a;
      const r = el.getBoundingClientRect(); let x = anchor.x, y = anchor.y + (anchor.h || 0) + 4;
      if (y + r.height > innerHeight - 6) y = Math.max(6, anchor.y - r.height - 4);
      if (x + r.width > innerWidth - 6) x = innerWidth - r.width - 6;
      el.style.left = Math.max(6, x) + 'px'; el.style.top = y + 'px';
    },
    handleKey(e) {
      if (e.key === 'ArrowDown') { this.move(1); }
      else if (e.key === 'ArrowUp') { this.move(-1); }
      else if (e.key === 'Enter' || e.key === 'Tab') { if (!this.items.length) { this.close(); return false; } this.pick(); }
      else if (e.key === 'Escape') { this.close(); }
      else return false;
      e.preventDefault(); e.stopPropagation(); return true;
    },
  };
  api.update(items);
  return api;
}

/* ---------------- Small form helpers (settings, dialogs) ---------------- */
function toggleSwitch(on, onChange) {
  const el = h('button.switch' + (on ? '.on' : ''), { role: 'switch', 'aria-checked': String(!!on), type: 'button' });
  el.addEventListener('click', () => { const v = !el.classList.contains('on'); el.classList.toggle('on', v); el.setAttribute('aria-checked', String(v)); onChange(v); });
  return el;
}
function checkbox(label, on, onChange, hint) {
  const input = h('input', { type: 'checkbox' }); input.checked = !!on;
  input.addEventListener('change', () => onChange(input.checked));
  return h('label.cb', input, h('span.cb-box', { html: icon('check') }), h('span.cb-l', label), hint ? h('span.cb-hint', hint) : null);
}
function selectBox(options, value, onChange, cls) {
  const s = h('select.field' + (cls ? '.' + cls : ''), options.map(([v, l]) => h('option', { value: v }, l)));
  s.value = value; s.addEventListener('change', () => onChange(s.value));
  return s;
}
function numberField(value, { min, max, step = 1, suffix } = {}, onChange) {
  const i = h('input.field.num', { type: 'number', value, min, max, step });
  i.addEventListener('change', () => { let v = parseFloat(i.value); if (isNaN(v)) v = value; v = clamp(v, min ?? -Infinity, max ?? Infinity); i.value = v; onChange(v); });
  return suffix ? h('span.numwrap', i, h('span.suffix', suffix)) : i;
}
