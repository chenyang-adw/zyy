/* 首页 / 关于我 / 404 三个页面共用的逻辑 */
window.PF = (function () {
  'use strict';

  function escapeHtml(str) {
    return String(str == null ? '' : str).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  // 只允许 http/https/mailto，阻断 javascript: 等危险协议
  function safeUrl(url) {
    try {
      const u = new URL(String(url), location.href);
      return ['http:', 'https:', 'mailto:'].indexOf(u.protocol) > -1 ? u.href : null;
    } catch (e) { return null; }
  }

  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text).then(() => true, () => fallbackCopy(text));
    }
    return Promise.resolve(fallbackCopy(text));
  }

  function fallbackCopy(text) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    document.body.removeChild(ta);
    return ok;
  }

  /* 联系方式：支持跳转型 {label,url} 与复制型 {label,value,copy:true} */
  function renderContacts(box, contacts) {
    if (!box) return;
    box.innerHTML = (contacts || []).map((c) => {
      if (c.copy && c.value) {
        return '<button type="button" class="copy-btn" data-copy="' + escapeHtml(c.value) + '">' +
          escapeHtml(c.label) + '</button>';
      }
      const href = safeUrl(c.url);
      if (!href) return '';
      return '<a href="' + escapeHtml(href) + '"' +
        (href.startsWith('mailto:') ? '' : ' target="_blank" rel="noopener noreferrer"') +
        '>' + escapeHtml(c.label) + '</a>';
    }).join('');

    box.querySelectorAll('.copy-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const text = btn.getAttribute('data-copy');
        copyText(text).then((ok) => {
          const original = btn.textContent;
          btn.textContent = ok ? '已复制 ' + text : text;
          btn.classList.add('done');
          setTimeout(() => { btn.textContent = original; btn.classList.remove('done'); }, 1600);
        });
      });
    });
  }

  /* 页面元信息 */
  function applyMeta(opts) {
    const setMeta = (selector, content, create) => {
      let el = document.querySelector('meta[' + selector + ']');
      if (!el && create) { el = document.createElement('meta'); document.head.appendChild(el); }
      if (el && content) el.setAttribute('content', content);
    };
    if (opts.title) document.title = opts.title;
    setMeta('name="description"', opts.description);
    setMeta('property="og:title"', opts.title);
    setMeta('property="og:description"', opts.description);
    setMeta('name="twitter:title"', opts.title);
    setMeta('name="twitter:description"', opts.description);
  }

  /* 页脚：统计 + 版权 + 页面导航 */
  function renderFooter(cfg, current) {
    const site = cfg.site || {};
    const f = cfg.footer || {};

    const parts = ['© ' + (site.year || new Date().getFullYear()) + ' ' + escapeHtml(site.name || '')];
    if (f.icp) parts.push(escapeHtml(f.icp));
    (f.extraLinks || []).forEach((l) => {
      const href = safeUrl(l.url);
      if (href) parts.push('<a href="' + escapeHtml(href) + '" target="_blank" rel="noopener noreferrer">' + escapeHtml(l.label) + '</a>');
    });

    const cr = document.getElementById('copyright');
    if (cr) cr.innerHTML = parts.join(' <span class="sep">·</span> ');

    const nav = document.getElementById('nav');
    if (nav) {
      const links = [{ label: '首页', href: 'index.html' }, { label: '关于我', href: 'about.html' }];
      nav.innerHTML = links.map((l) =>
        l.href === current
          ? '<span class="current">' + l.label + '</span>'
          : '<a href="' + l.href + '">' + l.label + '</a>'
      ).join(' <span class="sep">·</span> ');
    }

    const a = cfg.analytics || {};
    const stats = document.getElementById('stats');
    if (!stats) return;

    if (a.provider === 'local') {
      /* 自己的计数：基数是展示值，真实打开会继续往上加（存在本机） */
      const base = a.base || { pv: 1200, uv: 120 };
      let pv = 0, uv = 0;
      try {
        pv = parseInt(localStorage.getItem('pf.pv') || '0', 10) || 0;
        uv = parseInt(localStorage.getItem('pf.uv') || '0', 10) || 0;
        pv += 1;                                            // 每次打开算一次访问
        if (!localStorage.getItem('pf.seen')) { uv += 1; localStorage.setItem('pf.seen', '1'); }
        localStorage.setItem('pf.pv', String(pv));
        localStorage.setItem('pf.uv', String(uv));
      } catch (e) { /* 隐私模式等拿不到 storage 就只显示基数 */ }
      const fmt = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
      stats.innerHTML = '本站总访问 <b>' + fmt((base.pv || 0) + pv) + '</b> 次' +
        '<span class="sep">·</span>访客 <b>' + fmt((base.uv || 0) + uv) + '</b> 人';
    } else if (a.provider === 'busuanzi') {
      stats.innerHTML = '本站总访问 <b id="busuanzi_value_site_pv">–</b> 次<span class="sep">·</span>访客 <b id="busuanzi_value_site_uv">–</b> 人';
      const s = document.createElement('script');
      s.async = true;
      s.src = 'https://busuanzi.ibruce.info/busuanzi/2.3/busuanzi.pure.mini.js';
      document.body.appendChild(s);
    } else if (a.provider === 'umami' && a.umamiId) {
      stats.hidden = true;
      const s = document.createElement('script');
      s.async = true;
      s.src = (a.umamiHost || 'https://analytics.umami.is') + '/script.js';
      s.setAttribute('data-website-id', a.umamiId);
      document.body.appendChild(s);
    } else {
      stats.hidden = true;
    }
  }

  return {
    escapeHtml: escapeHtml,
    safeUrl: safeUrl,
    copyText: copyText,
    renderContacts: renderContacts,
    applyMeta: applyMeta,
    renderFooter: renderFooter
  };
})();
