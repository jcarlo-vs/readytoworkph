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
  - [ ] Follow-up: Paddle sandbox API key expires **Jan 16, 2027**: make a new one, update `backend/.env` and Secret Manager `paddle-api-key` (live keys expire too; check their date)
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
  - [x] Follow-up: deploy the website (also carries the worker dashboard, Credits wording and "Browse jobs" fixes) (first CI/CD release, 2026-10-19)
- [x] Follow-up (everything above): run `npm run db:init` on the **production** database before deploying (done 2026-10-19)
- [x] Follow-up: reset the Neon `neondb_owner` password (it was shared in chat) and put the new **pooled** URL in Cloud Run `DATABASE_URL`, at the same time as the backend deploy
- [x] Follow-up (everything above): commit and deploy (2026-10-19)

## CI/CD and branches

- [x] GitHub Actions (`.github/workflows/ci.yml`): every push and PR runs backend tests (throwaway Postgres) + website typecheck and lint; a push to `main` migrates the production database, deploys the backend, then the website
- [x] Public build settings committed in `frontend/.env.production` (secrets stay in Cloud Run, Cloudflare and GitHub)
  - [x] Follow-up: run `~/cicd-setup.sh` once (Google Cloud sign-in for GitHub, no key files)
  - [x] Follow-up: GitHub secrets `DATABASE_URL_DIRECT` (Neon, without -pooler) and `CLOUDFLARE_API_TOKEN` ("Edit Cloudflare Workers" token) (first CI/CD release, 2026-10-19)
  - [x] Follow-up: create the `dev` branch; work on `dev`, release by merging a pull request into `main` (first CI/CD release, 2026-10-19)
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
- [x] Hide contact details for the employer side too (job post text), see 3.
- [x] **Smart Matching** (2026-10-21; AI fit scores renamed **Smart Score**; ⓘ labels on dashboards and pricing): an AI recruiter agent (`backend/src/matchAgent.js`, Claude tool use) searches all talent for a job (Claude Haiku 5.5, about $0.002–0.02 a run), reads profiles and CVs, shortlists up to 10 with reasons; steps stream live; runs saved per job. Pro 3 / Premium 30 a month; skills ~80%, availability ~10%, rate ~10% (above-budget tag, never a filter)
  - [ ] Follow-up: move runs to a queue + worker when simultaneous runs reach the hundreds (today they run inside the request, max 20 per server)
  - [ ] Follow-up: put Smart Matching back on a job's applicants page (hidden 2026-10-21 while the page was redesigned; the component and API are still there: `useMatchFinder` in `components/MatchFinder.tsx`)
  - [ ] Follow-up (only if AI costs grow): prompt caching for the agent's system prompt and tools
  - [ ] Follow-up: skim wider at scale: 40 cards per search, up to 3 pages, about 200 cards per run; "narrow instead of paging" in the prompt
  - [ ] Follow-up: block same-job reruns until the job is edited or 7 days pass
  - [ ] Follow-up (5,000–10,000 workers): Postgres full-text index and ranking for worker search (Hire Talent too)
  - [ ] Follow-up (50,000+ workers): semantic search (pgvector) to pick the best 50 before the AI reads them
- [x] Worker age & gender (2026-10-21): birth date + gender required on the profile form (18+); employers see the age only, never the date; the AI matcher never sees either
- [x] Admin setting "Show full names on Free" (off by default: "Maria S."); "?" next to a short name opens the upgrade popup
- [x] Footer "Hire by skill" links into Hire Talent (employers and visitors)
  - [x] Worker dashboard checklist asks for them
  - [ ] Follow-up: one-time email to existing workers who haven't added them (they can't save their profile until they do)
  - [ ] Decide: show age/gender on Hire Talent cards too. **Never** add an age filter or age preference on jobs (RA 10911, Anti-Age Discrimination in Employment Act)
- [x] Worker profile Rate tile: "about $X/month" (hours per week, or 40 for full-time, × 52 ÷ 12)
- [x] Privacy Policy and Terms: birth date/gender, Smart Score and Smart Matching (AI) explained
- [ ] Education level on profiles (High school, College level, Bachelor's, Master's), like OnlineJobs
- [ ] Skill tests shown on profiles (English level test, typing speed; later a personality test like DISC): earned badges beat self-reported levels

