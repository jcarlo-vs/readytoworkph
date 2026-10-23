# Backend - Express API

Node 24, ES modules, Express 5, `pg`. No ORM, no migration tool.

- `src/app.js` - all routes
- `src/auth.js` - JWT sessions; `signedInUser`/`requireAuth` are async and check `users.sessions_valid_from` (bumping it signs out every device)
- `src/schema.sql` - the whole schema, **idempotent** (`create ... if not exists`, `add column if not exists`). Schema changes go here; `npm run migrate` re-runs it on prod during release.
- `src/db.js`, `email.js` (Resend; prints to console without a key), `storage.js` (R2), `analyzer.js` (AI applicant analysis)
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
