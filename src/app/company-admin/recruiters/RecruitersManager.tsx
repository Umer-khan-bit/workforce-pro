"use client";

import { useState } from "react";

type Recruiter = {
  id: string;
  name: string | null;
  email: string;
  isActive: boolean;
  mustChangePassword: boolean;
  createdAt: string;
};

export default function RecruitersManager({
  initialRecruiters,
}: {
  initialRecruiters: Recruiter[];
}) {
  const [recruiters, setRecruiters] = useState(initialRecruiters);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [lastCreated, setLastCreated] = useState<{ email: string; tempPassword: string } | null>(
    null
  );

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLastCreated(null);
    setSubmitting(true);

    const res = await fetch("/api/recruiters", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email }),
    });

    const data = await res.json().catch(() => null);
    setSubmitting(false);

    if (!res.ok) {
      setError(data?.error ?? "Something went wrong. Please try again.");
      return;
    }

    setRecruiters((prev) => [
      {
        id: data.recruiter.id,
        name: data.recruiter.name,
        email: data.recruiter.email,
        isActive: true,
        mustChangePassword: true,
        createdAt: new Date().toISOString(),
      },
      ...prev,
    ]);
    setLastCreated({ email: data.recruiter.email, tempPassword: data.tempPassword });
    setName("");
    setEmail("");
  }

  async function handleDeactivate(id: string) {
    const res = await fetch(`/api/recruiters/${id}/deactivate`, { method: "POST" });
    if (res.ok) {
      setRecruiters((prev) => prev.map((r) => (r.id === id ? { ...r, isActive: false } : r)));
    }
  }

  return (
    <div className="mt-6 flex flex-col gap-8">
      <form onSubmit={handleAdd} className="card flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1">
          <label htmlFor="recruiter-name" className="label">
            Name
          </label>
          <input
            id="recruiter-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="input"
          />
        </div>
        <div className="flex-1">
          <label htmlFor="recruiter-email" className="label">
            Email
          </label>
          <input
            id="recruiter-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="input"
          />
        </div>
        <button
          type="submit"
          disabled={submitting}
          className="btn-primary"
        >
          {submitting ? "Adding..." : "Add recruiter"}
        </button>
      </form>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {lastCreated && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <p className="font-medium">Share this temporary password with {lastCreated.email}:</p>
          <p data-testid="temp-password" className="mt-1 font-mono text-base">
            {lastCreated.tempPassword}
          </p>
          <p className="mt-1 text-xs">
            It won&apos;t be shown again. They&apos;ll be asked to set a new password on first
            login.
          </p>
        </div>
      )}

      <div className="card overflow-x-auto p-0">
      <table className="w-full min-w-[32rem] text-left text-sm">
        <thead>
          <tr className="border-b border-zinc-200 text-zinc-500">
            <th className="px-4 py-3 font-medium">Name</th>
            <th className="px-4 py-3 font-medium">Email</th>
            <th className="px-4 py-3 font-medium">Status</th>
            <th className="px-4 py-3 font-medium"></th>
          </tr>
        </thead>
        <tbody>
          {recruiters.map((r) => (
            <tr key={r.id} className="border-b border-zinc-100">
              <td className="px-4 py-3">{r.name}</td>
              <td className="px-4 py-3">{r.email}</td>
              <td className="px-4 py-3">
                {r.isActive ? (
                  r.mustChangePassword ? (
                    <span className="text-amber-600">
                      Active - password not set yet
                    </span>
                  ) : (
                    <span className="text-green-600">Active</span>
                  )
                ) : (
                  <span className="text-zinc-400">Deactivated</span>
                )}
              </td>
              <td className="px-4 py-3 text-right">
                {r.isActive && (
                  <button
                    onClick={() => handleDeactivate(r.id)}
                    className="min-h-11 text-sm text-red-600 underline hover:text-red-800"
                  >
                    Deactivate
                  </button>
                )}
              </td>
            </tr>
          ))}
          {recruiters.length === 0 && (
            <tr>
              <td colSpan={4} className="px-4 py-6 text-center text-zinc-500">
                No recruiters yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
      </div>
    </div>
  );
}
