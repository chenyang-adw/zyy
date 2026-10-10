/* ============================================================
 *  唯一需要你修改的文件：data.js
 *  改完保存，刷新页面即可生效。
 * ============================================================ */

window.SITE_CONFIG = {
  /* ---------- 1. 站点与个人信息 ---------- */
  site: {
    title: '钟意 · 作品导航',
    name: '钟意',
    tagline: 'Web 全栈开发工程师&掌握React、Python、Java、MySQL、CI/CD、Docker 等技术栈/网页 / 小程序 / 小游戏 / 应用定制，只有你想不到，没有我做不到',
    description: '钟意的个人主页，收录我做过的小工具、小游戏和实验项目，点开就能用。',
    // 换成你自己的域名（不要带 https://，结尾不要斜杠）
    domain: 'zhongyiya.cn',
    // 头像：放一张图片到 assets/avatar.png，或留空自动用姓氏
    avatar: 'assets/avatar.jpg',
    year: 2026
  },

  /* ---------- 2. 联系方式（不需要的就删掉整行） ----------
   * 两种写法：
   *   { label: 'GitHub', url: 'https://...' }            → 点击跳转
   *   { label: '微信 zykkos', value: 'zykkos', copy: true } → 点击复制
   */
  contacts: [
    { label: '微信 zykkos', value: 'zykkos', copy: true }
  ],

  /* ---------- 2.5 关于我页面 ---------- */
  about: {
    intro: '你好，我是钟意，一名 Web 全栈开发工程师。熟练掌握 React、Python、Java、MySQL、CI/CD、Docker 等技术栈；可定制网页与网站，开发小程序、小游戏及各类应用程序，从需求梳理到上线部署一条龙独立完成。只有你想不到，没有我做不到。',
    skills: ['JavaScript / TypeScript', 'React / Vue', 'Node.js / Express', 'Python', 'Java', 'MySQL / Redis', 'Docker / Nginx', 'CI/CD', 'HTML / CSS', 'Vercel / 云服务部署']
  },

  /* ---------- 3. 访问统计 ----------
   * 默认用「不蒜子」，免注册，开箱即用。
   * 想换成 Umami / 51.la：把 provider 改成 'umami' 并填入你的 ID 即可。
   */
  analytics: {
    provider: 'busuanzi', // 'busuanzi' | 'umami' | 'none'
    umamiId: '',          // 例：'a1b2c3d4-e5f6-7890-abcd-ef1234567890'
    umamiHost: 'https://analytics.umami.is'
  },

  /* ---------- 4. 页脚 ---------- */
  footer: {
    icp: '',              // 例：'浙ICP备12345678号-1'（国内服务器必填）
    extraLinks: []        // 例：[{ label: '友情链接', url: 'https://...' }]
  },

  /* ---------- 4.5 首页模块分区 ----------
   * 首页按这里的顺序渲染模块；tags 省略的分区收纳其余全部站点。
   * 以后加新模块：往数组里追加 { title: '模块名', desc: '一句话', tags: ['标签'] }
   */
  homeSections: [
    {
      title: '项目案例展示',
    }
  ],

  /* ---------- 5. 你的网站清单（重点改这里） ----------
   * 每个站点一个 {}，字段说明：
   *   name  必填  显示名称
   *   url   必填  跳转地址，必须以 http:// 或 https:// 开头
   *   desc  选填  一句话简介（建议 20 字内）
   *   tag   选填  分类，分类按钮会根据这里自动生成
   *   icon  选填  卡片配图，留空则自动抓取该网站的 favicon
   *             想用截图：把图片放进 assets/ 后填 'assets/xxx.png'
   *   color 选填  卡片图标底色（十六进制），留空自动分配
   */
  sites: [
    {
      name: '随机抽个饭',
      url: 'apps/what-to-eat/',
      desc: '选择困难症救星，一键随机抽顿饭',
      tag: '小游戏',
      icon: 'assets/icon-meal.svg',
      color: '#FF6B35'
    },
    {
      name: '卡密商城',
      url: 'https://example.com/shop',
      desc: '虚拟卡密自动发货',
      tag: '商业项目',
      icon: '',
      color: '#4f46e5'
    },
  ]
};
