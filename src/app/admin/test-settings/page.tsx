import { prisma } from "@/lib/prisma";
import { TEST_TYPES, TEST_TYPE_LABELS } from "@/lib/questionBank/schema";
import TestSettingsForm from "./TestSettingsForm";

// Which tests are adaptive is part of how the tests work (see the test engine rules), not a setting.
const ADAPTIVE = new Set(["IQ", "LANGUAGE", "SKILL"]);

export default async function TestSettingsPage() {
  const configs = await prisma.testConfig.findMany();

  return (
    <div>
      <h1 className="text-2xl font-semibold text-zinc-900">Test settings</h1>
      <p className="mt-1 text-zinc-600">
        Question counts, time limits, retake waiting time and the adaptive stop rule for each test.
        Changes apply to tests started afterwards.
      </p>
      <div className="mt-6 flex max-w-4xl flex-col gap-5">
        {TEST_TYPES.map((t) => {
          const c = configs.find((x) => x.testType === t);
          return c ? (
            <TestSettingsForm
              key={t}
              testType={t}
              title={TEST_TYPE_LABELS[t]}
              adaptive={ADAPTIVE.has(t)}
              initial={{
                minItems: c.minItems,
                maxItems: c.maxItems,
                seThreshold: c.seThreshold,
                timeLimitMinutes: c.timeLimitMinutes,
                retakeWaitingDays: c.retakeWaitingDays,
                pretestItemCount: c.pretestItemCount,
              }}
            />
          ) : (
            <p key={t} className="card text-sm text-red-700">
              {TEST_TYPE_LABELS[t]} has no settings yet. Run the seed to create them.
            </p>
          );
        })}
      </div>
    </div>
  );
}
