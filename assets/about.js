(function () {
  'use strict';

  const PF = window.PF;
  const cfg = window.SITE_CONFIG || (typeof SITE_CONFIG !== 'undefined' ? SITE_CONFIG : null);
  if (!cfg || !PF) { console.error('[about] 缺少 PF 或 SITE_CONFIG'); return; }

  const esc = PF.escapeHtml;
  const site = cfg.site || {};
  const about = cfg.about || {};

  document.title = '关于我 · ' + (site.name || '');

  const av = document.getElementById('avatar');
  if (site.avatar) {
    av.innerHTML = '<img src="' + esc(site.avatar) + '" alt="' + esc(site.name) + '">';
  } else {
    av.textContent = (site.name || '?').trim().charAt(0).toUpperCase();
  }

  document.getElementById('hero-name').textContent = site.name || '';
  document.getElementById('hero-tagline').textContent = site.tagline || '';
  document.getElementById('about-intro').textContent = about.intro || '';

  const countEl = document.getElementById('site-count');
  countEl.textContent = (cfg.sites || []).length;

  document.getElementById('skills').innerHTML =
    (about.skills || []).map((s) => '<span class="skill-tag">' + esc(s) + '</span>').join('');

  PF.renderContacts(document.getElementById('contacts'), cfg.contacts);
  PF.renderFooter(cfg, 'about.html');

  // 云端作品数量同步（失败时保留 data.js 的数量）
  (function () {
    if (!window.PFCloud) return;
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/@tencent-ai/workbuddy-cloud-sdk@dev/lib/index.global.js';
    s.onload = async () => {
      try {
        const cloud = window.PFCloud();
        if (!cloud) return;
        const { data } = await cloud.database.from('sites').select('id');
        if (Array.isArray(data) && data.length) countEl.textContent = data.length;
      } catch (e) { /* 保留静态数量 */ }
    };
    document.head.appendChild(s);
  })();
})();
