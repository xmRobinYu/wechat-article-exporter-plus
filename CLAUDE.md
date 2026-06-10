# CLAUDE.md

本文件为 Claude Code (claude.ai/code) 在本仓库中工作时提供指导。

## 项目概述

微信公众号文章批量下载导出工具。基于 Nuxt 3（关闭 SSR，纯客户端 SPA）+ Vue 3 Composition API + Nitro 服务端引擎构建。支持导出 HTML/JSON/Excel/TXT/Markdown/DOCX 格式，其中 HTML 格式可 100% 还原文章排版与样式。

## 常用命令

```bash
# 安装依赖（要求 Node >= 22，yarn 1.22.22 通过 corepack 管理）
corepack enable && corepack prepare yarn@1.22.22 --activate
yarn

# 开发
yarn dev          # 启动开发服务器（偶发白屏时不推荐优先使用）

# 构建与部署
yarn build        # 生产构建（输出到 .output/）
yarn preview      # 构建 Cloudflare Pages 版本并本地预览

# 代码格式化（Biome 为主要格式化工具，linter 已禁用）
yarn format       # biome check --write

# Docker
yarn docker:build
yarn docker:publish
```

### 本地运行建议

- 这台机器上 `yarn dev` 偶发会出现 Nuxt / Vite 前端产物失配，表现为空白页
- 日常本地使用更推荐：

```bash
yarn build
node .output/server/index.mjs
```

- 该方式会直接运行生产构建产物，稳定性更高
- 服务地址：
  - `http://127.0.0.1:3000/dashboard/account`

如果 `yarn dev` 出现空白页，通常需要先清理：

```bash
rm -rf .nuxt .output node_modules/.vite
```

## 架构

### 客户端-服务端分离

- **客户端（SPA）：** `app.vue` → `pages/dashboard.vue` 为唯一路由页面，所有 UI 均在客户端运行（SSR 已关闭）。
- **服务端（Nitro）：** `server/api/` 包含约 25 个接口端点，负责代理转发微信公众平台的 API 请求，处理 CORS 和 Cookie 转发。核心代理逻辑在 `server/utils/proxy-request.ts`。

### 核心数据流

1. 用户通过微信公众平台后台扫码登录认证
2. `apis/index.ts` 定义客户端 API 函数，调用 Nitro 代理端点
3. 公众号与文章元数据会同步写入 MySQL（账号、文章清单、增量同步停点、登录态）
4. 文章数据获取后仍会镜像缓存到 Dexie / IndexedDB（`store/v2/db.ts`），用于前端快速读取
5. 下载调度：`utils/download/Downloader.ts` 使用 `p-queue` 管理并发下载
6. 导出：`utils/download/Exporter.ts` 将文章转换为目标格式（Cheerio 处理 HTML、Turndown 转 Markdown、ExcelJS 生成表格、JSZip 打包）

### 增量同步规则

- `mp_accounts.latest_synced_article_time` 表示“增量同步停点”
- `仅新增` 模式下：
  - 同步公众号时遇到早于该停点的文章，会停止继续向历史翻页
- `全量` 模式下：
  - 临时忽略该停点，重新同步历史文章
- 公众号管理页支持人工设置：
  - 设置增量停点
  - 从最新开始同步
  - 清空停点并全量同步

### 抓取 / 导出范围规则

- 文章下载页支持两层筛选：
  - 顶部发布时间范围筛选
  - AG Grid 表头筛选
- 抓取 / 导出动作的作用范围：
  - 如果用户手动选中了文章，则仅作用于选中项
  - 如果没有选中，则默认作用于当前筛选结果
- 文章正文、图片、资源、评论正文等大内容仍不写入 MySQL，只保留在本地缓存

### 关键目录

- `apis/` — 客户端 API 函数定义（getArticleList、getAccountList 等）
- `composables/` — Vue 3 组合式函数：`useDownloader.ts`（下载调度）、`useExporter.ts`（导出逻辑）、`useBatchDownload.ts`（批量下载管理）
- `store/v2/` — 基于 Dexie 的 IndexedDB 缓存（文章、评论、元数据、资源、HTML 内容）
- `utils/download/` — 核心下载/导出类：`Downloader.ts`、`Exporter.ts`、`BaseDownloader.ts`、`ProxyManager.ts`
- `server/api/web/mp/` — 代理微信公众平台请求的 Nitro 端点
- `server/utils/` — 服务端工具：代理请求处理、Cookie 管理、日志
- `shared/utils/` — 客户端与服务端共享代码（HTML 解析、请求工具函数）
- `config/` — 应用常量、公共 API 端点定义、AG Grid 配置
- `types/` — TypeScript 类型定义（AppMsgEx、AccountInfo、credentials、comments 等）

### UI 技术栈

Nuxt UI v2 + TailwindCSS 提供组件和样式。AG Grid Enterprise 用于文章数据表格。Monaco Editor 用于代码/调试视图。

## 代码规范

- Biome 格式化（非 lint）：行宽 120 字符、2 空格缩进、单引号、ES5 尾逗号、带分号
- CSS 使用 4 空格缩进
- Vue 文件：script/style 标签内不额外缩进
- 命名：函数/变量使用 camelCase，组件使用 PascalCase

## 环境变量

复制 `.env.example` 为 `.env`，关键变量：
- `NUXT_AGGRID_LICENSE` — AG Grid 企业版授权密钥
- `NITRO_KV_DRIVER` — 存储驱动（本地/Docker 用 `fs`，Cloudflare 用 `cloudflare-kv-binding`）
- `NITRO_KV_BASE` — KV 数据目录（默认：`.data/kv`）
- `NUXT_DEBUG_MP_REQUEST` — 开启微信代理请求调试（仅开发环境）
- `DEBUG_KEY` — 调试端点认证密钥
- `MYSQL_HOST` / `MYSQL_PORT` / `MYSQL_DATABASE` / `MYSQL_USER` / `MYSQL_PASSWORD` — MySQL 元数据持久化配置