## 2. Keep employers coming back

- [x] 🔔 New applicants bell for employers (2026-10-21): count since they last opened each job's applicants, per-job list linking to that job's applicants; opening them clears it
- [x] Employer app layout (2026-10-21): dark green side menu (Dashboard, Messages · Hiring: My Job Posts, Saved Workers, My Hires · Browse: Hire Talent, Job Board · Account: Analytics, Plan & Billing, Settings), slim top bar with 🔔 and Post a job (talent search removed 2026-10-21; Hire Talent has its own); smaller text
  - [x] Dashboard: greeting, to-do tiles (new applicants, unread messages, open posts + posts used this month), open job posts
  - [x] My Job Posts page (open/closed), My Hires page; tick applicants and message them all at once (one private chat each, up to 50) on a job's applicants page and on All applicants (every job, filters, linked from My Job Posts)
  - [x] Job applicants page: click a row to open a right-side drawer (↑ ↓ to move, Esc to close) with Smart Score, cover letter, actions and "Bookmark this worker" (adds to Saved workers); All · Bookmarked filter
  - [x] Every /dashboard page asks visitors to log in instead of showing an empty page
  - [x] Messages (employers): each conversation shows the job the worker applied to ("Data Entry · +1 job"); a side panel lists every application to you (credits, Smart Score, New / Messaged / Hired), each opening that applicant
  - [x] Messages: workers you reached out to first show "Hasn't applied · you reached out", and the side panel offers "Invite to apply" (sends one of your open jobs as a link)
  - [ ] Follow-up: the Messages side panel shows on wide screens only; bring it to phones and laptops (e.g. an "Applications" button that opens it)
  - [x] Each job takes at most 250 applications (Admin → Settings), then closes itself and can't be reopened; Pro now sees the first 100 applicants (was 150)
  - [x] Post a job / Edit job is a 3-step wizard (The job · Type and pay · Applicants); step 3 asks "Up to how many applications do you want to receive?" (20 / 50 / 100 / as many as possible, or a number). The job closes itself at that number; raising it lets you reopen. Free/Pro see an amber note when the limit is above what their plan shows
  - [x] Visible applicants are first come, first served (Free: the first 20 to apply, Pro: the first 100); Credits only set the order they're listed in
  - [ ] Follow-up: show workers "Taking up to N applications" on the job post
  - [x] Employers see Credits as an "Interest" column (⚡ 5 credits · Strong interest, with an ⓘ explaining it) on a job's applicants and All applicants; the drawer says "Spent 5 of 60 daily Credits on this job"
  - [x] Hire Talent: sticky filters; search matches every word in title, bio or skills (whole words, any order, never the resume)
  - [x] Worker profile (employer view): compact résumé layout, left card with rate and actions plus "Trust checks" (email verified, active this week, profile filled in, photo, resume, portfolio/LinkedIn)
  - [ ] Follow-up: restyle Hire Talent, Messages, Analytics, Pricing and Settings pages for the new layout (they still use the big green band)
  - [ ] Follow-up: phone menu as a ☰ drawer (today it's a scrollable strip)
- [x] Admin › People › Visitors (2026-10-21): every page view (IP, country, page, signed-in user, device, referring site), visitors and views for 24h/7d/30d, top countries and pages; bots and admin pages skipped; kept 90 days (Privacy Policy updated)
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
  - [x] Follow-up: run `npm run db:init` on production before deploying (new `sessions_valid_from` column) (first CI/CD release, 2026-10-19)
- [x] Email confirmation: a link on email sign-up (3 days, one use), yellow reminder bar with "Send a new link", employers confirm before posting jobs; Google sign-ups and password resets count as confirmed; Google linking keeps the password of a confirmed account
  - [x] Follow-up: production `npm run db:init` (adds the columns; existing Google accounts are marked confirmed, existing email accounts see the reminder bar) (first CI/CD release, 2026-10-19)
- [x] Admin: suspend an account (Users page): signed out everywhere, can't log in, hidden like a paused account, email blocked from signing up again (hashed); lift suspension undoes it
- [x] Delete my account (Data Privacy Act: right to erasure): Account settings page, type DELETE; profile, files, applications, jobs, saved/hired lists removed; chats kept for the other person as "Deleted user"; paid plan cancelled at Paddle first; email free to sign up again
  - [x] Follow-up (with "Admin: suspend an account"): keep a hashed email of suspended accounts so they can't sign up again
- [x] Deactivate (pause) my account: hidden from search, jobs hidden, no new messages, everything kept; logging in reactivates ("Welcome back"); employers see a "Deactivated" badge
- [x] Delete leaves anonymous traces: "An applicant deleted their account" rows keep counts and rankings; hires stay as "Deleted user"; old chats still open (read-only)
- [x] Privacy policy: deactivate vs delete explained; backups erased within 30 days (R2 rule `delete-old-backups` already in place)
- [x] First and last name stored separately (sign-up asks for both; Google sends both); employers can still give a company name
- [x] Change your name in Account settings (workers: first/last; employers: company or own name); employers upload a profile photo or logo there too
- [x] Email buttons ("Email us", footer, error pages, plan buttons without checkout) open the Contact us form instead of a mail app
- [x] Contact us page (+ footer and menu links); support requests in the admin inbox with Reply-To the sender
  - [x] Follow-up: make sure support@readytowork.ph is a real inbox (forwards to readytoworksupport@gmail.com)
- [x] Contact details in job posts (emails, links, phones, @handles) hidden from visitors on the server (HTML and API); blurred "Sign up or log in to see" chips; tip for employers when posting
  - [ ] Later, if scams or plan-skipping show up: block contact details in job posts entirely
- [ ] Outreach caps: Pro 100 / Premium 500 workers a month an employer can message first (replies to applicants stay unlimited)
- [ ] AI scam check on new job posts: clean posts go live instantly; suspicious ones go to an admin review queue
- [ ] Worker reviews from employers (needs Mark as hired, done)
- [ ] Time tracker for hired workers (like OnlineJobs Timeproof): decide later; big build (desktop app, screenshots, privacy)
- [ ] Verified ID badge, **after go-live**: use a third-party identity check (ID + live selfie) instead of an admin eyeballing uploads; the bento profile gets the badge then

## 4. Profile & posting extras

**Worker profile: "Bento" layout chosen (2026-10-19).** One tile per topic, skills first. Profile and edit form both use tiles; each section saves on its own.
- [x] Bento profile page (what employers see) + bento edit page (card per section)
- [x] Time zone / hours you can work (e.g. "PH time, open to US hours")
- [x] Work setup: internet speed, backup power, backup internet, own laptop, headset
- [x] English level + other languages
- [x] Resume download on the profile (worker can switch it off)
  - [x] Follow-up: run `npm run db:init` on production before deploying (new profile columns) (first CI/CD release, 2026-10-19)
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
- [x] "Open to work" toggle: covered by Deactivate (Account settings)
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
  - [ ] Follow-up: point the footer's "Hire by skill" links at them (today they open Hire Talent, which Google doesn't index)
- [ ] Success stories page ("Real results"): hires and employer reviews, with permission
- [ ] Referral program (later: needs tracking and payouts; Paddle has no built-in affiliates)

## 7. Business & legal (outside the code)

- [ ] DTI business name registration
- [ ] Barangay clearance → mayor's / business permit
- [ ] BIR registration (before the first real payout)
- [x] Decide the name: **ReadyToWork.ph** (domain bought; see section R. Rebrand)

---

## 8. Testing

Today: API tests (`backend/test`), typecheck and lint in CI. Nothing clicks through the website itself.
- [ ] Browser tests (Playwright) in CI for the main flows: sign up, post a job, apply, message, Free employer upgrade popup and short names, admin "Show full names" switch
- [ ] Dev-only sign-in for local UI checks (localhost and `NODE_ENV=development` only, never in production) so changes can be looked at in the browser as any test account without typing passwords
- [ ] AI matcher check set: a few fixed sample jobs and workers with the people who should come out on top; rerun when the prompt or model changes
- [ ] Error alerts: get an email or Slack message when the API logs errors in production (Cloud Run log alert)

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
