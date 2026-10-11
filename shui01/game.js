/* ============================================================
 *  水果消消乐（零依赖）
 *  玩法：点水果放进底部 7 个格子，三个一样自动消除；格子满了就失败
 *  · 水果分层堆叠，被上层压住的不能点
 *  · 每关的牌都是「可解」的：先模拟出一条合法取牌顺序，
 *    再按顺序每 3 张分配同一种水果 —— 照着这条顺序一定能通关
 *  · 道具：撤销 / 洗牌 / 移出
 * ============================================================ */
(function () {
  'use strict';

  var COLS = 6, ROWS = 6;                 // 摆牌用的逻辑格子（越小越紧凑）
  var OFF = [                             // 每一层的偏移（半格错位，形成压叠）
    { x: 0,   y: 0   },
    { x: 0.5, y: 0.5 },
    { x: 0.5, y: 0   }
  ];
  var SLOTS = 7;                          // 底部格子数
  var FRUITS = ['🍎', '🍊', '🍋', '🍇', '🍉', '🍓', '🍒', '🥝', '🍑', '🍍'];
  var STORE = { level: 'shui.best', sound: 'shui.sound' };

  /* ---------------- DOM ---------------- */
  var $ = function (id) { return document.getElementById(id); };
  var stageEl = $('stage'), pileEl = $('pile'), trayEl = $('tray');
  var elLevel = $('level'), elLeft = $('left'), elCleared = $('cleared'), elBest = $('best');
  var undoBtn = $('undoBtn'), shuffleBtn = $('shuffleBtn'), popBtn = $('popBtn'), restartBtn = $('restartBtn');
  var undoN = $('undoN'), shuffleN = $('shuffleN'), popN = $('popN');
  var overlay = $('overlay'), ovEmoji = $('ovEmoji'), ovTitle = $('ovTitle'), ovSub = $('ovSub'), ovBtn = $('ovBtn'), ovTip = $('ovTip');
  var soundBtn = $('soundBtn');

  /* ---------------- 状态 ---------------- */
  var level = 1, best = 1, cleared = 0;
  var tiles = [];                 // 全部牌
  var tray = [];                  // 底部格子里的牌（左→右）
  var history = [];               // 撤销用
  var props = { undo: 2, shuffle: 1, pop: 1 };
  var busy = false, playing = false, over = false;
  var slotEls = [];
  var solveOrder = [];            // 构造出来的合法取牌顺序（用于验证/自测）
  var soundOn = true;             // 音效（WebAudio 合成，无音频文件）

  /* ---------------- 音效 ---------------- */
  var actx = null;
  function ac() {
    if (!actx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      try { actx = new AC(); } catch (e) { actx = null; }
    }
    if (actx && actx.state === 'suspended') { try { actx.resume(); } catch (e) {} }
    return actx;
  }

  function tone(freq, dur, opt) {
    if (!soundOn) return;
    try {
      var c = ac(); if (!c) return;
      opt = opt || {};
      var t0 = c.currentTime + (opt.delay || 0);
      var o = c.createOscillator(), g = c.createGain();
      o.type = opt.type || 'triangle';
      o.frequency.setValueAtTime(freq, t0);
      if (opt.to) o.frequency.exponentialRampToValueAtTime(opt.to, t0 + dur);
      var peak = opt.gain == null ? 0.09 : opt.gain;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(peak, t0 + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(g); g.connect(c.destination);
      o.start(t0); o.stop(t0 + dur + 0.05);
    } catch (e) { /* 音效失败绝不影响玩法 */ }
  }

  var SFX = {
    pick: function () { tone(680, 0.10, { to: 1020, gain: 0.085 }); },
    clear: function () {
      [784, 988, 1319].forEach(function (f, i) { tone(f, 0.20, { delay: i * 0.055, gain: 0.10, type: 'sine' }); });
    },
    prop: function () { tone(540, 0.12, { to: 820, gain: 0.075, type: 'square' }); },
    shuffle: function () {
      for (var i = 0; i < 6; i++) tone(480 + i * 70, 0.05, { delay: i * 0.045, gain: 0.055, type: 'square' });
    },
    warn: function () { tone(330, 0.16, { to: 260, gain: 0.07, type: 'sine' }); },
    win: function () {
      [523, 659, 784, 1047, 1319].forEach(function (f, i) { tone(f, 0.32, { delay: i * 0.09, gain: 0.10, type: 'sine' }); });
    },
    lose: function () {
      [392, 330, 262, 196].forEach(function (f, i) { tone(f, 0.30, { delay: i * 0.10, gain: 0.09, type: 'sawtooth' }); });
    }
  };

  function rand(n) { return Math.floor(Math.random() * n); }
  function centered(n) {                                                                  // 中间密一些
    return Math.floor((Math.random() + Math.random() + Math.random()) / 3 * n);
  }
  function shuffleArr(a) {
    for (var i = a.length - 1; i > 0; i--) {
      var j = rand(i + 1), t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }
  function overlap(a, b) { return Math.abs(a.x - b.x) < 0.999 && Math.abs(a.y - b.y) < 0.999; }
  function onBoard() { return tiles.filter(function (t) { return t.on; }); }

  /* ---------------- 关卡参数 ---------------- */
  function levelPlan(n) {
    var groups = 6 + n * 2;                                  // 每关三张一组
    var kinds = Math.min(FRUITS.length, 4 + Math.floor(n / 2));
    var layers = n < 3 ? 2 : 3;
    return { groups: groups, kinds: kinds, layers: layers, total: groups * 3 };
  }

  /* ---------------- 生成牌局 ---------------- */
  function genTiles(plan) {
    var list = [], used = {}, layer, i;
    // 每层放多少张（越上层越少）
    var ratio = plan.layers === 2 ? [0.62, 0.38] : [0.5, 0.32, 0.18];
    var counts = ratio.map(function (r) { return Math.round(plan.total * r); });
    // 修正总数
    var sum = counts.reduce(function (a, b) { return a + b; }, 0);
    counts[0] += plan.total - sum;

    for (layer = 0; layer < plan.layers; layer++) {
      for (i = 0; i < counts[layer]; i++) {
        var guard = 0, c, r, key;
        do {
          c = centered(COLS); r = centered(ROWS);
          key = layer + ':' + c + ',' + r;
          guard++;
        } while (used[key] && guard < 400);
        used[key] = 1;
        list.push({
          x: c + OFF[layer].x,
          y: r + OFF[layer].y,
          layer: layer,
          kind: '',
          on: true,
          free: false
        });
      }
    }
    return list;
  }

  /* 取牌顺序模拟：每次取一张当前没被压住的牌 */
  function removalOrder(list) {
    var remain = list.slice(), order = [];
    while (remain.length) {
      var freeIdx = [], i, j;
      for (i = 0; i < remain.length; i++) {
        var blocked = false;
        for (j = 0; j < remain.length; j++) {
          if (j === i) continue;
          if (remain[j].layer > remain[i].layer && overlap(remain[j], remain[i])) { blocked = true; break; }
        }
        if (!blocked) freeIdx.push(i);
      }
      if (!freeIdx.length) break;
      var p = freeIdx[rand(freeIdx.length)];
      order.push(remain[p]);
      remain.splice(p, 1);
    }
    return order;
  }

  /* 按「取牌顺序每 3 张同一种」分配水果 —— 保证有解 */
  function assignKinds(list, plan) {
    var order = removalOrder(list);
    solveOrder = order;
    var kinds = FRUITS.slice(0, plan.kinds);
    var pool = [];
    for (var g = 0; g < plan.groups; g++) pool.push(kinds[g % kinds.length]);
    shuffleArr(pool);
    for (var i = 0; i < order.length; i++) {
      var gi = Math.floor(i / 3);
      order[i].kind = pool[gi % pool.length];
    }
  }

  /* ---------------- 布局 ---------------- */
  function layout() {
    var on = onBoard();
    if (!on.length) return;
    var minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
    on.forEach(function (t) {
      minX = Math.min(minX, t.x); minY = Math.min(minY, t.y);
      maxX = Math.max(maxX, t.x + 1); maxY = Math.max(maxY, t.y + 1);
    });
    var wUnits = maxX - minX + 0.4, hUnits = maxY - minY + 0.4;
    var rect = stageEl.getBoundingClientRect();
    var size = Math.max(20, Math.floor(Math.min(rect.width / wUnits, rect.height / hUnits)));
    document.documentElement.style.setProperty('--tile', size + 'px');
    on.forEach(function (t) {
      t.px = (t.x - minX + 0.3).toFixed(3);
      t.py = (t.y - minY + 0.3).toFixed(3);
      if (t.el) {
        t.el.style.setProperty('--x', t.px);
        t.el.style.setProperty('--y', t.py);
      }
    });
  }

  /* ---------------- 画面 ---------------- */
  function buildBoard() {
    pileEl.innerHTML = '';
    tiles.forEach(function (t) {
      var el = document.createElement('div');
      el.className = 'tile';
      el.textContent = t.kind;
      el.style.zIndex = String(10 + t.layer);
      el.addEventListener('click', function () { pick(t); });
      t.el = el;
      pileEl.appendChild(el);
    });
    layout();
    refreshFree();
  }

  function refreshFree() {
    var on = onBoard();
    on.forEach(function (a) {
      var blocked = on.some(function (b) {
        return b !== a && b.layer > a.layer && overlap(b, a);
      });
      a.free = !blocked;
      if (a.el) {
        a.el.classList.toggle('blocked', blocked);
        a.el.classList.toggle('free', !blocked);
      }
    });
  }

  function buildTray() {
    trayEl.innerHTML = '';
    slotEls = [];
    for (var i = 0; i < SLOTS; i++) {
      var s = document.createElement('div');
      s.className = 'slot';
      trayEl.appendChild(s);
      slotEls.push(s);
    }
    renderTray();
  }

  function renderTray() {
    for (var i = 0; i < SLOTS; i++) {
      var s = slotEls[i], t = tray[i];
      if (!s) continue;
      s.textContent = t ? t.kind : '';
      s.classList.toggle('filled', !!t);
      s.classList.remove('clearing');
    }
    trayEl.classList.toggle('danger', tray.length >= SLOTS - 1);
  }

  function syncStats() {
    elLevel.textContent = level;
    elLeft.textContent = onBoard().length;
    elCleared.textContent = cleared;
    elBest.textContent = best;
    undoN.textContent = props.undo;
    shuffleN.textContent = props.shuffle;
    popN.textContent = props.pop;
    undoBtn.disabled = props.undo <= 0 || !history.length;
    shuffleBtn.disabled = props.shuffle <= 0;
    popBtn.disabled = props.pop <= 0 || !tray.length;
  }

  /* ---------------- 交互 ---------------- */
  function pick(t) {
    if (busy || over || !playing) return;
    if (!t.on || !t.free) return;

    t.on = false;
    if (t.el) {
      t.el.classList.add('picked');
      var el = t.el;
      setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 160);
      t.el = null;
    }
    tray.push(t);
    history.push(t);
    SFX.pick();
    refreshFree();
    renderTray();
    syncStats();
    afterPick();
  }

  function afterPick() {
    busy = true;
    setTimeout(function () {
      var hit = findTriple();
      if (hit === null) {
        busy = false;
        if (tray.length === SLOTS - 1) SFX.warn();     // 只剩一格：提醒
        checkEnd();
        return;
      }
      SFX.clear();
      // 三个一样：播放消除动画再移除
      hit.forEach(function (i) { if (slotEls[i]) slotEls[i].classList.add('clearing'); });
      setTimeout(function () {
        hit.slice().sort(function (a, b) { return b - a; }).forEach(function (i) { tray.splice(i, 1); });
        cleared += 3;
        history = [];
        renderTray();
        syncStats();
        busy = false;
        afterPick();                       // 可能又凑出三连
      }, 300);
    }, 120);
  }

  function findTriple() {
    var pos = {};
    for (var i = 0; i < tray.length; i++) {
      var k = tray[i].kind;
      (pos[k] = pos[k] || []).push(i);
      if (pos[k].length === 3) return pos[k];
    }
    return null;
  }

  function checkEnd() {
    if (!onBoard().length && !tray.length) return win();
    if (tray.length >= SLOTS) return lose();
  }

  function win() {
    over = true; playing = false;
    SFX.win();
    level++;
    best = Math.max(best, level);
    try { localStorage.setItem(STORE.level, String(best)); } catch (e) {}
    syncStats();
    showOverlay('win');
  }

  function lose() {
    over = true; playing = false;
    SFX.lose();
    showOverlay('lose');
  }

  function showOverlay(kind) {
    overlay.hidden = false;
    if (kind === 'ready') {
      ovEmoji.textContent = '🍎';
      ovTitle.textContent = '水果消消乐';
      ovSub.textContent = '点水果放进下面 7 个格子，三个一样就消掉；格子满了就闯关失败。';
      ovBtn.textContent = '开始第 ' + level + ' 关';
      ovTip.textContent = '被上层压住的牌不能点（颜色会变暗）';
    } else if (kind === 'win') {
      ovEmoji.textContent = '🎉';
      ovTitle.textContent = '第 ' + (level - 1) + ' 关通过！';
      ovSub.textContent = '下一关牌更多、水果种类也更多。';
      ovBtn.textContent = '继续第 ' + level + ' 关';
      ovTip.textContent = '最高关卡 ' + best;
    } else {
      ovEmoji.textContent = '😵';
      ovTitle.textContent = '格子满了';
      ovSub.textContent = '试试优先点同一层的牌，凑齐三个就清掉；道具也能救一下。';
      ovBtn.textContent = '重开第 ' + level + ' 关';
      ovTip.textContent = '已消除 ' + cleared + ' 个水果';
    }
  }

  /* ---------------- 开局 ---------------- */
  function startLevel() {
    over = false; playing = false; busy = false;
    tray = []; history = []; cleared = 0;
    props = { undo: 2, shuffle: 1, pop: 1 };

    var plan = levelPlan(level);
    tiles = genTiles(plan);
    assignKinds(tiles, plan);
    buildBoard();
    buildTray();
    syncStats();
    showOverlay('ready');
  }

  function play() {
    overlay.hidden = true;
    playing = true; over = false;
  }

  /* ---------------- 道具 ---------------- */
  function doUndo() {
    if (busy || over || !playing || props.undo <= 0 || !history.length) return;
    SFX.prop();
    var t = history.pop();
    var i = tray.indexOf(t);
    if (i < 0) return;
    tray.splice(i, 1);
    t.on = true;
    var el = document.createElement('div');
    el.className = 'tile';
    el.textContent = t.kind;
    el.style.zIndex = String(10 + t.layer);
    el.addEventListener('click', function () { pick(t); });
    t.el = el;
    pileEl.appendChild(el);
    props.undo--;
    layout();
    refreshFree();
    renderTray();
    syncStats();
  }

  function doShuffle() {
    if (busy || over || !playing || props.shuffle <= 0) return;
    SFX.shuffle();
    var on = onBoard();
    var kinds = on.map(function (t) { return t.kind; });
    shuffleArr(kinds);
    on.forEach(function (t, i) {
      t.kind = kinds[i];
      if (t.el) t.el.textContent = t.kind;
    });
    props.shuffle--;
    syncStats();
  }

  function doPop() {
    if (busy || over || !playing || props.pop <= 0 || !tray.length) return;
    SFX.prop();
    var take = tray.splice(0, Math.min(3, tray.length));
    var maxLayer = 0;
    tiles.forEach(function (t) { maxLayer = Math.max(maxLayer, t.layer); });
    take.forEach(function (t) {
      t.on = true;
      t.layer = maxLayer + 1;                    // 放回最上层，保证能点
      t.x = (centered(COLS) + 0.5);
      t.y = (centered(ROWS) + 0.5);
      var el = document.createElement('div');
      el.className = 'tile';
      el.textContent = t.kind;
      el.style.zIndex = String(10 + t.layer);
      el.addEventListener('click', function () { pick(t); });
      t.el = el;
      pileEl.appendChild(el);
    });
    props.pop--;
    history = [];
    layout();
    refreshFree();
    renderTray();
    syncStats();
  }

  /* ---------------- 绑定 ---------------- */
  ovBtn.addEventListener('click', function () {
    if (!playing && !over) { play(); return; }     // 开始本关
    if (over) { startLevel(); play(); return; }    // 通关/失败后重开本关
    play();
  });
  restartBtn.addEventListener('click', function () { startLevel(); play(); });
  function syncSoundBtn() { soundBtn.textContent = '音效：' + (soundOn ? '开' : '关'); }
  soundBtn.addEventListener('click', function () {
    soundOn = !soundOn;
    syncSoundBtn();
    try { localStorage.setItem(STORE.sound, soundOn ? '1' : '0'); } catch (e) {}
    if (soundOn) SFX.clear();          // 打开时给个提示音
  });
  undoBtn.addEventListener('click', doUndo);
  shuffleBtn.addEventListener('click', doShuffle);
  popBtn.addEventListener('click', doPop);
  window.addEventListener('resize', function () { layout(); });
  if (window.ResizeObserver) {
    try { new ResizeObserver(function () { layout(); }).observe(stageEl); } catch (e) {}
  }

  /* ---------------- 初始化 ---------------- */
  best = parseInt((function () { try { return localStorage.getItem(STORE.level) || '1'; } catch (e) { return '1'; } })(), 10) || 1;
  soundOn = (function () { try { return localStorage.getItem(STORE.sound) !== '0'; } catch (e) { return true; } })();
  syncSoundBtn();
  startLevel();

  /* 调试/自测接口 */
  window.FruitGame = {
    state: function () {
      return {
        level: level, best: best, cleared: cleared, tray: tray.length,
        left: onBoard().length, free: onBoard().filter(function (t) { return t.free; }).length,
        kindsLeft: (function () {
          var m = {}; onBoard().forEach(function (t) { m[t.kind] = (m[t.kind] || 0) + 1; });
          return m;
        })(),
        playing: playing, over: over
      };
    },
    play: play,
    /* 自测用：随便点 n 张可点的牌进格子 */
    pickSome: function (n) {
      for (var k = 0; k < n; k++) {
        var free = onBoard().filter(function (t) { return t.free; });
        if (!free.length) break;
        var t = free[rand(free.length)];
        t.on = false;
        if (t.el) { t.el.classList.add('picked'); t.el = null; }
        tray.push(t);
        var h = findTriple();
        if (h) { h.slice().sort(function (a, b) { return b - a; }).forEach(function (i) { tray.splice(i, 1); }); cleared += 3; }
        refreshFree(); renderTray(); syncStats();
      }
      return { tray: tray.length, left: onBoard().length };
    },
    /* 跳到指定关并开始（自测用） */
    gotoLevel: function (n) { level = Math.max(1, n | 0); startLevel(); play(); },
    /* 回放构造出的合法顺序，验证这一关必定有解 */
    solveExact: function () {
      var seq = solveOrder.slice();
      for (var i = 0; i < seq.length; i++) {
        var t = seq[i];
        if (!t.on) continue;
        t.on = false;
        if (t.el) { t.el.classList.add('picked'); t.el = null; }
        tray.push(t);
        var h = findTriple();
        if (h) {
          h.slice().sort(function (a, b) { return b - a; }).forEach(function (k) { tray.splice(k, 1); });
          cleared += 3;
        }
        if (tray.length > SLOTS) return { fail: 'tray overflow @' + i, moves: i };
      }
      refreshFree(); renderTray(); syncStats();
      return { ok: true, left: onBoard().length, tray: tray.length, cleared: cleared };
    },
    /* 自动按「合法取牌顺序」通关，用于验证有解 */
    autoSolve: function (limit) {
      var guard = 0, moves = 0;
      while (guard++ < (limit || 2000)) {
        var on = onBoard();
        if (!on.length && !tray.length) break;
        var free = on.filter(function (t) { return t.free; });
        if (!free.length) break;
        // 优先点「能让 tray 里已有两个的那种」凑三连
        var best = null;
        for (var i = 0; i < free.length; i++) {
          var c = 0;
          tray.forEach(function (t) { if (t.kind === free[i].kind) c++; });
          if (c >= 2) { best = free[i]; break; }
        }
        var t = best || free[rand(free.length)];
        t.on = false;
        if (t.el) { t.el.classList.add('picked'); var el = t.el; t.el = null; setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 160); }
        tray.push(t);
        moves++;
        refreshFree();
        renderTray();
        syncStats();
        if (tray.length > SLOTS) return { fail: 'overflow', moves: moves };
        // 立即结算三连（跳过动画）
        var h = findTriple();
        if (h) { h.slice().sort(function (a, b) { return b - a; }).forEach(function (i) { tray.splice(i, 1); }); cleared += 3; renderTray(); syncStats(); }
      }
      return { moves: moves, left: onBoard().length, tray: tray.length, cleared: cleared };
    }
  };
})();
