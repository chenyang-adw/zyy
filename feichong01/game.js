/* =========================================================
 *  一飞冲天
 *  玩法取自 xyx/CocosCreator小游戏《一飞冲天》源码：
 *  - 点屏幕往上飞，世界向上滚动，飞得越高分越高（源码每 100 距离 +1 分）
 *  - 一圈一圈的障碍环：彩色实心段撞到就结束，玻璃段能撞碎加分
 *  - 环会旋转 / 摆动，找空档穿过去
 *  素材：原工程 atlas（7 张小球脸 / 标题 / 按钮）与 6 个原版音效
 * ========================================================= */
(function () {
  'use strict';

  /* ---------------- 原工程参数 ---------------- */
  const WALL_COLORS = ['#ff0054', '#00c1d0', '#ffc500', '#9600ff', '#ff7e00', '#9ec601', '#027dff'];
  const WALL_LIGHTS = ['#ff4a87', '#4ed4dd', '#fed74e', '#b64dff', '#faa24c', '#bdd74d', '#4ca5ff'];
  const BG_COLORS = ['#f30e98', '#064580', '#5809ce'];          // Define.bgColors
  const ORB_COLORS = ['#f74969', '#6049f7', '#4cd2f8'];         // Define.otherColors
  const ORB_ALPHA = [0.25, 0.18, 0.10];
  const ORB_SCALE = [1, 0.7, 0.5];

  /* atlas 里的 7 张小球脸（role01~role07） */
  const ROLES = [
    [417, 443, 40, 40], [464, 225, 40, 40], [464, 183, 40, 40],
    [434, 278, 40, 40], [432, 321, 40, 40], [417, 401, 40, 40], [389, 359, 40, 40]
  ];
  const UNLOCK = [0, 150, 400, 800, 1500, 2500, 4000];          // 按最高分解锁

  const DW = 640;                       // 设计宽度（源码里球在 x=320）
  const BALL_R = 19;
  const RING_R = 150, RING_T = 30;      // 环半径 / 粗细
  const RING_SEGS = 8;                  // 每环 8 段（源码 wall1 就是 8 段）
  const GRAVITY = 1400;
  const JUMP_V = 560;
  const MAX_FALL = 700;
  const SPACING_MIN = 400, SPACING_MAX = 520;
  const SCORE_PER = 100;                // 每 100 距离 1 分

  const FONT = '"PingFang SC","Microsoft YaHei",system-ui,sans-serif';
  const $ = id => document.getElementById(id);
  const stageEl = $('stage'), cv = $('game');
  const ctx = cv.getContext('2d');
  const overEl = $('over');

  const view = { s: 1, vw: 0, vh: 0, dh: 1000, dpr: 1 };

  /* ---------------- 素材 ---------------- */
  const IMG = { atlas: new Image(), glass: new Image() };
  IMG.atlas.src = 'assets/atlas.png';
  IMG.glass.src = 'assets/glass-arc.png';

  /* ---------------- 音效 ---------------- */
  const Sound = {
    ac: null, buf: {}, on: true, started: false, bgm: null,
    init() {
      try { this.on = localStorage.getItem('feichong.sound') !== '0'; } catch (e) {}
      this.bgm = new Audio('assets/background.mp3');
      this.bgm.loop = true;
      this.bgm.volume = 0.3;
      const names = { tap: 'sound_taphero.wav', glass: 'sound_hitglass.wav', wall: 'sound_hitqiang.wav', button: 'sound_button.wav', unlock: 'sound_herounlock.wav' };
      this.map = names;
      this.syncBtn();
    },
    unlock() {
      if (!this.started) {
        this.started = true;
        try {
          const AC = window.AudioContext || window.webkitAudioContext;
          if (AC) {
            this.ac = new AC();
            Object.keys(this.map).forEach(k => {
              fetch('assets/' + this.map[k]).then(r => r.arrayBuffer()).then(b => {
                return new Promise(res => this.ac.decodeAudioData(b, res, res));
              }).then(d => { if (d) this.buf[k] = d; }).catch(() => {});
            });
          }
        } catch (e) {}
      }
      if (this.ac && this.ac.state === 'suspended') this.ac.resume();
      this.playBgm();
    },
    playBgm() { if (this.on && this.bgm) { const p = this.bgm.play(); if (p && p.catch) p.catch(() => {}); } },
    pauseBgm() { if (this.bgm) { try { this.bgm.pause(); } catch (e) {} } },
    play(name, gain) {
      if (!this.on || !this.ac || !this.buf[name]) return;
      const s = this.ac.createBufferSource();
      s.buffer = this.buf[name];
      const g = this.ac.createGain();
      g.gain.value = gain == null ? 0.5 : gain;
      s.connect(g); g.connect(this.ac.destination);
      s.start();
    },
    setOn(v) {
      this.on = v;
      try { localStorage.setItem('feichong.sound', v ? '1' : '0'); } catch (e) {}
      if (v) this.playBgm(); else this.pauseBgm();
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
    state: 'play',        // play | over
    y: 0, vy: 0,
    rings: [],
    nextRingY: 420,
    score: 0, climb: 0, best: 0,
    ball: 0, unlocked: 1,
    fx: [], orbs: [],
    shake: 0, flash: 0,
    shield: 0,            // 复活后的无敌时间
    revived: false,
    t: 0, scroll: 0
  };

  /* ---------------- 关卡生成 ---------------- */
  function makeRing(y) {
    const R = RING_R + (Math.random() * 2 - 1) * 22;
    const solidCount = 1 + ((Math.random() * 3) | 0);          // 1~3 段实心
    const start = (Math.random() * RING_SEGS) | 0;
    const segs = [];
    for (let i = 0; i < RING_SEGS; i++) {
      const a0 = i * Math.PI * 2 / RING_SEGS;
      const a1 = a0 + Math.PI * 2 / RING_SEGS;
      let solid = false;
      for (let k = 0; k < solidCount; k++) if ((start + k) % RING_SEGS === i) solid = true;
      segs.push({ a0: a0, a1: a1, solid: solid, alive: true, color: (Math.random() * WALL_COLORS.length) | 0 });
    }
    const osc = Math.random() < 0.34;
    return {
      y: y, R: R, segs: segs,
      rot: Math.random() * Math.PI * 2,
      spin: (Math.random() < 0.5 ? 1 : -1) * (0.55 + Math.random() * 0.6),   // 弧度/秒（源码 -50°/s≈0.87）
      osc: osc, oscPhase: Math.random() * 6.28, oscAmp: 1.0,
      hit: 0
    };
  }

  function reset() {
    G.state = 'play';
    G.y = 0; G.vy = 0;
    G.rings = [];
    G.nextRingY = 420;
    G.score = 0; G.climb = 0;
    G.fx = []; G.shake = 0; G.flash = 0; G.shield = 0; G.revived = false;
    G.scroll = 0;
    for (let i = 0; i < 6; i++) { G.rings.push(makeRing(G.nextRingY)); G.nextRingY += SPACING_MIN + Math.random() * (SPACING_MAX - SPACING_MIN); }
    G.orbs = [];
    for (let i = 0; i < 3; i++) G.orbs.push({ x: Math.random() * DW, y: Math.random() * view.dh, r: 90 * ORB_SCALE[i], i: i, sp: 6 + i * 4 });
    overEl.hidden = true;
    updateHud();
  }

  function updateHud() {
    $('score').textContent = G.score;
    $('best').textContent = G.best;
  }

  /* ---------------- 玩法 ---------------- */
  function tap() {
    if (G.state !== 'play') return;
    Sound.unlock();
    G.vy = JUMP_V;
    Sound.play('tap', 0.35);
    for (let i = 0; i < 5; i++) {
      const a = Math.random() * Math.PI * 2;
      G.fx.push({ x: 320 + Math.cos(a) * 12, y: G.y + Math.sin(a) * 12, vx: Math.cos(a) * 60, vy: -80 - Math.random() * 60, r: 3 + Math.random() * 3, t: 0, life: 0.36, c: '#ffffff' });
    }
  }

  function checkRing(ring) {
    const dy = G.y - ring.y;
    if (Math.abs(dy) > ring.R + RING_T + BALL_R + 10) return;
    const rr = (BALL_R + RING_T / 2) * (BALL_R + RING_T / 2);
    for (let s = 0; s < ring.segs.length; s++) {
      const seg = ring.segs[s];
      if (!seg.alive) continue;
      let hitPt = null;
      /* 沿弧段取样，逐点算小球中心的距离（世界坐标：y 向上） */
      for (let i = 0; i <= 8; i++) {
        const a = ring.rot + seg.a0 + (seg.a1 - seg.a0) * (i / 8);
        const px = Math.cos(a) * ring.R, py = Math.sin(a) * ring.R;
        const ddx = 0 - px, ddy = dy - py;
        if (ddx * ddx + ddy * ddy < rr) { hitPt = { x: 320 + px, y: ring.y + py }; break; }
      }
      if (!hitPt) continue;
      if (seg.solid) {
        if (G.shield > 0) { seg.alive = false; boom(hitPt.x, hitPt.y, WALL_COLORS[seg.color]); continue; }
        die(ring, hitPt);
        return;
      }
      seg.alive = false;
      G.score += 2;
      boom(hitPt.x, hitPt.y, '#cfe9ff');
      Sound.play('glass', 0.4);
      G.flash = Math.max(G.flash, 0.5);
      updateHud();
    }
  }

  function boom(x, y, color) {
    for (let i = 0; i < 12; i++) {
      const a = Math.random() * Math.PI * 2, sp = 60 + Math.random() * 200;
      G.fx.push({ x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, r: 2 + Math.random() * 4, t: 0, life: 0.4 + Math.random() * 0.4, c: Math.random() < 0.5 ? color : '#ffffff' });
    }
  }

  function die(ring, pt) {
    G.state = 'over';
    G.shake = 1;
    Sound.play('wall', 0.55);
    boom(pt.x, pt.y, '#ff0054');
    G.best = Math.max(G.best, G.score);
    try { localStorage.setItem('feichong.best', String(G.best)); } catch (e) {}
    const unlocked = UNLOCK.filter(u => G.best >= u).length;
    if (unlocked > G.unlocked) {
      G.unlocked = Math.min(UNLOCK.length, unlocked);
      Sound.play('unlock', 0.5);
    }
    $('finalScore').textContent = G.score;
    $('finalBest').textContent = G.best;
    $('overTip').textContent = G.revived ? '复活机会已经用过了' : '还有一次免费复活';
    $('btnRevive').style.display = G.revived ? 'none' : 'inline-block';
    updateHud();
    overEl.hidden = false;
  }

  function revive() {
    if (G.revived) return;
    G.revived = true;
    G.state = 'play';
    G.shield = 2.6;
    G.vy = JUMP_V;
    /* 把身边危险的那一段直接清掉，避免一起飞就再撞 */
    G.rings.forEach(function (r) {
      if (Math.abs(r.y - G.y) < 260) r.segs.forEach(function (s) { if (s.solid) s.alive = false; });
    });
    overEl.hidden = true;
    Sound.play('button', 0.5);
  }

  /* ---------------- 更新 ---------------- */
  const BALL_SCREEN_Y = 0.62;

  function update(dt) {
    G.t += dt;
    /* 或者 */
    for (let i = 0; i < G.orbs.length; i++) {
      const o = G.orbs[i];
      o.y -= o.sp * dt;
      if (o.y < -o.r) { o.y = view.dh + o.r; o.x = Math.random() * DW; }
    }

    if (G.state === 'play') {
      G.vy -= GRAVITY * dt;
      if (G.vy < -MAX_FALL) G.vy = -MAX_FALL;
      G.y += G.vy * dt;
      if (G.y < 0 && G.vy < 0) { G.y = 0; G.vy = 0; }     // 起点不掉出屏幕

      /* 高度计分（源码：每 100 距离 +1） */
      if (G.y > G.scroll) {
        const gain = G.y - G.scroll;
        G.scroll = G.y;
        const add = Math.floor(G.scroll / SCORE_PER) - G.climb;
        if (add > 0) { G.climb += add; G.score += add; updateHud(); }
      }

      /* 环旋转 + 补新环 */
      for (let i = 0; i < G.rings.length; i++) {
        const r = G.rings[i];
        if (r.osc) r.rot += Math.sin(G.t * 1.1 + r.oscPhase) * r.spin * dt * r.oscAmp;
        else r.rot += r.spin * dt;
        if (r.hit > 0) r.hit = Math.max(0, r.hit - dt * 3);
      }
      while (G.rings.length && G.rings[0].y < G.y - 700) G.rings.shift();
      let topY = G.rings.length ? G.rings[G.rings.length - 1].y : G.y + 400;
      while (topY < G.y + view.dh + 600) {
        topY += SPACING_MIN + Math.random() * (SPACING_MAX - SPACING_MIN);
        G.rings.push(makeRing(topY));
      }
      for (let i = 0; i < G.rings.length; i++) checkRing(G.rings[i]);
    }

    if (G.shield > 0) G.shield = Math.max(0, G.shield - dt);
    if (G.shake > 0) G.shake = Math.max(0, G.shake - dt * 2.4);
    if (G.flash > 0) G.flash = Math.max(0, G.flash - dt * 2.2);

    for (let i = 0; i < G.fx.length; i++) {
      const f = G.fx[i];
      f.t += dt;
      f.x += f.vx * dt; f.y += f.vy * dt;
      f.vy -= 300 * dt;
      if (f.t >= f.life) f.dead = true;
    }
    if (G.fx.some(f => f.dead)) G.fx = G.fx.filter(f => !f.dead);
  }

  /* ---------------- 绘制 ---------------- */
  function worldToScreen(y) {
    const ballScreen = view.dh * BALL_SCREEN_Y;
    return ballScreen - (y - G.y);
  }

  function bgColorFor(progress) {
    /* 背景随高度在三色之间过渡（源码 bgColors） */
    const span = 4200;
    const p = (progress % (span * BG_COLORS.length)) / span;
    const i = Math.floor(p) % BG_COLORS.length;
    const j = (i + 1) % BG_COLORS.length;
    const k = p - Math.floor(p);
    const mix = k < 0.5 ? 0 : (k - 0.5) * 2;
    return mixHex(BG_COLORS[i], BG_COLORS[j], mix);
  }

  function mixHex(a, b, t) {
    const pa = [parseInt(a.slice(1, 3), 16), parseInt(a.slice(3, 5), 16), parseInt(a.slice(5, 7), 16)];
    const pb = [parseInt(b.slice(1, 3), 16), parseInt(b.slice(3, 5), 16), parseInt(b.slice(5, 7), 16)];
    return 'rgb(' + pa.map((v, i) => Math.round(v + (pb[i] - v) * t)).join(',') + ')';
  }

  function drawRing(r) {
    const sy = worldToScreen(r.y);
    if (sy < -r.R - 80 || sy > view.dh + r.R + 80) return;
    for (let i = 0; i < r.segs.length; i++) {
      const seg = r.segs[i];
      if (!seg.alive) continue;
      const a0 = r.rot + seg.a0, a1 = r.rot + seg.a1;
      /* 世界坐标 y 向上、屏幕 y 向下，画的时候把角度取反 */
      const s0 = -a1, s1 = -a0;
      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineWidth = RING_T;
      if (seg.solid) {
        ctx.strokeStyle = WALL_COLORS[seg.color];
        ctx.beginPath();
        ctx.arc(320, sy, r.R, s0, s1);
        ctx.stroke();
        ctx.lineWidth = RING_T * 0.34;
        ctx.strokeStyle = WALL_LIGHTS[seg.color];
        ctx.beginPath();
        ctx.arc(320, sy - 4, r.R, s0 + 0.06, s1 - 0.06);
        ctx.stroke();
      } else {
        ctx.strokeStyle = 'rgba(228,244,255,.92)';
        ctx.beginPath();
        ctx.arc(320, sy, r.R, s0, s1);
        ctx.stroke();
        ctx.lineWidth = RING_T * 0.34;
        ctx.strokeStyle = 'rgba(255,255,255,.95)';
        ctx.beginPath();
        ctx.arc(320, sy - 4, r.R, s0 + 0.07, s1 - 0.07);
        ctx.stroke();
        ctx.lineWidth = 2;
        ctx.strokeStyle = 'rgba(150,205,255,.75)';
        ctx.beginPath();
        ctx.arc(320, sy, r.R - RING_T / 2 + 1.5, s0, s1);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  function drawBall() {
    const sy = view.dh * BALL_SCREEN_Y;
    const flip = (G.shield > 0) && (Math.floor(G.t * 14) % 2 === 0);
    ctx.save();
    ctx.globalAlpha = flip ? 0.45 : 1;
    /* 阴影 + 圆底 */
    ctx.beginPath();
    ctx.arc(320, sy, BALL_R + 3, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,.85)';
    ctx.fill();
    const f = ROLES[G.ball];
    if (IMG.atlas.complete) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(320, sy, BALL_R, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(IMG.atlas, f[0], f[1], f[2], f[3], 320 - BALL_R, sy - BALL_R, BALL_R * 2, BALL_R * 2);
      ctx.restore();
    }
    ctx.restore();
    if (G.shield > 0) {
      ctx.save();
      ctx.globalAlpha = 0.5 + Math.sin(G.t * 10) * 0.2;
      ctx.beginPath();
      ctx.arc(320, sy, BALL_R + 9, 0, Math.PI * 2);
      ctx.strokeStyle = '#8ce07f';
      ctx.lineWidth = 4;
      ctx.stroke();
      ctx.restore();
    }
  }

  function render() {
    const g = ctx, vw = view.vw, vh = view.vh, dh = view.dh, dpr = view.dpr;
    const sx = G.shake > 0 ? (Math.random() - 0.5) * G.shake * 8 : 0;
    const sy2 = G.shake > 0 ? (Math.random() - 0.5) * G.shake * 8 : 0;

    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const bg = bgColorFor(G.y);
    g.fillStyle = bg;
    g.fillRect(0, 0, vw, vh);

    g.setTransform(view.s * dpr, 0, 0, view.s * dpr, ((vw - DW * view.s) / 2 + sx) * dpr, sy2 * dpr);

    /* 背景装饰圆 */
    for (let i = 0; i < G.orbs.length; i++) {
      const o = G.orbs[i];
      g.save();
      g.globalAlpha = ORB_ALPHA[o.i];
      g.fillStyle = '#ffffff';
      g.beginPath();
      g.arc(o.x, o.y, o.r, 0, Math.PI * 2);
      g.fill();
      g.restore();
    }

    for (let i = 0; i < G.rings.length; i++) drawRing(G.rings[i]);

    /* 粒子 */
    for (let i = 0; i < G.fx.length; i++) {
      const f = G.fx[i];
      g.save();
      g.globalAlpha = Math.max(0, 1 - f.t / f.life);
      g.fillStyle = f.c;
      g.beginPath();
      g.arc(f.x, worldToScreen(f.y), f.r, 0, Math.PI * 2);
      g.fill();
      g.restore();
    }

    drawBall();

    if (G.flash > 0) {
      g.fillStyle = 'rgba(255,255,255,' + (G.flash * 0.35) + ')';
      g.fillRect(-80, -80, DW + 160, dh + 160);
    }

    /* 开局提示 */
    if (G.state === 'play' && G.t < 3.2 && G.y < 300) {
      g.save();
      g.globalAlpha = Math.max(0, Math.min(1, 3.2 - G.t));
      g.fillStyle = 'rgba(255,255,255,.92)';
      g.font = '800 26px ' + FONT;
      g.textAlign = 'center';
      g.fillText('戳屏幕往上飞', DW / 2, dh * 0.34);
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
    view.s = Math.max(0.3, Math.min(vw / DW, vh / 900));
    view.dh = vh / view.s;
    cv.width = Math.round(vw * dpr);
    cv.height = Math.round(vh * dpr);
    G.orbs.forEach(function (o) { o.y = Math.min(o.y, view.dh); });
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
    tap();
  });
  stageEl.addEventListener('contextmenu', e => e.preventDefault());
  document.addEventListener('keydown', function (ev) {
    if (ev.key === ' ' || ev.key === 'ArrowUp') { ev.preventDefault(); tap(); }
    else if (ev.key === 'r' || ev.key === 'R') reset();
  });

  $('btnSound').addEventListener('click', function () { Sound.unlock(); Sound.play('button', 0.4); Sound.setOn(!Sound.on); });
  $('btnAgain').addEventListener('click', function () { Sound.unlock(); Sound.play('button', 0.4); reset(); });
  $('btnRevive').addEventListener('click', revive);
  $('btnBall').addEventListener('click', cycleBall);

  function cycleBall() {
    Sound.unlock();
    Sound.play('button', 0.4);
    const max = Math.min(ROLES.length, G.unlocked);
    G.ball = (G.ball + 1) % max;
    try { localStorage.setItem('feichong.ball', String(G.ball)); } catch (e) {}
    $('btnBall').textContent = '换球 ' + (G.ball + 1) + '/' + max;
  }

  let rt = 0;
  function relayout() { clearTimeout(rt); rt = setTimeout(layout, 110); }
  window.addEventListener('resize', relayout);
  window.addEventListener('orientationchange', function () { setTimeout(layout, 240); });
  window.addEventListener('load', function () { layout(); setTimeout(layout, 200); });
  if (window.ResizeObserver) new ResizeObserver(relayout).observe(stageEl);
  document.addEventListener('visibilitychange', function () { last = 0; if (document.hidden) Sound.pauseBgm(); else Sound.playBgm(); });

  /* ---------------- 启动 ---------------- */
  Sound.init();
  try { G.best = parseInt(localStorage.getItem('feichong.best') || '0', 10) || 0; } catch (e) { G.best = 0; }
  G.unlocked = Math.max(1, Math.min(ROLES.length, UNLOCK.filter(u => G.best >= u).length));
  try { G.ball = Math.min(G.unlocked - 1, parseInt(localStorage.getItem('feichong.ball') || '0', 10) || 0); } catch (e) { G.ball = 0; }
  $('btnBall').textContent = '换球 ' + (G.ball + 1) + '/' + G.unlocked;
  layout();
  reset();
  requestAnimationFrame(frame);

  /* 调试钩子 */
  window.FeiChong = {
    get state() { return G.state; },
    get score() { return G.score; },
    get y() { return G.y; },
    get rings() { return G.rings; },
    get ball() { return G.ball; },
    get best() { return G.best; },
    view,
    reset, tap, revive,
    tick(n, dt) { for (let i = 0; i < (n || 1); i++) update(dt || 1 / 120); },
    render,
    /* 把球直接放到某高度（测试用） */
    warp(y) { G.y = y; G.scroll = Math.max(G.scroll, y); G.vy = 0; },
    /* 找当前高度附近最近的环 */
    nearestRing() {
      let best = null;
      G.rings.forEach(function (r) { if (!best || Math.abs(r.y - G.y) < Math.abs(best.y - G.y)) best = r; });
      return best;
    }
  };
})();
