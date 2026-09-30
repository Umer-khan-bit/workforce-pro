import type { NavItem } from "@/lib/navigation";

export default function ModulePlaceholder({ item }: { item: NavItem }) {
  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold text-zinc-900">{item.label}</h1>
        <span className="badge bg-amber-100 text-amber-800">Placeholder</span>
      </div>
      <p className="mt-2 text-zinc-600">{item.description}</p>

      <div className="card mt-6">
        <h2 className="text-sm font-semibold text-zinc-900">Coming in a later build</h2>
        <ul className="mt-3 flex flex-col gap-2 text-sm text-zinc-700">
          {item.planned.map((line) => (
            <li key={line} className="flex gap-2">
              <span
                aria-hidden="true"
                className="mt-2 size-1.5 shrink-0 rounded-full bg-brand-500"
              />
              <span>{line}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
