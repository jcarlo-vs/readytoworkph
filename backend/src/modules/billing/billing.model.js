// What we keep about each employer's Paddle subscription (on users).
import { pool } from '../../db/index.js';

export const findAccount = async (userId) =>
  (await pool.query('SELECT email, plan, paddle_customer_id, paddle_subscription_id FROM users WHERE id = $1', [userId])).rows[0];

// Whether this subscription (or the account it says it's for) is one of our employers'.
export const isOurs = async (subscriptionId, userId) => (await pool.query(
  "SELECT 1 FROM users WHERE role = 'employer' AND (paddle_subscription_id = $1 OR id = $2)", [subscriptionId, userId])).rowCount > 0;

// Updates the employer with this subscription, or the account it was bought for when that has none yet (or
// `takeOver`: a new paid one replaces the old). Paddle's older news never overwrites newer (`updatedAt`).
export const saveSubscription = ({ plan, customerId, subscriptionId, updatedAt, userId, takeOver }) => pool.query(
  `UPDATE users SET plan = $1, paddle_customer_id = $2, paddle_subscription_id = $3, paddle_updated_at = $4
   WHERE role = 'employer' AND (paddle_subscription_id = $3 OR (id = $5 AND (paddle_subscription_id IS NULL OR $6)))
     AND (paddle_updated_at IS NULL OR paddle_updated_at < $4::timestamptz)`,
  [plan, customerId, subscriptionId, updatedAt, userId, takeOver]);
