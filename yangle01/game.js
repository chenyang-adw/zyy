/* =========================================================
 *  果了个果 · 堆叠三消
 *  规则取自 xyx/羊了个羊cocos3.0（CatCat）：
 *  - 一张牌一张牌地取，一摞牌只有最上面那张能点，下面的变灰
 *  - 拿到托盘（7 格，源码 harvestNodes），三个一样的自动消掉
 *  - 托盘被占满就失败，全部拿完就过关
 *  美术（背景 / 牌框 / 木箱 / 栅栏 / 标题 / 3 个原版道具 / BGM）来自原工程
 * ========================================================= */
(function () {
  'use strict';

  /* ---------------- 素材 ---------------- */
  const ITEMS = [
    { id: 'cabbage',  src: 'assets/item-cabbage.png'  },   // 原工程 items_1
    { id: 'carrot',   src: 'assets/item-carrot.png'   },   // 原工程 items_2
    { id: 'tree',     src: 'assets/item-tree.png'     },   // 原工程 items_3
    { id: 'apple',    src: 'assets/item-apple.svg'    },   // 以下三个按原画风补的
    { id: 'mushroom', src: 'assets/item-mushroom.svg' },
    { id: 'pumpkin',  src: 'assets/item-pumpkin.svg'  }
  ];
  const IMG = {};
  ['back', 'square', 'box', 'fence', 'title'].forEach(k => {
    IMG[k] = new Image(); IMG[k].src = 'assets/' + k + '.png';
  });
  ITEMS.forEach(function (it) {
    const im = new Image();
    im.src = it.src;
    IMG[it.id] = im;
  });

  /* ---------------- 设计尺寸 ---------------- */
  const DW = 360;            // 设计宽度
  const CARD_W = 58, CARD_H = 64;
  const TRAY_MAX = 7;        // 源码 harvestNodes 数量
  const TRAY_W = 42, TRAY_H = 46;
  const FONT = '"PingFang SC","Microsoft YaHei",system-ui,sans-serif';

  const $ = id => document.getElementById(id);
  const stageEl = $('stage'), cv = $('game');
  const ctx = cv.getContext('2d');
  const overEl = $('over');

  const view = { s: 1, vw: 0, vh: 0, dh: 640, dpr: 1 };

  /* ---------------- 音效 ---------------- */
  const Sound = {
    ac: null, on: true, bgm: null,
    init() {
      try { this.on = localStorage.getItem('yangle.sound') !== '0'; } catch (e) {}
      this.bgm = new Audio('assets/bgm.mp3');
      this.bgm.loop = true;
      this.bgm.volume = 0.34;
      this.syncBtn();
    },
    unlock() {
      try {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (AC && !this.ac) this.ac = new AC();
        if (this.ac && this.ac.state === 'suspended') this.ac.resume();
      } catch (e) {}
      this.playBgm();
    },
    playBgm() { if (this.on && this.bgm) { const p = this.bgm.play(); if (p && p.catch) p.catch(() => {}); } },
    pauseBgm() { if (this.bgm) { try { this.bgm.pause(); } catch (e) {} } },
    /* 合成音效：点牌 / 消除 / 过关 / 失败 */
    beep(freq, dur, type, gain, delay) {
      if (!this.on || !this.ac) return;
      const t0 = this.ac.currentTime + (delay || 0);
      const o = this.ac.createOscillator();
      const g = this.ac.createGain();
      o.type = type || 'sine';
      o.frequency.setValueAtTime(freq, t0);
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(gain == null ? 0.16 : gain, t0 + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(g); g.connect(this.ac.destination);
      o.start(t0); o.stop(t0 + dur + 0.02);
    },
    pick() { this.beep(560, 0.12, 'triangle', 0.14); this.beep(840, 0.09, 'sine', 0.07, 0.02); },
    clear() { [660, 880, 1180].forEach((f, i) => this.beep(f, 0.16, 'sine', 0.13, i * 0.06)); },
    win() { [523, 659, 784, 1047].forEach((f, i) => this.beep(f, 0.36, 'triangle', 0.14, i * 0.11)); },
    lose() { [420, 330, 250].forEach((f, i) => this.beep(f, 0.3, 'sawtooth', 0.1, i * 0.12)); },
    setOn(v) {
      this.on = v;
      try { localStorage.setItem('yangle.sound', v ? '1' : '0'); } catch (e) {}
      if (v) this.playBgm(); else this.pauseBgm();
      this.syncBtn();
    },
    syncBtn() {
      const b = $('btnSound');
      b.textContent = this.on ? '🔊' : '🔇';
      b.style.opacity = this.on ? '1' : '.5';
    }
  };

  /* ---------------- 关卡配置 ---------------- */
  function levelConfig(n) {
    const stacks = Math.min(15, 6 + (n - 1) * 2);
    const maxTotal = stacks * 5;
    let total = 18 + (n - 1) * 12;
    total = Math.min(total, maxTotal - (maxTotal % 3));
    return { n: n, total: total, stacks: stacks, types: n === 1 ? 4 : 6 };
  }

  /* 生成一关：按「可解顺序」每 3 张分配同一种图案，保证一定有解 */
  function buildLevel(n) {
    const cfg = levelConfig(n);
    const heights = new Array(cfg.stacks).fill(2);
    let left = cfg.total - cfg.stacks * 2;
    const grow = [];
    for (let i = 0; i < cfg.stacks; i++) grow.push(i);
    while (left > 0) {
      const i = grow[(Math.random() * grow.length) | 0];
      if (heights[i] < 5) { heights[i]++; left--; }
      else if (grow.length > 1) grow.splice(grow.indexOf(i), 1);
      else break;
    }
    /* 以实际分配出来的张数为准，避免出现没分配图案的牌 */
    const realTotal = heights.reduce((a, b) => a + b, 0);
    const rem = heights.slice();
    const cards = heights.map(h => new Array(h).fill(0));
    const bag = [];
    for (let i = 0; i < Math.floor(realTotal / 3); i++) bag.push(i % cfg.types);
    for (let i = bag.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; const t = bag[i]; bag[i] = bag[j]; bag[j] = t; }

    const solution = [];
    let remain = realTotal, bi = 0;
    while (remain > 0 && bi < bag.length) {
      const picks = [];
      for (let k = 0; k < 3; k++) {
        const avail = [];
        for (let i = 0; i < rem.length; i++) if (rem[i] > 0) avail.push(i);
        if (!avail.length) break;
        const s = avail[(Math.random() * avail.length) | 0];
        rem[s]--;
        picks.push([s, rem[s]]);
      }
      const t = bag[bi++];
      picks.forEach(p => { cards[p[0]][p[1]] = t; solution.push([p[0], p[1]]); });
      remain -= picks.length;
    }

    /* 摆位置：格子 + 轻微抖动，看起来自然些 */
    const cols = cfg.stacks > 12 ? 5 : 4;
    const rows = Math.ceil(cfg.stacks / cols);
    const areaX0 = 16, areaX1 = DW - 16;
    const areaY0 = 66, areaY1 = view.dh - 210;
    const cellW = (areaX1 - areaX0) / cols;
    const cellH = Math.min(116, (areaY1 - areaY0) / rows);
    const gridTop = areaY0 + Math.max(0, ((areaY1 - areaY0) - rows * cellH) / 2);
    const order = [];
    for (let i = 0; i < cfg.stacks; i++) order.push(i);
    for (let i = order.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; const t = order[i]; order[i] = order[j]; order[j] = t; }

    const stacks = [];
    order.forEach(function (si, k) {
      const c = k % cols, r = Math.floor(k / cols);
      const x = areaX0 + cellW * (c + 0.5) + (Math.random() - 0.5) * 8;
      const y = gridTop + cellH * (r + 0.5) + (Math.random() - 0.5) * 8;
      const list = [];
      for (let i = 0; i < heights[si]; i++) list.push({ t: cards[si][i], state: 'stack' });
      stacks.push({ x: x, y: y, cards: list, src: si });
    });
    stacks.sort((a, b) => a.y - b.y);
    return { cfg: cfg, stacks: stacks, total: realTotal, solution: solution };
  }

  /* ---------------- 状态 ---------------- */
  const G = {
    level: 1, best: 1,
    stacks: [], tray: [], fly: [], fx: [],
    solution: [],
    state: 'play',       // play | over
    shake: 0,
    t: 0
  };

  function totalLeft() {
    let n = 0;
    G.stacks.forEach(s => s.cards.forEach(c => { if (c.state === 'stack') n++; }));
    G.fly.forEach(f => { if (f.card.state !== 'gone') n++; });
    G.tray.forEach(c => { if (c.state !== 'gone') n++; });
    return n;
  }

  function startLevel(n) {
    G.level = n;
    const L = buildLevel(n);
    G.stacks = L.stacks;
    G.solution = L.solution;
    G.total = L.total;
    G.tray = []; G.fly = []; G.fx = [];
    G.state = 'play';
    overEl.hidden = true;
    $('level').textContent = n;
    updateHud();
  }

  function updateHud() {
    $('left').textContent = totalLeft();
  }

  /* ---------------- 取牌 ---------------- */
  function topCard(stack) {
    for (let i = stack.cards.length - 1; i >= 0; i--) if (stack.cards[i].state === 'stack') return i;
    return -1;
  }

  function cardPos(stack, index) {
    const h = stack.cards.length;
    return { x: stack.x, y: stack.y + (h - 1 - index) * 9 };
  }

  function pickAt(px, py) {
    if (G.state !== 'play') return false;
    let hit = null;
    for (let i = 0; i < G.stacks.length; i++) {
      const st = G.stacks[i];
      const idx = topCard(st);
      if (idx < 0) continue;
      const p = cardPos(st, idx);
      if (Math.abs(px - p.x) <= CARD_W / 2 && Math.abs(py - p.y) <= CARD_H / 2) {
        if (!hit || p.y > hit.y) hit = { st: st, idx: idx, x: p.x, y: p.y };
      }
    }
    if (!hit) return false;
    takeCard(hit.st, hit.idx, hit.x, hit.y);
    return true;
  }

  function takeCard(stack, idx, x, y) {
    const card = stack.cards[idx];
    card.state = 'fly';
    const slot = trayInsertIndex(card.t);
    const target = traySlotPos(slot);
    G.fly.push({ card: card, x: x, y: y, sx: x, sy: y, tx: target.x, ty: target.y, t: 0, dur: 0.3 });
    Sound.pick();
  }

  function trayInsertIndex(type) {
    let insert = G.tray.length;
    for (let i = G.tray.length - 1; i >= 0; i--) {
      if (G.tray[i].t === type) { insert = i + 1; break; }
    }
    return insert;
  }

  function traySlotPos(i) {
    const gap = 4;
    const totalW = TRAY_MAX * TRAY_W + (TRAY_MAX - 1) * gap;
    const x0 = (DW - totalW) / 2;
    return { x: x0 + i * (TRAY_W + gap) + TRAY_W / 2, y: view.dh - 82 };
  }

  function landCard(f) {
    const card = f.card;
    card.state = 'tray';
    G.tray.splice(trayInsertIndex(card.t), 0, card);
    layoutTray(true);
    /* 三个一样的消除 */
    const same = [];
    for (let i = 0; i < G.tray.length; i++) if (G.tray[i].t === card.t) same.push(i);
    if (same.length >= 3) {
      const pick = same.slice(0, 3);
      pick.forEach(function (i) {
        const c = G.tray[i];
        c.state = 'gone';
        const p = traySlotPos(i);
        boom(p.x, p.y);
      });
      G.tray = G.tray.filter(c => c.state !== 'gone');
      layoutTray(false);
      Sound.clear();
    }
    updateHud();
    /* 判定 */
    if (totalLeft() <= 0) { win(); return; }
    if (G.tray.length >= TRAY_MAX) { lose(); return; }
  }

  const trayAnim = [];
  function layoutTray(animate) {
    G.tray.forEach(function (c, i) {
      const p = traySlotPos(i);
      if (animate) {
        trayAnim.push({ card: c, sx: c.px == null ? p.x : c.px, sy: c.py == null ? p.y : c.py, tx: p.x, ty: p.y, t: 0, dur: 0.16 });
      }
      c.px = p.x; c.py = p.y;
    });
  }

  function boom(x, y) {
    for (let i = 0; i < 14; i++) {
      const a = Math.random() * Math.PI * 2, sp = 40 + Math.random() * 130;
      G.fx.push({ x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 40, r: 2 + Math.random() * 3, t: 0, life: 0.45 + Math.random() * 0.3, c: Math.random() < 0.5 ? '#ffffff' : '#9fe04a' });
    }
  }

  function win() {
    G.state = 'over';
    Sound.win();
    G.best = Math.max(G.best, G.level);
    try { localStorage.setItem('yangle.best', String(G.best)); } catch (e) {}
    $('overTitle').textContent = '过关啦';
    $('overTip').textContent = '第 ' + G.level + ' 关全部清空';
    $('finalLevel').textContent = G.level;
    $('finalBest').textContent = G.best;
    $('btnAgain').textContent = '重玩本关';
    $('btnNext').hidden = false;
    overEl.hidden = false;
  }

  function lose() {
    G.state = 'over';
    Sound.lose();
    G.shake = 1;
    $('overTitle').textContent = '托盘满了';
    $('overTip').textContent = '七个格子被占满就输了，先消掉成对的更稳';
    $('finalLevel').textContent = G.level;
    $('finalBest').textContent = G.best;
    $('btnAgain').textContent = '重来一次';
    $('btnNext').hidden = true;
    overEl.hidden = false;
  }

  /* ---------------- 更新 ---------------- */
  function update(dt) {
    G.t += dt;
    /* 飞行中的牌 */
    for (let i = G.fly.length - 1; i >= 0; i--) {
      const f = G.fly[i];
      f.t += dt;
      let p = Math.min(1, f.t / f.dur);
      const e = p * p * (3 - 2 * p);
      f.x = f.sx + (f.tx - f.sx) * e;
      f.y = f.sy + (f.ty - f.sy) * e - Math.sin(p * Math.PI) * 46;
      if (p >= 1) { G.fly.splice(i, 1); landCard(f); }
    }
    /* 托盘补位 */
    for (let i = trayAnim.length - 1; i >= 0; i--) {
      const a = trayAnim[i];
      a.t += dt;
      const p = Math.min(1, a.t / a.dur);
      const e = p * p * (3 - 2 * p);
      a.card.px = a.sx + (a.tx - a.sx) * e;
      a.card.py = a.sy + (a.ty - a.sy) * e;
      if (p >= 1) { a.card.px = a.tx; a.card.py = a.ty; trayAnim.splice(i, 1); }
    }
    /* 粒子 */
    for (let i = 0; i < G.fx.length; i++) {
      const f = G.fx[i];
      f.t += dt;
      f.vy += 420 * dt;
      f.x += f.vx * dt; f.y += f.vy * dt;
      if (f.t >= f.life) f.dead = true;
    }
    if (G.fx.some(f => f.dead)) G.fx = G.fx.filter(f => !f.dead);
    if (G.shake > 0) G.shake = Math.max(0, G.shake - dt * 2.6);
  }

  /* ---------------- 绘制 ---------------- */
  function roundRect(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }

  function drawCard(x, y, w, h, type, dim, alpha) {
    const img = IMG[ITEMS[type].id];
    ctx.save();
    if (alpha != null) ctx.globalAlpha = alpha;
    ctx.drawImage(IMG.square, x - w / 2, y - h / 2, w, h);
    if (img && img.complete && img.naturalWidth) {
      const s = w * 0.74;
      ctx.drawImage(img, x - s / 2, y - s / 2 * 0.98, s, s);
    }
    if (dim) {
      ctx.globalAlpha = 1;
      ctx.fillStyle = 'rgba(146,156,140,.58)';
      roundRect(ctx, x - w / 2 + 1, y - h / 2 + 1, w - 2, h - 2, 8);
      ctx.fill();
    }
    ctx.restore();
  }

  function render() {
    const g = ctx, vw = view.vw, vh = view.vh, dh = view.dh, dpr = view.dpr;
    const sx = G.shake > 0 ? (Math.random() - 0.5) * G.shake * 6 : 0;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = '#bfe97f';
    g.fillRect(0, 0, vw, vh);

    g.setTransform(view.s * dpr, 0, 0, view.s * dpr, ((vw - DW * view.s) / 2) * dpr, sx * view.s * dpr);

    /* 背景：原版 back.png 铺满 */
    if (IMG.back.complete && IMG.back.naturalWidth) {
      const scale = Math.max(DW / IMG.back.naturalWidth, dh / IMG.back.naturalHeight);
      const bw = IMG.back.naturalWidth * scale, bh = IMG.back.naturalHeight * scale;
      g.save();
      g.beginPath(); g.rect(0, 0, DW, dh); g.clip();
      g.drawImage(IMG.back, (DW - bw) / 2, (dh - bh) / 2, bw, bh);
      g.restore();
    }

    /* 牌堆：先画后面的 */
    for (let i = 0; i < G.stacks.length; i++) {
      const st = G.stacks[i];
      const h = st.cards.length;
      for (let k = 0; k < h; k++) {
        const c = st.cards[k];
        if (c.state !== 'stack') continue;
        const top = (k === topCard(st));
        const p = cardPos(st, k);
        drawCard(p.x, p.y, CARD_W, CARD_H, c.t, !top, top ? 1 : 0.94);
      }
    }

    /* 托盘底（原版 box.png） */
    const trayY = view.dh - 82;
    const trayW = TRAY_MAX * TRAY_W + (TRAY_MAX - 1) * 4 + 22;
    if (IMG.box.complete) {
      g.save();
      g.globalAlpha = 0.95;
      g.drawImage(IMG.box, (DW - trayW) / 2, trayY - TRAY_H / 2 - 9, trayW, TRAY_H + 18);
      g.restore();
    } else {
      g.fillStyle = '#c98b45';
      roundRect(g, (DW - trayW) / 2, trayY - TRAY_H / 2 - 9, trayW, TRAY_H + 18, 10);
      g.fill();
    }
    for (let i = 0; i < TRAY_MAX; i++) {
      const p = traySlotPos(i);
      g.save();
      g.fillStyle = 'rgba(255,247,225,.34)';
      roundRect(g, p.x - TRAY_W / 2, p.y - TRAY_H / 2, TRAY_W, TRAY_H, 8);
      g.fill();
      g.strokeStyle = 'rgba(90,58,18,.28)';
      g.lineWidth = 1.4;
      g.stroke();
      g.restore();
    }
    G.tray.forEach(function (c) {
      drawCard(c.px, c.py, TRAY_W, TRAY_H, c.t, false, 1);
    });

    /* 飞行的牌 */
    G.fly.forEach(function (f) {
      drawCard(f.x, f.y, CARD_W, CARD_H, f.card.t, false, 1);
    });

    /* 粒子 */
    for (let i = 0; i < G.fx.length; i++) {
      const f = G.fx[i];
      g.save();
      g.globalAlpha = Math.max(0, 1 - f.t / f.life);
      g.fillStyle = f.c;
      g.beginPath(); g.arc(f.x, f.y, f.r, 0, Math.PI * 2); g.fill();
      g.restore();
    }

    /* 栅栏（原版 fence_1.png）装饰在托盘后面 */
    if (IMG.fence.complete && IMG.fence.naturalWidth) {
      const fw = DW, fh = fw * IMG.fence.naturalHeight / IMG.fence.naturalWidth;
      g.save();
      g.globalAlpha = 0.9;
      g.drawImage(IMG.fence, 0, view.dh - 196, fw, fh);
      g.restore();
    }

    /* 提示 */
    if (G.state === 'play' && !G.tray.length && !G.fly.length) {
      g.save();
      g.globalAlpha = 0.55;
      g.font = '700 12px ' + FONT;
      g.textAlign = 'center';
      g.fillStyle = '#40561c';
      g.fillText('一次只能拿一摞里最上面那张', DW / 2, view.dh - 176);
      g.restore();
    }
  }

  /* ---------------- 布局 ---------------- */
  function layout() {
    const rect = stageEl.getBoundingClientRect();
    const vw = Math.max(220, rect.width || window.innerWidth);
    const vh = Math.max(260, rect.height || window.innerHeight);
    const dpr = Math.min(2.5, window.devicePixelRatio || 1);
    view.vw = vw; view.vh = vh; view.dpr = dpr;
    view.s = Math.max(0.4, Math.min(vw / DW, vh / 640));
    view.dh = vh / view.s;
    cv.width = Math.round(vw * dpr);
    cv.height = Math.round(vh * dpr);
  }

  /* ---------------- 主循环 ---------------- */
  let last = 0;
  function frame(ts) {
    if (!last) last = ts;
    let dt = (ts - last) / 1000;
    last = ts;
    if (!(dt > 0)) dt = 1 / 60;
    dt = Math.min(dt, 0.05);
    update(dt);
    render();
    requestAnimationFrame(frame);
  }

  /* ---------------- 交互 ---------------- */
  function toDesign(ev) {
    const rect = cv.getBoundingClientRect();
    const s = view.s;
    return {
      x: (ev.clientX - rect.left - (rect.width - DW * s) / 2) / s,
      y: (ev.clientY - rect.top) / s
    };
  }

  stageEl.addEventListener('pointerdown', function (ev) {
    if (ev.target.closest && ev.target.closest('.overlay')) return;
    ev.preventDefault();
    Sound.unlock();
    const p = toDesign(ev);
    pickAt(p.x, p.y);
  });
  stageEl.addEventListener('contextmenu', e => e.preventDefault());

  document.addEventListener('keydown', function (ev) {
    if (ev.key === 'r' || ev.key === 'R') startLevel(G.level);
  });

  $('btnSound').addEventListener('click', function () { Sound.unlock(); Sound.setOn(!Sound.on); });
  $('btnRestart').addEventListener('click', function () { Sound.unlock(); startLevel(G.level); });
  $('btnAgain').addEventListener('click', function () { Sound.unlock(); startLevel(G.level); });
  $('btnNext').addEventListener('click', function () { Sound.unlock(); startLevel(G.level + 1); });

  let rt = 0, lastW = 0, lastH = 0;
  function relayout() {
    clearTimeout(rt);
    rt = setTimeout(function () {
      const rect = stageEl.getBoundingClientRect();
      const w = rect.width || 0, h = rect.height || 0;
      const big = !lastW || Math.abs(w - lastW) > lastW * 0.12 || Math.abs(h - lastH) > lastH * 0.12;
      lastW = w; lastH = h;
      layout();
      if (big) startLevel(G.level);      // 尺寸变化大（横竖屏）才重排本关，防止地址栏伸缩把进度冲掉
    }, 140);
  }
  window.addEventListener('resize', relayout);
  window.addEventListener('orientationchange', function () { lastW = 0; setTimeout(relayout, 260); });
  window.addEventListener('load', function () { layout(); setTimeout(function () { lastW = 0; relayout(); }, 200); });
  if (window.ResizeObserver) new ResizeObserver(relayout).observe(stageEl);
  document.addEventListener('visibilitychange', function () { last = 0; if (document.hidden) Sound.pauseBgm(); else Sound.playBgm(); });

  /* ---------------- 启动 ---------------- */
  Sound.init();
  try { G.best = parseInt(localStorage.getItem('yangle.best') || '1', 10) || 1; } catch (e) { G.best = 1; }
  layout();
  startLevel(1);
  requestAnimationFrame(frame);

  /* 调试钩子 */
  window.YangLe = {
    get state() { return G.state; },
    get level() { return G.level; },
    get stacks() { return G.stacks; },
    get tray() { return G.tray; },
    get left() { return totalLeft(); },
    view,
    startLevel,
    get solution() { return G.solution; },
    get total() { return G.total || 0; },
    stackTops() {
      return G.stacks.map(function (s) {
        const i = topCard(s);
        if (i < 0) return null;
        const p = cardPos(s, i);
        return { src: s.src, x: p.x, y: p.y, t: s.cards[i].t, height: s.cards.filter(c => c.state === 'stack').length };
      }).filter(Boolean);
    },
    topCards() {
      return G.stacks.map(function (s) {
        const i = topCard(s);
        if (i < 0) return null;
        const p = cardPos(s, i);
        return { x: p.x, y: p.y, t: s.cards[i].t };
      }).filter(Boolean);
    },
    clickAt(x, y) { return pickAt(x, y); },
    tick(n, dt) { for (let i = 0; i < (n || 1); i++) update(dt || 1 / 120); },
    render
  };
})();
