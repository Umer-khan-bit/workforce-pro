import type { PrismaClient } from "@prisma/client";
import {
  CITY_SEEDS,
  EXPERIENCE_BAND_SEEDS,
  FEATURE_SEEDS,
  PLAN_SEEDS,
  PRIVACY_POLICY_SEED,
  PRIVACY_POLICY_UPDATES,
  TEST_CONFIG_SEEDS,
} from "../src/lib/seedData";
import { TEMPLATE_SEEDS } from "../src/lib/messageTemplates";
import { seedSettings } from "../src/lib/settings/store";

/**
 * Writes the starting values for everything an admin can edit. Every step only creates rows
 * that are missing, so re-running the seed never overwrites changes made in the admin panel.
 */
export async function seedConfig(prisma: PrismaClient, regions: Array<{ id: string; name: string }>) {
  // Default language: English, unless an admin already chose one.
  const hasDefault = await prisma.language.findFirst({ where: { isDefault: true } });
  if (!hasDefault) {
    await prisma.language.updateMany({ where: { code: "en" }, data: { isDefault: true } });
  }

  const regionId = new Map(regions.map((r) => [r.name, r.id]));
  let cities = 0;
  for (const c of CITY_SEEDS) {
    const id = regionId.get(c.region);
    if (!id) continue;
    await prisma.city.upsert({
      where: { regionId_name: { regionId: id, name: c.city } },
      update: {},
      create: { regionId: id, name: c.city },
    });
    cities++;
  }

  for (const f of FEATURE_SEEDS) {
    await prisma.planFeature.upsert({ where: { key: f.key }, update: {}, create: { ...f } });
  }
  for (const p of PLAN_SEEDS) {
    await prisma.plan.upsert({
      where: { code: p.code },
      update: {},
      create: { ...p, features: p.features },
    });
  }
  for (const t of TEST_CONFIG_SEEDS) {
    await prisma.testConfig.upsert({ where: { testType: t.testType }, update: {}, create: { ...t } });
  }
  for (const b of EXPERIENCE_BAND_SEEDS) {
    await prisma.experienceBand.upsert({ where: { label: b.label }, update: {}, create: { ...b } });
  }

  const settings = await seedSettings(prisma);

  const hasPolicy = await prisma.policyDocument.findFirst({ where: { kind: PRIVACY_POLICY_SEED.kind } });
  if (!hasPolicy) {
    await prisma.policyDocument.create({ data: { ...PRIVACY_POLICY_SEED, isCurrent: true } });
  }

  // New privacy policy versions: add a paragraph only when the current text is still the seeded one.
  for (const update of PRIVACY_POLICY_UPDATES) {
    const exists = await prisma.policyDocument.findFirst({ where: { kind: PRIVACY_POLICY_SEED.kind, version: update.version } });
    if (exists) continue;
    const current = await prisma.policyDocument.findFirst({ where: { kind: PRIVACY_POLICY_SEED.kind, isCurrent: true } });
    if (!current || current.version !== update.previousVersion) continue;
    await prisma.$transaction([
      prisma.policyDocument.updateMany({ where: { kind: PRIVACY_POLICY_SEED.kind }, data: { isCurrent: false } }),
      prisma.policyDocument.create({
        data: {
          kind: PRIVACY_POLICY_SEED.kind,
          version: update.version,
          title: current.title,
          body: `${current.body}\n\n${update.paragraph}`,
          isCurrent: true,
        },
      }),
    ]);
  }

  for (const t of TEMPLATE_SEEDS) {
    await prisma.messageTemplate.upsert({
      where: { key: t.key },
      update: {},
      create: { ...t },
    });
  }

  return {
    cities,
    plans: PLAN_SEEDS.length,
    testConfigs: TEST_CONFIG_SEEDS.length,
    experienceBands: EXPERIENCE_BAND_SEEDS.length,
    settings,
    templates: TEMPLATE_SEEDS.length,
  };
}
