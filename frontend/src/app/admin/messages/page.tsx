'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ErrorText, card } from '@/components/ui';
import { PageHeader, adminApi, ago, failed, pill, useAdmin } from '../ui';

type Row = { user_id: number; name: string; email: string; role: string; last_body: string; last_at: string; from_team: boolean; unread: number };

// Everyone the ReadyToWork.ph Team has a conversation with, newest first; unread replies on top of mind.
// To start a new one, open the person in Users and write from their page.
export default function TeamInbox() {
  const { logout } = useAdmin();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { adminApi<Row[]>('/messages').then(setRows, failed(logout, setError)); }, [logout]);
  const unread = rows?.filter((r) => r.unread).length ?? 0;
  return (
    <>
      <PageHeader title="Messages" sub={rows ? `${unread} waiting for a reply · to write to someone new, open them in Users` : ' '} />
      <ErrorText msg={error} />
      <section className={`${card} p-0`}>
        {!rows ? <p className="p-4 text-sm text-slate-500">Loading…</p> : rows.length === 0 ? (
          <p className="p-6 text-center text-sm text-slate-500">No conversations yet. Open someone in <Link href="/admin/users" className="font-semibold text-emerald-700 underline">Users</Link> and send them a message.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {rows.map((r) => (
              <li key={r.user_id}>
                <Link href={`/admin/users/${r.user_id}#messages`} className={`flex items-center gap-3 px-4 py-3 hover:bg-slate-50 ${r.unread ? 'bg-amber-50/40' : ''}`}>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className={`truncate ${r.unread ? 'font-bold text-slate-900' : 'font-medium text-slate-800'}`}>{r.name}</span>
                      <span className={`${pill} ${r.role === 'employer' ? 'bg-sky-50 text-sky-800' : 'bg-violet-50 text-violet-800'}`}>{r.role}</span>
                    </span>
                    <span className="block truncate text-sm text-slate-500">{r.from_team && 'You: '}{r.last_body}</span>
                  </span>
                  {r.unread > 0 && <span className="rounded-full bg-amber-400 px-2 py-0.5 text-xs font-bold text-slate-900">{r.unread}</span>}
                  <span className="shrink-0 text-xs text-slate-400">{ago(r.last_at)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
