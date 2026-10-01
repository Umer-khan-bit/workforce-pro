"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { signIn } from "next-auth/react";

type LookupItem = { id: string; name: string };

type CityItem = LookupItem & { regionId: string };

export default function CandidateSignupForm({
  regions,
  jobRoles,
  cities,
}: {
  regions: LookupItem[];
  jobRoles: LookupItem[];
  cities: CityItem[];
}) {
  const [regionId, setRegionId] = useState("");
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
      cityId: form.get("cityId"),
      regionId,
      experienceYears: form.get("experienceYears"),
      jobRoleId: form.get("jobRoleId"),
      minimumSalary: form.get("minimumSalary"),
      gender: form.get("gender"),
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
      <SelectField
        label="Region"
        name="regionId"
        required
        options={regions}
        value={regionId}
        onChange={setRegionId}
      />
      <SelectField
        key={regionId}
        label="City"
        name="cityId"
        required
        disabled={!regionId}
        options={cities.filter((c) => c.regionId === regionId)}
      />
      <Field label="Years of experience" name="experienceYears" type="number" min={0} max={60} required />
      <SelectField label="Job role" name="jobRoleId" required options={jobRoles} />
      <Field label="Minimum expected salary" name="minimumSalary" type="number" min={0} required />
      <div>
        <label htmlFor="gender" className="label">Gender (optional)</label>
        <select id="gender" name="gender" defaultValue="" className="input">
          <option value="">Prefer not to say</option>
          <option value="FEMALE">Female</option>
          <option value="MALE">Male</option>
          <option value="OTHER">Other</option>
        </select>
        <p className="mt-1 text-xs text-zinc-500">Optional. Used only to check that the tests are fair to everyone. It is never shown to recruiters or companies.</p>
      </div>

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
  value,
  onChange,
  disabled,
}: {
  label: string;
  name: string;
  required?: boolean;
  options: LookupItem[];
  value?: string;
  onChange?: (value: string) => void;
  disabled?: boolean;
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
        disabled={disabled}
        {...(onChange
          ? { value, onChange: (e: React.ChangeEvent<HTMLSelectElement>) => onChange(e.target.value) }
          : { defaultValue: "" })}
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
