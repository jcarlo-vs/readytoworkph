# ReadyToWork.ph roadmap

Features we decided to build, many inspired by looking through OnlineJobs.ph (employer and worker accounts).

**How to use this file**
- `[ ]` = to do · `[x]` = built and tested.
- An item stays `[ ]` until it works end to end. Built items that still need something outside the code (keys, settings, deploy) keep `- [ ] Follow-up:` lines underneath; tick or delete each follow-up when done.
- Decided **not** to build: listed at the bottom with the reason, so we don't revisit them by accident.

---

## R. Rebrand to ReadyToWork.ph

- [x] Code: name, logo (ReadyToWork + gold .ph), emails, legal pages, links, support@readytowork.ph, share image, sitemap/robots
- [x] Old domains (remoteworks.ph, remotepinas.com) redirect permanently to readytowork.ph (worker.ts + wrangler.jsonc routes)
  - [x] Follow-up: add **readytowork.ph** to Cloudflare; Porkbun nameservers → dale/nora.ns.cloudflare.com; DNSSEC off
  - [x] Follow-up: wait for Cloudflare to show readytowork.ph as **Active** (.ph registry delegated 2026-10-19)
  - [x] Follow-up: deploy the worker so the new routes go live (deployed 2026-10-19)
  - [ ] Follow-up: keep **remoteworks.ph** and **remotepinas.com** renewed for at least a year so old links and Google keep redirecting
  - [x] Follow-up: Cloud Run `FRONTEND_ORIGIN` (now `https://remoteworks.ph`) → `https://readytowork.ph,https://remoteworks.ph`, right **after** the frontend deploy (email links use the first one)
  - [x] Follow-up: Resend: verify **readytowork.ph** as a sending domain, **then** change Cloud Run `EMAIL_FROM` (now `RemoteWorksPH <hello@remoteworks.ph>`) → `ReadyToWork.ph <hello@readytowork.ph>`
  - [x] Follow-up: create the **support@readytowork.ph** inbox: Cloudflare Email Routing forwards support@ and hello@ to readytoworksupport@gmail.com
  - [ ] Follow-up (optional): Gmail "Send mail as" support@readytowork.ph via Resend SMTP so replies show the domain address
  - [x] Follow-up: Google sign-in: `https://readytowork.ph` + `www` added to the OAuth client's JavaScript origins; consent screen links and authorized domain updated
  - [x] Follow-up: after go-live, verify readytowork.ph in Google Search Console, then click **Verify branding** on the OAuth consent screen (shows the app name in the Google popup)
  - [x] Follow-up: after go-live, remove `remotepinas.com` and `remoteworks.ph` from the OAuth authorized domains and client origins (they only redirect)
  - [ ] Follow-up: Paddle (sandbox now, live later): rename products to "ReadyToWork.ph Pro / Premium", statement text `READYTOWRK`, default payment link `https://readytowork.ph/pricing`, webhook URL `https://readytowork.ph/api/billing/webhook`, website approval for readytowork.ph
  - [x] Follow-up: Cloudflare Turnstile widget for readytowork.ph (see 3.)
  - [x] Follow-up: Google Search Console: readytowork.ph verified + sitemap submitted (no "Change of address": remoteworks.ph was never in Search Console; the 301 redirects cover it)
  - [ ] Follow-up: update social profiles / any printed links
- Kept on purpose (nobody sees them, renaming would break things): database name `remotepinas`, Cloudflare worker and Cloud Run service names, login cookie names

## 0. Done today (before go-live follow-ups)

- [x] Paddle subscriptions: checkout, plan switching with proration, cancel, yearly, webhook
  - [ ] Follow-up: Paddle **live** account approved (verification, website approval, payout details)
  - [ ] Follow-up: recreate products/prices, API key (incl. Subscriptions: Write), client token, payment link, statement text and webhook in the **live** account; set `PADDLE_*` with `PADDLE_ENV=production` in Cloud Run
  - [ ] Follow-up: point the live webhook at `https://readytowork.ph/api/billing/webhook`
- [x] Plan limits: job posts/month, visible applicants per job, outreach, monthly AI fit scores, Premium fair use (10,000)
- [x] AI Fit Score naming, re-score, Score all (Premium), monthly AI run log
- [x] Hiring analytics (Premium): period and job filters, funnel, fit mix, best candidates, job table with search and pages
- [x] Send feedback popup + admin inbox
- [x] Admin panel: grouped dark sidebar; Overview, Users, Jobs, Subscriptions, Feedback & support, Settings
- [x] Job title (120) and description (10,000) limits with live counters
- [x] UI refresh "band + soft": green page band (PageBand) on dashboards, contact, profile, Hire talent, analytics, applicants; soft borderless cards, pill buttons, mint page, green footer
  - [ ] Follow-up: deploy the website (also carries the worker dashboard, Credits wording and "Browse jobs" fixes)
