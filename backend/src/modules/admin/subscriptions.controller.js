// Admin › Subscriptions.
import * as Admin from './admin.model.js';
import { paddle } from '../billing/billing.service.js';

// Who pays and how much: paid employers from our database, with price, billing period, renewal and status
// from Paddle. Plans switched on by hand (no Paddle subscription) show as "manual".
// ponytail: reads the first 200 live subscriptions from Paddle; page through meta.pagination when there are more.
export const list = async (req, res) => {
  const paying = await Admin.listPaying();
  const employers = await Admin.countEmployers();
  let live = new Map(), paddleError = null;
  if (process.env.PADDLE_API_KEY && paying.some((u) => u.paddle_subscription_id)) {
    try {
      const subs = await paddle('/subscriptions?status=active,past_due,paused&per_page=200');
      live = new Map(subs.map((s) => [s.id, s]));
    } catch (err) {
      console.error(err.message);
      paddleError = 'Couldn’t reach Paddle, so prices and renewals are missing.';
    }
  }
  const rows = paying.map((u) => {
    const s = live.get(u.paddle_subscription_id);
    const item = s?.items?.[0]?.price;
    const price = item ? Number(item.unit_price.amount) / 100 : null;
    const yearly = item?.billing_cycle?.interval === 'year';
    return {
      id: u.id, name: u.name, email: u.email, plan: u.plan, since: u.plan_changed_at,
      source: !u.paddle_subscription_id ? 'manual' : s ? 'paddle' : 'unknown',
      status: s?.status ?? null, price, yearly, monthly: price === null ? null : yearly ? Math.round((price / 12) * 100) / 100 : price,
      next_billed_at: s?.next_billed_at ?? null,
      cancels_at: s?.scheduled_change?.action === 'cancel' ? s.scheduled_change.effective_at : null,
    };
  });
  const sum = (f) => Math.round(rows.filter(f).reduce((n, r) => n + (r.monthly ?? 0), 0) * 100) / 100;
  res.json({
    totals: {
      monthly_revenue: sum((r) => r.status === 'active' || r.status === 'past_due'),
      paying: rows.length, pro: rows.filter((r) => r.plan === 'pro').length, premium: rows.filter((r) => r.plan === 'premium').length,
      cancelling: rows.filter((r) => r.cancels_at).length, past_due: rows.filter((r) => r.status === 'past_due').length,
      manual: rows.filter((r) => r.source === 'manual').length, employers,
    },
    subscriptions: rows, paddle_error: paddleError,
  });
};
