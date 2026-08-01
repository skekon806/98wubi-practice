const MODES = [
  { key: 'root', name: '码元练习', sub: '键名+码元', explain: false, root: true, data: window.WUBI_DATA['root'] },
  { key: 'jm1', name: '一级简码', sub: '25字 · 单键', explain: false, data: window.WUBI_DATA['jm1'] },
  { key: 'jm2', name: '二级简码', sub: '611字 · 两键', explain: true, data: window.WUBI_DATA['jm2'] },
  { key: 'jm3', name: '三级简码', sub: '668字 · 三键', explain: true, data: window.WUBI_DATA['jm3'] },
  { key: 'encode1', name: '常用前500', sub: '高频500字', explain: true, data: window.WUBI_DATA['encode1'] },
  { key: 'encode2', name: '常用中500', sub: '次频500字', explain: true, data: window.WUBI_DATA['encode2'] },
  { key: 'encode3', name: '常用后500', sub: '低频500字', explain: true, data: window.WUBI_DATA['encode3'] },
];

// 复习间隔（单位：题，1组=5题）：2组 → 5组 → 10组 → 20组 → 40组 → 80组
const INTERVALS = [10, 25, 50, 100, 200, 400];

const REGIONS = {
  'G':'横区','F':'横区','D':'横区','S':'横区','A':'横区',
  'H':'竖区','J':'竖区','K':'竖区','L':'竖区','M':'竖区',
  'T':'撇区','R':'撇区','E':'撇区','W':'撇区','Q':'撇区',
  'Y':'捺区','U':'捺区','I':'捺区','O':'捺区','P':'捺区',
  'N':'折区','B':'折区','V':'折区','C':'折区','X':'折区'
};
const SAVE_KEY = 'wubi98_';

// 从 98.txt 转的拆解字典（data/decomp.js）查询某字的码元拆解
function getSplit(v) {
  const raw = window.WUBI_DECOMP && window.WUBI_DECOMP[v];
  if (!raw) return [];
  return Array.from(raw);
}

// 从 98_2.txt 转的全码字典（data/code.js）查询某字的全码
function getFull(v) {
  return (window.WUBI_CODE && window.WUBI_CODE[v]) || '';
}

let view = 'practice';

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
    h += '<div class="lookup-item"><div class="li-char">' + ch + '</div>' +
         '<div class="li-code">' + full + '</div>' +
         '<div class="li-split">' +
         (split.length ? split.map(x => '<span class="ls-glyph">' + x + '</span>').join('') : '') +
         '</div></div>';
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
  return { queue: shuffle([...DATA]), cards: {}, pos: 0, correct: 0, wrong: 0 };
}

function ensureSchedule(v) {
  let c = state.cards[v];
  if (!c) c = state.cards[v] = { level: 0, nextAt: 0 };
  return c;
}

function startLevel() {
  DATA.forEach(c => ensureSchedule(c.v));
}

// ---------- 复习调度 ----------
// state.pos = 已完成的题数；卡片答完后 nextAt = pos + INTERVALS[level]
// 到期判断：nextAt <= pos（即过了 N 题后复现）

function scheduledReviews() {
  const list = [];
  DATA.forEach(c => {
    const s = state.cards[c.v];
    if (s && s.nextAt > 0) list.push({ card: c, nextAt: s.nextAt, level: s.level });
  });
  list.sort((a, b) => a.nextAt - b.nextAt);
  return list;
}

function dueReviews() {
  return scheduledReviews().filter(r => r.nextAt <= state.pos);
}

function pendingReviews() {
  return scheduledReviews().length;
}

