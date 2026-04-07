# Outlook 邮箱管理器

一个用于批量管理 Microsoft Outlook 邮箱账户的全栈 Web 应用。支持 OAuth2 双协议（Graph API + IMAP）收取邮件，内置代理管理，并已支持 Cloudflare WARP 本地代理预设与连通性检测。

## 界面预览

| 仪表盘 | 邮箱管理 |
|:---:|:---:|
| ![仪表盘页面](docs/screenshots/仪表盘页面.png) | ![邮箱管理页面](docs/screenshots/邮箱管理页面.png) |

| 邮件查看 | 移动端 |
|:---:|:---:|
| ![邮件查看弹窗](docs/screenshots/邮件查看弹窗.png) | ![移动端效果](docs/screenshots/移动端效果.png) |

## 技术栈

| 层级 | 技术 |
|------|------|
| 后端 | Koa 3 + TypeScript + SQLite (better-sqlite3) |
| 前端 | React 19 + Tailwind CSS 3 + Zustand 5 + Framer Motion 11 |
| UI 组件 | Radix UI 原语 + 自定义 Glassmorphism 组件 |
| 邮件协议 | Microsoft Graph API / IMAP (XOAUTH2) |
| 代理 | SOCKS5 (socks-proxy-agent) / HTTP (undici ProxyAgent) / Cloudflare WARP 本地代理预设 |

## 功能概览

- **仪表盘** — 账户统计、最近邮件、快捷操作
- **账户管理** — 批量导入/导出、搜索、分页、多选操作、列排序与显隐
- **标签系统** — 创建/编辑/删除标签，为账户分配标签，右键快速切换
- **邮件查看** — 三栏布局（账户列表 → 邮件列表 → 邮件正文），支持收件箱/垃圾邮件切换
- **代理设置** — SOCKS5/HTTP 代理管理、Cloudflare WARP 预设、连通性测试、默认代理设置
- **双协议收信** — Graph API 优先，IMAP 自动降级，本地缓存兜底
- **访问密码** — 可选的访问密码保护，SHA256 Token 认证
- **数据备份** — 一键备份/恢复 SQLite 数据库
- **导入去重** — 两步导入流程（预览 → 确认），支持跳过/覆盖重复项
- **深色/浅色主题** — 跟随系统或手动切换
- **响应式布局** — 移动端适配，侧边栏抽屉模式

## 项目结构

```
outlook-mail-manager/
├── server/                  # 后端服务
│   └── src/
│       ├── config/          # 环境配置
│       ├── controllers/     # 请求处理器
│       ├── database/        # SQLite 连接 & 迁移
│       ├── middlewares/      # 日志 & 错误处理
│       ├── models/          # 数据访问层
│       ├── routes/          # API 路由
│       ├── services/        # 业务逻辑（OAuth、Graph、IMAP、代理）
│       ├── types/           # TypeScript 类型定义
│       └── utils/           # 工具函数
├── web/                     # 前端应用
│   └── src/
│       ├── components/      # UI 组件（按模块分组）
│       ├── lib/             # API 客户端 & 工具函数
│       ├── pages/           # 页面组件
│       ├── stores/          # Zustand 状态管理
│       └── types/           # 前端类型定义
├── .env.example             # 环境变量模板
└── package.json             # 根 monorepo 配置
```

## 快速开始

### 环境要求

- Node.js >= 18
- npm >= 9

### 安装

```bash
# 克隆项目后，一键安装所有依赖
npm run install:all
```

### 配置

复制环境变量模板并按需修改：

```bash
cp .env.example .env
```

服务端启动时会按以下顺序读取环境变量：

1. 仓库根目录 `.env`
2. `server/.env`

后加载的值会覆盖先加载的值。默认开发方式建议只维护根目录 `.env`。

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `PORT` | `3000` | 服务端口 |
| `LOG_LEVEL` | `info` | 日志级别 |
| `DB_PATH` | `./data/outlook.db` | SQLite 数据库路径（相对于 server/） |
| `ACCESS_PASSWORD` | _(空)_ | 访问密码，留空则不启用认证 |

### 参数设置速查

#### 账户导入必填参数

