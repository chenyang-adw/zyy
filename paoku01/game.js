/* =========================================================
 *  隐形人跑酷
 *  玩法取自 xyx/隐形人跑酷-creator（Cocos Creator 2.x）：
 *  - 火柴人左右跑 + 跳（源码 PlayerControl：xSpeed / jumpHeight）
 *  - 尖刺碰到就回起点（源码 ThornControl / TrapControl → resetHero）
 *  - 会左右巡逻的活动平台（源码 MovePlatform）
 *  - 蹦板 TabanUp / 易碎砖 break block / 门（终点）
 *  素材：原工程黑白手绘风火柴人序列帧与场景贴图
 * ========================================================= */
(function () {
  'use strict';

  const TILE = 36;                        // 每格像素（设计单位）
  const FONT = '"PingFang SC","Microsoft YaHei",system-ui,sans-serif';
  const HERO_W = 34, HERO_H = 92;
  const GRAVITY = 2400;
  const RUN_SPEED = 330;
  const JUMP_V = 830;

  const $ = id => document.getElementById(id);
  const stageEl = $('stage'), cv = $('game');
  const ctx = cv.getContext('2d');
  const overEl = $('over');
  const view = { s: 1, vw: 0, vh: 0, dpr: 1 };

  /* ---------------- 素材 ---------------- */
  const F = {
    idle: 'assets/hero-2.png', run1: 'assets/hero-11.png', run2: 'assets/hero-12.png',
    run3: 'assets/hero-13.png', run4: 'assets/hero-14.png', jump: 'assets/hero-10.png',
    block: 'assets/block.png', break: 'assets/block-break.png', thorn: 'assets/thorn.png',
    door: 'assets/door.png', key: 'assets/key.png', taban: 'assets/taban-up.png',
    plane: 'assets/plane.png'
  };
  const IMG = {};
  Object.keys(F).forEach(k => { IMG[k] = new Image(); IMG[k].src = F[k]; });

  /* ---------------- 音效（原工程没有音频，这里合成） ---------------- */
  const Sound = {
    ac: null, on: true, started: false,
    init() { try { this.on = localStorage.getItem('paoku.sound') !== '0'; } catch (e) {} this.sync(); },
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
      if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(60, slide), t0 + dur);
      gn.gain.setValueAtTime(0, t0);
      gn.gain.linearRampToValueAtTime(g == null ? 0.12 : g, t0 + 0.012);
      gn.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(gn); gn.connect(this.ac.destination);
      o.start(t0); o.stop(t0 + dur + 0.03);
    },
    jump() { this.beep(420, 0.16, 'square', 0.1, 780); },
    land() { this.beep(180, 0.08, 'triangle', 0.07); },
    die() { this.beep(320, 0.4, 'sawtooth', 0.13, 80); },
    key() { [660, 990].forEach((f, i) => setTimeout(() => this.beep(f, 0.16, 'sine', 0.12), i * 90)); },
    win() { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => this.beep(f, 0.3, 'triangle', 0.12), i * 110)); },
    setOn(v) { this.on = v; try { localStorage.setItem('paoku.sound', v ? '1' : '0'); } catch (e) {} this.sync(); },
    sync() { const b = $('btnSound'); b.textContent = this.on ? '🔊' : '🔇'; b.style.opacity = this.on ? '1' : '.5'; }
  };

  /* ---------------- 关卡数据 ----------------
     坐标都以「格」为单位：
       solid   [x, y, w, h]   实心方块
       breaks  [x, y, w, h]   易碎砖（踩上去约 0.5 秒塌掉）
       thorns  [x, y] 尖刺    tabans [x, y] 蹦板
       movers  [x, y, range]  左右巡逻平台（宽 2 格）
       key [x,y] / door [x,y] / start [x,y]
  -------------------------------------------------- */
  const LEVELS = [
    { /* 第 1 关：入门 —— 跨坑、蹦板、跳尖刺 */
      w: 72, h: 12,
      solid: [[0, 9, 33, 2], [43, 9, 29, 2], [36, 8, 5, 1], [16, 8, 12, 1], [51, 7, 12, 1]],
      breaks: [], thorns: [[12, 8], [20, 8]], tabans: [[30, 8]], movers: [],
      key: [57, 6], door: [66, 7], start: [3, 8]
    },
    { /* 第 2 关：两块活动平台 + 易碎砖桥 */
      w: 72, h: 12,
      solid: [[0, 9, 13, 2], [28, 9, 7, 2], [52, 9, 20, 2], [64, 7, 8, 1]],
      breaks: [[44, 7, 5, 1]],
      thorns: [[60, 8], [33, 8]], tabans: [[8, 8]], movers: [[16, 9, 6], [40, 9, 5]],
      key: [46, 6], door: [67, 6], start: [3, 8]
    },
    { /* 第 3 关：多点位 + 高台钥匙 */
      w: 78, h: 13,
      solid: [[0, 11, 10, 2], [16, 10, 6, 1], [26, 11, 8, 2], [40, 10, 6, 1],
              [52, 11, 10, 2], [66, 8, 12, 5], [62, 10, 4, 1]],
      breaks: [[34, 8, 4, 1], [46, 7, 4, 1]],
      thorns: [[6, 10], [30, 10], [56, 10], [70, 7]],
      tabans: [[20, 9], [42, 9]],
      movers: [[12, 11, 4], [58, 10, 4]],
      key: [47, 6], door: [74, 7], start: [2, 10]
    }
  ];

  /* ---------------- 状态 ---------------- */
  const G = {
    level: 0, state: 'play',      // play | dead | done
    map: [], W: 0, H: 0,
    solids: [], breaks: [], thorns: [], tabans: [], movers: [], keys: [], door: null,
    hero: null, camX: 0,
    hasKey: false, time: 0, best: null,
    deadT: 0, fx: [], t: 0
  };
  const keys = {};

  function parseLevel(idx) {
    const L = LEVELS[idx];
    G.H = L.h; G.W = L.w;
    G.solids = []; G.breaks = []; G.thorns = []; G.tabans = []; G.movers = []; G.keys = []; G.door = null;
    G.hero = { x: 0, y: 0, vx: 0, vy: 0, onGround: false, face: 1, frame: 0, ft: 0 };
    L.solid.forEach(b => G.solids.push({ x: b[0] * TILE, y: b[1] * TILE, w: b[2] * TILE, h: b[3] * TILE }));
    L.breaks.forEach(b => G.breaks.push({ x: b[0] * TILE, y: b[1] * TILE, w: b[2] * TILE, h: b[3] * TILE, t: -1, gone: false }));
    L.thorns.forEach(t => G.thorns.push({ x: t[0] * TILE, y: t[1] * TILE, w: TILE, h: TILE }));
    L.tabans.forEach(t => G.tabans.push({ x: t[0] * TILE, y: t[1] * TILE, w: TILE, h: TILE, spring: 0 }));
    L.movers.forEach(m => G.movers.push({ x: m[0] * TILE, y: m[1] * TILE, w: TILE * 2, h: TILE * 0.45, ox: m[0] * TILE, dir: 1, range: m[2] * TILE, sp: 76, dx: 0 }));
    G.keys.push({ x: L.key[0] * TILE + TILE / 2, y: L.key[1] * TILE + TILE / 2, r: TILE * 0.42, got: false });
    G.door = { x: L.door[0] * TILE, y: L.door[1] * TILE, w: TILE, h: TILE * 2 };
    G.hero.x = L.start[0] * TILE + TILE / 2;
    G.hero.y = L.start[1] * TILE + TILE - HERO_H;
    G.hasKey = G.keys.length === 0;
    G.state = 'play';
    G.time = 0; G.deadT = 0;
    G.camX = 0;
    overEl.hidden = true;
    $('room').textContent = (idx + 1) + '/' + LEVELS.length;
    updateHud();
  }

  function updateHud() {
    $('time').textContent = G.time.toFixed(1);
    $('best').textContent = G.best == null ? '—' : G.best.toFixed(1) + 's';
  }

  function resetLevel() { parseLevel(G.level); }

  function restartAll() {
    G.level = 0;
    parseLevel(0);
  }

  /* ---------------- 物理 ---------------- */
  function platforms() {
    const list = [];
    for (let i = 0; i < G.solids.length; i++) list.push(G.solids[i]);
    for (let i = 0; i < G.breaks.length; i++) if (!G.breaks[i].gone) list.push(G.breaks[i]);
    for (let i = 0; i < G.movers.length; i++) list.push(G.movers[i]);
    return list;
  }

  function rectHit(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  function update(dt) {
    G.t += dt;
    const h = G.hero;

    /* 活动平台 */
    for (let i = 0; i < G.movers.length; i++) {
      const m = G.movers[i];
      const prevX = m.x;
      m.x += m.dir * m.sp * dt;
      if (m.x > m.ox + m.range) { m.x = m.ox + m.range; m.dir = -1; }
      if (m.x < m.ox - m.range) { m.x = m.ox - m.range; m.dir = 1; }
      m.dx = m.x - prevX;
    }
    /* 蹦板回弹 */
    for (let i = 0; i < G.tabans.length; i++) {
      const t = G.tabans[i];
      if (t.spring > 0) t.spring = Math.max(0, t.spring - dt * 4);
    }
    /* 易碎砖 */
    for (let i = 0; i < G.breaks.length; i++) {
      const b = G.breaks[i];
      if (b.t >= 0 && !b.gone) {
        b.t += dt;
        if (b.t > 0.55) { b.gone = true; boom(b.x + b.w / 2, b.y + b.h / 2, 10); }
      }
    }

    if (G.state === 'play') {
      G.time += dt;
      if (Math.floor(G.time * 10) % 3 === 0) updateHud();

      /* 输入 */
      let ax = 0;
      if (keys.left || keys.btnLeft) ax -= 1;
      if (keys.right || keys.btnRight) ax += 1;
      if (ax !== 0) h.face = ax;
      const target = ax * RUN_SPEED;
      const accel = h.onGround ? 2600 : 1500;
      if (h.vx < target) h.vx = Math.min(target, h.vx + accel * dt);
      else if (h.vx > target) h.vx = Math.max(target, h.vx - accel * dt);
      if (ax === 0 && h.onGround) h.vx *= 0.8;

      /* 跳 */
      if ((keys.jump || keys.btnJump) && h.onGround && !h.jumpLock) {
        h.vy = -JUMP_V;
        h.onGround = false;
        h.jumpLock = true;
        Sound.jump();
      }
      if (!(keys.jump || keys.btnJump)) h.jumpLock = false;
      /* 可变跳跃高度 */
      if (h.vy < 0 && !(keys.jump || keys.btnJump)) h.vy += GRAVITY * 1.6 * dt;

      h.vy += GRAVITY * dt;
      if (h.vy > 1500) h.vy = 1500;

      /* 水平移动 + 逐轴碰撞 */
      const hb = () => ({ x: h.x - HERO_W / 2, y: h.y, w: HERO_W, h: HERO_H });
      h.x += h.vx * dt;
      let r = hb();
      const plats = platforms();
      for (let i = 0; i < plats.length; i++) {
        const p = plats[i];
        if (!rectHit(r, p)) continue;
        if (h.vx > 0) { h.x = p.x - HERO_W / 2 - 0.01; }
        else if (h.vx < 0) { h.x = p.x + p.w + HERO_W / 2 + 0.01; }
        h.vx = 0;
        r = hb();
      }
      /* 垂直 */
      const prevBottom = h.y + HERO_H;
      h.y += h.vy * dt;
      h.onGround = false;
      r = hb();
      for (let i = 0; i < plats.length; i++) {
        const p = plats[i];
        if (!rectHit(r, p)) continue;
        if (h.vy > 0 && prevBottom <= p.y + 6) {
          h.y = p.y - HERO_H;
          if (h.vy > 420) Sound.land();
          h.vy = 0; h.onGround = true;
          if (G.breaks.indexOf(p) >= 0 && G.breaks[G.breaks.indexOf(p)].t < 0) G.breaks[G.breaks.indexOf(p)].t = 0;
          r = hb();
        } else if (h.vy < 0) {
          h.y = p.y + p.h + 0.01;
          h.vy = 0;
          r = hb();
        }
      }
      /* 跟随活动平台 */
      for (let i = 0; i < G.movers.length; i++) {
        const m = G.movers[i];
        const rr = { x: h.x - HERO_W / 2, y: h.y, w: HERO_W, h: HERO_H };
        if (rr.y + rr.h >= m.y - 2 && rr.y + rr.h <= m.y + 8 && rr.x + rr.w > m.x && rr.x < m.x + m.w && h.onGround) {
          h.x += m.dx || 0;
        }
      }
      /* 蹦板 */
      for (let i = 0; i < G.tabans.length; i++) {
        const t = G.tabans[i];
        const rr = { x: h.x - HERO_W / 2, y: h.y, w: HERO_W, h: HERO_H };
        if (h.vy >= 0 && rectHit(rr, { x: t.x, y: t.y, w: t.w, h: t.h })) {
          h.y = t.y - HERO_H; h.vy = -JUMP_V * 1.45; h.onGround = false;
          t.spring = 1; Sound.jump();
        }
      }
      /* 钥匙 / 门 */
      for (let i = 0; i < G.keys.length; i++) {
        const k = G.keys[i];
        if (k.got) continue;
        if (Math.abs(h.x - k.x) < 26 && Math.abs((h.y + HERO_H / 2) - k.y) < 46) {
          k.got = true; G.hasKey = true; Sound.key();
          boom(k.x, k.y, 12);
        }
      }
      if (G.door && G.hasKey) {
        const rr = { x: h.x - HERO_W / 2, y: h.y, w: HERO_W, h: HERO_H };
        if (rectHit(rr, G.door)) nextLevel();
      }
      /* 尖刺 */
      for (let i = 0; i < G.thorns.length; i++) {
        const t = G.thorns[i];
        const rr = { x: h.x - HERO_W / 2 + 5, y: h.y + 20, w: HERO_W - 10, h: HERO_H - 22 };
        if (rectHit(rr, { x: t.x + 6, y: t.y + 12, w: t.w - 12, h: t.h - 12 })) { die(); break; }
      }
      /* 掉出地图 */
      if (h.y > G.H * TILE + 120) die();

      /* 动画 */
      if (!h.onGround) h.frame = 5;
      else if (Math.abs(h.vx) > 20) {
        h.ft += dt * (Math.abs(h.vx) / 60);
        h.frame = 1 + (Math.floor(h.ft) % 4);
      } else { h.frame = 0; h.ft = 0; }

      /* 镜头 */
      const want = h.x - view.vw / view.s * 0.42;
      G.camX += (want - G.camX) * Math.min(1, dt * 7);
      const maxCam = Math.max(0, G.W * TILE - view.vw / view.s);
      G.camX = Math.max(0, Math.min(maxCam, G.camX));
    } else if (G.state === 'dead') {
      G.deadT += dt;
      G.hero.vy += GRAVITY * dt;
      G.hero.y += G.hero.vy * dt;
      if (G.deadT > 0.7) resetLevel();
    }

    for (let i = 0; i < G.fx.length; i++) {
      const f = G.fx[i];
      f.t += dt; f.vy += 900 * dt;
      f.x += f.vx * dt; f.y += f.vy * dt;
      if (f.t >= f.life) f.dead = true;
    }
    if (G.fx.some(f => f.dead)) G.fx = G.fx.filter(f => !f.dead);
  }

  function boom(x, y, n) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, sp = 60 + Math.random() * 180;
      G.fx.push({ x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 60, r: 2 + Math.random() * 3, t: 0, life: 0.5 + Math.random() * 0.4 });
    }
  }

  function die() {
    if (G.state !== 'play') return;
    G.state = 'dead';
    G.deadT = 0;
    G.hero.vy = -420;
    Sound.die();
  }

  function nextLevel() {
    Sound.win();
    if (G.level + 1 >= LEVELS.length) {
      G.state = 'done';
      const total = G.time;
      if (G.best == null || total < G.best) {
        G.best = total;
        try { localStorage.setItem('paoku.best', String(total)); } catch (e) {}
      }
      $('finalTime').textContent = total.toFixed(1) + 's';
      $('finalBest').textContent = G.best.toFixed(1) + 's';
      overEl.hidden = false;
      updateHud();
      return;
    }
    G.level++;
    parseLevel(G.level);
  }

  /* ---------------- 绘制 ---------------- */
  function render() {
    const g = ctx, vw = view.vw, vh = view.vh, dpr = view.dpr;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    /* 纸张底 */
    g.fillStyle = '#fbfbf8';
    g.fillRect(0, 0, vw, vh);

    const s = view.s;
    g.setTransform(s * dpr, 0, 0, s * dpr, (-G.camX * s) * dpr, 0);
    const H = G.H * TILE;

    /* 淡格线，手稿本的感觉 */
    g.save();
    g.strokeStyle = 'rgba(27,27,27,.05)';
    g.lineWidth = 1;
    const x0 = Math.floor(G.camX / TILE) * TILE;
    for (let x = x0; x < G.camX + view.vw / s + TILE; x += TILE) {
      g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke();
    }
    for (let y = 0; y < H; y += TILE) { g.beginPath(); g.moveTo(x0, y); g.lineTo(G.camX + view.vw / s + TILE, y); g.stroke(); }
    g.restore();

    /* 方块 */
    function block(b, style) {
      g.save();
      g.fillStyle = '#ffffff';
      g.fillRect(b.x, b.y, b.w, b.h);
      if (IMG.block.complete && IMG.block.naturalWidth) {
        /* 平铺而不是拉伸，保持手绘砖块的感觉 */
        for (let yy = b.y; yy < b.y + b.h; yy += TILE) {
          for (let xx = b.x; xx < b.x + b.w; xx += TILE) {
            const w = Math.min(TILE, b.x + b.w - xx), hh = Math.min(TILE, b.y + b.h - yy);
            g.drawImage(IMG.block, 0, 0, IMG.block.naturalWidth, IMG.block.naturalHeight, xx, yy, w, hh);
          }
        }
      }
      g.strokeStyle = '#1b1b1b';
      g.lineWidth = 3;
      g.strokeRect(b.x + 1.5, b.y + 1.5, b.w - 3, b.h - 3);
      g.restore();
    }
    for (let i = 0; i < G.solids.length; i++) block(G.solids[i]);
    for (let i = 0; i < G.breaks.length; i++) {
      const b = G.breaks[i];
      if (b.gone) continue;
      g.save();
      if (b.t >= 0) g.globalAlpha = 0.55 + Math.sin(G.t * 30) * 0.25;
      g.fillStyle = '#ffffff'; g.fillRect(b.x, b.y, b.w, b.h);
      g.strokeStyle = '#1b1b1b'; g.lineWidth = 3; g.setLineDash([6, 5]);
      g.strokeRect(b.x + 1.5, b.y + 1.5, b.w - 3, b.h - 3);
      g.restore();
    }
    /* 活动平台 */
    for (let i = 0; i < G.movers.length; i++) {
      const m = G.movers[i];
      g.save();
      g.fillStyle = '#ffe86b';
      g.fillRect(m.x, m.y, m.w, m.h);
      g.strokeStyle = '#1b1b1b'; g.lineWidth = 3;
      g.strokeRect(m.x + 1.5, m.y + 1.5, m.w - 3, m.h - 3);
      g.restore();
    }
    /* 蹦板 */
    for (let i = 0; i < G.tabans.length; i++) {
      const t = G.tabans[i];
      const sq = 1 - t.spring * 0.35;
      g.save();
      g.translate(t.x + t.w / 2, t.y + t.h);
      g.scale(1, sq);
      if (IMG.taban.complete) g.drawImage(IMG.taban, -t.w / 2, -t.h, t.w, t.h);
      else { g.fillStyle = '#ffe86b'; g.fillRect(-t.w / 2, -t.h, t.w, t.h); }
      g.strokeStyle = '#1b1b1b'; g.lineWidth = 3;
      g.strokeRect(-t.w / 2 + 1.5, -t.h + 1.5, t.w - 3, t.h - 3);
      g.restore();
    }
    /* 尖刺 */
    for (let i = 0; i < G.thorns.length; i++) {
      const t = G.thorns[i];
      g.save();
      if (IMG.thorn.complete && IMG.thorn.naturalWidth) {
        g.drawImage(IMG.thorn, 0, 0, IMG.thorn.naturalWidth, IMG.thorn.naturalHeight, t.x, t.y + t.h * 0.12, t.w, t.h);
      } else {
        g.fillStyle = '#1b1b1b';
        g.beginPath(); g.moveTo(t.x, t.y + t.h); g.lineTo(t.x + t.w / 2, t.y); g.lineTo(t.x + t.w, t.y + t.h); g.closePath(); g.fill();
      }
      g.restore();
    }
    /* 钥匙 */
    for (let i = 0; i < G.keys.length; i++) {
      const k = G.keys[i];
      if (k.got) continue;
      const bob = Math.sin(G.t * 3 + i) * 4;
      g.save();
      g.translate(k.x, k.y + bob);
      if (IMG.key.complete && IMG.key.naturalWidth) {
        const w = TILE * 0.9, hh = w * IMG.key.naturalHeight / IMG.key.naturalWidth;
        g.drawImage(IMG.key, -w / 2, -hh / 2, w, hh);
      } else {
        g.fillStyle = '#1b1b1b'; g.beginPath(); g.arc(0, 0, 10, 0, Math.PI * 2); g.fill();
      }
      g.restore();
    }
    /* 门 */
    if (G.door) {
      const d = G.door;
      g.save();
      g.globalAlpha = G.hasKey ? 1 : 0.45;
      if (IMG.door.complete && IMG.door.naturalWidth) {
        g.drawImage(IMG.door, 0, 0, IMG.door.naturalWidth, IMG.door.naturalHeight, d.x, d.y, d.w, d.h);
      } else {
        g.fillStyle = '#ffffff'; g.fillRect(d.x, d.y, d.w, d.h);
        g.strokeStyle = '#1b1b1b'; g.lineWidth = 3; g.strokeRect(d.x + 1.5, d.y + 1.5, d.w - 3, d.h - 3);
      }
      g.restore();
    }

    /* 火柴人 */
    const h = G.hero;
    const order = ['idle', 'run1', 'run2', 'run3', 'run4', 'jump'];
    const im = IMG[order[Math.min(5, h.frame)]];
    if (im && im.complete && im.naturalWidth) {
      const scale = HERO_H / im.naturalHeight;
      const w = im.naturalWidth * scale, hh = HERO_H;
      g.save();
      g.translate(h.x, h.y + HERO_H);
      g.scale(h.face >= 0 ? 1 : -1, 1);
      if (G.state === 'dead') g.rotate(0.5);
      g.drawImage(im, -w / 2, -hh, w, hh);
      g.restore();
    }

    /* 粒子 */
    for (let i = 0; i < G.fx.length; i++) {
      const f = G.fx[i];
      g.save();
      g.globalAlpha = Math.max(0, 1 - f.t / f.life);
      g.fillStyle = '#1b1b1b';
      g.fillRect(f.x, f.y, f.r, f.r);
      g.restore();
    }

    /* 提示 */
    if (G.state === 'play' && G.t < 3) {
      g.save();
      g.globalAlpha = Math.max(0, Math.min(1, 3 - G.t)) * 0.75;
      g.fillStyle = '#1b1b1b';
      g.font = '800 18px ' + FONT;
      g.textAlign = 'center';
      g.fillText('跑到门口 · 有钥匙才开门', G.camX + view.vw / s / 2, TILE * 2.2);
      g.restore();
    }
  }

  /* ---------------- 布局 / 循环 ---------------- */
  function layout() {
    const rect = stageEl.getBoundingClientRect();
    const vw = Math.max(280, rect.width || window.innerWidth);
    const vh = Math.max(200, rect.height || window.innerHeight);
    const dpr = Math.min(2.5, window.devicePixelRatio || 1);
    view.vw = vw; view.vh = vh; view.dpr = dpr;
    const worldW = G.W ? G.W * TILE : 2800;
    view.s = Math.max(0.24, Math.min(vh / (11 * TILE), vw / (16 * TILE)));
    cv.width = Math.round(vw * dpr);
    cv.height = Math.round(vh * dpr);
  }

  let last = 0;
  function frame(ts) {
    if (!last) last = ts;
    let dt = (ts - last) / 1000;
    last = ts;
    if (!(dt > 0)) dt = 1 / 60;
    dt = Math.min(dt, 0.04);
    update(dt);
    render();
    requestAnimationFrame(frame);
  }

  /* ---------------- 输入 ---------------- */
  document.addEventListener('keydown', function (ev) {
    if (ev.key === 'ArrowLeft' || ev.key === 'a' || ev.key === 'A') { keys.left = true; ev.preventDefault(); }
    else if (ev.key === 'ArrowRight' || ev.key === 'd' || ev.key === 'D') { keys.right = true; ev.preventDefault(); }
    else if (ev.key === ' ' || ev.key === 'ArrowUp' || ev.key === 'w' || ev.key === 'W') { keys.jump = true; ev.preventDefault(); }
    else if (ev.key === 'r' || ev.key === 'R') resetLevel();
  });
  document.addEventListener('keyup', function (ev) {
    if (ev.key === 'ArrowLeft' || ev.key === 'a' || ev.key === 'A') keys.left = false;
    else if (ev.key === 'ArrowRight' || ev.key === 'd' || ev.key === 'D') keys.right = false;
    else if (ev.key === ' ' || ev.key === 'ArrowUp' || ev.key === 'w' || ev.key === 'W') keys.jump = false;
  });

  function bindHold(el, name) {
    const on = e => { e.preventDefault(); Sound.unlock(); keys[name] = true; el.classList.add('on'); };
    const off = e => { keys[name] = false; el.classList.remove('on'); };
    el.addEventListener('pointerdown', on);
    el.addEventListener('pointerup', off);
    el.addEventListener('pointercancel', off);
    el.addEventListener('pointerleave', off);
  }
  bindHold($('btnLeft'), 'btnLeft');
  bindHold($('btnRight'), 'btnRight');
  bindHold($('btnJump'), 'btnJump');

  $('btnSound').addEventListener('click', function () { Sound.unlock(); Sound.setOn(!Sound.on); });
  $('btnRestart').addEventListener('click', function () { Sound.unlock(); resetLevel(); });
  $('btnAgain').addEventListener('click', function () { Sound.unlock(); restartAll(); });

  let rt = 0;
  function relayout() { clearTimeout(rt); rt = setTimeout(layout, 110); }
  window.addEventListener('resize', relayout);
  window.addEventListener('orientationchange', function () { setTimeout(layout, 240); });
  window.addEventListener('load', function () { layout(); setTimeout(layout, 200); });
  if (window.ResizeObserver) new ResizeObserver(relayout).observe(stageEl);

  /* ---------------- 启动 ---------------- */
  Sound.init();
  try { const b = parseFloat(localStorage.getItem('paoku.best')); G.best = isNaN(b) ? null : b; } catch (e) { G.best = null; }
  parseLevel(0);
  layout();
  requestAnimationFrame(frame);

  /* 调试钩子 */
  window.PaoKu = {
    get state() { return G.state; },
    get level() { return G.level; },
    get hero() { return G.hero; },
    get hasKey() { return G.hasKey; },
    get door() { return G.door; },
    get time() { return G.time; },
    get solids() { return G.solids; },
    get breaks() { return G.breaks; },
    get thorns() { return G.thorns; },
    get tabans() { return G.tabans; },
    get movers() { return G.movers; },
    get keys() { return G.keys; },
    get mapSize() { return { w: G.W, h: G.H }; },
    view, resetLevel, restartAll,
    keysState: keys,
    setLevel(i) { G.level = i; parseLevel(i); },
    warp(x, y) { G.hero.x = x; G.hero.y = y; G.hero.vx = 0; G.hero.vy = 0; },
    tick(n, dt) { for (let i = 0; i < (n || 1); i++) update(dt || 1 / 120); },
    render
  };
})();
