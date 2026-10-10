/* ============================================================
 *  背景音乐：播放 assets/bgm-60s.mp3（真实音频文件）
 *  - 打开页面立即尝试自动播放；被浏览器策略拦截时，会在访客
 *    第一次点击/触摸/按键的瞬间自动开始（无需额外操作）
 *  - 右下角音符按钮可随时开关，静音偏好保存在 localStorage
 *  - 片段时长 60 秒，循环播放，带淡入淡出
 * ============================================================ */
(function () {
  'use strict';

  var STORE_KEY = 'pf-bgm';
  var SRC = 'assets/bgm-60s.mp3';
  var VOLUME = 0.55;          // 最终音量（0~1），别太吵

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

  /* ---------- 音频与音量渐变 ---------- */
  var audio = null;
  var fadeTimer = null;
  var playing = false;

  function ensureAudio() {
    if (audio) return true;
    try {
      audio = new Audio(SRC);
      audio.loop = true;        // 60 秒片段循环播放
      audio.preload = 'auto';
      audio.volume = 0;
      audio.addEventListener('error', function () {
        playing = false;
        btn.classList.add('off');
      });
    } catch (e) { return false; }
    return true;
  }

  function fadeTo(target, ms, done) {
    if (!audio) return;
    if (fadeTimer) { clearInterval(fadeTimer); fadeTimer = null; }
    var from = audio.volume;
    var startedAt = Date.now();
    fadeTimer = setInterval(function () {
      var k = Math.min(1, (Date.now() - startedAt) / ms);
      audio.volume = Math.max(0, Math.min(1, from + (target - from) * k));
      if (k >= 1) {
        clearInterval(fadeTimer);
        fadeTimer = null;
        if (done) done();
      }
    }, 40);
  }

  function start() {
    if (playing) return;
    if (!ensureAudio()) return;
    var p = audio.play();
    var ok = function () {
      playing = true;
      btn.classList.add('on');
      btn.classList.remove('off');
      fadeTo(VOLUME, 1600);     // 淡入
    };
    var fail = function () {    // 被自动播放策略拦截
      playing = false;
      btn.classList.add('off');
    };
    if (p && p.then) { p.then(ok, fail); } else { ok(); }
  }

  function stop(persist) {
    playing = false;
    btn.classList.remove('on');
    btn.classList.add('off');
    if (audio) fadeTo(0, 600, function () { try { audio.pause(); } catch (e) {} });
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
    btn.classList.add('off');                            // 待激活状态
    if (!ensureAudio()) return;

    start();                                             // 直接尝试自动播放

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
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
