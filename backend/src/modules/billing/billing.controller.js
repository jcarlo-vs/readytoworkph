// Paid plans through Paddle: checkout, switching plans, the billing portal, webhooks.
import { bad } from '../../lib/validate.js';
import * as Billing from './billing.model.js';
import { LIVE, PRICES, billingAccount, isYearly, paddle, paddleSigned, planOfPrice, portalUrl, saveSubscription } from './billing.service.js';

// What the pricing page needs to open Paddle's checkout. No token yet: the page says "email us to upgrade".
export const config = (req, res) => {
  const ready = process.env.PADDLE_CLIENT_TOKEN && process.env.PADDLE_API_KEY;
  res.json({ token: ready ? process.env.PADDLE_CLIENT_TOKEN : null, environment: process.env.PADDLE_ENV === 'production' ? 'production' : 'sandbox' });
};

// Starts a checkout. The transaction is made here, not in the browser, so the page can't change which
// account it upgrades. Employers already paying switch plans with /api/billing/change instead (a second
// checkout would bill them twice).
export const checkout = async (req, res) => {
  const price = PRICES()[req.body?.plan]?.[req.body?.yearly ? 'yearly' : 'monthly'];
  if (!price) return bad(res, 'Choose Pro or Premium');
  const u = await billingAccount(req.user.id);
  // Testing sandbox payments on the live site: Paddle's public test card would hand anyone a free paid plan,
  // so only the emails in PADDLE_TESTERS may check out. Unset it (with live keys) to open checkout to everyone.
  const testers = (process.env.PADDLE_TESTERS ?? '').toLowerCase().split(',').map((e) => e.trim()).filter(Boolean);
  if (testers.length && !testers.includes(u.email.toLowerCase()))
    return res.status(403).json({ error: 'Online checkout is coming soon. Contact us at support@readytowork.ph to upgrade.' });
  if (u.plan !== 'free' && u.paddle_subscription_id) return res.status(409).json({ error: 'You already have a paid plan. Switch plans from the pricing page.' });
  const txn = await paddle('/transactions', {
    items: [{ price_id: price, quantity: 1 }],
    custom_data: { user_id: String(req.user.id) },
    ...(u.paddle_customer_id && { customer_id: u.paddle_customer_id }),
  });
  res.json({ transaction_id: txn.id, email: u.paddle_customer_id ? null : u.email });
};

// The employer's subscription as Paddle has it now, for the pricing page: plan, monthly or yearly, next
// renewal, and whether it's set to cancel.
export const subscription = async (req, res) => {
  const u = await billingAccount(req.user.id);
  if (!u.paddle_subscription_id || u.plan === 'free') return res.json({ subscription: null });
  const sub = await paddle(`/subscriptions/${u.paddle_subscription_id}`);
  // A missed webhook would leave the account on a plan Paddle already ended; catch up from what Paddle says now.
  if (!LIVE.includes(sub.status)) { await saveSubscription(sub, req.user.id); return res.json({ subscription: null }); }
  const price = sub.items?.[0]?.price?.id;
  res.json({ subscription: {
    plan: planOfPrice(price), yearly: isYearly(price), status: sub.status, next_billed_at: sub.next_billed_at,
    cancels_at: sub.scheduled_change?.action === 'cancel' ? sub.scheduled_change.effective_at : null,
  } });
};

// Paddle's billing page: card on file, invoices, cancelling.
export const portal = async (req, res) => {
  const u = await billingAccount(req.user.id);
  if (!u.paddle_subscription_id) return res.status(404).json({ error: 'No billing account yet' });
  res.json({ url: await portalUrl(u) });
};

// Switches a paying employer's plan (Pro <-> Premium, monthly <-> yearly) on their existing subscription.
// Without `confirm` it only previews what Paddle would charge today; with it, Paddle charges the card on
// file at once, crediting the unused part of the old plan, and the new plan applies right away.
export const change = async (req, res) => {
  const price = PRICES()[req.body?.plan]?.[req.body?.yearly ? 'yearly' : 'monthly'];
  if (!price) return bad(res, 'Choose Pro or Premium');
  const u = await billingAccount(req.user.id);
  if (u.plan === 'free' || !u.paddle_subscription_id) return res.status(409).json({ error: 'Subscribe first, then you can switch plans' });
  const change = { items: [{ price_id: price, quantity: 1 }], proration_billing_mode: 'prorated_immediately' };
  try {
    if (!req.body.confirm) {
      const p = await paddle(`/subscriptions/${u.paddle_subscription_id}/preview`, change, 'PATCH');
      const usd = (t) => (t ? Number(t.details.totals.grand_total) / 100 : 0); // prices are in USD
      // On a downgrade nothing is charged; the unused part of the old plan becomes credit toward the next bills.
      const credit = p.update_summary?.result?.action === 'credit' ? Number(p.update_summary.result.amount) / 100 : 0;
      return res.json({ preview: { today: usd(p.immediate_transaction), credit, next_billed_at: p.next_billed_at } });
    }
    const sub = await paddle(`/subscriptions/${u.paddle_subscription_id}`, change, 'PATCH');
    await saveSubscription(sub, req.user.id); // Paddle's webhook says the same a moment later
    res.json({ plan: planOfPrice(price) });
  } catch (err) {
    if (!err.paddle) throw err;
    console.error(err.message);
    res.status(400).json({ error: err.paddle.code === 'subscription_locked_pending_changes'
      ? 'Your plan has a change waiting to apply (such as a cancellation). Undo it from Manage billing, then switch.'
      : err.paddle.code === 'forbidden' // our API key lacks Subscriptions: Write
        ? 'Switching plans isn’t available right now. Please email support@readytowork.ph and we’ll switch it for you.'
        : `Paddle couldn’t switch your plan: ${err.paddle.detail ?? 'please try again'}` });
  }
};

// Every subscription change (new, renewed, switched, payment failing, canceled) arrives here. Canceling
// takes effect at the end of the paid period, so employers keep what they paid for.
export const webhook = async (req, res) => {
  if (!paddleSigned(req)) return res.status(401).json({ error: 'Bad signature' });
  const { event_type, data: sub } = req.body;
  if (!event_type?.startsWith('subscription.')) return res.status(204).end();
  // Subscriptions that aren't one of our accounts' (like the samples Paddle's Simulations send) are ignored.
  if (!(await Billing.isOurs(sub.id, Number(sub.custom_data?.user_id) || 0))) return res.status(204).end();
  // A price we don't know means the PADDLE_PRICE_* settings are wrong. Failing makes Paddle retry,
  // so the upgrade still lands once they're fixed.
  if (!(await saveSubscription(sub, sub.custom_data?.user_id))) {
    console.error(`Paddle webhook: unknown price ${sub.items?.[0]?.price?.id}`);
    return res.status(500).json({ error: 'Unknown price' });
  }
  res.status(204).end();
};
