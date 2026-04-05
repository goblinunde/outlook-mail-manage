# Repository Guidelines

## Project Structure & Module Organization
This repository is a monorepo with a Koa backend in `server/` and a Vite + React frontend in `web/`. Backend code lives under `server/src/` and is split into `controllers/`, `routes/`, `services/`, `models/`, `middlewares/`, `database/`, and `utils/`. Frontend code lives under `web/src/` with `pages/`, feature-oriented `components/`, Zustand `stores/`, shared `lib/`, and `types/`. Static assets go in `web/public/`; screenshots live in `docs/`. Runtime SQLite files are created under `server/data/` and must not be committed.

## Build, Test, and Development Commands
Use the root scripts for everyday work:

- `npm run install:all`: install root, backend, and frontend dependencies.
- `npm run dev`: start backend and frontend together.
- `npm run build`: build the frontend bundle in `web/dist`.
- `npm start`: start the backend and serve the built frontend.

Backend-specific checks:

- `cd server && npm run dev`: run the API with `tsx watch`.
- `cd server && npm run build`: type-check and compile backend TypeScript.

Frontend-specific checks:

- `cd web && npm run dev`: start the Vite dev server on `http://localhost:5173`.
- `cd web && npm run preview`: preview the production frontend locally.

## Coding Style & Naming Conventions
TypeScript is used throughout. Follow the existing style: 2-space indentation, single quotes, and semicolons. Use `PascalCase` for React components, pages, controllers, services, and models such as `MailViewerDialog.tsx` and `ProxyService.ts`. Use `camelCase` for stores, utilities, functions, and variables. In the frontend, prefer the `@/` alias from [`web/vite.config.ts`](/home/yyt/Documents/Github/outlook-mail-manage/web/vite.config.ts).

## Testing Guidelines
No automated test runner is currently checked in. Until one is added, treat build verification as the minimum gate: run `npm run build` and `cd server && npm run build` before opening a PR. For UI or mail-flow changes, include manual verification steps and screenshots when relevant. If you add tests, use `*.test.ts` or `*.test.tsx` naming and keep them close to the affected code.

## Commit & Pull Request Guidelines
Git history is not available in this workspace snapshot, so use short, imperative commit subjects such as `Add proxy connectivity retry` or `Fix IMAP fallback parsing`. Keep commits focused. PRs should include a concise summary, impacted areas (`server`, `web`, or both), environment or migration notes, manual test steps, and screenshots for visible frontend changes.

## Security & Configuration Tips
Start from `.env.example` and keep secrets only in local `.env` files. Never commit database files, logs, OAuth credentials, or certificates; `.gitignore` already excludes common cases.
