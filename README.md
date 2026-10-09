# 个人作品导航站 · 钟意

Web 全栈开发工程师的个人主页：展示作品清单，点卡片跳转到对应网站。

- **访客入口（域名）**：<https://zhongyiya.cn>
- **后台管理（作者专用）**：<https://portfolio-hub-92035.app.workbuddy.host/admin.html>

## 架构一句话说明

前台是纯静态页，作品数据存在云数据库里。因为云服务按域名校验来源，  
浏览器在 `zhongyiya.cn` 上直连云库会被拒绝（403），所以由 `edge-functions/api/sites.js`  
（EdgeOne Pages 边缘函数）在**服务端**读取云库，再以同源 `/api/sites` 返回给前台。

```
后台 admin.html（托管域名）──写──▶ 云数据库 sites
                                      │
前台 index.html（zhongyiya.cn）◀─读──┘
        ↑ 经 /api/sites 边缘函数代理（缓存 60 秒）
```

后台必须走托管域名（云服务校验），前台走自定义域名。两边共用同一份数据。

---

## 上线三步走（腾讯云 EdgeOne Pages + 阿里云域名）

> 你的域名还没备案，所以加速区域要选 **「全球可用区（不含中国大陆）」**，
> 这个区域绑定自定义域名**不需要备案**。等以后备案完成，可在项目设置里切成
> 「全球可用区（含中国大陆）」，国内速度会再上一个台阶。

### 第 1 步：安装 CLI 并登录

```bash
npm install -g edgeone
cd C:/Users/17733/WorkBuddy/2026-10-10-05-34-29/portfolio
edgeone login          # 会打开浏览器，扫码登录腾讯云
```

### 第 2 步：一键部署

```bash
edgeone pages deploy . --name zhongyi-portfolio -e production
```

静态文件就在项目根目录，所以目录参数直接写 `.`。  
`edge-functions/api/sites.js` 会被平台自动识别成边缘函数（对应 `/api/sites`），无需额外配置。

> 部署成功后会得到一个 `xxx.edgeone.run` 的项目域名。⚠️ 这个域名**带鉴权、
> 链接 3 小时过期**，且中国大陆网络访问会返回 401 —— 它只是给你预览用的，
> 真正对外访问必须走第 3 步的自定义域名。

<details>
<summary>替代方案：用 Git 仓库导入（想以后 push 自动重新部署就用这个）</summary>

1. 在 GitHub / Gitee / CNB 建一个空仓库，推送代码：

```bash
git remote add origin https://github.com/<你的用户名>/<仓库名>.git
git branch -M main
git push -u origin main
```

2. EdgeOne 控制台 → **Pages → 创建项目 → 导入 Git 仓库** → 选中该仓库 → 确认
3. 以后每次 push 都会自动重新部署

</details>

### 第 3 步：绑定 zhongyiya.cn（阿里云解析）

1. EdgeOne 控制台 → 你的 Pages 项目 → **项目设置 → 域名管理 → 添加自定义域名**
2. 输入 `zhongyiya.cn`（想带 www 就再添加一条 `www.zhongyiya.cn`），勾选**自动生成免费证书**
3. 页面会给出一组 **主机记录** 和 **记录值**，去阿里云控制台 → **云解析 DNS** →
   `zhongyiya.cn` → **添加记录**：

| 记录类型 | 主机记录 | 记录值 |
|---------|---------|--------|
| CNAME   | `@`（或页面给的主机记录） | 页面给的 CNAME 值 |
| CNAME   | `www`   | 页面给的 CNAME 值 |

4. 回到 EdgeOne 点**验证**，验证通过后会部署免费 SSL 证书，几分钟后
   `https://zhongyiya.cn` 就能访问了

---

## 后台管理

打开 **<https://portfolio-hub-92035.app.workbuddy.host/admin.html>**：

1. 用自己的邮箱注册一次（收验证码 → 设密码），之后凭邮箱密码登录
2. 新增作品：填名称和跳转链接，或选择「上传文件」传程序包/图片
3. 支持编辑、删除、排序，保存后前台**一分钟内**自动生效（边缘缓存 60 秒）

⚠️ 后台**不能**在 `zhongyiya.cn` 上打开（云服务按域名校验来源），
页面会自动提示正确地址。把这个后台链接存成书签即可。

⚠️ 上传型作品（程序包）在域名站上游客无法直接下载（需要登录态）。
想让访客直接拿到文件，请用「跳转链接」方式指向你自己的下载地址。

后台已加 `noindex` 且不在 sitemap 中，搜索引擎不会收录。

---

## 本地预览

```bash
python -m http.server 8080
```

浏览器打开 <http://localhost:8080>  
本地没有 `/api/sites`，前台会回退到 `assets/data.js` 的静态清单，属正常现象。  
想本地调试边缘函数：`edgeone pages dev`。

## 日常维护

- **加/改作品**：推荐直接用后台；也可以编辑 `assets/data.js` 的 `sites` 数组（兜底清单）
- **改个人信息**：`assets/data.js` 的 `site` / `contacts` 段
- **换分享封面**：改 `tools/gen-og.py` 顶部文字后运行 `python tools/gen-og.py`
- **改完重新上线**：`edgeone pages deploy . --name zhongyi-portfolio -e production`（CLI 方式）
  或 `git push`（Git 导入方式）
- **看访客数据**：`data.js` 里 `analytics.provider` 改为 `umami` 并填 ID，
  在 <https://analytics.umami.is> 查看（免费）

## 文件结构

```
portfolio/
├── index.html              首页（作品网格 + 搜索 + 分类）
├── about.html              关于我
├── 404.html                走丢页
├── admin.html              后台管理（仅在托管域名下可用）
├── edge-functions/
│   └── api/sites.js        ★ EdgeOne 边缘函数：服务端代理读取云数据库
├── api/sites.js            备用：Vercel Serverless 版（不用 Vercel 可忽略）
├── robots.txt / sitemap.xml
├── assets/
│   ├── data.js             ★ 所有配置：个人信息、兜底作品清单、统计
│   ├── app.js              首页渲染与数据加载
│   ├── admin.js            后台逻辑
│   ├── common.js           公共工具（转义 / 联系方式 / 页脚）
│   ├── cloud-config.js     云服务公开配置
│   ├── style.css           样式与动效（配色改 :root 变量）
│   ├── favicon.svg         浏览器标签图标
│   └── og-cover.png        微信/群聊分享卡片图
└── tools/gen-og.py         封面图生成脚本
```
