# RemotePinas

Job board connecting employers with Filipino remote workers.

- `frontend/` — Next.js (App Router, Tailwind) on http://localhost:3000
- `backend/` — Node.js + Express API on http://localhost:4000
- Database — local PostgreSQL (`remotepinas`)

## Run locally

```bash
# one-time
createdb remotepinas
cd backend && npm install && npm run db:init

# backend (terminal 1)
cd backend && npm run dev

# frontend (terminal 2)
cd frontend && npm install && npm run dev
```

Backend config lives in `backend/.env` (DATABASE_URL, JWT_SECRET, PORT, FRONTEND_ORIGIN, GOOGLE_CLIENT_ID).
Frontend reads `NEXT_PUBLIC_API_URL` and `NEXT_PUBLIC_GOOGLE_CLIENT_ID` from `frontend/.env.local`.

Message notification emails go through Resend when `RESEND_API_KEY` and `EMAIL_FROM` are set in `backend/.env`; without a key they are printed in the backend terminal.

Google sign-in stays hidden until the same OAuth Client ID is set in both files; restart both dev servers after changing them.

## Tests

```bash
createdb remotepinas_test   # one-time
cd backend && npm test
```