- [x] Follow-up (everything above): run `npm run db:init` on the **production** database before deploying (done 2026-10-19)
- [x] Follow-up: reset the Neon `neondb_owner` password (it was shared in chat) and put the new **pooled** URL in Cloud Run `DATABASE_URL`, at the same time as the backend deploy
- [x] Follow-up (everything above): commit and deploy (2026-10-19)

## CI/CD and branches

- [x] GitHub Actions (`.github/workflows/ci.yml`): every push and PR runs backend tests (throwaway Postgres) + website typecheck and lint; a push to `main` migrates the production database, deploys the backend, then the website
- [x] Public build settings committed in `frontend/.env.production` (secrets stay in Cloud Run, Cloudflare and GitHub)
  - [x] Follow-up: run `~/cicd-setup.sh` once (Google Cloud sign-in for GitHub, no key files)
  - [ ] Follow-up: GitHub secrets `DATABASE_URL_DIRECT` (Neon, without -pooler) and `CLOUDFLARE_API_TOKEN` ("Edit Cloudflare Workers" token)
  - [ ] Follow-up: create the `dev` branch; work on `dev`, release by merging a pull request into `main`
  - [ ] Follow-up: protect `main` (changes only through pull requests with passing checks)
- [ ] Staging site (staging.readytowork.ph from `dev`): when there are paying users

## 1. Find & shortlist talent

- [x] Hire Talent search: pages (20 per page), filters (skills, availability, hourly rate, last active), sort, richer cards
- [x] Save workers (bookmarks) + Saved list (Hire Talent, My Jobs, profile menu)
- [x] Worker profile action bar: Message · Save · Mark as hired (+ Undo)
- [x] Mark as hired + "Your hires" on My Jobs
- [x] Last active (Philippine calendar days) and member since on profiles
- [x] Rate shown per hour only (monthly estimate removed 2026-10-19: it looked like the asking salary; see "Hours per day / week" in 4.)
- [x] Worker privacy: Free employers see "Maria S.", no links, until they can contact the worker
- [x] Contact details in worker bios/headlines hidden (blurred "upgrade to see", clickable)
- [ ] Hide contact details for the employer side too (company name / job post text), see 3.

## 2. Keep employers coming back

- [ ] Application emails to employers (daily summary by default; instant / off as options). Today employers get **no** email when someone applies
- [ ] After-posting success screen: "Your job is live", copy link to share, posts left this month, tips
- [ ] Job views count on job cards and analytics ("142 views · 12 applicants")
- [ ] "It's 1:19 AM in the Philippines" on the employer dashboard
- [ ] Upgrade card for Free employers on My Jobs
- [ ] Job bump: move a job back to the top of search once every 7 days (decide: free or paid perk)

## 3. Trust & safety

- [x] Robot check (Cloudflare Turnstile) on sign-up, login (after 2 misses), forgot password, contact (visitors), feedback (visitors)
  - [x] Follow-up: create the Turnstile widget in Cloudflare for `readytowork.ph`
  - [x] Follow-up: set `NEXT_PUBLIC_TURNSTILE_SITE_KEY` (frontend `.env.production.local`) and `TURNSTILE_SECRET` (Secret Manager `turnstile-secret`); local `.env` files keep the **test** keys
- [x] Login protection: 5 wrong passwords per account → 15-minute pause + email to the owner; reset ends it; per-visitor limit kept
- [x] Login edge cases: a password reset signs out every other device; Google sign-in takes over an account made with the same email (removes its password, signs out other devices, emails the owner); Google on the log-in page without an account offers "looking for work / hiring"
  - [ ] Follow-up: run `npm run db:init` on production before deploying (new `sessions_valid_from` column)
- [x] Email confirmation: a link on email sign-up (3 days, one use), yellow reminder bar with "Send a new link", employers confirm before posting jobs; Google sign-ups and password resets count as confirmed; Google linking keeps the password of a confirmed account
  - [ ] Follow-up: production `npm run db:init` (adds the columns; existing Google accounts are marked confirmed, existing email accounts see the reminder bar)
