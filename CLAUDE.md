# ReadyToWork.ph

Job board connecting overseas employers with Filipino remote workers. Live at https://readytowork.ph.

- `frontend/` - Next.js on Cloudflare Workers (see `frontend/CLAUDE.md`)
- `backend/` - Express API on Cloud Run, Neon Postgres (see `backend/CLAUDE.md`)
- `ROADMAP.md` - tick items off as features finish
- `.github/workflows/ci.yml` - CI and release pipeline

Roles: worker (profile, apply, message), employer (post jobs, applicants, Hire Talent, Paddle plans), admin.

## Rules

- **Never commit credentials.** Secrets live in `backend/.env` (gitignored), GCP Secret Manager, Cloudflare and GitHub secrets. Never paste or echo secret values in chat. `frontend/.env.production` is committed on purpose: public `NEXT_PUBLIC_*` values only.
- Don't enter passwords for the user.
- **The user runs** commits, pushes, production deploys and production DB commands. Commit only when asked. Any helper script for them to run: show its full contents first.
- Work on `dev`. Release = PR `dev` → `main`, then merge.
- Visitors must never receive contact details (emails, phones, links, handles) in job posts. Masking happens server-side in the API, not only with CSS blur.
- Copy is plain English for Filipino users; avoid jargon.

## Release pipeline

Push/PR runs `backend-tests` (Postgres 17 service) and `website-checks` (`npx next typegen`, `tsc --noEmit`, lint).
Merging to `main` runs `release`: `npm run migrate` against prod (idempotent `schema.sql`), deploys the API with `gcloud run deploy remotepinas-api --source backend --region asia-southeast1` (Workload Identity, main only), then `npm run deploy` for the site.

## Before saying something is done

- `cd backend && npm test`
- `cd frontend && npx tsc --noEmit && npm run lint`
- UI changes: look at them in the browser.
