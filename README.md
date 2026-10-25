# ReadyToWork.ph

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

Support email into the admin panel (Admin › Feedback & support): Cloudflare Email Routing sends `support@readytowork.ph` to the site's Worker (its `email` handler in `frontend/worker.ts`). The Worker forwards each email on to `SUPPORT_FORWARD_TO` (a verified Email Routing destination) and posts a copy to `/api/support/inbound` with `INBOUND_SECRET`. Set `INBOUND_SECRET` both as a Worker secret and on the backend (Cloud Run); `SUPPORT_FORWARD_TO` as a Worker secret. Without them, support email goes nowhere new and the panel only shows the website forms. `ADMIN_EMAIL` also receives the test copy of an announcement.

Paid plans are sold through Paddle (it's the seller of record and handles sales tax). Set these in `backend/.env`; until `PADDLE_CLIENT_TOKEN` and `PADDLE_API_KEY` are set, the pricing page says "email us to upgrade":
`PADDLE_ENV` (`sandbox` or `production`), `PADDLE_API_KEY`, `PADDLE_CLIENT_TOKEN`, `PADDLE_WEBHOOK_SECRET`, and the four price IDs `PADDLE_PRICE_PRO_MONTHLY`, `PADDLE_PRICE_PRO_YEARLY`, `PADDLE_PRICE_PREMIUM_MONTHLY`, `PADDLE_PRICE_PREMIUM_YEARLY`. Paddle's webhook goes to `https://readytowork.ph/api/billing/webhook` (subscription events); it is the only thing that changes an employer's plan.

Google sign-in stays hidden until the same OAuth Client ID is set in both files; restart both dev servers after changing them.

## Tests

```bash
createdb remotepinas_test   # one-time
cd backend && npm test
```
