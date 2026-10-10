/* ============================================================
 *  首页顶部「星空光效」层（案例版）
 *  叠放顺序：.hero 背景  →  canvas.hero-stars（本层）
 *                        →  canvas.hero-fx（粒子层）
 *                        →  .hero-inner（文字内容）
 *
 *  包含三样东西：
 *    1) 星尘   —— 细小的星点，大小/亮度/闪烁相位随机，缓慢漂移
 *    2) 星云   —— 几团缓慢游走的柔光，制造"深空"层次
 *    3) 流星   —— 每隔一段时间划过一颗，带渐隐拖尾
 *
 *  配色自适应：浅色底用冷色星尘（靛蓝/紫/天蓝/白）；
 *  给 .hero 加上 class="night"（深夜空底）时自动切换成亮白星点。
 * ============================================================ */
(function () {
  'use strict';

  var canvas = document.querySelector('canvas.hero-stars');
  if (!canvas || !canvas.getContext) return;
  var host = canvas.parentNode;
  var ctx = canvas.getContext('2d');

  var PREF = { density: 1, nebula: true, meteors: true };
  var reduce = window.matchMedia
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false;

  // 浅色底：冷色星尘；深色底：偏白的真实星色
  var LIGHT_TINTS = [[79, 70, 229], [124, 58, 237], [56, 189, 248], [219, 39, 119], [255, 255, 255]];
  var NIGHT_TINTS = [[255, 255, 255], [226, 236, 255], [198, 220, 255], [255, 236, 250]];

  var BL = 3;                                   // 星云团数
  var NEB = [
    { c: [79, 70, 229], rx: 0.42, ry: 0.60, sx: 0.000026, sy: 0.000035, ph: 0.0 },
    { c: [124, 58, 237], rx: 0.36, ry: 0.52, sx: 0.000019, sy: 0.000028, ph: 2.1 },
    { c: [56, 189, 248], rx: 0.30, ry: 0.44, sx: 0.000031, sy: 0.000021, ph: 4.2 }
  ];

  var W = 0, H = 0, DPR = 1;
  var stars = [], meteors = [], raf = null, last = 0, visible = true;
  var nextMeteor = 0;

  function rand(a, b) { return a + Math.random() * (b - a); }

  function makeStar() {
    var big = Math.random() < 0.07;
    return {
      x: Math.random() * W,
      y: Math.random() * H,
      r: big ? rand(0.72, 1.0) : rand(0.14, 0.46),         // 微小的光点：核心极小
      a: big ? rand(0.55, 0.95) : rand(0.22, 0.72),
      ph: Math.random() * 6.2832,
      sp: rand(0.5, 2.2) / 1000,
      vx: rand(-0.055, 0.02),
      vy: rand(-0.045, 0.02),
      t: (Math.random() * 5) | 0,
      big: big
    };
  }

  function target() {
    // 光点很小，数量略多一点点才有星尘感
    return Math.max(80, Math.min(300, Math.round((W / 7) * PREF.density)));
  }

  function build() {
    var n = target();
    stars = [];
    for (var i = 0; i < n; i++) stars.push(makeStar());
  }

  function sync() {
    var n = target();
    while (stars.length < n) stars.push(makeStar());
    if (stars.length > n) stars.length = n;
  }

  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    var w = canvas.clientWidth || host.clientWidth || 0;
    var h = canvas.clientHeight || host.clientHeight || 0;
    if (!w || !h) return;
    if (w === W && h === H) return;
    W = w; H = h;
    canvas.width = Math.max(1, Math.round(W * DPR));
    canvas.height = Math.max(1, Math.round(H * DPR));
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    build();
  }

  function spawnMeteor() {
    var fromLeft = Math.random() < 0.6;
    var sp = rand(6.2, 11.5);                              // 速度更快
    meteors.push({
      x: fromLeft ? rand(-0.1 * W, 0.55 * W) : rand(0.5 * W, 1.05 * W),
      y: rand(-0.05 * H, 0.42 * H),
      vx: fromLeft ? sp : -sp,
      vy: sp * rand(0.32, 0.6),
      len: rand(70, 150),
      life: 0,
      life0: rand(430, 700)
    });
  }

  function draw(now) {
    var dt = last ? Math.min(50, now - last) : 16;
    last = now;
    var k = dt / 16;
    var night = host.classList.contains('night');
    var tints = night ? NIGHT_TINTS : LIGHT_TINTS;
    var i, s, m;

    ctx.clearRect(0, 0, W, H);

    /* 1) 星云：几团缓慢游走的柔光 */
    if (PREF.nebula) {
      for (i = 0; i < BL; i++) {
        var b = NEB[i];
        var cx = W * (0.5 + b.rx * Math.sin(now * b.sx + b.ph));
        var cy = H * (0.35 + b.ry * Math.cos(now * b.sy + b.ph * 1.4));
        var rr = Math.max(W, H) * (night ? 0.42 : 0.34);
        var g = ctx.createRadialGradient(cx, cy, 0, cx, cy, rr);
        var a0 = night ? 0.20 : 0.075;
        g.addColorStop(0, 'rgba(' + b.c[0] + ',' + b.c[1] + ',' + b.c[2] + ',' + a0 + ')');
        g.addColorStop(0.55, 'rgba(' + b.c[0] + ',' + b.c[1] + ',' + b.c[2] + ',' + (a0 * 0.35).toFixed(3) + ')');
        g.addColorStop(1, 'rgba(' + b.c[0] + ',' + b.c[1] + ',' + b.c[2] + ',0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(cx, cy, rr, 0, 6.2832); ctx.fill();
      }
    }

    /* 2) 星尘 */
    for (i = 0; i < stars.length; i++) {
      s = stars[i];
      if (!reduce) {
        s.x += s.vx * k;
        s.y += s.vy * k;
        if (s.x < -6) s.x = W + 6; else if (s.x > W + 6) s.x = -6;
        if (s.y < -6) s.y = H + 6; else if (s.y > H + 6) s.y = -6;
      }
      var tw = reduce ? 1 : 0.45 + 0.55 * Math.sin(now * s.sp + s.ph);
      var a = Math.max(0, Math.min(1, s.a * tw));
      var t = tints[s.t % tints.length];

      /* 统一画成「微小的光点」：一层很小的柔光晕 + 一个更小的亮点核心 */
      var hr = 1.5 + s.r * 5.4;
      var hg = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, hr);
      hg.addColorStop(0, 'rgba(' + t[0] + ',' + t[1] + ',' + t[2] + ',' + Math.min(1, a * (night ? 0.9 : 0.72)).toFixed(3) + ')');
      hg.addColorStop(0.45, 'rgba(' + t[0] + ',' + t[1] + ',' + t[2] + ',' + (a * 0.20).toFixed(3) + ')');
      hg.addColorStop(1, 'rgba(' + t[0] + ',' + t[1] + ',' + t[2] + ',0)');
      ctx.fillStyle = hg;
      ctx.beginPath(); ctx.arc(s.x, s.y, hr, 0, 6.2832); ctx.fill();

      ctx.fillStyle = 'rgba(' + t[0] + ',' + t[1] + ',' + t[2] + ',' + Math.min(1, a * 1.25).toFixed(3) + ')';
      ctx.beginPath(); ctx.arc(s.x, s.y, Math.max(0.28, s.r * 0.5), 0, 6.2832); ctx.fill();
    }

    /* 3) 流星 */
    if (PREF.meteors && !reduce) {
      if (now > nextMeteor) {
        if (meteors.length < 3) spawnMeteor();             // 最多同时 3 颗（原来 1 颗）
        nextMeteor = now + rand(1600, 4200);               // 出现更频繁
      }
      for (i = meteors.length - 1; i >= 0; i--) {
        m = meteors[i];
        m.life += dt;
        var p = m.life / m.life0;
        if (p >= 1) { meteors.splice(i, 1); continue; }
        m.x += m.vx * k;
        m.y += m.vy * k;
        var fade = Math.sin(Math.PI * p);                    // 淡入淡出
        var tx = m.x - m.vx * m.len * 0.06;
        var ty = m.y - m.vy * m.len * 0.06;
        var lg = ctx.createLinearGradient(m.x, m.y, tx, ty);
        lg.addColorStop(0, 'rgba(255,255,255,' + (0.85 * fade).toFixed(3) + ')');
        lg.addColorStop(0.25, 'rgba(186,205,255,' + (0.45 * fade).toFixed(3) + ')');
        lg.addColorStop(1, 'rgba(140,160,255,0)');
        ctx.strokeStyle = lg;
        ctx.lineWidth = 1.7;
        ctx.beginPath(); ctx.moveTo(m.x, m.y); ctx.lineTo(tx, ty); ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,' + (0.9 * fade).toFixed(3) + ')';
        ctx.beginPath(); ctx.arc(m.x, m.y, 1.5, 0, 6.2832); ctx.fill();
      }
    }

    raf = visible ? requestAnimationFrame(draw) : null;
  }

  function start() { if (raf == null) { last = 0; raf = requestAnimationFrame(draw); } }
  function stop() { if (raf != null) { cancelAnimationFrame(raf); raf = null; } }

  document.addEventListener('visibilitychange', function () {
    visible = !document.hidden;
    if (visible) start(); else stop();
  });
  window.addEventListener('resize', resize);
  window.addEventListener('load', resize);
  document.addEventListener('DOMContentLoaded', resize);
  setTimeout(resize, 120);
  setTimeout(resize, 600);
  if (window.ResizeObserver) {
    try { new ResizeObserver(resize).observe(host); } catch (e) {}
  }

  window.HeroStars = {
    set: function (opts) {
      if (typeof opts.density === 'number') PREF.density = opts.density;
      if (typeof opts.nebula === 'boolean') PREF.nebula = opts.nebula;
      if (typeof opts.meteors === 'boolean') PREF.meteors = opts.meteors;
      if (W && H) sync();
    },
    pause: function () { stop(); ctx.clearRect(0, 0, W, H); },
    resume: function () { resize(); start(); }
  };

  resize();
  start();

  /* URL 参数预览：?stars=0 / ?starDensity=0.5 / ?night=1 */
  try {
    var q = window.location.search;
    if (q) {
      var m1 = /[?&]starDensity=([\d.]+)/.exec(q);
      if (m1) PREF.density = Math.max(0.2, Math.min(2.5, parseFloat(m1[1]) || 1));
      if (/[?&]night=1/.test(q)) host.classList.add('night');
      if (/[?&]stars=0/.test(q)) { PREF.nebula = false; PREF.meteors = false; PREF.density = 0; }
      resize();
      build();
    }
  } catch (e) {}
})();
