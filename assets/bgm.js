/* ============================================================
 *  背景音乐：Web Audio 生成式轻音乐（零音频文件、零加载流量）
 *  - 打开页面立即尝试自动播放
 *  - 浏览器策略要求"用户首次交互后"才允许出声，被拦截时会在
 *    访客第一次点击/触摸/按键的瞬间自动开始（无需额外操作）
 *  - 右下角音符按钮可随时开关，静音偏好保存在 localStorage
 * ============================================================ */
(function () {
  'use strict';

  var STORE_KEY = 'pf-bgm';

  /* ---------- 悬浮开关按钮 ---------- */
  var btn = document.createElement('button');
  btn.className = 'bgm-toggle';
  btn.type = 'button';
  btn.setAttribute('aria-label', '背景音乐开关');
  btn.title = '背景音乐';
  btn.innerHTML =
    '<span class="bgm-ring"></span>' +
    '<svg viewBox="0 0 24 24" aria-hidden="true">' +
    '<path d="M9 18V6l10-2v11" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
    '<circle cx="6.5" cy="18" r="2.5" fill="currentColor"/>' +
    '<circle cx="16.5" cy="15" r="2.5" fill="currentColor"/>' +
    '</svg>';
  document.body.appendChild(btn);

  /* ---------- 音频引擎 ---------- */
  var ctx = null, master = null, timer = null, playing = false, step = 0;

  // 和弦进行：Fmaj7 → G → Em7 → Am7，温柔不吵
  var CHORDS = [
    [349.23, 440.00, 523.25, 659.25],
    [392.00, 493.88, 587.33, 698.46],
    [329.63, 392.00, 493.88, 587.33],
    [329.63, 440.00, 523.25, 659.25]
  ];
  // C 大调五声音阶高音区，随机拨弦用
  var PLUCKS = [523.25, 587.33, 659.25, 783.99, 880.00, 1046.5];

  function ensureCtx() {
    if (ctx) return true;
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    try { ctx = new AC(); } catch (e) { return false; }
    master = ctx.createGain();
    master.gain.value = 0.0001;
    if (ctx.createDynamicsCompressor) {
      var comp = ctx.createDynamicsCompressor();
      master.connect(comp);
      comp.connect(ctx.destination);
    } else {
      master.connect(ctx.destination);
    }
    return true;
  }

  function env(g, t, attack, dur, peak) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  }

  function playNote(freq, t, dur, peak, type) {
    var osc = ctx.createOscillator();
    var g = ctx.createGain();
    osc.type = type || 'sine';
    osc.frequency.value = freq;
    osc.connect(g);
    g.connect(master);
    env(g, t, 0.03, dur, peak);
    osc.start(t);
    osc.stop(t + dur + 0.1);
  }

  function playPad(freqs, t, dur) {
    freqs.forEach(function (f, i) {
      var osc = ctx.createOscillator();
      var g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = f / 2;            // 低八度铺底
      osc.detune.value = (i - 1.5) * 5;       // 轻微失谐让铺底更暖
      osc.connect(g);
      g.connect(master);
      env(g, t, 1.4, dur, 0.05);
      osc.start(t);
      osc.stop(t + dur + 0.2);
    });
  }

  // 一小节：一个和弦垫 + 随机散落的拨弦音
  function bar() {
    var t = ctx.currentTime + 0.05;
    var chord = CHORDS[step % CHORDS.length];
    playPad(chord, t, 6.5);
    var n = 4 + Math.floor(Math.random() * 3);
    for (var i = 0; i < n; i++) {
      var f = PLUCKS[Math.floor(Math.random() * PLUCKS.length)];
      playNote(f, t + i * (5.2 / n) + Math.random() * 0.3, 1.8, 0.04, 'triangle');
    }
    step++;
  }

  function start() {
    if (!ensureCtx()) return;
    if (ctx.state === 'suspended') ctx.resume();
    playing = true;
    btn.classList.add('on');
    btn.classList.remove('off');
    var now = ctx.currentTime;
    master.gain.cancelScheduledValues(now);
    master.gain.setValueAtTime(Math.max(master.gain.value, 0.0001), now);
    master.gain.linearRampToValueAtTime(0.9, now + 1.6);   // 淡入
    bar();
    if (timer) clearInterval(timer);
    timer = setInterval(function () { if (playing) bar(); }, 5200);
  }

  function stop(persist) {
    playing = false;
    btn.classList.remove('on');
    btn.classList.add('off');
    if (timer) { clearInterval(timer); timer = null; }
    if (ctx && master) {
      var now = ctx.currentTime;
      master.gain.cancelScheduledValues(now);
      master.gain.setValueAtTime(Math.max(master.gain.value, 0.0001), now);
      master.gain.linearRampToValueAtTime(0.0001, now + 0.6);  // 淡出
    }
    if (persist) { try { localStorage.setItem(STORE_KEY, 'off'); } catch (e) {} }
  }

  function isOff() {
    try { return localStorage.getItem(STORE_KEY) === 'off'; } catch (e) { return false; }
  }

  btn.addEventListener('click', function () {
    if (playing) {
      stop(true);
    } else {
      try { localStorage.removeItem(STORE_KEY); } catch (e) {}
      start();
    }
  });

  /* ---------- 启动策略：自动播 → 被拦截则首次交互自动开始 ---------- */
  function init() {
    if (isOff()) { btn.classList.add('off'); return; }   // 记住过静音：不自动播
    if (ensureCtx() && ctx.state === 'running') { start(); return; }
    var kick = function (e) {
      if (e && e.target && e.target.closest && e.target.closest('.bgm-toggle')) return;
      document.removeEventListener('pointerdown', kick);
      document.removeEventListener('touchstart', kick);
      document.removeEventListener('keydown', kick);
      if (!playing && !isOff()) start();
    };
    document.addEventListener('pointerdown', kick);
    document.addEventListener('touchstart', kick);
    document.addEventListener('keydown', kick);
    btn.classList.add('off');   // 待激活状态
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
