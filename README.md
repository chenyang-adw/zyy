# 个人作品导航站 · 钟意

Web 全栈开发工程师的个人主页：展示作品清单，点卡片跳转到对应网站。

- **访客入口（域名）**：https://zhongyiya.cn
- **后台管理（作者专用）**：https://portfolio-hub-92035.app.workbuddy.host/admin.html

## 架构一句话说明

前台是纯静态页，作品数据存在云数据库里。因为云服务按域名校验来源，
浏览器在 `zhongyiya.cn` 上直连云库会被拒绝，所以由 `api/sites.js`
（Vercel Serverless 函数）在**服务端**读取云库再返回给前台。

```
后台 admin.html（托管域名）──写──▶ 云数据库 sites
                                      │
前台 index.html（zhongyiya.cn）◀─读──┘
        ↑ 经 /api/sites 服务端代理（缓存 60 秒）
```

后台必须走托管域名（云服务校验），前台可以走自定义域名。两边共用同一份数据。

---

## 上线三步走（Vercel + 阿里云域名）

### 第 1 步：推送代码到 GitHub

```bash
cd portfolio
git init
git add .
git commit -m "feat: 个人作品导航站"
# 在 GitHub 新建一个空仓库（不要勾选 README / .gitignore）
git remote add origin https://github.com/<你的用户名>/<仓库名>.git
git branch -M main
git push -u origin main
```

### 第 2 步：导入 Vercel

1. 打开 https://vercel.com → 用 GitHub 账号登录
2. **Add New → Project** → 选刚推送的仓库 → **Import**
3. Framework Preset 选 **Other**（纯静态 + 一个 serverless 函数，不需要构建命令）
4. 直接点 **Deploy**，完成后得到临时域名如 `xxx.vercel.app`

> `api/sites.js` 会被自动识别为 Serverless Function，无需任何额外配置。

### 第 3 步：绑定 zhongyiya.cn（阿里云解析）

1. Vercel 项目 → **Settings → Domains** → 输入 `zhongyiya.cn` → **Add**
   - Vercel 会提示把 `www.zhongyiya.cn` 一并加上，照做即可
2. 登录阿里云控制台 → **云解析 DNS** → 找到 `zhongyiya.cn` → **添加记录**：

| 记录类型 | 主机记录 | 记录值 |
|---------|---------|--------|
| CNAME   | `www`   | `cname.vercel-dns.com` |
| A       | `@`     | `76.76.21.21` |

> 以 Vercel Domains 页面实际提示的记录值为准（Vercel 偶尔会调整）。
> 根域名 `@` 如果 Vercel 给的是 A 记录就填 A，给 CNAME 就填 CNAME。

3. 保存后等待生效（通常几分钟，最长 48 小时），HTTPS 证书由 Vercel 自动签发

---

## 后台管理

打开 **https://portfolio-hub-92035.app.workbuddy.host/admin.html**：

1. 用自己的邮箱注册一次（收验证码 → 设密码），之后凭邮箱密码登录
2. 新增作品：填名称和跳转链接，或选择「上传文件」传程序包/图片
3. 支持编辑、删除、排序，保存后前台**一分钟内**自动生效（代理缓存 60 秒）

⚠️ 后台**不能**在 `zhongyiya.cn` 上打开（云服务按域名校验来源），
页面会自动提示正确地址。把上面这个后台链接存成书签即可。

⚠️ 上传型作品（程序包）在域名站上游客无法直接下载（需要登录态）。
想让访客直接拿到文件，请用「跳转链接」方式指向你自己的下载地址。

后台已加 `noindex` 且不在 sitemap 中，搜索引擎不会收录。

---

## 本地预览

```bash
python -m http.server 8080
```

浏览器打开 http://localhost:8080
本地没有 `/api/sites`，前台会自动回退到 `assets/data.js` 的静态清单，属正常现象。

## 日常维护

- **加/改作品**：推荐直接用后台；也可以编辑 `assets/data.js` 的 `sites` 数组（作为兜底清单）
- **改个人信息**：`assets/data.js` 的 `site` / `contacts` 段
- **换分享封面**：改 `tools/gen-og.py` 顶部文字后运行 `python tools/gen-og.py`
- **看访客数据**：`data.js` 里 `analytics.provider` 改为 `umami` 并填 ID，
  在 https://analytics.umami.is 查看（免费）

## 文件结构

```
portfolio/
├── index.html          首页（作品网格 + 搜索 + 分类）
├── about.html          关于我
├── 404.html            走丢页（Vercel 自动用作 404）
├── admin.html          后台管理（仅在托管域名下可用）
├── api/
│   └── sites.js        Vercel 函数：服务端代理读取云数据库
├── robots.txt / sitemap.xml
├── assets/
│   ├── data.js         ★ 所有配置：个人信息、兜底作品清单、统计
│   ├── app.js          首页渲染与数据加载
│   ├── admin.js        后台逻辑
│   ├── common.js       公共工具（转义 / 联系方式 / 页脚）
│   ├── cloud-config.js 云服务公开配置
│   ├── style.css       样式与动效（配色改 :root 变量）
│   ├── favicon.svg     浏览器标签图标
│   └── og-cover.png    微信/群聊分享卡片图
└── tools/gen-og.py     封面图生成脚本
```
