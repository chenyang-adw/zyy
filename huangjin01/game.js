/* =========================================================
 *  黄金矿工
 *  参数与玩法取自 xyx/黄金矿工creator2.4.12：
 *  - 钩爪以 -75°~75° 摆动（源码 HookController：angle = 75 * cos(t*0.9 + π/2)）
 *  - 点一下放钩，钩头向斜下方伸出（源码 hookSpeed = 400），超出屏幕边界就回收
 *  - 抓到东西后按重量减速回收（源码 speedRatio = 100 / mass）
 *  - 7 种矿物的重量/价格/数量完全照 MiningObjectConfig
 *  - 炸药可以丢掉钩上的东西（源码 DynamiteButton → cancelHook + 爆炸）
 *  素材：原工程 mo_* 矿块、钩爪、爆炸序列帧、地表与土层背景
 * ========================================================= */
(function () {
  'use strict';

  /* ---------------- 原工程配置（MiningObjectConfig） ---------------- */
  const ORE = {
    BIG_GOLD:    { mass: 300, price: 200, w: 135, h: 90,  img: 'mo_big_gold',   min: 1, max: 2 },
    MED_GOLD:    { mass: 200, price: 100, w: 75,  h: 55,  img: 'mo_med_gold',   min: 3, max: 4 },
    SMALL_GOLD:  { mass: 100, price: 50,  w: 40,  h: 32,  img: 'mo_small_gold', min: 4, max: 5 },
    SMALL_STONE: { mass: 300, price: 10,  w: 48,  h: 38,  img: 'mo_med_stone',  min: 3, max: 5 },
    MED_STONE:   { mass: 500, price: 20,  w: 80,  h: 57,  img: 'mo_big_stone',  min: 3, max: 5 },
    DIAMOND:     { mass: 100, price: 500, w: 55,  h: 42,  img: 'mo_diamond',    min: 0, max: 1 },
    MONEY_PACK:  { mass: 100, price: 300, w: 50,  h: 67,  img: 'mo_money',      min: 1, max: 2 }
  };
  const GOALS = [100, 200, 300, 450, 600, 800, 1000];       // LevelConfig.GOAL 往上加
  const LEVEL_TIME = 45;                                     // 每关秒数

  const DW = 640;                     // 设计宽度
  const PIVOT = { x: 320, y: 132 };   // 钩爪转轴
  const HEAD_LEN = 54;                // 静止时绳长
  const ROT_RANGE = 75 * Math.PI / 180;
  const ROT_RATE = 0.9;               // 源码摆动频率
  const OUT_SPEED = 430;              // 伸出速度
  const HOOK_R = 34;                  // 钩头判定半径（跟爪子的显示大小对得上）
  const CLAW_W = 86;                  // 爪子显示宽度（比原图比例收细一点，太粗不好看）
  const ROPE_W = 10;                  // 绳子粗细
  /* 原图钩爪/绳子是纯黑的，这里统一着色：爪子钢灰、绳子麻绳色 */
  const CLAW_TINT = ['#b3bcc7', '#6f7a88'];
  const ROPE_TINT = ['#a89268', '#8a744f'];
  const ORE_SCALE = (640 / 1136) * 1.3;   // 矿块缩放：按原工程 1136 宽的设计等比换算

  const FONT = '"PingFang SC","Microsoft YaHei",system-ui,sans-serif';
  const $ = id => document.getElementById(id);
  const stageEl = $('stage'), cv = $('game');
  const ctx = cv.getContext('2d');
  const overEl = $('over');
  const view = { s: 1, vw: 0, vh: 0, dh: 1000, dpr: 1 };

  /* ---------------- 素材 ---------------- */
  const IMG = {};
  ['bg', 'hook_close', 'hook_open', 'hook_rope', 'clock', 'car'].forEach(function (k) {
    IMG[k] = new Image(); IMG[k].src = 'assets/' + k + '.png';
  });
  Object.keys(ORE).forEach(function (k) {
    IMG[ORE[k].img] = new Image(); IMG[ORE[k].img].src = 'assets/' + ORE[k].img + '.png';
  });
  const BOOM = [];
  for (let i = 1; i <= 8; i++) { const im = new Image(); im.src = 'assets/boom/' + i + '.png'; BOOM.push(im); }

  /* ---------------- 音效（原工程无音频，这里合成） ---------------- */
  const Sound = {
    ac: null, on: true, started: false,
    init() { try { this.on = localStorage.getItem('huangjin.sound') !== '0'; } catch (e) {} this.sync(); },
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
      o.type = type || 'square';
      o.frequency.setValueAtTime(f, t0);
      if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(50, slide), t0 + dur);
      gn.gain.setValueAtTime(0, t0);
      gn.gain.linearRampToValueAtTime(g == null ? 0.11 : g, t0 + 0.012);
      gn.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(gn); gn.connect(this.ac.destination);
      o.start(t0); o.stop(t0 + dur + 0.03);
    },
    shoot() { this.beep(520, 0.14, 'square', 0.09, 180); },
    pull() { this.beep(160, 0.5, 'sawtooth', 0.05, 240); },
    get(p) { this.beep(660, 0.1, 'triangle', 0.1); setTimeout(() => this.beep(880 + Math.min(600, p), 0.14, 'sine', 0.1), 80); },
    boom() { this.beep(90, 0.45, 'sawtooth', 0.16, 40); },
    win() { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => this.beep(f, 0.3, 'triangle', 0.12), i * 110)); },
    lose() { [392, 311, 233].forEach((f, i) => setTimeout(() => this.beep(f, 0.34, 'square', 0.11), i * 130)); },
    setOn(v) { this.on = v; try { localStorage.setItem('huangjin.sound', v ? '1' : '0'); } catch (e) {} this.sync(); },
    sync() { const b = $('btnSound'); b.textContent = this.on ? '🔊' : '🔇'; b.style.opacity = this.on ? '1' : '.5'; }
  };

  /* ---------------- 状态 ---------------- */
  const G = {
    state: 'play',          // play | over
    level: 1,
    money: 0,
    goal: GOALS[0],
    time: LEVEL_TIME,
    ores: [],
    hook: {
      state: 'swing',       // swing | out | back
      angle: 0, t: 0,
      len: HEAD_LEN,
      carrying: null
    },
    dyn: 2,
    fx: [], texts: [],
    shake: 0,
    t: 0,
    ended: false,
    lastKind: ''
  };

  /* ---------------- 关卡 ---------------- */
  function rndInt(a, b) { return a + Math.floor(Math.random() * (b - a + 1)); }

  function buildLevel() {
    G.ores = [];
    const top = 300, bottom = view.dh - 90;
    Object.keys(ORE).forEach(function (type) {
      const cfg = ORE[type];
      const n = rndInt(cfg.min, cfg.max);
      for (let i = 0; i < n; i++) {
        const w = cfg.w * ORE_SCALE;
        const h = cfg.h * ORE_SCALE;
        let placed = null;
        for (let att = 0; att < 60; att++) {
          const x = 26 + w / 2 + Math.random() * (DW - 52 - w);
          const y = top + h / 2 + Math.random() * Math.max(20, bottom - top - h);
          if (!overlaps(x, y, w, h)) { placed = { x: x, y: y }; break; }
        }
        if (!placed) continue;
        G.ores.push({
          type: type, x: placed.x, y: placed.y, w: w, h: h,
          mass: cfg.mass, price: cfg.price, img: cfg.img
        });
      }
    });
  }

  function overlaps(x, y, w, h) {
    for (let i = 0; i < G.ores.length; i++) {
      const o = G.ores[i];
      if (Math.abs(o.x - x) < (o.w + w) / 2 + 6 && Math.abs(o.y - y) < (o.h + h) / 2 + 6) return true;
    }
    return false;
  }

  function startLevel(n) {
    G.level = n;
    G.goal = GOALS[Math.min(GOALS.length - 1, n - 1)];
    G.time = LEVEL_TIME;
    G.state = 'play';
    G.ended = false;
    G.fx = []; G.texts = [];
    G.dyn = 2;
    resetHook();
    buildLevel();
    overEl.hidden = true;
    updateHud();
  }

  function restartAll() { G.money = 0; startLevel(1); }

  function resetHook() {
    G.hook.state = 'swing';
    G.hook.t = 0;
    G.hook.len = HEAD_LEN;
    G.hook.carrying = null;
  }

  function updateHud() {
    $('level').textContent = G.level;
    $('goal').textContent = G.goal;
    $('money').textContent = G.money;
    $('time').textContent = Math.max(0, Math.ceil(G.time));
    $('dynNum').textContent = G.dyn;
    $('btnDyn').classList.toggle('off', G.dyn <= 0);
  }

  /* ---------------- 钩爪 ---------------- */
  function headPos() {
    const h = G.hook;
    return {
      x: PIVOT.x + Math.sin(h.angle) * h.len,
      y: PIVOT.y + Math.cos(h.angle) * h.len
    };
  }

  function hookWeight() {
    return G.hook.carrying ? G.hook.carrying.mass : 0;
  }

  /* 源码 speedRatio = 100 / mass，但这里的航道更长，做成渐进减速更好玩 */
  function pullRatio(mass) {
    if (!mass) return 1;
    return Math.max(0.3, Math.min(1, 1.25 - mass / 700));
  }

  function dropHook() {
    if (G.state !== 'play' || G.hook.state !== 'swing') return;
    G.hook.state = 'out';
    Sound.shoot();
  }

  function useDynamite() {
    if (G.state !== 'play' || G.dyn <= 0) return;
    if (!G.hook.carrying) return;
    const o = G.hook.carrying;
    const p = headPos();
    boom(p.x, p.y);
    G.shake = 1;
    Sound.boom();
    G.hook.carrying = null;
    G.dyn--;
    G.hook.state = 'back';
    updateHud();
  }

  function collect() {
    const o = G.hook.carrying;
    if (o) {
      G.money += o.price;
      Sound.get(o.price);
      G.texts.push({ x: PIVOT.x, y: PIVOT.y + 40, txt: '+' + o.price, t: 0, life: 0.9 });
      G.hook.carrying = null;
      updateHud();
    }
    G.hook.state = 'swing';
    G.hook.len = HEAD_LEN;
    G.hook.t = 0;
    if (!G.ores.length) endLevel(true);
  }

  function boom(x, y) {
    G.fx.push({ x: x, y: y, t: 0, life: 0.55 });
    for (let i = 0; i < 16; i++) {
      const a = Math.random() * Math.PI * 2, sp = 60 + Math.random() * 220;
      G.fx.push({ x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, r: 2 + Math.random() * 4, t: 0, life: 0.4 + Math.random() * 0.4, part: true });
    }
  }

  function update(dt) {
    G.t += dt;
    const h = G.hook;

    if (G.state === 'play') {
      G.time -= dt;
      if (G.time <= 0) { G.time = 0; endLevel(false); }
      updateHud();

      if (h.state === 'swing') {
        /* 源码：angle = 75° * cos(t*0.9 + π/2) */
        h.angle = ROT_RANGE * Math.cos(h.t * ROT_RATE + Math.PI / 2);
        h.t += dt;
      } else if (h.state === 'out') {
        h.len += OUT_SPEED * dt;
        const p = headPos();
        if (p.x < -40 || p.x > DW + 40 || p.y > view.dh - 26) { h.state = 'back'; }
        else {
          for (let i = 0; i < G.ores.length; i++) {
            const o = G.ores[i];
            if (Math.abs(o.x - p.x) < o.w / 2 + HOOK_R && Math.abs(o.y - p.y) < o.h / 2 + HOOK_R) {
              h.carrying = o;
              h.state = 'back';
              G.ores.splice(i, 1);
              Sound.pull();
              break;
            }
          }
        }
      } else if (h.state === 'back') {
        h.len -= OUT_SPEED * pullRatio(hookWeight()) * dt;
        if (h.len <= HEAD_LEN) { h.len = HEAD_LEN; collect(); }
      }
    }

    if (G.shake > 0) G.shake = Math.max(0, G.shake - dt * 2.4);
    for (let i = 0; i < G.fx.length; i++) {
      const f = G.fx[i];
      f.t += dt;
      if (f.part) { f.x += f.vx * dt; f.y += f.vy * dt; f.vy += 500 * dt; }
      if (f.t >= f.life) f.dead = true;
    }
    if (G.fx.some(f => f.dead)) G.fx = G.fx.filter(f => !f.dead);
    for (let i = 0; i < G.texts.length; i++) G.texts[i].t += dt;
    if (G.texts.some(t => t.t >= t.life)) G.texts = G.texts.filter(t => t.t < t.life);
  }

  function endLevel(cleared) {
    if (G.ended) return;
    G.ended = true;
    const ok = cleared || G.money >= G.goal;
    G.state = 'over';
    G.lastKind = ok ? 'win' : 'lose';
    if (ok) Sound.win(); else Sound.lose();
    $('overTitle').textContent = ok ? (cleared ? '矿挖光啦' : '过关！') : '没达标';
    $('overTip').textContent = ok
      ? '第 ' + G.level + ' 关目标 ' + G.goal + '，继续下一关'
      : '目标 ' + G.goal + ' 只挖到 ' + G.money + '，再来一次';
    $('fGoal').textContent = G.goal;
    $('fMoney').textContent = G.money;
    $('btnAgain').textContent = ok ? '下一关' : '重来一次';
    overEl.hidden = false;
  }

  /* ---------------- 绘制 ---------------- */
  /* 把纯黑的贴图染色（离屏画一次，之后直接贴） */
  const TINT = { hook_close: null, hook_open: null, hook_rope: null };

  function tinted(key, c0, c1) {
    if (TINT[key]) return TINT[key];
    const img = IMG[key];
    if (!img || !img.complete || !img.naturalWidth) return null;
    const c = document.createElement('canvas');
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    const g2 = c.getContext('2d');
    g2.drawImage(img, 0, 0);
    g2.globalCompositeOperation = 'source-atop';
    const grd = g2.createLinearGradient(0, 0, 0, c.height);
    grd.addColorStop(0, c0); grd.addColorStop(1, c1);
    g2.fillStyle = grd;
    g2.fillRect(0, 0, c.width, c.height);
    TINT[key] = c;
    return c;
  }

  function drawBg(g) {
    const dh = view.dh;
    if (IMG.bg.complete && IMG.bg.naturalWidth) {
      const bw = IMG.bg.naturalWidth, bh = IMG.bg.naturalHeight;
      /* 草地（原图 y 0~100） */
      g.drawImage(IMG.bg, 0, 0, bw, 100, -20, 0, DW + 40, 92);
      /* 地表停着的矿车（原工程 car.png） */
      if (IMG.car.complete && IMG.car.naturalWidth) {
        const cw = 148, ch = cw * IMG.car.naturalHeight / IMG.car.naturalWidth;
        g.drawImage(IMG.car, 24, 88 - ch * 0.78, cw, ch);
      }
      /* 土层（原图 y 100~580）纵向拉伸铺满 */
      const soilTop = 78;
      const soilH = dh - soilTop - 70;
      g.drawImage(IMG.bg, 0, 100, bw, 480, 0, soilTop, DW, soilH);
      /* 底部碎石（原图 y 580~640） */
      g.drawImage(IMG.bg, 0, 580, bw, 60, -20, dh - 74, DW + 40, 74);
    } else {
      g.fillStyle = '#6b4423';
      g.fillRect(0, 0, DW, dh);
    }
  }

  function render() {
    const g = ctx, vw = view.vw, vh = view.vh, dh = view.dh, dpr = view.dpr;
    const sx = G.shake > 0 ? (Math.random() - 0.5) * G.shake * 10 : 0;
    const sy = G.shake > 0 ? (Math.random() - 0.5) * G.shake * 10 : 0;

    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = '#2a1a0d';
    g.fillRect(0, 0, vw, vh);

    g.setTransform(view.s * dpr, 0, 0, view.s * dpr, (-20 + sx) * view.s * dpr, sy * view.s * dpr);
    g.save();
    g.beginPath(); g.rect(-20, 0, DW + 40, dh); g.clip();

    drawBg(g);

    /* 矿块 */
    for (let i = 0; i < G.ores.length; i++) {
      const o = G.ores[i];
      const im = IMG[o.img];
      if (im && im.complete && im.naturalWidth) g.drawImage(im, o.x - o.w / 2, o.y - o.h / 2, o.w, o.h);
      else { g.fillStyle = '#ffd34d'; g.fillRect(o.x - o.w / 2, o.y - o.h / 2, o.w, o.h); }
    }

    /* 钩爪：绳子 + 爪头 */
    const h = G.hook, p = headPos();
    /* 绳子必须跟钩爪同一个角度：绕转轴旋转后再画（绳图是横向的，所以先转 90°） */
    g.save();
    g.translate(PIVOT.x, PIVOT.y);
    g.rotate(Math.PI / 2 - h.angle);
    const ropeImg = tinted('hook_rope', ROPE_TINT[0], ROPE_TINT[1]) || (IMG.hook_rope.complete ? IMG.hook_rope : null);
    if (ropeImg) {
      g.drawImage(ropeImg, 0, 0, ropeImg.naturalWidth || ropeImg.width, ropeImg.naturalHeight || ropeImg.height,
        0, -ROPE_W / 2, h.len, ROPE_W);
    } else {
      g.strokeStyle = ROPE_TINT[1]; g.lineWidth = ROPE_W * 0.7;
      g.beginPath(); g.moveTo(0, 0); g.lineTo(0, h.len); g.stroke();
    }
    g.restore();
    /* 转轴 */
    g.save();
    g.fillStyle = '#7d8794';
    g.beginPath(); g.arc(PIVOT.x, PIVOT.y, 11, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#c9a227';
    g.beginPath(); g.arc(PIVOT.x, PIVOT.y, 5.5, 0, Math.PI * 2); g.fill();
    g.restore();

    /* 抓到的东西跟着钩头 */
    if (h.carrying) {
      const o = h.carrying;
      const im = IMG[o.img];
      const cx = p.x, cy = p.y + o.h / 2 + 6;
      if (im && im.complete) g.drawImage(im, cx - o.w / 2, cy - o.h / 2, o.w, o.h);
    }

    const clawKey = h.state === 'out' ? 'hook_open' : 'hook_close';
    const claw = tinted(clawKey, CLAW_TINT[0], CLAW_TINT[1])
      || ((IMG[clawKey] && IMG[clawKey].complete) ? IMG[clawKey] : null);
    if (claw) {
      const nw = claw.naturalWidth || claw.width, nh = claw.naturalHeight || claw.height;
      const cw = CLAW_W, ch = cw * nh / nw;
      g.save();
      g.translate(p.x, p.y);
      g.rotate(-h.angle);                    // 与 headPos 的 sin/cos 方向一致
      g.drawImage(claw, -cw / 2, -ch * 0.12, cw, ch);
      g.restore();
    }

    /* 爆炸 + 粒子 */
    for (let i = 0; i < G.fx.length; i++) {
      const f = G.fx[i];
      const k = f.t / f.life;
      if (f.part) {
        g.save();
        g.globalAlpha = Math.max(0, 1 - k);
        g.fillStyle = Math.random() < 0.5 ? '#ffd34d' : '#ff8a3d';
        g.beginPath(); g.arc(f.x, f.y, f.r, 0, Math.PI * 2); g.fill();
        g.restore();
      } else {
        const idx = Math.min(7, Math.floor(k * 8));
        const im = BOOM[idx];
        if (im && im.complete) {
          const s = 170;
          g.save();
          g.globalAlpha = Math.max(0, 1 - k * 0.7);
          g.drawImage(im, f.x - s / 2, f.y - s / 2, s, s);
          g.restore();
        }
      }
    }

    /* 加钱飘字 */
    for (let i = 0; i < G.texts.length; i++) {
      const tx = G.texts[i];
      const k = tx.t / tx.life;
      g.save();
      g.globalAlpha = Math.max(0, 1 - k);
      g.fillStyle = '#ffe27a';
      g.font = '800 26px ' + FONT;
      g.textAlign = 'center';
      g.lineWidth = 4;
      g.strokeStyle = 'rgba(40,22,6,.75)';
      g.strokeText(tx.txt, tx.x, tx.y - k * 40);
      g.fillText(tx.txt, tx.x, tx.y - k * 40);
      g.restore();
    }

    g.restore();

    /* 倒计时紧张时闪一下 */
    if (G.state === 'play' && G.time <= 10 && G.time > 0) {
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.save();
      g.globalAlpha = 0.12 + Math.abs(Math.sin(G.t * 5)) * 0.16;
      g.fillStyle = '#ff3b30';
      g.fillRect(0, 0, vw, vh);
      g.restore();
    }
  }

  /* ---------------- 布局 / 循环 ---------------- */
  function layout() {
    const rect = stageEl.getBoundingClientRect();
    const vw = Math.max(240, rect.width || window.innerWidth);
    const vh = Math.max(280, rect.height || window.innerHeight);
    const dpr = Math.min(2.5, window.devicePixelRatio || 1);
    view.vw = vw; view.vh = vh; view.dpr = dpr;
    view.s = Math.max(0.32, Math.min(vw / DW, vh / 1000));
    view.dh = vh / view.s;
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
    update(dt);
    render();
    requestAnimationFrame(frame);
  }

  /* ---------------- 交互 ---------------- */
  stageEl.addEventListener('pointerdown', function (ev) {
    if (ev.target.closest && ev.target.closest('.overlay')) return;
    ev.preventDefault();
    Sound.unlock();
    dropHook();
  });
  stageEl.addEventListener('contextmenu', e => e.preventDefault());

  document.addEventListener('keydown', function (ev) {
    if (ev.key === ' ' || ev.key === 'ArrowDown') { ev.preventDefault(); Sound.unlock(); dropHook(); }
    else if (ev.key === 'd' || ev.key === 'D') useDynamite();
    else if (ev.key === 'r' || ev.key === 'R') startLevel(G.level);
  });

  $('btnSound').addEventListener('click', function () { Sound.unlock(); Sound.setOn(!Sound.on); });
  $('btnDyn').addEventListener('click', function () { Sound.unlock(); useDynamite(); });
  $('btnRestart').addEventListener('click', function () { Sound.unlock(); startLevel(G.level); });
  $('btnAgain').addEventListener('click', function () {
    Sound.unlock();
    if (G.lastKind === 'win') startLevel(G.level + 1);
    else { G.money = 0; startLevel(G.level); }
  });

  let rt = 0;
  function relayout() {
    clearTimeout(rt);
    rt = setTimeout(function () {
      layout();
      /* 尺寸变化大就重排本关矿块，避免跑到屏幕外 */
      if (G.state === 'play') buildLevel();
    }, 120);
  }
  window.addEventListener('resize', relayout);
  window.addEventListener('orientationchange', function () { setTimeout(function () { layout(); if (G.state === 'play') buildLevel(); }, 240); });
  window.addEventListener('load', function () { layout(); setTimeout(function () { layout(); if (G.state === 'play') buildLevel(); }, 200); });
  if (window.ResizeObserver) new ResizeObserver(function () { if (!G.ended) relayout(); }).observe(stageEl);

  /* ---------------- 启动 ---------------- */
  Sound.init();
  layout();
  startLevel(1);
  requestAnimationFrame(frame);

  /* 调试钩子 */
  window.HuangJin = {
    get state() { return G.state; },
    get level() { return G.level; },
    get money() { return G.money; },
    get goal() { return G.goal; },
    get time() { return G.time; },
    get ores() { return G.ores; },
    get hook() { return G.hook; },
    get dyn() { return G.dyn; },
    view, startLevel, restartAll, dropHook, useDynamite, buildLevel,
    setMoney(v) { G.money = v; updateHud(); },
    setTime(v) { G.time = v; updateHud(); },
    endLevel,
    headPos,
    hookWeight,
    pullRatio,
    /* 把钩爪直接摆到某个角度和长度 */
    setHook(angle, len) {
      G.hook.state = 'swing';
      G.hook.angle = typeof angle === 'number' ? angle : G.hook.angle;
      G.hook.len = typeof len === 'number' ? len : G.hook.len;
      G.hook.t = 0;
    },
    tick(n, dt) { for (let i = 0; i < (n || 1); i++) update(dt || 1 / 120); },
    render
  };
})();
