/* =========================================================
 *  节奏音符 · 双轨音游
 *  谱面与音频都来自 xyx/音乐游戏 cocos：
 *  - resources/preload/json/Audio_00x.json（BPM / Tracks / Notes: Val, StartTime, EndTime）
 *  - 两条轨道对应谱面的两个 Track，Val 前缀决定音符颜色
 *  - 判定分级用原工程 Grade.json 的距离档（20/30/45/60 → 30/20/10/5 分）
 * ========================================================= */
(function () {
  'use strict';

  const SONGS = [
    { id: 0, name: '第一幕', chart: 'assets/chart-001.json', audio: 'assets/Audio_001.mp3' },
    { id: 1, name: '第二幕', chart: 'assets/chart-002.json', audio: 'assets/Audio_002.mp3' }
  ];
  /* 原工程 Grade.json：越准分越高 */
  const GRADE_TABLE = [
    { dis: 20, score: 30, label: '完美' },
    { dis: 30, score: 20, label: '很好' },
    { dis: 45, score: 10, label: '不错' },
    { dis: 60, score: 5,  label: '一般' }
  ];
  const FONT = '"PingFang SC","Microsoft YaHei",system-ui,sans-serif';
  const LANE_COL = ['#4ec3f0', '#ff6bb5'];      // 左轨 / 右轨
  const LANE_DARK = ['#1d4a63', '#5e2647'];
  const APPROACH = 2.0;                          // 音符提前 2 秒出现
  const LINE_Y = 0.78;                           // 判定线位置（占屏高）

  const $ = id => document.getElementById(id);
  const stageEl = $('stage'), cv = $('game');
  const ctx = cv.getContext('2d');
  const startEl = $('start'), overEl = $('over');
  const view = { s: 1, vw: 0, vh: 0, dpr: 1 };

  /* ---------------- 音效 ---------------- */
  const Sound = {
    ac: null, on: true, started: false,
    init() { try { this.on = localStorage.getItem('yinyue.sound') !== '0'; } catch (e) {} this.sync(); },
    unlock() {
      if (!this.started) {
        this.started = true;
        try { const AC = window.AudioContext || window.webkitAudioContext; if (AC) this.ac = new AC(); } catch (e) {}
      }
      if (this.ac && this.ac.state === 'suspended') this.ac.resume();
    },
    beep(f, dur, type, g) {
      if (!this.on || !this.ac) return;
      const t0 = this.ac.currentTime;
      const o = this.ac.createOscillator(), gn = this.ac.createGain();
      o.type = type || 'triangle'; o.frequency.setValueAtTime(f, t0);
      gn.gain.setValueAtTime(0, t0);
      gn.gain.linearRampToValueAtTime(g == null ? 0.1 : g, t0 + 0.008);
      gn.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(gn); gn.connect(this.ac.destination);
      o.start(t0); o.stop(t0 + dur + 0.02);
    },
    hit() { this.beep(880, 0.07, 'triangle', 0.07); },
    miss() { this.beep(180, 0.16, 'sawtooth', 0.09); },
    end() { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => this.beep(f, 0.28, 'triangle', 0.1), i * 110)); },
    setOn(v) { this.on = v; try { localStorage.setItem('yinyue.sound', v ? '1' : '0'); } catch (e) {} this.sync(); },
    sync() { const b = $('btnSound'); b.textContent = this.on ? '🔊' : '🔇'; b.style.opacity = this.on ? '1' : '0.5'; }
  };

  /* ---------------- 状态 ---------------- */
  const G = {
    state: 'menu',        // menu | ready | play | over
    song: 0,
    notes: [],            // {lane, t(ms), end(ms), done, holding, judged}
    audio: null,
    t0: 0, now: 0,        // 判定用的毫秒
    score: 0, combo: 0, maxCombo: 0,
    hits: 0, total: 0, scoreSum: 0, scoreMax: 0,
    keyL: false, keyR: false,
    effects: [],          // 判定飘字
    laneFlash: [0, 0],
    hp: 100,
    countdown: 0,
    chartName: ''
  };

  /* ---------------- 谱面 ---------------- */
  function loadChart(idx, cb) {
    fetch(SONGS[idx].chart).then(r => r.json()).then(function (json) {
      const notes = [];
      const tracks = json.Tracks || [];
      tracks.forEach(function (tr, li) {
        const lane = Math.min(1, li);
        (tr.Notes || []).forEach(function (n) {
          const color = (n.Val || '').charAt(0) === 'A' ? 0 : 1;
          notes.push({
            lane: lane, color: color,
            t: n.StartTime, end: n.EndTime > n.StartTime ? n.EndTime : n.StartTime,
            done: false, holding: false, holdMiss: false, headJudged: false
          });
        });
      });
      notes.sort((a, b) => a.t - b.t);
      G.notes = notes;
      G.chartName = json.Name || '';
      cb(notes);
    }).catch(function () { cb(null); });
  }

  function startSong(idx) {
    G.song = idx;
    G.state = 'ready';
    startEl.hidden = true;
    overEl.hidden = true;
    G.score = 0; G.combo = 0; G.maxCombo = 0; G.hits = 0; G.total = 0;
    G.scoreSum = 0; G.scoreMax = 0; G.hp = 100;
    G.effects = []; G.keyL = false; G.keyR = false;
    updateHud();
    loadChart(idx, function (notes) {
      if (!notes || !notes.length) { $('hintline').textContent = '谱面加载失败'; G.state = 'menu'; startEl.hidden = false; return; }
      G.total = notes.length;
      G.scoreMax = notes.length * GRADE_TABLE[0].score;
      const a = new Audio(SONGS[idx].audio);
      a.preload = 'auto';
      a.volume = 0.85;
      if (!Sound.on) a.muted = true;
      G.audio = a;
      const go = function () {
        if (G.state === 'play') return;
        G.state = 'play';
        G.t0 = performance.now() + 1200;      // 留一点准备时间
        G.countdown = 1.2;
        const p = a.play();
        if (p && p.catch) p.catch(function () {});
      };
      if (a.readyState >= 3) go();
      else { a.addEventListener('canplay', go, { once: true }); a.load(); }
      /* 音频万一加载不出来也别卡住，2.5 秒后直接开始 */
      setTimeout(function () { if (G.state === 'ready') go(); }, 2500);
    });
  }

  function nowMs() { return performance.now() - G.t0; }

  function updateHud() {
    $('score').textContent = G.score;
    $('combo').textContent = G.combo;
    const acc = G.hits ? Math.round(G.scoreSum / G.scoreMax * 100) : 100;
    $('acc').textContent = Math.min(100, acc) + '%';
  }

  /* ---------------- 判定 ---------------- */
  function judge(offset) {
    const a = Math.abs(offset);
    for (let i = 0; i < GRADE_TABLE.length; i++) if (a <= GRADE_TABLE[i].dis) return GRADE_TABLE[i];
    return null;
  }

  function hitNote(n, lane, t) {
    const g = judge(t - n.t);
    if (!g) return false;
    n.headJudged = true;
    if (n.end > n.t + 60) { n.holding = true; }     // 长音：按住
    else n.done = true;
    G.score += g.score;
    G.scoreSum += g.score;
    G.hits++;
    G.combo++;
    if (G.combo > G.maxCombo) G.maxCombo = G.combo;
    G.hp = Math.min(100, G.hp + 1);
    G.effects.push({ lane: lane, txt: g.label, t: 0, life: 0.5, color: g.score >= 20 ? '#ffe86b' : '#9fe6ff' });
    G.laneFlash[lane] = 1;
    Sound.hit();
    updateHud();
    return true;
  }

  function missNote(n, lane, txt) {
    n.done = true; n.holding = false;
    G.combo = 0;
    G.hp -= 5;
    G.effects.push({ lane: lane, txt: txt || '错过', t: 0, life: 0.5, color: '#ff6b6b' });
    Sound.miss();
    updateHud();
  }

  function pressLane(lane) {
    if (G.state !== 'play') return;
    const t = nowMs();
    /* 找这条轨道上最近的未判定音符 */
    let best = null, bestD = 1e9;
    for (let i = 0; i < G.notes.length; i++) {
      const n = G.notes[i];
      if (n.lane !== lane || n.done || n.headJudged) continue;
      const d = Math.abs(n.t - t);
      if (d < bestD) { bestD = d; best = n; }
    }
    if (best && bestD <= GRADE_TABLE[GRADE_TABLE.length - 1].dis) hitNote(best, lane, t);
    else {
      G.laneFlash[lane] = 1;
      Sound.beep(300, 0.06, 'sine', 0.05);
    }
  }

  function releaseLane(lane) {
    if (G.state !== 'play') return;
    const t = nowMs();
    for (let i = 0; i < G.notes.length; i++) {
      const n = G.notes[i];
      if (n.lane !== lane || !n.holding) continue;
      if (t < n.end - 90) {                     // 提前松手 = 断
        n.holding = false; n.done = true;
        missNote(n, lane, '松早了');
      } else {
        n.holding = false; n.done = true;
        G.score += 5; G.scoreSum += GRADE_TABLE[0].score; G.hits++;
        G.combo++; if (G.combo > G.maxCombo) G.maxCombo = G.combo;
        G.effects.push({ lane: lane, txt: '完成', t: 0, life: 0.45, color: '#9fe6ff' });
        updateHud();
      }
    }
  }

  /* ---------------- 更新 ---------------- */
  function update(dt) {
    if (G.state === 'play') {
      const t = nowMs();
      for (let i = 0; i < G.notes.length; i++) {
        const n = G.notes[i];
        if (n.done) continue;
        if (!n.headJudged && t > n.t + GRADE_TABLE[GRADE_TABLE.length - 1].dis) {
          missNote(n, n.lane);
          continue;
        }
        /* 长音：按着没松手，到尾巴就完成 */
        if (n.holding && t >= n.end) {
          n.holding = false; n.done = true;
          G.score += 5; G.scoreSum += GRADE_TABLE[0].score; G.hits++;
          G.effects.push({ lane: n.lane, txt: '完成', t: 0, life: 0.45, color: '#9fe6ff' });
          updateHud();
        }
      }
      /* 结束判定 */
      const last = G.notes.length ? G.notes[G.notes.length - 1].end : 0;
      if (t > last + 1500) finish();
      G.hp = Math.min(100, G.hp + dt * 1.5);
      if (G.hp <= 0) finish();
    }
    for (let i = 0; i < G.effects.length; i++) G.effects[i].t += dt;
    if (G.effects.some(e => e.t >= e.life)) G.effects = G.effects.filter(e => e.t < e.life);
    if (G.laneFlash[0] > 0) G.laneFlash[0] = Math.max(0, G.laneFlash[0] - dt * 3);
    if (G.laneFlash[1] > 0) G.laneFlash[1] = Math.max(0, G.laneFlash[1] - dt * 3);
    if (G.countdown > 0) G.countdown = Math.max(0, G.countdown - dt);
  }

  function finish() {
    G.state = 'over';
    if (G.audio) { try { G.audio.pause(); } catch (e) {} }
    Sound.end();
    const acc = G.scoreMax ? Math.min(100, Math.round(G.scoreSum / G.scoreMax * 100)) : 0;
    let grade = 'D';
    if (acc >= 95 && G.combo >= G.total * 0.5) grade = 'S';
    else if (acc >= 90) grade = 'A';
    else if (acc >= 78) grade = 'B';
    else if (acc >= 60) grade = 'C';
    $('grade').textContent = grade;
    $('grade').style.color = grade === 'S' ? '#ffe86b' : (grade === 'A' ? '#9fe6ff' : (grade === 'B' ? '#8ef0c0' : '#ffb0a0'));
    $('finalScore').textContent = G.score;
    $('finalCombo').textContent = G.maxCombo;
    $('finalAcc').textContent = acc + '%';
    try {
      const key = 'yinyue.best.' + G.song;
      const prev = parseInt(localStorage.getItem(key) || '0', 10) || 0;
      if (G.score > prev) localStorage.setItem(key, String(G.score));
    } catch (e) {}
    refreshBest();
    overEl.hidden = false;
  }

  function refreshBest() {
    try {
      const a = parseInt(localStorage.getItem('yinyue.best.0') || '0', 10) || 0;
      const b = parseInt(localStorage.getItem('yinyue.best.1') || '0', 10) || 0;
      $('bestLine').textContent = '历史最佳：第一幕 ' + a + ' · 第二幕 ' + b;
    } catch (e) {}
  }

  /* ---------------- 绘制 ---------------- */
  function laneGeom() {
    const vw = view.vw, vh = view.vh;
    const laneW = Math.min(vw * 0.34, vh * 0.28);
    const gap = Math.min(14, vw * 0.02);
    const total = laneW * 2 + gap;
    const x0 = (vw - total) / 2;
    return { x0: x0, laneW: laneW, gap: gap, total: total, lineY: vh * LINE_Y, top: 0 };
  }

  function render() {
    const g = ctx, vw = view.vw, vh = view.vh, dpr = view.dpr;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = '#05070f';
    g.fillRect(0, 0, vw, vh);

    const geo = laneGeom();
    const t = G.state === 'play' ? nowMs() : 0;

    /* 背景流动线 */
    g.save();
    g.globalAlpha = 0.5;
    for (let i = 0; i < 24; i++) {
      const y = ((G.state === 'play' ? (t * 0.12) : performance.now() * 0.06) + i * vh / 12) % vh;
      g.strokeStyle = 'rgba(90,160,220,.06)';
      g.lineWidth = 1;
      g.beginPath(); g.moveTo(0, y); g.lineTo(vw, y); g.stroke();
    }
    g.restore();

    /* 两条轨道 */
    for (let l = 0; l < 2; l++) {
      const x = geo.x0 + l * (geo.laneW + geo.gap);
      const grd = g.createLinearGradient(0, 0, 0, vh);
      grd.addColorStop(0, 'rgba(255,255,255,.02)');
      grd.addColorStop(1, LANE_DARK[l]);
      g.fillStyle = grd;
      g.fillRect(x, 0, geo.laneW, vh);
      g.strokeStyle = 'rgba(150,220,255,.18)';
      g.lineWidth = 2;
      g.strokeRect(x + 1, -2, geo.laneW - 2, vh + 4);
      /* 按下时轨道发光 */
      if (G.laneFlash[l] > 0) {
        g.save();
        g.globalAlpha = G.laneFlash[l] * 0.35;
        g.fillStyle = LANE_COL[l];
        g.fillRect(x, 0, geo.laneW, vh);
        g.restore();
      }
    }

    /* 判定线 */
    g.save();
    g.strokeStyle = 'rgba(200,240,255,.85)';
    g.lineWidth = 3;
    g.shadowColor = 'rgba(140,220,255,.9)';
    g.shadowBlur = 16;
    g.beginPath(); g.moveTo(geo.x0 - 10, geo.lineY); g.lineTo(geo.x0 + geo.total + 10, geo.lineY); g.stroke();
    g.restore();

    /* 音符 */
    const travel = geo.lineY;                        // 从上落到判定线的距离
    const noteH = Math.max(18, vh * 0.032);
    for (let i = 0; i < G.notes.length; i++) {
      const n = G.notes[i];
      if (n.done) continue;
      const dt2 = (n.t - t) / 1000;
      if (dt2 > APPROACH) continue;
      const dtEnd = (n.end - t) / 1000;
      if (dtEnd < -0.4) continue;
      const x = geo.x0 + n.lane * (geo.laneW + geo.gap);
      const y = geo.lineY - dt2 / APPROACH * travel;
      const yEnd = geo.lineY - dtEnd / APPROACH * travel;
      const col = LANE_COL[n.lane];
      g.save();
      g.shadowColor = col; g.shadowBlur = 14;
      g.fillStyle = n.headJudged ? 'rgba(255,255,255,.85)' : col;
      if (n.end > n.t + 60) {
        const yTop = Math.max(0, Math.min(y, yEnd));
        const hh = Math.abs(yEnd - y) + noteH;
        roundRect(g, x + 6, yTop, geo.laneW - 12, hh, noteH / 2);
        g.fill();
      } else {
        roundRect(g, x + 6, y - noteH / 2, geo.laneW - 12, noteH, noteH / 2);
        g.fill();
      }
      g.restore();
    }

    /* 判定飘字 */
    for (let i = 0; i < G.effects.length; i++) {
      const e = G.effects[i];
      const k = e.t / e.life;
      const x = geo.x0 + e.lane * (geo.laneW + geo.gap) + geo.laneW / 2;
      g.save();
      g.globalAlpha = Math.max(0, 1 - k);
      g.fillStyle = e.color;
      g.font = '800 ' + (16 + vh * 0.008) + 'px ' + FONT;
      g.textAlign = 'center';
      g.fillText(e.txt, x, geo.lineY - 26 - k * 26);
      g.restore();
    }

    /* 连击 */
    if (G.combo >= 3 && G.state === 'play') {
      g.save();
      g.globalAlpha = 0.9;
      g.fillStyle = '#ffffff';
      g.font = '900 ' + (vh * 0.07) + 'px ' + FONT;
      g.textAlign = 'center';
      g.fillText(G.combo, vw / 2, vh * 0.3);
      g.font = '700 ' + (vh * 0.02) + 'px ' + FONT;
      g.fillStyle = 'rgba(180,230,255,.8)';
      g.fillText('COMBO', vw / 2, vh * 0.3 + vh * 0.035);
      g.restore();
    }

    /* 血条 */
    if (G.state === 'play') {
      g.save();
      g.fillStyle = 'rgba(255,255,255,.12)';
      g.fillRect(geo.x0, vh - 16, geo.total, 6);
      g.fillStyle = G.hp > 40 ? '#7fe6c0' : '#ff7a6b';
      g.fillRect(geo.x0, vh - 16, geo.total * Math.max(0, G.hp) / 100, 6);
      g.restore();
    }

    /* 开场倒计时 */
    if (G.state === 'ready') {
      g.save();
      g.fillStyle = 'rgba(233,244,255,.9)';
      g.font = '800 ' + (vh * 0.04) + 'px ' + FONT;
      g.textAlign = 'center';
      g.fillText('准备…', vw / 2, vh * 0.5);
      g.restore();
    }
    if (G.state === 'play' && G.countdown > 0) {
      g.save();
      g.fillStyle = 'rgba(233,244,255,.9)';
      g.font = '900 ' + (vh * 0.09) + 'px ' + FONT;
      g.textAlign = 'center';
      g.fillText(Math.ceil(G.countdown), vw / 2, vh * 0.45);
      g.restore();
    }

    /* 左右按键提示 */
    if (G.state === 'play') {
      g.save();
      g.font = '700 ' + (vh * 0.02) + 'px ' + FONT;
      g.textAlign = 'center';
      g.fillStyle = 'rgba(120,190,240,.5)';
      g.fillText('左', geo.x0 + geo.laneW / 2, vh - 26);
      g.fillText('右', geo.x0 + geo.laneW + geo.gap + geo.laneW / 2, vh - 26);
      g.restore();
    }
  }

  function roundRect(g, x, y, w, h, r) {
    r = Math.min(r, w / 2, Math.abs(h) / 2);
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }

  /* ---------------- 布局 / 循环 ---------------- */
  function layout() {
    const rect = stageEl.getBoundingClientRect();
    const vw = Math.max(220, rect.width || window.innerWidth);
    const vh = Math.max(260, rect.height || window.innerHeight);
    const dpr = Math.min(2.5, window.devicePixelRatio || 1);
    view.vw = vw; view.vh = vh; view.dpr = dpr;
    view.s = 1;
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
  function laneAt(ev) {
    const rect = cv.getBoundingClientRect();
    const x = ev.clientX - rect.left;
    const geo = laneGeom();
    const mid = geo.x0 + geo.laneW + geo.gap / 2;
    if (x < geo.x0 - 40) return 0;
    if (x > geo.x0 + geo.total + 40) return 1;
    return x < mid ? 0 : 1;
  }

  stageEl.addEventListener('pointerdown', function (ev) {
    if (ev.target.closest && ev.target.closest('.overlay')) return;
    ev.preventDefault();
    Sound.unlock();
    const l = laneAt(ev);
    G.laneFlash[l] = 1;
    pressLane(l);
    stageEl.setPointerCapture && stageEl.setPointerCapture(ev.pointerId);
  });
  window.addEventListener('pointerup', function (ev) {
    if (G.state !== 'play') return;
    releaseLane(0); releaseLane(1);
  });
  stageEl.addEventListener('contextmenu', e => e.preventDefault());

  document.addEventListener('keydown', function (ev) {
    if (ev.repeat) return;
    const k = ev.key.toLowerCase();
    if (k === 'a' || ev.key === 'ArrowLeft') { ev.preventDefault(); Sound.unlock(); if (!G.keyL) { G.keyL = true; G.laneFlash[0] = 1; pressLane(0); } }
    if (k === 'd' || ev.key === 'ArrowRight') { ev.preventDefault(); Sound.unlock(); if (!G.keyR) { G.keyR = true; G.laneFlash[1] = 1; pressLane(1); } }
  });
  document.addEventListener('keyup', function (ev) {
    const k = ev.key.toLowerCase();
    if (k === 'a' || ev.key === 'ArrowLeft') { G.keyL = false; releaseLane(0); }
    if (k === 'd' || ev.key === 'ArrowRight') { G.keyR = false; releaseLane(1); }
  });

  Array.prototype.forEach.call(document.querySelectorAll('[data-level]'), function (b) {
    b.addEventListener('click', function () { Sound.unlock(); startSong(parseInt(b.dataset.level, 10)); });
  });
  $('btnSound').addEventListener('click', function () {
    Sound.unlock();
    Sound.setOn(!Sound.on);
    if (G.audio) G.audio.muted = !Sound.on;
  });
  $('btnRestart').addEventListener('click', function () { Sound.unlock(); startSong(G.song); });
  $('btnAgain').addEventListener('click', function () { Sound.unlock(); startSong(G.song); });
  $('btnBack').addEventListener('click', function () {
    if (G.audio) { try { G.audio.pause(); } catch (e) {} }
    G.state = 'menu';
    overEl.hidden = true;
    startEl.hidden = false;
  });

  let rt = 0;
  function relayout() { clearTimeout(rt); rt = setTimeout(layout, 100); }
  window.addEventListener('resize', relayout);
  window.addEventListener('orientationchange', function () { setTimeout(layout, 240); });
  window.addEventListener('load', function () { layout(); setTimeout(layout, 180); });
  if (window.ResizeObserver) new ResizeObserver(relayout).observe(stageEl);

  /* ---------------- 启动 ---------------- */
  Sound.init();
  layout();
  refreshBest();
  requestAnimationFrame(frame);

  /* 调试钩子 */
  window.YinYue = {
    get state() { return G.state; },
    get score() { return G.score; },
    get combo() { return G.combo; },
    get maxCombo() { return G.maxCombo; },
    get hits() { return G.hits; },
    get total() { return G.total; },
    get notes() { return G.notes; },
    get hp() { return G.hp; },
    view, startSong, layout,
    /* 测试：跳过音频，直接按谱面自动打 */
    autoPlaySetup(chartNotes) {
      G.state = 'play';
      G.t0 = performance.now() + 200;
      G.total = chartNotes.length;
      G.scoreMax = chartNotes.length * GRADE_TABLE[0].score;
    },
    fakeNow(delta) { G.t0 -= delta; },
    now() { return nowMs(); },
    startPlayNow() {
      G.state = 'play';
      G.t0 = performance.now() + 200;
      G.countdown = 0.2;
    },
    pressLane, releaseLane,
    tick(n, dt) { for (let i = 0; i < (n || 1); i++) update(dt || 1 / 60); },
    render
  };
})();
