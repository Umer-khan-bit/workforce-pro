import Link from "next/link";
import { getSetting } from "@/lib/settings";
import { SETTING_GROUPS, isSettingKey } from "@/lib/settings/definitions";
import SettingsForm from "./SettingsForm";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = (await searchParams).group;
  const requested = Array.isArray(raw) ? raw[0] : raw;
  const group = SETTING_GROUPS.find((g) => g.key === requested && isSettingKey(requested)) ?? SETTING_GROUPS[0];
  const value = await getSetting(group.key);

  return (
    <div>
      <h1 className="text-2xl font-semibold text-zinc-900">Settings</h1>
      <p className="mt-1 text-zinc-600">Platform-wide values. Changes apply immediately.</p>

      <nav aria-label="Settings groups" className="mt-4 flex flex-wrap gap-2">
        {SETTING_GROUPS.map((g) => (
          <Link
            key={g.key}
            href={`/admin/settings?group=${g.key}`}
            aria-current={g.key === group.key ? "page" : undefined}
            className={`rounded-full border px-4 py-2 text-sm font-medium ${
              g.key === group.key
                ? "border-brand-700 bg-brand-700 text-white"
                : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50"
            }`}
          >
            {g.title}
          </Link>
        ))}
      </nav>

      <h2 className="mt-6 text-lg font-semibold text-zinc-900">{group.title}</h2>
      <SettingsForm key={group.key} group={group} initial={value as Record<string, unknown>} />
    </div>
  );
}
