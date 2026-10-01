"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** Deleting asks twice (a page, not a browser dialog). A course people have joined cannot be deleted: switch it off instead. */
export default function DeleteCourse({ courseId, inUse }: { courseId: string; inUse: boolean }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/admin/courses/${courseId}`, { method: "DELETE" });
    const data = await res.json().catch(() => null);
    setBusy(false);
    if (!res.ok) return setError(data?.error ?? "Something went wrong. Please try again.");
    router.push("/admin/courses");
    router.refresh();
  }

  if (inUse) return <p className="text-sm text-zinc-600">Candidates have joined this course, so it cannot be deleted. Untick &ldquo;Active&rdquo; above to hide it instead.</p>;

  return (
    <div>
      {!confirming ? (
        <button type="button" className="btn-secondary" onClick={() => setConfirming(true)}>Delete course</button>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm text-zinc-800">Delete this course and its lessons for good?</p>
          <button type="button" className="btn-primary" disabled={busy} onClick={remove}>{busy ? "Deleting..." : "Yes, delete"}</button>
          <button type="button" className="btn-secondary" disabled={busy} onClick={() => setConfirming(false)}>Cancel</button>
        </div>
      )}
      {error && <p role="alert" className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}
