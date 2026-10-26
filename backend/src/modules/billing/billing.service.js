// Paddle: prices, API calls, saving subscriptions, checking webhook signatures.
import { createHmac } from 'node:crypto';
import { sameText } from '../../lib/security.js';
import * as Billing from './billing.model.js';

// Paddle is the seller: employers pay at Paddle's checkout, Paddle handles sales tax and pays us out.
// Plans are only switched by what Paddle reports about a subscription (its webhook, or its answer when
// we change a plan), never by the browser.
const PADDLE_API = process.env.PADDLE_ENV === 'production' ? 'https://api.paddle.com' : 'https://sandbox-api.paddle.com';

export const PRICES = () => ({
  pro: { monthly: process.env.PADDLE_PRICE_PRO_MONTHLY, yearly: process.env.PADDLE_PRICE_PRO_YEARLY },
  premium: { monthly: process.env.PADDLE_PRICE_PREMIUM_MONTHLY, yearly: process.env.PADDLE_PRICE_PREMIUM_YEARLY },
});

export const planOfPrice = (id) => Object.entries(PRICES()).find(([, p]) => id && (p.monthly === id || p.yearly === id))?.[0];
export const isYearly = (id) => Object.values(PRICES()).some((p) => p.yearly === id);

export async function paddle(path, body, method = body ? 'POST' : 'GET') {
  const res = await fetch(PADDLE_API + path, {
    method,
    headers: { authorization: `Bearer ${process.env.PADDLE_API_KEY}`, 'content-type': 'application/json' },
    body: body && JSON.stringify(body),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw Object.assign(new Error(`Paddle ${method} ${path} answered ${res.status}: ${JSON.stringify(json?.error)}`), { paddle: json?.error });
  return json.data;
}

export const LIVE = ['active', 'trialing', 'past_due'];

// Saves what Paddle says about a subscription. The paid plan stays on while it's active or Paddle is
// retrying a payment, and goes back to Free once it's canceled or paused. Only the account's current
// subscription changes its plan (a new paid one takes over), and Paddle's messages can arrive out of
// order, so an older state never overwrites a newer one. Returns false for a price we don't sell.
export async function saveSubscription(sub, userId) {
  const plan = LIVE.includes(sub.status) ? planOfPrice(sub.items?.[0]?.price?.id) : 'free';
  if (!plan) return false;
  await Billing.saveSubscription({
    plan, customerId: sub.customer_id, subscriptionId: sub.id, updatedAt: sub.updated_at, userId: Number(userId) || 0, takeOver: plan !== 'free',
  });
  return true;
}

export const billingAccount = Billing.findAccount;

export const portalUrl = async (u) =>
  (await paddle(`/customers/${u.paddle_customer_id}/portal-sessions`, { subscription_ids: [u.paddle_subscription_id] })).urls.general.overview;

// Paddle-Signature is "ts=<unix time>;h1=<hmac>" (more than one h1 while Paddle rotates secrets).
export function paddleSigned(req) {
  const secret = process.env.PADDLE_WEBHOOK_SECRET;
  const fields = (req.get('paddle-signature') ?? '').split(';').map((p) => p.split('='));
  const ts = fields.find(([k]) => k === 'ts')?.[1];
  if (!secret || !req.rawBody || !(Math.abs(Date.now() / 1000 - Number(ts)) <= 300)) return false; // 5 min for clock drift
  const expected = createHmac('sha256', secret).update(`${ts}:`).update(req.rawBody).digest('hex');
  return fields.some(([k, v]) => k === 'h1' && sameText(v, expected));
}
