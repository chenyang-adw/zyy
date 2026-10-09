/* 无浏览器环境下验证首页是否真的渲染出卡片
 * 用法：node tools/verify-render.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const els = {};

function mkEl(id) {
  return {
    id,
    innerHTML: '',
    textContent: '',
    hidden: false,
    value: '',
    style: {},
    classList: { add() {}, remove() {}, toggle() {} },
    addEventListener() {},
    removeEventListener() {},
    querySelector: () => null,
    querySelectorAll: () => [],
    setAttribute() {},
    getAttribute: () => null,
    appendChild() {},
    remove() {},
    scrollIntoView() {},
    focus() {}
  };
}

const document = {
  getElementById: (id) => els[id] || (els[id] = mkEl(id)),
  querySelector: () => null,
  querySelectorAll: () => [],
  createElement: () => mkEl('new'),
  addEventListener() {},
  head: { appendChild() {} },
  body: { appendChild() {} }
};

const sandbox = {
  console,
  document,
  setTimeout,
  clearTimeout,
  Image: class {},
  navigator: {},
  location: { href: 'https://zhongyiya.cn/' }
};
sandbox.window = sandbox;
vm.createContext(sandbox);

['assets/data.js', 'assets/common.js', 'assets/app.js'].forEach((f) => {
  vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), sandbox, { filename: f });
});

const grid = els.grid ? els.grid.innerHTML : '';
const cards = (grid.match(/class="card"/g) || []).length;

console.log('站点配置数量 :', (sandbox.SITE_CONFIG && sandbox.SITE_CONFIG.sites || []).length);
console.log('渲染卡片数量 :', cards);
console.log('搜索框占位   :', els.search ? 'ok' : '缺失');
console.log('页脚版权     :', els.copyright ? els.copyright.innerHTML : '（空）');
console.log('页脚导航     :', els.nav ? els.nav.innerHTML.replace(/<[^>]+>/g, ' ').trim() : '（空）');

if (cards === 0) {
  console.error('\n[FAIL] 首页没有渲染出任何卡片');
  process.exit(1);
}
console.log('\n[PASS] 首页渲染正常');
