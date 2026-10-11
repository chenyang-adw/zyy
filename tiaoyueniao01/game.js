/* =========================================================
 *  跳跃鸟 · Flappy Bird
 *  玩法与参数取自 xyx/跳跃鸟3.0（Cocos Creator）源码，
 *  像素素材也是原工程的，这里用纯 Canvas 重写成单页游戏。
 *  - 点一下扇翅膀，穿过水管，撞到就结束
 *  - 4 种难度（含自适应）、4 套皮肤、原版音效、最高分本地保存
 * ========================================================= */
(function () {
  'use strict';

  /* ---------------- 逻辑世界（原版像素尺寸） ---------------- */
  const WW = 288;            // 世界宽（原版 Flappy 宽度）
  const GROUND_H = 112;      // 地面高度（base.png 原尺寸）
  const BASE_W = 336;        // base.png 宽度
  const BIRD_W = 34, BIRD_H = 24;
  const PIPE_W = 52, PIPE_H = 320, CAP_H = 24, BODY_X = 2, BODY_W = 48;
  const HIT_INSET_X = 5, HIT_INSET_Y = 4;
  const MAX_FALL = 560;
  const PIPE_SPACING = 150;

  const FONT = '"PingFang SC","Microsoft YaHei",system-ui,sans-serif';

  const MODES = [
    { id: 'easy',   name: '轻松',   g: 1000, flap: -318, gap: 134, gapMin: 134, speed: 72,  ramp: 0 },
    { id: 'normal', name: '普通',   g: 1250, flap: -352, gap: 110, gapMin: 110, speed: 96,  ramp: 0 },
    { id: 'hard',   name: '困难',   g: 1500, flap: -396, gap: 88,  gapMin: 88,  speed: 126, ramp: 0 },
    { id: 'auto',   name: '自适应', g: 1250, flap: -352, gap: 122, gapMin: 84,  speed: 84,  ramp: 1 }
  ];

  const SKINS = [
    { id: 'day',   name: '经典', bg: 'day',   bird: 'yellow', pipe: 'green' },
    { id: 'night', name: '夜晚', bg: 'night', bird: 'blue',   pipe: 'green' },
    { id: 'red',   name: '红管', bg: 'day',   bird: 'red',    pipe: 'red'   },
    { id: 'dusk',  name: '夜红', bg: 'night', bird: 'yellow', pipe: 'red'   }
  ];

  /* ---------------- DOM ---------------- */
  const $ = id => document.getElementById(id);
  const stageEl = $('stage'), cv = $('game');
  const ctx = cv.getContext('2d');
  const scoreBestEl = $('best'), overEl = $('over');

  /* ---------------- 素材 ---------------- */
  const IMG = {};
  const SRC = {
    'bg-day': 'assets/bg-day.png', 'bg-night': 'assets/bg-night.png',
    'base': 'assets/base.png', 'message': 'assets/message.png', 'gameover': 'assets/gameover.png',
    'pipe-green': 'assets/pipe-green.png', 'pipe-red': 'assets/pipe-red.png'
  };
  ['yellow', 'red', 'blue'].forEach(c => ['up', 'mid', 'down'].forEach(f => {
    SRC['bird-' + c + '-' + f] = 'assets/bird-' + c + '-' + f + '.png';
  }));
  let loaded = 0, total = 0;
  Object.keys(SRC).forEach(function (k) {
    total++;
    const im = new Image();
    im.onload = im.onerror = function () { loaded++; };
    im.src = SRC[k];
    IMG[k] = im;
  });

  /* ---------------- 音效 ---------------- */
  const Sound = {
    ac: null, buf: {}, on: true, started: false,
    init() {
      try { this.on = localStorage.getItem('niao.sound') !== '0'; } catch (e) {}
      this.syncBtn();
    },
    unlock() {
      if (this.started) { if (this.ac && this.ac.state === 'suspended') this.ac.resume(); return; }
      this.started = true;
      try {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        this.ac = new AC();
        ['swoosh', 'point', 'hit', 'die'].forEach(n => {
          fetch('assets/' + n + '.wav').then(r => r.arrayBuffer()).then(b => {
            return new Promise(res => this.ac.decodeAudioData(b, res, res));
          }).then(d => { if (d) this.buf[n] = d; }).catch(() => {});
        });
      } catch (e) {}
    },
    play(name, rate, gain) {
      if (!this.on || !this.ac || !this.buf[name]) return;
      const s = this.ac.createBufferSource();
      s.buffer = this.buf[name];
      s.playbackRate.value = rate || 1;
      const g = this.ac.createGain();
      g.gain.value = gain == null ? 0.5 : gain;
      s.connect(g); g.connect(this.ac.destination);
      s.start();
    },
    setOn(v) {
      this.on = v;
      try { localStorage.setItem('niao.sound', v ? '1' : '0'); } catch (e) {}
      this.syncBtn();
    },
    syncBtn() {
      const b = $('btnSound');
      b.textContent = this.on ? '🔊' : '🔇';
      b.style.opacity = this.on ? '1' : '.5';
    }
  };

  /* ---------------- 状态 ---------------- */
  const G = {
    state: 'ready',            // ready | play | dying | over
    mode: MODES[1],
    skin: SKINS[0],
    bird: { x: 80, y: 0, vy: 0, rot: 0, frame: 1, ft: 0 },
    pipes: [],
    groundX: 0,
    score: 0,
    best: 0,
    newBest: false,
    pulse: 0,
    flash: 0,
    shake: 0,
    parts: [],
    deadT: 0,
    t: 0
  };

  const view = { s: 1, cw: 0, ch: 0, wh: 512, offX: 0, dpr: 1 };

  const groundTop = () => view.wh - GROUND_H;
  const curSpeed = () => G.mode.ramp ? Math.min(152, G.mode.speed + G.score * 1.1) : G.mode.speed;
  const curGap = () => G.mode.ramp ? Math.max(G.mode.gapMin, G.mode.gap - G.score * 0.68) : G.mode.gap;
  const curG = () => G.mode.ramp ? Math.min(1660, G.mode.g + G.score * 4.5) : G.mode.g;

  /* ---------------- 布局 ---------------- */
  function layout() {
    const rect = stageEl.getBoundingClientRect();
    const vw = Math.max(200, rect.width || window.innerWidth);
    const vh = Math.max(240, rect.height || window.innerHeight);
    const dpr = Math.min(2.5, window.devicePixelRatio || 1);
    const s = Math.max(0.5, Math.min(vw / WW, vh / 512));
    view.s = s; view.cw = vw; view.ch = vh; view.dpr = dpr;
    view.wh = Math.max(512, vh / s);
    view.offX = Math.max(0, (vw - WW * s) / 2);
    cv.width = Math.round(vw * dpr);
    cv.height = Math.round(vh * dpr);
    ctx.imageSmoothingEnabled = false;
  }

  /* ---------------- 游戏流程 ---------------- */
  function reset() {
    G.state = 'ready';
    G.pipes = [];
    G.parts = [];
    G.score = 0;
    G.newBest = false;
    G.flash = 0;
    G.shake = 0;
    G.deadT = 0;
    G.bird.x = 80;
    G.bird.y = groundTop() - 150;
    G.bird.vy = 0;
    G.bird.rot = 0;
    G.bird.frame = 1;
    overEl.hidden = true;
  }

  function flap() {
    Sound.unlock();
    if (G.state === 'ready') G.state = 'play';
    if (G.state !== 'play') return;
    G.bird.vy = G.mode.flap;
    G.bird.frame = 0;
    G.bird.ft = 0;
    Sound.play('swoosh', 1, 0.34);
  }

  function spawnPipe() {
    const gap = curGap();
    const gy = groundTop();
    const minTop = 44;
    const maxTop = Math.max(minTop + 12, gy - gap - 58);
    const top = minTop + Math.random() * (maxTop - minTop);
    G.pipes.push({ x: WW + 8, top: top, gap: gap, scored: false });
  }

  function addScore() {
    G.score++;
    G.pulse = 1;
    Sound.play('point', 1, 0.42);
    if (G.score > G.best) {
      G.best = G.score;
      G.newBest = true;
      scoreBestEl.textContent = G.best;
      try { localStorage.setItem('niao.best', String(G.best)); } catch (e) {}
    }
  }

  function feathers(x, y) {
    const cols = ['#ffd93b', '#f7b500', '#ffffff', '#e8b83a'];
    for (let i = 0; i < 14; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 40 + Math.random() * 150;
      G.parts.push({
        x: x, y: y,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 60,
        r: 1.5 + Math.random() * 2.5, rot: Math.random() * 6.3,
        vr: (Math.random() - 0.5) * 12, life: 0.7 + Math.random() * 0.6, t: 0,
        c: cols[(Math.random() * cols.length) | 0]
      });
    }
  }

  function hit() {
    if (G.state !== 'play') return;
    G.state = 'dying';
    G.bird.vy = -180;
    G.flash = 1;
    G.shake = 1;
    G.deadT = 0;
    Sound.play('hit', 1, 0.5);
    feathers(G.bird.x, G.bird.y);
  }

  function showOver() {
    G.state = 'over';
    $('finalScore').textContent = G.score;
    $('finalBest').textContent = G.best;
    const medal = $('medal'), mt = $('medalTxt');
    medal.className = 'medal';
    let name = '—';
    if (G.score >= 40) { medal.classList.add('plat'); name = '白金'; }
    else if (G.score >= 30) { medal.classList.add('gold'); name = '金牌'; }
    else if (G.score >= 20) { medal.classList.add('silver'); name = '银牌'; }
    else if (G.score >= 10) { medal.classList.add('bronze'); name = '铜牌'; }
    mt.textContent = name;
    $('overTip').textContent = G.newBest ? '新纪录！继续刷新它' : (G.score === 0 ? '别急，先点一下让它飞起来' : '再来一局，别撞管子');
    overEl.hidden = false;
  }

  /* ---------------- 更新 ---------------- */
  function update(dt) {
    G.t += dt;
    const gy = groundTop();
    const b = G.bird;

    if (G.state === 'ready') {
      b.y = gy - 150 + Math.sin(G.t * 4) * 6;
      b.rot = -6 + Math.sin(G.t * 4) * 4;
      G.groundX += curSpeed() * dt;
    } else if (G.state === 'play') {
      b.vy = Math.min(MAX_FALL, b.vy + curG() * dt);
      b.y += b.vy * dt;
      if (b.y < BIRD_H / 2 + 2) { b.y = BIRD_H / 2 + 2; b.vy = Math.max(b.vy, 0); }
      const target = Math.max(-24, Math.min(88, b.vy * 0.145));
      b.rot += (target - b.rot) * Math.min(1, dt * 11);
      b.ft += dt;
      if (b.ft > 0.085) { b.ft = 0; b.frame = (b.frame + 1) % 4; }

      const sp = curSpeed();
      G.groundX += sp * dt;

      // 水管
      for (let i = 0; i < G.pipes.length; i++) G.pipes[i].x -= sp * dt;
      while (G.pipes.length && G.pipes[0].x < -PIPE_W - 10) G.pipes.shift();
      const last = G.pipes[G.pipes.length - 1];
      if (!last || last.x <= WW - PIPE_SPACING) spawnPipe();

      for (let i = 0; i < G.pipes.length; i++) {
        const p = G.pipes[i];
        if (!p.scored && p.x + PIPE_W / 2 < b.x) { p.scored = true; addScore(); }
      }

      // 碰撞：鸟用内缩判定框，跟原版一样手软一点
      const hx = b.x - BIRD_W / 2 + HIT_INSET_X, hy = b.y - BIRD_H / 2 + HIT_INSET_Y;
      const hw = BIRD_W - HIT_INSET_X * 2, hh = BIRD_H - HIT_INSET_Y * 2;
      for (let i = 0; i < G.pipes.length; i++) {
        const p = G.pipes[i];
        if (hx + hw > p.x && hx < p.x + PIPE_W) {
          if (hy < p.top || hy + hh > p.top + p.gap) { hit(); break; }
        }
      }
      if (G.state === 'play' && b.y + BIRD_H / 2 >= gy) { b.y = gy - BIRD_H / 2; hit(); }
    } else if (G.state === 'dying') {
      b.vy = Math.min(700, b.vy + 1400 * dt);
      b.y += b.vy * dt;
      b.rot = Math.min(92, b.rot + 260 * dt);
      G.deadT += dt;
      if (b.y + BIRD_H / 2 >= gy) {
        b.y = gy - BIRD_H / 2;
        Sound.play('die', 1, 0.5);
        showOver();
      }
    }

    if (G.groundX > BASE_W) G.groundX -= BASE_W;

    // 粒子
    for (let i = 0; i < G.parts.length; i++) {
      const p = G.parts[i];
      p.t += dt;
      p.vy += 420 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
      if (p.y > gy) { p.y = gy; p.vy *= -0.3; p.vx *= 0.6; }
    }
    if (G.parts.some(p => p.t >= p.life)) G.parts = G.parts.filter(p => p.t < p.life);

    if (G.pulse > 0) G.pulse = Math.max(0, G.pulse - dt * 3.2);
    if (G.flash > 0) G.flash = Math.max(0, G.flash - dt * 2.4);
    if (G.shake > 0) G.shake = Math.max(0, G.shake - dt * 3);
  }

  /* ---------------- 绘制 ---------------- */
  function pipeImg() { return IMG['pipe-' + G.skin.pipe]; }

  function drawPipeDown(g, x, y, h, img) {   // 从 (x,y) 往下画，管口在上
    if (h <= 0) return;
    const cap = Math.min(CAP_H, h);
    g.drawImage(img, 0, 0, PIPE_W, CAP_H, x, y, PIPE_W, cap);
    if (h > CAP_H) {
      g.drawImage(img, BODY_X, CAP_H, BODY_W, PIPE_H - CAP_H, x + BODY_X, y + CAP_H, BODY_W, h - CAP_H);
    }
  }

  function drawPipes(g) {
    const img = pipeImg();
    if (!img.complete || !img.naturalWidth) return;
    const gy = groundTop();
    for (let i = 0; i < G.pipes.length; i++) {
      const p = G.pipes[i];
      // 上管：翻转，管口朝下
      g.save();
      g.translate(p.x, p.top);
      g.scale(1, -1);
      drawPipeDown(g, 0, 0, p.top, img);
      g.restore();
      // 下管：管口朝上
      const bh = gy - (p.top + p.gap);
      drawPipeDown(g, p.x, p.top + p.gap, bh, img);
    }
  }

  function drawGround(g) {
    const img = IMG['base'];
    const gy = groundTop();
    g.fillStyle = '#ded895';
    g.fillRect(0, gy, WW, GROUND_H);
    if (!img.complete || !img.naturalWidth) return;
    let x = -(G.groundX % BASE_W);
    for (; x < WW; x += BASE_W) g.drawImage(img, x, gy, BASE_W, GROUND_H);
  }

  function drawBird(g) {
    const b = G.bird;
    const order = ['up', 'mid', 'down', 'mid'];
    const fr = order[(b.frame % 4)];
    const img = IMG['bird-' + G.skin.bird + '-' + fr];
    g.save();
    g.translate(b.x, b.y);
    g.rotate(b.rot * Math.PI / 180);
    if (img && img.complete && img.naturalWidth) {
      g.drawImage(img, -BIRD_W / 2, -BIRD_H / 2, BIRD_W, BIRD_H);
    } else {
      g.fillStyle = '#f7d51d';
      g.fillRect(-BIRD_W / 2, -BIRD_H / 2, BIRD_W, BIRD_H);
    }
    g.restore();
  }

  function drawParts(g) {
    for (let i = 0; i < G.parts.length; i++) {
      const p = G.parts[i];
      const a = 1 - p.t / p.life;
      g.save();
      g.globalAlpha = Math.max(0, a);
      g.translate(p.x, p.y);
      g.rotate(p.rot);
      g.fillStyle = p.c;
      g.fillRect(-p.r, -p.r * 0.7, p.r * 2, p.r * 1.4);
      g.restore();
    }
  }

  function text(g, str, x, y, size, align, fill, stroke) {
    g.font = '800 ' + size + 'px ' + FONT;
    g.textAlign = align || 'center';
    g.textBaseline = 'middle';
    g.lineWidth = Math.max(3, size * 0.18);
    g.strokeStyle = stroke || 'rgba(30,40,45,.72)';
    g.lineJoin = 'round';
    g.strokeText(str, x, y);
    g.fillStyle = fill || '#fff';
    g.fillText(str, x, y);
  }

  function render() {
    const g = ctx, s = view.s, wh = view.wh, dpr = view.dpr;
    const skin = G.skin;

    // 画面外框（宽屏时两侧的底色）
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = skin.bg === 'night' ? '#00565f' : '#2b8a94';
    g.fillRect(0, 0, view.cw, view.ch);

    const sx = G.shake > 0 ? (Math.random() - 0.5) * G.shake * 5 : 0;
    const sy = G.shake > 0 ? (Math.random() - 0.5) * G.shake * 5 : 0;
    g.setTransform(s * dpr, 0, 0, s * dpr, (view.offX + sx * s) * dpr, sy * s * dpr);
    g.imageSmoothingEnabled = false;

    // 天空 + 背景
    const bg = IMG['bg-' + skin.bg];
    g.fillStyle = skin.bg === 'night' ? '#008793' : '#4ec0ca';
    g.fillRect(-20, -20, WW + 40, wh + 40);
    if (bg && bg.complete && bg.naturalWidth) g.drawImage(bg, 0, wh - 512, WW, 512);

    drawPipes(g);
    drawGround(g);
    drawParts(g);
    drawBird(g);

    // 分数
    if (G.state !== 'ready') {
      const k = 1 + G.pulse * 0.28;
      g.save();
      g.translate(WW / 2, 74);
      g.scale(k, k);
      text(g, String(G.score), 0, 0, 42, 'center');
      g.restore();
    }

    // 准备提示
    if (G.state === 'ready') {
      const msg = IMG['message'];
      const mh = 267, cy = wh * 0.32;
      if (msg && msg.complete && msg.naturalWidth) {
        const mw = 184;
        g.drawImage(msg, (WW - mw) / 2, cy - mh * 0.5, mw, mh);
      }
      const bob = Math.sin(G.t * 3.4) * 4;
      text(g, '点击 / 空格 起飞', WW / 2, cy + mh * 0.5 + 22 + bob, 15, 'center', '#ffffff', 'rgba(40,60,60,.6)');
      text(g, '难度：' + G.mode.name + '   皮肤：' + G.skin.name, WW / 2, wh - GROUND_H - 22, 12.5, 'center', 'rgba(255,255,255,.92)', 'rgba(30,50,55,.55)');
    }

    if (G.flash > 0) {
      g.fillStyle = 'rgba(255,255,255,' + (G.flash * 0.5) + ')';
      g.fillRect(0, 0, WW, wh);
    }
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
  stageEl.addEventListener('pointerdown', function (ev) {
    if (ev.target.closest && ev.target.closest('.overlay')) return;
    ev.preventDefault();
    flap();
  });
  stageEl.addEventListener('contextmenu', e => e.preventDefault());

  document.addEventListener('keydown', function (ev) {
    if (ev.key === ' ' || ev.key === 'ArrowUp' || ev.key === 'w' || ev.key === 'W' || ev.key === 'Enter') {
      ev.preventDefault();
      flap();
    } else if (ev.key === 'r' || ev.key === 'R') {
      reset();
    }
  });

  /* 难度 */
  const modesEl = $('modes');
  MODES.forEach(function (m, i) {
    const b = document.createElement('button');
    b.className = 'chip' + (i === 1 ? ' on' : '');
    b.textContent = m.name;
    b.dataset.id = m.id;
    b.addEventListener('click', function () {
      G.mode = m;
      Array.prototype.forEach.call(modesEl.children, c => c.classList.toggle('on', c === b));
      try { localStorage.setItem('niao.mode', m.id); } catch (e) {}
      reset();
    });
    modesEl.appendChild(b);
  });

  /* 皮肤 */
  $('btnSkin').addEventListener('click', function () {
    const i = SKINS.indexOf(G.skin);
    G.skin = SKINS[(i + 1) % SKINS.length];
    this.textContent = '皮肤·' + G.skin.name;
    try { localStorage.setItem('niao.skin', G.skin.id); } catch (e) {}
  });

  $('btnSound').addEventListener('click', function () { Sound.unlock(); Sound.setOn(!Sound.on); });
  $('btnAgain').addEventListener('click', function () { Sound.unlock(); reset(); flap(); });

  let rt = 0;
  function relayout() { clearTimeout(rt); rt = setTimeout(function () { layout(); if (G.state === 'ready') G.bird.y = groundTop() - 150; }, 90); }
  window.addEventListener('resize', relayout);
  window.addEventListener('orientationchange', function () { setTimeout(layout, 240); });
  window.addEventListener('load', function () { layout(); setTimeout(layout, 200); });
  if (window.ResizeObserver) new ResizeObserver(relayout).observe(stageEl);
  document.addEventListener('visibilitychange', function () { last = 0; });

  /* ---------------- 启动 ---------------- */
  Sound.init();
  try { G.best = parseInt(localStorage.getItem('niao.best') || '0', 10) || 0; } catch (e) { G.best = 0; }
  scoreBestEl.textContent = G.best;
  try {
    const sk = localStorage.getItem('niao.skin');
    const f = SKINS.filter(x => x.id === sk)[0];
    if (f) G.skin = f;
    const md = localStorage.getItem('niao.mode');
    const fm = MODES.filter(x => x.id === md)[0];
    if (fm) {
      G.mode = fm;
      Array.prototype.forEach.call(modesEl.children, c => c.classList.toggle('on', c.dataset.id === fm.id));
    }
  } catch (e) {}
  // URL 参数：?skin=night&mode=hard 可以直接指定开局外观
  try {
    const q = new URLSearchParams(location.search);
    const qs = SKINS.filter(x => x.id === q.get('skin'))[0];
    if (qs) G.skin = qs;
    const qm = MODES.filter(x => x.id === q.get('mode'))[0];
    if (qm) {
      G.mode = qm;
      Array.prototype.forEach.call(modesEl.children, c => c.classList.toggle('on', c.dataset.id === qm.id));
    }
  } catch (e) {}
  $('btnSkin').textContent = '皮肤·' + G.skin.name;

  layout();
  reset();
  requestAnimationFrame(frame);

  /* 调试钩子（无头测试用） */
  window.TiaoYueNiao = {
    get state() { return G.state; },
    get score() { return G.score; },
    get pipes() { return G.pipes; },
    get bird() { return G.bird; },
    get groundY() { return groundTop(); },
    get view() { return view; },
    flap, reset,
    setMode(id) { const m = MODES.filter(x => x.id === id)[0]; if (m) { G.mode = m; reset(); } },
    tick(n, dt) { for (let i = 0; i < (n || 1); i++) update(dt || 1 / 120); },
    render,
    loadedRatio() { return loaded / total; }
  };
})();
