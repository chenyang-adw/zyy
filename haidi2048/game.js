/* =========================================================
 *  海底 2048 · 合成大海怪
 *  玩法取自 xyx/2048（Cocos Creator 物理合成球）源码，
 *  这里用纯 Canvas + 自写 Verlet 物理重写成单页游戏。
 *  - 拖动左右选位置，松手落球
 *  - 两个相同数字相撞 → 合并翻倍
 *  - 合成到 2048 炸开，继续刷分
 * ========================================================= */
(function () {
  'use strict';

  /* ---------------- 世界常量（逻辑坐标固定 420 × 620） ---------------- */
  const W = 420, H = 620;
  const PAD = 14;
  const WALL_L = PAD, WALL_R = W - PAD;
  const FLOOR = H - PAD;
  const DROP_Y = 74;          // 待落球中心高度
  const DANGER_Y = 130;       // 越线判定
  const STEP = 1 / 120;       // 物理固定步长
  const GRAVITY = 2050;
  const WIN = 2048;
  const SPAWN_POOL = [2, 2, 2, 2, 2, 2, 4, 4, 4, 8];
  const FONT = '"PingFang SC","Microsoft YaHei",system-ui,sans-serif';

  /* 每级球的配色：[高光, 主色, 暗部, 数字] */
  const COLORS = [
    ['#ffffff', '#c9e9ff', '#8cc2e8', '#0b3757'], // 2
    ['#ffffff', '#a8dcff', '#5f9fd6', '#08304f'], // 4
    ['#f0fffd', '#7fe3cf', '#2fa992', '#04352e'], // 8
    ['#f4ffe8', '#a6e88f', '#4fa848', '#123a11'], // 16
    ['#ffffe8', '#e8e878', '#bfc22f', '#3d3f06'], // 32
    ['#fff8e0', '#ffcf5e', '#e0a01c', '#4a2c04'], // 64
    ['#fff2e0', '#ffa64f', '#e07016', '#4d2405'], // 128
    ['#fff0e8', '#ff7b5e', '#d93f27', '#54110a'], // 256
    ['#fff0f6', '#ff77ab', '#d93070', '#520829'], // 512
    ['#f8f0ff', '#bb86f5', '#7d2fd8', '#2c0a52']  // 1024
  ];

  /* 半径曲线：最小球 r=20（占宽度 10%），最大 1024 球 r≈115（占宽度 58%） */
  const radiusOf = v => 20 * Math.pow(v / 2, 0.28);
  const idxOf = v => Math.max(0, Math.min(9, Math.round(Math.log2(v)) - 1));

  /* ---------------- DOM ---------------- */
  const $ = id => document.getElementById(id);
  const seaCv = $('sea'), tankCv = $('tank'), nextCv = $('nextc');
  const stageEl = $('stage'), hintEl = $('hint');
  const scoreEl = $('score'), bestEl = $('best');
  const overEl = $('over'), helpEl = $('help');
  const seaCtx = seaCv.getContext('2d');
  const ctx = tankCv.getContext('2d');
  const nextCtx = nextCv.getContext('2d');

  /* ---------------- 状态 ---------------- */
  let balls = [], effects = [];
  let pending = null, nextVal = 2;
  let score = 0, best = 0, combo = 0;
  let dropX = W / 2;
  let state = 'play';                 // play | over
  let dangerT = 0, cool = 0, shake = 0, flash = 0;
  let acc = 0, time = 0, last = 0;
  let SCALE = 1;
  const shakeO = { x: 0, y: 0 };

  /* ---------------- 音效 ---------------- */
  const Sound = {
    ac: null, buf: {}, bgm: null, on: true, starting: false,
    init() {
      try { this.on = localStorage.getItem('haidi2048.sound') !== '0'; } catch (e) {}
      this.bgm = new Audio('assets/bgm.m4a');
      this.bgm.loop = true;
      this.bgm.volume = 0.32;
      this.bgm.preload = 'auto';
    },
    unlock() {
      if (this.starting) return;
      this.starting = true;
      try {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (AC && !this.ac) {
          this.ac = new AC();
          ['hit', 'destroy'].forEach(n => {
            fetch('assets/' + n + '.wav').then(r => r.arrayBuffer()).then(b => {
              return new Promise(res => this.ac.decodeAudioData(b, res, res));
            }).then(decoded => { if (decoded) this.buf[n] = decoded; }).catch(() => {});
          });
        }
        if (this.ac && this.ac.state === 'suspended') this.ac.resume();
      } catch (e) {}
      this.playBgm();
    },
    playBgm() {
      if (!this.on || !this.bgm) return;
      const p = this.bgm.play();
      if (p && p.catch) p.catch(() => {});
    },
    pauseBgm() { if (this.bgm) { try { this.bgm.pause(); } catch (e) {} } },
    sfx(name, rate, gain) {
      if (!this.on) return;
      const b = this.buf[name];
      if (!this.ac || !b) return;
      const src = this.ac.createBufferSource();
      src.buffer = b;
      src.playbackRate.value = rate || 1;
      const g = this.ac.createGain();
      g.gain.value = gain == null ? 0.5 : gain;
      src.connect(g); g.connect(this.ac.destination);
      src.start();
    },
    setOn(v) {
      this.on = v;
      try { localStorage.setItem('haidi2048.sound', v ? '1' : '0'); } catch (e) {}
      if (v) this.playBgm(); else this.pauseBgm();
      const btn = $('btnSound');
      btn.textContent = v ? '🔊 音效' : '🔇 静音';
      btn.classList.toggle('off', !v);
    }
  };

  /* ---------------- 小球 ---------------- */
  class Ball {
    constructor(x, y, v, pend) {
      this.x = x; this.y = y;
      this.px = x; this.py = y;
      this.v = v;
      this.r = radiusOf(v);
      this.angle = 0;
      this.pop = pend ? 0 : 0.55;   // 出场弹一下
      this.dead = false;
      this.pending = !!pend;
    }
    setVel(vx, vy) { this.px = this.x - vx; this.py = this.y - vy; }
    get vx() { return this.x - this.px; }
    get vy() { return this.y - this.py; }
  }

  /* ---------------- 特效 ---------------- */
  function fx(o) { o.t = 0; effects.push(o); return o; }

  function burstAt(x, y, v, big) {
    const col = COLORS[idxOf(v)][1];
    fx({ k: 'ring', x, y, r0: radiusOf(v) * 0.5, r1: radiusOf(v) * (big ? 3.4 : 2.1), life: big ? 0.9 : 0.5, c: col, w: big ? 5 : 3 });
    const n = big ? 26 : 7;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = (big ? 90 : 40) + Math.random() * (big ? 220 : 90);
      fx({
        k: 'bubble', x: x + Math.cos(a) * 4, y: y + Math.sin(a) * 4,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 40,
        r: (big ? 3 : 2) + Math.random() * (big ? 6 : 3),
        life: 0.5 + Math.random() * (big ? 0.9 : 0.4), c: col
      });
    }
  }

  /* ---------------- 物理 ---------------- */
  function wallClamp() {
    for (let i = 0; i < balls.length; i++) {
      const b = balls[i];
      if (b.dead || b.pending) continue;
      const r = b.r;
      if (b.x < WALL_L + r) {
        const v = b.vx; b.x = WALL_L + r; b.px = b.x + v * 0.34;
        const vy = b.vy; b.py = b.y - vy * 0.985;
      } else if (b.x > WALL_R - r) {
        const v = b.vx; b.x = WALL_R - r; b.px = b.x + v * 0.34;
        const vy = b.vy; b.py = b.y - vy * 0.985;
      }
      if (b.y > FLOOR - r) {
        const vy = b.vy; b.y = FLOOR - r; b.py = b.y + vy * 0.28;
        b.px = b.x - b.vx * 0.90;      // 地面摩擦
      }
    }
  }

  function solvePairs() {
    for (let i = 0; i < balls.length; i++) {
      const a = balls[i];
      if (a.dead || a.pending) continue;
      for (let j = i + 1; j < balls.length; j++) {
        const b = balls[j];
        if (b.dead || b.pending) continue;
        let dx = b.x - a.x, dy = b.y - a.y;
        const rr = a.r + b.r;
        let d2 = dx * dx + dy * dy;
        if (d2 >= rr * rr) continue;
        let d = Math.sqrt(d2);
        if (d < 0.0001) { dx = 0.1; dy = -0.1; d = 0.1414; }
        const nx = dx / d, ny = dy / d;
        const ov = (rr - d) * 0.72;
        const ma = a.r * a.r, mb = b.r * b.r, sum = ma + mb;
        a.x -= nx * ov * (mb / sum); a.y -= ny * ov * (mb / sum);
        b.x += nx * ov * (ma / sum); b.y += ny * ov * (ma / sum);
      }
    }
  }

  function stepPhysics() {
    const damp = 0.9986;
    for (let i = 0; i < balls.length; i++) {
      const b = balls[i];
      if (b.dead || b.pending) continue;
      const vx = b.vx * damp, vy = b.vy * damp;
      b.px = b.x; b.py = b.y;
      b.x += vx;
      b.y += vy + GRAVITY * STEP * STEP;
      b.angle += (b.x - b.px) / b.r;
    }
    for (let it = 0; it < 3; it++) { wallClamp(); solvePairs(); }
    mergePass();
  }

  function mergePass() {
    for (let i = 0; i < balls.length; i++) {
      const a = balls[i];
      if (a.dead || a.pending) continue;
      for (let j = i + 1; j < balls.length; j++) {
        const b = balls[j];
        if (b.dead || b.pending || b.v !== a.v) continue;
        const dx = b.x - a.x, dy = b.y - a.y;
        const lim = (a.r + b.r) * 0.97;
        if (dx * dx + dy * dy > lim * lim) continue;
        merge(a, b);
        if (a.dead) break;
      }
    }
    if (balls.some(b => b.dead)) balls = balls.filter(b => !b.dead);
  }

  function merge(a, b) {
    const nv = a.v * 2;
    const mx = (a.x * a.r * a.r + b.x * b.r * b.r) / (a.r * a.r + b.r * b.r);
    const my = (a.y * a.r * a.r + b.y * b.r * b.r) / (a.r * a.r + b.r * b.r);
    const vx = (a.vx + b.vx) / 2, vy = (a.vy + b.vy) / 2;
    a.dead = true; b.dead = true;
    Sound.sfx('destroy', 0.88 + Math.min(6, Math.log2(nv)) / 14, 0.42);
    shake = Math.min(1, shake + (nv >= 128 ? 0.5 : 0.16) + Math.min(0.5, Math.log2(nv) / 24));

    if (nv >= WIN) {
      // 通关：炸开并移除
      score += nv;
      combo++;
      burstAt(mx, my, a.v, true);
      fx({ k: 'ring', x: mx, y: my, r0: radiusOf(a.v), r1: 260, life: 1.1, c: '#fff3b0', w: 7 });
      fx({ k: 'text', x: mx, y: my, txt: '2048 !', life: 1.6, c: '#ffe37a', sz: 40 });
      flash = 1;
      for (let i = 0; i < 30; i++) {
        const ang = Math.random() * Math.PI * 2;
        fx({
          k: 'bubble', x: mx, y: my, vx: Math.cos(ang) * (120 + Math.random() * 320), vy: Math.sin(ang) * (120 + Math.random() * 320) - 80,
          r: 3 + Math.random() * 8, life: 0.9 + Math.random(), c: '#ffe9a8'
        });
      }
      updScore();
      return;
    }

    const nb = new Ball(mx, my, nv, false);
    nb.setVel(vx, vy);
    nb.pop = 0.85;
    balls.push(nb);
    score += nv;
    combo++;
    updScore();
    burstAt(mx, my, nv, nv >= 512);
    fx({ k: 'text', x: mx, y: my - radiusOf(nv) * 0.6, txt: '+' + nv, life: 0.8, c: '#ffffff', sz: 15 + Math.min(16, Math.log2(nv) * 1.6) });
  }

  /* ---------------- 回合逻辑 ---------------- */
  function roll() { return SPAWN_POOL[(Math.random() * SPAWN_POOL.length) | 0]; }

  function spawnPending() {
    pending = new Ball(dropX, DROP_Y, nextVal, true);
    nextVal = roll();
    drawNext();
  }

  function drop() {
    if (!pending || state !== 'play') return;
    hintEl.classList.add('gone');
    const b = pending;
    b.pending = false;
    b.setVel(0, 70);
    balls.push(b);
    pending = null;
    cool = 0.26;
    Sound.sfx('hit', 0.95 + Math.random() * 0.12, 0.34);
  }

  function updScore() {
    scoreEl.textContent = score;
    if (score > best) {
      best = score;
      bestEl.textContent = best;
      try { localStorage.setItem('haidi2048.best', String(best)); } catch (e) {}
    }
  }

  function gameOver() {
    if (state === 'over') return;
    state = 'over';
    Sound.sfx('destroy', 0.55, 0.5);
    $('finalScore').textContent = score;
    $('finalBest').textContent = best;
    overEl.hidden = false;
  }

  function reset() {
    balls = []; effects = [];
    pending = null; nextVal = roll();
    score = 0; combo = 0; dangerT = 0; cool = 0; shake = 0; flash = 0;
    dropX = W / 2;
    state = 'play';
    overEl.hidden = true;
    hintEl.classList.remove('gone');
    scoreEl.textContent = '0';
    spawnPending();
  }

  /* ---------------- 更新 ---------------- */
  function update(dt) {
    if (state === 'play') {
      acc += dt;
      let n = 0;
      while (acc >= STEP && n < 6) { stepPhysics(); acc -= STEP; n++; }
      if (acc > STEP) acc = 0;
    }

    for (let i = 0; i < balls.length; i++) {
      const b = balls[i];
      if (b.pop > 0) b.pop = Math.max(0, b.pop - dt * 3.4);
    }
    if (pending) pending.y = DROP_Y + Math.sin(time * 3.2) * 2.2;

    /* 越线判定 */
    if (state === 'play') {
      let danger = false;
      for (let i = 0; i < balls.length; i++) {
        const b = balls[i];
        if (b.pending) continue;
        const sp = Math.hypot(b.vx, b.vy) / STEP;
        if (b.y - b.r < DANGER_Y && sp < 42) { danger = true; break; }
      }
      dangerT = danger ? dangerT + dt : Math.max(0, dangerT - dt * 2.2);
      if (dangerT > 1.5) gameOver();
      if (cool > 0) { cool -= dt; if (cool <= 0 && !pending) spawnPending(); }
    }

    /* 特效 */
    for (let i = 0; i < effects.length; i++) {
      const e = effects[i];
      e.t += dt;
      if (e.t >= e.life) { e.dead = true; continue; }
      if (e.k === 'bubble') {
        e.x += e.vx * dt; e.y += e.vy * dt;
        e.vy -= 260 * dt; e.vx *= 0.985; e.vy *= 0.985;
      }
    }
    if (effects.some(e => e.dead)) effects = effects.filter(e => !e.dead);

    if (shake > 0) shake = Math.max(0, shake - dt * 3.4);
    if (flash > 0) flash = Math.max(0, flash - dt * 2.6);
  }

  /* ---------------- 绘制：小球 ---------------- */
  function drawBallShape(g, x, y, r, value, angle, pop) {
    const c = COLORS[idxOf(value)];
    const s = 1 + pop * pop * 0.22;
    g.save();
    g.translate(x, y);
    g.scale(s, s);

    // 外发光（大球更亮）
    if (value >= 128) {
      g.shadowColor = c[1];
      g.shadowBlur = 10 + Math.min(26, Math.log2(value) * 2.2);
    }

    const grd = g.createRadialGradient(-r * 0.34, -r * 0.4, r * 0.06, 0, 0, r * 1.06);
    grd.addColorStop(0, c[0]);
    grd.addColorStop(0.30, c[1]);
    grd.addColorStop(1, c[2]);
    g.beginPath();
    g.arc(0, 0, r, 0, Math.PI * 2);
    g.fillStyle = grd;
    g.fill();
    g.shadowBlur = 0;

    // 底部内阴影
    const sh = g.createLinearGradient(0, -r, 0, r);
    sh.addColorStop(0, 'rgba(255,255,255,.20)');
    sh.addColorStop(0.55, 'rgba(0,0,0,0)');
    sh.addColorStop(1, 'rgba(0,0,0,.20)');
    g.beginPath();
    g.arc(0, 0, r, 0, Math.PI * 2);
    g.fillStyle = sh;
    g.fill();

    // 滚动纹（体现转动）
    if (r > 14) {
      g.save();
      g.beginPath(); g.arc(0, 0, r * 0.97, 0, Math.PI * 2); g.clip();
      g.rotate(angle);
      g.strokeStyle = 'rgba(255,255,255,.30)';
      g.lineWidth = Math.max(1.2, r * 0.07);
      g.beginPath();
      g.arc(0, 0, r * 0.66, -0.9, 0.5);
      g.stroke();
      g.beginPath();
      g.arc(0, 0, r * 0.66, Math.PI - 0.9, Math.PI + 0.5);
      g.stroke();
      g.restore();
    }

    // 高光
    g.save();
    g.translate(-r * 0.33, -r * 0.42);
    g.rotate(-0.5);
    g.beginPath();
    g.ellipse(0, 0, r * 0.32, r * 0.18, 0, 0, Math.PI * 2);
    g.fillStyle = 'rgba(255,255,255,.66)';
    g.fill();
    g.restore();

    // 描边
    g.beginPath();
    g.arc(0, 0, r - 0.7, 0, Math.PI * 2);
    g.strokeStyle = 'rgba(255,255,255,.5)';
    g.lineWidth = 1.4;
    g.stroke();

    // 数字
    const txt = String(value);
    let sz = r * 1.05;
    g.font = '800 ' + sz + 'px ' + FONT;
    const want = r * 1.46;
    const tw = g.measureText(txt).width;
    if (tw > want) sz = sz * want / tw;
    g.font = '800 ' + sz + 'px ' + FONT;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = c[3];
    g.fillText(txt, 0, sz * 0.06);
    g.restore();
  }

  /* ---------------- 绘制：游戏区 ---------------- */
  function roundRect(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }

  function drawGlass(g) {
    roundRect(g, 0.5, 0.5, W - 1, H - 1, 22);
    const grd = g.createLinearGradient(0, 0, 0, H);
    grd.addColorStop(0, 'rgba(10,54,92,.30)');
    grd.addColorStop(0.45, 'rgba(7,40,72,.42)');
    grd.addColorStop(1, 'rgba(3,22,42,.56)');
    g.fillStyle = grd;
    g.fill();

    g.save();
    g.clip();
    // 顶部水光
    const hi = g.createLinearGradient(0, 0, 0, 120);
    hi.addColorStop(0, 'rgba(200,248,255,.16)');
    hi.addColorStop(1, 'rgba(200,248,255,0)');
    g.fillStyle = hi;
    g.fillRect(0, 0, W, 120);
    // 水下波纹
    g.globalCompositeOperation = 'lighter';
    g.lineWidth = 12;
    for (let i = 0; i < 5; i++) {
      const y = 96 + i * 104 + Math.sin(time * 0.7 + i * 1.3) * 15;
      g.beginPath();
      g.moveTo(-10, y);
      for (let x = 0; x <= W + 20; x += 22) g.lineTo(x, y + Math.sin(x * 0.024 + time * 1.15 + i) * 5.5);
      g.strokeStyle = 'rgba(130,220,255,.030)';
      g.stroke();
    }
    // 底部暗角
    const bot = g.createLinearGradient(0, H - 130, 0, H);
    bot.addColorStop(0, 'rgba(0,0,0,0)');
    bot.addColorStop(1, 'rgba(0,10,22,.34)');
    g.globalCompositeOperation = 'source-over';
    g.fillStyle = bot;
    g.fillRect(0, H - 130, W, 130);
    g.restore();

    roundRect(g, 0.5, 0.5, W - 1, H - 1, 22);
    g.strokeStyle = 'rgba(160,235,255,.22)';
    g.lineWidth = 1.4;
    g.stroke();
  }

  function landingY(x, r) {
    let bestY = FLOOR - r;
    for (let i = 0; i < balls.length; i++) {
      const b = balls[i];
      if (b.dead || b.pending) continue;
      const dx = Math.abs(b.x - x);
      const rr = b.r + r;
      if (dx < rr) {
        const dy = Math.sqrt(rr * rr - dx * dx);
        const top = b.y - dy - r;
        if (top < bestY) bestY = top;
      }
    }
    return Math.max(DROP_Y, bestY);
  }

  function drawGuide(g) {
    if (!pending) return;
    const x = pending.x, r = pending.r;
    const ly = landingY(x, r);

    g.save();
    g.setLineDash([5, 9]);
    g.strokeStyle = 'rgba(190,248,255,.16)';
    g.lineWidth = 1.2;
    g.beginPath();
    g.moveTo(PAD, DROP_Y);
    g.lineTo(W - PAD, DROP_Y);
    g.stroke();

    if (ly > DROP_Y + r * 1.2) {
      g.strokeStyle = 'rgba(190,248,255,.22)';
      g.setLineDash([6, 8]);
      g.beginPath();
      g.moveTo(x, DROP_Y + r * 0.85);
      g.lineTo(x, ly - r * 0.35);
      g.stroke();
    }
    g.setLineDash([5, 6]);
    g.strokeStyle = 'rgba(190,248,255,.34)';
    g.lineWidth = 1.6;
    g.beginPath();
    g.ellipse(x, ly + r * 0.55, r * 0.92, r * 0.26, 0, 0, Math.PI * 2);
    g.stroke();
    g.restore();
  }

  function drawDanger(g) {
    const hot = densityHot();
    const a = 0.10 + hot * 0.5 + Math.sin(time * 7) * 0.08 * hot;
    if (hot <= 0 && dangerT <= 0) {
      g.save();
      g.setLineDash([7, 9]);
      g.strokeStyle = 'rgba(190,248,255,.10)';
      g.lineWidth = 1;
      g.beginPath(); g.moveTo(PAD, DANGER_Y); g.lineTo(W - PAD, DANGER_Y); g.stroke();
      g.restore();
      return;
    }
    g.save();
    g.setLineDash([9, 8]);
    g.strokeStyle = 'rgba(255,120,110,' + Math.min(0.85, a) + ')';
    g.lineWidth = 2;
    g.shadowColor = 'rgba(255,90,80,.8)';
    g.shadowBlur = 14;
    g.beginPath(); g.moveTo(PAD, DANGER_Y); g.lineTo(W - PAD, DANGER_Y); g.stroke();
    g.restore();
  }

  function densityHot() {
    let top = FLOOR;
    for (let i = 0; i < balls.length; i++) {
      const b = balls[i];
      if (b.pending) continue;
      if (b.y - b.r < top) top = b.y - b.r;
    }
    const k = (top - DANGER_Y) / 200;
    return Math.max(0, Math.min(1, 1 - k));
  }

  function drawEffects(g) {
    for (let i = 0; i < effects.length; i++) {
      const e = effects[i];
      const p = e.t / e.life;
      if (e.k === 'ring') {
        const r = e.r0 + (e.r1 - e.r0) * (1 - Math.pow(1 - p, 2.4));
        g.save();
        g.globalCompositeOperation = 'lighter';
        g.beginPath();
        g.arc(e.x, e.y, r, 0, Math.PI * 2);
        g.strokeStyle = e.c;
        g.globalAlpha = (1 - p) * 0.75;
        g.lineWidth = e.w * (1 - p * 0.7);
        g.stroke();
        g.restore();
      } else if (e.k === 'bubble') {
        g.save();
        g.globalAlpha = (1 - p) * 0.85;
        g.beginPath();
        g.arc(e.x, e.y, e.r * (1 - p * 0.35), 0, Math.PI * 2);
        g.fillStyle = e.c;
        g.fill();
        g.globalAlpha = (1 - p) * 0.9;
        g.beginPath();
        g.arc(e.x - e.r * 0.3, e.y - e.r * 0.35, e.r * 0.3, 0, Math.PI * 2);
        g.fillStyle = 'rgba(255,255,255,.9)';
        g.fill();
        g.restore();
      } else if (e.k === 'text') {
        g.save();
        g.globalAlpha = 1 - p * p;
        g.font = '800 ' + e.sz + 'px ' + FONT;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.lineWidth = 4;
        g.strokeStyle = 'rgba(2,22,40,.55)';
        g.strokeText(e.txt, e.x, e.y - p * 46);
        g.fillStyle = e.c;
        g.fillText(e.txt, e.x, e.y - p * 46);
        g.restore();
      }
    }
  }

  function drawTank() {
    ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0);
    ctx.clearRect(-40, -40, W + 80, H + 80);
    drawGlass(ctx);
    drawDanger(ctx);
    ctx.setTransform(SCALE, 0, 0, SCALE, shakeO.x * SCALE, shakeO.y * SCALE);
    for (let i = 0; i < balls.length; i++) {
      const b = balls[i];
      if (b.pending || b.dead) continue;
      drawBallShape(ctx, b.x, b.y, b.r, b.v, b.angle, b.pop);
    }
    drawEffects(ctx);
    drawGuide(ctx);
    if (pending) {
      ctx.save();
      ctx.shadowColor = 'rgba(150,235,255,.85)';
      ctx.shadowBlur = 22;
      drawBallShape(ctx, pending.x, pending.y, pending.r, pending.v, 0, pending.pop);
      ctx.restore();
    }
    if (flash > 0) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = 'rgba(255,245,200,' + (flash * 0.35) + ')';
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }
  }

  function drawNext() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    nextCv.width = 42 * dpr * 2;
    nextCv.height = 42 * dpr * 2;
    nextCtx.setTransform(dpr * 2, 0, 0, dpr * 2, 0, 0);
    nextCtx.clearRect(0, 0, 42, 42);
    drawBallShape(nextCtx, 21, 21, 13.5, nextVal, 0, 0);
  }

  /* ---------------- 海底背景 ---------------- */
  const Sea = {
    fish: [], bubbles: [], weeds: [], w: 1, h: 1, img: null, ready: false,
    init() {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = window.innerWidth, h = window.innerHeight;
      this.w = w; this.h = h;
      seaCv.width = Math.round(w * dpr);
      seaCv.height = Math.round(h * dpr);
      seaCtx.setTransform(dpr, 0, 0, dpr, 0, 0);

      this.fish = [];
      const n = Math.max(6, Math.min(16, Math.round(w / 150)));
      for (let i = 0; i < n; i++) {
        const dir = Math.random() < 0.5 ? 1 : -1;
        const s = 44 + Math.random() * 74;
        this.fish.push({
          x: Math.random() * w, y: 30 + Math.random() * (h * 0.72),
          s, dir, spd: 14 + Math.random() * 30 + s * 0.12,
          f: (Math.random() * 7) | 0, ph: Math.random() * 6.28,
          amp: 5 + Math.random() * 16, a: 0.16 + Math.random() * 0.3
        });
      }
      this.bubbles = [];
      const bn = Math.max(24, Math.min(80, Math.round(w * h / 22000)));
      for (let i = 0; i < bn; i++) this.bubbles.push(this.newBubble(Math.random() * h));
      this.weeds = [];
      const wn = Math.max(4, Math.min(12, Math.round(w / 150)));
      for (let i = 0; i < wn; i++) {
        this.weeds.push({
          x: (i + 0.25 + Math.random() * 0.5) * (w / wn),
          hh: 70 + Math.random() * 190,
          sway: 9 + Math.random() * 16,
          ph: Math.random() * 6.28,
          a: 0.10 + Math.random() * 0.16,
          lw: 3 + Math.random() * 5
        });
      }
    },
    newBubble(y) {
      return {
        x: Math.random() * this.w, y: y || this.h + 20,
        r: 1.5 + Math.random() * 6.5,
        spd: 12 + Math.random() * 40,
        a: 0.10 + Math.random() * 0.28,
        ph: Math.random() * 6.28,
        amp: 4 + Math.random() * 14
      };
    },
    draw(t, dt) {
      const g = seaCtx, w = this.w, h = this.h;
      g.clearRect(0, 0, w, h);

      const bg = g.createLinearGradient(0, 0, 0, h);
      bg.addColorStop(0, '#0e6da5');
      bg.addColorStop(0.32, '#0a4a76');
      bg.addColorStop(0.68, '#062c4c');
      bg.addColorStop(1, '#03182c');
      g.fillStyle = bg;
      g.fillRect(0, 0, w, h);

      // 光柱
      g.save();
      g.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 4; i++) {
        const x = w * (0.1 + i * 0.27) + Math.sin(t * 0.22 + i * 1.7) * 34;
        const lg = g.createLinearGradient(0, 0, 0, h * 0.9);
        lg.addColorStop(0, 'rgba(175,240,255,.085)');
        lg.addColorStop(1, 'rgba(175,240,255,0)');
        g.fillStyle = lg;
        g.beginPath();
        g.moveTo(x - 26, -10);
        g.lineTo(x + 34, -10);
        g.lineTo(x + 150, h * 0.88);
        g.lineTo(x + 26, h * 0.88);
        g.closePath();
        g.fill();
      }
      g.restore();

      // 海底沙地
      const sand = g.createLinearGradient(0, h - 110, 0, h);
      sand.addColorStop(0, 'rgba(30,130,155,0)');
      sand.addColorStop(1, 'rgba(52,168,180,.30)');
      g.fillStyle = sand;
      g.fillRect(0, h - 110, w, 110);

      // 海草
      g.save();
      g.lineCap = 'round';
      for (let i = 0; i < this.weeds.length; i++) {
        const wd = this.weeds[i];
        const sway = Math.sin(t * 0.85 + wd.ph) * wd.sway;
        for (let k = 0; k < 3; k++) {
          const hh = wd.hh * (1 - k * 0.22);
          const off = (k - 1) * 13;
          g.beginPath();
          g.moveTo(wd.x + off, h);
          g.quadraticCurveTo(wd.x + off + sway * 0.45, h - hh * 0.55, wd.x + off + sway, h - hh);
          g.strokeStyle = 'rgba(64,' + (185 - k * 22) + ',' + (150 + k * 20) + ',' + wd.a + ')';
          g.lineWidth = wd.lw * (1 - k * 0.25);
          g.stroke();
        }
      }
      g.restore();

      // 鱼群
      if (this.ready) {
        for (let i = 0; i < this.fish.length; i++) {
          const f = this.fish[i];
          f.x += f.dir * f.spd * dt;
          const s = f.s * 1.5;
          if (f.dir > 0 && f.x - s > w) f.x = -s;
          if (f.dir < 0 && f.x + s < 0) f.x = w + s;
          const y = f.y + Math.sin(t * 0.7 + f.ph) * f.amp;
          g.save();
          g.globalAlpha = f.a;
          g.translate(f.x, y);
          if (f.dir < 0) g.scale(-1, 1);
          g.drawImage(this.img, f.f * 256, 0, 256, 256, -s / 2, -s / 2, s, s);
          g.restore();
        }
      }

      // 气泡
      for (let i = 0; i < this.bubbles.length; i++) {
        const b = this.bubbles[i];
        b.y -= b.spd * dt;
        b.x += Math.sin(t * 1.3 + b.ph) * 0.35;
        if (b.y < -12) { const nb = this.newBubble(); b.x = nb.x; b.y = h + 12; b.r = nb.r; b.spd = nb.spd; b.a = nb.a; }
        g.save();
        g.globalAlpha = b.a;
        g.beginPath();
        g.arc(b.x, b.y, b.r, 0, Math.PI * 2);
        g.strokeStyle = 'rgba(215,250,255,.9)';
        g.lineWidth = 1;
        g.stroke();
        g.beginPath();
        g.arc(b.x - b.r * 0.32, b.y - b.r * 0.34, Math.max(0.6, b.r * 0.3), 0, Math.PI * 2);
        g.fillStyle = 'rgba(255,255,255,.85)';
        g.fill();
        g.restore();
      }

      // 暗角
      const vg = g.createRadialGradient(w * 0.5, h * 0.42, Math.min(w, h) * 0.25, w * 0.5, h * 0.5, Math.max(w, h) * 0.78);
      vg.addColorStop(0, 'rgba(0,0,0,0)');
      vg.addColorStop(1, 'rgba(0,8,18,.55)');
      g.fillStyle = vg;
      g.fillRect(0, 0, w, h);
    }
  };

  /* ---------------- 布局 ---------------- */
  function layout() {
    Sea.init();
    const rect = stageEl.getBoundingClientRect();
    const topbar = document.querySelector('.topbar');
    const tools = document.querySelector('.tools');
    const tbH = topbar ? topbar.getBoundingClientRect().height : 58;
    const tlH = tools ? tools.getBoundingClientRect().height : 40;
    const vw = window.innerWidth || 360;
    const vh = window.innerHeight || 640;
    // 舞台实测尺寸和视口推算尺寸取较小值，避免首帧测量偏差导致画布溢出
    const availW = Math.max(180, Math.min(rect.width || vw, vw - 16));
    const availH = Math.max(240, Math.min(rect.height || vh, vh - tbH - tlH - 30));
    const s = Math.max(0.42, Math.min(availW / W, availH / H));
    const cssW = W * s, cssH = H * s;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    SCALE = s * dpr;
    tankCv.style.width = cssW + 'px';
    tankCv.style.height = cssH + 'px';
    tankCv.style.borderRadius = (22 * s) + 'px';
    tankCv.width = Math.round(cssW * dpr);
    tankCv.height = Math.round(cssH * dpr);
    drawNext();
  }

  /* ---------------- 主循环 ---------------- */
  function frame(ts) {
    if (!last) last = ts;
    let dt = (ts - last) / 1000;
    last = ts;
    if (!(dt > 0)) dt = 0.016;
    dt = Math.min(dt, 0.05);
    time += dt;

    update(dt);

    if (shake > 0) {
      const k = shake * 7;
      shakeO.x = (Math.random() - 0.5) * k;
      shakeO.y = (Math.random() - 0.5) * k;
    } else { shakeO.x = shakeO.y = 0; }

    Sea.draw(time, dt);
    drawTank();
    requestAnimationFrame(frame);
  }

  /* ---------------- 交互 ---------------- */
  function pointerWorldX(ev) {
    const rect = tankCv.getBoundingClientRect();
    if (!rect.width) return W / 2;
    return (ev.clientX - rect.left) / (rect.width / W);
  }

  function moveTo(x) {
    const r = pending ? pending.r : radiusOf(2);
    dropX = Math.max(WALL_L + r, Math.min(WALL_R - r, x));
    if (pending) pending.x = dropX;
  }

  let dragging = false;

  stageEl.addEventListener('pointerdown', function (ev) {
    Sound.unlock();
    if (state !== 'play') return;
    if (ev.target.closest && ev.target.closest('.overlay')) return;
    dragging = true;
    try { stageEl.setPointerCapture(ev.pointerId); } catch (e) {}
    moveTo(pointerWorldX(ev));
    ev.preventDefault();
  });

  stageEl.addEventListener('pointermove', function (ev) {
    if (!dragging || state !== 'play') return;
    moveTo(pointerWorldX(ev));
  });

  stageEl.addEventListener('pointerup', function (ev) {
    if (!dragging) return;
    dragging = false;
    if (state !== 'play') return;
    drop();
  });

  stageEl.addEventListener('pointercancel', function () { dragging = false; });
  stageEl.addEventListener('contextmenu', e => e.preventDefault());

  document.addEventListener('keydown', function (ev) {
    if (ev.key === 'ArrowLeft' || ev.key === 'a' || ev.key === 'A') {
      Sound.unlock(); moveTo(dropX - (pending ? pending.r * 1.15 : 26)); ev.preventDefault();
    } else if (ev.key === 'ArrowRight' || ev.key === 'd' || ev.key === 'D') {
      Sound.unlock(); moveTo(dropX + (pending ? pending.r * 1.15 : 26)); ev.preventDefault();
    } else if (ev.key === ' ' || ev.key === 'ArrowDown' || ev.key === 'Enter') {
      Sound.unlock(); drop(); ev.preventDefault();
    } else if (ev.key === 'r' || ev.key === 'R') {
      reset();
    }
  });

  $('btnRestart').addEventListener('click', function () { Sound.unlock(); reset(); });
  $('btnAgain').addEventListener('click', function () { Sound.unlock(); reset(); });
  $('btnSound').addEventListener('click', function () { Sound.unlock(); Sound.setOn(!Sound.on); });
  $('btnHelp').addEventListener('click', function () { Sound.unlock(); helpEl.hidden = false; });
  $('btnCloseHelp').addEventListener('click', function () { helpEl.hidden = true; });
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) Sound.pauseBgm(); else { last = 0; Sound.playBgm(); }
  });

  let rt = 0;
  function relayout() {
    clearTimeout(rt);
    rt = setTimeout(layout, 120);
  }
  window.addEventListener('resize', relayout);
  window.addEventListener('orientationchange', function () { setTimeout(layout, 260); });
  window.addEventListener('load', function () { layout(); setTimeout(layout, 260); });
  if (window.ResizeObserver) new ResizeObserver(relayout).observe(stageEl);

  /* ---------------- 启动 ---------------- */
  Sound.init();
  Sound.setOn(Sound.on);
  try { best = parseInt(localStorage.getItem('haidi2048.best') || '0', 10) || 0; } catch (e) { best = 0; }
  bestEl.textContent = best;

  const fishImg = new Image();
  fishImg.onload = function () { Sea.img = fishImg; Sea.ready = true; };
  fishImg.src = 'assets/fish.png';

  layout();
  reset();
  requestAnimationFrame(frame);

  /* 调试用：无头浏览器/控制台可以手动推帧 */
  window.HaiDi2048 = {
    get state() { return state; },
    get score() { return score; },
    get balls() { return balls; },
    get pending() { return pending; },
    drop, reset,
    moveTo,
    tick(n, dt) { for (let i = 0; i < (n || 1); i++) update(dt || STEP); },
    render() { drawTank(); Sea.draw(time, 0); },
    add(x, y, v) { const b = new Ball(x, y, v, false); balls.push(b); return b; }
  };
})();
