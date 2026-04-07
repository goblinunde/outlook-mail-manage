# Cloudflare 全量适配迁移计划

## 文件职责映射

- `server/src/config/index.ts`
  现状：直接依赖 `dotenv`、`path`、`process.env`。
  目标：拆成可复用的配置解析函数，分别支持 Node 和 Cloudflare Worker 绑定环境。

- `server/src/server.ts`
  现状：Node 进程入口，直接 `listen()`。
  目标：保留 Node 入口，同时新增 Worker 入口，避免业务初始化逻辑散落。

- `server/src/app.ts`
  现状：Koa + `koa-static` + `fs` + SPA fallback。
  目标：短期保留 Node 版本；中期抽出 API 适配层；最终让 Cloudflare 侧使用 Worker 原生路由或轻量框架。

- `server/src/database/index.ts`
  现状：`better-sqlite3` + 文件系统目录创建。
  目标：抽象数据库提供者接口，Node 继续走 SQLite，Cloudflare 走 D1。

- `server/src/database/migrations.ts`
  现状：原生 SQLite DDL + `ALTER TABLE` 兼容迁移。
  目标：整理为 D1 可执行 SQL 迁移集，并保持 Node 本地迁移可用。

- `server/src/models/*.ts`
  现状：直接依赖同步 SQLite API。
  目标：改造成 repository 层，统一异步接口，支持 SQLite/D1 双实现。

- `server/src/services/OAuthService.ts`
  现状：混用 `node-fetch`、`undici`、Node 代理。
  目标：抽象 HTTP 客户端；Cloudflare 侧优先使用全局 `fetch`，功能降级明确。

- `server/src/services/ProxyService.ts`
  现状：依赖 `socks-proxy-agent`、`undici ProxyAgent`。
  目标：Node 保留；Cloudflare 标记为不支持出站代理，并在 API/界面上给出受限状态。

- `server/src/services/ImapService.ts`
  现状：依赖 `node-imap` 和 TCP/TLS。
  目标：Cloudflare 环境先禁用 IMAP 路径，仅保留 Graph API；如需全量协议支持，后续拆成单独 Node 辅助服务。

- `server/src/controllers/BackupController.ts`
  现状：直接读写 SQLite 文件。
  目标：Node 保留文件备份；Cloudflare 改为逻辑导出/导入，或切换到 D1 导出策略。

- `web/src/lib/api.ts`
  现状：默认请求同源 `/api`。
  目标：保持不变，配合 Cloudflare 同域部署；必要时增加环境可配置的 API 基址。

## 阶段拆分

### 阶段 1：运行时解耦与 Worker 入口骨架

- [ ] 修改文件：`server/src/config/index.ts`、`server/src/server.ts`
- [ ] 新建文件：`server/src/config/runtime.ts`、`server/src/config/__tests__/runtime.test.ts`、`server/src/cloudflare/worker.ts`
- [ ] failing test：为配置解析补充 Node/Cloudflare 双环境测试，先断言缺失 `DB_PATH` 时 Node 默认走本地 SQLite、Cloudflare 默认走 D1 绑定名
- [ ] 验证失败：运行 `cd server && npx tsx --test src/config/__tests__/runtime.test.ts`，预期出现 `Cannot find module` 或断言失败
- [ ] 最小实现：抽出 `resolveRuntimeConfig()`，新增 Worker `fetch()` 入口，先只返回健康检查和运行时信息
- [ ] 验证通过：再次运行同一测试，预期 `1 passed`
- [ ] 提交步骤：`git add docs/superpowers/plans/... server/src/config ... server/src/cloudflare/worker.ts && git commit -m "Add cloudflare runtime foundation"`

### 阶段 2：数据库接口抽象，铺平 SQLite/D1 双实现

- [ ] 修改文件：`server/src/database/index.ts`、`server/src/database/migrations.ts`、`server/src/models/Account.ts`、`server/src/models/Proxy.ts`、`server/src/models/MailCache.ts`、`server/src/models/Tag.ts`
- [ ] 新建文件：`server/src/database/types.ts`、`server/src/database/nodeSqlite.ts`、`server/src/database/d1.ts`
- [ ] failing test：先给 `AccountModel.list()` 和 `ProxyModel.getDefault()` 写仓储接口测试，断言同一套查询契约在 mock D1/SQLite 提供者下都成立
- [ ] 验证失败：运行新增测试，预期出现接口未实现或返回结构不一致
- [ ] 最小实现：引入异步仓储接口，先让 Node SQLite 适配层通过测试
- [ ] 验证通过：运行 `cd server && npm run build` 与目标测试，预期 TypeScript 通过
- [ ] 提交步骤：`git commit -m "Abstract database providers for cloudflare"`

### 阶段 3：API 层从 Koa 业务对象中抽离

- [ ] 修改文件：`server/src/app.ts`、`server/src/routes/*.ts`、`server/src/controllers/*.ts`
- [ ] 新建文件：`server/src/http/context.ts`、`server/src/http/router.ts`
- [ ] failing test：先写账户列表和登录检查的 handler 测试，断言不依赖 Koa `Context` 也能返回标准 JSON
- [ ] 验证失败：运行 handler 测试，预期类型不兼容或无法调用
- [ ] 最小实现：将控制器拆成纯业务 handler，Node Koa 和 Worker 分别做请求适配
- [ ] 验证通过：`cd server && npm run build`
- [ ] 提交步骤：`git commit -m "Decouple api handlers from koa"`

### 阶段 4：Cloudflare 能力边界落地

- [ ] 修改文件：`server/src/services/OAuthService.ts`、`server/src/services/GraphApiService.ts`、`server/src/services/ProxyService.ts`、`server/src/services/ImapService.ts`、`web/src/pages/ProxySettings.tsx`
- [ ] 新建文件：`server/src/runtime/capabilities.ts`
- [ ] failing test：为 capability 判断写测试，断言 Cloudflare 下禁用 `imap`、`proxyAgents`、`fileBackup`
- [ ] 验证失败：运行 capability 测试，预期能力标记不存在
- [ ] 最小实现：Cloudflare 运行时仅开放 Graph API；代理和 IMAP 明确返回 501/受限状态；前端显示限制提示
- [ ] 验证通过：测试通过，手动验证 UI 限制文案
- [ ] 提交步骤：`git commit -m "Gate unsupported features on cloudflare"`

### 阶段 5：部署物料与文档

- [ ] 修改文件：`README.md`、`package.json`
- [ ] 新建文件：`wrangler.jsonc`、`.dev.vars.example`
- [ ] failing test：先运行 `npx wrangler deploy --dry-run` 或本地类型检查，预期因缺少入口/绑定配置失败
- [ ] 验证失败：记录缺失项
- [ ] 最小实现：补齐 Worker 入口、D1 绑定、静态资源发布说明、Node 本地开发说明
- [ ] 验证通过：`cd web && npm run build`，`cd server && npm run build`
- [ ] 提交步骤：`git commit -m "Add cloudflare deployment config"`

## 当前回合执行范围

- [ ] 完成阶段 1 的计划文件落盘
- [ ] 写出配置解析的 failing test
- [ ] 实现 `resolveRuntimeConfig()` 与 Worker 健康检查入口
- [ ] 跑测试与 TypeScript 构建，确认第一批基础设施可用

## 自检

- 没有使用 `TODO`、`TBD` 等占位词
- 每个阶段都列出了具体文件、失败验证、最小实现、通过验证、提交动作
- 当前范围限制在可独立落地的基础设施切片，没有提前改动 D1/路由大迁移