| 字段 | 必填 | 说明 |
|------|------|------|
| `email` | 是 | Outlook / Hotmail / Live 邮箱地址 |
| `client_id` | 是 | Microsoft Entra 应用的 `Application (client) ID` |
| `refresh_token` | 是 | OAuth 授权后获取的刷新令牌 |
| `password` | 否 | 本地备注字段，不参与 OAuth 收信 |
| `remark` | 否 | 备注信息 |

#### 代理参数

| 字段 | 必填 | 说明 |
|------|------|------|
| `name` | 是 | 代理显示名称 |
| `provider` | 是 | `custom` 或 `cloudflare-warp` |
| `type` | 是 | `socks5` 或 `http` |
| `host` | 是 | 代理主机名或 IP |
| `port` | 是 | TCP 端口，范围 `1-65535` |
| `username` | 否 | 认证用户名 |
| `password` | 否 | 认证密码 |
| `is_default` | 否 | 是否设为默认代理 |

### Cloudflare WARP 参数设置

当前仓库对 Cloudflare 的实际支持是：把本机 WARP 客户端暴露的本地代理作为邮件请求出口使用。

WARP 预设默认参数如下：

| 参数 | 默认值 |
|------|--------|
| `provider` | `cloudflare-warp` |
| `name` | `Cloudflare WARP` |
| `type` | `socks5` |
| `host` | `127.0.0.1` |
| `port` | `40000` |

使用步骤：

1. 先在本机启动 Cloudflare WARP，并开启本地代理模式。
2. 进入应用的“代理设置”页面。
3. 新增代理时选择 `Cloudflare WARP` 预设。
4. 如你的本地监听地址不是默认值，可手动覆盖 `host`、`port`、`type`。
5. 保存后点击“测试”，系统会请求 `https://www.cloudflare.com/cdn-cgi/trace` 并显示：
   - 当前出口 IP
   - `warp=on/off` 状态
   - Cloudflare 边缘节点 `colo`
   - 请求延迟

说明：

- 当前后端不会自动安装、启动或管理 `warp-cli`。
- 本项目只消费“本机已存在的 WARP 本地代理”，不直接接 Cloudflare Zero Trust API。
- 若你把 WARP 本地代理改成了 HTTP 模式，也可以把 `type` 改为 `http`。

### Cloudflare Workers / D1 部署

当前仓库已经支持 Cloudflare 平台部署，相关文件如下：

- `wrangler.jsonc`
- `.dev.vars.example`
- `server/src/cloudflare/worker.ts`
- `server/d1/migrations/0001_initial.sql`

部署形态：

- 前端静态资源由 Cloudflare Assets 托管
- `/api/*` 由 Worker 入口处理
- 数据库存储切换为 D1
- Node 本地运行仍然保留 SQLite

Cloudflare 运行时下当前支持情况：

| 能力 | Node 本地运行 | Cloudflare Worker |
|------|---------------|-------------------|
| SQLite 本地文件数据库 | 支持 | 不支持 |
| D1 数据库 | 不使用 | 支持 |
| Graph API 收信 | 支持 | 支持 |
| IMAP 降级 | 支持 | 不支持 |
| 代理管理 / WARP 代理测试 | 支持 | 不支持 |
| 文件备份 / 恢复 | 支持 | 不支持 |

### Cloudflare 绑定与变量设置

`wrangler.jsonc` 已声明以下绑定和变量：

| 类型 | 名称 | 当前值 | 说明 |
|------|------|--------|------|
| Worker Entry | `main` | `server/src/cloudflare/worker.ts` | Worker 入口文件 |
| Assets Binding | `ASSETS` | `web/dist` | 前端静态资源绑定 |
| D1 Binding | `DB` | `outlook-mail-manage` | D1 数据库绑定名 |
| Variable | `DB_PROVIDER` | `d1` | 强制 Worker 运行时使用 D1 |
| Variable | `D1_DATABASE_BINDING` | `DB` | Worker 运行时读取的 D1 绑定名 |
| Variable | `LOG_LEVEL` | `info` | 日志级别 |
| Variable | `ACCESS_PASSWORD` | `""` | 可选访问密码，建议改成 Secret |

建议：

- 非敏感配置保留在 `wrangler.jsonc` 的 `vars`
- `ACCESS_PASSWORD` 这类敏感值使用 `wrangler secret put`
- 本地 Worker 调试用 `.dev.vars`

`.dev.vars.example` 默认内容：

