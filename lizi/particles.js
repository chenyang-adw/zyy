/* ============================================================
 *  首页顶部「粒子光效」案例版
 *  - 漂浮光点 + 近距连线 + 跟随鼠标的柔光与轻微吸附
 *  - 自适应容器尺寸 / 支持高分屏 / 切到后台自动暂停
 *  - 尊重 prefers-reduced-motion：动画减弱为静态微光
 *
 *  接入方式（正式上线时）：
 *    <header class="hero">
 *      <canvas class="hero-fx" aria-hidden="true"></canvas>
 *      <div class="hero-inner">…</div>
 *    </header>
 *    .hero        { position: relative; overflow: hidden; }
 *    canvas.hero-fx  ->  position absolute; inset 0; width/height 100%
 *                        （canvas 是替换元素，宽高必须显式给 100%，否则退回 300x150）
 *                        z-index 1; pointer-events none; display block
 *    .hero-inner  { position: relative; z-index: 2; }
 * ============================================================ */
(function () {
  'use strict';

  var canvas = document.querySelector('canvas.hero-fx');
  if (!canvas || !canvas.getContext) return;
  var host = canvas.parentNode;
  var ctx = canvas.getContext('2d');

  var PREF = { density: 1.8, links: true };               // 密度默认拉满（可用 ?density= 覆盖预览）
  var COLORS = [
    [79, 70, 229],    // 靛蓝
    [124, 58, 237],   // 紫
    [219, 39, 119],   // 玫红
    [56, 189, 248]    // 天蓝
  ];
  var LINK_DIST = 112;
  var CURSOR_DIST = 150;
  var reduce = window.matchMedia
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false;

  var W = 0, H = 0, DPR = 1, parts = [], raf = null, last = 0, visible = true;
  var ptr = { x: -1e4, y: -1e4, on: false };

  function rand(a, b) { return a + Math.random() * (b - a); }

  function make() {
    var c = COLORS[(Math.random() * COLORS.length) | 0];
    var big = Math.random() < 0.18;
    return {
      x: Math.random() * W,
      y: Math.random() * H,
      vx: rand(-0.17, 0.17),
      vy: rand(-0.20, 0.14),
      r: big ? rand(2.0, 3.4) : rand(0.9, 1.8),
      c: c,
      a: rand(0.35, 0.85),
      ph: Math.random() * 6.2832,
      sp: rand(0.6, 1.8)
    };
  }

  function target() {
    return Math.max(30, Math.min(200, Math.round((W / 15) * PREF.density)));
  }

  function build() {                                       // 按当前尺寸重新铺满
    var n = target();
    parts = [];
    for (var i = 0; i < n; i++) parts.push(make());
  }

  function sync() {                                        // 只增删，不重排（面板调密度用）
    var n = target();
    while (parts.length < n) parts.push(make());
    if (parts.length > n) parts.length = n;
  }

  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    // 尺寸完全交给 CSS（inset:0 撑满 .hero），只调整画布后背缓冲
    var w = canvas.clientWidth || host.clientWidth || 0;
    var h = canvas.clientHeight || host.clientHeight || 0;
    if (!w || !h) return;
    canvas.setAttribute('data-fx-size', w + 'x' + h);       // 便于调试
    if (w === W && h === H) return;
    W = w; H = h;
    canvas.width = Math.max(1, Math.round(W * DPR));
    canvas.height = Math.max(1, Math.round(H * DPR));
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    build();                                                // 尺寸变了就重建，保证铺满
  }

  function draw(now) {
    var dt = last ? Math.min(50, now - last) : 16;
    last = now;
    var k = dt / 16;
    var i, j, p, q, dx, dy, d, al;

    ctx.clearRect(0, 0, W, H);

    /* 鼠标处的柔光 */
    if (ptr.on) {
      var g = ctx.createRadialGradient(ptr.x, ptr.y, 0, ptr.x, ptr.y, 140);
      g.addColorStop(0, 'rgba(124,58,237,0.14)');
      g.addColorStop(0.45, 'rgba(79,70,229,0.05)');
      g.addColorStop(1, 'rgba(79,70,229,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(ptr.x, ptr.y, 140, 0, 6.2832); ctx.fill();
    }

    /* 近距连线 */
    if (PREF.links) {
      ctx.lineWidth = 1;
      for (i = 0; i < parts.length; i++) {
        p = parts[i];
        for (j = i + 1; j < parts.length; j++) {
          q = parts[j];
          dx = p.x - q.x; dy = p.y - q.y;
          d = dx * dx + dy * dy;
          if (d > LINK_DIST * LINK_DIST) continue;
          al = (1 - Math.sqrt(d) / LINK_DIST) * 0.20;
          ctx.strokeStyle = 'rgba(' + p.c[0] + ',' + p.c[1] + ',' + p.c[2] + ',' + al.toFixed(3) + ')';
          ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke();
        }
      }
    }

    /* 光点本体 */
    for (i = 0; i < parts.length; i++) {
      p = parts[i];

      if (!reduce) {
        p.x += p.vx * k;
        p.y += p.vy * k;
        if (p.x < -24) p.x = W + 24; else if (p.x > W + 24) p.x = -24;
        if (p.y < -24) p.y = H + 24; else if (p.y > H + 24) p.y = -24;
      }

      if (ptr.on) {                                        // 被鼠标轻轻吸引
        dx = ptr.x - p.x; dy = ptr.y - p.y;
        d = Math.sqrt(dx * dx + dy * dy);
        if (d < CURSOR_DIST && d > 0.6) {
          al = (1 - d / CURSOR_DIST) * 0.55;
          p.x += (dx / d) * al * k;
          p.y += (dy / d) * al * k;
        }
      }

      var tw = reduce ? 1 : 0.62 + 0.38 * Math.sin(now * 0.001 * p.sp + p.ph);
      var A = p.a * tw;
      var rr = p.r * 5.2;

      var rg = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, rr);
      rg.addColorStop(0, 'rgba(' + p.c[0] + ',' + p.c[1] + ',' + p.c[2] + ',' + (A * 0.55).toFixed(3) + ')');
      rg.addColorStop(0.28, 'rgba(' + p.c[0] + ',' + p.c[1] + ',' + p.c[2] + ',' + (A * 0.16).toFixed(3) + ')');
      rg.addColorStop(1, 'rgba(' + p.c[0] + ',' + p.c[1] + ',' + p.c[2] + ',0)');
      ctx.fillStyle = rg;
      ctx.beginPath(); ctx.arc(p.x, p.y, rr, 0, 6.2832); ctx.fill();

      ctx.fillStyle = 'rgba(' + p.c[0] + ',' + p.c[1] + ',' + p.c[2] + ',' + Math.min(1, A * 1.15).toFixed(3) + ')';
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.2832); ctx.fill();
    }

    raf = visible ? requestAnimationFrame(draw) : null;
  }

  function start() { if (raf == null) { last = 0; raf = requestAnimationFrame(draw); } }
  function stop() { if (raf != null) { cancelAnimationFrame(raf); raf = null; } }

  /* 鼠标 / 触摸交互 */
  function move(e) {
    var r = canvas.getBoundingClientRect();
    var t = (e.touches && e.touches[0]) ? e.touches[0] : e;
    ptr.x = t.clientX - r.left;
    ptr.y = t.clientY - r.top;
    ptr.on = true;
  }
  function leave() { ptr.on = false; ptr.x = -1e4; ptr.y = -1e4; }

  document.addEventListener('visibilitychange', function () {
    visible = !document.hidden;
    if (visible) start(); else stop();
  });
  window.addEventListener('resize', resize);
  window.addEventListener('load', resize);
  document.addEventListener('DOMContentLoaded', resize);
  setTimeout(resize, 120);
  setTimeout(resize, 600);
  // 头部高度会随内容（多行标语等）变化，跟随重算
  if (window.ResizeObserver) {
    try { new ResizeObserver(function () { resize(); }).observe(host); } catch (e) {}
  }
  host.addEventListener('pointermove', move);
  host.addEventListener('pointerdown', move);
  host.addEventListener('pointerleave', leave);

  /* 给演示面板用的接口 */
  window.HeroFx = {
    set: function (opts) {
      if (typeof opts.density === 'number') PREF.density = opts.density;
      if (typeof opts.links === 'boolean') PREF.links = opts.links;
      if (W && H) sync();
    },
    pause: function () { stop(); ctx.clearRect(0, 0, W, H); },
    resume: function () { resize(); start(); }
  };

  resize();
  start();

  /* 支持用 URL 参数预览不同参数：?density=0.6&links=0 */
  try {
    var q = window.location.search;
    if (q) {
      var m = /[?&]density=([\d.]+)/.exec(q);
      if (m) PREF.density = Math.max(0.2, Math.min(2.5, parseFloat(m[1]) || 1));
      if (/[?&]links=0/.test(q)) PREF.links = false;
      resize();
      build();
    }
  } catch (e) {}
})();
