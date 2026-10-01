"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export type NotificationRow = { id: string; title: string; message: string; link: string | null; createdAt: string; read: boolean };

export default function NotificationList({ rows }: { rows: NotificationRow[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const unread = rows.filter((r) => !r.read).length;

  async function post(url: string) {
    setBusy(true);
    setError(null);
    const res = await fetch(url, { method: "POST" });
    setBusy(false);
    if (!res.ok) return setError("Something went wrong. Please try again.");
    router.refresh();
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-zinc-600" aria-live="polite">{unread > 0 ? `${unread} unread` : "You are all caught up."}</p>
        {unread > 0 && <button type="button" className="btn-secondary" disabled={busy} onClick={() => post("/api/notifications/read-all")}>Mark all as read</button>}
      </div>
      {error && <p role="alert" className="mt-2 text-sm text-red-600">{error}</p>}
      {rows.length === 0 ? (
        <p className="card mt-4 text-sm text-zinc-700">No notifications yet. Updates about your results, courses and recruiters will appear here.</p>
      ) : (
        <ul className="mt-4 flex flex-col gap-3" data-testid="notification-list">
          {rows.map((n) => (
            <li key={n.id} className={`card ${n.read ? "" : "border-brand-300 bg-brand-50"}`} data-testid="notification" data-read={n.read}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium text-zinc-900">{n.title}</p>
                  <p className="mt-1 whitespace-pre-line text-sm text-zinc-700">{n.message}</p>
                  <p className="mt-2 text-xs text-zinc-500">{new Date(n.createdAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</p>
                </div>
                {!n.read && <span className="badge bg-brand-700 text-white">New</span>}
              </div>
              <div className="mt-3 flex flex-wrap gap-3">
                {n.link && <Link href={n.link} className="text-sm text-brand-700 underline" onClick={() => { if (!n.read) void fetch(`/api/notifications/${n.id}/read`, { method: "POST" }); }}>Open</Link>}
                {!n.read && <button type="button" className="text-sm text-zinc-700 underline" disabled={busy} onClick={() => post(`/api/notifications/${n.id}/read`)}>Mark as read</button>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
