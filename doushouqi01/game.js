/* =========================================================
 *  斗兽棋 · 暗棋
 *  规则完全照 xyx/斗兽棋-creator（dsq）里的 GameEngine：
 *  - 16 张牌铺成 4×4，全部背面朝上
 *  - 一步只能「翻开一张暗牌」或「把已翻开的牌走到相邻格」
 *  - 第一次翻牌的人拿这张牌的颜色，对手拿另一种颜色
 *  - 大吃小；同级别同归于尽；最小的猪能吃最大的象（源码 fromV==0 && nextV==7）
 *  - 牌全部翻开且一方棋子被吃光 → 另一方胜（源码 checkWin）
 *  素材：原工程 animal/*_square.png 与 card-back.png
 * ========================================================= */
(function () {
  'use strict';

  const N = 4;                        // 4×4
  const DARK = -1, EMPTY = -2;        // 暗牌 / 空位
  const BLUE = 0, RED = 1;            // 源码：0x00 蓝 / 0x10 红
  const ANIMALS = [                   // 由弱到强（源码 0..7）
    { id: 'pig',       name: '猪' },
    { id: 'gorilla',   name: '猩猩' },
    { id: 'crocodile', name: '鳄鱼' },
    { id: 'bear',      name: '熊' },
    { id: 'walrus',    name: '海象' },
    { id: 'tiger',     name: '虎' },
    { id: 'lion',      name: '狮' },
    { id: 'elephant',  name: '象' }
  ];
  const FONT = '"PingFang SC","Microsoft YaHei",system-ui,sans-serif';
  const COL = { 0: '#4a90e2', 1: '#e2574a' };
  const COL_D = { 0: '#2f6fb5', 1: '#b03b31' };
  const COL_L = { 0: '#a8d2ff', 1: '#ffb3aa' };

  const $ = id => document.getElementById(id);
  const stageEl = $('stage'), cv = $('game');
  const ctx = cv.getContext('2d');
  const overEl = $('over');
  const view = { s: 1, vw: 0, vh: 0, dpr: 1 };

  const IMG = {};
  ANIMALS.forEach(a => { IMG[a.id] = new Image(); IMG[a.id].src = 'assets/' + a.id + '.png'; });
  IMG.back = new Image(); IMG.back.src = 'assets/card-back.png';
  IMG.clock = new Image(); IMG.clock.src = 'assets/clock.png';

  /* ---------------- 音效（原工程没有音频，这里合成） ---------------- */
  const Sound = {
    ac: null, on: true, started: false,
    init() { try { this.on = localStorage.getItem('doushouqi.sound') !== '0'; } catch (e) {} this.sync(); },
    unlock() {
      if (!this.started) {
        this.started = true;
        try { const AC = window.AudioContext || window.webkitAudioContext; if (AC) this.ac = new AC(); } catch (e) {}
      }
      if (this.ac && this.ac.state === 'suspended') this.ac.resume();
    },
    beep(f, dur, type, g, slide) {
      if (!this.on || !this.ac) return;
      const t0 = this.ac.currentTime;
      const o = this.ac.createOscillator(), gn = this.ac.createGain();
      o.type = type || 'sine';
      o.frequency.setValueAtTime(f, t0);
      if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(60, slide), t0 + dur);
      gn.gain.setValueAtTime(0, t0);
      gn.gain.linearRampToValueAtTime(g == null ? 0.13 : g, t0 + 0.012);
      gn.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(gn); gn.connect(this.ac.destination);
      o.start(t0); o.stop(t0 + dur + 0.03);
    },
    flip() { this.beep(520, 0.12, 'triangle', 0.11, 700); },
    move() { this.beep(360, 0.1, 'sine', 0.1); },
    eat() { this.beep(240, 0.2, 'square', 0.13, 120); },
    both() { [300, 220].forEach((f, i) => setTimeout(() => this.beep(f, 0.22, 'sawtooth', 0.11), i * 120)); },
    win() { [523, 659, 784].forEach((f, i) => setTimeout(() => this.beep(f, 0.3, 'triangle', 0.13), i * 110)); },
    lose() { [392, 311, 233].forEach((f, i) => setTimeout(() => this.beep(f, 0.34, 'sine', 0.12), i * 130)); },
    setOn(v) { this.on = v; try { localStorage.setItem('doushouqi.sound', v ? '1' : '0'); } catch (e) {} this.sync(); },
    sync() { const b = $('btnSound'); b.textContent = this.on ? '🔊' : '🔇'; b.style.opacity = this.on ? '1' : '.5'; }
  };

  /* ---------------- 状态 ---------------- */
  const G = {
    cards: [],            // {color:-1 暗, -2 空, 0/1, rank:0..7}
    myColor: -1,          // 还没定色
    turn: 0,              // 0 = 玩家, 1 = AI
    sel: -1,
    state: 'play',        // play | over
    win: 0, lose: 0,
    fx: [], t: 0,
    aiT: 0,
    last: null,           // 上一步用于高亮
    msg: ''
  };

  function newGame() {
    const deck = [];
    for (let c = 0; c < 2; c++) for (let r = 0; r < 8; r++) deck.push({ color: c, rank: r });
    for (let i = deck.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; const t = deck[i]; deck[i] = deck[j]; deck[j] = t; }
    G.cards = deck.map(d => ({ color: DARK, rank: d.rank, real: d.color }));
    G.myColor = -1;
    G.turn = Math.random() < 0.5 ? 0 : 1;
    G.sel = -1;
    G.state = 'play';
    G.fx = [];
    G.last = null;
    G.aiT = 0;
    G.msg = G.turn === 0 ? '你先手：点一张暗牌翻开' : '对方先手…';
    overEl.hidden = true;
    updateHud();
  }

  function isDark(i) { return G.cards[i].color === DARK; }
  function isEmpty(i) { return G.cards[i].color === EMPTY; }

  function countColor(c) {
    let n = 0;
    G.cards.forEach(x => { if (x.color === c) n++; });
    return n;
  }

  function updateHud() {
    const dark = G.cards.filter(c => c.color === DARK).length;
    $('mine').textContent = G.myColor < 0 ? '?' : countColor(G.myColor);
    $('theirs').textContent = G.myColor < 0 ? '?' : countColor(1 - G.myColor);
    $('record').textContent = G.win + '/' + (G.win + G.lose);
    $('hintline').textContent = G.msg || (dark ? '先翻牌定颜色' : '点自己的棋走到相邻格');
  }

  /* ---------------- 规则 ---------------- */
  function adjacent(a, b) {
    const ar = Math.floor(a / N), ac = a % N, br = Math.floor(b / N), bc = b % N;
    return (ar === br && Math.abs(ac - bc) === 1) || (ac === bc && Math.abs(ar - br) === 1);
  }

  /* 源码 canMove */
  function canMove(from, to) {
    const A = G.cards[from], B = G.cards[to];
    if (A.color < 0 || B.color < 0) return false;          // 有暗牌 / 空位处理在下面
    if (A.color === B.color) return false;                 // 自己的棋不能吃
    return adjacent(from, to);
  }

  /* 源码 move 的胜负判定 */
  function battle(fromV, toV) {
    if (fromV > toV) {
      if (fromV === 7 && toV === 0) return 'keepTo';       // 象吃不动猪
      return 'takeIt';
    }
    if (fromV === toV) return 'both';
    if (fromV === 0 && toV === 7) return 'takeIt';         // 猪吃象
    return 'keepTo';
  }

  function openCard(i) {
    if (!isDark(i)) return false;
    G.cards[i].color = G.cards[i].real;
    if (G.myColor < 0) {
      G.myColor = (G.turn === 0) ? G.cards[i].color : 1 - G.cards[i].color;
      G.msg = G.myColor === BLUE ? '你是蓝方' : '你是红方';
    }
    G.last = { from: -1, to: i, kind: 'open' };
    Sound.flip();
    G.fx.push({ x: i, t: 0, life: 0.4, kind: 'ring' });
    return true;
  }

  function doMove(from, to) {
    const A = G.cards[from], B = G.cards[to];
    if (!adjacent(from, to)) return false;
    if (B.color === EMPTY) {
      G.cards[to] = { color: A.color, rank: A.rank, real: A.color };
      G.cards[from] = { color: EMPTY, rank: 0, real: -1 };
      Sound.move();
    } else if (B.color === DARK) {
      return false;
    } else if (B.color === A.color) {
      return false;
    } else {
      const r = battle(A.rank, B.rank);
      if (r === 'takeIt') {
        G.cards[to] = { color: A.color, rank: A.rank, real: A.color };
        G.cards[from] = { color: EMPTY, rank: 0, real: -1 };
        Sound.eat(); boom(to, '#ffd76b');
      } else if (r === 'both') {
        G.cards[to] = { color: EMPTY, rank: 0, real: -1 };
        G.cards[from] = { color: EMPTY, rank: 0, real: -1 };
        Sound.both(); boom(to, '#ffffff'); boom(from, '#ffffff');
      } else {
        G.cards[from] = { color: EMPTY, rank: 0, real: -1 };   // 被吃
        Sound.eat(); boom(from, '#ff8f7a');
        G.last = { from: from, to: to, kind: 'lost' };
        updateHud();
        return true;
      }
    }
    G.last = { from: from, to: to, kind: 'move' };
    return true;
  }

  function boom(i, color) {
    G.fx.push({ x: i, t: 0, life: 0.5, kind: 'boom', c: color });
  }

  /* 源码 checkWin：全部翻开后某色没牌了 */
  function checkWin() {
    if (G.cards.some(c => c.color === DARK)) return -1;
    const b = countColor(BLUE), r = countColor(RED);
    if (b === 0) return RED;
    if (r === 0) return BLUE;
    return -1;
  }

  function afterAction() {
    updateHud();
    const w = checkWin();
    if (w !== -1) return endGame(w);
    G.turn = 1 - G.turn;
    G.sel = -1;
    if (G.turn === 1) { G.aiT = 0.55; G.msg = '对方思考中…'; }
    else G.msg = '轮到你了';
    updateHud();
  }

  function endGame(winnerColor) {
    G.state = 'over';
    const iWin = (G.myColor >= 0) && (winnerColor === G.myColor);
    if (iWin) { G.win++; Sound.win(); } else { G.lose++; Sound.lose(); }
    try {
      localStorage.setItem('doushouqi.record', JSON.stringify({ w: G.win, l: G.lose }));
    } catch (e) {}
    $('overTitle').textContent = iWin ? '你赢了' : (G.myColor < 0 ? '还没定色就结束了' : '你输了');
    $('overTip').textContent = iWin ? '把对方棋子全部吃掉了' : '再试一局，先稳住大的象和狮';
    $('finalWin').textContent = G.win;
    $('finalLose').textContent = G.lose;
    G.msg = iWin ? '你赢了' : '你输了';
    updateHud();
    overEl.hidden = false;
  }

  /* ---------------- AI（照着源码 AiEngine 的加权思路简化） ---------------- */
  function aiStep() {
    if (G.state !== 'play' || G.turn !== 1) return;
    const my = G.myColor < 0 ? null : 1 - G.myColor;   // AI 的颜色（未定色时为 null）

    /* 还没定色：随便翻一张暗牌 */
    if (my === null || G.myColor === null) {
      const dark = [];
      G.cards.forEach((c, i) => { if (c.color === DARK) dark.push(i); });
      if (dark.length) { openCard(dark[(Math.random() * dark.length) | 0]); afterAction(); return; }
    }

    const mine = [], darkIdx = [];
    G.cards.forEach((c, i) => {
      if (c.color === DARK) darkIdx.push(i);
      else if (c.color === my) mine.push(i);
    });

    /* 有暗牌就时常翻开，不然一直挪子永远打不完 */
    if (darkIdx.length && Math.random() < 0.35) {
      openCard(darkIdx[(Math.random() * darkIdx.length) | 0]);
      afterAction();
      return;
    }

    /* 能吃的优先吃大的 */
    let best = null;
    mine.forEach(function (from) {
      const A = G.cards[from];
      for (let k = 0; k < 4; k++) {
        const to = neighbor(from, k);
        if (to < 0) continue;
        const B = G.cards[to];
        if (B.color === DARK || B.color === EMPTY) continue;
        if (B.color === A.color) continue;
        const r = battle(A.rank, B.rank);
        let score = -999;
        if (r === 'takeIt') score = 100 + B.rank * 3 - A.rank;
        else if (r === 'both') score = B.rank > 3 ? 60 : -20;
        else score = -80 - A.rank * 2;
        if (!best || score > best.score) best = { score: score, from: from, to: to, kind: 'move' };
      }
    });
    if (best && best.score > 0) { doMove(best.from, best.to); afterAction(); return; }

    /* 空位挪一挪，别把大子送出去 */
    let safe = null;
    mine.forEach(function (from) {
      const A = G.cards[from];
      for (let k = 0; k < 4; k++) {
        const to = neighbor(from, k);
        if (to < 0) continue;
        if (G.cards[to].color !== EMPTY) continue;
        let danger = 0;
        for (let q = 0; q < 4; q++) {
          const nb = neighbor(to, q);
          if (nb < 0) continue;
          const C = G.cards[nb];
          if (C.color === DARK || C.color === EMPTY || C.color === A.color) continue;
          const r = battle(C.rank, A.rank);
          if (r === 'takeIt' || r === 'both') danger += 1;
        }
        const score = -danger * 20 + A.rank;
        if (!safe || score > safe.score) safe = { score: score, from: from, to: to };
      }
    });
    if (safe) { doMove(safe.from, safe.to); afterAction(); return; }

    if (darkIdx.length) { openCard(darkIdx[(Math.random() * darkIdx.length) | 0]); afterAction(); return; }
    afterAction();
  }

  function neighbor(i, k) {
    const r = Math.floor(i / N), c = i % N;
    if (k === 0) return r > 0 ? i - N : -1;
    if (k === 1) return r < N - 1 ? i + N : -1;
    if (k === 2) return c > 0 ? i - 1 : -1;
    return c < N - 1 ? i + 1 : -1;
  }

  /* ---------------- 交互 ---------------- */
  function cellAt(px, py) {
    const g = boardGeom();
    const c = Math.floor((px - g.x) / (g.cell + g.gap));
    const r = Math.floor((py - g.y) / (g.cell + g.gap));
    if (c < 0 || c >= N || r < 0 || r >= N) return -1;
    return r * N + c;
  }

  function click(px, py) {
    if (G.state !== 'play' || G.turn !== 0) return;
    const i = cellAt(px, py);
    if (i < 0) return;
    const card = G.cards[i];
    if (card.color === DARK) {
      if (openCard(i)) afterAction();
      return;
    }
    if (card.color === EMPTY) { G.sel = -1; render(); return; }
    /* 点自己的棋 → 选中 */
    if (G.myColor >= 0 && card.color === G.myColor) {
      G.sel = (G.sel === i) ? -1 : i;
      Sound.beep(600, 0.07, 'sine', 0.07);
      return;
    }
    /* 点别人的棋 → 尝试吃 */
    if (G.sel >= 0) {
      if (doMove(G.sel, i)) afterAction();
      else { G.msg = '走不过去（只能上下左右走一格）'; G.sel = -1; updateHud(); }
    }
  }

  /* ---------------- 布局 ---------------- */
  function boardGeom() {
    const s = view.s;
    const gap = 10 * s;
    const cell = Math.min((view.vw - 40 * s - gap * (N - 1)) / N, (view.vh - 90 * s - gap * (N - 1)) / N);
    const w = cell * N + gap * (N - 1);
    return { x: (view.vw - w) / 2, y: (view.vh - w) / 2 + 10 * s, cell: cell, gap: gap, s: s };
  }

  function render() {
    const g = ctx, vw = view.vw, vh = view.vh, dpr = view.dpr, s = view.s;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, vw, vh);
    const geom = boardGeom();
    const step = geom.cell + geom.gap;

    for (let i = 0; i < N * N; i++) {
      const r = Math.floor(i / N), c = i % N;
      const x = geom.x + c * step, y = geom.y + r * step;
      const card = G.cards[i];
      const w = geom.cell, h = geom.cell;

      /* 底格 */
      g.save();
      g.fillStyle = 'rgba(255,255,255,.05)';
      g.strokeStyle = 'rgba(150,190,255,.14)';
      g.lineWidth = 2;
      roundRect(g, x, y, w, h, 12 * s);
      g.fill(); g.stroke();
      g.restore();

      if (card.color === EMPTY) continue;

      if (card.color === DARK) {
        /* 背面 */
        if (IMG.back.complete && IMG.back.naturalWidth) {
          g.drawImage(IMG.back, x + 3 * s, y + 3 * s, w - 6 * s, h - 6 * s);
        } else {
          g.fillStyle = '#1a2b46';
          roundRect(g, x + 3 * s, y + 3 * s, w - 6 * s, h - 6 * s, 10 * s); g.fill();
        }
        g.save();
        g.fillStyle = 'rgba(200,225,255,.6)';
        g.font = '800 ' + (w * 0.36) + 'px ' + FONT;
        g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText('?', x + w / 2, y + h / 2 + 2 * s);
        g.restore();
      } else {
        const col = COL[card.color], colD = COL_D[card.color], colL = COL_L[card.color];
        g.save();
        g.fillStyle = colD;
        roundRect(g, x, y, w, h, 12 * s); g.fill();
        g.fillStyle = col;
        roundRect(g, x + 4 * s, y + 4 * s, w - 8 * s, h - 8 * s, 10 * s); g.fill();
        const img = IMG[ANIMALS[card.rank].id];
        if (img && img.complete && img.naturalWidth) {
          const pad = w * 0.14;
          g.drawImage(img, x + pad, y + pad, w - pad * 2, h - pad * 2);
        } else {
          g.fillStyle = colL;
          g.font = '800 ' + (w * 0.3) + 'px ' + FONT;
          g.textAlign = 'center'; g.textBaseline = 'middle';
          g.fillText(ANIMALS[card.rank].name, x + w / 2, y + h / 2);
        }
        g.restore();
      }

      /* 选中 / 可走位置 */
      if (G.sel === i) {
        g.save();
        g.strokeStyle = '#ffe86b';
        g.lineWidth = 4 * s;
        roundRect(g, x + 2 * s, y + 2 * s, w - 4 * s, h - 4 * s, 12 * s);
        g.stroke();
        g.restore();
      }
      if (G.sel >= 0 && adjacent(G.sel, i) && G.turn === 0 && G.state === 'play') {
        const B = G.cards[i];
        if (B.color === EMPTY || (B.color !== DARK && G.myColor >= 0 && B.color !== G.myColor)) {
          g.save();
          g.globalAlpha = 0.55;
          g.strokeStyle = '#ffe86b';
          g.lineWidth = 3 * s;
          g.setLineDash([6 * s, 6 * s]);
          roundRect(g, x + 5 * s, y + 5 * s, w - 10 * s, h - 10 * s, 10 * s);
          g.stroke();
          g.restore();
        }
      }
      /* 上一步高亮 */
      if (G.last && (G.last.to === i)) {
        g.save();
        g.globalAlpha = 0.5;
        g.strokeStyle = '#ffffff';
        g.lineWidth = 2 * s;
        roundRect(g, x + 1 * s, y + 1 * s, w - 2 * s, h - 2 * s, 13 * s);
        g.stroke();
        g.restore();
      }

      /* 特效 */
      for (let f = 0; f < G.fx.length; f++) {
        const fx = G.fx[f];
        if (fx.x !== i) continue;
        const k = fx.t / fx.life;
        g.save();
        g.globalAlpha = Math.max(0, 1 - k);
        g.strokeStyle = fx.kind === 'ring' ? '#ffffff' : (fx.c || '#fff');
        g.lineWidth = 5 * s * (1 - k * 0.6);
        g.beginPath();
        g.arc(x + w / 2, y + h / 2, w * (0.42 + k * 0.35), 0, Math.PI * 2);
        g.stroke();
        g.restore();
      }
    }

    /* 状态条 */
    g.save();
    g.font = '700 ' + (16 * s) + 'px ' + FONT;
    g.textAlign = 'center';
    g.fillStyle = 'rgba(232,240,255,.9)';
    g.fillText(G.msg || '', vw / 2, geom.y - 22 * s);
    if (G.myColor >= 0) {
      g.fillStyle = COL[G.myColor];
      g.font = '800 ' + (14 * s) + 'px ' + FONT;
      g.fillText('你：' + (G.myColor === BLUE ? '蓝方' : '红方'), vw / 2, geom.y + N * geom.cell + (N - 1) * geom.gap + 30 * s);
    }
    g.restore();
  }

  function roundRect(g, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }

  /* ---------------- 循环 ---------------- */
  function layout() {
    const rect = stageEl.getBoundingClientRect();
    const vw = Math.max(220, rect.width || window.innerWidth);
    const vh = Math.max(260, rect.height || window.innerHeight);
    const dpr = Math.min(2.5, window.devicePixelRatio || 1);
    view.vw = vw; view.vh = vh; view.dpr = dpr;
    view.s = Math.max(0.6, Math.min(vw / 460, vh / 560));
    cv.width = Math.round(vw * dpr);
    cv.height = Math.round(vh * dpr);
  }

  let last = 0;
  function frame(ts) {
    if (!last) last = ts;
    let dt = (ts - last) / 1000;
    last = ts;
    if (!(dt > 0)) dt = 1 / 60;
    dt = Math.min(dt, 0.05);
    G.t += dt;
    if (G.state === 'play' && G.turn === 1) {
      G.aiT -= dt;
      if (G.aiT <= 0) aiStep();
    }
    for (let i = 0; i < G.fx.length; i++) G.fx[i].t += dt;
    if (G.fx.some(f => f.t >= f.life)) G.fx = G.fx.filter(f => f.t < f.life);
    render();
    requestAnimationFrame(frame);
  }

  stageEl.addEventListener('pointerdown', function (ev) {
    if (ev.target.closest && ev.target.closest('.overlay')) return;
    ev.preventDefault();
    Sound.unlock();
    const rect = cv.getBoundingClientRect();
    const s = view.s;
    click((ev.clientX - rect.left) / s, (ev.clientY - rect.top) / s);
  });
  stageEl.addEventListener('contextmenu', e => e.preventDefault());

  $('btnSound').addEventListener('click', function () { Sound.unlock(); Sound.setOn(!Sound.on); });
  $('btnRestart').addEventListener('click', function () { Sound.unlock(); newGame(); });
  $('btnAgain').addEventListener('click', function () { Sound.unlock(); newGame(); });

  let rt = 0;
  function relayout() { clearTimeout(rt); rt = setTimeout(layout, 100); }
  window.addEventListener('resize', relayout);
  window.addEventListener('orientationchange', function () { setTimeout(layout, 240); });
  window.addEventListener('load', function () { layout(); setTimeout(layout, 180); });
  if (window.ResizeObserver) new ResizeObserver(relayout).observe(stageEl);

  /* ---------------- 启动 ---------------- */
  Sound.init();
  try {
    const r = JSON.parse(localStorage.getItem('doushouqi.record') || 'null');
    if (r) { G.win = r.w | 0; G.lose = r.l | 0; }
  } catch (e) {}
  layout();
  newGame();
  requestAnimationFrame(frame);

  /* 调试钩子 */
  window.DouShouQi = {
    get state() { return G.state; },
    get turn() { return G.turn; },
    get myColor() { return G.myColor; },
    get cards() { return G.cards; },
    get win() { return G.win; },
    get lose() { return G.lose; },
    view, newGame, aiStep, render,
    clickAt(x, y) { click(x, y); },
    /* 测试用：直接把牌面摆成指定样子 */
    setup(list) {
      G.cards = list.map(function (v) {
        if (v === DARK) return { color: DARK, rank: 0, real: -1 };
        if (v === EMPTY) return { color: EMPTY, rank: 0, real: -1 };
        return { color: v[0], rank: v[1], real: v[0] };
      });
    },
    setTurn(t) { G.turn = t; },
    setMyColor(c) { G.myColor = c; },
    act(i) { if (isDark(i)) { openCard(i); afterAction(); return true; } return false; },
    move(from, to) { if (doMove(from, to)) { afterAction(); return true; } return false; },
    battle(fromV, toV) { return battle(fromV, toV); },
    checkWin,
    tick(n, dt) { for (let i = 0; i < (n || 1); i++) { G.t += dt || 1 / 60; if (G.state === 'play' && G.turn === 1) { G.aiT -= (dt || 1 / 60); if (G.aiT <= 0) aiStep(); } } }
  };
})();