```dotenv
ACCESS_PASSWORD=
LOG_LEVEL=info
DB_PROVIDER=d1
D1_DATABASE_BINDING=DB
```

### Cloudflare D1 初始化

1. 创建 D1 数据库：

```bash
npx wrangler d1 create outlook-mail-manage
```

2. 把返回的 `database_id` 填入根目录 [`wrangler.jsonc`](/home/yyt/Documents/Github/outlook-mail-manage/wrangler.jsonc)。

3. 执行 D1 migration：

```bash
npx wrangler d1 migrations apply outlook-mail-manage --local
npx wrangler d1 migrations apply outlook-mail-manage --remote
```

当前 D1 migration 文件为 [`server/d1/migrations/0001_initial.sql`](/home/yyt/Documents/Github/outlook-mail-manage/server/d1/migrations/0001_initial.sql)。

### Cloudflare 本地调试与部署命令

```bash
# 构建前端并启动 Wrangler 本地开发
npm run dev:cloudflare

# 构建 server + web 的 Cloudflare 部署产物
npm run build:cloudflare

# 部署到 Cloudflare
npm run deploy:cloudflare
```

### 从本地 SQLite 导入 D1

当前仓库已经内置了“读取本地 SQLite -> 生成 D1 导入 SQL 分片 -> 调用 Wrangler 执行导入”的完整工具链。

#### 1. 先把本地 SQLite 数据导出为 D1 导入包

默认会读取本地 SQLite：

- [`server/data/outlook.db`](/home/yyt/Documents/Github/outlook-mail-manage/server/data/outlook.db)

执行：

```bash
npm run cloudflare:d1:prepare-import
```

默认输出目录：

- `.wrangler/d1-import/<timestamp>/`

每次生成内容包括：

- `001.sql`, `002.sql`, `003.sql` ...：分片 SQL 文件
- `manifest.json`：记录源 SQLite 路径、分片数、各表行数

如果你要指定 SQLite 路径、输出目录或分片大小：

```bash
npm run cloudflare:d1:prepare-import -- \
  --db server/data/outlook.db \
  --out .wrangler/d1-import-prod \
  --max-statements 200
```

参数说明：

| 参数 | 说明 |
|------|------|
| `--db` | 指定本地 SQLite 文件路径 |
| `--out` | 指定导出目录 |
| `--max-statements` | 每个 SQL 分片包含的语句数量 |

#### 2. 预览将要执行的 D1 导入命令

在真正执行前，可以先 dry-run：

```bash
npm run cloudflare:d1:import:local -- --dry-run
npm run cloudflare:d1:import:remote -- --dry-run
```

如果你想指定某个导入包目录：

```bash
npm run cloudflare:d1:import:local -- --dry-run --input .wrangler/d1-import/2026-04-07T16-58-11-784Z
```

#### 3. 导入到本地 D1

```bash
npm run cloudflare:d1:import:local
```

这个命令会：

1. 读取最近一次生成的 `.wrangler/d1-import/<timestamp>/manifest.json`
2. 按顺序执行对应 SQL 分片
3. 调用 `npx wrangler d1 execute <database_name> --local --file <chunk.sql>`

#### 4. 导入到远程 D1

```bash
npm run cloudflare:d1:import:remote
```

如果你想一步完成“生成导入包 + 执行导入”：

```bash
npm run cloudflare:d1:migrate:local
npm run cloudflare:d1:migrate:remote
```

说明：

- 远程导入前，先确认 [`wrangler.jsonc`](/home/yyt/Documents/Github/outlook-mail-manage/wrangler.jsonc) 里的 `database_name` 和 `database_id` 已正确配置
- 远程导入会覆盖 D1 中现有的 `accounts`、`proxies`、`tags`、`account_tags`、`mail_cache` 数据

#### 5. 指定数据库名或导入目录

如果你不想用 `wrangler.jsonc` 里的默认数据库名，可以显式指定：

```bash
npm run cloudflare:d1:import:remote -- \
  --database your-d1-name \
  --input .wrangler/d1-import/2026-04-07T16-58-11-784Z
```

### D1 导出备份

也已经内置了 D1 导出脚本，底层调用的是 Cloudflare 官方 `wrangler d1 export`。

导出本地 D1：

```bash
npm run cloudflare:d1:export:local
```

导出远程 D1：

```bash
npm run cloudflare:d1:export:remote
```

