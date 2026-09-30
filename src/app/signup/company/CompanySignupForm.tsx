"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";

export default function CompanySignupForm({ cities }: { cities: { id: string; name: string }[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const form = new FormData(e.currentTarget);
    const payload = {
      companyName: form.get("companyName"),
      industry: form.get("industry"),
      cityId: form.get("cityId"),
      adminName: form.get("adminName"),
      adminEmail: form.get("adminEmail"),
      adminPassword: form.get("adminPassword"),
    };

    setSubmitting(true);

    const res = await fetch("/api/signup/company", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setError(data?.error ?? "Something went wrong. Please try again.");
      setSubmitting(false);
      return;
    }

    const result = await signIn("credentials", {
      email: payload.adminEmail,
      password: payload.adminPassword,
      redirect: false,
    });

    setSubmitting(false);

    if (result?.error) {
      setError("Account created, but automatic login failed. Please log in manually.");
      router.push("/login");
      return;
    }

    router.push("/");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
      <fieldset className="flex flex-col gap-4">
        <legend className="text-sm font-semibold text-zinc-900">Company</legend>
        <Field label="Company name" name="companyName" type="text" required />
        <Field label="Industry" name="industry" type="text" />
        <div>
          <label htmlFor="cityId" className="label">
            City
          </label>
          <select id="cityId" name="cityId" defaultValue="" className="input">
            <option value="">Select city (optional)</option>
            {cities.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-4 border-t border-zinc-200 pt-4">
        <legend className="text-sm font-semibold text-zinc-900">
          Company admin account
        </legend>
        <Field label="Your name" name="adminName" type="text" required />
        <Field label="Email" name="adminEmail" type="email" required />
        <Field label="Password" name="adminPassword" type="password" required minLength={8} />
      </fieldset>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        type="submit"
        disabled={submitting}
        className="btn-primary mt-2"
      >
        {submitting ? "Creating account..." : "Create company account"}
      </button>
    </form>
  );
}

function Field({
  label,
  name,
  type,
  required,
  minLength,
}: {
  label: string;
  name: string;
  type: string;
  required?: boolean;
  minLength?: number;
}) {
  return (
    <div>
      <label htmlFor={name} className="label">
        {label}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        required={required}
        minLength={minLength}
        className="input"
      />
    </div>
  );
}
