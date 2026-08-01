const MODES = [
  { key: 'root', name: '码元练习', sub: '键名+码元', explain: false, root: true, data: window.WUBI_DATA['root'] },
  { key: 'jm1', name: '一级简码', sub: '25字 · 单键', explain: false, data: window.WUBI_DATA['jm1'] },
  { key: 'jm2', name: '二级简码', sub: '613字 · 两键', explain: true, data: window.WUBI_DATA['jm2'] },
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

// 从 spelling2.txt 转的字典（data/dict.js）：字 → {s 拆解, c 全码}
function getSplit(v) {
  const e = window.WUBI_DICT && window.WUBI_DICT[v];
  return e && e.s ? Array.from(e.s) : [];
}

// 查询某字的全码
function getFull(v) {
  return (window.WUBI_DICT && window.WUBI_DICT[v] && window.WUBI_DICT[v].c) || '';
}

let view = 'practice';

// 简码映射：字 -> 一级/二级/三级简码（供反查显示）
const JM1_MAP = {};
const JM2_MAP = {};
const JM3_MAP = {};
function buildJmMaps() {
  (window.WUBI_DATA['jm1'] || []).forEach(c => JM1_MAP[c.v] = c.a);
  (window.WUBI_DATA['jm2'] || []).forEach(c => JM2_MAP[c.v] = c.a);
  (window.WUBI_DATA['jm3'] || []).forEach(c => JM3_MAP[c.v] = c.a);
}

function jmCodes(ch) {
  const out = [];
  if (JM1_MAP[ch]) out.push(JM1_MAP[ch].toUpperCase());
  if (JM2_MAP[ch]) out.push(JM2_MAP[ch].toUpperCase());
  if (JM3_MAP[ch]) out.push(JM3_MAP[ch].toUpperCase());
  return out.join(' · ');
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
    showCurrent();
  }
}

