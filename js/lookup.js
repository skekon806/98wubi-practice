// 反查视图：汉字 → 五笔、拼音 → 常用字
// 需在 data/*.js 之后、app.js 之前加载；函数运行时使用 app.js 中的
// LOOKUP_DICTS / LOOKUP_MODE_KEY / lookupMode / jmCodesFor / cur 等全局绑定。

const PINYIN_INDEX = window.WUBI_DATA['pinyin'] || {};

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

function lookupChar() {
  const input = document.getElementById('lookupInput').value;
  const box = document.getElementById('lookupResult');
  box.replaceChildren();
  if (!input) {
    box.appendChild(el('div', 'lookup-hint', '输入汉字，实时反查 86/98/新世纪 三版编码与拆解'));
    return;
  }
  for (const ch of input) {
    if (/\s/.test(ch)) continue;
    const item = el('div', 'lookup-item');
    item.appendChild(el('div', 'li-char', ch));
    const results = el('div', 'li-results');
    for (const d of LOOKUP_DICTS) {
      const e = d.dict[ch];
      const jm = jmCodesFor(d.key, ch);
      const row = el('div', 'li-row');
      row.appendChild(el('span', 'li-ver v' + d.key, d.name));
      if (e) {
        const body = el('div', 'li-body');
        const line = el('div', 'li-line');
        line.appendChild(el('span', 'li-code', e.c.toUpperCase()));
        if (jm) line.appendChild(el('span', 'li-jm', jm));
        body.appendChild(line);
        const split = el('div', 'li-split');
        for (const x of Array.from(e.s)) split.appendChild(el('span', 'ls-glyph', x));
        body.appendChild(split);
        row.appendChild(body);
      } else {
        row.appendChild(el('span', 'li-missing', '未收录'));
      }
      results.appendChild(row);
    }
    item.appendChild(results);
    box.appendChild(item);
  }
}

// ---------- 拼音反查 ----------
function switchLookupMode(mode) {
  if (mode !== 'char' && mode !== 'pinyin') return;
  lookupMode = mode;
  localStorage.setItem(LOOKUP_MODE_KEY, mode);
  document.getElementById('ltChar').classList.toggle('active', mode === 'char');
  document.getElementById('ltPinyin').classList.toggle('active', mode === 'pinyin');
  const input = document.getElementById('lookupInput');
  input.placeholder = mode === 'pinyin'
    ? '输入拼音，如 zhang / zhang3 / lv'
    : '输入汉字，实时反查编码与拆解';
  document.getElementById('lookupNote').textContent = mode === 'pinyin'
    ? '内置 3500 常用字；数字 1-4 标调，轻声不写数字；ü 输入 v；点字查看详细拆解。'
    : '输入一个或多个汉字，显示三版全码 / 简码 / 拆解；也可切到拼音模式按读音找字。';
  input.value = '';
  input.focus();
  renderLookup();
}

function renderLookup() {
  if (lookupMode === 'pinyin') lookupPinyin();
  else lookupChar();
}

function normalizePinyin(s) {
  let out = '';
  const normalized = s.toLowerCase()
    .replace(/[\s'’-]/g, '')
    .replace(/ɡ/g, 'g')
    .replace(/ü/g, 'v').replace(/ǖ/g, 'v').replace(/ǘ/g, 'v')
    .replace(/ǚ/g, 'v').replace(/ǜ/g, 'v')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '');
  for (const ch of normalized) {
    if (ch >= 'a' && ch <= 'z') out += ch;
  }
  return out;
}

function parsePinyinQuery(raw) {
  let s = raw.trim().toLowerCase().replace(/[\s'’-]/g, '').replace(/ɡ/g, 'g');
  let tone = 0;
  const m = s.match(/([1-5])$/);
  if (m) {
    tone = Number(m[1]);
    s = s.slice(0, -1);
  }
  if (!tone) {
    if (/[āēīōūǖ]/.test(s)) tone = 1;
    else if (/[áéíóúǘ]/.test(s)) tone = 2;
    else if (/[ǎěǐǒǔǚ]/.test(s)) tone = 3;
    else if (/[àèìòùǜ]/.test(s)) tone = 4;
  }
  return { key: normalizePinyin(s), tone: tone };
}

function lookupPinyin() {
  const raw = document.getElementById('lookupInput').value;
  const box = document.getElementById('lookupResult');
  box.replaceChildren();
  if (!raw.trim()) {
    box.appendChild(el('div', 'lookup-hint', '输入拼音，按声调显示常用字（如 zhang、zhang3、lv4）'));
    return;
  }
  const q = parsePinyinQuery(raw);
  if (!q.key) {
    box.appendChild(el('div', 'lookup-hint', '拼音只能包含字母和声调数字'));
    return;
  }
  const groups = PINYIN_INDEX[q.key];
  if (!groups || !groups.length) {
    box.appendChild(el('div', 'lookup-hint', '未找到“' + q.key + '”对应的常用字'));
    return;
  }
  const shown = q.tone ? groups.filter(g => g[1] === q.tone) : groups;
  if (!shown.length) {
    box.appendChild(el('div', 'lookup-hint', '“' + q.key + '”没有第 ' + q.tone + ' 声的常用字'));
    return;
  }
  for (const [label, _tone, chars] of shown) {
    const section = el('div', 'py-group');
    const title = el('div', 'py-group-title');
    title.appendChild(el('span', '', label));
    title.appendChild(el('span', 'py-count', chars.length + ' 字'));
    section.appendChild(title);
    const grid = el('div', 'py-grid');
    for (const ch of chars) {
      const card = el('button', 'py-char');
      card.type = 'button';
      card.appendChild(el('span', 'py-glyph', ch));
      const code = ((cur().dict[ch] || {}).c || '').toUpperCase();
      card.appendChild(el('span', 'py-code' + (code ? '' : ' missing'), code || '—'));
      card.title = ch + '\n' + LOOKUP_DICTS.map(d =>
        d.name + ' ' + (((d.dict[ch] || {}).c || '—').toUpperCase())
      ).join('\n') + '\n点击查看详细拆解';
      card.onclick = function() {
        switchLookupMode('char');
        document.getElementById('lookupInput').value = ch;
        renderLookup();
      };
      grid.appendChild(card);
    }
    section.appendChild(grid);
    box.appendChild(section);
  }
}
