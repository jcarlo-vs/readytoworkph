// The robot check (Cloudflare Turnstile).

// Compares secrets in constant time, so response timing reveals nothing about them.
// Robot check (Cloudflare Turnstile) for the forms bots abuse: sign-up, forgot password, admin login, contact,
// visitor feedback. The page sends the widget's token; Cloudflare says whether a person earned it. Without
// TURNSTILE_SECRET (local development, tests) the check is skipped. Swappable for tests.
export async function verifyHuman(req) {
  const secret = process.env.TURNSTILE_SECRET;
  if (!secret) return true;
  const token = typeof req.body?.turnstile === 'string' ? req.body.turnstile : '';
  if (!token) return false;
  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: new URLSearchParams({ secret, response: token, remoteip: req.visitor ?? req.ip }),
    });
    return (await res.json()).success === true;
  } catch (err) {
    console.error('Turnstile check failed', err); // Cloudflare unreachable: let people through rather than lock everyone out
    return true;
  }
}

export const notHuman = (res) => res.status(400).json({ error: 'Please complete the “I’m human” check and try again.', code: 'robot_check' });
