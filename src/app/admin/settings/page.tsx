import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getSetting } from "@/lib/settings";
import { SETTING_GROUPS, isSettingKey } from "@/lib/settings/definitions";
import { isAdaptive } from "@/lib/testEngine/context";
import { timingHint } from "@/lib/testEngine/questionLimit";
import SettingsForm from "./SettingsForm";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = (await searchParams).group;
  const requested = Array.isArray(raw) ? raw[0] : raw;
  const group = SETTING_GROUPS.find((g) => g.key === requested && isSettingKey(requested)) ?? SETTING_GROUPS[0];

  const general = SETTING_GROUPS.filter((g) => !g.advanced);
  const advanced = SETTING_GROUPS.filter((g) => g.advanced);

  const [value, plans] = await Promise.all([
    getSetting(group.key),
    group.fields.some((f) => f.optionsFrom === "plans")
      ? prisma.plan.findMany({ where: { isActive: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] })
      : Promise.resolve([]),
  ]);

  // Under each per-question limit: that test's overall time and question count, so the admin can pick a sensible number.
  const hints: Record<string, string> = {};
  if (group.fields.some((f) => f.testType)) {
    const configs = await prisma.testConfig.findMany();
    for (const f of group.fields) {
      const c = f.testType ? configs.find((x) => x.testType === f.testType) : undefined;
      if (f.testType && c) hints[f.name] = timingHint(f.testType, { ...c, isAdaptive: isAdaptive(f.testType) });
    }
  }

  const pill = (active: boolean) =>
    `rounded-full border px-4 py-2 text-sm font-medium ${
      active ? "border-brand-700 bg-brand-700 text-white" : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50"
    }`;

  return (
    <div>
      <h1 className="text-2xl font-semibold text-zinc-900">Settings</h1>
      <p className="mt-1 text-zinc-600">Platform-wide values. Changes apply immediately.</p>

      <nav aria-label="Settings groups" className="mt-4 flex flex-wrap gap-2">
        {general.map((g) => (
          <Link key={g.key} href={`/admin/settings?group=${g.key}`} aria-current={g.key === group.key ? "page" : undefined} className={pill(g.key === group.key)}>
            {g.title}
          </Link>
        ))}
        <Link href={`/admin/settings?group=${advanced[0].key}`} aria-current={group.advanced ? "page" : undefined} className={pill(Boolean(group.advanced))}>
          Advanced
        </Link>
      </nav>

      {group.advanced && (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <p className="font-medium">Advanced settings</p>
          <p className="mt-0.5">These control how questions are scored, learned from and written by AI. The defaults work well; change them only if you know what they do.</p>
          <nav aria-label="Advanced settings groups" className="mt-3 flex flex-wrap gap-2">
            {advanced.map((g) => (
              <Link key={g.key} href={`/admin/settings?group=${g.key}`} aria-current={g.key === group.key ? "page" : undefined} className={pill(g.key === group.key)}>
                {g.title}
              </Link>
            ))}
          </nav>
        </div>
      )}

      <h2 className="mt-6 text-lg font-semibold text-zinc-900">{group.title}</h2>
      <SettingsForm
        key={group.key}
        group={group}
        initial={value as Record<string, unknown>}
        hints={hints}
        planOptions={plans.map((p) => ({ value: p.code, label: p.name }))}
      />
    </div>
  );
}
