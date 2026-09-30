"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { signIn } from "next-auth/react";

type LookupItem = { id: string; name: string };

export default function CandidateSignupForm({
  regions,
  jobRoles,
}: {
  regions: LookupItem[];
  jobRoles: LookupItem[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [consentGiven, setConsentGiven] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const form = new FormData(e.currentTarget);
    const payload = {
      name: form.get("name"),
      email: form.get("email"),
      password: form.get("password"),
      phone: form.get("phone"),
      city: form.get("city"),
      regionId: form.get("regionId"),
      experienceYears: form.get("experienceYears"),
      jobRoleId: form.get("jobRoleId"),
      minimumSalary: form.get("minimumSalary"),
      consentGiven,
    };

    setSubmitting(true);

    const res = await fetch("/api/signup/candidate", {
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
      email: payload.email,
      password: payload.password,
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
      <Field label="Full name" name="name" type="text" required />
      <Field label="Email" name="email" type="email" required />
      <Field label="Password" name="password" type="password" required minLength={8} />
      <Field label="Phone" name="phone" type="tel" required />
      <Field label="City" name="city" type="text" required />

      <SelectField label="Region" name="regionId" required options={regions} />
      <Field label="Years of experience" name="experienceYears" type="number" min={0} max={60} required />
      <SelectField label="Job role" name="jobRoleId" required options={jobRoles} />
      <Field label="Minimum expected salary" name="minimumSalary" type="number" min={0} required />

      <label className="flex items-start gap-2 text-sm text-zinc-700">
        <input
          type="checkbox"
          checked={consentGiven}
          onChange={(e) => setConsentGiven(e.target.checked)}
          className="mt-0.5"
        />
        <span>
          I agree to the{" "}
          <Link href="/privacy" target="_blank" className="underline">
            privacy policy
          </Link>
          .
        </span>
      </label>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        type="submit"
        disabled={submitting || !consentGiven}
        className="btn-primary mt-2"
      >
        {submitting ? "Creating account..." : "Create account"}
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
  min,
  max,
}: {
  label: string;
  name: string;
  type: string;
  required?: boolean;
  minLength?: number;
  min?: number;
  max?: number;
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
        min={min}
        max={max}
        className="input"
      />
    </div>
  );
}

function SelectField({
  label,
  name,
  required,
  options,
}: {
  label: string;
  name: string;
  required?: boolean;
  options: LookupItem[];
}) {
  return (
    <div>
      <label htmlFor={name} className="label">
        {label}
      </label>
      <select
        id={name}
        name={name}
        required={required}
        defaultValue=""
        className="input"
      >
        <option value="" disabled>
          Select {label.toLowerCase()}
        </option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
    </div>
  );
}
