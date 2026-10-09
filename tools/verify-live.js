/* 拉取线上真实脚本并模拟渲染，验证已发布版本是否正常
 * 用法：node tools/verify-live.js [站点根地址]
 */
const vm = require('vm');

const BASE = process.argv[2] || 'https://portfolio-hub-92035.app.workbuddy.host/';
const FILES = ['assets/data.js', 'assets/common.js', 'assets/app.js'];

const els = {};
function mkEl(id) {
  return {
    id, innerHTML: '', textContent: '', hidden: false, value: '', style: {},
    classList: { add() {}, remove() {}, toggle() {} },
    addEventListener() {}, removeEventListener() {},
    querySelector: () => null, querySelectorAll: () => [],
    setAttribute() {}, getAttribute: () => null,
    appendChild() {}, remove() {}, scrollIntoView() {}, focus() {}
  };
}

const sandbox = {
  console,
  setTimeout,
  clearTimeout,
  Image: class {},
  navigator: {},
  location: { href: BASE },
  document: {
    getElementById: (id) => els[id] || (els[id] = mkEl(id)),
    querySelector: () => null,
    querySelectorAll: () => [],
    createElement: () => mkEl('new'),
    addEventListener() {},
    head: { appendChild() {} },
    body: { appendChild() {} }
  }
};
sandbox.window = sandbox;
vm.createContext(sandbox);

(async () => {
  for (const f of FILES) {
    const res = await fetch(BASE.replace(/\/$/, '') + '/' + f);
    if (!res.ok) {
      console.error('[FAIL] 无法获取 ' + f + '（HTTP ' + res.status + '）');
      process.exit(1);
    }
    const code = await res.text();
    vm.runInContext(code, sandbox, { filename: f });
    console.log('已加载线上 ' + f + '（' + code.length + ' 字节）');
  }

  const grid = els.grid ? els.grid.innerHTML : '';
  const cards = (grid.match(/class="card"/g) || []).length;
  const names = (grid.match(/class="card-name">([^<]+)</g) || []).map((s) => s.replace(/.*>/, ''));

  console.log('\n渲染卡片数量 :', cards);
  console.log('卡片名称     :', names.join(' / ') || '（无）');
  console.log('分类按钮     :', els.filters ? els.filters.innerHTML.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : '（空）');
  console.log('页脚         :', els.copyright ? els.copyright.innerHTML : '（空）');

  if (cards === 0) {
    console.error('\n[FAIL] 线上首页没有渲染出卡片');
    process.exit(1);
  }
  console.log('\n[PASS] 线上首页渲染正常');
})();
