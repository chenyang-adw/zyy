(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const msgBox = $('msg');

  // 云服务按域名校验来源，后台只能在托管域名下打开；自定义域名上打开会 403
  const ADMIN_HOST = 'portfolio-hub-92035.app.workbuddy.host';
  const ADMIN_URL = 'https://' + ADMIN_HOST + '/admin.html';
  if (location.hostname !== ADMIN_HOST) {
    msgBox.hidden = false;
    msgBox.className = 'msg err';
    msgBox.innerHTML = '后台只能在专用地址打开（云服务按域名校验来源）。请访问：' +
      '<a href="' + ADMIN_URL + '" style="color:inherit;text-decoration:underline">' + ADMIN_URL + '</a>';
    return;
  }

  const cloud = window.PFCloud && window.PFCloud();
  if (!cloud) {
    show('云服务 SDK 加载失败，请检查网络后刷新页面。', 'err');
    return;
  }

  let session = null;
  let sites = [];
  let editing = null;
  let pendingSignup = null;
  let resetFlow = null;
  let uploading = false;

  function show(text, type) {
    if (!text) { msgBox.hidden = true; return; }
    msgBox.hidden = false;
    msgBox.textContent = text;
    msgBox.className = 'msg ' + (type === 'err' ? 'err' : type === 'ok' ? 'ok' : '');
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  /* ---------- 登录态 ---------- */
  async function init() {
    bindAuthForms();
    bindPanel();
    const { data } = await cloud.auth.getSession();
    if (data) onSignedIn(data);
    else showLogin();
  }

  function showLogin() {
    $('login-view').hidden = false;
    $('panel-view').hidden = true;
    $('logout-btn').hidden = true;
    $('admin-user').textContent = '';
  }

  function onSignedIn(s) {
    session = s;
    $('login-view').hidden = true;
    $('panel-view').hidden = false;
    $('logout-btn').hidden = false;
    $('admin-user').textContent = (s.user && (s.user.email || s.user.phone)) || '已登录';
    loadSites();
  }

  function bindAuthForms() {
    document.querySelectorAll('.tab').forEach((tab) => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t === tab));
        const name = tab.getAttribute('data-tab');
        $('form-password').hidden = name !== 'password';
        $('form-signup').hidden = name !== 'signup';
        $('form-reset').hidden = name !== 'reset';
        show('');
      });
    });

    $('form-password').addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = $('pw-email').value.trim();
      const password = $('pw-password').value;
      const { data, error } = await cloud.auth.signInWithPassword({ email, password });
      if (error) return show('登录失败：' + error.message, 'err');
      show('登录成功', 'ok');
      onSignedIn(data);
    });

    $('su-send').addEventListener('click', async () => {
      const email = $('su-email').value.trim();
      if (!/^\S+@\S+\.\S+$/.test(email)) return show('请输入正确的邮箱地址', 'err');
      const sent = await cloud.auth.sendOtp({ email });
      if (sent.error) return show('验证码发送失败：' + sent.error.message, 'err');
      pendingSignup = { email, verificationId: sent.data.verificationId, isExistingUser: sent.data.isExistingUser };
      show('验证码已发送到邮箱，请查收', 'ok');
    });

    $('form-signup').addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = $('su-email').value.trim();
      const password = $('su-password').value;
      const token = $('su-code').value.trim();
      if (!pendingSignup || pendingSignup.email !== email) return show('请先获取当前邮箱的验证码', 'err');
      if (password.length < 6) return show('密码至少 6 位', 'err');
      const done = await cloud.auth.verifyOtp({
        email: pendingSignup.email,
        verificationId: pendingSignup.verificationId,
        isExistingUser: pendingSignup.isExistingUser,
        token,
        password: pendingSignup.isExistingUser ? undefined : password
      });
      if (done.error) return show('注册失败：' + done.error.message, 'err');
      pendingSignup = null;
      show('注册成功', 'ok');
      onSignedIn(done.data);
    });

    $('rs-send').addEventListener('click', async () => {
      const email = $('rs-email').value.trim();
      if (!/^\S+@\S+\.\S+$/.test(email)) return show('请输入正确的邮箱地址', 'err');
      const started = await cloud.auth.resetPasswordForEmail(email);
      if (started.error) return show('发送失败：' + started.error.message, 'err');
      resetFlow = started.data;
      show('验证码已发送，请填写验证码和新密码', 'ok');
    });

    $('form-reset').addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!resetFlow) return show('请先获取验证码', 'err');
      const nonce = $('rs-code').value.trim();
      const password = $('rs-password').value;
      if (password.length < 6) return show('新密码至少 6 位', 'err');
      const done = await resetFlow.updateUser({ nonce, password });
      if (done.error) return show('重置失败：' + done.error.message, 'err');
      resetFlow = null;
      show('密码已重置，请用新密码登录', 'ok');
      document.querySelector('.tab[data-tab="password"]').click();
    });

    $('logout-btn').addEventListener('click', async () => {
      await cloud.auth.signOut();
      session = null;
      showLogin();
      show('已退出登录');
    });
  }

  /* ---------- 作品列表 ---------- */
  async function loadSites() {
    const { data, error } = await cloud.database
      .from('sites')
      .select('*')
      .order('sort_order', { ascending: true })
      .order('id', { ascending: true });

    if (error) {
      show('读取失败：' + error.message + '（错误码 ' + (error.code || '无') + '）', 'err');
      return;
    }
    sites = Array.isArray(data) ? data : [];
    renderList();
  }

  function renderList() {
    $('site-count').textContent = sites.length;
    const box = $('site-list');
    if (!sites.length) {
      box.innerHTML = '<p class="hint">还没有作品，点右上角「新增作品」添加第一个。</p>';
      return;
    }
    box.innerHTML = sites.map((s, i) => {
      const target = s.kind === 'upload' ? ('云端文件：' + (s.file_path || '').split('/').pop()) : s.url;
      return '<div class="admin-item">' +
        '<div class="admin-item-main">' +
          '<span class="dot" style="background:' + esc(s.color || '#4f46e5') + '"></span>' +
          '<div class="admin-item-text">' +
            '<p class="admin-item-name">' + esc(s.name) + '</p>' +
            '<p class="admin-item-sub">' + esc(target || '—') + (s.tag ? ' · ' + esc(s.tag) : '') + '</p>' +
          '</div>' +
        '</div>' +
        '<div class="admin-item-ops">' +
          '<button type="button" data-act="up" data-id="' + s.id + '"' + (i === 0 ? ' disabled' : '') + '>↑</button>' +
          '<button type="button" data-act="down" data-id="' + s.id + '"' + (i === sites.length - 1 ? ' disabled' : '') + '>↓</button>' +
          '<button type="button" data-act="edit" data-id="' + s.id + '">编辑</button>' +
          '<button type="button" data-act="del" data-id="' + s.id + '" class="danger">删除</button>' +
        '</div>' +
      '</div>';
    }).join('');

    box.querySelectorAll('button[data-act]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = Number(btn.getAttribute('data-id'));
        const act = btn.getAttribute('data-act');
        if (act === 'edit') openForm(sites.find((x) => x.id === id));
        else if (act === 'del') removeSite(id);
        else if (act === 'up') move(id, -1);
        else if (act === 'down') move(id, 1);
      });
    });
  }

  /* ---------- 增删改 ---------- */
  function bindPanel() {
    $('add-btn').addEventListener('click', () => openForm(null));
    $('cancel-btn').addEventListener('click', closeForm);
    $('f-kind').addEventListener('change', syncKind);
    $('form-site').addEventListener('submit', saveSite);
  }

  function syncKind() {
    const isUpload = $('f-kind').value === 'upload';
    $('wrap-url').hidden = isUpload;
    $('wrap-file').hidden = !isUpload;
    $('file-hint').hidden = !isUpload;
  }

  function openForm(item) {
    editing = item || null;
    $('edit-title').textContent = item ? '编辑作品' : '新增作品';
    $('f-name').value = item ? item.name || '' : '';
    $('f-kind').value = item ? (item.kind || 'link') : 'link';
    $('f-url').value = item ? item.url || '' : '';
    $('f-summary').value = item ? item.summary || '' : '';
    $('f-tag').value = item ? item.tag || '' : '';
    $('f-color').value = item && item.color ? item.color : '#4f46e5';
    $('f-sort').value = item ? (item.sort_order || 0) : (sites.length ? (sites[sites.length - 1].sort_order || 0) + 1 : 0);
    $('f-file').value = '';
    syncKind();
    $('edit-panel').hidden = false;
    $('edit-panel').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    show('');
  }

  function closeForm() {
    editing = null;
    $('edit-panel').hidden = true;
  }

  function safeFileName(name) {
    return Date.now() + '-' + String(name).replace(/[^a-zA-Z0-9._-]/g, '-');
  }

  function readAsDataUrl(file) {
    return new Promise((resolve) => {
      const fr = new FileReader();
      fr.onload = () => resolve(String(fr.result));
      fr.onerror = () => resolve('');
      fr.readAsDataURL(file);
    });
  }

  async function saveSite(e) {
    e.preventDefault();
    if (uploading) return;

    const kind = $('f-kind').value;
    const name = $('f-name').value.trim();
    if (!name) return show('请填写作品名称', 'err');

    let url = $('f-url').value.trim();
    let filePath = editing ? editing.file_path : null;
    let icon = editing ? editing.icon : null;

    if (kind === 'link') {
      if (!/^https?:\/\/\S+$/i.test(url)) return show('跳转链接必须以 http:// 或 https:// 开头', 'err');
      filePath = null;
    } else {
      const file = $('f-file').files && $('f-file').files[0];
      if (!file && !editing) return show('请选择一个要上传的文件', 'err');
      if (file) {
        uploading = true;
        $('save-btn').disabled = true;
        show('文件上传中…');
        try {
          const path = cloud.storage.sharedPath(session.user.id, 'works/' + safeFileName(file.name));
          const up = await cloud.storage.upload(path, file, {
            contentType: file.type || 'application/octet-stream',
            upsert: true
          });
          if (up.error) throw new Error(up.error.message);
          filePath = path;
          url = url || '';
          if (/^image\//.test(file.type) && file.size <= 300 * 1024) icon = await readAsDataUrl(file);
        } catch (err) {
          uploading = false;
          $('save-btn').disabled = false;
          return show('上传失败：' + err.message, 'err');
        }
        uploading = false;
        $('save-btn').disabled = false;
      }
      if (!filePath) return show('请先上传文件', 'err');
    }

    const payload = {
      name,
      url: url || '',
      summary: $('f-summary').value.trim(),
      tag: $('f-tag').value.trim(),
      color: $('f-color').value,
      kind,
      file_path: filePath,
      sort_order: Number($('f-sort').value) || 0
    };
    if (icon) payload.icon = icon;

    let result;
    if (editing) {
      result = await cloud.database.from('sites').update(payload).eq('id', editing.id).select();
    } else {
      result = await cloud.database.from('sites').insert(payload).select();
    }

    if (result.error) {
      const code = result.error.code;
      if (code === '42501') return show('没有权限写入，请确认已登录且是本人账号', 'err');
      return show('保存失败：' + result.error.message, 'err');
    }
    if (Array.isArray(result.data) && result.data.length === 0) {
      return show('没有改动任何数据，可能这条不是你创建的', 'err');
    }

    show('已保存，前台刷新即可看到', 'ok');
    closeForm();
    loadSites();
  }

  async function removeSite(id) {
    const item = sites.find((s) => s.id === id);
    if (!item) return;
    if (!window.confirm('确定删除「' + item.name + '」？该操作不可恢复。')) return;
    const { data, error } = await cloud.database.from('sites').delete().eq('id', id).select();
    if (error) return show('删除失败：' + error.message, 'err');
    if (!Array.isArray(data) || data.length === 0) return show('没有删除成功，这条可能不是你创建的', 'err');
    show('已删除', 'ok');
    loadSites();
  }

  async function move(id, dir) {
    const idx = sites.findIndex((s) => s.id === id);
    const target = sites[idx + dir];
    if (!target) return;
    const a = sites[idx];
    const b = target;
    const r1 = await cloud.database.from('sites').update({ sort_order: b.sort_order || 0 }).eq('id', a.id).select();
    const r2 = await cloud.database.from('sites').update({ sort_order: a.sort_order || 0 }).eq('id', b.id).select();
    if (r1.error || r2.error) return show('排序保存失败', 'err');
    loadSites();
  }

  init();
})();
