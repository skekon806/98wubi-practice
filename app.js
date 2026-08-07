const MODES = [
  { key: 'root', name: '码元练习', sub: '键名+码元', dataKey: 'root', root: true, data: window.WUBI_DATA['root_98'] },
  { key: 'jm1', name: '一级简码', sub: '单键', dataKey: 'jm1', root: true, data: window.WUBI_DATA['jm1'] },
  { key: 'encode1', name: '常用前500', sub: '高频500字', data: window.WUBI_DATA['encode1'] },
  { key: 'encode2', name: '常用中500', sub: '次频500字', data: window.WUBI_DATA['encode2'] },
  { key: 'encode3', name: '常用后500', sub: '低频500字', data: window.WUBI_DATA['encode3'] },
];

// 复习间隔（单位：题）：5 → 20 → 50
const INTERVALS = [5, 20, 50];

const REGIONS = {
  'G':'横区','F':'横区','D':'横区','S':'横区','A':'横区',
  'H':'竖区','J':'竖区','K':'竖区','L':'竖区','M':'竖区',
  'T':'撇区','R':'撇区','E':'撇区','W':'撇区','Q':'撇区',
  'Y':'捺区','U':'捺区','I':'捺区','O':'捺区','P':'捺区',
  'N':'折区','B':'折区','V':'折区','C':'折区','X':'折区'
};
const SAVE_KEY = 'wubi98_';

// ---------- 五笔版本配置 ----------
const VERSIONS = {
  '98': { name: '98版', dict: window.WUBI_DICT_98, jm1: window.WUBI_DATA['jm1'], jm2: window.WUBI_DATA['jm2_98'], jm3: window.WUBI_DATA['jm3_98'], root: window.WUBI_DATA['root_98'] },
  '86': { name: '86版', dict: window.WUBI_DICT_86, jm1: window.WUBI_DATA['jm1'], jm2: window.WUBI_DATA['jm2_86'], jm3: window.WUBI_DATA['jm3_86'], root: window.WUBI_DATA['root_86'] },
  '06': { name: '新世纪', dict: window.WUBI_DICT_06, jm1: window.WUBI_DATA['jm1'], jm2: window.WUBI_DATA['jm2_06'], jm3: window.WUBI_DATA['jm3_06'], root: window.WUBI_DATA['root_06'] },
};

const VERSION_KEY = SAVE_KEY + 'version';
let version = localStorage.getItem(VERSION_KEY) || '98';

function cur() { return VERSIONS[version] || VERSIONS['98']; }

const LOOKUP_DICTS = Object.keys(VERSIONS).map(k => ({ key: k, name: VERSIONS[k].name, dict: VERSIONS[k].dict }));

// ---------- 简码映射 ----------
// 每版本构建 字 → 简码集合（一/二/三级），供反馈时显示
function buildMaps() {
  Object.keys(VERSIONS).forEach(k => {
    const v = VERSIONS[k];
    const maps = { jm1: {}, jm2: {}, jm3: {} };
    (v.jm1 || []).forEach(c => maps.jm1[c.v] = c.a.toUpperCase());
    [...(v.jm2 || '')].forEach(ch => {
      const c = (v.dict[ch] || {}).c;
      if (c && !maps.jm2[ch]) maps.jm2[ch] = c.slice(0, 2).toUpperCase();
    });
    [...(v.jm3 || '')].forEach(ch => {
      const c = (v.dict[ch] || {}).c;
      if (c && !maps.jm3[ch]) maps.jm3[ch] = c.slice(0, 3).toUpperCase();
    });
    v.maps = maps;
  });
}

// 某字在指定版本的全部简码（一/二/三级），无则返回空串
function jmCodesFor(verKey, v) {
  const maps = VERSIONS[verKey].maps || {};
  const out = [];
  if (maps.jm1[v]) out.push(maps.jm1[v]);
  if (maps.jm2[v]) out.push(maps.jm2[v]);
  if (maps.jm3[v]) out.push(maps.jm3[v]);
  return out.join(' · ');
}

// 某字在当前版本的全部简码
function jmCodes(v) { return jmCodesFor(version, v); }

// 查询某字的拆解/全码（按当前版本字典）
function getSplit(ch) {
  const e = cur().dict[ch];
  return e && e.s ? Array.from(e.s) : [];
}
function getFull(ch) {
  return (cur().dict[ch] || {}).c || '';
}

