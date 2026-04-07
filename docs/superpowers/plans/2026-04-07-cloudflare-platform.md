# Cloudflare Platform Integration Plan

## File Responsibilities

- `package.json`: add Cloudflare dev/build/deploy scripts.
- `wrangler.jsonc`: declare Worker entrypoint, assets binding, D1 binding, runtime vars.
- `.dev.vars.example`: document local Worker development variables.
- `server/d1/migrations/0001_initial.sql`: D1 schema for Cloudflare runtime.
- `server/src/config/runtime.ts`: resolve runtime and database provider from environment.
- `server/src/config/index.ts`: merge node config with runtime config.
- `server/src/database/types.ts`: define adapter interface shared by SQLite and D1.
- `server/src/database/nodeSqlite.ts`: wrap `better-sqlite3` in adapter form.
- `server/src/database/d1.ts`: wrap Cloudflare D1 in adapter form.
- `server/src/database/index.ts`: keep node SQLite initialization and export adapter.
- `server/src/repositories/*.ts`: move data access out of direct SQLite calls.
- `server/src/runtime/capabilities.ts`: define runtime feature flags for node vs Cloudflare.
- `server/src/controllers/RuntimeController.ts`: expose runtime capability endpoint.
- `server/src/routes/runtime.ts`: register runtime endpoint.
- `server/src/routes/index.ts`: include runtime route.
- `server/src/cloudflare/worker.ts`: Worker entrypoint serving `/api/*` and static assets.
- `server/src/services/ProxyService.ts`: preserve WARP support on node and make unsupported behavior explicit on Cloudflare.
- `server/src/controllers/ProxyController.ts`: keep current validation and WARP normalization.
- `web/src/lib/runtimeMessages.ts`: centralize capability-to-UI messaging.
- `web/src/lib/api.ts`: expose runtime capabilities endpoint.
- `web/src/components/accounts/BackupRestore.tsx`: disable file backup/restore when unsupported.
- `web/src/pages/Accounts.tsx`: surface runtime warnings.
- `web/src/pages/ProxySettings.tsx`: explain Cloudflare runtime proxy limitations.
- `README.md`: document Worker, D1, bindings, vars, secrets, and platform limitations.

## Tasks

- [ ] Write a minimal failing runtime config test.
  - Files: `server/src/config/__tests__/runtime.test.ts`
  - Command: `cd server && node --import tsx --test src/config/__tests__/runtime.test.ts`
  - Expected fail: missing module or incorrect runtime/provider resolution.

- [ ] Implement runtime config resolution.
  - Files: `server/src/config/runtime.ts`, `server/src/config/index.ts`
  - Add runtime inference for node vs Cloudflare and D1 vs SQLite.
  - Re-run runtime config test and confirm pass.

- [ ] Write a minimal failing database adapter test for node SQLite.
  - Files: `server/src/database/__tests__/nodeSqlite.test.ts`
  - Command: `cd server && node --import tsx --test src/database/__tests__/nodeSqlite.test.ts`
  - Expected fail: missing adapter or incorrect `run/first/all` behavior.

- [ ] Implement shared database adapter layer.
  - Files: `server/src/database/types.ts`, `server/src/database/nodeSqlite.ts`, `server/src/database/d1.ts`, `server/src/database/index.ts`
  - Keep existing node SQLite startup behavior unchanged.
  - Re-run database adapter test and confirm pass.

- [ ] Write a minimal failing runtime capability test.
  - Files: `server/src/runtime/__tests__/capabilities.test.ts`
  - Command: `cd server && node --import tsx --test src/runtime/__tests__/capabilities.test.ts`
  - Expected fail: missing runtime capability mapping.

- [ ] Implement capability reporting and route.
  - Files: `server/src/runtime/capabilities.ts`, `server/src/controllers/RuntimeController.ts`, `server/src/routes/runtime.ts`, `server/src/routes/index.ts`
  - Re-run capability test and confirm pass.

- [ ] Port repositories from the Cloudflare worktree and reconnect services/controllers.
  - Files: `server/src/repositories/*.ts`, `server/src/models/*.ts`, `server/src/services/*.ts`, `server/src/controllers/*.ts`
  - Preserve current WARP proxy provider logic from `main`.
  - Verification: `cd server && npm run build`

- [ ] Write a minimal failing Worker smoke test.
  - Files: `server/src/cloudflare/__tests__/worker.test.ts`
  - Command: `cd server && node --import tsx --test src/cloudflare/__tests__/worker.test.ts`
  - Expected fail: missing worker entrypoint or runtime routes.

- [ ] Implement Cloudflare Worker entrypoint and D1 migration assets.
  - Files: `server/src/cloudflare/worker.ts`, `server/d1/migrations/0001_initial.sql`, `wrangler.jsonc`, `.dev.vars.example`, `package.json`
  - Re-run Worker smoke test and confirm pass.

- [ ] Update frontend runtime-aware UX.
  - Files: `web/src/lib/runtimeMessages.ts`, `web/src/lib/api.ts`, `web/src/components/accounts/BackupRestore.tsx`, `web/src/pages/Accounts.tsx`, `web/src/pages/ProxySettings.tsx`
  - Verification: `cd web && npm run build`

- [ ] Update deployment and binding documentation.
  - Files: `README.md`
  - Include exact bindings, vars, secrets, and platform limitations.

- [ ] Final verification.
  - Commands:
    - `cd server && node --import tsx --test src/config/__tests__/runtime.test.ts src/database/__tests__/nodeSqlite.test.ts src/runtime/__tests__/capabilities.test.ts src/services/proxySupport.test.ts`
    - `cd server && npm run build`
    - `cd web && npm run build`
    - `npm run build`
  - Expected output: all tests pass and builds succeed.

- [ ] Commit in focused steps after verification.
  - Suggested commits:
    - `Add runtime-aware database adapters`
    - `Add Cloudflare Worker and D1 deployment support`
    - `Update UI and docs for Cloudflare runtime`
