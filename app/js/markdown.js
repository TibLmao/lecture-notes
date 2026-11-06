'use strict';
/* ============================================================
   Markdown ⇄ note HTML, and paste sanitising.
   Export is Obsidian-compatible (callouts, [[links]], $math$).
   ============================================================ */
const CALLOUTS = {
  note: ['Note', 'pencil', 'blue'], info: ['Info', 'info', 'blue'], tip: ['Tip', 'bulb', 'green'],
  important: ['Important', 'alert', 'purple'], warning: ['Warning', 'warning', 'orange'], danger: ['Danger', 'error', 'red'],
  definition: ['Definition', 'book', 'cyan'], theorem: ['Theorem', 'theorem', 'purple'], proof: ['Proof', 'proof', 'blue'],
  example: ['Example', 'flask', 'yellow'], question: ['Question', 'help', 'orange'], summary: ['Summary', 'clipboard', 'green'],
};
const CALLOUT_ALIASES = { abstract: 'summary', tldr: 'summary', hint: 'tip', caution: 'warning', attention: 'warning', error: 'danger', bug: 'danger', faq: 'question', help: 'question', success: 'tip', check: 'tip', done: 'tip', todo: 'note', quote: 'note', cite: 'note', failure: 'danger', fail: 'danger', missing: 'danger', lemma: 'theorem', corollary: 'theorem', def: 'definition' };
const normCallout = t => { t = String(t || '').toLowerCase().trim(); t = CALLOUT_ALIASES[t] || t; return CALLOUTS[t] ? t : 'note'; };

