/* ============================================================
 *  贪吃蛇 · 自由模式（零依赖，纯 Canvas）
 *  · 蛇以任意角度平滑行走，不再是四方向格子
 *  · 电脑：鼠标移动转向 / 方向键；手机：按住棋盘拖动出现虚拟摇杆
 *  · 棋盘上随机散布发光粒子，吃掉变长
 *  · 皮肤 6 套（颜色全部读 CSS 变量）· 难度 4 档（含自适应）
 * ============================================================ */
(function () {
  'use strict';

  /* ---------------- 配置 ---------------- */
  var WORLD = 1000;        // 逻辑世界尺寸（正方形）
  var FOOD_MAX = 26;       // 场上粒子数
  var DUST_MAX = 90;       // 背景尘埃（随机排布）

  var SEG = 16;            // 身体取样间距（世界单位）
  var HEAD_R = 20, BODY_R = 17;
  var TURN_RATE = 10;      // 最大转向速度（弧度/秒，越大转向越灵活）
  var START_LEN = 190;     // 初始身长（世界单位）
  var UNIT_PER_CELL = 50;  // 仅用于把速度换算成“格/秒”显示

  var THEMES = [
    { id: 'classic', name: '经典', swatch: '#22c55e' },
    { id: 'neon',    name: '霓虹', swatch: '#22d3ee' },
    { id: 'pixel',   name: '复古', swatch: '#4b7f2a' },
    { id: 'candy',   name: '糖果', swatch: '#ec4899' },
    { id: 'mono',    name: '极简', swatch: '#2f3542' },
    { id: 'aurum',   name: '午夜', swatch: '#eab308' }
  ];

  var LEVELS = [
    { id: 'relax',  name: '舒缓',  base: 190, step: 4, max: 330 },
    { id: 'normal', name: '标准',  base: 255, step: 5, max: 400 },
    { id: 'hard',   name: '挑战',  base: 325, step: 6, max: 470 },
    { id: 'auto',   name: '自适应', base: 255, step: 5, max: 430 }
  ];

  /* 食物种类：权重决定出现概率，score 是分值，grow 是成长节数 */
  var FOOD_TYPES = [
    { e: '🍎', n: '苹果',   color: '#ef4444', r: 15, weight: 26, score: 1, grow: 1.6 },
    { e: '🍇', n: '葡萄',   color: '#a855f7', r: 15, weight: 10, score: 1, grow: 1.6 },
    { e: '🍒', n: '樱桃',   color: '#e11d48', r: 14, weight: 10, score: 1, grow: 1.6 },
    { e: '🍋', n: '柠檬',   color: '#eab308', r: 14, weight: 8,  score: 1, grow: 1.6 },
    { e: '🥑', n: '牛油果', color: '#65a30d', r: 15, weight: 8,  score: 2, grow: 2.2 },
    { e: '🧈', n: '黄油',   color: '#facc15', r: 14, weight: 5,  score: 2, grow: 2.2 },
    { e: '⭐', n: '星星',   color: '#fbbf24', r: 16, weight: 7,  score: 3, grow: 2.8 },
    { e: '🌙', n: '月亮',   color: '#93c5fd', r: 16, weight: 3,  score: 4, grow: 3.4 }
  ];

  var STORE = {
    theme: 'snake2.theme',
    level: 'snake2.level',
    wrap: 'snake2.wrap',
    sound: 'snake2.sound',
    best: 'snake2.best.',
    autoSpeed: 'snake2.autoSpeed'
    ,
    sizeMode: 'snake2.sizeMode'
  };

  /* ---------------- DOM ---------------- */
  var $ = function (id) { return document.getElementById(id); };
  var canvas = $('board');
  var ctx = canvas.getContext('2d');
  var elScore = $('score'), elBest = $('best'), elLen = $('len'), elSpeed = $('speed');
  var elSkins = $('skins'), elLevels = $('levels'), elWrap = $('wrapToggle');
  var overlay = $('overlay'), ovTitle = $('ovTitle'), ovSub = $('ovSub'), ovBtn = $('ovBtn'), ovTip = $('ovTip');
  var pauseBtn = $('pauseBtn'), restartBtn = $('restartBtn'), soundBtn = $('soundBtn');
  var sizeBtn = $('sizeBtn');
  var footNote = $('footNote');

  /* ---------------- 存储 ---------------- */
  function load(k, d) { try { var v = localStorage.getItem(k); return v === null ? d : v; } catch (e) { return d; } }
  function save(k, v) { try { localStorage.setItem(k, String(v)); } catch (e) {} }

  /* ---------------- 主题色 ---------------- */
  var C = {};
  function readThemeColors() {
    var cs = getComputedStyle(document.documentElement);
    var g = function (n) { return cs.getPropertyValue(n).trim(); };
    C.board = g('--board-bg') || '#0e1729';
    C.grid = g('--grid') || 'rgba(255,255,255,.05)';
    C.snake = g('--snake') || '#22c55e';
    C.head = g('--snake-head') || '#86efac';
    C.food = g('--food') || '#f43f5e';
    C.accent = g('--accent') || '#22c55e';
    C.text = g('--text') || '#ffffff';
  }

  function withAlpha(color, a) {
    var m = /^#?([0-9a-f]{6})$/i.exec(String(color).trim());
    if (m) {
      var n = parseInt(m[1], 16);
      return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
    }
    return color;
  }

  /* ---------------- 画布 ---------------- */
  var DPR = 1, view = 0, k = 1;          // k = 屏幕像素 / 世界单位

  /* 棋盘尽量吃满屏幕：宽度受容器限制，高度受“屏幕剩余空间”限制 */
  function fitStage() {
    var stage = canvas.parentNode;
    var wrap = stage.parentNode;
    var bcs = getComputedStyle(document.body);
    var used = (parseFloat(bcs.paddingTop) || 0) + (parseFloat(bcs.paddingBottom) || 0);
    for (var i = 0; i < wrap.children.length; i++) {
      var el = wrap.children[i];
      if (el === stage) continue;
      var st = getComputedStyle(el);
      used += el.getBoundingClientRect().height +
              (parseFloat(st.marginTop) || 0) + (parseFloat(st.marginBottom) || 0);
    }
    var avail = window.innerHeight - used - 10;
    // 两种模式：big = 尽量吃满高度（至少 86vh，可能会滚动）；fit = 一屏放下
    var target = sizeMode === 'fit' ? avail : Math.max(avail, window.innerHeight * 0.86);
    var size = Math.max(240, Math.min(wrap.clientWidth, target));
    stage.style.width = Math.round(size) + 'px';
    return size;
  }

  function fitCanvas() {
    fitStage();
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    var rect = canvas.getBoundingClientRect();
    view = Math.max(120, Math.min(rect.width, rect.height));
    canvas.width = Math.round(view * DPR);
    canvas.height = Math.round(view * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    k = view / WORLD;
    draw();
  }

  function toWorld(clientX, clientY) {
    var r = canvas.getBoundingClientRect();
    return { x: (clientX - r.left) / k, y: (clientY - r.top) / k };
  }

  /* ---------------- 状态 ---------------- */
  var nodes, dust, foods, eatFx;
  var head, ang, wantAng;
  var length, score, best, speed, alive, started, paused;
  var level = LEVELS[1], themeId = 'classic', wrap = false, soundOn = false;
  var sizeMode = 'big';                                  // 'big' 尽量大 | 'fit' 一屏放下
  var autoStart = 255;
  var lastTime = 0, lastEatAt = 0;
  var joy = { on: false, ox: 0, oy: 0, kx: 0, ky: 0 };   // 摇杆（屏幕坐标）
  var rafId = 0, frameAt = 0;                            // 帧循环句柄 + 看门狗时间戳

  function rand(a, b) { return a + Math.random() * (b - a); }
  function levelById(id) {
    for (var i = 0; i < LEVELS.length; i++) if (LEVELS[i].id === id) return LEVELS[i];
    return LEVELS[1];
  }
  function bestKey() { return STORE.best + level.id; }
  function angDiff(a) {                            // 归一化到 -PI..PI
    while (a > Math.PI) a -= Math.PI * 2;
    while (a < -Math.PI) a += Math.PI * 2;
    return a;
  }
  function dist(a, b) { var dx = a.x - b.x, dy = a.y - b.y; return Math.sqrt(dx * dx + dy * dy); }

  /* 背景尘埃：随机排布，一场游戏只生成一次 */
  function makeDust() {
    dust = [];
    for (var i = 0; i < DUST_MAX; i++) {
      dust.push({ x: Math.random() * WORLD, y: Math.random() * WORLD, r: rand(0.8, 2.4) * rand(0.6, 1.6), a: rand(0.10, 0.42) });
    }
  }

  /* 粒子（食物）：随机散布，且不落在蛇身上 */
  function pickFoodType() {                        // 按权重随机挑一种
    var total = 0, i;
    for (i = 0; i < FOOD_TYPES.length; i++) total += FOOD_TYPES[i].weight;
    var r = Math.random() * total;
    for (i = 0; i < FOOD_TYPES.length; i++) {
      r -= FOOD_TYPES[i].weight;
      if (r <= 0) return i;
    }
    return 0;
  }

  function makeFood() {
    var ti = pickFoodType();
    var ft = FOOD_TYPES[ti];
    for (var t = 0; t < 30; t++) {
      var p = { x: rand(30, WORLD - 30), y: rand(30, WORLD - 30) };
      var ok = true;
      for (var i = 0; i < nodes.length; i += 4) {
        if (dist(p, nodes[i]) < BODY_R * 4) { ok = false; break; }
      }
      if (ok && dist(p, head) > 90) {
        return { x: p.x, y: p.y, r: ft.r, ti: ti, ph: Math.random() * 6.2832, vx: rand(-5, 5), vy: rand(-5, 5) };
      }
    }
    return { x: rand(30, WORLD - 30), y: rand(30, WORLD - 30), r: ft.r, ti: ti, ph: 0, vx: 0, vy: 0 };
  }

  function reset() {
    head = { x: WORLD / 2, y: WORLD / 2 - 100 };
    ang = Math.PI / 2;                              // 朝下
    wantAng = ang;
    nodes = [];
    var need = Math.ceil(START_LEN / SEG);
    for (var i = 0; i < need; i++) {
      nodes.push({ x: head.x - Math.cos(ang) * i * SEG, y: head.y - Math.sin(ang) * i * SEG });
    }
    length = START_LEN;
    score = 0;
    alive = true;
    started = false;
    paused = false;
    eatFx = [];
    speed = level.id === 'auto' ? autoStart : level.base;
    joy.on = false;
    makeDust();
    foods = [];
    for (var f = 0; f < FOOD_MAX; f++) foods.push(makeFood());
    lastEatAt = performance.now();
    syncStats();
    syncOverlay('ready');
    draw();
  }

  /* ---------------- 自适应难度 ---------------- */
  function tuneSpeed() {
    if (level.id !== 'auto') {
      speed = Math.min(level.max, level.base + score * level.step);
      return;
    }
    var now = performance.now();
    var gap = (now - lastEatAt) / 1000;
    if (gap < 2.5) speed += 14;                     // 吃得又快又准 → 加速
    else if (gap > 6) speed -= 10;                  // 找太久 → 缓一缓
    else speed += 6;
    lastEatAt = now;
    speed = Math.max(150, Math.min(level.max, speed));
    autoStart = Math.max(150, Math.min(330, autoStart + 2));
  }

  /* ---------------- 一步推进 ---------------- */
  function advance(dt) {
    // 转身（限速，像真的蛇）
    var d = angDiff(wantAng - ang);
    var maxTurn = TURN_RATE * dt;
    ang += Math.max(-maxTurn, Math.min(maxTurn, d));

    head.x += Math.cos(ang) * speed * dt;
    head.y += Math.sin(ang) * speed * dt;

    if (wrap) {
      if (head.x < 0) head.x += WORLD; else if (head.x > WORLD) head.x -= WORLD;
      if (head.y < 0) head.y += WORLD; else if (head.y > WORLD) head.y -= WORLD;
    } else if (head.x < 0 || head.y < 0 || head.x > WORLD || head.y > WORLD) {
      return die('撞到墙了');
    }

    // 采样身体路径
    var last = nodes[0];
    if (!last || dist(last, head) > 3) nodes.unshift({ x: head.x, y: head.y });

    // 按目标身长裁掉尾巴
    var total = 0, i;
    for (i = 1; i < nodes.length; i++) {
      total += dist(nodes[i - 1], nodes[i]);
      if (total >= length) break;
    }
    if (i < nodes.length) nodes.length = i + 1;

    // 咬到自己（跳过靠近头部的若干节点）
    for (i = 12; i < nodes.length; i++) {
      if (dist(nodes[i], head) < BODY_R * 1.5) return die('咬到自己了');
    }

    // 吃粒子
    for (i = 0; i < foods.length; i++) {
      var f = foods[i];
      if (dist(f, head) < HEAD_R + f.r * 0.9) {
        var ft = FOOD_TYPES[f.ti] || FOOD_TYPES[0];
        eatFx.push({ x: f.x, y: f.y, born: performance.now(), txt: '+' + ft.score, color: ft.color });
        foods[i] = makeFood();
        score += ft.score;
        length += SEG * ft.grow;
        beep(700 + Math.min(500, score * 14), 0.05, 'eat');
        tuneSpeed();
        if (score > best) { best = score; save(bestKey(), best); }
        syncStats();
        break;
      }
    }
  }

  function die(why) {
    alive = false;
    started = false;
    joy.on = false;
    beep(170, 0.20, 'die');
    if (level.id === 'auto') {                       // 表现差就下次慢点起步
      autoStart = score < 4 ? Math.max(150, autoStart - 18) : Math.min(330, autoStart + 6);
      save(STORE.autoSpeed, autoStart.toFixed(0));
    }
    syncStats();
    syncOverlay('over', why);
  }

  /* ---------------- 主循环 ---------------- */
  function loop(t) {
    frameAt = Date.now();
    var dtMs = lastTime ? Math.min(100, t - lastTime) : 16;
    lastTime = t;
    var dt = dtMs / 1000;

    var now = performance.now();
    if (eatFx.length) eatFx = eatFx.filter(function (e) { return now - e.born < 520; });

    // 粒子极缓慢漂移（让画面活一点，但不影响吃）
    for (var i = 0; i < foods.length; i++) {
      var f = foods[i];
      f.x += f.vx * dt; f.y += f.vy * dt;
      if (f.x < 20 || f.x > WORLD - 20) f.vx *= -1;
      if (f.y < 20 || f.y > WORLD - 20) f.vy *= -1;
    }

    if (started && !paused && alive) advance(dt);
    draw();
    rafId = requestAnimationFrame(loop);
  }

  /* ---------------- 绘制 ---------------- */
  function draw() {
    if (!view) return;
    ctx.clearRect(0, 0, view, view);

    // 底色
    ctx.fillStyle = C.board;
    ctx.fillRect(0, 0, view, view);

    // 背景尘埃（随机排布）
    for (var i = 0; i < dust.length; i++) {
      var d = dust[i];
      ctx.fillStyle = withAlpha(C.head, (d.a * 0.5).toFixed(3));
      ctx.beginPath(); ctx.arc(d.x * k, d.y * k, Math.max(0.4, d.r * 0.7), 0, 6.2832); ctx.fill();
    }

    drawFoods();
    drawSnake();
    drawFx();
    drawJoystick();
  }

  function drawFoods() {
    var t = performance.now() / 1000;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (var i = 0; i < foods.length; i++) {
      var f = foods[i];
      var ft = FOOD_TYPES[f.ti] || FOOD_TYPES[0];
      var x = f.x * k, y = f.y * k;
      var r = f.r * k * (1 + Math.sin(t * 3 + f.ph) * 0.10);

      // 光晕（按食物种类配色）
      var g = ctx.createRadialGradient(x, y, 0, x, y, r * 3.6);
      g.addColorStop(0, withAlpha(ft.color, 0.40));
      g.addColorStop(1, withAlpha(ft.color, 0));
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(x, y, r * 3.6, 0, 6.2832); ctx.fill();

      // 食物本体：表情符号（苹果 / 葡萄 / 樱桃 / 柠檬 / 牛油果 / 黄油 / 星星 / 月亮）
      ctx.font = Math.round(r * 2.05) + 'px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif';
      ctx.fillText(ft.e, x, y + r * 0.06);
    }
  }

  function drawSnake() {
    var n = nodes.length;
    if (!n) return;

    var r = BODY_R * k;
    var tailStart = Math.max(0, n - 8);

    // 身体主体：一条粗折线（圆角圆头，天然平滑，不会有"串珠"边界）
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = C.snake;
    ctx.lineWidth = r * 2;
    ctx.beginPath();
    for (var i = 0; i <= tailStart; i++) {
      var p = nodes[i];
      if (i === 0) ctx.moveTo(p.x * k, p.y * k); else ctx.lineTo(p.x * k, p.y * k);
    }
    ctx.stroke();

    // 尾巴渐细（不透明圆点，颜色统一，不会有叠加边界）
    for (var j = n - 1; j >= tailStart; j--) {
      var t = j / Math.max(1, n - 1);
      ctx.fillStyle = C.snake;
      ctx.beginPath();
      ctx.arc(nodes[j].x * k, nodes[j].y * k, r * (1 - t * 0.5), 0, 6.2832);
      ctx.fill();
    }

    // 头（用精确位置 + 光晕 + 眼睛）
    var hx = head.x * k, hy = head.y * k;
    var g = ctx.createRadialGradient(hx, hy, 0, hx, hy, HEAD_R * 3.4 * k);
    g.addColorStop(0, withAlpha(C.head, 0.45));
    g.addColorStop(1, withAlpha(C.head, 0));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(hx, hy, HEAD_R * 3.4 * k, 0, 6.2832); ctx.fill();

    ctx.fillStyle = C.head;
    ctx.beginPath(); ctx.arc(hx, hy, HEAD_R * k, 0, 6.2832); ctx.fill();

    // 眼睛：垂直于前进方向
    var ex = Math.cos(ang + Math.PI / 2), ey = Math.sin(ang + Math.PI / 2);
    var fx = Math.cos(ang), fy = Math.sin(ang);
    var er = Math.max(1.1, HEAD_R * 0.26 * k);
    for (var s = -1; s <= 1; s += 2) {
      var px = hx + ex * HEAD_R * 0.42 * k * s + fx * HEAD_R * 0.34 * k;
      var py = hy + ey * HEAD_R * 0.42 * k * s + fy * HEAD_R * 0.34 * k;
      ctx.fillStyle = 'rgba(8,12,22,.88)';
      ctx.beginPath(); ctx.arc(px, py, er, 0, 6.2832); ctx.fill();
    }
  }

  function drawFx() {
    var now = performance.now();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (var i = 0; i < eatFx.length; i++) {
      var e = eatFx[i], p = (now - e.born) / 520;
      ctx.strokeStyle = withAlpha(e.color || C.food, ((1 - p) * 0.7).toFixed(3));
      ctx.lineWidth = Math.max(1, 3 * (1 - p));
      ctx.beginPath(); ctx.arc(e.x * k, e.y * k, (10 + p * 60) * k, 0, 6.2832); ctx.stroke();

      if (e.txt) {                                   // “+2” 一边上升一边淡出
        ctx.fillStyle = withAlpha(C.head, (1 - p).toFixed(3));
        ctx.font = 'bold ' + Math.round(16 * k + 7) + 'px system-ui, -apple-system, sans-serif';
        ctx.fillText(e.txt, e.x * k, e.y * k - p * 36);
      }
    }
  }

  function drawJoystick() {
    if (!joy.on) return;
    var base = 46, knob = 22;
    ctx.strokeStyle = withAlpha(C.text, 0.22);
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(joy.ox, joy.oy, base, 0, 6.2832); ctx.stroke();
    ctx.fillStyle = withAlpha(C.text, 0.07);
    ctx.beginPath(); ctx.arc(joy.ox, joy.oy, base, 0, 6.2832); ctx.fill();
    ctx.fillStyle = withAlpha(C.accent, 0.85);
    ctx.beginPath(); ctx.arc(joy.kx, joy.ky, knob, 0, 6.2832); ctx.fill();
  }

  /* ---------------- 音效 ---------------- */
  var actx = null;
  function beep(freq, dur, kind) {
    if (!soundOn) return;
    try {
      if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
      var o = actx.createOscillator(), g = actx.createGain();
      o.type = kind === 'die' ? 'sawtooth' : 'triangle';
      o.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, actx.currentTime);
      g.gain.exponentialRampToValueAtTime(kind === 'die' ? 0.16 : 0.09, actx.currentTime + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, actx.currentTime + dur);
      o.connect(g); g.connect(actx.destination);
      o.start(); o.stop(actx.currentTime + dur + 0.03);
    } catch (e) {}
  }

  /* ---------------- 界面 ---------------- */
  function syncStats() {
    elScore.textContent = score;
    elBest.textContent = best;
    elLen.textContent = Math.max(3, Math.floor(length / SEG));
    elSpeed.textContent = (speed / UNIT_PER_CELL).toFixed(1);
  }

  function syncOverlay(state, why) {
    if (state === 'hide') { overlay.hidden = true; return; }
    overlay.hidden = false;
    if (state === 'ready') {
      ovTitle.textContent = '准备好了吗？';
      ovSub.textContent = '吃掉光点会变长，别撞墙、别咬到自己';
      ovBtn.textContent = '开始游戏';
      ovTip.textContent = '手机：按住棋盘拖动 = 摇杆';
    } else if (state === 'paused') {
      ovTitle.textContent = '已暂停';
      ovSub.textContent = '按空格或点下面的按钮继续';
      ovBtn.textContent = '继续游戏';
      ovTip.textContent = '当前分数 ' + score;
    } else if (state === 'over') {
      ovTitle.textContent = why || '游戏结束';
      ovSub.textContent = '本次得分 ' + score + ' · 身长 ' + Math.max(3, Math.floor(length / SEG)) + ' 节';
      ovBtn.textContent = '再来一局';
      ovTip.textContent = score >= best && score > 0 ? '🎉 新纪录！' : '最高分 ' + best;
    }
  }

  function syncChips() {
    Array.prototype.forEach.call(elSkins.querySelectorAll('.chip'), function (b) {
      b.setAttribute('aria-pressed', b.dataset.theme === themeId ? 'true' : 'false');
    });
    Array.prototype.forEach.call(elLevels.querySelectorAll('.chip'), function (b) {
      b.setAttribute('aria-pressed', b.dataset.level === level.id ? 'true' : 'false');
    });
  }

  function syncFootNote() {
    footNote.textContent = level.id === 'auto'
      ? '自适应难度：吃得又快又准就加速，找太久就减速'
      : '固定难度：每吃一个粒子略微加速';
  }

  function setTheme(id) {
    themeId = id;
    document.documentElement.dataset.theme = id;
    readThemeColors();
    syncChips();
    save(STORE.theme, id);
    draw();
  }

  function setLevel(id) {
    level = levelById(id);
    save(STORE.level, id);
    best = parseInt(load(bestKey(), '0'), 10) || 0;
    syncChips();
    syncFootNote();
    reset();
  }

  /* ---------------- 输入 ---------------- */
  function aimAt(worldPt) {
    wantAng = Math.atan2(worldPt.y - head.y, worldPt.x - head.x);
  }

  function start() {
    if (!alive) reset();
    started = true;
    paused = false;
    lastEatAt = performance.now();
    syncOverlay('hide');
    pauseBtn.textContent = '暂停';
  }

  function togglePause() {
    if (!started || !alive) return;
    paused = !paused;
    joy.on = false;
    pauseBtn.textContent = paused ? '继续' : '暂停';
    if (paused) syncOverlay('paused'); else syncOverlay('hide');
  }

  canvas.addEventListener('pointerdown', function (e) {
    if (!started || paused || !alive) return;
    var r = canvas.getBoundingClientRect();
    joy.on = true;
    joy.ox = e.clientX - r.left;
    joy.oy = e.clientY - r.top;
    joy.kx = joy.ox; joy.ky = joy.oy;
    try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
    e.preventDefault();
  });

  canvas.addEventListener('pointermove', function (e) {
    var r = canvas.getBoundingClientRect();
    var x = e.clientX - r.left, y = e.clientY - r.top;

    if (joy.on) {                                     // 摇杆：拖动决定方向
      var dx = x - joy.ox, dy = y - joy.oy;
      var len = Math.sqrt(dx * dx + dy * dy) || 1;
      var R = 46;
      var cl = Math.min(len, R);
      joy.kx = joy.ox + dx / len * cl;
      joy.ky = joy.oy + dy / len * cl;
      if (len > 6) aimAt(toWorld(canvas.getBoundingClientRect().left + joy.ox + dx / len * R,
                                 canvas.getBoundingClientRect().top + joy.oy + dy / len * R));
      return;
    }

    if (e.pointerType === 'mouse' && started && !paused && alive) {   // 电脑：鼠标指向即转向
      aimAt(toWorld(e.clientX, e.clientY));
    }
  });

  function endJoy() { joy.on = false; }
  canvas.addEventListener('pointerup', endJoy);
  canvas.addEventListener('pointercancel', endJoy);
  canvas.addEventListener('pointerleave', function (e) { if (e.pointerType !== 'mouse') endJoy(); });

  document.addEventListener('keydown', function (e) {
    var kk = e.key;
    var map = { ArrowUp: -Math.PI / 2, ArrowRight: 0, ArrowDown: Math.PI / 2, ArrowLeft: Math.PI };
    var wasd = { w: -Math.PI / 2, d: 0, s: Math.PI / 2, a: Math.PI };
    var lower = kk.length === 1 ? kk.toLowerCase() : kk;

    if (map[kk] !== undefined || wasd[lower] !== undefined) {
      if (!started && alive) start();
      wantAng = map[kk] !== undefined ? map[kk] : wasd[lower];
      e.preventDefault();
    } else if (kk === ' ') {
      togglePause();
      e.preventDefault();
    } else if (kk === 'Enter') {
      if (!alive) { reset(); start(); } else start();
    }
  });

  ovBtn.addEventListener('click', function () {
    if (!alive) { reset(); start(); return; }
    if (paused) { togglePause(); return; }
    start();
  });
  pauseBtn.addEventListener('click', togglePause);
  restartBtn.addEventListener('click', function () { reset(); start(); });
  soundBtn.addEventListener('click', function () {
    soundOn = !soundOn;
    soundBtn.textContent = '音效：' + (soundOn ? '开' : '关');
    save(STORE.sound, soundOn ? '1' : '0');
    if (soundOn) beep(680, 0.06, 'eat');
  });
  function syncSizeBtn() { sizeBtn.textContent = '棋盘：' + (sizeMode === 'big' ? '大' : '适应'); }
  sizeBtn.addEventListener('click', function () {
    sizeMode = sizeMode === 'big' ? 'fit' : 'big';
    save(STORE.sizeMode, sizeMode);
    syncSizeBtn();
    fitCanvas();
  });
  elWrap.addEventListener('change', function () {
    wrap = elWrap.checked;
    save(STORE.wrap, wrap ? '1' : '0');
    if (!started) syncOverlay('ready');
  });

  document.addEventListener('visibilitychange', function () {
    if (document.hidden && started && !paused) togglePause();
  });
  window.addEventListener('resize', fitCanvas);
  if (window.ResizeObserver) {
    try { new ResizeObserver(fitCanvas).observe(canvas.parentNode); } catch (e) {}
  }
  /* 帧循环：只会有一个在跑 */
  function kick() {
    if (rafId) cancelAnimationFrame(rafId);
    lastTime = 0;
    rafId = requestAnimationFrame(loop);
  }

  /* 看门狗：页面可见却没出帧时自动重启循环 */
  setInterval(function () {
    if (document.hidden || !view) return;
    if (Date.now() - frameAt > 1500) kick();
  }, 1500);

  /* ---------------- 初始化 ---------------- */
  function buildChips() {
    THEMES.forEach(function (t) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip';
      b.dataset.theme = t.id;
      b.innerHTML = '<span class="dot" style="--swatch:' + t.swatch + '"></span>' + t.name;
      b.addEventListener('click', function () { setTheme(t.id); });
      elSkins.appendChild(b);
    });
    LEVELS.forEach(function (l) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip';
      b.dataset.level = l.id;
      b.textContent = l.name;
      b.addEventListener('click', function () { setLevel(l.id); });
      elLevels.appendChild(b);
    });
  }

  function init() {
    buildChips();

    themeId = load(STORE.theme, 'classic');
    wrap = load(STORE.wrap, '0') === '1';
    elWrap.checked = wrap;
    soundOn = load(STORE.sound, '0') === '1';
    soundBtn.textContent = '音效：' + (soundOn ? '开' : '关');
    sizeMode = load(STORE.sizeMode, 'big') === 'fit' ? 'fit' : 'big';
    syncSizeBtn();
    autoStart = parseFloat(load(STORE.autoSpeed, '255')) || 255;
    level = levelById(load(STORE.level, 'auto'));
    best = parseInt(load(bestKey(), '0'), 10) || 0;

    // 地址栏参数预览：?theme=candy&level=hard
    try {
      var q = window.location.search;
      var mt = /[?&]theme=([a-z]+)/.exec(q);
      if (mt && THEMES.some(function (t) { return t.id === mt[1]; })) themeId = mt[1];
      var ml = /[?&]level=([a-z]+)/.exec(q);
      if (ml && LEVELS.some(function (l) { return l.id === ml[1]; })) level = levelById(ml[1]);
    } catch (e) {}
    document.documentElement.dataset.theme = themeId;

    readThemeColors();
    syncChips();
    syncFootNote();
    reset();
    syncOverlay('ready');
    fitCanvas();

    kick();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  /* 调试/自测接口 */
  window.SnakeGame = {
    advance: function (n, dt) { for (var i = 0; i < n && alive; i++) advance(dt || 1 / 60); draw(); },
    aim: function (a) { wantAng = a; },
    aimNearest: function () {
      var bd = 1e9, best = null;
      for (var i = 0; i < foods.length; i++) {
        var d = dist(foods[i], head);
        if (d < bd) { bd = d; best = foods[i]; }
      }
      if (best) wantAng = Math.atan2(best.y - head.y, best.x - head.x);
      return best ? Math.round(bd) : -1;
    },
    state: function () {
      return {
        score: score, len: nodes.length, body: Math.floor(length / SEG),
        alive: alive, started: started, ang: Number(ang.toFixed(3)),
        head: { x: Number(head.x.toFixed(1)), y: Number(head.y.toFixed(1)) },
        speed: Math.round(speed), foods: foods.length, best: best, autoStart: Math.round(autoStart)
        ,
        variety: (function () {
          var seen = {}, n = 0;
          for (var i = 0; i < foods.length; i++) {
            var nm = (FOOD_TYPES[foods[i].ti] || {}).n || '?';
            if (!seen[nm]) { seen[nm] = 1; n++; }
          }
          return n + '种:' + Object.keys(seen).join('/');
        })()
      };
    },
    start: start
  };
})();
