/* =========================================================
 *  跳一跳
 *  逻辑取自 xyx/跳一跳资源源码（Cocos Creator）：
 *  蓄力跳、落在箱子中间得双倍分、连中翻倍、
 *  27 种箱子 / 角色 / 音效 全部沿用原工程素材。
 * ========================================================= */
(function () {
  'use strict';

  /* ---------------- 图集切片（原 plist 里的原始坐标） ---------------- */
  /* 原 plist 的切片跟图集不是同一版打包，边缘混进了邻居的碎片，
     这里用「内容总量最大的一段」重新算过，b21 是残缺素材已剔除 */
  const BOX_FRAMES = {
    b1: [2, 462, 302, 265],    b2: [2, 734, 302, 265],    b3: [757, 3, 301, 264],
    b4: [1062, 3, 302, 265],   b5: [1366, 3, 302, 265],   b6: [309, 461, 265, 269],
    b7: [306, 768, 300, 262],  b8: [581, 460, 264, 270],  b9: [611, 770, 300, 262],
    b10: [1426, 275, 248, 254], b11: [1682, 268, 266, 247], b12: [917, 711, 249, 254],
    b13: [1681, 525, 265, 248], b14: [1175, 686, 241, 248], b15: [1727, 781, 232, 236],
    b16: [405, 211, 232, 232],  b17: [1425, 546, 249, 254], b18: [918, 981, 210, 211],
    b19: [1175, 959, 211, 211], b20: [3, 1006, 183, 201],   b22: [641, 274, 181, 181],
    b23: [1399, 990, 181, 181], b24: [1715, 1024, 148, 161], b25: [1144, 276, 274, 252],
    b26: [1673, 5, 284, 252],   b27: [852, 277, 284, 253]
  };
  const BOX_KEYS = Object.keys(BOX_FRAMES);
  const ROLE = [909, 838, 50, 140];      // ui.png 里的角色立绘
  const FX_RING = [714, 879, 123, 75];   // 完美落地光圈
  const FX_BALL = [279, 944, 12, 10];    // 小粒子

  /* ---------------- 游戏参数（照着源码调） ---------------- */
  const SPACING_MIN = 300, SPACING_MAX = 450;   // LogicCtl: random*150+300
  const JUMP_SPEED = 480;                       // HeroCtl: touch_time * 8（60fps）
  const MAX_CHARGE = 1.5;
  const JUMP_TIME = 0.4, JUMP_H = 150;          // jump_to: 200 高度 / 0.4 秒
  const SQUASH_Y = 0.17, SQUASH_X = 0.10, SQUASH_MIN = 0.8, SQUASH_MAX = 1.2;
  const FOOT_R = 18;
  const PERFECT_U = 0.26;
  const VIEW_W = 660, VIEW_H = 900;

  const $ = id => document.getElementById(id);
  const stageEl = $('stage'), cv = $('game');
  const ctx = cv.getContext('2d');
  const bestEl = $('best'), overEl = $('over');

  /* ---------------- 素材 ---------------- */
  const IMG = {};
  let imgReady = 0, imgTotal = 0;
  ['boxs', 'ui'].forEach(function (k) {
    imgTotal++;
    const im = new Image();
    im.onload = im.onerror = function () { imgReady++; };
    im.src = 'assets/' + k + '.png';
    IMG[k] = im;
  });

  /* ---------------- 音效 ---------------- */
  const Sound = {
    ac: null, buf: {}, on: true, started: false, loopNode: null,
    init() {
      try { this.on = localStorage.getItem('tiaoyitiao.sound') !== '0'; } catch (e) {}
      this.syncBtn();
    },
    unlock() {
      if (this.started) { if (this.ac && this.ac.state === 'suspended') this.ac.resume(); return; }
      this.started = true;
      try {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        this.ac = new AC();
        ['jump_start', 'jump_loop', 'fail', 'score_1', 'score_more', 'pop'].forEach(n => {
          fetch('assets/' + n + '.mp3').then(r => r.arrayBuffer()).then(b => {
            return new Promise(res => this.ac.decodeAudioData(b, res, res));
          }).then(d => { if (d) this.buf[n] = d; }).catch(() => {});
        });
      } catch (e) {}
    },
    play(name, gain) {
      if (!this.on || !this.ac || !this.buf[name]) return;
      const s = this.ac.createBufferSource();
      s.buffer = this.buf[name];
      const g = this.ac.createGain();
      g.gain.value = gain == null ? 0.5 : gain;
      s.connect(g); g.connect(this.ac.destination);
      s.start();
    },
    loopStart(name, gain) {
      if (!this.on || !this.ac || !this.buf[name]) return;
      this.loopStop();
      const s = this.ac.createBufferSource();
      s.buffer = this.buf[name];
      s.loop = true;
      const g = this.ac.createGain();
      g.gain.value = gain == null ? 0.32 : gain;
      s.connect(g); g.connect(this.ac.destination);
      s.start();
      this.loopNode = s;
    },
    loopStop() {
      if (this.loopNode) { try { this.loopNode.stop(); } catch (e) {} this.loopNode = null; }
    },
    setOn(v) {
      this.on = v;
      try { localStorage.setItem('tiaoyitiao.sound', v ? '1' : '0'); } catch (e) {}
      if (!v) this.loopStop();
      this.syncBtn();
    },
    syncBtn() {
      const b = $('btnSound');
      b.textContent = this.on ? '🔊' : '🔇';
      b.style.opacity = this.on ? '1' : '.5';
    }
  };

  /* ---------------- 状态 ---------------- */
  const DIR0 = { x: 0.88, y: 0.47 };   // LogicCtl: 开局两个箱子的方向
  const G = {
    state: 'demo',      // demo | idle | charge | jump | fall | over
    boxes: [],
    hero: null,
    cam: { x: 0, y: 0, sx: 0, sy: 0, tx: 0, ty: 0, t: 1 },
    dir: { x: DIR0.x, y: DIR0.y },
    charge: 0,
    score: 0,
    step: 0,            // 连击倍率
    best: 0,
    jump: null,
    fx: [],
    popups: [],
    demoT: 0,
    t: 0,
    lastLanded: false
  };

  const view = { s: 1, vw: 0, vh: 0, dpr: 1 };

  /* ---------------- 工具 ---------------- */
  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const easeOut = t => 1 - (1 - t) * (1 - t);
  const easeIn = t => t * t;
  const easeInOut = t => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

  function boxDisplayW(frame) { return clamp(frame[2] * 0.52, 122, 160); }

  function makeBox(x, y) {
    const key = BOX_KEYS[(Math.random() * BOX_KEYS.length) | 0];
    const f = BOX_FRAMES[key];
    const dw = boxDisplayW(f);
    const bob = 0.2 + Math.random() * 0.25;      // 每个箱子略微错开出现时间
    return {
      x: x, y: y, f: f, dw: dw, dh: dw * f[3] / f[2],
      a: dw / 2, b: dw / 4,                       // 顶面菱形半径
      squash: 0, appear: -bob
    };
  }

  function faceU(box, px, py) {
    return Math.abs(px - box.x) / box.a + Math.abs(py - box.y) / box.b;
  }

  function refPoint() {
    const n = G.boxes.length;
    const a = G.boxes[n - 2], b = G.boxes[n - 1];
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  }

  function camTarget() {
    const r = refPoint();
    return { x: r.x, y: r.y };
  }

  function snapCam() {
    const t = camTarget();
    G.cam.x = t.x; G.cam.y = t.y; G.cam.sx = t.x; G.cam.sy = t.y; G.cam.t = 1;
  }

  function moveCam() {
    const t = camTarget();
    G.cam.sx = G.cam.x; G.cam.sy = G.cam.y;
    G.cam.tx = t.x; G.cam.ty = t.y; G.cam.t = 0;
  }

  /* ---------------- 开局 / 重开 ---------------- */
  function buildStart() {
    G.boxes = [];
    G.fx = []; G.popups = [];
    G.dir = { x: DIR0.x, y: DIR0.y };
    G.charge = 0;
    const b1 = makeBox(-133, -207);
    const b2 = makeBox(169, -44);
    b1.appear = 1; b2.appear = 1;
    G.boxes.push(b1, b2);
    G.hero = {
      x: b1.x, y: b1.y, sx: 1, sy: 1, rot: 0, spin: 0,
      y0: b1.y, x0: b1.x, fy: 0, settle: 0
    };
    snapCam();
  }

  function reset(demo) {
    buildStart();
    G.score = 0;
    G.step = 0;
    G.demoT = demo ? 0.6 : 0;
    G.jump = null;
    G.state = demo ? 'demo' : 'idle';
    overEl.hidden = true;
    $('hintline').textContent = '按住屏幕蓄力 · 松手起跳';
  }

  function nextBox() {
    const last = G.boxes[G.boxes.length - 1];
    const d = G.dir;
    let nx = d.x;
    if (Math.random() < 0.5) nx = -nx;              // 源码：方向 x 随机翻面
    const dist = SPACING_MIN + Math.random() * (SPACING_MAX - SPACING_MIN);
    const nb = makeBox(last.x + nx * dist, last.y + d.y * dist);
    G.boxes.push(nb);
    return nb;
  }

  /* ---------------- 跳跃 ---------------- */
  function chargeStart() {
    if (G.state !== 'idle') return;
    Sound.unlock();
    G.state = 'charge';
    G.charge = 0;
    Sound.play('jump_start', 0.45);
  }

  function chargeEnd() {
    if (G.state !== 'charge') return;
    Sound.loopStop();
    const tgt = G.boxes[G.boxes.length - 1];
    const d = { x: tgt.x - G.hero.x, y: tgt.y - G.hero.y };
    const len = Math.hypot(d.x, d.y) || 1;
    const dist = Math.min(G.charge * JUMP_SPEED, MAX_CHARGE * JUMP_SPEED);
    startJump(G.hero.x + d.x / len * dist, G.hero.y + d.y / len * dist, d.x >= 0 ? 1 : -1);
  }

  function startJump(tx, ty, sign) {
    const h = G.hero;
    h.sx = 1; h.sy = 1;
    // 起跳瞬间先把箱子压扁恢复（源码里由 BoxCtl.touch_end 做）
    const cur = G.boxes[G.boxes.length - 2];
    if (cur) cur.bounce = 0.001;
    G.jump = {
      x0: h.x, y0: h.y, x1: tx, y1: ty,
      t: 0, dur: JUMP_TIME, sign: sign, demo: G.state === 'demo'
    };
    G.state = 'jump';
    Sound.loopStop();
  }

  function heroJumpUpdate(dt) {
    const j = G.jump, h = G.hero;
    j.t += dt;
    let p = Math.min(1, j.t / j.dur);
    const lift = p < 0.5 ? easeOut(p * 2) : 1 - easeIn((p - 0.5) * 2);
    h.x = lerp(j.x0, j.x1, p);
    h.y = lerp(j.y0, j.y1, p) + lift * JUMP_H;
    h.rot = j.sign * 360 * p;
    if (p >= 1) {
      h.rot = 0;
      resolveLanding();
    }
  }

  function resolveLanding() {
    const h = G.hero;
    const tgt = G.boxes[G.boxes.length - 1];
    const prev = G.boxes[G.boxes.length - 2];
    const u = faceU(tgt, h.x, h.y);
    const demo = G.jump.demo;

    if (u <= 1) {
      const perfect = u <= PERFECT_U;
      const gained = perfect ? 2 : 1;
      h.settle = 1;
      splash(h.x, h.y, perfect ? 34 : 22);
      if (!demo) {
        addScore(gained, perfect);
        Sound.play(perfect ? 'score_more' : 'score_1', 0.5);
      } else {
        Sound.play('pop', 0.25);
      }
      if (perfect) {
        G.fx.push({ k: 'ring', x: h.x, y: h.y + 6, t: 0, life: 0.5 });
      }
      G.popups.push({ x: h.x, y: h.y + 60, t: 0, life: 0.8, txt: (demo ? '' : '+') + (demo ? 2 : gained) });
      nextBox();
      moveCam();
      G.state = demo ? 'demo' : 'idle';
      G.demoT = 0.85;
      return;
    }
    if (u <= 1 + FOOT_R / tgt.a) {         // 踩到边 → 滑倒
      fail('slip', tgt);
      return;
    }
    if (faceU(prev, h.x, h.y) <= 1) {      // 跳太短，落回原箱子，不算分
      h.settle = 1;
      splash(h.x, h.y, 10);
      G.state = demo ? 'demo' : 'idle';
      G.demoT = 0.6;
      return;
    }
    fail('miss', tgt);
  }

  function addScore(gained, perfect) {
    if (gained <= 0) { G.step = 0; return; }
    if (gained === 1) { G.step = 1; G.score += 1; }
    else {
      G.step = (G.step || 1) * 2;
      G.score += G.step;
    }
    bestEl.textContent = Math.max(G.best, G.score);
    if (G.score > G.best) {
      G.best = G.score;
      bestEl.textContent = G.best;
      try { localStorage.setItem('tiaoyitiao.best', String(G.best)); } catch (e) {}
    }
    G.lastLanded = perfect;
  }

  function fail(kind, box) {
    const h = G.hero;
    Sound.loopStop();
    Sound.play('fail', 0.5);
    G.state = 'fall';
    G.fall = {
      t: 0, kind: kind,
      vy: kind === 'slip' ? -30 : 0,
      rot: 0,
      dir: (box && h.x > box.x) ? 1 : -1
    };
    G.overKind = kind;
  }

  function showOver() {
    G.state = 'over';
    $('finalScore').textContent = G.score;
    $('finalBest').textContent = G.best;
    $('overTitle').textContent = G.overKind === 'slip' ? '滑倒了' : '没跳上去';
    $('overTip').textContent = G.overKind === 'slip'
      ? '脚尖踩在边上了，落点尽量往中间靠'
      : '按住蓄力越久跳得越远，松手起跳';
    overEl.hidden = false;
  }

  /* ---------------- 特效 ---------------- */
  function splash(x, y, n) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 60 + Math.random() * 200;
      const r = Math.random();
      G.fx.push({
        k: 'ball', x: x, y: y,
        vx: Math.cos(a) * sp, vy: Math.abs(Math.sin(a)) * sp * 0.9 + 40,
        r: 3 + Math.random() * 4, t: 0, life: 0.45 + Math.random() * 0.35,
        c: r < 0.5 ? '#ffffff' : (r < 0.8 ? '#7fe0d0' : '#ffd479')
      });
    }
  }

  function chargeFx(dt) {
    const h = G.hero;
    if (G.fx.filter(f => f.k === 'ball' && f.in).length > 26) return;
    if (Math.random() < 0.75) {
      const a = Math.random() * Math.PI * 2;
      const d = 120 + Math.random() * 160;
      G.fx.push({
        k: 'ball', in: true,
        x: h.x + Math.cos(a) * d, y: h.y + 40 + Math.sin(a) * d * 0.6,
        tx: h.x, ty: h.y + 40, t: 0, life: 0.35 + Math.random() * 0.3,
        r: 2.5 + Math.random() * 3.5,
        c: Math.random() < 0.5 ? '#ffffff' : '#8ef0dd'
      });
    }
  }

  /* ---------------- 更新 ---------------- */
  function update(dt) {
    G.t += dt;
    const h = G.hero;

    // 箱子出场动画
    for (let i = 0; i < G.boxes.length; i++) {
      const b = G.boxes[i];
      if (b.appear < 1) b.appear = Math.min(1, b.appear + dt / 0.45);
      if (b.bounce != null && b.bounce < 1) b.bounce = Math.min(1, b.bounce + dt / 0.28);
      if (b.squash > 0 && G.state !== 'charge') {
        b.squash = Math.max(0, b.squash - dt / 0.22);
      }
    }

    // 镜头
    if (G.cam.t < 1) {
      G.cam.t = Math.min(1, G.cam.t + dt / 0.5);
      const e = easeInOut(G.cam.t);
      G.cam.x = lerp(G.cam.sx, G.cam.tx, e);
      G.cam.y = lerp(G.cam.sy, G.cam.ty, e);
    }

    if (G.state === 'demo') {
      G.demoT -= dt;
      if (G.demoT <= 0 && G.boxes.length > 1) {
        // 演示模式：直接算出正好落在中心的力度
        const tgt = G.boxes[G.boxes.length - 1];
        const dx = tgt.x - h.x, dy = tgt.y - h.y;
        const len = Math.hypot(dx, dy) || 1;
        G.charge = Math.min(MAX_CHARGE, len / JUMP_SPEED);
        startJump(tgt.x, tgt.y, dx >= 0 ? 1 : -1);
        G.jump.demo = true;
      }
    } else if (G.state === 'charge') {
      G.charge = Math.min(MAX_CHARGE, G.charge + dt);
      const h2 = G.hero;
      h2.sy = Math.max(SQUASH_MIN, h2.sy - SQUASH_Y * dt);
      h2.sx = Math.min(SQUASH_MAX, h2.sx + SQUASH_X * dt);
      const cur = G.boxes[G.boxes.length - 2];
      if (cur) cur.squash = Math.max(SQUASH_MIN, (cur.squash || 1) - dt / 6);
      chargeFx(dt);
      if (G.charge > 0.7 && Math.random() < 0.06) Sound.loopStart('jump_loop', 0.25);
    } else if (G.state === 'jump') {
      heroJumpUpdate(dt);
    } else if (G.state === 'fall') {
      const f = G.fall;
      f.t += dt;
      f.vy += 1600 * dt;
      h.y -= f.vy * dt;
      h.rot += f.dir * 220 * dt;
      if (f.t > 1.1) showOver();
    }

    // 落地回弹
    if (h.settle > 0) {
      h.settle = Math.max(0, h.settle - dt / 0.16);
      const k = Math.sin((1 - h.settle) * Math.PI) * 0.12;
      h.sx = 1 + k; h.sy = 1 - k;
    }

    // 特效
    for (let i = 0; i < G.fx.length; i++) {
      const f = G.fx[i];
      f.t += dt;
      if (f.t >= f.life) { f.dead = true; continue; }
      if (f.k === 'ball') {
        if (f.in) {
          const p = f.t / f.life;
          f.x = lerp(f.x, f.tx, Math.min(0.5, dt * 5));
          f.y = lerp(f.y, f.ty, Math.min(0.5, dt * 5));
        } else {
          f.vy -= 900 * dt;
          f.x += f.vx * dt;
          f.y += f.vy * dt;
        }
      }
    }
    if (G.fx.some(f => f.dead)) G.fx = G.fx.filter(f => !f.dead);

    for (let i = 0; i < G.popups.length; i++) G.popups[i].t += dt;
    if (G.popups.some(p => p.t >= p.life)) G.popups = G.popups.filter(p => p.t < p.life);
  }

  /* ---------------- 绘制 ---------------- */
  function w2s(x, y) {
    return {
      x: (x - G.cam.x) * view.s + view.vw / 2,
      y: (G.cam.y - y) * view.s + view.vh * 0.62
    };
  }

  function drawBox(b) {
    const p = w2s(b.x, b.y);
    const dw = b.dw * view.s, dh = b.dh * view.s;
    let squash = 1;
    if (b.squash > 0 && b.squash < 1) squash = b.squash;
    else if (b.bounce != null && b.bounce > 0 && b.bounce < 1) {
      // 松手后的弹性：先拉长再回弹
      const k = Math.sin(b.bounce * Math.PI);
      squash = 1 + k * 0.12;
    }
    let dy = 0;
    if (b.appear < 1) {
      const t = b.appear;
      dy = -(1 - t) * 100 * view.s;
      const bounce = Math.sin(t * Math.PI * 2) * (1 - t) * 22 * view.s;
      dy += bounce;
    }
    const topY = p.y - dw / 4 + dy;

    // 影子
    ctx.save();
    ctx.globalAlpha = 0.18 * (b.appear > 0.9 ? 1 : 0.5);
    ctx.fillStyle = '#5b5470';
    ctx.beginPath();
    ctx.ellipse(p.x, topY + dw * 0.16 + dh * 0.98, dw * 0.44, dw * 0.13, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.translate(p.x, topY + dh);
    ctx.scale(1, squash);
    ctx.drawImage(IMG.boxs, b.f[0], b.f[1], b.f[2], b.f[3], -dw / 2, -dh, dw, dh);
    ctx.restore();
  }

  function drawHero() {
    const h = G.hero;
    const p = w2s(h.x, h.y);
    const hw = 44 * view.s, hh = 123 * view.s;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(h.rot * Math.PI / 180);
    ctx.scale(h.sx, h.sy);
    ctx.drawImage(IMG.ui, ROLE[0], ROLE[1], ROLE[2], ROLE[3], -hw / 2, -hh, hw, hh);
    ctx.restore();
  }

  function drawFx() {
    for (let i = 0; i < G.fx.length; i++) {
      const f = G.fx[i];
      const a = 1 - f.t / f.life;
      if (f.k === 'ball') {
        const p = w2s(f.x, f.y);
        ctx.save();
        ctx.globalAlpha = Math.max(0, a) * 0.95;
        ctx.fillStyle = f.c;
        ctx.beginPath();
        ctx.arc(p.x, p.y, f.r * view.s, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      } else if (f.k === 'ring') {
        const p = w2s(f.x, f.y);
        const k = f.t / f.life;
        const w = 123 * view.s * (0.5 + k * 1.8);
        const hgt = 75 * view.s * (0.5 + k * 1.8);
        ctx.save();
        ctx.globalAlpha = Math.max(0, 1 - k) * 0.85;
        ctx.drawImage(IMG.ui, FX_RING[0], FX_RING[1], FX_RING[2], FX_RING[3], p.x - w / 2, p.y - hgt / 2, w, hgt);
        ctx.restore();
      }
    }
  }

  function drawPopups() {
    for (let i = 0; i < G.popups.length; i++) {
      const s = G.popups[i];
      const k = s.t / s.life;
      const p = w2s(s.x, s.y + k * 90);
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - k * k);
      ctx.font = '800 ' + (20 * view.s) + 'px ' + FONT;
      ctx.textAlign = 'center';
      ctx.lineWidth = 4 * view.s;
      ctx.strokeStyle = 'rgba(255,255,255,.9)';
      ctx.strokeText(s.txt, p.x, p.y);
      ctx.fillStyle = '#1fb9a1';
      ctx.fillText(s.txt, p.x, p.y);
      ctx.restore();
    }
  }

  const FONT = '"PingFang SC","Microsoft YaHei",system-ui,sans-serif';

  function render() {
    const g = ctx, vw = view.vw, vh = view.vh, dpr = view.dpr;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);

    // 背景：原版的淡紫渐变
    const bg = g.createLinearGradient(0, 0, 0, vh);
    bg.addColorStop(0, '#f7ecf8');
    bg.addColorStop(0.45, '#f4e7f6');
    bg.addColorStop(1, '#efe0f3');
    g.fillStyle = bg;
    g.fillRect(0, 0, vw, vh);

    const glow = g.createRadialGradient(vw * 0.5, vh * 0.28, 10, vw * 0.5, vh * 0.28, Math.max(vw, vh) * 0.6);
    glow.addColorStop(0, 'rgba(255,255,255,.75)');
    glow.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = glow;
    g.fillRect(0, 0, vw, vh);

    // 箱子
    for (let i = 0; i < G.boxes.length; i++) drawBox(G.boxes[i]);

    drawFx();
    if (G.state !== 'over' || !overEl.hidden) drawHero();
    drawPopups();

    // 分数
    g.save();
    g.font = '800 ' + Math.round(Math.min(84, vh * 0.115)) + 'px ' + FONT;
    g.textAlign = 'left';
    g.textBaseline = 'top';
    g.fillStyle = 'rgba(255,255,255,.75)';
    g.fillText(String(G.score), 22, 14 + 3);
    g.fillStyle = 'rgba(120,110,140,.55)';
    g.fillText(String(G.score), 22, 14);
    g.restore();

    // 连击提示
    if (G.step >= 2 && (G.state === 'idle' || G.state === 'charge')) {
      g.save();
      g.font = '700 ' + Math.round(Math.min(22, vh * 0.03)) + 'px ' + FONT;
      g.textAlign = 'left';
      g.fillStyle = 'rgba(31,185,161,.85)';
      g.fillText('连击 x' + G.step, 24, 22 + Math.round(Math.min(84, vh * 0.115)));
      g.restore();
    }

    // 蓄力条（原版没有，纯提示，不改变判定）
    if (G.state === 'charge') {
      const w = Math.min(220, vw * 0.44), x = (vw - w) / 2, y = vh - 46;
      g.save();
      g.fillStyle = 'rgba(90,80,110,.14)';
      g.beginPath();
      g.roundRect ? g.roundRect(x, y, w, 8, 4) : g.rect(x, y, w, 8);
      g.fill();
      g.fillStyle = 'rgba(31,185,161,.85)';
      const k = G.charge / MAX_CHARGE;
      g.beginPath();
      g.roundRect ? g.roundRect(x, y, Math.max(6, w * k), 8, 4) : g.rect(x, y, Math.max(6, w * k), 8);
      g.fill();
      g.restore();
    }

    // 开场提示
    if (G.state === 'demo') {
      g.save();
      g.textAlign = 'center';
      g.font = '700 ' + Math.round(Math.min(20, vh * 0.028)) + 'px ' + FONT;
      g.fillStyle = 'rgba(110,100,130,.7)';
      g.fillText('演示中 · 按住屏幕开始游戏', vw / 2, vh * 0.16);
      g.restore();
    }
  }

  /* ---------------- 布局 ---------------- */
  function layout() {
    const rect = stageEl.getBoundingClientRect();
    const vw = Math.max(200, rect.width || window.innerWidth);
    const vh = Math.max(240, rect.height || window.innerHeight);
    const dpr = Math.min(2.5, window.devicePixelRatio || 1);
    view.vw = vw; view.vh = vh; view.dpr = dpr;
    view.s = Math.max(0.3, Math.min(vw / VIEW_W, vh / VIEW_H));
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
  stageEl.addEventListener('pointerdown', function (ev) {
    if (ev.target.closest && ev.target.closest('.overlay')) return;
    ev.preventDefault();
    Sound.unlock();
    if (G.state === 'demo') { reset(false); return; }
    chargeStart();
  });
  stageEl.addEventListener('pointerup', function () { chargeEnd(); });
  window.addEventListener('pointerup', function () { chargeEnd(); });   // 手指拖到画布外松开也要能起跳
  stageEl.addEventListener('pointercancel', function () { Sound.loopStop(); if (G.state === 'charge') G.state = 'idle'; });
  stageEl.addEventListener('contextmenu', e => e.preventDefault());

  document.addEventListener('keydown', function (ev) {
    if (ev.repeat) return;
    if (ev.key === ' ' || ev.key === 'ArrowUp') {
      ev.preventDefault();
      Sound.unlock();
      if (G.state === 'demo') reset(false); else chargeStart();
    } else if (ev.key === 'r' || ev.key === 'R') {
      reset(false);
    }
  });
  document.addEventListener('keyup', function (ev) {
    if (ev.key === ' ' || ev.key === 'ArrowUp') chargeEnd();
  });

  $('btnSound').addEventListener('click', function () { Sound.unlock(); Sound.setOn(!Sound.on); });
  $('btnRestart').addEventListener('click', function () { Sound.unlock(); reset(false); });
  $('btnAgain').addEventListener('click', function () { Sound.unlock(); reset(false); });

  let rt = 0;
  function relayout() { clearTimeout(rt); rt = setTimeout(layout, 90); }
  window.addEventListener('resize', relayout);
  window.addEventListener('orientationchange', function () { setTimeout(layout, 240); });
  window.addEventListener('load', function () { layout(); setTimeout(layout, 200); });
  if (window.ResizeObserver) new ResizeObserver(relayout).observe(stageEl);
  document.addEventListener('visibilitychange', function () { last = 0; if (document.hidden) Sound.loopStop(); });

  /* ---------------- 启动 ---------------- */
  Sound.init();
  try { G.best = parseInt(localStorage.getItem('tiaoyitiao.best') || '0', 10) || 0; } catch (e) { G.best = 0; }
  bestEl.textContent = G.best;
  layout();
  reset(true);
  requestAnimationFrame(frame);

  /* 调试钩子 */
  window.TiaoYiTiao = {
    get state() { return G.state; },
    get score() { return G.score; },
    get step() { return G.step; },
    get boxes() { return G.boxes; },
    get hero() { return G.hero; },
    view,
    reset, chargeStart, chargeEnd,
    perfectJump() {
      const tgt = G.boxes[G.boxes.length - 1];
      startJump(tgt.x, tgt.y, tgt.x >= G.hero.x ? 1 : -1);
    },
    jumpTo(offset) {
      const tgt = G.boxes[G.boxes.length - 1];
      startJump(tgt.x + (offset || 0), tgt.y, 1);
    },
    tick(n, dt) { for (let i = 0; i < (n || 1); i++) update(dt || 1 / 120); },
    render
  };
})();
