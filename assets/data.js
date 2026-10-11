/* ============================================================
 *  唯一需要你修改的文件：data.js
 *  改完保存，刷新页面即可生效。
 * ============================================================ */

window.SITE_CONFIG = {
  /* ---------- 1. 站点与个人信息 ---------- */
  site: {
    title: '钟意 · 作品导航',
    name: '钟意',
    tagline: 'Web 全栈开发工程师\n掌握 React / Python / Java / MySQL / CI/CD / Docker\n网页 · 小程序 · 小游戏 · 应用定制\n只有你想不到，没有我做不到',
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
        name: '贪吃蛇',
        url: 'tan01/',
        desc: '自由行走 · 摇杆操作 · 多皮肤',
        tag: '小游戏',
        icon: 'tan01/icon.svg',
        color: '#22c55e'
      },
      {
        name: '水果消消乐',
        url: 'shui01/',
        desc: '点水果凑三个，格子满了就输',
        tag: '小游戏',
        icon: 'shui01/icon.svg',
        color: '#f03e3e'
      },
      {
        name: '爱心粒子',
        url: 'zixinlizi01/',
        desc: '万千粒子汇成心跳',
        tag: '特效',
        icon: 'zixinlizi01/icon.svg',
        color: '#ff69b4'
      },
      {
        name: '浪漫烟花',
        url: 'yanhua01/',
        desc: '写一句话，烟花和爱心替你说',
        tag: '特效',
        icon: 'yanhua01/icon.svg',
        color: '#ba55d3'
    },
    {
      name: '海底 2048',
      url: 'haidi2048/',
      desc: '拖动合成，一路合到 2048',
      tag: '小游戏',
      icon: 'haidi2048/icon.svg',
      color: '#1a86c8'
    },
    {
      name: '跳跃鸟',
      url: 'tiaoyueniao01/',
      desc: '点一下扇翅膀，穿过水管',
      tag: '小游戏',
      icon: 'tiaoyueniao01/icon.svg',
      color: '#4ec0ca'
    },
    {
      name: '跳一跳',
      url: 'tiaoyitiao01/',
      desc: '按住蓄力，落中间得双倍分',
      tag: '小游戏',
      icon: 'tiaoyitiao01/icon.svg',
      color: '#b98cf0'
    },
    {
      name: '果了个果',
      url: 'yangle01/',
      desc: '一摞牌只能拿最上面那张',
      tag: '小游戏',
      icon: 'yangle01/icon.svg',
      color: '#7cb02f'
    },
    {
      name: '一飞冲天',
      url: 'feichong01/',
      desc: '穿过旋转圆环，玻璃能撞碎',
      tag: '小游戏',
      icon: 'feichong01/icon.svg',
      color: '#f30e98'
    },
    {
      name: '深海潜水艇',
      url: 'qianshui01/',
      desc: '拖动潜艇躲敌舰，捡激光反击',
      tag: '小游戏',
      icon: 'qianshui01/icon.svg',
      color: '#0e6c66'
    },
    {
      name: '隐形人跑酷',
      url: 'paoku01/',
      desc: '黑白火柴人，跳过尖刺开门',
      tag: '小游戏',
      icon: 'paoku01/icon.svg',
      color: '#1b1b1b'
    },
    {
      name: '斗兽棋 · 暗棋',
      url: 'doushouqi01/',
      desc: '4×4 暗棋，最小的猪能吃象',
      tag: '小游戏',
      icon: 'doushouqi01/icon.svg',
      color: '#4a90e2'
    },
    {
      name: '节奏音符',
      url: 'yinyue01/',
      desc: '双轨音游，长条要按住不放',
      tag: '小游戏',
      icon: 'yinyue01/icon.svg',
      color: '#4ec3f0'
    }
  ]
};