默认输出目录：

- `.wrangler/d1-export/`

示例：

```bash
npm run cloudflare:d1:export:remote -- \
  --output .wrangler/d1-export/prod-backup.sql
```

如需先预览命令：

```bash
npm run cloudflare:d1:export:remote -- --dry-run
```

如果你要给 Worker 配访问密码：

```bash
npx wrangler secret put ACCESS_PASSWORD
```

### Node 与 Cloudflare 两套参数

Node 本地运行主要读取根目录 `.env`：

```dotenv
PORT=3000
LOG_LEVEL=info
DB_PATH=./data/outlook.db
DB_PROVIDER=sqlite
D1_DATABASE_BINDING=DB
ACCESS_PASSWORD=
```

Cloudflare Worker 本地调试主要读取 `.dev.vars`：

```dotenv
ACCESS_PASSWORD=
LOG_LEVEL=info
DB_PROVIDER=d1
D1_DATABASE_BINDING=DB
```

说明：

- `DB_PROVIDER=sqlite` 主要用于 Node 运行时
- `DB_PROVIDER=d1` 主要用于 Worker 运行时
- Worker 运行时不读取本地 SQLite 文件
- Node 运行时不会使用 Cloudflare D1 binding

### 开发模式

```bash
# 同时启动前后端（热重载）
npm run dev
```

- 前端：http://localhost:5173（Vite dev server，自动代理 `/api` 到后端）
- 后端：http://localhost:3000

### 生产构建

```bash
# 构建前端
npm run build

# 启动后端（同时托管前端静态文件）
npm start
```

访问 http://localhost:3000 即可使用。

## API 端点

### 账户 `/api/accounts`

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/` | 获取账户列表（支持分页、搜索） |
| POST | `/` | 创建账户 |
| PUT | `/:id` | 更新账户 |
| DELETE | `/:id` | 删除账户 |
| POST | `/batch-delete` | 批量删除 |
| POST | `/import` | 批量导入 |
| POST | `/import-preview` | 导入预览，返回新数据/重复数据/错误项 |
| POST | `/import-confirm` | 确认导入，支持 `skip` 或 `overwrite` |
| POST | `/export` | 导出账户 |
| POST | `/:id/tags` | 设置账户标签 |

### 邮件 `/api/mails`

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/fetch` | 拉取邮件（Graph API → IMAP 降级） |
| POST | `/fetch-new` | 仅拉取新邮件 |
| GET | `/cached` | 获取缓存邮件，参数：`account_id`、`mailbox`、`page`、`pageSize` |
| DELETE | `/clear` | 清除缓存，Body 参数：`account_id`、`mailbox`、`proxy_id` |

### 代理 `/api/proxies`

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/` | 获取代理列表 |
| POST | `/` | 创建代理 |
| PUT | `/:id` | 更新代理 |
| DELETE | `/:id` | 删除代理 |
| POST | `/:id/test` | 测试连通性 |
| PUT | `/:id/default` | 设为默认 |

代理接口中与 Cloudflare 相关的关键字段：

```json
{
  "name": "Cloudflare WARP",
  "provider": "cloudflare-warp",
  "type": "socks5",
  "host": "127.0.0.1",
  "port": 40000,
  "username": "",
  "password": "",
  "is_default": true
}
```

测试结果示例：

```json
{
  "ip": "198.51.100.8",
  "latency": 182,
  "provider": "cloudflare-warp",
  "endpoint": "https://www.cloudflare.com/cdn-cgi/trace",
  "status": "active",
  "warpEnabled": true,
  "colo": "SJC"
}
```

### 仪表盘 `/api/dashboard`

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/stats` | 获取统计数据 |

### 认证 `/api/auth`

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/check` | 检查是否启用访问密码 |
| POST | `/login` | 使用访问密码登录 |

### 标签 `/api/tags`

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/` | 获取标签列表 |
| POST | `/` | 创建标签 |
| PUT | `/:id` | 更新标签 |
| DELETE | `/:id` | 删除标签 |

### 备份 `/api/backup`

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/download` | 下载 SQLite 备份 |
| POST | `/restore` | 恢复备份 |

### 运行时 `/api/runtime`

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/capabilities` | 获取当前运行时能力矩阵 |

## 账户导入格式

支持文本批量导入或文件导入，每行一个账户，字段用分隔符分隔。

