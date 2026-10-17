// "Just now", "A few minutes ago", "12m ago", "4h ago", "1d ago", "2d ago", ...
export function timeAgo(date: string | Date, now = Date.now()) {
  const seconds = Math.max(0, Math.floor((now - new Date(date).getTime()) / 1000));
  if (seconds < 60) return 'Just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 5) return 'A few minutes ago';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

// "Oct 16, 2026"
export const postDate = (date: string | Date) =>
  new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

// "Oct 16, 2026, 10:42 PM" for hover tooltips
export const fullDate = (date: string | Date) =>
  new Date(date).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