- [ ] Admin: suspend an account (it signs them out everywhere)
- [ ] Delete my account (Data Privacy Act: right to erasure)
- [x] Contact us page (+ footer and menu links); support requests in the admin inbox with Reply-To the sender
  - [x] Follow-up: make sure support@readytowork.ph is a real inbox (forwards to readytoworksupport@gmail.com)
- [ ] Block contact info (emails, phone numbers, Telegram/WhatsApp/Viber links) in **job posts**, with a clear message
- [ ] Outreach caps: Pro 100 / Premium 500 workers a month an employer can message first (replies to applicants stay unlimited)
- [ ] AI scam check on new job posts: clean posts go live instantly; suspicious ones go to an admin review queue
- [ ] Worker reviews from employers (needs Mark as hired, done)
- [ ] Verified ID badge, **after go-live**: use a third-party identity check (ID + live selfie) instead of an admin eyeballing uploads; the bento profile gets the badge then

## 4. Profile & posting extras

**Worker profile: "Bento" layout chosen (2026-10-19).** One tile per topic, skills first. Profile and edit form both use tiles; each section saves on its own.
- [x] Bento profile page (what employers see) + bento edit page (card per section)
- [x] Time zone / hours you can work (e.g. "PH time, open to US hours")
- [x] Work setup: internet speed, backup power, backup internet, own laptop, headset
- [x] English level + other languages
- [x] Resume download on the profile (worker can switch it off)
  - [ ] Follow-up: run `npm run db:init` on production before deploying (new profile columns)
- [x] "Can start" (now / 1 week / 2 weeks / 1 month)
- [x] Hint under About: no email, phone or social links

- [x] Skill picker with suggestions (one spelling per skill; custom allowed; up to 10)
- [x] Years of experience per skill
- [x] Worker location (city/province only)
- [x] Hours per week on the worker profile
  - [ ] Follow-up: hours per week on job posts
- [ ] Company / business name on job posts
- [ ] Salary in pesos next to dollars ("$6/hr · about ₱340/hr")

## 5. Worker side

- [ ] Account settings: change email, change password
- [ ] "Open to work" toggle: hide yourself from search when not looking
- [ ] Bookmark jobs + Saved jobs list
- [ ] Job alerts: pick skills, get emailed when a matching job is posted
- [x] Application status for workers: messaged / hired / job closed (on the worker dashboard)
  - [ ] Follow-up: "viewed by employer" (needs tracking when an employer opens an application)
- [x] Worker dashboard: greeting, Credits / applications / unread / hired tiles, profile checklist, application status
  - [ ] Follow-up: saved jobs on the dashboard (after "Bookmark jobs")
- [ ] Messages: Unread filter and search

## 6. Premium extras & growth

- [ ] Hiring kit (Premium): contractor agreement, NDA, "Hiring in the Philippines" guide (13th-month pay, holidays)
  - [ ] Follow-up: have a lawyer glance at the templates; add "templates, not legal advice"
- [ ] Category landing pages for search traffic (e.g. `/hire/bookkeepers`, `/hire/virtual-assistants`)
- [ ] Referral program (later: needs tracking and payouts; Paddle has no built-in affiliates)

## 7. Business & legal (outside the code)

- [ ] DTI business name registration
- [ ] Barangay clearance → mayor's / business permit
- [ ] BIR registration (before the first real payout)
- [x] Decide the name: **ReadyToWork.ph** (domain bought; see section R. Rebrand)

---

## Decided not to build (and why)

- **Work experience history** on profiles: workers skip long forms; skills with years say more
- **Education** on profiles: freelancers are hired for their skills, not degrees
- **Intro video** on profiles: employers can ask for one in their job post when they want it

- **EasyPay**: just links to Payoneer/PayPal; we stay out of worker pay
- **Timeproof** (time tracking with screenshots): separate app, free alternatives exist, off-brand for a worker-friendly site
- **Worker mentoring / coaching**: a staffing service, not software
- **"One VA Away" course**: content marketing; free hiring guides on the site instead
- **IQ / DISC / English test scores**: self-reported and unreliable; the AI Fit Score covers quality
- **Age and gender on profiles**: invites hiring discrimination
- **Full email-client inbox** (labels, archive, pinned): overkill; maybe Unread + Search (see 5.)
- **Skill star ratings**: self-rated stars mean little; years of experience instead
- **Artificial 2-day job approval on Free**: replaced by the AI scam check (see 3.)
- **One plan switch per 24 hours**: not needed unless we see abuse