let view = 'practice';

// 切换五笔版本：重开当前模式会话
function setVersion(v) {
  if (v === version) return;
  version = v;
  localStorage.setItem(VERSION_KEY, v);
  DATA = modeData();
  document.querySelectorAll('.version-switch .vs-btn').forEach(b => {
    b.classList.toggle('active', b.id === 'v' + v);
  });
  startSession();
}

function switchView(v) {
  if (v === view) return;
  view = v;
  const lookup = v === 'lookup';
  document.getElementById('practicePanel').style.display = lookup ? 'none' : 'block';
  document.getElementById('lookupPanel').style.display = lookup ? 'block' : 'none';
  document.getElementById('hamburger').style.display = lookup ? 'none' : '';
  document.getElementById('vsPractice').classList.toggle('active', !lookup);
  document.getElementById('vsLookup').classList.toggle('active', lookup);
  document.getElementById('menu').classList.remove('open');
  if (lookup) {
    document.getElementById('lookupInput').focus();
    lookupChar();
  } else {
    showCurrent(true);
  }
}

function lookupChar() {
  const input = document.getElementById('lookupInput').value;
  const box = document.getElementById('lookupResult');
  if (!input) {
    box.innerHTML = '<div class="lookup-hint">输入汉字，实时反查 86/98/新世纪 三版编码与拆解</div>';
    return;
  }
  let h = '';
  for (const ch of input) {
    if (/\s/.test(ch)) continue;
    let rows = '';
    for (const d of LOOKUP_DICTS) {
      const e = d.dict[ch];
      const jm = jmCodesFor(d.key, ch);
      rows += '<div class="li-row">' +
        '<span class="li-ver v' + d.key + '">' + d.name + '</span>' +
        (e
          ? '<div class="li-body">' +
            '<div class="li-line">' +
            '<span class="li-code">' + e.c.toUpperCase() + '</span>' +
            (jm ? '<span class="li-jm">' + jm + '</span>' : '') +
            '</div>' +
            '<div class="li-split">' + Array.from(e.s).map(x => '<span class="ls-glyph">' + x + '</span>').join('') + '</div>' +
            '</div>'
          : '<span class="li-missing">未收录</span>') +
        '</div>';
    }
    h += '<div class="lookup-item">' +
      '<div class="li-char">' + ch + '</div>' +
      '<div class="li-results">' + rows + '</div>' +
      '</div>';
  }
  box.innerHTML = h;
}

let modeIdx = 0;
let DATA = MODES[0].data;
let state = null;
let current = null; // { card, fromReview } 当前题的上下文
let isRetry = false;

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ---------- 存档 ----------
function saveKey() { return SAVE_KEY + version + '_' + MODES[modeIdx].key; }

function saveState() {
  localStorage.setItem(saveKey(), JSON.stringify(state));
}

function loadState() {
  try {
    const raw = localStorage.getItem(saveKey());
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (!s || !s.queue || !s.cards) return null;
    return s;
  } catch (e) { return null; }
}

function freshState() {
  return { queue: shuffle([...DATA]), cards: {}, pos: 0, correct: 0, wrong: 0, seen: 0, done: 0, current: null };
}

function ensureSchedule(v) {
  let c = state.cards[v];
  if (!c) c = state.cards[v] = { level: 0 };
  return c;
}

function startLevel() {
  const list = typeof DATA === 'string' ? [...DATA] : DATA;
  list.forEach(item => ensureSchedule(typeof item === 'string' ? item : item.v));
}

function modeData() {
  const m = MODES[modeIdx];
  if (m.dataKey) return cur()[m.dataKey] || m.data;
  return m.data;
}

function modeCount(m) {
  return (m.dataKey ? (cur()[m.dataKey] || m.data) : m.data).length;
}

function cardV(item) { return typeof item === 'string' ? item : item.v; }
function cardA(item) { return typeof item === 'string' ? '' : item.a; }

// ---------- 学习队列（错题回炉 + 间隔 5→20→50） ----------
function requeue(item, depth) {
  const pos = Math.min(depth, state.queue.length);
  state.queue.splice(pos, 0, item);
}

function getNextCard() {
  if (state.queue.length) {
    const item = state.queue.shift();
    const st = ensureSchedule(cardV(item));
    const fromReview = !!st.seen;
    return { card: item, fromReview };
  }
  return null;
}

