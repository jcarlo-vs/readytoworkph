'use client';

// Last resort, when even the site's frame (header, footer) fails. It replaces the whole page, so it
// can't use the site's stylesheet: styles are inline.
export default function GlobalError({ retry }: { error: unknown; retry: () => void }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#f8fafc', color: '#0f172a', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif', padding: 16 }}>
        <title>Something went wrong | ReadyToWork.ph</title>
        <div style={{ maxWidth: 440, textAlign: 'center', background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 40 }}>
          <p style={{ margin: '0 0 16px', fontSize: 22 }}>ReadyToWork<b style={{ color: '#047857' }}>.ph</b></p>
          <h1 style={{ margin: '0 0 8px', fontSize: 24 }}>Something went wrong</h1>
          <p style={{ margin: '0 0 24px', color: '#475569', lineHeight: 1.6 }}>ReadyToWork.ph ran into a problem. Please try again in a moment. Your account and data are safe.</p>
          <button type="button" onClick={() => retry()} style={{ background: '#022c22', color: '#fff', border: 0, borderRadius: 8, padding: '10px 20px', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>Try again</button>
          <p style={{ margin: '24px 0 0', fontSize: 14, color: '#64748b' }}>Still stuck? Email <a href="mailto:support@readytowork.ph" style={{ color: '#047857' }}>support@readytowork.ph</a></p>
        </div>
      </body>
    </html>
  );
}
