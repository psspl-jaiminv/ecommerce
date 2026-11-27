# React + TypeScript + Vite

## Backend & database

The API is an Express 5 + PostgreSQL server in `server/`, sharing the root `package.json`.

### Prerequisites

- Node.js 22+
- Docker (for the local PostgreSQL 16 database)

### Setup

```sh
npm install
cp .env.example .env        # local placeholders; edit if needed
npm run db:up               # starts postgres on 127.0.0.1:5432, creates `app` and `app_test`
npm run db:migrate          # applies server/migrations to DATABASE_URL
npm run dev:all             # Vite on :5173 + API on :3001 (Vite proxies /api to the API)
curl localhost:3001/api/health   # {"status":"ok"}
```

If port 5432 is already in use, set `POSTGRES_PORT` (e.g. `POSTGRES_PORT=55432 npm run db:up`) and update the port in `DATABASE_URL` / `TEST_DATABASE_URL`.

To stop the database and delete its data, run `docker compose down -v`. The next `npm run db:up` recreates both databases, so run `npm run db:migrate` again afterwards.

### Configuration

The server validates its environment at start-up (`server/src/config.ts`) and exits with a readable error if anything is invalid.

| Variable            | Required | Default                 | Notes                                            |
| ------------------- | -------- | ----------------------- | ------------------------------------------------ |
| `DATABASE_URL`      | yes      |                         | `postgres://` connection URL                     |
| `PORT`              | no       | `3001`                  |                                                  |
| `NODE_ENV`          | no       | `development`           | `development`, `test` or `production`            |
| `APP_ORIGIN`        | no       | `http://localhost:5173` | Origin of the web app                            |
| `SESSION_TTL_DAYS`  | no       | `7`                     |                                                  |
| `TEST_DATABASE_URL` | tests    |                         | Must differ from `DATABASE_URL`; it is truncated |

### Scripts

| Script                           | What it does                                                    |
| -------------------------------- | --------------------------------------------------------------- |
| `npm run dev:server`             | API with reload (`tsx watch`)                                   |
| `npm run dev:all`                | Web app and API together                                        |
| `npm run build:server`           | Compiles the API to `dist-server/`                              |
| `npm run start:server`           | Runs the compiled API from `dist-server/`                       |
| `npm run db:up`                  | `docker compose up -d`, waits until postgres is healthy         |
| `npm run db:migrate`             | Applies pending migrations                                      |
| `npm run db:migrate:down`        | Reverts the most recent migration                               |
| `npm run db:migrate:create name` | Creates a new SQL migration in `server/migrations/`             |
| `npm test` / `npm run test:server` | Runs the Vitest suite(s); server tests need `TEST_DATABASE_URL` |

### Migrations

Migrations are plain SQL files in `server/migrations/`, run by [node-pg-migrate](https://salsita.github.io/node-pg-migrate/). Each file has a `-- Up Migration` and a `-- Down Migration` section. Write them so the previous app version keeps working while they run (add first, remove in a later release).

The first migration creates:

- `users`: `id` (uuid, generated), `email`, `name`, `password_hash`, `created_at`, `updated_at`. `email` is unique and must be stored lower-case (a check constraint rejects anything else), so normalise it before you insert it.
- `sessions`: `id_hash` (bytea primary key, a hash of the session token; the raw token is never stored), `user_id` (references `users`, deleted together with the user), `expires_at`, `created_at`. Both `user_id` and `expires_at` are indexed.

### API endpoints

| Method and path   | Response                                                                          |
| ----------------- | --------------------------------------------------------------------------------- |
| `GET /api/health` | `200 {"status":"ok"}` when the database answers, otherwise `503 SERVICE_UNAVAILABLE` |

Unknown routes return `404` with the error shape below. JSON request bodies are limited to 10 kB.

### Tests

`npm run test:server` migrates `TEST_DATABASE_URL` once (Vitest global setup) and runs `server/**/*.test.ts` serially. Use `createTestDb()` and `truncateAll(db)` from `server/test/db.ts` to get a clean database per test.

### Error responses

Every API error has the shape `{ "error": { "code": string, "message": string } }`. Stack traces are never sent; in production, unexpected errors return a generic `INTERNAL_ERROR` message.


This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```
