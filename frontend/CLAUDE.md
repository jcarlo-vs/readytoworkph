@AGENTS.md

# Frontend - Next.js on Cloudflare Workers

Next.js 16 App Router, React 19, Tailwind 4, deployed with OpenNext (`@opennextjs/cloudflare`, `wrangler.jsonc`, `worker.ts`).

- `src/app/(app)/` - site pages; `src/app/admin/` - admin panel; `src/app/page.tsx` - homepage
- `src/components/styles.ts` - shared class strings (rounded-full buttons, soft cards, `band`). Reuse them.
- `src/components/ui.tsx` - `PageBand`, `BandStat`, `Flash`, `ConfirmEmailBanner`, etc.
- `src/lib/api.ts` (browser), `src/lib/server-api.ts` (server), `src/lib/auth.tsx` (session), `src/lib/profile.ts` (profile labels)

## Commands

- `npm run dev` - http://localhost:3000 (backend must run on :4000)
- `npx next typegen && npx tsc --noEmit && npm run lint` - same checks as CI
- `npm run deploy` - production deploy; CI does this on merge to `main`, the user runs it manually otherwise

## Conventions

- Design: "Band + Soft" - green page band header, mint background, soft cards.
- Links and footer differ for visitors, workers and employers; check all three.
- `.env.production` is committed and holds only public `NEXT_PUBLIC_*` values. Never put secrets in any frontend env file.
