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
