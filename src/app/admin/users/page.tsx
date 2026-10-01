import Link from "next/link";
import type { Prisma, Role } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import UserActions from "./UserActions";

const PAGE_SIZE = 25;
const ROLES: { value: Role; label: string }[] = [
  { value: "CANDIDATE", label: "Candidate" },
  { value: "RECRUITER", label: "Recruiter" },
  { value: "COMPANY_ADMIN", label: "Company admin" },
  { value: "PLATFORM_ADMIN", label: "Platform admin" },
];
const fmt = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

/** Every user on the platform: find them, switch them on or off, or require a new password. */
export default async function UsersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const raw = await searchParams;
  const one = (k: string) => (Array.isArray(raw[k]) ? raw[k]![0] : (raw[k] as string | undefined)) || undefined;
  const role = ROLES.find((r) => r.value === one("role"))?.value;
  const status = one("status") === "active" || one("status") === "inactive" ? one("status") : undefined;
  const q = one("q")?.trim().slice(0, 100);
  const page = Math.max(1, Number.parseInt(one("page") ?? "1", 10) || 1);
  const session = await auth();

  const where: Prisma.UserWhereInput = {
    ...(role ? { role } : {}),
    ...(status ? { isActive: status === "active" } : {}),
    ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }, { company: { name: { contains: q, mode: "insensitive" } } }] } : {}),
  };
  const [total, users] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "asc" }], skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE, include: { company: { select: { id: true, name: true } }, candidateProfile: { select: { anonymisedAt: true } } } }),
  ]);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const href = (p: number) => {
    const params = new URLSearchParams();
    if (role) params.set("role", role);
    if (status) params.set("status", status);
    if (q) params.set("q", q);
    if (p > 1) params.set("page", String(p));
    const s = params.toString();
    return s ? `/admin/users?${s}` : "/admin/users";
  };

  return (
    <div>
      <h1 className="text-2xl font-semibold text-zinc-900">Users</h1>
      <p className="mt-1 text-zinc-600">Everyone with an account. A deactivated user is signed out at their next click.</p>

      <form method="get" className="card mt-5 flex flex-wrap items-end gap-3" aria-label="Filters">
        <div>
          <label htmlFor="u-role" className="label">Role</label>
          <select id="u-role" name="role" className="input" defaultValue={role ?? ""}>
            <option value="">Any role</option>
            {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="u-status" className="label">Status</label>
          <select id="u-status" name="status" className="input" defaultValue={status ?? ""}>
            <option value="">Any status</option>
            <option value="active">Active</option>
            <option value="inactive">Deactivated</option>
          </select>
        </div>
        <div className="min-w-48 flex-1">
          <label htmlFor="u-q" className="label">Search</label>
          <input id="u-q" name="q" className="input" defaultValue={q ?? ""} placeholder="Name, email or company" />
        </div>
        <button type="submit" className="btn-primary">Filter</button>
        {(role || status || q) && <Link href="/admin/users" className="btn-secondary">Clear</Link>}
      </form>

      <p className="mt-4 text-sm text-zinc-600" aria-live="polite" data-testid="user-count">{total} user{total === 1 ? "" : "s"}</p>
      <div className="mt-2 overflow-x-auto rounded-xl border border-zinc-200 bg-white">
        <table className="w-full min-w-[52rem] text-left text-sm" data-testid="users-table">
          <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
            <tr><th className="px-3 py-3">User</th><th className="px-3 py-3">Role</th><th className="px-3 py-3">Company</th><th className="px-3 py-3">Status</th><th className="px-3 py-3">Joined</th><th className="px-3 py-3">Actions</th></tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {users.length === 0 && <tr><td colSpan={6} className="px-3 py-6 text-zinc-600">No users match.</td></tr>}
            {users.map((u) => (
              <tr key={u.id} data-testid="user-row">
                <td className="px-3 py-3"><p className="font-medium text-zinc-900">{u.name ?? "-"}</p><p className="text-xs text-zinc-500">{u.candidateProfile?.anonymisedAt ? "(email erased)" : u.email}</p></td>
                <td className="px-3 py-3">{ROLES.find((r) => r.value === u.role)?.label}</td>
                <td className="px-3 py-3">{u.company ? <Link href={`/admin/companies/${u.company.id}`} className="text-brand-700 underline">{u.company.name}</Link> : "-"}</td>
                <td className="px-3 py-3">
                  {u.isActive ? <span className="badge bg-green-50 text-green-800">Active</span> : <span className="badge bg-zinc-100 text-zinc-700">Deactivated</span>}
                  {u.mustChangePassword && <span className="badge ml-1 bg-amber-50 text-amber-800">New password required</span>}
                  {!u.emailVerified && u.role !== "PLATFORM_ADMIN" && <p className="mt-1 text-xs text-zinc-500">Email not confirmed</p>}
                </td>
                <td className="px-3 py-3">{fmt(u.createdAt)}</td>
                <td className="px-3 py-3"><UserActions id={u.id} isActive={u.isActive} mustChangePassword={u.mustChangePassword} isSelf={u.id === session!.user.id} deleted={Boolean(u.candidateProfile?.anonymisedAt)} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {pages > 1 && (
        <nav aria-label="Pagination" className="mt-4 flex items-center justify-between text-sm">
          {page > 1 ? <Link href={href(page - 1)} className="btn-secondary">Previous</Link> : <span />}
          <span className="text-zinc-600">Page {page} of {pages}</span>
          {page < pages ? <Link href={href(page + 1)} className="btn-secondary">Next</Link> : <span />}
        </nav>
      )}
    </div>
  );
}
