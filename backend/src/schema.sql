CREATE TABLE IF NOT EXISTS users (
  id            serial PRIMARY KEY,
  email         text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  name          text NOT NULL,
  role          text NOT NULL CHECK (role IN ('worker', 'employer')),
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS worker_profiles (
  user_id      int PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  title        text NOT NULL DEFAULT '',
  bio          text NOT NULL DEFAULT '',
  skills       text[] NOT NULL DEFAULT '{}',
  hourly_rate  numeric(10,2),
  availability text NOT NULL DEFAULT 'full-time' CHECK (availability IN ('full-time', 'part-time', 'gig')),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS jobs (
  id          serial PRIMARY KEY,
  employer_id int NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title       text NOT NULL,
  description text NOT NULL,
  skills      text[] NOT NULL DEFAULT '{}',
  job_type    text NOT NULL CHECK (job_type IN ('full-time', 'part-time', 'gig')),
  salary_min  int,
  salary_max  int,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS applications (
  id           serial PRIMARY KEY,
  job_id       int NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  worker_id    int NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  cover_letter text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (job_id, worker_id)
);

-- Google sign-in: accounts created with Google have no password
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS google_sub text UNIQUE;

-- Credits: workers put 1-60 credits on each application to signal interest
ALTER TABLE applications ADD COLUMN IF NOT EXISTS credits int NOT NULL DEFAULT 1 CHECK (credits BETWEEN 1 AND 60);
CREATE INDEX IF NOT EXISTS applications_worker_day_idx ON applications (worker_id, created_at);

-- AI application analyzer: free employers get a limited number of analyses, premium is unlimited.
ALTER TABLE users ADD COLUMN IF NOT EXISTS plan text NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'premium'));
ALTER TABLE applications ADD COLUMN IF NOT EXISTS analysis jsonb;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS analyzed_at timestamptz;

-- Optional resume (PDF in private R2 storage): one file per worker. Applications only record whether
-- it was attached, so they always show the current resume and replaced files can be deleted.
ALTER TABLE worker_profiles ADD COLUMN IF NOT EXISTS resume_key text;
ALTER TABLE worker_profiles ADD COLUMN IF NOT EXISTS resume_name text;
ALTER TABLE worker_profiles ADD COLUMN IF NOT EXISTS resume_uploaded_at timestamptz;
-- Text extracted from the resume at upload ('' when it's a scanned image), read by the AI analyzer.
ALTER TABLE worker_profiles ADD COLUMN IF NOT EXISTS resume_text text;
-- Shown to employers as an age (never the date) and a gender; workers fill them in on their profile.
ALTER TABLE worker_profiles ADD COLUMN IF NOT EXISTS birth_date date;
ALTER TABLE worker_profiles ADD COLUMN IF NOT EXISTS gender text;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS resume_attached boolean NOT NULL DEFAULT false;
ALTER TABLE applications DROP COLUMN IF EXISTS resume_key;
ALTER TABLE applications DROP COLUMN IF EXISTS resume_name;

-- Messages between an employer and a worker; a conversation is simply the pair of users.
CREATE TABLE IF NOT EXISTS messages (
  id           serial PRIMARY KEY,
  sender_id    int NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipient_id int NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  job_id       int REFERENCES jobs(id) ON DELETE SET NULL,
  body         text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  read_at      timestamptz
);
CREATE INDEX IF NOT EXISTS messages_pair_idx ON messages (sender_id, recipient_id, created_at);
CREATE INDEX IF NOT EXISTS messages_unread_idx ON messages (recipient_id) WHERE read_at IS NULL;

CREATE INDEX IF NOT EXISTS jobs_skills_idx ON jobs USING gin (skills);
CREATE INDEX IF NOT EXISTS worker_skills_idx ON worker_profiles USING gin (skills);

-- Optional profile photo in private R2 storage (one per user; replaced files are deleted).
ALTER TABLE users ADD COLUMN IF NOT EXISTS photo_key text;

-- Credits are optional: 0-credit applications are allowed and rank below ones with credits.
ALTER TABLE applications DROP CONSTRAINT IF EXISTS applications_credits_check;
ALTER TABLE applications ADD CONSTRAINT applications_credits_check CHECK (credits BETWEEN 0 AND 60);

-- Site settings changed from the admin panel (see SETTINGS in app.js for keys and defaults).
CREATE TABLE IF NOT EXISTS settings (
  key        text PRIMARY KEY,
  value      jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Pay: USD with cents, per hour / month / year, or a fixed price. Existing jobs were monthly.
ALTER TABLE jobs ALTER COLUMN salary_min TYPE numeric(12,2);
ALTER TABLE jobs ALTER COLUMN salary_max TYPE numeric(12,2);
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS salary_period text NOT NULL DEFAULT 'month' CHECK (salary_period IN ('hour', 'month', 'year', 'fixed'));

-- Editing and closing job posts. Closed jobs keep their applicants but leave search and stop taking applications.
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS updated_at timestamptz;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS closed_at timestamptz;
-- When the employer last opened this job's applicants: later applications show in the 🔔 as new.
-- Existing jobs start at the time this column is added, so old applicants don't all show as new.
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS applicants_seen_at timestamptz NOT NULL DEFAULT now();

-- Plans: free, pro, premium. plan_changed_at is stamped by a trigger whenever the plan changes
-- (upgrades are switched on by hand for now), so the pricing page can show real upgrade counts.
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_plan_check;
ALTER TABLE users ADD CONSTRAINT users_plan_check CHECK (plan IN ('free', 'pro', 'premium'));
ALTER TABLE users ADD COLUMN IF NOT EXISTS plan_changed_at timestamptz;
CREATE OR REPLACE FUNCTION stamp_plan_change() RETURNS trigger AS $$
BEGIN
  NEW.plan_changed_at := now();
  RETURN NEW;
END $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS users_plan_changed ON users;
CREATE TRIGGER users_plan_changed BEFORE UPDATE OF plan ON users
  FOR EACH ROW WHEN (OLD.plan IS DISTINCT FROM NEW.plan) EXECUTE FUNCTION stamp_plan_change();

-- Optional links on a worker's profile (work samples and LinkedIn).
ALTER TABLE worker_profiles ADD COLUMN IF NOT EXISTS portfolio_url text;
ALTER TABLE worker_profiles ADD COLUMN IF NOT EXISTS linkedin_url text;

-- Activity for the admin dashboard: when a signed-in user was last active, and their country as
-- Cloudflare sees it (two-letter code). IP addresses are not stored.
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_seen_at timestamptz;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_country text;

-- Forgot password: one-time reset links. Only a hash of the link's token is stored, so a database
-- leak can't be used to reset anyone's password.
CREATE TABLE IF NOT EXISTS password_resets (
  token_hash text PRIMARY KEY,
  user_id    int NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  used_at    timestamptz
);

-- Billing through Paddle: the employer's Paddle customer, their current subscription, and when that
-- subscription last changed (Paddle's webhooks can arrive out of order; older changes are ignored).
ALTER TABLE users ADD COLUMN IF NOT EXISTS paddle_customer_id text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS paddle_subscription_id text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS paddle_updated_at timestamptz;

-- Every AI analysis run, re-runs included, so monthly allowances count actual AI work (an applicant
-- re-analyzed three times uses three). Analyses made before this table existed are copied in once.
CREATE TABLE IF NOT EXISTS ai_analyses (
  id             bigserial PRIMARY KEY,
  employer_id    int NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  application_id int REFERENCES applications(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ai_analyses_employer_created ON ai_analyses (employer_id, created_at);
INSERT INTO ai_analyses (employer_id, application_id, created_at)
SELECT j.employer_id, a.id, a.analyzed_at FROM applications a JOIN jobs j ON j.id = a.job_id
WHERE a.analyzed_at IS NOT NULL AND NOT EXISTS (SELECT 1 FROM ai_analyses);

-- Feedback from anyone (signed in or not): ideas, bug reports and anything else, read in the admin panel.
CREATE TABLE IF NOT EXISTS feedback (
  id          serial PRIMARY KEY,
  user_id     int REFERENCES users(id) ON DELETE SET NULL,
  type        text NOT NULL CHECK (type IN ('idea', 'bug', 'other')),
  message     text NOT NULL,
  page        text,
  contact_ok  boolean NOT NULL DEFAULT false,
  email       text,          -- a visitor's reply address, when they give one
  created_at  timestamptz NOT NULL DEFAULT now(),
  done_at     timestamptz
);

-- The Contact us form shares the feedback inbox: a "support" type, with the sender's name and a subject.
ALTER TABLE feedback DROP CONSTRAINT IF EXISTS feedback_type_check;
ALTER TABLE feedback ADD CONSTRAINT feedback_type_check CHECK (type IN ('idea', 'bug', 'other', 'support'));
ALTER TABLE feedback ADD COLUMN IF NOT EXISTS sender_name text;
ALTER TABLE feedback ADD COLUMN IF NOT EXISTS subject text;

-- Employers' saved workers (bookmarks) and the workers they hired (the start of reviews, and real hire counts).
CREATE TABLE IF NOT EXISTS saved_workers (
  employer_id int NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  worker_id   int NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (employer_id, worker_id)
);
CREATE TABLE IF NOT EXISTS hires (
  employer_id int NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  worker_id   int NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  job_id      int REFERENCES jobs(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (employer_id, worker_id)
);

-- Password guessing protection per account (on top of the per-visitor limit): wrong passwords in the
-- current 15-minute window, and until when password login is paused after too many.
ALTER TABLE users ADD COLUMN IF NOT EXISTS failed_logins int NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS failed_login_at timestamptz;
ALTER TABLE users ADD COLUMN IF NOT EXISTS login_locked_until timestamptz;

-- Bento profile (2026-10): what employers check before messaging. All optional; skills stay a text[] for
-- search, with years per skill kept alongside ({"QuickBooks": 5}).
ALTER TABLE worker_profiles ADD COLUMN IF NOT EXISTS skill_years jsonb NOT NULL DEFAULT '{}';
ALTER TABLE worker_profiles ADD COLUMN IF NOT EXISTS location text NOT NULL DEFAULT '';
ALTER TABLE worker_profiles ADD COLUMN IF NOT EXISTS work_hours text CHECK (work_hours IN ('ph', 'us', 'uk', 'au', 'flexible'));
ALTER TABLE worker_profiles ADD COLUMN IF NOT EXISTS hours_per_week int CHECK (hours_per_week BETWEEN 1 AND 80);
ALTER TABLE worker_profiles ADD COLUMN IF NOT EXISTS start_when text CHECK (start_when IN ('now', '1w', '2w', '1m'));
ALTER TABLE worker_profiles ADD COLUMN IF NOT EXISTS english text CHECK (english IN ('basic', 'conversational', 'fluent', 'native'));
ALTER TABLE worker_profiles ADD COLUMN IF NOT EXISTS languages text NOT NULL DEFAULT '';
ALTER TABLE worker_profiles ADD COLUMN IF NOT EXISTS internet_mbps int CHECK (internet_mbps BETWEEN 1 AND 10000);
ALTER TABLE worker_profiles ADD COLUMN IF NOT EXISTS setup text[] NOT NULL DEFAULT '{}';
ALTER TABLE worker_profiles ADD COLUMN IF NOT EXISTS show_resume boolean NOT NULL DEFAULT true;

-- Logins issued before this moment no longer work: set when the account signs everyone out (a password
-- reset, or Google taking over an account that had a password). 'epoch' = nothing signed out yet.
ALTER TABLE users ADD COLUMN IF NOT EXISTS sessions_valid_from timestamptz NOT NULL DEFAULT 'epoch';

-- Email confirmation. Google sign-ups count as confirmed (Google checked the address); email sign-ups get a
-- one-time link. Links are stored hashed, like password reset links.
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at timestamptz;
UPDATE users SET email_verified_at = created_at WHERE google_sub IS NOT NULL AND email_verified_at IS NULL;
CREATE TABLE IF NOT EXISTS email_verifications (
  token_hash text PRIMARY KEY,
  user_id    int NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL
);

-- Deleted accounts (Data Privacy Act: right to erasure). The row stays as a blank placeholder so the other
-- person keeps their side of a conversation ("Deleted user"); email, password, Google link, name, files,
-- profile, applications, jobs, saved and hired lists are removed.
ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- First and last name kept separately (sign-up asks for both; Google sends both). `name` stays the display
-- name: "First Last" for people, or an employer's company name.
ALTER TABLE users ADD COLUMN IF NOT EXISTS first_name text NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_name text NOT NULL DEFAULT '';
UPDATE users SET first_name = split_part(name, ' ', 1), last_name = trim(substr(name, length(split_part(name, ' ', 1)) + 1))
  WHERE first_name = '' AND last_name = '' AND deleted_at IS NULL;

-- Deactivated (paused) accounts: hidden from search, can't be messaged, their jobs are hidden; everything is
-- kept and logging in again reactivates the account.
ALTER TABLE users ADD COLUMN IF NOT EXISTS deactivated_at timestamptz;

-- Suspended accounts (admin): signed out everywhere, can't log in, hidden like a paused account. Their email
-- is kept only as a one-way hash so it can't be used to sign up again (also after the account is deleted).
ALTER TABLE users ADD COLUMN IF NOT EXISTS suspended_at timestamptz;
CREATE TABLE IF NOT EXISTS blocked_emails (
  email_hash text PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- "Find matches" AI agent runs, one per click: what it did (steps) and who it shortlisted, kept so the
-- employer sees the latest list when they come back. Names and details are shown live from the profiles.
-- Runs still 'running' after a few minutes were interrupted (tab closed, server restart) and don't count.
CREATE TABLE IF NOT EXISTS match_runs (
  id            serial PRIMARY KEY,
  job_id        int NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  employer_id   int NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status        text NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'done', 'failed')),
  steps         jsonb NOT NULL DEFAULT '[]',
  shortlist     jsonb,
  summary       text,
  error         text,
  input_tokens  int NOT NULL DEFAULT 0,
  output_tokens int NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  finished_at   timestamptz
);
CREATE INDEX IF NOT EXISTS match_runs_job ON match_runs (job_id, created_at DESC);
CREATE INDEX IF NOT EXISTS match_runs_employer ON match_runs (employer_id, created_at);

-- Website visits (Admin › Visitors): one row per page view, sent by the site itself, so bots that don't run
-- JavaScript stay out. IP and country identify visitors; rows older than 90 days are deleted.
CREATE TABLE IF NOT EXISTS page_views (
  id         bigserial PRIMARY KEY,
  at         timestamptz NOT NULL DEFAULT now(),
  ip         text NOT NULL,
  country    text,
  path       text NOT NULL,
  referrer   text,
  user_id    int REFERENCES users(id) ON DELETE SET NULL,
  user_agent text
);
CREATE INDEX IF NOT EXISTS page_views_at ON page_views (at DESC);

-- Optional: the employer's own cap on applications for a job (empty = the site-wide most). The job closes when reached.
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS max_applications int CHECK (max_applications BETWEEN 1 AND 5000);
