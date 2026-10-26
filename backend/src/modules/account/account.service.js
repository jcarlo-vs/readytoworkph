// Account changes shared with the admin: deleting an account.
import { paddle } from '../billing/billing.service.js';
import { deleteFile } from '../files/files.service.js';
import * as Account from './account.model.js';

export const maskEmail = (e) => e.replace(/^(.)[^@]*/, '$1***');

// Delete my account, straight away (type DELETE to confirm). A paid plan is cancelled at Paddle first, so a
// failure there stops everything and nothing is half-deleted. Then the data (one transaction), then the files.
// Shared by "Delete my account" and the admin deleting one on request. Returns an error message when the paid plan
// couldn't be cancelled (then nothing was deleted), or null once it's done.
export async function deleteAccount(id) {
  const u = await Account.findForDeletion(id);
  if (u.paddle_subscription_id && process.env.PADDLE_API_KEY) {
    try {
      await paddle(`/subscriptions/${u.paddle_subscription_id}/cancel`, { effective_from: 'immediately' });
    } catch (err) {
      if (err.paddle?.code !== 'subscription_locked_pending_changes' && !/canceled|cancelled/i.test(err.message)) {
        console.error(err);
        return 'We couldn’t cancel the subscription at Paddle just now, so nothing was deleted. Please try again in a minute.';
      }
    }
  }
  await Account.erase(id);
  [u.photo_key, u.resume_key].forEach(deleteFile);
  return null;
}