// ---------- 菜单与模式 ----------
function buildMenu() {
  const menu = document.getElementById('menu');
  let h = '';
  MODES.forEach((m, i) => {
    h += '<div class="menu-item" onclick="switchMode(' + i + ')"><div>' + m.name + '</div><div class="sub">' + m.sub + ' · ' + modeCount(m) + '项</div></div>';
  });
  h += '<div class="menu-divider"></div>';
  h += '<div class="menu-action" onclick="resetProgress()">重置当前进度</div>';
  menu.innerHTML = h;
}

function toggleMenu() {
  document.getElementById('menu').classList.toggle('open');
}

function switchMode(newIdx) {
  if (newIdx === modeIdx) { toggleMenu(); return; }
  modeIdx = newIdx;
  DATA = modeData();
  toggleMenu();
  document.getElementById('menu').querySelectorAll('.menu-item').forEach((el, i) => {
    el.classList.toggle('active', i === modeIdx);
  });
  startSession();
}

function startSession() {
  state = loadState() || freshState();
  startLevel();
  isRetry = false;
  if (state.current != null) {
    current = { card: state.current, fromReview: !!ensureSchedule(cardV(state.current)).seen };
    state.current = null;
    showCurrent(true);
  } else {
    current = null;
    showCurrent();
  }
}

function resetProgress() {
  if (confirm('确定重置「' + MODES[modeIdx].name + '」的进度吗？')) {
    localStorage.removeItem(saveKey());
    state = freshState();
    startLevel();
    showCurrent();
  }
}

// ---------- 出题 ----------
function showCurrent(keep) {
  if (!keep || !current) {
    current = getNextCard();
    isRetry = false;
  }
  if (!current) { endGame(); return; }
  state.current = (current && !state.queue.includes(current.card)) ? current.card : null;
  const card = current.card;
  const v = cardV(card);
  const m = MODES[modeIdx];
  const isRoot = !!m.root;

  document.getElementById('modeTitle').textContent = m.name + ' · ' + m.sub;

  const cd = document.getElementById('charDisplay');
  cd.style.display = 'block';
  cd.textContent = v;
  cd.className = m.dataKey === 'root' ? 'char-display root-char' : 'char-display';

  updateProgress();
  document.getElementById('hintText').textContent = current.fromReview
    ? '复习 (' + state.cards[v].level + '/' + INTERVALS.length + ') · ' + (isRoot ? '输入键位' : '打字输入')
    : isRoot ? '输入对应的字母键' : '用输入法打出这个字，打完自动判对';

  const fb = document.getElementById('feedback');
  fb.className = 'feedback';
  fb.style.display = 'none';

  buildInput(isRoot);
  updateStats();
  saveState();
}

function buildInput(isRoot) {
  const container = document.getElementById('codeInputs');
  container.innerHTML = '';
  const inp = document.createElement('input');
  inp.type = 'text';
  inp.className = 'code-box' + (isRoot ? ' single' : ' ime');
  if (isRoot) {
    inp.maxLength = 1;
    inp.addEventListener('input', function() {
      this.value = this.value.toUpperCase();
      this.className = 'code-box single filled';
      setTimeout(checkAnswer, 80);
    });
  } else {
    inp.maxLength = 8;
    inp.autocomplete = 'off';
    inp.autocapitalize = 'off';
    inp.spellcheck = false;
    inp.addEventListener('input', function() {
      this.className = 'code-box ime filled';
      if (/[^\x00-\x7F]/.test(this.value)) setTimeout(checkAnswer, 80);
    });
    inp.addEventListener('keydown', onImeKeydown);
  }
  container.appendChild(inp);
  inp.focus();
}

// 输入法模式按键：空格/回车提交（空输入也判错，显示编码提示）
function onImeKeydown(e) {
  if (e.key !== ' ' && e.key !== 'Enter') return;
  e.preventDefault();
  checkAnswer();
}

