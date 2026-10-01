import Link from "next/link";
import type { Role } from "@prisma/client";
import { allNavItems, navHref } from "@/lib/navigation";

/** Dashboard link cards for every module in the role's navigation. */
export default function ModuleGrid({ role }: { role: Role }) {
  const items = allNavItems(role).filter((i) => i.slug !== "");

  return (
    <section aria-labelledby="modules-heading" className="mt-8">
      <h2
        id="modules-heading"
        className="text-sm font-semibold uppercase tracking-wide text-zinc-500"
      >
        Modules
      </h2>
      <ul className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {items.map((item) => (
          <li key={item.slug}>
            <Link
              href={navHref(role, item)}
              className="card flex h-full flex-col transition-colors hover:border-brand-400 hover:bg-brand-50"
            >
              <span className="flex items-center justify-between gap-2">
                <span className="font-medium text-zinc-900">{item.label}</span>
                {!item.live && (
                  <span className="badge bg-amber-100 text-amber-800">Placeholder</span>
                )}
              </span>
              <span className="mt-1 text-sm text-zinc-600">{item.description}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
