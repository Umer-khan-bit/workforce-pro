import Link from "next/link";
import { prisma } from "@/lib/prisma";
import CrudTable from "@/components/admin/CrudTable";
import { getCurrency } from "@/lib/settings";

const LIMIT = 100;

export default async function SalaryBenchmarksPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  const one = (k: string) => (Array.isArray(raw[k]) ? raw[k]![0] : (raw[k] as string | undefined)) || undefined;
  const roleId = one("jobRoleId");
  const city = one("city");

  const where = { ...(roleId ? { jobRoleId: roleId } : {}), ...(city ? { city } : {}) };
  const [rows, total, roles, cities, bands, currency] = await Promise.all([
    prisma.salaryBenchmark.findMany({
      where,
      orderBy: [{ jobRole: { name: "asc" } }, { city: "asc" }, { experienceBand: { sortOrder: "asc" } }],
      take: LIMIT,
    }),
    prisma.salaryBenchmark.count({ where }),
    prisma.jobRole.findMany({ orderBy: { name: "asc" } }),
    prisma.city.findMany({ orderBy: { name: "asc" } }),
    prisma.experienceBand.findMany({ orderBy: { sortOrder: "asc" } }),
    getCurrency(),
  ]);

  const cityNames = [...new Set(cities.map((c) => c.name))];
  const hasFilter = Boolean(roleId || city);

  return (
    <div>
      <h1 className="text-2xl font-semibold text-zinc-900">Salary benchmarks</h1>
      <p className="mt-1 text-zinc-600">
        Monthly salary ranges ({currency.code}) by job role, city and experience band. The
        candidate salary guide reads these. Sample values in demo mode; replace them with real data.
      </p>

      <form method="get" className="card mt-5 flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="b-role" className="label">Job role</label>
          <select id="b-role" name="jobRoleId" defaultValue={roleId ?? ""} className="input">
            <option value="">All roles</option>
            {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="b-city" className="label">City</label>
          <select id="b-city" name="city" defaultValue={city ?? ""} className="input">
            <option value="">All cities</option>
            {cityNames.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <button type="submit" className="btn-primary">Filter</button>
        {hasFilter && <Link href="/admin/salary-benchmarks" className="btn-secondary">Clear</Link>}
      </form>

      <p className="mt-4 text-sm text-zinc-600" aria-live="polite">
        Showing {rows.length} of {total}{total > LIMIT ? ". Narrow the filters to see the rest." : "."}
      </p>

      <div className="mt-2">
        <CrudTable
          entity="salary-benchmarks"
          addLabel="Add benchmark"
          blank={{ jobRoleId: roleId ?? "", city: city ?? "", experienceBandId: "", minSalary: 0, avgSalary: 0, maxSalary: 0 }}
          columns={[
            { key: "jobRoleId", label: "Job role", type: "select", options: roles.map((r) => ({ value: r.id, label: r.name })), width: "9rem" },
            { key: "city", label: "City", type: "select", options: cityNames.map((c) => ({ value: c, label: c })), width: "8rem" },
            { key: "experienceBandId", label: "Experience", type: "select", options: bands.map((b) => ({ value: b.id, label: b.label })), width: "8rem" },
            { key: "minSalary", label: "Minimum", type: "number", width: "7rem" },
            { key: "avgSalary", label: "Average", type: "number", width: "7rem" },
            { key: "maxSalary", label: "Maximum", type: "number", width: "7rem" },
          ]}
          rows={rows.map((b) => ({
            id: b.id,
            jobRoleId: b.jobRoleId,
            city: b.city,
            experienceBandId: b.experienceBandId,
            minSalary: b.minSalary,
            avgSalary: b.avgSalary,
            maxSalary: b.maxSalary,
          }))}
        />
      </div>
    </div>
  );
}
