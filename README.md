# React + TypeScript + Vite

## Web app

The React app in `src/` is the sign-up, log-in and home UI for the [auth API](#api-endpoints). Run it together with the API with `npm run dev:all` (see [Setup](#setup)); Vite proxies `/api` to the API, so the session cookie stays same-origin.

### Pages

| Route     | Who can see it | What it does |
| --------- | -------------- | ------------ |
| `/`       | signed-in users | Shows "Signed in as {name} ({email})" and a **Log out** button that ends the session and returns to `/login` |
| `/login`  | signed-out users | Email + password form; links to `/signup` |
| `/signup` | signed-out users | Name + email + password form; links to `/login` |
| anything else | everyone | Redirects to `/` |

Signed-out visitors to `/` are sent to `/login`, and signed-in visitors to `/login` or `/signup` are sent to `/`. On load the app calls `GET /api/auth/me` to restore the session, so a refresh keeps you signed in; a "Loading…" status is shown until that answers. If the check fails for any reason the user is treated as signed out. If logout fails, the user stays signed in and sees an error, because the server session still exists.

### Forms and errors

- Inputs are validated in the browser with the same rules and messages as the server (`src/auth/validation.ts` mirrors `server/src/auth/schemas.ts`; change both together). Invalid input shows an error under the field and focuses it, and nothing is sent.
- Email is trimmed and lower-cased before it is sent, and name is trimmed. Passwords are sent as typed.
- Server field errors (`400 VALIDATION_ERROR`) appear under their fields, and `409 EMAIL_TAKEN` appears under Email. Everything else (`401 INVALID_CREDENTIALS`, `429 RATE_LIMITED`, network failures, unexpected responses) is shown in a `role="alert"` region at the top of the form.
- Accessibility: every input has a `<label>`, `aria-invalid` and `aria-describedby` pointing at its error, and the autocomplete hints `name`, `email`, `current-password` (login) and `new-password` (signup). The submit button is disabled while a request is in flight.

### Code layout

| Path | Purpose |
| ---- | ------- |
| `src/api/client.ts` | `request<T>()`: a `fetch` wrapper that never throws and returns `Result<T>` (`{ ok: true, data }` or `{ ok: false, error: { code, message, fields? } }`). Network failures become `NETWORK_ERROR`, non-JSON or off-contract responses (e.g. a proxy error page) become `UNEXPECTED_RESPONSE`, and `INTERNAL_ERROR` details are replaced by a generic message. Every non-GET request sends `Content-Type: application/json`, which the server's CSRF guard requires. |
| `src/api/auth.ts` | `signup`, `login`, `logout`, `me` and the `PublicUser`, `SignupInput`, `LoginInput` types, mirroring the server contract. |
| `src/auth/` | `AuthProvider` (state: `loading`, `authenticated` with `user`, or `anonymous`), the `useAuth()` hook, and the `RequireAuth` / `RedirectIfAuthenticated` layout routes. |
| `src/forms/useForm.ts` | Shared form state: validate locally, submit, then place server errors under fields or in the alert. Map a single-field error code to its field with `fieldForErrorCode` (e.g. `{ EMAIL_TAKEN: 'email' }`). |
| `src/components/` | `FormField` (labelled input with error and hint wiring) and `AuthCard` (the centred card layout). |
| `src/pages/` | `LoginPage`, `SignupPage`, `HomePage`. |
| `src/main.tsx`, `src/App.tsx` | `main.tsx` mounts `BrowserRouter` and `AuthProvider`; `App.tsx` is only the route table. |

Styling is plain CSS (`src/index.css`, `src/App.css`).

### Web tests

`npm run test:web` runs `src/**/*.test.{ts,tsx}` in jsdom with Testing Library (setup in `src/test/setup.ts`). No database is needed. Tests do not mock modules: `AuthProvider` accepts an optional `api` prop, and `renderApp(route, api)` from `src/test/renderApp.tsx` renders the whole app in a `MemoryRouter` against `createFakeAuthApi()`, whose calls you can stub per test. Use `deferred()` from the same file to hold a request open and check in-flight states.

### Troubleshooting

If another app already uses port 5173, Vite silently starts on 5174 instead. The browser then sends `Origin: http://localhost:5174`, which does not match `APP_ORIGIN`, so signup, login and logout all fail with `403 CSRF_REJECTED`. Set `APP_ORIGIN` to the URL Vite printed, or free port 5173.

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
| `APP_ORIGIN`        | no       | `http://localhost:5173` | Origin of the web app. Non-GET requests sending any other `Origin` are rejected (see [Authentication](#authentication)) |
| `SESSION_TTL_DAYS`  | no       | `7`                     | Session lifetime; also the `sid` cookie's `Max-Age` |
| `AUTH_RATE_LIMIT_MAX` | no     | `10`                    | Requests per IP per window, counted separately for signup and login. `0` disables the limit |
| `AUTH_RATE_LIMIT_WINDOW_MINUTES` | no | `15`             | Length of the rate-limit window                  |
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
| `npm test`                       | Runs both Vitest projects (`server` and `web`); needs `TEST_DATABASE_URL` |
| `npm run test:server`            | Server tests only; needs `TEST_DATABASE_URL` and the database   |
| `npm run test:web`               | Web tests only (jsdom); no database needed                      |

### Migrations

Migrations are plain SQL files in `server/migrations/`, run by [node-pg-migrate](https://salsita.github.io/node-pg-migrate/). Each file has a `-- Up Migration` and a `-- Down Migration` section. Write them so the previous app version keeps working while they run (add first, remove in a later release).

The first migration creates:

- `users`: `id` (uuid, generated), `email`, `name`, `password_hash`, `created_at`, `updated_at`. `email` is unique and must be stored lower-case (a check constraint rejects anything else), so normalise it before you insert it.
- `sessions`: `id_hash` (bytea primary key, a hash of the session token; the raw token is never stored), `user_id` (references `users`, deleted together with the user), `expires_at`, `created_at`. Both `user_id` and `expires_at` are indexed.

### API endpoints

| Method and path         | Auth   | Request body                  | Success                        | Errors |
| ----------------------- | ------ | ----------------------------- | ------------------------------ | ------ |
| `GET /api/health`       | –      | –                             | `200 {"status":"ok"}`          | `503 SERVICE_UNAVAILABLE` when the database does not answer |
| `POST /api/auth/signup` | –      | `{ name, email, password }`   | `201 { user }` + `sid` cookie  | `400 VALIDATION_ERROR`, `409 EMAIL_TAKEN`, `429 RATE_LIMITED` |
| `POST /api/auth/login`  | –      | `{ email, password }`         | `200 { user }` + `sid` cookie  | `400 VALIDATION_ERROR`, `401 INVALID_CREDENTIALS`, `429 RATE_LIMITED` |
| `POST /api/auth/logout` | cookie (optional) | none (still send `Content-Type: application/json`) | `204`, session deleted and cookie cleared | – (idempotent: works without a session) |
| `GET /api/auth/me`      | cookie | –                             | `200 { user }`                 | `401 UNAUTHENTICATED` |

`user` is `{ id, email, name, createdAt }` (`createdAt` is an ISO 8601 string); the password hash is never returned. Auth responses send `Cache-Control: no-store`.

Unknown routes return `404` with the error shape below. JSON request bodies are limited to 10 kB. Any non-GET/HEAD/OPTIONS request without `Content-Type: application/json`, or with a foreign `Origin`, is rejected with `403 CSRF_REJECTED`.

Example with curl (keeps the cookie in `cookies.txt`):

```sh
curl -i -c cookies.txt -H 'Content-Type: application/json' \
  -d '{"name":"Ada","email":"ada@example.com","password":"correct horse"}' \
  localhost:3001/api/auth/signup
curl -b cookies.txt localhost:3001/api/auth/me
curl -i -b cookies.txt -c cookies.txt -X POST -H 'Content-Type: application/json' \
  localhost:3001/api/auth/logout
```

### Authentication

Cookie-based sessions, implemented in `server/src/auth/`.

- **Input rules:** `name` is trimmed, 1–100 characters. `email` is trimmed, lower-cased and at most 254 characters, so `Ada@Example.com` and `ada@example.com` are the same account. `password` is 8–128 characters at signup (1–128 at login) and is never trimmed.
- **Passwords** are hashed with argon2id (library defaults: 64 MiB, t=3, p=4). Login with an unknown email still runs a dummy verify, and a wrong password and an unknown email return the same `401` body, so accounts cannot be enumerated.
- **Sessions:** the token is 32 random bytes (base64url) sent in the `sid` cookie (`HttpOnly`, `SameSite=Lax`, `Path=/`, `Max-Age` = `SESSION_TTL_DAYS`, `Secure` when `NODE_ENV=production`). Only its SHA-256 is stored in `sessions.id_hash`; a database leak does not expose usable tokens. Expired sessions are rejected and are deleted opportunistically on each successful login.
- **CSRF:** a global guard (`server/src/http/middleware/csrfGuard.ts`) runs before body parsing. Every state-changing request must send `Content-Type: application/json` (HTML forms cannot), and if an `Origin` header is present it must equal `APP_ORIGIN`. New endpoints that accept other content types (file uploads, webhooks) need an explicit exemption.
- **Rate limiting:** signup and login each allow `AUTH_RATE_LIMIT_MAX` requests per IP per `AUTH_RATE_LIMIT_WINDOW_MINUTES`, then return `429 RATE_LIMITED` with a `Retry-After` header. Counters are in memory, so they are per process and reset on restart. Express `trust proxy` is not configured yet, so behind a load balancer or reverse proxy every client shares the proxy's IP and therefore one bucket. Configure it before deploying behind a proxy.
- **Protected routes:** mount `requireAuth` (`server/src/http/middleware/requireAuth.ts`) and read the user with `authenticatedUser(req)`; requests without a valid session get `401 UNAUTHENTICATED`.
- **Logging:** passwords, tokens and request bodies are never logged.

### Tests

For the web app's tests see [Web tests](#web-tests). `npm run test:server` migrates `TEST_DATABASE_URL` once (Vitest global setup) and runs `server/**/*.test.ts` serially. Use `createTestDb()` and `truncateAll(db)` from `server/test/db.ts` to get a clean database per test. Build the app with `loadConfig({ ..., AUTH_RATE_LIMIT_MAX: '0' })` to switch the rate limiter off, and pass a fake `passwordHasher` to `createApp` when a test does not need real argon2 hashing.

### Error responses

Every API error has the shape `{ "error": { "code": string, "message": string } }`. `400 VALIDATION_ERROR` responses add `fields`, a map from body field name to a list of messages (input values are never echoed back). Stack traces are never sent; in production, unexpected errors return a generic `INTERNAL_ERROR` message.


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
