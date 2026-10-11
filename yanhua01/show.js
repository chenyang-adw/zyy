/* ============================================================
 *  烟火向星辰 · 浪漫表白页（纯 Canvas，零依赖）
 *
 *  流程：弹窗输入一句话 → 开始，然后：
 *    ① 后台代码飞流（真实代码 + 行号 + 语法高亮，越滚越快，偶尔乱码）
 *    ② 速度冲起来之后 → 密密麻麻的粒子汇成实心爱心 + 烟花齐放
 *    ③ 爱心带流光（一道白金亮波扫过心形）
 *    ④ 你写的那句话在爱心中央弹出来
 *
 *  背景音乐：默认用 WebAudio 现场合成（无需音频文件，任何环境都能响），
 *  画面跟着音乐走：低频一来爱心胀一下、轻微转动、烟花踩着拍子放。
 *  想换成自己的歌：把 MUSIC_URL 指向一个 mp3 路径即可（会自动改用真实音频分析）。
 *
 *  可调：window.SHOW_CONFIG = { text, heartCount, trail, flow, music,
 *        musicUrl, volume, revealAfter, fireEvery }
 * ============================================================ */
(function () {
  'use strict';

  var CFG = Object.assign({
    text: '',
    heartCount: 0,               // 0 = 按屏幕自动
    trail: 0.13,                 // 拖尾强度：越小拖尾越长
    breath: 0.05,                // 爱心呼吸幅度
    flow: 1,                     // 流光强度（0 关闭）
    code: true,                  // 后台代码层
    heart: true,                 // 爱心层
    music: true,                 // 背景音乐
    musicUrl: '',                // 留空 = 用合成的音乐；填 mp3 路径 = 播你的歌
    volume: 0.5,
    revealAfter: 3.0,            // 代码加速几秒后弹出爱心
    fireEvery: [900, 2100]       // 自动放烟花的间隔（毫秒）
  }, window.SHOW_CONFIG || {});

  var HEART_COLORS = [[255, 105, 180], [255, 182, 193], [186, 85, 211], [220, 180, 220], [255, 240, 248]];
  var FLOW_RGB = [255, 248, 230];
  var FIRE_COLORS = [[255, 105, 180], [255, 182, 193], [255, 214, 102], [126, 231, 255], [186, 85, 211], [255, 255, 255]];
  var BG = [8, 7, 15];

  var canvas = document.getElementById('c');
  if (!canvas || !canvas.getContext) return;
  var ctx = canvas.getContext('2d');
  var fxCanvas = document.getElementById('fx');           // 花瓣层（不参与拖尾）
  var fctx = fxCanvas ? fxCanvas.getContext('2d') : null;

  var W = 0, H = 0, DPR = 1;
  var T = 0, last = 0, rafId = 0, frameAt = 0;
  var started = false, phase = 'code', startAt = 0, revealAt = 0;
  var textShown = false, nextFire = 0;

  /* 音乐驱动的几个量 */
  var bass = 0, beat = 0, beatAvg = 0.35;

  function rand(a, b) { return a + Math.random() * (b - a); }
  function pick(a) { return a[(Math.random() * a.length) | 0]; }
  function rgba(c, a) { return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')'; }

  /* ---------- 发光贴图 ---------- */
  var spriteCache = {};
  function sprite(key, rgb) {
    if (spriteCache[key]) return spriteCache[key];
    var S = 32, cv = document.createElement('canvas');
    cv.width = cv.height = S;
    var c2 = cv.getContext('2d');
    var g = c2.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    g.addColorStop(0, 'rgba(255,255,255,.96)');
    g.addColorStop(0.24, rgba(rgb, .95));
    g.addColorStop(0.6, rgba(rgb, .34));
    g.addColorStop(1, rgba(rgb, 0));
    c2.fillStyle = g;
    c2.beginPath(); c2.arc(S / 2, S / 2, S / 2, 0, 6.2832); c2.fill();
    spriteCache[key] = cv;
    return cv;
  }

  /* ============================================================
   *  背景音乐（WebAudio 现场合成 + 节拍包络）
   * ============================================================ */
  var M = { ctx: null, master: null, on: false, nextBar: 0, bar: 0, timer: 0, el: null, an: null, buf: null };
  var CHORDS = [
    [349.23, 440.00, 523.25, 659.25],
    [392.00, 493.88, 587.33, 698.46],
    [329.63, 392.00, 493.88, 587.33],
    [329.63, 440.00, 523.25, 659.25]
  ];
  var BELL = [523.25, 587.33, 659.25, 783.99, 880.00, 1046.50];
  var BAR = 2.6, BEAT = BAR / 4;               // 每小节 2.6 秒、4 拍

  function mctx() {
    if (M.ctx) return M.ctx;
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try {
      M.ctx = new AC();
      M.master = M.ctx.createGain();
      M.master.gain.value = CFG.volume;
      M.master.connect(M.ctx.destination);
    } catch (e) { M.ctx = null; }
    return M.ctx;
  }

  function note(freq, t, dur, peak, type) {
    var c = M.ctx;
    var o = c.createOscillator(), g = c.createGain();
    o.type = type || 'sine';
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(M.master);
    o.start(t); o.stop(t + dur + 0.05);
  }

  function scheduleBar(t) {
    var ch = CHORDS[M.bar % CHORDS.length];
    // 铺底和声
    ch.forEach(function (f, i) {
      note(f / 2, t, BAR * 0.95, 0.045, 'sine');
      if (i % 2 === 0) note(f, t + i * 0.06, BAR * 0.7, 0.02, 'triangle');
    });
    // 四拍低音（这是驱动画面的"心跳"）
    for (var b = 0; b < 4; b++) {
      note(ch[0] / 4, t + b * BEAT, 0.34, b % 2 === 0 ? 0.20 : 0.13, 'sine');
      if (b % 2 === 0 && M.ctx.createDynamicsCompressor) { /* 保持轻量 */ }
    }
    // 铃声点缀
    for (var k = 0; k < 3; k++) {
      note(BELL[(Math.random() * BELL.length) | 0], t + rand(0.1, BAR - 0.4), rand(0.5, 1.1), 0.028, 'triangle');
    }
    M.bar++;
  }

  function pumpMusic() {                        // 提前 0.6 秒排下一小节
    if (!M.on || !M.ctx) return;
    while (M.nextBar < M.ctx.currentTime + 0.6) {
      scheduleBar(M.nextBar);
      M.nextBar += BAR;
    }
  }

  function startMusic() {
    if (!CFG.music) return;
    var c = mctx();
    if (!c) return;
    if (c.state === 'suspended') { try { c.resume(); } catch (e) {} }
    // 有自定义歌曲就播真实音频并做频谱分析；否则用合成音乐
    if (CFG.musicUrl) {
      try {
        M.el = new Audio(CFG.musicUrl);
        M.el.loop = true;
        M.el.volume = CFG.volume;
        var src = c.createMediaElementSource(M.el);
        M.an = c.createAnalyser();
        M.an.fftSize = 512;
        src.connect(M.an);
        M.an.connect(c.destination);
        M.buf = new Uint8Array(M.an.frequencyBinCount);
        M.el.play().catch(function () {});
        M.on = true;
        return;
      } catch (e) { M.el = null; M.an = null; }
    }
    M.on = true;
    M.nextBar = c.currentTime + 0.15;
    pumpMusic();
    M.timer = setInterval(pumpMusic, 200);
  }

  /* 每帧取一次"音乐能量" */
  function readMusic() {
    var target = 0;
    if (M.an && M.buf) {
      M.an.getByteFrequencyData(M.buf);
      var sum = 0, n = 24;
      for (var i = 0; i < n; i++) sum += M.buf[i];
      target = (sum / n) / 255;
    } else if (M.on) {
      // 合成音乐：用每拍的包络（小节内相位）
      var p = (T % BEAT) / BEAT;
      target = Math.exp(-p * 3.2) * (0.55 + 0.45 * Math.abs(Math.sin(M.bar * 1.7)));
    }
    bass += (target - bass) * 0.18;
    beatAvg += (bass - beatAvg) * 0.05;
    if (bass > beatAvg * 1.45 + 0.03) beat = 1;      // 命中拍子
    beat *= Math.exp(-6 * 0.016);
  }

  /* ============================================================
   *  1) 后台代码层（离屏绘制 → 画面清晰、不糊）
   * ============================================================ */
  var CODE = [
    '# 烟火向星辰 · 所愿皆成真',
    'import numpy as np',
    'import matplotlib.pyplot as plt',
    '',
    'def heart(t):',
    '    x = 16 * np.sin(t) ** 3',
    '    y = (13 * np.cos(t) - 5 * np.cos(2 * t)',
    '         - 2 * np.cos(3 * t) - np.cos(4 * t))',
    '    return x, -y',
    '',
    'class Particle:',
    '    """一颗粒子：从下方升起，回到自己的位置"""',
    '    def __init__(self, tx, ty):',
    '        self.tx, self.ty = tx, ty',
    '        self.vx = self.vy = 0.0',
    '        self.alpha = 1.0',
    '',
    '    def update(self, k=0.02):',
    '        self.vx += (self.tx - self.x) * k',
    '        self.vy += (self.ty - self.y) * k',
    '        self.x += self.vx',
    '        self.y += self.vy',
    '',
    'def burst(sparks, n=260):',
    '    for i in range(n):',
    '        t = random() * 2 * np.pi',
    '        x, y = heart(t)',
    '        sparks.append(Particle(x, y))',
    '',
    'while True:',
    '    burst(sparks)',
    '    plt.show()'
  ];
  var KEYWORDS = ['import', 'from', 'as', 'def', 'class', 'return', 'for', 'in', 'while',
                  'if', 'else', 'elif', 'self', 'None', 'True', 'False', 'range', 'print', 'lambda', 'with'];
  var GLITCH_CHARS = '█▓▒░▚▞≠≈∞§¶†‡¤¦⌁⌇⍟⎋⏣␥ｱｲｳｴｵｶｷｸｹｺ隨機亂碼';
  var LH = 21, PADX = 16, GUTTER = 40;
  var lineCv = [], codeScroll = 0, codeSpeed = 1, codeAlpha = 0.60;
  var glitchUntil = 0, glitchLines = {};
  var codeCv = document.createElement('canvas'), cctx = codeCv.getContext('2d');

  function tokenize(line) {
    var out = [], re = /(#.*$)|('[^']*'|"[^"]*")|\b(\d+\.?\d*)\b|\b([A-Za-z_]\w*)\b|(\s+)|(.)/g, m;
    while ((m = re.exec(line)) !== null) {
      if (m[1]) out.push({ s: m[1], c: 'rgba(168,132,198,.85)' });
      else if (m[2]) out.push({ s: m[2], c: 'rgba(255,190,205,.95)' });
      else if (m[3]) out.push({ s: m[3], c: 'rgba(255,214,102,.95)' });
      else if (m[4]) {
        var w = m[4];
        out.push({
          s: w,
          c: KEYWORDS.indexOf(w) >= 0 ? 'rgba(255,120,190,.98)'
             : (/^[A-Z]/.test(w) ? 'rgba(126,231,255,.92)' : 'rgba(228,214,255,.88)')
        });
      } else out.push({ s: m[5] || m[6] || '', c: 'rgba(228,214,255,.88)' });
    }
    return out;
  }

  function buildCodeLines() {
    lineCv = CODE.map(function (line, i) {
      var cv = document.createElement('canvas');
      var c2 = cv.getContext('2d');
      var font = '600 13px ui-monospace, Consolas, Menlo, monospace';
      c2.font = font;
      var toks = tokenize(line), w = GUTTER;
      toks.forEach(function (t) { w += c2.measureText(t.s).width; });
      cv.width = Math.max(1, Math.ceil(w + 14));
      cv.height = LH;
      c2 = cv.getContext('2d');
      c2.font = font;
      c2.textBaseline = 'middle';
      c2.textAlign = 'right';
      c2.fillStyle = 'rgba(168,132,198,.55)';
      c2.fillText(String(i + 1), GUTTER - 12, LH / 2);
      c2.textAlign = 'left';
      var x = GUTTER;
      toks.forEach(function (t) {
        c2.fillStyle = t.c;
        c2.fillText(t.s, x, LH / 2);
        x += c2.measureText(t.s).width;
      });
      return cv;
    });
  }

  /* 代码先画到离屏画布，再整层贴到主画布 —— 这样代码是"实"的，不会有拖影、不糊 */
  function drawCode(dt) {
    if (!CFG.code || !lineCv.length) return;
    if (codeCv.width !== Math.round(W) || codeCv.height !== Math.round(H)) {
      codeCv.width = Math.round(W); codeCv.height = Math.round(H);
    }
    cctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    cctx.clearRect(0, 0, W, H);
    cctx.font = '600 13px ui-monospace, Consolas, Menlo, monospace';
    cctx.textBaseline = 'middle';
    cctx.textAlign = 'left';

    var total = lineCv.length * LH;
    codeScroll = (codeScroll + (42 + beat * 90) * codeSpeed * dt) % total;
    var glitching = T < glitchUntil;
    for (var i = 0; i < lineCv.length; i++) {
      var y = H + LH - i * LH - codeScroll;
      if (y < -LH * 2 || y > H + LH) continue;
      var dx = PADX + (glitching && glitchLines[i] ? rand(-6, 6) : 0);
      cctx.drawImage(lineCv[i], dx, y);
      if (glitching && glitchLines[i]) {
        for (var k = 0; k < 5; k++) {
          cctx.fillStyle = pick(['rgba(255,120,190,.98)', 'rgba(126,231,255,.95)', 'rgba(255,255,255,.95)']);
          cctx.fillText(GLITCH_CHARS[(Math.random() * GLITCH_CHARS.length) | 0],
                        dx + GUTTER + Math.random() * 300, y + LH / 2);
        }
      }
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = codeAlpha;
    ctx.drawImage(codeCv, 0, 0, W, H);
    ctx.globalAlpha = 1;
  }

  /* ============================================================
   *  2) 爱心：密密麻麻的实心粒子团 + 流光
   * ============================================================ */
  var poly = [], parts = [], hx0 = 0, hy0 = 0, kUnit = 1;
  var haloCv = null, haloBox = null;

  function heartXY(t) {
    var x = 16 * Math.pow(Math.sin(t), 3);
    var y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
    return { x: x, y: -y };
  }
  function buildPoly() { poly = []; for (var i = 0; i < 720; i++) poly.push(heartXY(i / 720 * Math.PI * 2)); }
  function inHeart(px, py) {
    var inside = false;
    for (var i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      var xi = poly[i].x, yi = poly[i].y, xj = poly[j].x, yj = poly[j].y;
      if ((yi > py) !== (yj > py) && px < (xj - xi) * (py - yi) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }
  function hbox() {
    var o = { minX: 1e9, maxX: -1e9, minY: 1e9, maxY: -1e9 };
    poly.forEach(function (p) {
      o.minX = Math.min(o.minX, p.x); o.maxX = Math.max(o.maxX, p.x);
      o.minY = Math.min(o.minY, p.y); o.maxY = Math.max(o.maxY, p.y);
    });
    o.w = o.maxX - o.minX; o.h = o.maxY - o.minY;
    return o;
  }

  function buildHeart() {
    var box = hbox();
    var n = CFG.heartCount > 0 ? CFG.heartCount
                               : Math.round(Math.min(9000, Math.max(2200, W * H / 210)));
    parts = [];
    for (var i = 0; i < n; i++) {
      var edge = Math.random() < 0.30, hx, hy, guard = 0;
      if (edge) {
        var p = heartXY(Math.random() * Math.PI * 2);
        // 一部分散得更开，形成边缘"喷雾"（参考图那种毛边）
        var jit = Math.random() < 0.2 ? rand(0.35, 1.4) : rand(-0.3, 0.3);
        hx = p.x + rand(-1, 1) * jit;
        hy = p.y + rand(-1, 1) * jit;
      } else {
        do { hx = rand(box.minX, box.maxX); hy = rand(box.minY, box.maxY); guard++; }
        while (!inHeart(hx, hy) && guard < 60);
      }
      parts.push({
        hx: hx, hy: hy, x: 0, y: 0, sx: 0, sy: 0, t0: 0, rise: 1,
        col: (Math.random() * HEART_COLORS.length) | 0,
        s: rand(0.95, 2.0),                       // 小颗粒 → 密集且有颗粒感
        a: rand(.30, .88),
        bs: rand(.6, 2.2), bp: Math.random() * 6.2832, ba: rand(.25, 1.1),
        fs: rand(0, 6.2832)
      });
    }
    flight();
    buildHalo();
  }

  function flight() {
    var box = hbox(), spread = box.w * kUnit * 0.6;
    parts.forEach(function (p) {
      p.sx = hx0 + rand(-spread, spread);
      p.sy = H + rand(40, Math.max(80, H * 0.65));
      p.x = p.sx; p.y = p.sy;
      p.t0 = T + rand(0, 1.8);
      p.rise = rand(1.0, 1.9);
    });
  }

  /* 柔光晕：把心形轮廓模糊一下，单独画在粒子后面 */
  function buildHalo() {
    var box = hbox(), pad = 70;
    var w = Math.ceil(box.w * kUnit + pad * 2), h = Math.ceil(box.h * kUnit + pad * 2);
    haloCv = document.createElement('canvas');
    haloCv.width = Math.max(2, w); haloCv.height = Math.max(2, h);
    var c2 = haloCv.getContext('2d');
    c2.translate(pad - box.minX * kUnit, pad - box.minY * kUnit);
    c2.scale(kUnit, kUnit);
    c2.beginPath();
    poly.forEach(function (p, i) { if (i === 0) c2.moveTo(p.x, p.y); else c2.lineTo(p.x, p.y); });
    c2.closePath();
    try { c2.filter = 'blur(' + (22 / kUnit) + 'px)'; } catch (e) {}
    c2.fillStyle = 'rgba(255,120,190,.75)';
    c2.fill();
    haloBox = { x: hx0 + box.minX * kUnit - pad, y: hy0 + box.minY * kUnit - pad, w: w, h: h };
  }

  function easeOutBack(t) { var c1 = 1.15, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); }

  function drawHeart() {
    if (!CFG.heart || !parts.length) return;

    /* 音乐驱动：低频 → 胀一下 + 轻微转动 */
    var scaleK = (1 + Math.sin(T * 1.25) * CFG.breath) * (1 + bass * 0.10 + beat * 0.035);
    var rotA = Math.sin(T * 0.35) * 0.035 + beat * 0.02;
    var cosA = Math.cos(rotA), sinA = Math.sin(rotA);
    var glowK = 1 + bass * 0.55 + beat * 0.35;

    if (haloCv) {
      ctx.globalCompositeOperation = 'lighter';        // 光晕用叠加，但压得很低，避免过曝
      ctx.globalAlpha = Math.min(1, (0.07 + bass * 0.13) * CFG.flow);
      ctx.save();
      ctx.translate(hx0, hy0);
      ctx.rotate(rotA);
      ctx.scale(scaleK, scaleK);
      ctx.drawImage(haloCv, haloBox.x - hx0, haloBox.y - hy0, haloBox.w, haloBox.h);
      ctx.restore();
      ctx.globalAlpha = 1;
    }

    var flowSprite = sprite('flow', FLOW_RGB);
    ctx.globalCompositeOperation = 'source-over';       // 颗粒本体用普通混合 → 才是"颗粒团"而不是白光
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i];
      var rx = p.hx * cosA - p.hy * sinA;
      var ry = p.hx * sinA + p.hy * cosA;
      var tx = hx0 + rx * kUnit * scaleK + Math.sin(T * p.bs + p.bp) * p.ba;
      var ty = hy0 + ry * kUnit * scaleK + Math.cos(T * p.bs * .87 + p.bp) * p.ba;
      var t01 = (T - p.t0) / p.rise;
      t01 = t01 < 0 ? 0 : (t01 > 1 ? 1 : t01);
      var e = easeOutBack(t01);
      p.x = p.sx + (tx - p.sx) * e;
      p.y = p.sy + (ty - p.sy) * e;

      /* 流光：亮波沿心形扫过（空间相位 + 时间相位） */
      var flow = 0;
      if (CFG.flow > 0) {
        var ph = (rx * 0.72 + ry * 1.15) * 0.55 + p.fs * 0.06;
        flow = Math.sin(ph - T * 2.3);
        flow = flow > 0 ? flow * flow : 0;          // 平方代替 pow，省性能
      }

      var s = p.s * (1 + flow * 0.45) * (1 + beat * 0.10);
      ctx.globalAlpha = Math.min(1, p.a * (0.75 + flow * 0.3) * (0.75 + glowK * 0.25));
      ctx.fillStyle = 'rgb(' + HEART_COLORS[p.col].join(',') + ')';
      ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s);

      if (flow > 0.25) {                                  // 波峰叠一层白金（这层才用叠加）
        var dd = p.s * (2.4 + flow * 2.2);
        ctx.globalAlpha = Math.min(1, (flow - 0.2) * 0.8);
        ctx.globalCompositeOperation = 'lighter';
        ctx.drawImage(flowSprite, p.x - dd / 2, p.y - dd / 2, dd, dd);
        ctx.globalCompositeOperation = 'source-over';
      }
    }
    ctx.globalAlpha = 1;
  }

  /* ============================================================
   *  3) 烟花
   * ============================================================ */
  var rockets = [], sparks = [], FLASH = [];
  var petals = [];
  var PETAL_COLORS = [[255, 182, 193], [255, 214, 222], [255, 240, 246], [255, 154, 180], [238, 186, 255]];

  /* 撒一把花瓣：从一点向上/四周甩出，然后带着翻转飘落 */
  function tossPetals(x, y, n) {
    if (x == null) x = W / 2;
    if (y == null) y = H * 0.55;
    n = n || (16 + Math.round(beat * 12) + ((Math.random() * 8) | 0));
    var k = Math.min(W, H) / 900 + 0.55;
    for (var i = 0; i < n; i++) {
      var a = -Math.PI / 2 + rand(-1.1, 1.1);            // 主要向上抛
      var sp = rand(150, 430) * k;
      petals.push({
        x: x + rand(-16, 16), y: y + rand(-12, 12),
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        rot: rand(0, 6.2832), vr: rand(-4.5, 4.5),
        sway: rand(0.8, 2.4), swayPh: rand(0, 6.2832),
        flip: rand(0, 6.2832), flipSp: rand(0.8, 2.2),
        r: rand(7, 16) * (0.8 + k * 0.25),
        col: (Math.random() * PETAL_COLORS.length) | 0,
        life: 1, decay: rand(0.085, 0.19)
      });
    }
  }

  function drawPetals(dt) {
    if (!fctx) return;
    // 花瓣画在独立的上层画布上，每帧清空 → 清晰、不被拖尾拉长
    fctx.setTransform(1, 0, 0, 1, 0, 0);
    fctx.clearRect(0, 0, fxCanvas.width, fxCanvas.height);
    if (!petals.length) return;
    var pctx = fctx;
    pctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    for (var i = petals.length - 1; i >= 0; i--) {
      var p = petals[i];
      p.vy += 44 * dt;                                  // 重力（轻，慢慢飘）
      p.vx *= 0.986; p.vy *= 0.986;
      p.x += p.vx * dt + Math.sin(T * p.sway + p.swayPh) * 26 * dt;   // 左右摇摆
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
      p.life -= p.decay * dt;
      if (p.life <= 0 || p.y > H + 70) { petals.splice(i, 1); continue; }

      var wid = p.r * (0.22 + 0.78 * Math.abs(Math.cos(p.flip + T * p.flipSp)));   // 翻转 → 变窄
      var c = PETAL_COLORS[p.col];
      pctx.save();
      pctx.translate(p.x, p.y);
      pctx.rotate(p.rot);
      pctx.globalAlpha = Math.min(1, p.life * 1.7);
      pctx.fillStyle = 'rgb(' + c.join(',') + ')';
      pctx.beginPath();
      pctx.moveTo(0, -p.r);
      pctx.bezierCurveTo(wid, -p.r * 0.42, wid, p.r * 0.45, 0, p.r);
      pctx.bezierCurveTo(-wid, p.r * 0.45, -wid, -p.r * 0.42, 0, -p.r);
      pctx.fill();
      pctx.globalAlpha = Math.min(1, p.life) * 0.5;      // 花瓣脉络
      pctx.strokeStyle = 'rgba(255,255,255,.6)';
      pctx.lineWidth = Math.max(0.6, p.r * 0.07);
      pctx.beginPath(); pctx.moveTo(0, -p.r * 0.72); pctx.lineTo(0, p.r * 0.78); pctx.stroke();
      pctx.restore();
    }
    pctx.globalAlpha = 1;
  }

  function launch(tx, ty, pattern) {
    if (tx == null) tx = rand(W * 0.12, W * 0.88);
    if (ty == null) ty = rand(H * 0.06, H * 0.34);      // 尽量在爱心上方炸
    rockets.push({
      x: tx + rand(-W * 0.06, W * 0.06), y: H + 8,
      ty: ty, vy: -rand(H * 0.42, H * 0.60),
      col: (Math.random() * FIRE_COLORS.length) | 0,
      pat: pattern || pick(['ball', 'ball', 'ball', 'ring', 'heart', 'double']),
      px: 0, py: 0
    });
  }

  function explode(x, y, col, pat) {
    var n = pat === 'heart' ? 220 : (pat === 'ring' ? 150 : rand(150, 260));
    var base = rand(90, 190) * (Math.min(W, H) / 900) * (1 + beat * 0.18);
    for (var i = 0; i < n; i++) {
      var a = Math.random() * Math.PI * 2, sp = base * rand(0.45, 1.1), kind = pat;
      if (pat === 'ring') { a = i / n * Math.PI * 2; sp = base * rand(0.95, 1.05); }
      else if (pat === 'double') { kind = i % 2 ? 'ball' : 'ring'; sp *= i % 2 ? 0.6 : 1; }
      else if (pat === 'heart') {
        var hp = heartXY(Math.random() * Math.PI * 2);
        a = Math.atan2(hp.y, hp.x);
        sp = base * 1.35 * (Math.sqrt(hp.x * hp.x + hp.y * hp.y) / 8.2) * rand(0.9, 1.1);
      }
      sparks.push({
        x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: 1, decay: rand(0.55, 1.05),
        col: (kind === 'ring' && pat === 'double') ? (col + 2) % FIRE_COLORS.length : col,
        r: rand(1.6, 3.4), glit: Math.random() < 0.25
      });
    }
    FLASH.push({ x: x, y: y, t: 0, col: col });
  }

  var GRAV = 46, DRAG = 0.985;

  function drawFire(dt) {
    var i, r, s, k;
    ctx.globalCompositeOperation = 'lighter';
    for (i = rockets.length - 1; i >= 0; i--) {
      r = rockets[i];
      r.px = r.x; r.py = r.y;
      r.y += r.vy * dt; r.vy += 26 * dt;
      if (r.y <= r.ty || r.vy > -20) { explode(r.x, r.y, r.col, r.pat); rockets.splice(i, 1); continue; }
      for (k = 0; k < 4; k++) {
        var t = k / 4;
        ctx.globalAlpha = (1 - t) * 0.75;
        ctx.drawImage(sprite('f' + r.col, FIRE_COLORS[r.col]), r.x - 3, r.y + (r.py - r.y) * t - 3, 6, 6);
      }
      ctx.globalAlpha = 1;
      ctx.drawImage(sprite('f' + r.col, FIRE_COLORS[r.col]), r.x - 5, r.y - 5, 10, 10);
    }
    for (i = sparks.length - 1; i >= 0; i--) {
      s = sparks[i];
      s.vy += GRAV * dt;
      s.vx *= DRAG; s.vy *= DRAG;
      s.x += s.vx * dt; s.y += s.vy * dt;
      s.life -= s.decay * dt;
      if (s.life <= 0) { sparks.splice(i, 1); continue; }
      var a = s.life * (s.glit ? (0.55 + 0.45 * Math.sin(T * 26 + i)) : 1);
      var d = s.r * 2.2;
      ctx.globalAlpha = Math.max(0, Math.min(1, a));
      ctx.drawImage(sprite('f' + s.col, FIRE_COLORS[s.col]), s.x - d / 2, s.y - d / 2, d, d);
    }
    ctx.globalAlpha = 1;
    for (i = FLASH.length - 1; i >= 0; i--) {
      var f = FLASH[i];
      f.t += dt;
      if (f.t > 0.36) { FLASH.splice(i, 1); continue; }
      var p2 = f.t / 0.36, rr = Math.min(W, H) * 0.16 * (0.4 + p2);
      var g = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, rr);
      g.addColorStop(0, rgba(FIRE_COLORS[f.col], (1 - p2) * 0.55));
      g.addColorStop(1, rgba(FIRE_COLORS[f.col], 0));
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(f.x, f.y, rr, 0, 6.2832); ctx.fill();
    }
  }

  /* ============================================================
   *  尺寸 / 主循环
   * ============================================================ */
  function fit() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    if (fxCanvas) {
      fxCanvas.width = Math.round(W * DPR);
      fxCanvas.height = Math.round(H * DPR);
    }
    var box = hbox();
    kUnit = Math.min(W * 0.68 / box.w, H * 0.60 / box.h);
    hx0 = W / 2;
    hy0 = H * 0.42 - (box.minY + box.h / 2) * kUnit;
    ctx.fillStyle = 'rgb(' + BG.join(',') + ')';
    ctx.fillRect(0, 0, W, H);
  }

  function frame(dt) {
    T += dt;
    readMusic();

    // 拖尾
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.fillStyle = 'rgba(' + BG.join(',') + ',' + CFG.trail + ')';
    ctx.fillRect(0, 0, W, H);

    // ① 代码加速期
    if (started && phase === 'code') {
      codeSpeed = Math.min(7.5, codeSpeed + dt * 2.4);
      if (T - startAt > CFG.revealAfter) {
        phase = 'show';
        revealAt = T;
        codeAlpha = 0.26;
        if (CFG.heart) buildHeart();
        for (var i = 0; i < 2; i++) setTimeout(function () { launch(); }, i * 200);
      }
    }
    if (CFG.code && started && T > glitchUntil && Math.random() < 0.01) {
      glitchUntil = T + rand(0.10, 0.30);
      glitchLines = {};
      for (var g = 0; g < 3; g++) glitchLines[(Math.random() * CODE.length) | 0] = 1;
    }

    drawCode(dt);
    drawHeart();
    drawFire(dt);
    drawPetals(dt);

    // 自动放烟花（踩着拍子来）
    if (T * 1000 > nextFire) {
      launch();
      if (beat > 0.6 || Math.random() < 0.3) launch();
      nextFire = T * 1000 + rand(CFG.fireEvery[0], CFG.fireEvery[1]) * (beat > 0.6 ? 0.5 : 1);
    }

    // 文字弹出
    if (started && !textShown && phase === 'show' && T - revealAt > 1.5) {
      textShown = true;
      var el = document.getElementById('love');
      if (el) el.classList.add('show');
      var hint = document.getElementById('hint');
      if (hint) { hint.classList.add('show'); setTimeout(function () { hint.style.display = 'none'; }, 6000); }
      for (var j = 0; j < 3; j++) {
          setTimeout(function () {
            launch(W / 2 + rand(-W * 0.22, W * 0.22), rand(H * 0.12, H * 0.34), 'heart');
            tossPetals(W / 2 + rand(-W * 0.3, W * 0.3), H * rand(0.45, 0.7), 12);
          }, j * 260);
      }
    }
  }

  function loop(ms) {
    frameAt = Date.now();
    var now = ms / 1000;
    var dt = last ? Math.min(0.05, now - last) : 0.016;
    last = now;
    frame(dt);
    rafId = requestAnimationFrame(loop);
  }

  /* ============================================================
   *  交互
   * ============================================================ */
  var down = null;
  canvas.addEventListener('pointerdown', function (e) { down = { x: e.clientX, y: e.clientY }; });
  canvas.addEventListener('pointerup', function (e) {
    if (!down) return;
    var moved = Math.abs(e.clientX - down.x) + Math.abs(e.clientY - down.y);
    down = null;
    if (moved > 12) return;
    tossPetals(e.clientX, e.clientY);                       // 撒一把花瓣
    launch(e.clientX, Math.min(e.clientY, H * 0.55));       // 再放一朵烟花
  });

  document.addEventListener('visibilitychange', function () {
    if (document.hidden) { cancelAnimationFrame(rafId); rafId = 0; if (M.el) M.el.pause(); }
    else {
      if (!rafId) { last = 0; rafId = requestAnimationFrame(loop); }
      if (M.el && M.on) M.el.play().catch(function () {});
    }
  });

  var rt = 0;
  window.addEventListener('resize', function () {
    clearTimeout(rt);
    rt = setTimeout(function () { fit(); if (parts.length) buildHeart(); }, 200);
  });

  setInterval(function () {
    if (!document.hidden && Date.now() - frameAt > 1500) { last = 0; cancelAnimationFrame(rafId); rafId = requestAnimationFrame(loop); }
  }, 1500);

  /* ============================================================
   *  启动
   * ============================================================ */
  function startShow(text) {
    CFG.text = (text || '').trim() || '烟火向星辰，所愿皆成真';
    var el = document.getElementById('love');
    if (el) el.textContent = CFG.text;
    var modal = document.getElementById('modal');
    if (modal) { modal.classList.add('out'); setTimeout(function () { modal.hidden = true; }, 520); }
    started = true;
    phase = 'code';
    startAt = T;
    textShown = false;
    codeSpeed = 1;
    codeAlpha = 0.60;
    parts = [];
    startMusic();                       // 点击是用户手势 → 音乐可以正常起
  }

  var goBtn = document.getElementById('go');
  var skipBtn = document.getElementById('skip');
  var msg = document.getElementById('msg');
  if (goBtn) goBtn.addEventListener('click', function () { startShow(msg && msg.value); });
  if (skipBtn) skipBtn.addEventListener('click', function () { if (msg) msg.value = ''; startShow(''); });
  if (msg) msg.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); startShow(msg.value); } });

  buildPoly();
  fit();
  buildCodeLines();
  nextFire = 600;
  rafId = requestAnimationFrame(loop);

  /* 调试/自测接口 */
  window.ShowFx = {
    start: startShow,
    firework: launch,
    burst: function (x, y, pat) { explode(x == null ? W / 2 : x, y == null ? H * 0.3 : y, (Math.random() * FIRE_COLORS.length) | 0, pat || 'ball'); },
    petals: tossPetals,
    settleHeart: function () { parts.forEach(function (p) { p.t0 = T - 10; }); },
    tick: function (n, dt) { for (var i = 0; i < (n || 60); i++) frame(dt || 1 / 60); },
    glitch: function (on) { glitchUntil = on ? T + 99 : T; glitchLines = { 3: 1, 12: 1, 21: 1 }; },
    music: function (on) { M.on = !!on; if (on) startMusic(); else if (M.el) M.el.pause(); },
    state: function () {
      return {
        started: started, phase: phase, text: CFG.text, textShown: textShown,
        codeLines: lineCv.length, codeSpeed: Number(codeSpeed.toFixed(2)),
        heart: parts.length, rockets: rockets.length, sparks: sparks.length,
        petals: petals.length,
        music: M.on, realAudio: !!M.el, bass: Number(bass.toFixed(3)), beat: Number(beat.toFixed(3)),
        size: [W, H], T: Number(T.toFixed(2)),
        textVisible: (document.getElementById('love').className || '').indexOf('show') >= 0
      };
    }
  };
})();
