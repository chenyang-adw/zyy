(function () {
  'use strict';

  const PF = window.PF;
  const cfg = window.SITE_CONFIG || (typeof SITE_CONFIG !== 'undefined' ? SITE_CONFIG : null);
  if (!cfg || !PF) { console.error('[portfolio] 缺少 PF 或 SITE_CONFIG'); return; }

  const esc = PF.escapeHtml;
  const site = cfg.site || {};
  // current 是实际渲染的数据源：先用 data.js 兜底，云端拉取成功后再替换
  let current = Array.isArray(cfg.sites) ? cfg.sites.slice() : [];

  const $ = (id) => document.getElementById(id);

  function hostOf(url) {
    try { return new URL(String(url), location.href).hostname.replace(/^www\./, ''); }
    catch (e) { return ''; }
  }

  const PALETTE = ['#4f46e5', '#0f766e', '#b45309', '#185fa5', '#993556', '#5f5e5a', '#3b6d11', '#7c3aed'];

  function autoColor(name) {
    let h = 0;
    for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
    return PALETTE[h % PALETTE.length];
  }

  /* ---------- 头部个人信息 ---------- */
  function renderHero() {
    PF.applyMeta({ title: site.title || site.name, description: site.description || '' });

    const url = site.domain ? 'https://' + site.domain.replace(/^https?:\/\//, '').replace(/\/+$/, '') + '/' : '';
    if (url) {
      let link = document.querySelector('link[rel="canonical"]');
      if (!link) { link = document.createElement('link'); link.rel = 'canonical'; document.head.appendChild(link); }
      link.href = url;
      let og = document.querySelector('meta[property="og:url"]');
      if (!og) { og = document.createElement('meta'); og.setAttribute('property', 'og:url'); document.head.appendChild(og); }
      og.setAttribute('content', url);
    }

    const av = $('avatar');
    if (site.avatar) {
      av.innerHTML = '<img src="' + esc(site.avatar) + '" alt="' + esc(site.name) + '">';
    } else {
      av.textContent = (site.name || '?').trim().charAt(0).toUpperCase();
    }

    $('hero-name').textContent = site.name || '';
    $('hero-tagline').textContent = site.tagline || '';

    PF.renderContacts($('contacts'), cfg.contacts);
  }

  /* ---------- 分类与搜索 ---------- */
  let tags = [];

  function rebuildTags() {
    tags = [];
    current.forEach((s) => { if (s.tag && tags.indexOf(s.tag) < 0) tags.push(s.tag); });
  }

  let activeTag = '全部';
  let keyword = '';

  function renderFilters() {
    const box = $('filters');
    const items = ['全部'].concat(tags);
    box.innerHTML = items.map((t) =>
      '<button type="button" data-tag="' + esc(t) + '"' +
      (t === activeTag ? ' class="active"' : '') + '>' + esc(t) +
      (t === '全部' ? ' (' + current.length + ')' : '') + '</button>'
    ).join('');

    box.querySelectorAll('button').forEach((btn) => {
      btn.addEventListener('click', () => {
        activeTag = btn.getAttribute('data-tag');
        box.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b === btn));
        renderGrid();
      });
    });
  }

  function matched() {
    const kw = keyword.trim().toLowerCase();
    return current.filter((s) => {
      if (activeTag !== '全部' && s.tag !== activeTag) return false;
      if (!kw) return true;
      const hay = [s.name, s.desc, s.tag, hostOf(s.url)].join(' ').toLowerCase();
      return hay.indexOf(kw) > -1;
    });
  }

  function cardHtml(s, i) {
    const isUpload = s.kind === 'upload';
    const href = PF.safeUrl(s.url);
    const host = hostOf(s.url);
    const color = s.color || autoColor(s.name || String(i));
    const icon = s.icon
      ? '<img src="' + esc(s.icon) + '" alt="">'
      : '<img data-favicon="' + esc(host) + '" alt="">';

    return '<a class="card" style="animation-delay:' + Math.min(i * 35, 420) + 'ms"' +
      (href ? ' href="' + esc(href) + '" target="_blank" rel="noopener noreferrer"'
            : isUpload ? ' href="#"' : '') +
      ' data-color="' + esc(color) + '"' +
      (isUpload ? ' data-kind="upload" data-path="' + esc(s.file_path || '') + '"' : '') + '>' +
      '<div class="card-top">' +
        '<span class="card-icon">' + icon + '<span class="card-fallback">' + esc((s.name || '?').trim().charAt(0).toUpperCase()) + '</span></span>' +
        '<span class="card-meta">' +
          '<p class="card-name">' + esc(s.name) + '</p>' +
          (host ? '<p class="card-host">' + esc(host) + '</p>' : '') +
        '</span>' +
      '</div>' +
      (s.desc ? '<p class="card-desc">' + esc(s.desc) + '</p>' : '') +
      (s.tag ? '<span class="card-tag">' + esc(s.tag) + '</span>' : '') +
      '</a>';
  }

  /* ---------- 模块分区渲染 ----------
   * cfg.homeSections = [{ title, desc?, tags? }]
   * - tags 缺省的分区收纳「未被前面分区认领」的全部站点
   * - 后续想加模块，在 data.js 里往 homeSections 追加即可
   */
  function splitBySections(list) {
    const sections = (Array.isArray(cfg.homeSections) && cfg.homeSections.length)
      ? cfg.homeSections
      : [{ title: '项目案例展示' }];
    const claimed = new Set();
    return sections.map((sec) => {
      const wanted = Array.isArray(sec.tags) ? sec.tags : null;
      const items = [];
      list.forEach((s) => {
        if (claimed.has(s)) return;
        if (!wanted || wanted.indexOf(s.tag) > -1) { items.push(s); claimed.add(s); }
      });
      return { sec: sec, items: items };
    });
  }

  function renderGrid() {
    const wrap = $('grid');
    const empty = $('empty');
    const items = matched();

    const groups = splitBySections(items);
    let idx = 0;
    wrap.innerHTML = groups
      .filter((g) => g.items.length)
      .map((g) =>
        '<section class="section">' +
          '<div class="section-head">' +
            '<h2>' + esc(g.sec.title) + '<span class="section-count">' + g.items.length + ' 个</span></h2>' +
            (g.sec.desc ? '<p class="section-desc">' + esc(g.sec.desc) + '</p>' : '') +
          '</div>' +
          '<div class="grid">' +
            g.items.map((s) => cardHtml(s, idx++)).join('') +
          '</div>' +
        '</section>'
      ).join('');

    empty.hidden = items.length > 0;
    if (!items.length) empty.textContent = keyword ? '没有匹配「' + keyword + '」的站点' : '这个分类下还没有站点';

    wrap.querySelectorAll('.card').forEach((el) => loadIcon(el));
  }

  /* ---------- 图标：指定图 → favicon 多源降级 → 首字母 ---------- */
  const FAVICON_SOURCES = [
    (h) => 'https://www.google.com/s2/favicons?sz=64&domain=' + encodeURIComponent(h),
    (h) => 'https://favicon.im/' + encodeURIComponent(h) + '?larger=true',
    (h) => 'https://' + h + '/favicon.ico'
  ];

  function loadIcon(card) {
    const img = card.querySelector('img[data-favicon]');
    const holder = card.querySelector('.card-icon');
    holder.style.background = card.getAttribute('data-color');
    if (!img) return;

    const host = img.getAttribute('data-favicon');
    const fallback = card.querySelector('.card-fallback');

    let idx = 0;
    (function tryNext() {
      if (idx >= FAVICON_SOURCES.length) { img.remove(); return; } // 全部失败：保留首字母
      const probe = new Image();
      probe.onload = () => {
        if (probe.width < 8) { idx++; tryNext(); return; }
        if (fallback) fallback.remove();
        img.src = probe.src;
      };
      probe.onerror = () => { idx++; tryNext(); };
      probe.src = FAVICON_SOURCES[idx](host);
    })();
  }

  /* ---------- 作品数据：三级来源 ----------
   * 1) api/sites  —— 自定义域名（Vercel）下的同源代理，服务端读云库
   * 2) 云端 SDK   —— 托管在 workbuddy 域名时直连云库
   * 3) data.js    —— 都拿不到时的静态兜底
   */
  function normalize(r) {
    return {
      id: r.id,
      name: r.name || '',
      url: r.url || '',
      desc: r.desc || r.summary || '',
      tag: r.tag || '',
      icon: r.icon || '',
      color: r.color || '',
      kind: r.kind || 'link',
      file_path: r.file_path || ''
    };
  }

  function applyList(list) {
    if (!Array.isArray(list) || !list.length) return false;
    current = list.map(normalize);
    activeTag = '全部';
    rebuildTags();
    renderFilters();
    renderGrid();
    return true;
  }

  function whenCloudReady(cb) {
    if (window.WorkBuddyCloud) return cb();
    const el = document.getElementById('cloud-sdk');
    if (!el) return;
    el.addEventListener('load', cb);
  }

  async function loadViaProxy() {
    try {
      const r = await fetch('api/sites', { headers: { Accept: 'application/json' } });
      if (!r.ok) return false;
      const data = await r.json();
      return applyList(data);
    } catch (e) {
      return false;
    }
  }

  function loadViaSdk() {
    whenCloudReady(async () => {
      try {
        const cloud = window.PFCloud && window.PFCloud();
        if (!cloud) return;
        const { data, error } = await cloud.database
          .from('sites')
          .select('*')
          .order('sort_order', { ascending: true })
          .order('id', { ascending: true });
        if (error || !Array.isArray(data) || !data.length) return;
        applyList(data);
      } catch (e) {
        // 云端不可用时静默保留 data.js 的静态清单
      }
    });
  }

  async function loadRemote() {
    if (await loadViaProxy()) return;
    loadViaSdk();
  }

  // 上传型作品：临时签名链接下载，游客无权限时给出提示
  async function openUploaded(path) {
    try {
      const cloud = window.PFCloud && window.PFCloud();
      if (!cloud) return window.alert('云服务组件未加载，请刷新页面重试');
      const { data, error } = await cloud.storage.createSignedUrl(path, 600);
      const url = !error && data ? (typeof data === 'string' ? data : (data.signedUrl || data.url)) : '';
      if (!url) return window.alert('这个文件需要登录后才能下载，微信联系我即可获取');
      window.open(url, '_blank', 'noopener');
    } catch (e) {
      window.alert('文件打开失败，微信联系我即可获取');
    }
  }

  $('grid').addEventListener('click', (e) => {
    const card = e.target.closest && e.target.closest('.card[data-kind="upload"]');
    if (!card) return;
    e.preventDefault();
    openUploaded(card.getAttribute('data-path'));
  });

  /* ---------- 启动 ---------- */
  renderHero();
  rebuildTags();
  renderFilters();
  renderGrid();
  PF.renderFooter(cfg, 'index.html');
  loadRemote();

  let timer = null;
  $('search').addEventListener('input', (e) => {
    clearTimeout(timer);
    const v = e.target.value;
    timer = setTimeout(() => { keyword = v; renderGrid(); }, 120);
  });

  // 按 / 快速聚焦搜索框
  document.addEventListener('keydown', (e) => {
    if (e.key === '/' && document.activeElement !== $('search')) {
      e.preventDefault();
      $('search').focus();
    }
  });
})();