// ---------- 判题 ----------
function checkAnswer() {
  if (!current || current.done) return;
  const { card, fromReview } = current;
  const v = cardV(card);
  const ans = cardA(card);
  const isRoot = !!MODES[modeIdx].root;

  const inp = document.querySelector('#codeInputs .code-box');
  if (!inp) return;
  let typed = inp.value.trim();
  if (isRoot) typed = typed.toUpperCase();

  const ok = isRoot ? typed === ans.toUpperCase() : (typed && typed === v);

  if (ok) {
    current.done = true;
    const st = ensureSchedule(v);
    if (!isRetry) {
      state.correct++;
      if (fromReview) {
        st.level++;
        if (st.level >= INTERVALS.length) {
          state.done++;
        } else {
          requeue(card, INTERVALS[st.level]);
        }
      } else {
        st.seen = true;
        state.seen++;
        st.level = 0;
        requeue(card, INTERVALS[0]);
      }
      state.current = null;
    }

    const fb = document.getElementById('feedback');
    fb.className = 'feedback';
    fb.style.display = 'none';
    inp.className = 'code-box' + (isRoot ? ' single' : ' ime') + ' correct';
    updateStats();
    saveState();
    const ctx = current;
    setTimeout(() => { if (current === ctx) advance(); }, 300);
  } else {
    if (!isRetry) {
      state.wrong++;
      const st = ensureSchedule(v);
      st.seen = true;
      state.seen++;
      st.level = 0;
      requeue(card, INTERVALS[0]);
      state.current = null;
      isRetry = true;
    }
    inp.value = '';
    inp.className = 'code-box' + (isRoot ? ' single' : ' ime');
    inp.focus();
    const fb = document.getElementById('feedback');
    fb.className = 'feedback wrong';
    fb.style.display = 'block';
    let fh = '';
    if (isRoot) {
      fh = '<div class="key-hint">' + ans.toUpperCase() + ' 键</div>' +
           '<div class="region-tag">' + (REGIONS[ans.toUpperCase()] || '') + '</div>' +
           '<div style="color:#888;font-size:13px;margin-top:8px">输入 ' + ans.toUpperCase() + ' 继续</div>';
    } else {
      const jm = jmCodes(v);
      fh = '<div style="font-size:15px;margin-bottom:6px;color:#dc2626">' + (typed ? '不对，正确编码是' : '还没输入，正确编码是') + '</div>' +
           '<div class="fb-codes">' +
           (jm ? '<div class="li-jm">' + jm + '</div>' : '') +
           '<div class="li-code">' + (getFull(v) || '').toUpperCase() + '</div>' +
           '</div>';
      const parts = getSplit(v);
      if (parts.length) {
        fh += '<div class="root-chars">' + parts.map(x => '<span>' + x + '</span>').join('') + '</div>';
      }
      fh += '<div style="color:#888;font-size:13px;margin-top:6px">照着上面用输入法重新打</div>';
    }
    fb.innerHTML = fh;
    updateStats();
    saveState();
  }
}

function advance() {
  state.pos++;
  showCurrent();
}

// ---------- 信息 ----------
function updateProgress() {
  const m = MODES[modeIdx];
  const total = modeCount(m);
  const p = document.getElementById('progress');
  p.textContent = '剩余 ' + state.queue.length + ' · 已学 ' + state.seen + ' / ' + total;
}

function updateStats() {
  document.getElementById('correctCount').textContent = state.correct;
  document.getElementById('wrongCount').textContent = state.wrong;
  document.getElementById('reviewBadge').textContent = '复习中: ' + (state.seen - state.done);
}

function endGame() {
  localStorage.removeItem(saveKey());
  current = null;
  state.current = null;
  document.getElementById('charDisplay').innerHTML = '🎉 完成!';
  document.getElementById('charDisplay').style.display = 'block';
  document.getElementById('codeInputs').style.display = 'none';
  document.getElementById('feedback').style.display = 'none';
  document.getElementById('hintText').innerHTML = '共 ' + state.pos + ' 题 · 正确 ' + state.correct + ' 错误 ' + state.wrong +
    ' &nbsp; <button onclick="resetProgress()" style="padding:4px 12px;border:1px solid #d0d5dd;border-radius:8px;background:#fff;color:#4f6cf7;cursor:pointer;font-size:13px">再来一轮</button>';
}

(function init() {
  buildMaps();
  buildMenu();
  document.getElementById('menu').querySelectorAll('.menu-item')[0].classList.add('active');
  document.querySelectorAll('.version-switch .vs-btn').forEach(b => {
    b.classList.toggle('active', b.id === 'v' + version);
  });
  startSession();
})();
