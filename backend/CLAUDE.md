# Backend - Express API

Node 24, ES modules, Express 5, `pg`. No ORM, no migration tool.

Feature modules (`src/modules/<feature>/`), each with:
- `<feature>.routes.js` - URL → middleware → handler
- `<feature>.controller.js` - request in, response out (checks input, applies rules, answers)
- `<feature>.model.js` - the SQL, as named functions; the only place that queries the database
- `<feature>.service.js` - when it has rules other modules share

Admin pages live in `modules/admin/` (one controller per page, one `admin.routes.js`, one `admin.model.js`).
Queries on `users` shared by many features are in `src/models/users.model.js`; settings in `src/models/settings.model.js`.
Model functions that can run inside a transaction take its connection (`db`) as the last argument; transactions
(`BEGIN`/`COMMIT`) stay in the controller or service that needs them.

- `src/app.js` - global middleware, then every module's routes (all mounted at `/api`; route paths omit it)
- `src/config.js` - plan limits, credits, job types, the site address
- `src/db/` - `index.js` (the pool), `schema.sql` (the whole schema, **idempotent**: `create ... if not exists`, `add column if not exists`; schema changes go here, `npm run migrate` re-runs it on prod during release), `migrate.js`
- `src/middleware/` - `auth.js` (JWT sessions; `signedInUser`/`requireAuth` are async and check `users.sessions_valid_from`, bumping it signs out every device), rate limits, robot check, origin check, activity, errors
- `src/lib/` - small pure helpers (input checks, contact masking, paging, PDF text)
- `src/services/` - shared by several modules: `hooks.js` (email, Google, AI, storage; tests swap them via `app.locals`, which is this object), `mail.js` (Resend; prints to console without a key), `storage.js` (R2), `settings.js`, `plans.js`, `ai/` (Smart Score, Smart Matching agent)
- `src/scripts/seed-jobs.js` - fake jobs for a local database
- `test/api.test.js` - all API tests (`node --test`)
- `backup/` - DB backup job to R2 (`backups/` expires after 30 days)

## Commands

- `npm run dev` - API on http://localhost:4000 (needs `.env`)
- `npm test` - uses local Postgres DB `remotepinas_test`
- `npm run db:init` - apply `schema.sql` to the DB in `.env`

Local Postgres 17 (Homebrew), DBs `remotepinas` and `remotepinas_test`. Config in `.env` (gitignored, never commit or print it). Env var names are listed in the root `README.md`.

## Conventions

- Account states on `users`: `deleted_at` (tombstoned, never hard-deleted), `deactivated_at` (paused, login reactivates), `suspended_at` (admin; email hash goes in `blocked_emails`). Search, job lists, applying and messaging must exclude non-active accounts.
- Job text for visitors goes through `forViewer` / `hideContacts`. Keep contact masking server-side.
- Email sign-ups confirm with a 6-digit code before anything else: `requireAuth` answers 403 `verify_email` unless the route passes `{ unconfirmed: true }`. Unconfirmed accounts see job posts like visitors.
- Tests: the `call()` helper auto-confirms test accounts unless `unconfirmed: true`. New tables must be added to the test DROP list.