function lookupChar() {
  const input = document.getElementById('lookupInput').value;
  const box = document.getElementById('lookupResult');
  if (!input) {
    box.innerHTML = '<div class="lookup-hint">输入一个或多个汉字，实时反查编码与拆解</div>';
    return;
  }
  let h = '';
  for (const ch of input) {
    if (/\s/.test(ch)) continue;
    const full = getFull(ch);
    const split = getSplit(ch);
    if (!full && !split.length) {
      h += '<div class="lookup-item"><div class="li-char">' + ch + '</div><div class="li-missing">未收录</div></div>';
      continue;
    }
    const jm = jmCodes(ch);
    h += '<div class="lookup-item"><div class="li-char">' + ch + '</div>' +
         '<div class="li-codes"><div class="li-code">' + full.toUpperCase() + '</div>' +
         (jm ? '<div class="li-jm">' + jm + '</div>' : '') + '</div>' +
         (split.length ? '<div class="li-split">' + split.map(x => '<span class="ls-glyph">' + x + '</span>').join('') + '</div>' : '') +
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
function saveState() {
  localStorage.setItem(SAVE_KEY + MODES[modeIdx].key, JSON.stringify(state));
}

function loadState() {
  try {
    const raw = localStorage.getItem(SAVE_KEY + MODES[modeIdx].key);
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (!s || !s.queue || !s.cards) return null;
    return s;
  } catch (e) { return null; }
}

function freshState() {
  return { queue: shuffle([...DATA]), cards: {}, pos: 0, correct: 0, wrong: 0, seen: 0, done: 0 };
}

function ensureSchedule(v) {
  let c = state.cards[v];
  if (!c) c = state.cards[v] = { level: 0 };
  return c;
}

function startLevel() {
  DATA.forEach(c => ensureSchedule(c.v));
}

// ---------- 学习队列（错题回炉 + 间隔 5→20→50） ----------
// 卡片答完按间隔回炉到学习队列，间隔满即完成；答错重置为 5 题后回来
function requeue(card, depth) {
  card._reinsert = true;
  const pos = Math.min(depth, state.queue.length);
  state.queue.splice(pos, 0, card);
}

function getNextCard() {
  if (state.queue.length) {
    const card = state.queue.shift();
    const fromReview = !!card._reinsert;
    delete card._reinsert;
    if (!fromReview) state.seen++;
    return { card, fromReview };
  }
  return null;
}

// ---------- 菜单与模式 ----------
function buildMenu() {
  const menu = document.getElementById('menu');
  let h = '';
  MODES.forEach((m, i) => {
    h += '<div class="menu-item" onclick="switchMode(' + i + ')"><div>' + m.name + '</div><div class="sub">' + m.sub + ' · ' + m.data.length + '项</div></div>';
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
  DATA = MODES[modeIdx].data;
  toggleMenu();
  document.getElementById('menu').querySelectorAll('.menu-item').forEach((el, i) => {
    el.classList.toggle('active', i === modeIdx);
  });
  state = loadState() || freshState();
  startLevel();
  showCurrent();
}

function resetProgress() {
  if (confirm('确定重置「' + MODES[modeIdx].name + '」的进度吗？')) {
    localStorage.removeItem(SAVE_KEY + MODES[modeIdx].key);
    state = freshState();
    startLevel();
    showCurrent();
  }
}

// ---------- 出题 ----------
function showCurrent() {
  current = getNextCard();
  if (!current) { endGame(); return; }
  const card = current.card;
  const m = MODES[modeIdx];
  const isRoot = !!m.root;

  document.getElementById('modeTitle').textContent = m.name + ' · ' + m.sub;

  const cd = document.getElementById('charDisplay');
  cd.style.display = 'block';
  cd.textContent = card.v;
  cd.className = isRoot ? 'char-display root-char' : 'char-display';

  updateProgress();
  document.getElementById('hintText').textContent = current.fromReview
    ? '复习 (' + state.cards[card.v].level + '/' + INTERVALS.length + ') · 输入' + (isRoot ? '键位' : '编码 ' + card.a.length + '键')
    : isRoot ? '输入对应的字母键' : '输入编码（' + card.a.length + '个键）';

  const fb = document.getElementById('feedback');
  fb.className = 'feedback';
  fb.style.display = 'none';

  buildInputs(card.a.length, isRoot);
  isRetry = false;
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
  const isRoot = !!MODES[modeIdx].root;

  const boxes = document.querySelectorAll('.code-box');
  let typed = '';
  boxes.forEach(b => typed += b.value);
  typed = typed.toUpperCase();

  if (typed === card.a.toUpperCase()) {
    const st = ensureSchedule(card.v);
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
        st.level = 0;
        requeue(card, INTERVALS[0]);
      }
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
      const st = ensureSchedule(card.v);
      st.level = 0;
      requeue(card, INTERVALS[0]); // 答错：5 题后回炉
      isRetry = true;
    }
    boxes.forEach((b, i) => {
      if (b.value && b.value.toUpperCase() !== card.a[i].toUpperCase()) b.className = 'code-box wrong';
      else if (b.value && b.value.toUpperCase() === card.a[i].toUpperCase()) b.className = 'code-box correct';
      else b.className = 'code-box filled';
    });
    const fb = document.getElementById('feedback');
    fb.className = 'feedback wrong';
    fb.style.display = 'block';
    let fh = '';
    if (isRoot) {
      fh = '<div class="key-hint">' + card.a.toUpperCase() + ' 键</div>' +
           '<div class="region-tag">' + (REGIONS[card.a.toUpperCase()] || '') + '</div>' +
           '<div style="color:#888;font-size:13px;margin-top:8px">输入 ' + card.a.toUpperCase() + ' 继续</div>';
    } else {
      const full = getFull(card.v);
      const jm = jmCodes(card.v);
      fh = '<div style="font-size:15px;margin-bottom:6px;color:#dc2626">编码错误</div>' +
           '<div class="fb-codes">' +
           (jm ? '<div class="li-jm">' + jm + '</div>' : '') +
           (full ? '<div class="li-code">' + full.toUpperCase() + '</div>' : '') +
           '</div>';
      if (MODES[modeIdx].explain) {
        const parts = getSplit(card.v);
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
  const total = m.data.length;
  const p = document.getElementById('progress');
  p.textContent = '剩余 ' + state.queue.length + ' · 已学 ' + state.seen + ' / ' + total;
}

function updateStats() {
  document.getElementById('correctCount').textContent = state.correct;
  document.getElementById('wrongCount').textContent = state.wrong;
  document.getElementById('reviewBadge').textContent = '复习中: ' + (state.seen - state.done);
}

function endGame() {
  localStorage.removeItem(SAVE_KEY + MODES[modeIdx].key);
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
  buildJmMaps();
  state = loadState() || freshState();
  startLevel();
  showCurrent();
})();