系统实际必填字段是：

- `email`
- `client_id`
- `refresh_token`

`password` 为可选字段，仅用于本地备注/展示，不参与 OAuth 收信。

默认导入格式：

```
a@outlook.com----密码可留空----client-id-1----refresh-token-1
b@outlook.com----密码可留空----client-id-2----refresh-token-2
```

分隔符可自定义（默认 `----`）。

如果你的原始数据是三列，例如：

```txt
a@outlook.com|client-id-1|refresh-token-1
b@outlook.com|client-id-2|refresh-token-2
```

导入时这样设置即可：

- 分隔符：`|`
- 字段顺序：`email`, `client_id`, `refresh_token`

导入预览会按 `email` 检查重复项，并允许你选择“跳过重复项”或“覆盖更新”。

## 如何获取 `client_id` 和 `refresh_token`

### 先确认适用账号类型

当前项目后端固定使用 `https://login.microsoftonline.com/consumers/...` 端点，因此开箱即用的目标是**个人微软账号**，例如 `outlook.com`、`hotmail.com`、`live.com`。如果你要接企业/学校账号，需要先调整后端 OAuth 端点和权限配置。

### `client_id` 是什么

`client_id` 就是你在 Microsoft Entra 应用注册里拿到的 **Application (client) ID**。

获取步骤：

1. 打开 Microsoft Entra 管理中心
2. 进入 `App registrations` → `New registration`
3. `Supported account types` 选择：
   - `Personal Microsoft accounts`
   - 或 `Accounts in any organizational directory and personal Microsoft accounts`
4. 注册完成后，在应用概览页复制 `Application (client) ID`

### `refresh_token` 是什么

`refresh_token` 不是在后台面板里直接复制出来的，而是要让目标邮箱账号完成一次 OAuth 授权后，由微软令牌接口返回。

这个项目本身目前**只消费** `refresh_token`，不内置“申请 refresh_token”的向导页面。最简单的获取方式是给你自己的 Entra 应用跑一次 **Device Code Flow** 或 **Authorization Code Flow**。对命令行用户，推荐 Device Code Flow。

### 推荐做法：Device Code Flow

先完成应用注册附加配置：

1. 在应用的 `Authentication` 页面启用 `Allow public client flows`
2. 在 `API permissions` 中至少添加 Microsoft Graph 的委托权限 `Mail.Read`
3. 申请令牌时使用这些 scope：

```txt
offline_access https://graph.microsoft.com/Mail.Read https://outlook.office.com/IMAP.AccessAsUser.All
```

然后请求设备码：

```bash
curl -X POST 'https://login.microsoftonline.com/consumers/oauth2/v2.0/devicecode' \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  --data-urlencode 'client_id=你的_client_id' \
  --data-urlencode 'scope=offline_access https://graph.microsoft.com/Mail.Read https://outlook.office.com/IMAP.AccessAsUser.All'
```

返回结果里会有：

- `user_code`
- `verification_uri`
- `device_code`

按提示在浏览器打开 `verification_uri`，输入 `user_code`，登录目标 Outlook 账号并同意授权。之后轮询令牌接口：

```bash
curl -X POST 'https://login.microsoftonline.com/consumers/oauth2/v2.0/token' \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  --data-urlencode 'grant_type=urn:ietf:params:oauth:grant-type:device_code' \
  --data-urlencode 'client_id=你的_client_id' \
  --data-urlencode 'device_code=上一步返回的_device_code'
```

授权完成后，返回 JSON 中的 `refresh_token` 就是你要导入的值。

### 补充说明

- Graph 读取邮件用到 `Mail.Read`
- IMAP 降级收信用到 `https://outlook.office.com/IMAP.AccessAsUser.All`
- 如果授权时没有请求 `offline_access`，通常拿不到 `refresh_token`
- 微软刷新令牌会轮换；本项目在成功刷新访问令牌后，会自动把新的 `refresh_token` 更新回本地数据库
- `refresh_token` 属于高敏感凭据，泄露后等同于授予他人持续访问你邮箱数据的能力

## 致谢

本项目的 OAuth2 认证流程参考了 [MS_OAuth2API_Next](https://github.com/HChaoHui/MS_OAuth2API_Next)，感谢原作者 [@HChaoHui](https://github.com/HChaoHui) 的开源贡献。

## License

MIT
