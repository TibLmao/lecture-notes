'use strict';
/* ============================================================
   Themes = UI colours + editor colour scheme.
   Every editor key is editable in Settings › Color Scheme.
   ============================================================ */
const SCHEME_KEYS = [
  // [key, label, group]
  ['text', 'Default text', 'General'], ['bg', 'Background', 'General'], ['gutter', 'Gutter background', 'General'],
  ['ln', 'Line numbers', 'General'], ['lnCur', 'Current line number', 'General'], ['curLine', 'Current line', 'General'],
  ['selection', 'Selection', 'General'], ['caret', 'Caret', 'General'], ['match', 'Search match', 'General'], ['matchCur', 'Current search match', 'General'],
  ['h1', 'Heading 1', 'Markdown'], ['h2', 'Heading 2', 'Markdown'], ['h3', 'Heading 3', 'Markdown'],
  ['bold', 'Bold text', 'Markdown'], ['italic', 'Italic text', 'Markdown'], ['link', 'Link', 'Markdown'], ['wikilink', 'Note link', 'Markdown'],
  ['codeFg', 'Inline code text', 'Markdown'], ['codeBg', 'Inline code background', 'Markdown'],
  ['blockBg', 'Code block background', 'Markdown'], ['blockBorder', 'Code block border', 'Markdown'],
  ['quote', 'Quote text', 'Markdown'], ['quoteBar', 'Quote bar', 'Markdown'], ['mark', 'Highlighter', 'Markdown'],
  ['hr', 'Divider', 'Markdown'], ['tableBorder', 'Table border', 'Markdown'], ['thBg', 'Table header background', 'Markdown'], ['thFg', 'Table header text', 'Markdown'],
  ['check', 'Checkbox', 'Markdown'], ['math', 'Math', 'Markdown'], ['ts', 'Timestamp', 'Markdown'],
  ['blue', 'Blue', 'Palette (callouts)'], ['green', 'Green', 'Palette (callouts)'], ['orange', 'Orange', 'Palette (callouts)'], ['red', 'Red', 'Palette (callouts)'],
  ['purple', 'Purple', 'Palette (callouts)'], ['cyan', 'Cyan', 'Palette (callouts)'], ['yellow', 'Yellow', 'Palette (callouts)'],
  ['kw', 'Keyword', 'Code'], ['str', 'String', 'Code'], ['num', 'Number', 'Code'], ['com', 'Line comment', 'Code'], ['doc', 'Doc comment', 'Code'],
  ['fn', 'Function', 'Code'], ['type', 'Class / type', 'Code'], ['var', 'Field / variable', 'Code'], ['const', 'Constant', 'Code'],
  ['attr', 'Attribute', 'Code'], ['tag', 'Tag', 'Code'], ['meta', 'Annotation / meta', 'Code'],
];
const UI_KEYS = ['win', 'panel', 'editor', 'popup', 'input', 'border', 'border2', 'fg', 'fg2', 'fg3', 'hover', 'active', 'sel', 'selfg', 'sel2', 'accent', 'accentfg', 'focus', 'tabline', 'scroll', 'icon', 'red', 'orange', 'yellow', 'green', 'blue', 'purple', 'cyan'];

