/* =========================================================
 *  深海潜水艇
 *  玩法取自 xyx/潜水艇游戏cocos：
 *  - 纵向深海隧道，按住左右拖动潜艇（源码 PlayerLogic 的拖拽位移）
 *  - 敌潜艇从上往下冲（源码 ObjectMovement：128*TIME_SCALE）
 *  - 时间每 2 秒加速 0.2（源码 TIME_PROP），捡到时钟能减速
 *  - 捡到激光后 5 秒激光束（源码 LaserBeam.laserDuration = 5）打沉敌舰
 *  - 两根手指还能开传送门瞬移（源码的双指 Portal）
 *  素材：原工程 sprites（潜艇 / 隧道壁 / 道具 / 爆炸序列帧）与 audios
 * ========================================================= */
(function () {
  'use strict';

  const DW = 720;                       // 设计宽度
  const WALL_W = 118;                   // 两侧隧道壁宽度（变窄 → 航道更宽好躲）
  const ROAD_L = WALL_W, ROAD_R = DW - WALL_W;
  const SUBB = 116;                     // 玩家潜艇尺寸
  const ENEMY_W = 158, ENEMY_H = 58;
  const BASE_SPEED = 118;               // 源码 ObjectMovement.movementSpeed = 128
  const SPEED_STEP = 0.2, SPEED_EVERY = 2;
  const MAX_TIME_SCALE = 2.6;           // 加速上限（原来 3.4 太难躲）
  const LASER_TIME = 5;
  const PLAYER_Y = 0.24;                // 潜艇在屏幕上的纵向位置

  const FONT = '"PingFang SC","Microsoft YaHei",system-ui,sans-serif';
  const $ = id => document.getElementById(id);
  const stageEl = $('stage'), cv = $('game');
  const ctx = cv.getContext('2d');
  const overEl = $('over');
  const view = { s: 1, vw: 0, vh: 0, dh: 1000, dpr: 1 };

  /* ---------------- 素材 ---------------- */
  const IMG = {};
  const SRC = {
    player: 'assets/player.png', enemy: 'assets/obstacle_submarine.png',
    wall: 'assets/side_wall.png', bg: 'assets/main_background.png',
    bubble: 'assets/bubble_particle.png', beam: 'assets/laser_beam.png',
    laser: 'assets/pickup_laser.png', timer: 'assets/pickup_timer.png',
    hilite: 'assets/pickup_highlight.png', portal: 'assets/portal.png',
    light: 'assets/player_light.png'
  };
  Object.keys(SRC).forEach(function (k) { IMG[k] = new Image(); IMG[k].src = SRC[k]; });
  const BOOM = [];
  for (let i = 0; i < 8; i++) { const im = new Image(); im.src = 'assets/boom/' + i + '.png'; BOOM.push(im); }

  /* ---------------- 音效 ---------------- */
  const Sound = {
    ac: null, buf: {}, on: true, started: false, bgm: null,
    init() {
      try { this.on = localStorage.getItem('qianshui.sound') !== '0'; } catch (e) {}
      this.bgm = new Audio('assets/background.mp3');
      this.bgm.loop = true;
      this.bgm.preload = 'none';
      this.bgm.volume = 0.28;
      this.syncBtn();
    },
    unlock() {
      if (!this.started) {
        this.started = true;
        try {
          const AC = window.AudioContext || window.webkitAudioContext;
          if (AC) {
            this.ac = new AC();
            ['explosion', 'click'].forEach(n => {
              const url = n === 'explosion' ? 'assets/explosion.wav' : 'assets/click.wav';
              fetch(url).then(r => r.arrayBuffer()).then(b => new Promise(res => this.ac.decodeAudioData(b, res, res)))
                .then(d => { if (d) this.buf[n] = d; }).catch(() => {});
            });
          }
        } catch (e) {}
      }
      if (this.ac && this.ac.state === 'suspended') this.ac.resume();
      this.playBgm();
    },
    playBgm() {
      if (!this.on || !this.bgm) return;
      if (this.bgm.preload === 'none') this.bgm.preload = 'auto';
      const p = this.bgm.play(); if (p && p.catch) p.catch(() => {});
    },
    pauseBgm() { if (this.bgm) { try { this.bgm.pause(); } catch (e) {} } },
    play(n, g) {
      if (!this.on || !this.ac || !this.buf[n]) return;
      const s = this.ac.createBufferSource(); s.buffer = this.buf[n];
      const gain = this.ac.createGain(); gain.gain.value = g == null ? 0.5 : g;
      s.connect(gain); gain.connect(this.ac.destination); s.start();
    },
    /* 没有音效素材时用合成音兜底 */
    beep(f, dur, type, g) {
      if (!this.on || !this.ac) return;
      const t0 = this.ac.currentTime;
      const o = this.ac.createOscillator(), gn = this.ac.createGain();
      o.type = type || 'sine'; o.frequency.setValueAtTime(f, t0);
      gn.gain.setValueAtTime(0, t0);
      gn.gain.linearRampToValueAtTime(g == null ? 0.14 : g, t0 + 0.01);
      gn.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(gn); gn.connect(this.ac.destination);
      o.start(t0); o.stop(t0 + dur + 0.02);
    },
    pickLaser() { this.buf.click ? this.play('click', 0.4) : this.beep(880, 0.18, 'triangle', 0.16); },
    pickTimer() { this.beep(520, 0.2, 'sine', 0.16); },
    hitObs() { this.buf.explosion ? this.play('explosion', 0.55) : this.beep(120, 0.5, 'sawtooth', 0.2); },
    shoot() { this.beep(300, 0.12, 'square', 0.08); },
    setOn(v) {
      this.on = v;
      try { localStorage.setItem('qianshui.sound', v ? '1' : '0'); } catch (e) {}
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
    state: 'play',           // play | over
    px: DW / 2,
    timeScale: 1, speedT: 0,
    dist: 0, score: 0, best: 0,
    enemies: [], items: [], fx: [], bubbles: [], boomFx: [],
    spawnT: 1.4, itemT: 3.2,
    laser: 0,
    shake: 0, flash: 0,
    bubblesT: 0,
    dragging: false, dragStartX: 0, dragPlayerX: 0,
    portal: null,
    t: 0
  };

  function reset() {
    G.state = 'play';
    G.px = DW / 2;
    G.timeScale = 1; G.speedT = 0;
    G.dist = 0; G.score = 0;
    G.enemies = []; G.items = []; G.fx = []; G.boomFx = [];
    G.spawnT = 1.2; G.itemT = 3;
    G.laser = 0; G.shake = 0; G.flash = 0;
    G.portal = null;
    G.bubbles = [];
    for (let i = 0; i < 26; i++) G.bubbles.push({ x: Math.random() * DW, y: Math.random() * view.dh, r: 2 + Math.random() * 5, sp: 30 + Math.random() * 70 });
    overEl.hidden = true;
    updateHud();
  }

  function updateHud() {
    $('score').textContent = G.score;
    $('best').textContent = G.best;
    $('speed').textContent = G.timeScale.toFixed(1);
  }

  /* ---------------- 生成 ---------------- */
  function spawnEnemy() {
    /* 敌舰贴着某一侧生成，另一侧一定留出通路，不然中间生成是必死 */
    const w = ROAD_R - ROAD_L;
    const band = w * 0.26;
    const left = Math.random() < 0.5;
    const x = left ? ROAD_L + 50 + Math.random() * band
                   : ROAD_R - 50 - Math.random() * band;
    G.enemies.push({
      x: x, y: -ENEMY_H, w: ENEMY_W, h: ENEMY_H,
      sp: BASE_SPEED * G.timeScale * (0.92 + Math.random() * 0.22),
      drift: (left ? -1 : 1) * (10 + Math.random() * 20),   // 只在靠边那侧小幅摆动
      passed: false
    });
  }

  function spawnItem() {
    const isLaser = Math.random() < 0.5;
    const x = ROAD_L + 70 + Math.random() * (ROAD_R - ROAD_L - 140);
    G.items.push({ x: x, y: -70, r: 34, kind: isLaser ? 'laser' : 'timer', ph: Math.random() * 6.28 });
  }

  /* ---------------- 更新 ---------------- */
  function update(dt) {
    G.t += dt;
    /* 气泡 */
    for (let i = 0; i < G.bubbles.length; i++) {
      const b = G.bubbles[i];
      b.y -= b.sp * dt * (1 + G.timeScale * 0.4);
      if (b.y < -10) { b.y = view.dh + 10; b.x = Math.random() * DW; }
    }

    if (G.state === 'play') {
      /* 加速（源码：每 2 秒 TIME_SCALE +0.2） */
      G.speedT += dt;
      if (G.speedT >= SPEED_EVERY) {
        G.speedT -= SPEED_EVERY;
        G.timeScale = Math.min(MAX_TIME_SCALE, G.timeScale + SPEED_STEP);
        updateHud();
      }
      /* 距离分 */
      const step = BASE_SPEED * G.timeScale * dt;
      G.dist += step;
      const add = Math.floor(G.dist / 60) - G.score;
      if (add > 0) { G.score += add; updateHud(); }

      /* 生成 */
      G.spawnT -= dt;
      if (G.spawnT <= 0) {
        spawnEnemy();
        G.spawnT = Math.max(0.95, (1.7 - (G.timeScale - 1) * 0.2)) * (0.9 + Math.random() * 0.45);
      }
      G.itemT -= dt;
      if (G.itemT <= 0) { spawnItem(); G.itemT = 3.4 + Math.random() * 3.4; }

      if (G.laser > 0) G.laser = Math.max(0, G.laser - dt);

      /* 敌舰 */
      for (let i = G.enemies.length - 1; i >= 0; i--) {
        const e = G.enemies[i];
        e.y += e.sp * dt;
        e.x += e.drift * dt;
        if (e.x < ROAD_L + e.w / 2) { e.x = ROAD_L + e.w / 2; e.drift = Math.abs(e.drift); }
        if (e.x > ROAD_R - e.w / 2) { e.x = ROAD_R - e.w / 2; e.drift = -Math.abs(e.drift); }
        /* 激光打沉 */
        if (G.laser > 0 && e.y + e.h / 2 > py() - 240 && Math.abs(e.x - G.px) < e.w / 2 + 26) {
          boom(e.x, e.y, 0.9);
          G.score += 5; updateHud();
          G.enemies.splice(i, 1);
          continue;
        }
        if (e.y > view.dh + 140) { G.enemies.splice(i, 1); continue; }
        if (hitPlayer(e.x, e.y, e.w * 0.42, e.h * 0.42)) { die(e.x, e.y); return; }
      }

      /* 道具 */
      for (let i = G.items.length - 1; i >= 0; i--) {
        const it = G.items[i];
        it.y += BASE_SPEED * G.timeScale * dt * 0.85;
        if (it.y > view.dh + 80) { G.items.splice(i, 1); continue; }
        const dx = it.x - G.px, dy = it.y - py();
        if (dx * dx + dy * dy < (it.r + SUBB * 0.34) * (it.r + SUBB * 0.34)) {
          if (it.kind === 'laser') { G.laser = LASER_TIME; Sound.pickLaser(); boom(it.x, it.y, 0.4); }
          else {
            G.timeScale = Math.max(1, G.timeScale - 1);
            updateHud(); Sound.pickTimer(); boom(it.x, it.y, 0.4);
          }
          G.score += 2; updateHud();
          G.items.splice(i, 1);
        }
      }

      /* 拖拽跟随（源码：光标位移等量加到潜艇上） */
      if (G.dragging) G.px += (G.dragCurX - G.dragStartX);
      G.px = Math.max(ROAD_L + SUBB * 0.45, Math.min(ROAD_R - SUBB * 0.45, G.px));
      G.dragStartX = G.dragCurX;

      /* 潜艇尾部气泡 */
      G.bubblesT -= dt;
      if (G.bubblesT <= 0) {
        G.bubblesT = 0.06;
        G.fx.push({ x: G.px + (Math.random() - 0.5) * 30, y: py() + 46, vx: (Math.random() - 0.5) * 30, vy: 90 + Math.random() * 60, r: 3 + Math.random() * 4, t: 0, life: 0.9 });
      }
    }

    if (G.shake > 0) G.shake = Math.max(0, G.shake - dt * 2.2);
    if (G.flash > 0) G.flash = Math.max(0, G.flash - dt * 2.6);

    for (let i = 0; i < G.fx.length; i++) {
      const f = G.fx[i];
      f.t += dt;
      f.x += f.vx * dt; f.y += f.vy * dt;
      if (f.t >= f.life) f.dead = true;
    }
    if (G.fx.some(f => f.dead)) G.fx = G.fx.filter(f => !f.dead);

    for (let i = 0; i < G.boomFx.length; i++) G.boomFx[i].t += dt;
    if (G.boomFx.some(b => b.t >= b.life)) G.boomFx = G.boomFx.filter(b => b.t < b.life);
  }

  const py = () => view.dh * (1 - PLAYER_Y);

  function hitPlayer(ex, ey, ew, eh) {
    const px = G.px, pyy = py();
    const r = SUBB * 0.36;
    const nx = Math.max(ex - ew, Math.min(px, ex + ew));
    const ny = Math.max(ey - eh, Math.min(pyy, ey + eh));
    const dx = px - nx, dy = pyy - ny;
    return dx * dx + dy * dy < r * r;
  }

  function boom(x, y, scale) {
    G.boomFx.push({ x: x, y: y, t: 0, life: 0.55, scale: scale || 1 });
    for (let i = 0; i < 14; i++) {
      const a = Math.random() * Math.PI * 2, sp = 60 + Math.random() * 220;
      G.fx.push({ x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, r: 2 + Math.random() * 5, t: 0, life: 0.4 + Math.random() * 0.5 });
    }
  }

  function die(x, y) {
    G.state = 'over';
    G.shake = 1; G.flash = 1;
    Sound.hitObs();
    boom(x, y, 1.6);
    boom(G.px, py(), 1.4);
    G.best = Math.max(G.best, G.score);
    try { localStorage.setItem('qianshui.best', String(G.best)); } catch (e) {}
    $('finalScore').textContent = G.score;
    $('finalBest').textContent = G.best;
    updateHud();
    overEl.hidden = false;
  }

  /* ---------------- 绘制 ---------------- */
  function drawWall(scroll) {
    const img = IMG.wall;
    if (!img.complete || !img.naturalWidth) return;
    const scale = WALL_W / img.naturalWidth;                 // 384 -> 168
    const th = img.naturalHeight * scale;                    // 2880 -> 1260
    let y = -(scroll % th);
    for (; y < view.dh; y += th) {
      /* 右侧壁 */
      ctx.drawImage(img, 0, 0, img.naturalWidth, img.naturalHeight, ROAD_R, y, WALL_W, th);
      /* 左侧壁：镜像 */
      ctx.save();
      ctx.translate(ROAD_L, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(img, 0, 0, img.naturalWidth, img.naturalHeight, 0, y, WALL_W, th);
      ctx.restore();
    }
  }

  function render() {
    const g = ctx, vw = view.vw, vh = view.vh, dh = view.dh, dpr = view.dpr;
    const sx = G.shake > 0 ? (Math.random() - 0.5) * G.shake * 10 : 0;
    const sy2 = G.shake > 0 ? (Math.random() - 0.5) * G.shake * 10 : 0;

    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = '#04211f';
    g.fillRect(0, 0, vw, vh);

    g.setTransform(view.s * dpr, 0, 0, view.s * dpr, ((vw - DW * view.s) / 2 + sx) * dpr, sy2 * dpr);

    /* 背景（原图是竖向渐变，拉伸铺满） */
    if (IMG.bg.complete && IMG.bg.naturalWidth) {
      g.drawImage(IMG.bg, 0, 0, IMG.bg.naturalWidth, IMG.bg.naturalHeight, 0, 0, DW, dh);
    } else {
      const grd = g.createLinearGradient(0, 0, 0, dh);
      grd.addColorStop(0, '#0a4f4c'); grd.addColorStop(1, '#04211f');
      g.fillStyle = grd; g.fillRect(0, 0, DW, dh);
    }

    /* 背景气泡 */
    g.save();
    for (let i = 0; i < G.bubbles.length; i++) {
      const b = G.bubbles[i];
      g.globalAlpha = 0.16;
      g.beginPath(); g.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      g.fillStyle = '#bffcf4'; g.fill();
    }
    g.restore();

    drawWall(G.dist * 0.6);

    /* 道具 */
    for (let i = 0; i < G.items.length; i++) {
      const it = G.items[i];
      const img = it.kind === 'laser' ? IMG.laser : IMG.timer;
      const hl = IMG.hilite;
      g.save();
      g.globalAlpha = 0.5 + Math.sin(G.t * 4 + it.ph) * 0.18;
      if (hl.complete) g.drawImage(hl, it.x - 58, it.y - 58, 116, 116);
      g.restore();
      if (img.complete) g.drawImage(img, it.x - it.r, it.y - it.r, it.r * 2, it.r * 2);
    }

    /* 敌舰 */
    for (let i = 0; i < G.enemies.length; i++) {
      const e = G.enemies[i];
      if (IMG.enemy.complete) g.drawImage(IMG.enemy, e.x - e.w / 2, e.y - e.h / 2, e.w, e.h);
    }

    /* 激光束 */
    if (G.laser > 0) {
      const w = 34, x = G.px, yTop = py() - 240;
      g.save();
      g.globalAlpha = 0.55 + Math.sin(G.t * 22) * 0.2;
      if (IMG.beam.complete) g.drawImage(IMG.beam, 0, 0, IMG.beam.naturalWidth, IMG.beam.naturalHeight, x - w / 2, yTop, w, py() - yTop);
      else { g.fillStyle = '#8ef0e2'; g.fillRect(x - w / 2, yTop, w, py() - yTop); }
      g.globalAlpha = 1;
      g.fillStyle = 'rgba(180,255,246,.5)';
      g.beginPath(); g.arc(x, yTop, 18 + Math.sin(G.t * 18) * 4, 0, Math.PI * 2); g.fill();
      g.restore();
    }

    /* 潜艇光晕 */
    if (IMG.light.complete) {
      g.save();
      g.globalAlpha = 0.5;
      g.drawImage(IMG.light, G.px - 130, py() - 104, 260, 208);
      g.restore();
    }

    /* 传送门（双指） */
    if (G.portal) {
      const img = IMG.portal;
      const pulse = 1 + Math.sin(G.t * 8) * 0.06;
      [[G.portal.src, 0.55], [G.portal.dst, 0.85]].forEach(function (pp) {
        const s = 150 * pulse * pp[1];
        g.save();
        g.globalAlpha = pp[1] > 0.7 ? 0.9 : 0.45;
        if (img.complete) g.drawImage(img, pp[0] - s / 2, py() - s / 2, s, s);
        else {
          g.strokeStyle = '#8ef0e2'; g.lineWidth = 4;
          g.beginPath(); g.arc(pp[0], py(), s / 2, 0, Math.PI * 2); g.stroke();
        }
        g.restore();
      });
    }

    /* 玩家潜艇 */
    g.save();
    if (G.state === 'over') g.globalAlpha = 0.25;
    if (IMG.player.complete) {
      const s = SUBB * (1 + Math.sin(G.t * 3) * 0.015);
      g.drawImage(IMG.player, G.px - s / 2, py() - s / 2, s, s);
    }
    g.restore();

    /* 粒子 */
    for (let i = 0; i < G.fx.length; i++) {
      const f = G.fx[i];
      g.save();
      g.globalAlpha = Math.max(0, 1 - f.t / f.life) * 0.8;
      if (IMG.bubble.complete && f.r > 3) {
        g.drawImage(IMG.bubble, f.x - f.r * 2, f.y - f.r * 2, f.r * 4, f.r * 4);
      } else {
        g.fillStyle = '#bffcf4';
        g.beginPath(); g.arc(f.x, f.y, f.r, 0, Math.PI * 2); g.fill();
      }
      g.restore();
    }

    /* 爆炸序列帧 */
    for (let i = 0; i < G.boomFx.length; i++) {
      const b = G.boomFx[i];
      const idx = Math.min(7, Math.floor(b.t / b.life * 8));
      const im = BOOM[idx];
      if (im && im.complete) {
        const s = 190 * b.scale;
        g.save();
        g.globalAlpha = Math.max(0, 1 - b.t / b.life * 0.6);
        g.drawImage(im, b.x - s / 2, b.y - s / 2, s, s);
        g.restore();
      }
    }

    if (G.flash > 0) {
      g.fillStyle = 'rgba(255,255,255,' + (G.flash * 0.4) + ')';
      g.fillRect(-40, -40, DW + 80, dh + 80);
    }

    /* 开局提示 */
    if (G.state === 'play' && G.t < 3) {
      g.save();
      g.globalAlpha = Math.max(0, Math.min(1, 3 - G.t));
      g.fillStyle = 'rgba(230,255,251,.92)';
      g.font = '800 26px ' + FONT;
      g.textAlign = 'center';
      g.fillText('按住潜艇左右拖动', DW / 2, dh * 0.42);
      g.restore();
    }
  }

  /* ---------------- 布局 ---------------- */
  function layout() {
    const rect = stageEl.getBoundingClientRect();
    const vw = Math.max(240, rect.width || window.innerWidth);
    const vh = Math.max(280, rect.height || window.innerHeight);
    const dpr = Math.min(2.5, window.devicePixelRatio || 1);
    view.vw = vw; view.vh = vh; view.dpr = dpr;
    view.s = Math.max(0.32, Math.min(vw / DW, vh / 950));
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
    return { x: (ev.clientX - rect.left - (rect.width - DW * s) / 2) / s, y: (ev.clientY - rect.top) / s };
  }

  /* 触点是多指时打开传送门（源码 PlayerLogic 的双指 Portal） */
  const pointers = {};
  let firstId = null, secondId = null;

  stageEl.addEventListener('pointerdown', function (ev) {
    if (ev.target.closest && ev.target.closest('.overlay')) return;
    ev.preventDefault();
    Sound.unlock();
    const p = toDesign(ev);
    const ids = Object.keys(pointers);
    if (ids.length === 0) {
      firstId = ev.pointerId;
      pointers[ev.pointerId] = p.x;
      G.dragging = true;
      G.dragStartX = p.x; G.dragCurX = p.x;
      /* 点哪边就往哪边走一点，手感更直接 */
      if (Math.abs(p.x - G.px) > 8) G.px += Math.max(-90, Math.min(90, (p.x - G.px) * 0.5));
    } else if (ids.length === 1) {
      secondId = ev.pointerId;
      pointers[ev.pointerId] = p.x;
      G.dragging = false;
      G.portal = { src: G.px, dst: p.x, t: 0 };
      Sound.beep(660, 0.16, 'sine', 0.13);
    }
  });

  window.addEventListener('pointermove', function (ev) {
    if (!(ev.pointerId in pointers)) return;
    const x = toDesign(ev).x;
    pointers[ev.pointerId] = x;
    if (G.portal && ev.pointerId === secondId) {
      G.portal.dst = Math.max(ROAD_L + SUBB * 0.45, Math.min(ROAD_R - SUBB * 0.45, x));
    } else if (G.dragging) {
      G.dragCurX = x;
    }
  });

  function releasePointer(ev) {
    if (!(ev.pointerId in pointers)) return;
    delete pointers[ev.pointerId];
    if (G.portal && ev.pointerId === secondId) {
      /* 松手瞬移 */
      G.px = G.portal.dst;
      boom(G.px, py(), 0.6);
      G.flash = Math.max(G.flash, 0.6);
      Sound.beep(880, 0.22, 'triangle', 0.15);
      G.portal = null;
      secondId = null;
      G.dragging = Object.keys(pointers).length > 0;
      if (Object.keys(pointers).length) { G.dragStartX = G.dragCurX = pointers[Object.keys(pointers)[0]]; }
    }
    if (Object.keys(pointers).length === 0) { G.dragging = false; firstId = null; }
  }
  window.addEventListener('pointerup', releasePointer);
  window.addEventListener('pointercancel', releasePointer);
  stageEl.addEventListener('contextmenu', e => e.preventDefault());

  document.addEventListener('keydown', function (ev) {
    if (ev.key === 'ArrowLeft' || ev.key === 'a') { G.px -= 26; ev.preventDefault(); }
    else if (ev.key === 'ArrowRight' || ev.key === 'd') { G.px += 26; ev.preventDefault(); }
    else if (ev.key === 'r' || ev.key === 'R') reset();
  });

  $('btnSound').addEventListener('click', function () { Sound.unlock(); Sound.setOn(!Sound.on); });
  $('btnRestart').addEventListener('click', function () { Sound.unlock(); reset(); });
  $('btnAgain').addEventListener('click', function () { Sound.unlock(); reset(); });

  let rt = 0;
  function relayout() { clearTimeout(rt); rt = setTimeout(layout, 110); }
  window.addEventListener('resize', relayout);
  window.addEventListener('orientationchange', function () { setTimeout(layout, 240); });
  window.addEventListener('load', function () { layout(); setTimeout(layout, 200); });
  if (window.ResizeObserver) new ResizeObserver(relayout).observe(stageEl);
  document.addEventListener('visibilitychange', function () { last = 0; if (document.hidden) Sound.pauseBgm(); else Sound.playBgm(); });

  /* ---------------- 启动 ---------------- */
  Sound.init();
  try { G.best = parseInt(localStorage.getItem('qianshui.best') || '0', 10) || 0; } catch (e) { G.best = 0; }
  layout();
  reset();
  requestAnimationFrame(frame);

  /* 调试钩子 */
  window.QianShui = {
    get state() { return G.state; },
    get score() { return G.score; },
    get px() { return G.px; },
    get timeScale() { return G.timeScale; },
    get enemies() { return G.enemies; },
    get items() { return G.items; },
    get laser() { return G.laser; },
    view, reset,
    setX(x) { G.px = x; },
    playerY() { return py(); },
    spawnEnemy, spawnItem,
    tick(n, dt) { for (let i = 0; i < (n || 1); i++) update(dt || 1 / 120); },
    render
  };
})();