function getNextCard() {
  // 1) 到期的复习优先
  const due = dueReviews();
  if (due.length) return { card: due[0].card, fromReview: true, final: false };

  // 2) 新卡
  if (state.queue.length) {
    const card = state.queue.shift();
    return { card, fromReview: false, final: false };
  }

  // 3) 新卡练完 → 进入复习阶段，按到期顺序把剩余复习走完（final：答完即清，不再排期）
  const rest = scheduledReviews();
  if (rest.length) return { card: rest[0].card, fromReview: true, final: true };

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
  const s = loadState();
  if (s) {
    if (confirm('「' + MODES[modeIdx].name + '」上次练到第 ' + s.pos + ' 题，剩余 ' + s.queue.length + ' 项。继续？\n点【取消】从头开始（删除该模式进度）')) {
      state = s;
    } else {
      state = freshState();
    }
  } else {
    state = freshState();
  }
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
      this.value = this.value.toLowerCase();
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
  const { card, fromReview, final } = current;
  const isRoot = !!MODES[modeIdx].root;

  const boxes = document.querySelectorAll('.code-box');
  let typed = '';
  boxes.forEach(b => typed += b.value);
  typed = typed.toLowerCase();

  if (typed === card.a.toLowerCase()) {
    const st = ensureSchedule(card.v);
    if (fromReview && final) {
      // 复习阶段：答完即清，不再排期
      if (!isRetry) state.correct++;
      st.level = 0;
      st.nextAt = 0;
    } else if (fromReview) {
      // 到期复习答对：间隔升级（2组→5组→10组→20组→40组→80组）
      st.level = Math.min(st.level + 1, INTERVALS.length - 1);
      st.nextAt = state.pos + INTERVALS[st.level];
      state.correct++;
    } else if (!isRetry) {
      // 新卡首答：无论对错都进入复习曲线（答错时的安排已在出错分支写入）
      state.correct++;
      if (!st.nextAt) {
        st.level = 0;
        st.nextAt = state.pos + INTERVALS[0];
      }
    }
    // 答错后的重打答对：不改变复习安排

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
      if (!final) {
        const st = ensureSchedule(card.v);
        st.level = 0;
        st.nextAt = state.pos + INTERVALS[0];
      }
      isRetry = true;
    }
    boxes.forEach((b, i) => {
      if (b.value && b.value.toLowerCase() !== card.a[i]) b.className = 'code-box wrong';
      else if (b.value && b.value.toLowerCase() === card.a[i]) b.className = 'code-box correct';
      else b.className = 'code-box filled';
    });
    const fb = document.getElementById('feedback');
    fb.className = 'feedback wrong';
    fb.style.display = 'block';
    let fh = '';
    if (isRoot) {
      fh = '<div class="key-hint">' + card.a + ' 键</div>' +
           '<div class="region-tag">' + (REGIONS[card.a.toUpperCase()] || '') + '</div>' +
           '<div style="color:#888;font-size:13px;margin-top:8px">输入 ' + card.a + ' 继续</div>';
    } else {
      fh = '<div style="font-size:15px;margin-bottom:6px;color:#dc2626">编码错误</div>' +
           '<div style="font-size:15px;color:#4f6cf7">正确: <strong>' + card.a + '</strong>';
      const full = getFull(card.v);
      if (MODES[modeIdx].explain && full) fh += ' <span class="full-code">(全码 ' + full + ')</span>';
      fh += '</div>';
      const parts = getSplit(card.v);
      if (MODES[modeIdx].explain && parts.length) {
        fh += '<div class="root-chars">' + parts.map(x => '<span>' + x + '</span>').join('') + '</div>';
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
  if (state.queue.length === 0 && pendingReviews() > 0) {
    p.textContent = '复习阶段 · 剩余 ' + pendingReviews() + ' 道复习';
  } else {
    p.textContent = '剩余 ' + state.queue.length + ' · 已学 ' + (total - state.queue.length) + ' / ' + total;
  }
}

function updateStats() {
  document.getElementById('correctCount').textContent = state.correct;
  document.getElementById('wrongCount').textContent = state.wrong;
  document.getElementById('reviewBadge').textContent = '待复习: ' + dueReviews().length;
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
  const s = loadState();
  if (s) {
    if (confirm('「' + MODES[0].name + '」上次练到第 ' + s.pos + ' 题，剩余 ' + s.queue.length + ' 项。继续？\n点【取消】从头开始（删除该模式进度）')) {
      state = s;
    } else {
      state = freshState();
    }
  } else {
    state = freshState();
  }
  startLevel();
  showCurrent();
})();
