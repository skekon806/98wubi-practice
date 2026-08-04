const MODES = [
  { key: 'root', name: '码元练习', sub: '键名+码元', dataKey: 'root', explain: false, root: true, data: window.WUBI_DATA['root_98'] },
  { key: 'jm1', name: '一级简码', sub: '单键', dataKey: 'jm1', explain: false, data: window.WUBI_DATA['jm1'] },
  { key: 'jm2', name: '二级简码', sub: '两键', dataKey: 'jm2', explain: true, data: window.WUBI_DATA['jm2_98'] },
  { key: 'encode1', name: '常用前500', sub: '高频500字', explain: true, data: window.WUBI_DATA['encode1'] },
  { key: 'encode2', name: '常用中500', sub: '次频500字', explain: true, data: window.WUBI_DATA['encode2'] },
  { key: 'encode3', name: '常用后500', sub: '低频500字', explain: true, data: window.WUBI_DATA['encode3'] },
];

// 复习间隔（单位：题）：5 → 20 → 50，对的和错的都按此顺序递增
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
// 每个版本封装一份独立资源：dict 字典 / jm1 一级 / jm2 二级 / jm3 三级 / root 码元。
// 切换版本即切换整套数据；后续补 root、jm3 等只需给对应版本填数据。
const VERSIONS = {
  '98': {
    name: '98版',
    dict: window.WUBI_DICT_98,
    jm1: window.WUBI_DATA['jm1'],
    jm2: window.WUBI_DATA['jm2_98'],
    jm3: window.WUBI_DATA['jm3_98'],
    root: window.WUBI_DATA['root_98'],
  },
  '86': {
    name: '86版',
    dict: window.WUBI_DICT_86,
    jm1: window.WUBI_DATA['jm1'],
    jm2: window.WUBI_DATA['jm2_86'],
    jm3: window.WUBI_DATA['jm3_86'],
    root: window.WUBI_DATA['root_86'],
  },
  '06': {
    name: '新世纪',
    dict: window.WUBI_DICT_06,
    jm1: window.WUBI_DATA['jm1'],
    jm2: window.WUBI_DATA['jm2_06'],
    jm3: window.WUBI_DATA['jm3_06'],
    root: window.WUBI_DATA['root_06'],
  },
};

const VERSION_KEY = SAVE_KEY + 'version';
let version = localStorage.getItem(VERSION_KEY) || '98';

// 当前版本对象；未知 key 回退 98
function cur() { return VERSIONS[version] || VERSIONS['98']; }

// 为每个版本构建简码映射：字 -> 简码（反查提示 / 编码模式优先作答）
function buildMaps() {
  Object.keys(VERSIONS).forEach(k => {
    const v = VERSIONS[k];
    const maps = { jm1: {}, jm2: {}, jm3: {} };
    (v.jm1 || []).forEach(c => maps.jm1[c.v] = c.a);
    [...(v.jm2 || '')].forEach(ch => {
      const c = (v.dict[ch] || {}).c;
      if (c && !maps.jm2[ch]) maps.jm2[ch] = c.slice(0, 2);
    });
    [...(v.jm3 || '')].forEach(ch => {
      const c = (v.dict[ch] || {}).c;
      if (c && !maps.jm3[ch]) maps.jm3[ch] = c.slice(0, 3);
    });
    v.maps = maps;
  });
}

// 反查用的三版字典
const LOOKUP_DICTS = Object.keys(VERSIONS).map(k => ({ key: k, name: VERSIONS[k].name, dict: VERSIONS[k].dict }));

// 查询某字的拆解/全码（按当前版本字典）
function getSplit(ch) {
  const e = cur().dict[ch];
  return e && e.s ? Array.from(e.s) : [];
}
function getFull(ch) {
  return (cur().dict[ch] || {}).c || '';
}

let view = 'practice';

// 简码展示：一级/二级/三级分别查指定版本映射（86/06 暂无三级则自动省略）
function jmCodesFor(verKey, ch) {
  const m = VERSIONS[verKey].maps;
  const out = [];
  if (m.jm1[ch]) out.push(m.jm1[ch].toUpperCase());
  if (m.jm2[ch]) out.push(m.jm2[ch].toUpperCase());
  if (m.jm3[ch]) out.push(m.jm3[ch].toUpperCase());
  return out.join(' · ');
}
function jmCodes(ch) { return jmCodesFor(version, ch); }

// 切换五笔版本：更新答案/拆解来源并重开当前模式会话
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
let current = null; // { card, fromReview, final } 当前题的上下文
let isRetry = false;

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ---------- 存档 ----------
// 存档按「版本 + 模式」独立存储，切换版本互不影响
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

// 各模式数据：带 dataKey 的模式（root/jm1/jm2/jm3）取当前版本数据，encode 系列固定
function modeData() {
  const m = MODES[modeIdx];
  if (m.dataKey) return cur()[m.dataKey] || m.data;
  return m.data;
}

// 当前模式的数据量（菜单/进度显示，随版本变化）
function modeCount(m) {
  return (m.dataKey ? (cur()[m.dataKey] || m.data) : m.data).length;
}

// 根据当前模式由全码推导答案（jm2=前2，jm3=前3，encode=一/二/三级简码优先）
function getAnswer(v) {
  const key = MODES[modeIdx].key;
  const full = getFull(v);
  if (key === 'jm2') return full.slice(0, 2);
  if (key === 'jm3') return full.slice(0, 3);
  if (key.indexOf('encode') === 0) {
    const m = cur().maps;
    if (m.jm1[v]) return m.jm1[v];
    if (m.jm2[v]) return m.jm2[v];
    if (m.jm3[v]) return m.jm3[v];
  }
  return full;
}