/* ------------------------- HTML → Markdown ------------------------- */
function htmlToMd(html, opts = {}) {
  const wrap = document.createElement('div'); wrap.innerHTML = html || '';
  return blocksToMd(wrap, opts).replace(/\n{3,}/g, '\n\n').trim() + '\n';
}
function mdEscape(s) { return s.replace(/\\/g, '\\\\').replace(/([*_`])/g, '\\$1').replace(/^(\s*)([#>]|\d+\.)(\s)/, '$1\\$2$3').replace(/^(\s*)([-+])(\s)/, '$1\\$2$3'); }
function inlineMd(node, opts) {
  let s = '';
  for (const c of node.childNodes) {
    if (c.nodeType === 3) { s += mdEscape(c.textContent.replace(/\u200b/g, '').replace(/\u00a0/g, ' ')); continue; }
    if (c.nodeType !== 1) continue;
    const t = c.tagName, cl = c.classList;
    if (cl.contains('co-head')) continue;
    if (t === 'UL' || t === 'OL') continue;
    if (cl.contains('math')) { s += '$' + (c.dataset.tex || '') + '$'; continue; }
    if (cl.contains('wikilink')) { const n = S.notes[c.dataset.note]; const title = n ? n.title : (c.dataset.title || c.textContent); s += '[[' + title + ']]'; continue; }
    if (cl.contains('ts')) { s += '[' + c.textContent + ']'; continue; }
    const inner = () => inlineMd(c, opts);
    const wrapIt = (mk, mk2) => { const x = inner(); if (!x.trim()) return x; const lead = x.match(/^\s*/)[0], trail = x.match(/\s*$/)[0]; return lead + mk + x.trim() + (mk2 || mk) + trail; };
    if (t === 'STRONG' || t === 'B') s += wrapIt('**');
    else if (t === 'EM' || t === 'I') s += wrapIt('*');
    else if (t === 'S' || t === 'DEL' || t === 'STRIKE') s += wrapIt('~~');
    else if (t === 'U') s += wrapIt('<u>', '</u>');
    else if (t === 'MARK' || (t === 'SPAN' && c.style.backgroundColor)) s += wrapIt('==');
    else if (t === 'SUB' || t === 'SUP') s += `<${t.toLowerCase()}>${inner()}</${t.toLowerCase()}>`;
    else if (t === 'CODE') { const x = c.textContent.replace(/\u200b/g, ''); const ticks = x.includes('`') ? '``' : '`'; s += ticks + (ticks.length > 1 ? ' ' : '') + x + (ticks.length > 1 ? ' ' : '') + ticks; }
    else if (t === 'A') { const href = c.getAttribute('href') || ''; s += href ? `[${inner()}](${href})` : inner(); }
    else if (t === 'BR') s += '  \n';
    else s += inner();
  }
  return s;
}
function listMd(list, indent, opts) {
  const out = []; let i = 0;
  const ordered = list.tagName === 'OL', task = list.classList.contains('checklist');
  for (const li of list.children) {
    if (li.tagName !== 'LI') continue;
    i++;
    const marker = ordered ? `${i}.` : '-';
    const box = task ? (li.classList.contains('done') ? '[x] ' : '[ ] ') : '';
    out.push(indent + marker + ' ' + box + inlineMd(li, opts).trim());
    for (const sub of li.children) if (sub.tagName === 'UL' || sub.tagName === 'OL') out.push(listMd(sub, indent + ' '.repeat(marker.length + 1), opts));
  }
  return out.join('\n');
}
function blocksToMd(container, opts) {
  const out = [];
  for (const b of container.children) {
    const t = b.tagName, cl = b.classList;
    if (cl.contains('co-head')) continue;
    if (/^H[1-6]$/.test(t)) out.push('#'.repeat(+t[1]) + ' ' + inlineMd(b, opts).trim());
    else if (t === 'P' || t === 'DIV' && !cl.contains('math-block')) { const x = inlineMd(b, opts).replace(/\s+$/, ''); out.push(x); }
    else if (t === 'UL' || t === 'OL') out.push(listMd(b, '', opts));
    else if (t === 'BLOCKQUOTE') {
      const inner = blocksToMd(b, opts) || inlineMd(b, opts);
      const lines = inner.split('\n');
      if (cl.contains('callout')) {
        const type = b.dataset.type || 'note'; const title = b.dataset.title || '';
        out.push(`> [!${type}]${title ? ' ' + title : ''}\n` + lines.map(l => '> ' + l).join('\n').replace(/> $/gm, '>'));
      } else out.push(lines.map(l => '> ' + l).join('\n').replace(/> $/gm, '>'));
    }
    else if (t === 'PRE') { const code = b.textContent.replace(/\n$/, ''); const fence = code.includes('```') ? '````' : '```'; out.push(fence + (b.dataset.lang || '') + '\n' + code + '\n' + fence); }
    else if (t === 'TABLE') {
      const rows = [...b.querySelectorAll('tr')].map(tr => [...tr.children].map(c => inlineMd(c, opts).replace(/\|/g, '\\|').replace(/\n/g, ' ').trim()));
      if (rows.length) {
        const w = Math.max(...rows.map(r => r.length));
        rows.forEach(r => { while (r.length < w) r.push(''); });
        out.push(['| ' + rows[0].join(' | ') + ' |', '|' + rows[0].map(() => ' --- ').join('|') + '|', ...rows.slice(1).map(r => '| ' + r.join(' | ') + ' |')].join('\n'));
      }
    }
    else if (t === 'HR') out.push('---');
    else if (t === 'FIGURE') {
      const img = b.querySelector('img'); if (!img) continue;
      let src = img.getAttribute('src') || '';
      if (opts.imageSrc) src = opts.imageSrc(img) || src;
      const cap = b.dataset.caption || '';
      const w = img.style.width;
      out.push(w ? `<img src="${src}" alt="${esc(cap)}" width="${w}">` : `![${cap.replace(/[\[\]]/g, '')}](${src.replace(/ /g, '%20')})`);
    }
    else if (cl.contains('math-block')) out.push('$$\n' + (b.dataset.tex || '') + '\n$$');
    else { const x = inlineMd(b, opts); if (x.trim()) out.push(x); }
  }
  return out.join('\n\n');
}

/* ------------------------- Markdown → HTML ------------------------- */
const RE = {
  fence: /^(\s*)(`{3,}|~{3,})\s*([\w#+.-]*)\s*$/,
  heading: /^(#{1,6})\s+(.*?)\s*#*\s*$/,
  hr: /^\s{0,3}([-*_])(\s*\1){2,}\s*$/,
  quote: /^\s{0,3}>\s?/,
  item: /^(\s*)([-*+]|\d+[.)])\s+(.*)$/,
  tableSep: /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/,
  img: /^!\[([^\]]*)\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)\s*$/,
  htmlImg: /^<img\s[^>]*src="([^"]+)"[^>]*>\s*$/i,
};
function mdToHtml(md) {
  const lines = String(md || '').replace(/\r\n?/g, '\n').replace(/\t/g, '    ').split('\n');
  return mdBlocks(lines);
}
function isBlockStart(line, next) {
  return RE.fence.test(line) || RE.heading.test(line) || RE.hr.test(line) || RE.quote.test(line) || RE.item.test(line) || /^\s*\$\$/.test(line) || (line.includes('|') && next != null && RE.tableSep.test(next));
}
function mdBlocks(lines) {
  const out = []; let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    let m;
    if ((m = line.match(RE.fence))) {
      const fence = m[2]; const lang = m[3]; const code = []; i++;
      while (i < lines.length && !lines[i].trim().startsWith(fence)) { code.push(lines[i]); i++; }
      i++;
      out.push(`<pre${lang ? ` data-lang="${esc(lang.toLowerCase())}"` : ''}><code>${esc(code.join('\n'))}\n</code></pre>`);
      continue;
    }
    if (/^\s*\$\$/.test(line)) {
      const one = line.trim().match(/^\$\$(.+)\$\$$/);
      let tex;
      if (one) { tex = one[1]; i++; }
      else { const buf = [line.trim().slice(2)]; i++; while (i < lines.length && !lines[i].trim().endsWith('$$')) { buf.push(lines[i]); i++; } if (i < lines.length) { buf.push(lines[i].trim().slice(0, -2)); i++; } tex = buf.join('\n').trim(); }
      out.push(`<div class="math-block" data-tex="${esc(tex)}" contenteditable="false"></div>`);
      continue;
    }
    if ((m = line.match(RE.heading))) { const lv = Math.min(3, m[1].length); out.push(`<h${lv}>${mdInline(m[2])}</h${lv}>`); i++; continue; }
    if (RE.hr.test(line)) { out.push('<hr>'); i++; continue; }
    if (line.includes('|') && i + 1 < lines.length && RE.tableSep.test(lines[i + 1])) {
      const cells = l => { let s = l.trim(); if (s.startsWith('|')) s = s.slice(1); if (s.endsWith('|') && !s.endsWith('\\|')) s = s.slice(0, -1); return s.split(/(?<!\\)\|/).map(c => c.trim().replace(/\\\|/g, '|')); };
      const head = cells(line); i += 2; const rows = [];
      while (i < lines.length && lines[i].includes('|') && lines[i].trim()) { rows.push(cells(lines[i])); i++; }
      out.push('<table><tbody><tr>' + head.map(c => `<th>${mdInline(c) || '<br>'}</th>`).join('') + '</tr>' + rows.map(r => '<tr>' + head.map((_, k) => `<td>${mdInline(r[k] || '') || '<br>'}</td>`).join('') + '</tr>').join('') + '</tbody></table>');
      continue;
    }
    if (RE.quote.test(line)) {
      const buf = [];
      while (i < lines.length && (RE.quote.test(lines[i]) || (lines[i].trim() && buf.length && !isBlockStart(lines[i], lines[i + 1]) && !/^\s*$/.test(lines[i - 1] || '')))) { buf.push(lines[i].replace(RE.quote, '')); i++; }
      const cm = buf[0] && buf[0].match(/^\[!(\w+)\][+-]?\s*(.*)$/);
      if (cm) {
        const type = normCallout(cm[1]); const title = cm[2].trim();
        const inner = mdBlocks(buf.slice(1)) || '<p><br></p>';
        out.push(`<blockquote class="callout" data-type="${type}"${title ? ` data-title="${esc(title)}"` : ''}>${inner}</blockquote>`);
      } else out.push(`<blockquote>${mdBlocks(buf) || '<p><br></p>'}</blockquote>`);
      continue;
    }
    if (RE.item.test(line)) { const r = mdList(lines, i); out.push(r.html); i = r.i; continue; }
    if ((m = line.trim().match(RE.img)) || (m = line.trim().match(RE.htmlImg))) {
      const src = m[2] || m[1]; const cap = m[2] ? m[1] : ((line.match(/alt="([^"]*)"/) || [])[1] || '');
      const w = (line.match(/width="(\d+%?)"/) || [])[1];
      if (/^(data:|blob:|lnimg:|https?:|file:)/i.test(src) || IS_DESKTOP) out.push(`<figure class="img" contenteditable="false"${cap ? ` data-caption="${esc(cap)}"` : ''}><img src="${esc(src)}" alt=""${w ? ` style="width:${/%$/.test(w) ? w : w + 'px'}"` : ''}></figure>`);
      i++; continue;
    }
    // paragraph
    const buf = [line]; i++;
    while (i < lines.length && lines[i].trim() && !isBlockStart(lines[i], lines[i + 1])) { buf.push(lines[i]); i++; }
    out.push('<p>' + buf.map((l, k) => mdInline(l.replace(/\s+$/, '')) + (k < buf.length - 1 ? (/( {2,}|\\)$/.test(l) ? '<br>' : ' ') : '')).join('') + '</p>');
  }
  return out.join('');
}
function mdList(lines, start) {
  const indentOf = l => (l.match(/^\s*/) || [''])[0].length;
  const base = indentOf(lines[start]);
  const first = lines[start].match(RE.item);
  const ordered = /\d/.test(first[2]);
  const items = []; let i = start;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      let j = i + 1; while (j < lines.length && !lines[j].trim()) j++;
      const nm = j < lines.length && lines[j].match(RE.item);
      if (nm && indentOf(lines[j]) >= base && (indentOf(lines[j]) > base || /\d/.test(nm[2]) === ordered)) { i = j; continue; }
      break;
    }
    const m = line.match(RE.item);
    const ind = indentOf(line);
    if (!m) { if (ind > base && items.length) { items[items.length - 1].text += ' ' + line.trim(); i++; continue; } break; }
    if (ind < base) break;
    if (ind > base) { if (!items.length) break; const r = mdList(lines, i); items[items.length - 1].kids.push(r.html); i = r.i; continue; }
    if (/\d/.test(m[2]) !== ordered) break;
    let text = m[3], task = null;
    const tm = text.match(/^\[( |x|X)\]\s+(.*)$/) || text.match(/^\[( |x|X)\]$/);
    if (tm) { task = tm[1].toLowerCase() === 'x'; text = tm[2] || ''; }
    items.push({ text, task, kids: [] }); i++;
  }
  const isTask = items.some(it => it.task !== null);
  const tag = ordered && !isTask ? 'ol' : 'ul';
  const html = `<${tag}${isTask ? ' class="checklist"' : ''}>` + items.map(it => `<li${it.task ? ' class="done"' : ''}>${mdInline(it.text) || '<br>'}${it.kids.join('')}</li>`).join('') + `</${tag}>`;
  return { html, i };
}
function mdInline(src) {
  const slots = [];
  const put = html => { slots.push(html); return `\u0000${slots.length - 1}\u0000`; };
  let s = String(src);
  // escapes
  s = s.replace(/\\([\\`*_{}\[\]()#+\-.!|$=~>])/g, (_, c) => put(esc(c)));
  // code spans
  s = s.replace(/(`+)\s?([\s\S]*?[^`])\s?\1(?!`)/g, (_, t, code) => put(`<code>${esc(code)}</code>`));
  // inline math (not $$, not currency like "$5 and $6")
  s = s.replace(/(^|[^\\$\w])\$(?!\s)([^$\n]+?)(?<!\s)\$(?![\w$])/g, (_, pre, tex) => pre + put(`<span class="math" data-tex="${esc(tex)}" contenteditable="false"></span>`));
  // wiki links [[Title]] or [[Title|alias]]
  s = s.replace(/\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]+))?\]\]/g, (_, title, alias) => {
    const n = noteByTitle(title);
    return put(n ? `<a class="wikilink" data-note="${n.id}" contenteditable="false">${esc(n.title)}</a>` : `<a class="wikilink broken" data-title="${esc(title.trim())}" contenteditable="false">${esc(alias || title.trim())}</a>`);
  });
  // timestamps [12:34] / [1:02:03]
  s = s.replace(/\[(\d{1,2}:\d{2}(?::\d{2})?)\]/g, (_, ts) => put(`<span class="ts" contenteditable="false">${ts}</span>`));
  // images inline → drop to alt text, links
  s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)[^)]*\)/g, (_, alt) => alt);
  s = s.replace(/\[([^\]]+)\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g, (_, text, href) => put(`<a href="${esc(href)}">`) + text + put('</a>'));
  s = s.replace(/<(https?:\/\/[^>\s]+)>/g, (_, u) => put(`<a href="${esc(u)}">${esc(u)}</a>`));
  // escape the rest, then allow a few inline tags back
  s = esc(s).replace(/&lt;(\/?)(u|sub|sup|mark|br\s*\/?)&gt;/gi, '<$1$2>');
  s = s.replace(/\*\*(?=\S)([\s\S]*?\S)\*\*/g, '<strong>$1</strong>').replace(/__(?=\S)([\s\S]*?\S)__/g, '<strong>$1</strong>');
  s = s.replace(/(^|[^*\w])\*(?=\S)([^*]*?\S)\*(?!\*)/g, '$1<em>$2</em>').replace(/(^|[^_\w])_(?=\S)([^_]*?\S)_(?!\w)/g, '$1<em>$2</em>');
  s = s.replace(/~~(?=\S)([\s\S]*?\S)~~/g, '<s>$1</s>');
  s = s.replace(/==(?=\S)([\s\S]*?\S)==/g, '<span class="hl">$1</span>');
  s = s.replace(/<mark>/g, '<span class="hl">').replace(/<\/mark>/g, '</span>');
  return s.replace(/\u0000(\d+)\u0000/g, (_, k) => slots[+k]).replace(/\u0000(\d+)\u0000/g, (_, k) => slots[+k]);
}
function looksLikeMarkdown(text) {
  const t = String(text || '');
  if (!t.includes('\n') && t.length < 200 && !/(\*\*|`|\[\[|\$)/.test(t)) return false;
  let score = 0;
  if (/^#{1,6}\s+\S/m.test(t)) score += 2;
  if (/^\s*```/m.test(t)) score += 3;
  if (/^\s*[-*+]\s+\S/m.test(t)) score += 1;
  if (/^\s*\d+[.)]\s+\S/m.test(t)) score += 1;
  if (/^\s*>\s?\S/m.test(t)) score += 1;
  if (/^\s*[-*]\s+\[[ xX]\]/m.test(t)) score += 2;
  if (/\*\*[^*\n]+\*\*/.test(t)) score += 1;
  if (/`[^`\n]+`/.test(t)) score += 1;
  if (/\[[^\]\n]+\]\([^)\n]+\)/.test(t)) score += 1;
  if (/^\|.+\|\s*$/m.test(t) && /^\s*\|?\s*:?-{2,}/m.test(t)) score += 2;
  if (/\$\$[\s\S]+?\$\$|\$[^$\s][^$\n]*\$/.test(t)) score += 1;
  return score >= 2;
}

/* ------------------------- Paste sanitiser ------------------------- */
const PASTE_MAP = { P: 'P', H1: 'H1', H2: 'H2', H3: 'H3', H4: 'H3', H5: 'H3', H6: 'H3', UL: 'UL', OL: 'OL', LI: 'LI', B: 'STRONG', STRONG: 'STRONG', I: 'EM', EM: 'EM', U: 'U', S: 'S', STRIKE: 'S', DEL: 'S', CODE: 'CODE', KBD: 'CODE', PRE: 'PRE', BLOCKQUOTE: 'BLOCKQUOTE', A: 'A', BR: 'BR', TABLE: 'TABLE', THEAD: 'TBODY', TBODY: 'TBODY', TFOOT: 'TBODY', TR: 'TR', TD: 'TD', TH: 'TH', HR: 'HR', DIV: 'P', SECTION: 'P', ARTICLE: 'P', HEADER: 'P', FOOTER: 'P', SUB: 'SUB', SUP: 'SUP', MARK: 'MARK', DT: 'P', DD: 'P', FIGCAPTION: 'P' };
function sanitizePaste(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const out = document.createElement('div');
  const blockish = new Set(['P', 'H1', 'H2', 'H3', 'UL', 'OL', 'PRE', 'BLOCKQUOTE', 'TABLE', 'HR']);
  function walk(src, dst) {
    for (const n of [...src.childNodes]) {
      if (n.nodeType === 3) { const txt = n.textContent; if (!txt) continue; if (/^\s*$/.test(txt) && (dst === out || ['UL', 'OL', 'TBODY', 'TR', 'TABLE'].includes(dst.tagName))) continue; dst.appendChild(document.createTextNode(txt.replace(/\s+/g, ' '))); continue; }
      if (n.nodeType !== 1) continue;
      const tag = n.tagName;
      if (/^(SCRIPT|STYLE|META|LINK|TITLE|SVG|IFRAME|OBJECT|EMBED|NOSCRIPT|TEMPLATE|BUTTON|SELECT|TEXTAREA|CANVAS|VIDEO|AUDIO|HEAD|NAV|ASIDE|FORM)$/.test(tag)) continue;
      if (tag === 'IMG') { const src = n.getAttribute('src') || ''; if (/^data:image\//.test(src)) { const f = document.createElement('figure'); f.className = 'img'; f.setAttribute('contenteditable', 'false'); const im = document.createElement('img'); im.src = src; f.appendChild(im); (dst === out ? out : dst).appendChild(f); } continue; }
      if (tag === 'INPUT') { if (n.type === 'checkbox') { const li = n.closest('li'); if (li) { li.dataset.task = n.checked ? 'x' : ' '; } } continue; }
      const st = n.getAttribute('style') || '';
      let mapped = PASTE_MAP[tag];
      if ((tag === 'B' || tag === 'STRONG') && /font-weight:\s*(normal|400)/.test(st)) mapped = null;
      if (tag === 'P' && /^(LI|TD|TH)$/.test(dst.tagName)) mapped = null;
      if ((mapped === 'P') && (dst.tagName === 'P' || /^H[1-3]$/.test(dst.tagName) || /^(LI|TD|TH|BLOCKQUOTE)$/.test(dst.tagName) && tag === 'DIV')) {
        walk(n, dst); if (/^(LI|TD|TH)$/.test(dst.tagName) && n.nextSibling) dst.appendChild(document.createElement('br')); continue;
      }
      let target = dst;
      if (mapped) {
        if (blockish.has(mapped) && dst.tagName === 'P') { // hoist block out of paragraph
          const e = document.createElement(mapped); out.appendChild(e); walk(n, e); continue;
        }
        const e = document.createElement(mapped === 'MARK' ? 'SPAN' : mapped);
        if (mapped === 'MARK') e.className = 'hl';
        if (mapped === 'A') { const href = n.getAttribute('href') || ''; if (/^(https?:|mailto:)/i.test(href)) e.setAttribute('href', href); else { walk(n, dst); continue; } }
        if (mapped === 'PRE') { const code = document.createElement('code'); code.textContent = n.textContent.replace(/\n?$/, '\n'); e.appendChild(code); const lang = (n.className + ' ' + (n.querySelector('code') || {}).className).match(/(?:language|lang)-([\w+#-]+)/); if (lang) e.dataset.lang = lang[1].toLowerCase(); dst.appendChild(e); continue; }
        dst.appendChild(e); target = e;
      } else if (tag === 'SPAN' || tag === 'FONT') {
        let w = dst;
        if (/font-weight:\s*(bold|[6-9]00)/.test(st)) { const b = document.createElement('strong'); w.appendChild(b); w = b; }
        if (/font-style:\s*italic/.test(st)) { const i = document.createElement('em'); w.appendChild(i); w = i; }
        if (/line-through/.test(st)) { const x = document.createElement('s'); w.appendChild(x); w = x; }
        if (/underline/.test(st) && !n.closest('a')) { const x = document.createElement('u'); w.appendChild(x); w = x; }
        target = w;
      }
      walk(n, target);
    }
  }
  walk(doc.body, out);
  out.querySelectorAll('li[data-task]').forEach(li => { const ul = li.closest('ul,ol'); if (ul && ul.tagName === 'UL') ul.classList.add('checklist'); if (li.dataset.task === 'x') li.classList.add('done'); li.removeAttribute('data-task'); });
  out.querySelectorAll('p,h1,h2,h3,li,strong,em,u,s,span,a').forEach(e => { if (!e.textContent.trim() && !e.querySelector('br,img,figure') && e.tagName !== 'LI') e.remove(); });
  // wrap stray inline content at top level
  const frag = document.createElement('div'); let p = null;
  for (const n of [...out.childNodes]) {
    if (n.nodeType === 1 && (blockish.has(n.tagName) || n.tagName === 'FIGURE')) { p = null; frag.appendChild(n); }
    else { if (n.nodeType === 3 && !n.textContent.trim() && !p) continue; if (!p) { p = document.createElement('p'); frag.appendChild(p); } p.appendChild(n); }
  }
  frag.querySelectorAll('p').forEach(x => { x.innerHTML = x.innerHTML.replace(/^(\s|&nbsp;)+|(\s|&nbsp;)+$/g, ''); if (!x.innerHTML) x.remove(); });
  return frag.innerHTML;
}
