"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { TEST_TYPES, TEST_TYPE_LABELS } from "@/lib/questionBank/schema";

export type CourseFormValues = {
  title: string;
  description: string;
  isFree: boolean;
  price: string;
  jobRoleId: string;
  testType: string;
  isActive: boolean;
};

export const EMPTY_COURSE: CourseFormValues = { title: "", description: "", isFree: true, price: "", jobRoleId: "", testType: "", isActive: true };

/** Create or edit a course. With a `courseId` it saves changes; without one it creates the course and opens it. */
export default function CourseForm({ roles, courseId, initial, currencyCode }: { roles: { id: string; name: string }[]; courseId?: string; initial?: CourseFormValues; currencyCode: string }) {
  const router = useRouter();
  const [v, setV] = useState<CourseFormValues>(initial ?? EMPTY_COURSE);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const set = <K extends keyof CourseFormValues>(k: K, value: CourseFormValues[K]) => setV((p) => ({ ...p, [k]: value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setSaved(false);
    const body = { title: v.title, description: v.description, isFree: v.isFree, price: v.isFree ? 0 : Number(v.price || 0), jobRoleId: v.jobRoleId, testType: v.testType, isActive: v.isActive };
    const res = await fetch(courseId ? `/api/admin/courses/${courseId}` : "/api/admin/courses", { method: courseId ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => null);
    setBusy(false);
    if (!res.ok) {
      const first = data?.issues?.fieldErrors ? Object.values(data.issues.fieldErrors as Record<string, string[]>).flat()[0] : null;
      return setError(first ?? data?.error ?? "Something went wrong. Please try again.");
    }
    if (courseId) {
      setSaved(true);
      router.refresh();
    } else {
      router.push(`/admin/courses/${data.course.id}`);
      router.refresh();
    }
  }

  return (
    <form onSubmit={submit} className="card flex flex-col gap-4">
      <div>
        <label htmlFor="c-title" className="label">Title</label>
        <input id="c-title" className="input" value={v.title} maxLength={120} onChange={(e) => set("title", e.target.value)} required />
      </div>
      <div>
        <label htmlFor="c-desc" className="label">Description</label>
        <textarea id="c-desc" className="input" rows={3} maxLength={2000} value={v.description} onChange={(e) => set("description", e.target.value)} />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="c-role" className="label">Job role</label>
          <select id="c-role" className="input" value={v.jobRoleId} onChange={(e) => set("jobRoleId", e.target.value)}>
            <option value="">General (every job role)</option>
            {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
          <p className="mt-1 text-xs text-zinc-500">A course for one role is only shown to candidates with that role.</p>
        </div>
        <div>
          <label htmlFor="c-test" className="label">Helps with test</label>
          <select id="c-test" className="input" value={v.testType} onChange={(e) => set("testType", e.target.value)}>
            <option value="">None in particular</option>
            {TEST_TYPES.map((t) => <option key={t} value={t}>{TEST_TYPE_LABELS[t]}</option>)}
          </select>
          <p className="mt-1 text-xs text-zinc-500">Used for recommendations, and to let candidates retake that test after finishing the course.</p>
        </div>
        <div>
          <label htmlFor="c-free" className="label">Pricing</label>
          <select id="c-free" className="input" value={v.isFree ? "free" : "paid"} onChange={(e) => set("isFree", e.target.value === "free")}>
            <option value="free">Free</option>
            <option value="paid">Paid</option>
          </select>
        </div>
        {!v.isFree && (
          <div>
            <label htmlFor="c-price" className="label">Price ({currencyCode})</label>
            <input id="c-price" type="number" min={1} className="input" value={v.price} onChange={(e) => set("price", e.target.value)} required />
          </div>
        )}
      </div>
      <label className="flex items-center gap-2 text-sm text-zinc-800">
        <input type="checkbox" checked={v.isActive} onChange={(e) => set("isActive", e.target.checked)} className="size-4" />
        Active (candidates can see and join it)
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" className="btn-primary" disabled={busy}>{busy ? "Saving..." : courseId ? "Save course" : "Create course"}</button>
        {saved && <span role="status" className="text-sm text-green-700">Saved.</span>}
      </div>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
    </form>
  );
}
