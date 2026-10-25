// Sends email through Resend (https://resend.com) when RESEND_API_KEY is set; otherwise prints it,
// so local development works without an email account. Mail comes from EMAIL_FROM (hello@) and
// replies go to the support inbox.
// `replyTo` overrides where replies go (e.g. a support request: reply straight to the person who wrote).
// `headers` adds email headers (e.g. List-Unsubscribe on announcements).
const resendBody = ({ to, subject, text, html, replyTo, headers }) =>
  ({ from: process.env.EMAIL_FROM, reply_to: replyTo ?? CONTACT, to, subject, text, html, ...(headers && { headers }) });
export async function sendEmail(email) {
  if (!process.env.RESEND_API_KEY) {
    console.log(`\n[email] To: ${email.to}\n[email] Subject: ${email.subject}\n${email.text}\n`);
    return;
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify(resendBody(email)),
  });
  if (!res.ok) throw new Error(`Email to ${email.to} failed: ${res.status} ${await res.text()}`);
}

// Up to 100 emails in one request (Resend's batch limit), for announcements. All succeed or the call throws.
export async function sendBatch(emails) {
  if (!process.env.RESEND_API_KEY) {
    console.log(`\n[email batch] ${emails.length} × "${emails[0]?.subject}"\n`);
    return;
  }
  const res = await fetch('https://api.resend.com/emails/batch', {
    method: 'POST',
    headers: { authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify(emails.map(resendBody)),
  });
  if (!res.ok) throw new Error(`Batch of ${emails.length} failed: ${res.status} ${await res.text()}`);
}

// Names, job titles and messages come from users: escape them so nobody can inject HTML or links.
export const esc = (s) => String(s)
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');

const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const CONTACT = 'support@readytowork.ph'; // where people write to us

/**
 * One layout for every email: a plain-text version plus a simple, branded HTML version.
 * Kept deliberately calm (white card, one button, the full link written out) so it reads as trustworthy.
 *   preheader  short summary shown next to the subject in inbox lists
 *   greeting   "Hi Rosa,"
 *   intro      paragraphs of plain text
 *   quote      optional block of user text (e.g. a message preview)
 *   steps      optional numbered list of [title, detail]
 *   button     { label, url }
 *   reason     why the person is receiving this email
 */
// `code` shows a one-time code in a big box; `button` is optional when there's a code instead.
export function renderEmail({ preheader, greeting, intro, quote, code, steps = [], button, reason }) {
  const text = [
    greeting,
    ...intro,
    quote && `"${quote}"`,
    code && `Your code: ${code}`,
    steps.length && steps.map(([title, detail], i) => `${i + 1}. ${title}\n   ${detail}`).join('\n\n'),
    button && `${button.label}: ${button.url}`,
    'The ReadyToWork.ph team',
    `---\n${reason}\nQuestions? Email ${CONTACT}`,
  ].filter(Boolean).join('\n\n');

  const p = (s) => `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#334155">${esc(s)}</p>`;
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ReadyToWork.ph</title></head>
<body style="margin:0;padding:0;background:#f1f5f9">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 12px;font-family:${FONT}">
<tr><td align="center">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px">
    <tr><td style="padding:0 4px 16px;font-size:22px;color:#022c22;letter-spacing:-0.3px">ReadyToWork<b style="color:#047857">.ph</b></td></tr>
    <tr><td style="background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;padding:32px">
      <p style="margin:0 0 16px;font-size:16px;font-weight:600;color:#0f172a">${esc(greeting)}</p>
      ${intro.map(p).join('\n      ')}
      ${quote ? `<div style="margin:0 0 20px;padding:14px 16px;background:#f8fafc;border-radius:8px;font-size:15px;line-height:1.6;color:#334155;white-space:pre-line">${esc(quote)}</div>` : ''}
      ${steps.length ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 20px">${steps.map(([title, detail], i) => `
        <tr><td valign="top" style="padding:0 12px 14px 0"><div style="width:24px;height:24px;border-radius:12px;background:#ecfdf5;color:#047857;font-size:13px;font-weight:700;line-height:24px;text-align:center">${i + 1}</div></td>
        <td style="padding:0 0 14px;font-size:15px;line-height:1.5;color:#334155"><b style="color:#0f172a">${esc(title)}</b><br>${esc(detail)}</td></tr>`).join('')}
      </table>` : ''}
      ${code ? `<div style="margin:0 0 24px;padding:18px;background:#ecfdf5;border-radius:10px;text-align:center;font-size:34px;font-weight:700;letter-spacing:10px;color:#022c22;font-family:Menlo,Consolas,monospace">${esc(code)}</div>` : ''}
      ${button ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 12px"><tr>
        <td style="border-radius:8px;background:#022c22"><a href="${esc(button.url)}" style="display:inline-block;padding:12px 22px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px">${esc(button.label)}</a></td>
      </tr></table>
      <p style="margin:0 0 24px;font-size:13px;line-height:1.5;color:#64748b">Or open this link: <a href="${esc(button.url)}" style="color:#047857;word-break:break-all">${esc(button.url)}</a></p>` : ''}
      <p style="margin:0;font-size:15px;color:#334155">The ReadyToWork.ph team</p>
    </td></tr>
    <tr><td style="padding:20px 4px;font-size:12px;line-height:1.6;color:#64748b">
      ${esc(reason)}<br>Questions? Email <a href="mailto:${CONTACT}" style="color:#64748b">${CONTACT}</a>.<br>ReadyToWork.ph · Remote jobs for Filipino professionals
    </td></tr>
  </table>
</td></tr>
</table>
</body></html>`;
  return { text, html };
}