function mkTheme(id, name, dark, u, e, extra) {
  u = { ...u }; e = { ...e };
  const P = u.panel, F = u.fg;
  u.popup = u.popup || P;
  u.input = u.input || (dark ? mix('#000000', P, 0.15) : '#FFFFFF');
  u.border = u.border || (dark ? mix('#000000', u.win, 0.35) : mix('#000000', u.win, 0.08));
  u.border2 = u.border2 || mix(F, P, 0.22);
  u.fg2 = u.fg2 || mix(F, P, 0.62);
  u.fg3 = u.fg3 || mix(F, P, 0.4);
  u.hover = u.hover || mix(F, P, dark ? 0.09 : 0.07);
  u.active = u.active || mix(F, P, dark ? 0.15 : 0.12);
  u.sel = u.sel || mix(u.accent, P, dark ? 0.35 : 0.22);
  u.selfg = u.selfg || F;
  u.sel2 = u.sel2 || mix(F, P, dark ? 0.12 : 0.1);
  u.accentfg = u.accentfg || contrastText(u.accent);
  u.focus = u.focus || u.accent;
  u.tabline = u.tabline || u.accent;
  u.scroll = u.scroll || mix(F, P, dark ? 0.22 : 0.25);
  u.icon = u.icon || mix(F, P, 0.82);
  for (const k of ['red', 'orange', 'yellow', 'green', 'blue', 'purple', 'cyan']) u[k] = u[k] || e[k];
  const B = e.bg = e.bg || u.editor, T = e.text;
  e.gutter = e.gutter || B;
  e.ln = e.ln || mix(T, B, 0.32);
  e.lnCur = e.lnCur || mix(T, B, 0.8);
  e.curLine = e.curLine || mix(T, B, dark ? 0.04 : 0.035);
  e.selection = e.selection || mix(u.accent, B, dark ? 0.4 : 0.3);
  e.caret = e.caret || T;
  e.bold = e.bold || T;
  e.italic = e.italic || T;
  e.wikilink = e.wikilink || e.link;
  e.codeBg = e.codeBg || mix(T, B, dark ? 0.08 : 0.06);
  e.blockBg = e.blockBg || mix(dark ? '#000000' : T, B, dark ? 0.18 : 0.03);
  e.blockBorder = e.blockBorder || mix(T, B, dark ? 0.12 : 0.1);
  e.quoteBar = e.quoteBar || e.quote;
  e.mark = e.mark || mix(e.yellow, B, dark ? 0.28 : 0.35);
  e.hr = e.hr || mix(T, B, 0.18);
  e.tableBorder = e.tableBorder || mix(T, B, dark ? 0.2 : 0.18);
  e.thBg = e.thBg || mix(T, B, dark ? 0.05 : 0.04);
  e.thFg = e.thFg || e.h2;
  e.check = e.check || u.accent;
  e.match = e.match || mix(e.green, B, dark ? 0.3 : 0.35);
  e.matchCur = e.matchCur || mix(e.yellow, B, dark ? 0.5 : 0.6);
  e.math = e.math || e.purple;
  e.ts = e.ts || e.cyan;
  e.doc = e.doc || e.com;
  e.const = e.const || e.var;
  e.attr = e.attr || e.var;
  e.tag = e.tag || e.kw;
  e.meta = e.meta || e.yellow;
  e.type = e.type || T;
  return { id, name, dark, ui: u, ed: e, ...(extra || {}) };
}

