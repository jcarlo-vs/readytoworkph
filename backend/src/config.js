// Site-wide constants: job types, plan limits, credits, Philippine-time boundaries, the site's address.

export const TYPES = ['full-time', 'part-time', 'gig'];
export const PAGE_SIZE = 20;
export const PERIODS = ['hour', 'month', 'year', 'fixed'];

// What each employer plan includes (null = unlimited); the pricing page promises exactly this.
// Free's AI analyses are set by the admin. Job posts and analyses count per calendar month in
// Philippine time, so they reset on the 1st.
export const PLAN_LIMITS = {
  free: { name: 'Free', posts: 3, applicants: 20, outreach: false, matches: 0 },
  pro: { name: 'Pro', posts: 5, applicants: 100, analyses: 500, outreach: true, matches: 3 },
  premium: { name: 'Premium', posts: 10, applicants: null, analyses: null, outreach: true, matches: 30 },
};

// Premium's AI analyses are unlimited for any real hiring; this fair-use ceiling only stops a runaway
// script (each analysis costs about $0.001-0.002, so the ceiling bounds one account at ~$10-20 a month).
export const PREMIUM_FAIR_USE = 10_000;

export const MONTH_PH = `(date_trunc('month', now() AT TIME ZONE 'Asia/Manila') AT TIME ZONE 'Asia/Manila')`;
export const DAILY_CREDITS = 60;

// Credits refill at midnight Philippine time.
export const TODAY_PH = `(date_trunc('day', now() AT TIME ZONE 'Asia/Manila') AT TIME ZONE 'Asia/Manila')`;

// FRONTEND_ORIGIN can list several sites, comma-separated (e.g. the live domain and a test address).
// Browsers may call the API from any of them; links in emails use the first one.
export const SITES = (process.env.FRONTEND_ORIGIN ?? '').split(',').map((s) => s.trim()).filter(Boolean);

export const SITE = SITES[0];