function cardV(item) { return typeof item === 'string' ? item : item.v; }
function cardA(item) { return typeof item === 'string' ? getAnswer(item) : item.a; }

// ---------- 学习队列（错题回炉 + 间隔 5→20→50） ----------
// 卡片答完按间隔回炉到学习队列，间隔满即完成；答错重置为 5 题后回来
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

// 读取存档启动当前模式：若上次离开时还有未作答的当前卡，先恢复它，避免跳过
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
  const ans = cardA(card);
  const m = MODES[modeIdx];
  const isRoot = !!m.root;

  document.getElementById('modeTitle').textContent = m.name + ' · ' + m.sub;

  const cd = document.getElementById('charDisplay');
  cd.style.display = 'block';
  cd.textContent = v;
  cd.className = isRoot ? 'char-display root-char' : 'char-display';

  updateProgress();
  document.getElementById('hintText').textContent = current.fromReview
    ? '复习 (' + state.cards[v].level + '/' + INTERVALS.length + ') · 输入' + (isRoot ? '键位' : '编码 ' + ans.length + '键')
    : isRoot ? '输入对应的字母键' : '输入编码（' + ans.length + '个键）';

  const fb = document.getElementById('feedback');
  fb.className = 'feedback';
  fb.style.display = 'none';

  buildInputs(ans.length, isRoot);
  updateStats();
  saveState();
}

function buildInputs(n, isRoot) {
  const container = document.getElementById('codeInputs');
  container.innerHTML = '';
  for (let i = 0; i < n; i++) {
    const inp = document.createElement('input');
    inp.type = 'text';
    inp.maxLength = 1;
    inp.className = 'code-box' + (isRoot ? ' single' : '');
    inp.dataset.idx = i;
    container.appendChild(inp);
  }
  const boxes = document.querySelectorAll('.code-box');
  boxes.forEach((box, i, arr) => {
    box.addEventListener('input', function() {
      this.value = this.value.toUpperCase();
      this.className = 'code-box' + (isRoot ? ' single filled' : ' filled');
      if (this.value && i < arr.length - 1) arr[i + 1].focus();
      if (this.value && i === arr.length - 1) setTimeout(checkAnswer, 80);
    });
    box.addEventListener('keydown', function(e) {
      if (e.key === 'Backspace' && !this.value && i > 0) {
        arr[i - 1].value = '';
        arr[i - 1].className = 'code-box' + (isRoot ? ' single' : '');
        arr[i - 1].focus();
      }
    });
  });
  if (boxes.length > 0) boxes[0].focus();
}

// ---------- 判题 ----------
function checkAnswer() {
  if (!current) return;
  const { card, fromReview } = current;
  const v = cardV(card);
  const ans = cardA(card);
  const isRoot = !!MODES[modeIdx].root;

  const boxes = document.querySelectorAll('.code-box');
  let typed = '';
  boxes.forEach(b => typed += b.value);
  typed = typed.toUpperCase();

  if (typed === ans.toUpperCase()) {
    const st = ensureSchedule(v);
    if (!isRetry) {
      state.correct++;
      if (fromReview) {
        // 回炉复习答对：间隔升级 5→20→50，到最大即完成
        st.level++;
        if (st.level >= INTERVALS.length) {
          state.done++;
        } else {
          requeue(card, INTERVALS[st.level]);
        }
      } else {
        // 新卡首答对：5 题后回炉
        st.seen = true;
        state.seen++;
        st.level = 0;
        requeue(card, INTERVALS[0]);
      }
      state.current = null;
    }
    // 答错后的重打答对：不改变统计与回炉安排（延续出错时的重置）

    const fb = document.getElementById('feedback');
    fb.className = 'feedback';
    fb.style.display = 'none';
    boxes.forEach(b => b.className = 'code-box correct');
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
      requeue(card, INTERVALS[0]); // 答错：5 题后回炉
      state.current = null;
      isRetry = true;
    }
    boxes.forEach((b) => {
      b.value = '';
      b.className = 'code-box' + (isRoot ? ' single' : '');
    });
    if (boxes.length > 0) boxes[0].focus();
    const fb = document.getElementById('feedback');
    fb.className = 'feedback wrong';
    fb.style.display = 'block';
    let fh = '';
    if (isRoot) {
      fh = '<div class="key-hint">' + ans.toUpperCase() + ' 键</div>' +
           '<div class="region-tag">' + (REGIONS[ans.toUpperCase()] || '') + '</div>' +
           '<div style="color:#888;font-size:13px;margin-top:8px">输入 ' + ans.toUpperCase() + ' 继续</div>';
    } else {
      const full = getFull(v);
      const jm = jmCodes(v);
      fh = '<div style="font-size:15px;margin-bottom:6px;color:#dc2626">编码错误</div>' +
           '<div class="fb-codes">' +
           (jm ? '<div class="li-jm">' + jm + '</div>' : '') +
           (full ? '<div class="li-code">' + full.toUpperCase() + '</div>' : '') +
           '</div>';
      if (MODES[modeIdx].explain) {
        const parts = getSplit(v);
        if (parts.length) {
          fh += '<div class="root-chars">' + parts.map(x => '<span>' + x + '</span>').join('') + '</div>';
        }
      }
      fh += '<div style="color:#888;font-size:13px;margin-top:6px">照着上面输入正确编码</div>';
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
  buildMenu();
  document.getElementById('menu').querySelectorAll('.menu-item')[0].classList.add('active');
  buildMaps();
  document.querySelectorAll('.version-switch .vs-btn').forEach(b => {
    b.classList.toggle('active', b.id === 'v' + version);
  });
  startSession();
})();