const THEMES = [
  mkTheme('dark', 'Dark', true,
    { win: '#2B2D30', panel: '#2B2D30', editor: '#1E1F22', popup: '#2B2D30', input: '#1E1F22', border: '#1E1F22', border2: '#4E5157', fg: '#DFE1E5', fg2: '#868A91', fg3: '#5A5D63', hover: '#393B40', active: '#43454A', sel: '#2E436E', sel2: '#393B40', accent: '#3574F0', accentfg: '#FFFFFF', scroll: '#4E5157', icon: '#CED0D6' },
    { text: '#BCBEC4', bg: '#1E1F22', ln: '#4B5059', lnCur: '#A1A3AB', curLine: '#26282E', selection: '#214283', caret: '#CED0D6', h1: '#CF8E6D', h2: '#56A8F5', h3: '#C77DBB', bold: '#E6E7EA', link: '#548AF7', codeFg: '#6AAB73', codeBg: '#2B2D30', blockBg: '#191A1C', blockBorder: '#393B40', quote: '#5F826B', mark: '#4A4326', hr: '#393B40', tableBorder: '#43454A', thBg: '#2B2D30', thFg: '#DFE1E5', match: '#32593D', matchCur: '#5C6B33', kw: '#CF8E6D', str: '#6AAB73', num: '#2AACB8', com: '#7A7E85', doc: '#5F826B', fn: '#56A8F5', type: '#BCBEC4', var: '#C77DBB', tag: '#D5B778', meta: '#B3AE60', blue: '#56A8F5', green: '#6AAB73', orange: '#CF8E6D', red: '#F75464', purple: '#C77DBB', cyan: '#2AACB8', yellow: '#D5B778' }),
  mkTheme('light', 'Light', false,
    { win: '#F7F8FA', panel: '#F7F8FA', editor: '#FFFFFF', popup: '#FFFFFF', input: '#FFFFFF', border: '#EBECF0', border2: '#C9CCD6', fg: '#1E1F22', fg2: '#6C707E', fg3: '#A8ADBD', hover: '#E7E8EC', active: '#DFE1E5', sel: '#D4E2FF', sel2: '#DFE1E5', accent: '#3574F0', accentfg: '#FFFFFF', scroll: '#C9CCD6', icon: '#6C707E' },
    { text: '#080808', bg: '#FFFFFF', ln: '#AEB3C2', lnCur: '#767A8A', curLine: '#F5F8FE', selection: '#A6D2FF', caret: '#000000', h1: '#0033B3', h2: '#00627A', h3: '#871094', bold: '#000000', link: '#2A5DD9', codeFg: '#067D17', codeBg: '#F2F3F5', blockBg: '#F7F8FA', blockBorder: '#EBECF0', quote: '#67727E', quoteBar: '#C9CCD6', mark: '#FFF0A8', hr: '#EBECF0', tableBorder: '#DFE1E5', thBg: '#F7F8FA', thFg: '#1E1F22', match: '#FFE49E', matchCur: '#F4C26B', kw: '#0033B3', str: '#067D17', num: '#1750EB', com: '#8C8C8C', doc: '#8C8C8C', fn: '#00627A', type: '#000000', var: '#871094', attr: '#174AD4', tag: '#0033B3', meta: '#9E880D', blue: '#3574F0', green: '#208A3C', orange: '#D2691E', red: '#E55230', purple: '#871094', cyan: '#0E7A82', yellow: '#A68A0D' }),
  mkTheme('darcula', 'Darcula', true,
    { win: '#3C3F41', panel: '#3C3F41', editor: '#2B2B2B', popup: '#3C3F41', input: '#45494A', border: '#2B2B2B', border2: '#5E6060', fg: '#BBBBBB', fg2: '#8C8C8C', fg3: '#666666', hover: '#4B4F51', active: '#4E5254', sel: '#2F65CA', selfg: '#FFFFFF', sel2: '#0D293E', accent: '#4A88C7', accentfg: '#FFFFFF', scroll: '#5A5D5F', icon: '#AFB1B3' },
    { text: '#A9B7C6', bg: '#2B2B2B', gutter: '#313335', ln: '#606366', lnCur: '#A4A3A3', curLine: '#323232', selection: '#214283', caret: '#BBBBBB', h1: '#CC7832', h2: '#FFC66D', h3: '#9876AA', bold: '#E0E0E0', link: '#589DF6', codeFg: '#A5C261', codeBg: '#383B3D', blockBg: '#232525', blockBorder: '#3C3F41', quote: '#629755', mark: '#584A1E', hr: '#515151', tableBorder: '#515151', thBg: '#313335', thFg: '#FFC66D', match: '#32593D', matchCur: '#155221', kw: '#CC7832', str: '#6A8759', num: '#6897BB', com: '#808080', doc: '#629755', fn: '#FFC66D', type: '#A9B7C6', var: '#9876AA', attr: '#BABABA', tag: '#E8BF6A', meta: '#BBB529', blue: '#6897BB', green: '#6A8759', orange: '#CC7832', red: '#D25252', purple: '#9876AA', cyan: '#299999', yellow: '#FFC66D' }),
  mkTheme('intellij-light', 'IntelliJ Light', false,
    { win: '#F2F2F2', panel: '#F2F2F2', editor: '#FFFFFF', popup: '#FFFFFF', input: '#FFFFFF', border: '#D1D1D1', border2: '#C4C4C4', fg: '#000000', fg2: '#787878', fg3: '#A0A0A0', hover: '#E0E0E0', active: '#CFCFCF', sel: '#2675BF', selfg: '#FFFFFF', sel2: '#D5D5D5', accent: '#3592C4', accentfg: '#FFFFFF', scroll: '#C4C4C4', icon: '#6E6E6E' },
    { text: '#000000', bg: '#FFFFFF', gutter: '#F0F0F0', ln: '#999999', lnCur: '#333333', curLine: '#FCFAED', selection: '#A6D2FF', caret: '#000000', h1: '#000080', h2: '#00627A', h3: '#660E7A', bold: '#000000', link: '#2C6BD9', codeFg: '#067D17', codeBg: '#F3F3F3', blockBg: '#F7F7F7', blockBorder: '#E5E5E5', quote: '#808080', quoteBar: '#C7C7C7', mark: '#FFF5B1', hr: '#D1D1D1', tableBorder: '#D1D1D1', thBg: '#F2F2F2', thFg: '#000080', match: '#FFE4AF', matchCur: '#F2C55C', kw: '#000080', str: '#008000', num: '#0000FF', com: '#808080', doc: '#808080', fn: '#00627A', type: '#000000', var: '#660E7A', attr: '#0000FF', tag: '#000080', meta: '#808000', blue: '#1E63D6', green: '#008000', orange: '#B85C00', red: '#C7222D', purple: '#660E7A', cyan: '#00838F', yellow: '#8C7A00' }),
  mkTheme('high-contrast', 'High Contrast', true,
    { win: '#000000', panel: '#000000', editor: '#000000', popup: '#000000', input: '#000000', border: '#6E6E6E', border2: '#FFFFFF', fg: '#FFFFFF', fg2: '#D0D0D0', fg3: '#9E9E9E', hover: '#1F1F1F', active: '#333333', sel: '#1AEBFF', selfg: '#000000', sel2: '#333333', accent: '#1AEBFF', accentfg: '#000000', focus: '#FFD800', scroll: '#9E9E9E', icon: '#FFFFFF' },
    { text: '#FFFFFF', bg: '#000000', ln: '#8A8A8A', lnCur: '#FFFFFF', curLine: '#1A1A1A', selection: '#2147A8', caret: '#FFFFFF', h1: '#FFAA44', h2: '#FFE14D', h3: '#E39DFF', bold: '#FFFFFF', link: '#66B3FF', codeFg: '#8CFF8C', codeBg: '#1A1A1A', blockBg: '#0A0A0A', blockBorder: '#6E6E6E', quote: '#A3E1A3', mark: '#6B5A00', hr: '#8A8A8A', tableBorder: '#BDBDBD', thBg: '#1A1A1A', thFg: '#FFE14D', match: '#00591A', matchCur: '#008A2E', kw: '#FF9E3D', str: '#8CFF8C', num: '#66CCFF', com: '#B0B0B0', doc: '#A3E1A3', fn: '#FFE14D', type: '#FFFFFF', var: '#E39DFF', meta: '#E6E650', blue: '#66B3FF', green: '#8CFF8C', orange: '#FF9E3D', red: '#FF6B6B', purple: '#E39DFF', cyan: '#1AEBFF', yellow: '#FFE14D' }),
  mkTheme('tokyo-night', 'Tokyo Night', true,
    { win: '#16161E', panel: '#16161E', editor: '#1A1B26', popup: '#16161E', input: '#14141B', border: '#101014', border2: '#292E42', fg: '#C0CAF5', fg2: '#737AA2', fg3: '#545C7E', hover: '#1F2335', active: '#292E42', sel: '#283457', sel2: '#1F2335', accent: '#7AA2F7', accentfg: '#16161E', icon: '#A9B1D6' },
    { text: '#A9B1D6', bg: '#1A1B26', ln: '#3B4261', lnCur: '#737AA2', curLine: '#1E2030', selection: '#2B3A66', caret: '#C0CAF5', h1: '#BB9AF7', h2: '#7AA2F7', h3: '#7DCFFF', bold: '#FF9E64', link: '#73DACA', codeFg: '#9ECE6A', codeBg: '#24283B', blockBg: '#16161E', blockBorder: '#292E42', quote: '#8089B3', quoteBar: '#3D59A1', hr: '#292E42', tableBorder: '#292E42', thBg: '#1F2335', thFg: '#7AA2F7', match: '#3D59A1', matchCur: '#5A6FB8', kw: '#BB9AF7', str: '#9ECE6A', num: '#FF9E64', com: '#565F89', doc: '#5A638C', fn: '#7AA2F7', type: '#2AC3DE', var: '#C0CAF5', const: '#FF9E64', attr: '#73DACA', tag: '#F7768E', meta: '#E0AF68', blue: '#7AA2F7', green: '#9ECE6A', orange: '#FF9E64', red: '#F7768E', purple: '#BB9AF7', cyan: '#7DCFFF', yellow: '#E0AF68' }),
  mkTheme('catppuccin', 'Catppuccin Mocha', true,
    { win: '#181825', panel: '#181825', editor: '#1E1E2E', popup: '#181825', input: '#11111B', border: '#11111B', border2: '#45475A', fg: '#CDD6F4', fg2: '#A6ADC8', fg3: '#6C7086', hover: '#313244', active: '#45475A', sel: '#45475A', sel2: '#313244', accent: '#CBA6F7', accentfg: '#1E1E2E', icon: '#BAC2DE' },
    { text: '#CDD6F4', bg: '#1E1E2E', ln: '#585B70', lnCur: '#B4BEFE', curLine: '#252536', selection: '#3E4058', caret: '#F5E0DC', h1: '#F38BA8', h2: '#FAB387', h3: '#F9E2AF', bold: '#EBA0AC', link: '#89B4FA', codeFg: '#A6E3A1', codeBg: '#313244', blockBg: '#181825', blockBorder: '#313244', quote: '#9399B2', quoteBar: '#CBA6F7', mark: '#4A4639', hr: '#45475A', tableBorder: '#45475A', thBg: '#181825', thFg: '#CBA6F7', match: '#4E4A3A', matchCur: '#6E6447', kw: '#CBA6F7', str: '#A6E3A1', num: '#FAB387', com: '#7F849C', doc: '#9399B2', fn: '#89B4FA', type: '#F9E2AF', var: '#CDD6F4', const: '#FAB387', attr: '#F9E2AF', tag: '#89B4FA', meta: '#F5C2E7', blue: '#89B4FA', green: '#A6E3A1', orange: '#FAB387', red: '#F38BA8', purple: '#CBA6F7', cyan: '#94E2D5', yellow: '#F9E2AF' }),
  mkTheme('dracula', 'Dracula', true,
    { win: '#21222C', panel: '#21222C', editor: '#282A36', popup: '#21222C', input: '#191A21', border: '#191A21', border2: '#44475A', fg: '#F8F8F2', fg2: '#A0A4BC', fg3: '#6272A4', hover: '#2F3142', active: '#44475A', sel: '#44475A', sel2: '#2F3142', accent: '#BD93F9', accentfg: '#21222C', tabline: '#FF79C6', icon: '#D0D2DC' },
    { text: '#F8F8F2', bg: '#282A36', ln: '#6272A4', lnCur: '#F8F8F2', curLine: '#2F3141', selection: '#44475A', caret: '#F8F8F0', h1: '#FF79C6', h2: '#BD93F9', h3: '#8BE9FD', bold: '#FFB86C', italic: '#F1FA8C', link: '#8BE9FD', codeFg: '#50FA7B', codeBg: '#343746', blockBg: '#21222C', blockBorder: '#44475A', quote: '#F1FA8C', quoteBar: '#6272A4', mark: '#56582E', hr: '#44475A', tableBorder: '#44475A', thBg: '#343746', thFg: '#BD93F9', check: '#50FA7B', match: '#5C5E3A', matchCur: '#8A8C3F', kw: '#FF79C6', str: '#F1FA8C', num: '#BD93F9', com: '#6272A4', fn: '#50FA7B', type: '#8BE9FD', var: '#F8F8F2', const: '#BD93F9', attr: '#50FA7B', tag: '#FF79C6', meta: '#FFB86C', blue: '#82AAFF', green: '#50FA7B', orange: '#FFB86C', red: '#FF5555', purple: '#BD93F9', cyan: '#8BE9FD', yellow: '#F1FA8C' }),
  mkTheme('nord', 'Nord', true,
    { win: '#272C36', panel: '#2E3440', editor: '#2E3440', popup: '#3B4252', input: '#3B4252', border: '#232831', border2: '#4C566A', fg: '#ECEFF4', fg2: '#A5ABB6', fg3: '#616E88', hover: '#3B4252', active: '#434C5E', sel: '#434C5E', sel2: '#3B4252', accent: '#88C0D0', accentfg: '#2E3440', icon: '#D8DEE9' },
    { text: '#D8DEE9', bg: '#2E3440', ln: '#4C566A', lnCur: '#D8DEE9', curLine: '#353B47', selection: '#434C5E', caret: '#D8DEE9', h1: '#88C0D0', h2: '#81A1C1', h3: '#8FBCBB', bold: '#ECEFF4', link: '#88C0D0', codeFg: '#A3BE8C', codeBg: '#3B4252', blockBg: '#2A2F3A', blockBorder: '#3B4252', quote: '#8C97AD', quoteBar: '#5E81AC', mark: '#575244', hr: '#434C5E', tableBorder: '#434C5E', thBg: '#3B4252', thFg: '#88C0D0', check: '#A3BE8C', match: '#4F5B46', matchCur: '#6E7D57', kw: '#81A1C1', str: '#A3BE8C', num: '#B48EAD', com: '#616E88', doc: '#7B88A1', fn: '#88C0D0', type: '#8FBCBB', var: '#D8DEE9', const: '#B48EAD', attr: '#8FBCBB', tag: '#81A1C1', meta: '#D08770', blue: '#81A1C1', green: '#A3BE8C', orange: '#D08770', red: '#BF616A', purple: '#B48EAD', cyan: '#88C0D0', yellow: '#EBCB8B' }),
  mkTheme('github-dark', 'GitHub Dark', true,
    { win: '#010409', panel: '#0D1117', editor: '#0D1117', popup: '#161B22', input: '#0D1117', border: '#21262D', border2: '#30363D', fg: '#E6EDF3', fg2: '#7D8590', fg3: '#484F58', hover: '#161B22', active: '#21262D', sel: '#1A3A63', sel2: '#21262D', accent: '#2F81F7', accentfg: '#FFFFFF', tabline: '#F78166', icon: '#C9D1D9' },
    { text: '#E6EDF3', bg: '#0D1117', ln: '#484F58', lnCur: '#E6EDF3', curLine: '#161B22', selection: '#264F78', caret: '#E6EDF3', h1: '#79C0FF', h2: '#D2A8FF', h3: '#FFA657', bold: '#F0F6FC', link: '#58A6FF', codeFg: '#A5D6FF', codeBg: '#262C36', blockBg: '#161B22', blockBorder: '#30363D', quote: '#8B949E', quoteBar: '#3B434B', mark: '#4D3F12', hr: '#21262D', tableBorder: '#30363D', thBg: '#161B22', thFg: '#E6EDF3', match: '#634A0C', matchCur: '#9E6A03', kw: '#FF7B72', str: '#A5D6FF', num: '#79C0FF', com: '#8B949E', fn: '#D2A8FF', type: '#FFA657', var: '#FFA657', const: '#79C0FF', attr: '#79C0FF', tag: '#7EE787', meta: '#D2A8FF', blue: '#58A6FF', green: '#3FB950', orange: '#F0883E', red: '#F85149', purple: '#A371F7', cyan: '#39C5CF', yellow: '#D29922' }),
  mkTheme('gruvbox', 'Gruvbox Dark', true,
    { win: '#1D2021', panel: '#1D2021', editor: '#282828', popup: '#32302F', input: '#1D2021', border: '#141617', border2: '#504945', fg: '#EBDBB2', fg2: '#A89984', fg3: '#7C6F64', hover: '#3C3836', active: '#504945', sel: '#504945', selfg: '#FBF1C7', sel2: '#3C3836', accent: '#D79921', accentfg: '#1D2021', tabline: '#FE8019', icon: '#D5C4A1' },
    { text: '#EBDBB2', bg: '#282828', ln: '#7C6F64', lnCur: '#FABD2F', curLine: '#32302F', selection: '#504945', caret: '#EBDBB2', h1: '#FE8019', h2: '#FABD2F', h3: '#B8BB26', bold: '#FBF1C7', link: '#83A598', codeFg: '#B8BB26', codeBg: '#3C3836', blockBg: '#1D2021', blockBorder: '#3C3836', quote: '#A89984', quoteBar: '#665C54', mark: '#5A4A1E', hr: '#504945', tableBorder: '#504945', thBg: '#32302F', thFg: '#FABD2F', check: '#8EC07C', match: '#5C4F1F', matchCur: '#7A651E', kw: '#FB4934', str: '#B8BB26', num: '#D3869B', com: '#928374', fn: '#FABD2F', type: '#8EC07C', var: '#83A598', const: '#D3869B', attr: '#8EC07C', tag: '#FB4934', meta: '#FE8019', blue: '#83A598', green: '#B8BB26', orange: '#FE8019', red: '#FB4934', purple: '#D3869B', cyan: '#8EC07C', yellow: '#FABD2F' }),
  mkTheme('solarized-light', 'Solarized Light', false,
    { win: '#EEE8D5', panel: '#EEE8D5', editor: '#FDF6E3', popup: '#FDF6E3', input: '#FDF6E3', border: '#DDD6C1', border2: '#C9C1A9', fg: '#073642', fg2: '#657B83', fg3: '#93A1A1', hover: '#E4DDC8', active: '#DDD6C1', sel: '#CFE0E3', selfg: '#002B36', sel2: '#DDD6C1', accent: '#268BD2', accentfg: '#FDF6E3', icon: '#586E75' },
    { text: '#586E75', bg: '#FDF6E3', gutter: '#EEE8D5', ln: '#93A1A1', lnCur: '#586E75', curLine: '#F5EEDA', selection: '#CCE3EC', caret: '#657B83', h1: '#CB4B16', h2: '#268BD2', h3: '#6C71C4', bold: '#073642', link: '#268BD2', codeFg: '#2AA198', codeBg: '#EEE8D5', blockBg: '#F5EFDC', blockBorder: '#E4DDC8', quote: '#93A1A1', mark: '#F3E3A8', hr: '#DDD6C1', tableBorder: '#DDD6C1', thBg: '#EEE8D5', thFg: '#073642', match: '#F5E1A4', matchCur: '#E9C46A', kw: '#859900', str: '#2AA198', num: '#D33682', com: '#93A1A1', fn: '#268BD2', type: '#B58900', var: '#268BD2', const: '#CB4B16', attr: '#B58900', tag: '#268BD2', meta: '#CB4B16', blue: '#268BD2', green: '#859900', orange: '#CB4B16', red: '#DC322F', purple: '#6C71C4', cyan: '#2AA198', yellow: '#B58900' }),
];
const THEME_BY_ID = Object.fromEntries(THEMES.map(t => [t.id, t]));
const ACCENTS = [['', 'Theme default'], ['#3574F0', 'Blue'], ['#7A5AF8', 'Violet'], ['#C94F9A', 'Pink'], ['#E5493A', 'Red'], ['#E8822E', 'Orange'], ['#D6A31C', 'Gold'], ['#3BA55C', 'Green'], ['#1FA3A3', 'Teal'], ['#5B6E8C', 'Slate']];
const FOLDER_COLORS = [['', 'None'], ['red', 'Red'], ['orange', 'Orange'], ['yellow', 'Yellow'], ['green', 'Green'], ['cyan', 'Cyan'], ['blue', 'Blue'], ['purple', 'Purple']];

function resolveTheme(settings) {
  const base = THEME_BY_ID[settings.theme] || THEMES[0];
  const ui = { ...base.ui };
  if (settings.accent && validHex(settings.accent)) {
    const a = normHex(settings.accent);
    ui.accent = a; ui.focus = a; ui.tabline = a; ui.accentfg = contrastText(a);
    ui.sel = mix(a, ui.panel, base.dark ? 0.35 : 0.22);
  }
  const ed = { ...base.ed, ...((settings.schemeOverrides || {})[base.id] || {}) };
  if (settings.accent && validHex(settings.accent) && !((settings.schemeOverrides || {})[base.id] || {}).check) ed.check = normHex(settings.accent);
  return { ...base, ui, ed };
}
function themeCssVars(t) {
  const out = [];
  for (const [k, v] of Object.entries(t.ui)) out.push(`--${k}:${v}`);
  for (const [k, v] of Object.entries(t.ed)) out.push(`--e-${k}:${v}`);
  out.push(`--shadow:${t.dark ? 'rgba(0,0,0,.45)' : 'rgba(0,0,0,.16)'}`);
  out.push(`--overlay:${t.dark ? 'rgba(0,0,0,.42)' : 'rgba(0,0,0,.22)'}`);
  return out.join(';');
}
