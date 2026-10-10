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

## 部署（推荐：Git 仓库自动部署）

> 域名未备案，加速区域必须选 **「全球可用区（不含中国大陆）」**，该区域绑定自定义域名**不需要备案**。备案完成后可在项目设置切换为含中国大陆区域。

### 方式一：导入 Git 仓库（推荐 · push 自动部署）★

仓库 `chenyang-adw/zyy` 已是公开仓库、`main` 为最新代码（已确认），可直接连。

1. [EdgeOne Pages 控制台](https://console.edgeone.ai/) → **Pages → 创建项目 → 导入 Git 仓库**
2. 点 **GitHub** 连接 → 跳 GitHub 点 **Authorize EO Pages** → 选 `chenyang-adw/zyy`（或授权全部）→ **Install**
   - ⚠️ 这是 GitHub 授权，需你本人点一下，AI 无法代授权
3. 构建配置（关键，照填）：
   - 仓库 `chenyang-adw/zyy`，分支 `main`
   - 根目录 `./`（代码就在仓库根）
   - 框架预设：**无 / None**（无 package.json，纯静态）
   - 构建命令：**留空**
   - 输出目录：**留空**（直接用根目录静态文件）
   - 加速区域：**全球可用区（不含中国大陆）**
   - 项目名称：`zhongyi-portfolio`
4. 点 **开始部署**，几分钟完成

⚠️ **关键提醒**：你之前「直接上传」创建的旧项目**不能**转成 Git 集成，所以这是**新项目**。
旧项目绑定的 `zhongyiya.cn` 要按下面步骤重新绑到新项目，并且**阿里云 DNS 的 CNAME 值必须改成新项目给的值**，否则域名仍指向旧项目。

### 绑定 / 重新绑定 zhongyiya.cn

1. 新项目 → **项目设置 → 域名管理 → 添加自定义域名**，填 `zhongyiya.cn`（要 www 再加 `www.zhongyiya.cn`），勾选**自动生成免费证书**
2. 页面给出新 **CNAME 值** → 阿里云控制台 → **云解析 DNS** → `zhongyiya.cn` → 把 `@` 的 CNAME 记录值**改成新值**（www 同理）
3. 回 EdgeOne 点**验证** → 部署免费证书 → 几分钟后 `https://zhongyiya.cn` 生效。旧项目可保留或删除，不影响

✅ 之后每次 `git push origin main` 自动重新部署，不再手动传包。

### 方式二：保留旧项目 + GitHub Actions（不想改 DNS 时用）

不想动阿里云 DNS，就用 API Token 把代码部署到**现有**项目（保留已绑域名）：

1. EdgeOne 控制台 → 头像 → **API 令牌** → 新建，复制 `EDGEONE_API_TOKEN`
2. GitHub 仓库 → **Settings → Secrets → Actions → New repository secret**，Name=`EDGEONE_API_TOKEN`，值=令牌
3. 仓库根放 `.github/workflows/deploy.yml`（可让 AI 帮你写并提交）
4. 以后 push 自动部署到现有项目

### 方式三：CLI 手动部署（兜底）

```bash
npm install -g edgeone
cd C:/Users/17733/WorkBuddy/2026-10-10-05-34-29/portfolio
edgeone login
edgeone pages deploy . --name zhongyi-portfolio -e production
```

`edge-functions/api/sites.js` 会被自动识别为边缘函数（对应 `/api/sites`）。
部署后会得到 `xxx.edgeone.run` 预览域名（带鉴权、3 小时过期，**不能**当正式访问用）。
自定义域名绑定同上「绑定 zhongyiya.cn」。

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
