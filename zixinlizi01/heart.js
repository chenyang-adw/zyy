/* ============================================================
 *  爱心粒子 · 万千粒子汇成心跳（纯 Canvas，零依赖）
 *
 *  爱心用经典参数方程生成：
 *      x = 16 sin³t
 *      y = 13 cos t − 5 cos 2t − 2 cos 3t − cos 4t
 *
 *  · 粒子从屏幕下方像喷泉一样升起，汇聚成实心爱心
 *  · 汇聚后整体缓慢「呼吸」，每颗粒子还有各自的小抖动
 *  · 拖尾：每帧用半透明底色覆盖，快速移动的粒子自然拖出尾巴
 *  · 点击 / 触摸：爱心炸开，随后自动重新聚拢
 *  · 可调：window.HEART_CONFIG = { count, text, palette, breath, trail, speed }
 * ============================================================ */
(function () {
  'use strict';

  var CFG = Object.assign({
    count: 0,                 // 0 = 按屏幕面积自动
    text: '',                 // 爱心下方的一句话（留空不显示）
    palette: [                // 参考视频里的粉紫色系
      [255, 105, 180],        // 亮粉
      [255, 182, 193],        // 淡粉
      [186, 85, 211],         // 淡紫
      [220, 180, 220]         // 淡粉紫
    ],
    bg: [11, 10, 18],
    breath: 0.05,             // 呼吸幅度（相对心形大小）
    trail: 0.18,              // 拖尾强度：越小拖尾越长
    speed: 1                  // 整体速度倍率
  }, window.HEART_CONFIG || {});

  var canvas = document.getElementById('c');
  if (!canvas || !canvas.getContext) return;
  var ctx = canvas.getContext('2d');

  var W = 0, H = 0, DPR = 1;
  var cx = 0, cy = 0, kUnit = 1;          // 心形中心 + 每「心形单位」对应多少像素
  var poly = [];                          // 心形轮廓多边形（心形单位）
  var parts = [];
  var sprites = [];                       // 每种颜色的发光贴图
  var rafId = 0, last = 0, frameAt = 0, running = true;
  var T = 0;                              // 统一动画时钟（秒），避免混用两种时间源
  var reduce = window.matchMedia
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false;

  function rand(a, b) { return a + Math.random() * (b - a); }

  /* ---------- 心形参数方程 ---------- */
  function heartXY(t) {
    var x = 16 * Math.pow(Math.sin(t), 3);
    var y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
    return { x: x, y: -y };               // 屏幕 y 轴向下，取反让爱心正立
  }

  function buildPoly() {
    poly = [];
    var N = 720;
    for (var i = 0; i < N; i++) poly.push(heartXY(i / N * Math.PI * 2));
  }

  function inHeart(px, py) {              // 射线法判断点是否在心形内
    var inside = false;
    for (var i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      var xi = poly[i].x, yi = poly[i].y, xj = poly[j].x, yj = poly[j].y;
      if ((yi > py) !== (yj > py) && px < (xj - xi) * (py - yi) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }

  function bbox() {
    var minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
    poly.forEach(function (p) {
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
    });
    return { minX: minX, maxX: maxX, minY: minY, maxY: maxY, w: maxX - minX, h: maxY - minY };
  }

  /* ---------- 发光贴图（每种颜色一张，画起来快） ---------- */
  function makeSprite(rgb) {
    var S = 32;
    var cv = document.createElement('canvas');
    cv.width = cv.height = S;
    var c2 = cv.getContext('2d');
    var g = c2.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    var c = rgb[0] + ',' + rgb[1] + ',' + rgb[2];
    g.addColorStop(0, 'rgba(255,255,255,.95)');
    g.addColorStop(0.25, 'rgba(' + c + ',.92)');
    g.addColorStop(0.6, 'rgba(' + c + ',.35)');
    g.addColorStop(1, 'rgba(' + c + ',0)');
    c2.fillStyle = g;
    c2.beginPath(); c2.arc(S / 2, S / 2, S / 2, 0, 6.2832); c2.fill();
    return cv;
  }

  /* ---------- 粒子 ---------- */
  function makeParticle(box) {
    var onEdge = Math.random() < 0.34;     // 一部分贴着轮廓，一部分填满内部
    var hx, hy, guard = 0;
    if (onEdge) {
      var t = Math.random() * Math.PI * 2;
      var p = heartXY(t);
      hx = p.x + rand(-0.22, 0.22);
      hy = p.y + rand(-0.22, 0.22);
    } else {
      do {
        hx = rand(box.minX, box.maxX);
        hy = rand(box.minY, box.maxY);
        guard++;
      } while (!inHeart(hx, hy) && guard < 60);
    }
    var col = (Math.random() * CFG.palette.length) | 0;
    return {
      hx: hx, hy: hy,                      // 在「心形单位」里的目标位置
      x: 0, y: 0,
      sx: 0, sy: 0,                        // 起飞点
      t0: 0, rise: 1, mode: 'rise',
      col: col,
      r: onEdge ? rand(1.8, 3.4) : rand(1.4, 3.0),
      a: rand(0.6, 1),
      bs: rand(0.6, 2.2), bp: Math.random() * 6.2832, ba: rand(0.3, 1.5),   // 抖动
      vx: 0, vy: 0, bt: 0
    };
  }

  function layoutParticles() {
    var box = bbox();
    var area = window.innerWidth * window.innerHeight;
    var n = CFG.count > 0 ? CFG.count : Math.round(Math.min(5000, Math.max(1400, area / 320)));
    parts = [];
    for (var i = 0; i < n; i++) parts.push(makeParticle(box));
    resetFlight(true);
  }

  /* 让所有粒子从下方「喷泉」起飞 */
  function resetFlight(first) {
    var box = bbox();
    var spread = box.w * kUnit * 0.55;
    parts.forEach(function (p, i) {
      p.mode = 'rise';
      p.sx = cx + rand(-spread, spread);
      p.sy = H + rand(30, Math.max(60, H * 0.55));
      p.x = p.sx; p.y = p.sy;
      p.t0 = T + (first ? rand(0, 2.4) : rand(0, 0.5));
      p.rise = rand(0.9, 1.9);
      p.vx = p.vy = 0;
    });
  }

  /* ---------- 尺寸 ---------- */
  function fit() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);

    var box = bbox();
    // 爱心占屏幕的比例：宽 62%，高 58%，中心略靠上（下方留给喷泉）
    kUnit = Math.min(W * 0.70 / box.w, H * 0.62 / box.h);
    cx = W / 2;
    cy = H * 0.40 - (box.minY + box.h / 2) * kUnit;
    ctx.fillStyle = 'rgb(' + CFG.bg.join(',') + ')';
    ctx.fillRect(0, 0, W, H);
  }

  /* ---------- 缓动 ---------- */
  function easeOutBack(t) {
    var c1 = 1.15, c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  }

  /* ---------- 主循环 ---------- */
  function loop(ms) {
    frameAt = Date.now();
    var now = ms / 1000;
    var dt = last ? Math.min(0.05, now - last) : 0.016;
    last = now;
    T += dt;

    // 拖尾：半透明底色覆盖
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.fillStyle = 'rgba(' + CFG.bg.join(',') + ',' + CFG.trail + ')';
    ctx.fillRect(0, 0, W, H);

    ctx.globalCompositeOperation = 'lighter';
    var breathK = 1 + Math.sin(T * 1.35) * CFG.breath;

    for (var i = 0; i < parts.length; i++) {
      var p = parts[i];
      var tx = cx + p.hx * kUnit * breathK;
      var ty = cy + p.hy * kUnit * breathK;
      // 每颗粒子自己的小抖动
      tx += Math.sin(T * p.bs + p.bp) * p.ba;
      ty += Math.cos(T * p.bs * 0.87 + p.bp) * p.ba;

      if (p.mode === 'burst') {
        p.x += p.vx * dt * CFG.speed;
        p.y += p.vy * dt * CFG.speed;
        p.vx *= 0.985; p.vy *= 0.985;
        p.bt -= dt;
        if (p.bt <= 0) {
          p.mode = 'rise';
          p.sx = p.x; p.sy = p.y;
          p.t0 = T; p.rise = rand(0.9, 1.6);
        }
      } else {
        var t01 = (T - p.t0) / p.rise;
        if (t01 < 0) t01 = 0; else if (t01 > 1) t01 = 1;
        var e = reduce ? t01 : easeOutBack(t01);
        p.x = p.sx + (tx - p.sx) * e;
        p.y = p.sy + (ty - p.sy) * e;
      }

      var sp = sprites[p.col];
      var d = p.r * 2;
      ctx.globalAlpha = p.a;
      ctx.drawImage(sp, p.x - d / 2, p.y - d / 2, d, d);
    }
    ctx.globalAlpha = 1;

    // 可选文案
    if (CFG.text) {
      ctx.globalCompositeOperation = 'source-over';
      var fs = Math.max(18, Math.min(W, H) * 0.038);
      ctx.font = '600 ' + fs + 'px system-ui, -apple-system, "PingFang SC", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowColor = 'rgba(255,105,180,.85)';
      ctx.shadowBlur = fs * 0.7;
      ctx.fillStyle = 'rgba(255,225,238,.96)';
      ctx.fillText(CFG.text, W / 2, cy + bbox().maxY * kUnit + fs * 1.5);
      ctx.shadowBlur = 0;
    }

    rafId = running ? requestAnimationFrame(loop) : 0;
  }

  function kick() {
    if (rafId) cancelAnimationFrame(rafId);
    last = 0;
    rafId = requestAnimationFrame(loop);
  }

  /* ---------- 炸开 ---------- */
  function burst(px, py) {
    parts.forEach(function (p) {
      var dx = p.x - (px == null ? cx : px);
      var dy = p.y - (py == null ? cy : py);
      var d = Math.sqrt(dx * dx + dy * dy) || 1;
      var power = rand(180, 620) * CFG.speed;
      p.mode = 'burst';
      p.vx = dx / d * power;
      p.vy = dy / d * power - rand(20, 120);
      p.bt = rand(0.7, 1.6);
    });
  }

  var downAt = null;
  canvas.addEventListener('pointerdown', function (e) { downAt = { x: e.clientX, y: e.clientY }; });
  canvas.addEventListener('pointerup', function (e) {
    if (!downAt) return;
    var moved = Math.abs(e.clientX - downAt.x) + Math.abs(e.clientY - downAt.y);
    downAt = null;
    if (moved > 12) return;                  // 拖动不算点击
    burst(e.clientX, e.clientY);
  });
  canvas.addEventListener('dblclick', function () { burst(); });

  document.addEventListener('visibilitychange', function () {
    running = !document.hidden;
    if (running) kick();
  });

  var rt = 0;
  window.addEventListener('resize', function () {
    clearTimeout(rt);
    rt = setTimeout(function () { fit(); }, 180);
  });

  /* 看门狗：页面可见却没出帧就重启 */
  setInterval(function () {
    if (document.hidden) return;
    if (Date.now() - frameAt > 1500) kick();
  }, 1500);

  /* ---------- 启动 ---------- */
  buildPoly();
  sprites = CFG.palette.map(makeSprite);
  fit();
  layoutParticles();
  kick();

  /* 调试/自测接口 */
  window.HeartFx = {
    burst: burst,
    reshuffle: function () { resetFlight(false); },
    state: function () {
      var settled = 0;
      for (var i = 0; i < parts.length; i++) {
        if (parts[i].mode === 'rise' && (T - parts[i].t0) > parts[i].rise) settled++;
      }
      return {
        count: parts.length, settled: settled, size: [W, H],
        kUnit: Number(kUnit.toFixed(3)), center: [Math.round(cx), Math.round(cy)],
        running: running, reduce: reduce, T: Number(T.toFixed(2))
      };
    },
    /* 让所有粒子立刻到位（自测/截图用） */
    settleAll: function () {
      parts.forEach(function (p) { p.t0 = T - 10; p.mode = 'rise'; });
    }
  };
})();
