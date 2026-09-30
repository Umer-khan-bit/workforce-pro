import type { Prisma, PrismaClient } from "@prisma/client";
import {
  DEFAULT_SETTINGS,
  SETTING_KEYS,
  SETTING_SCHEMAS,
  type SettingKey,
  type SettingValue,
} from "./definitions";

type Db = Pick<PrismaClient, "siteSetting">;

/**
 * Reads one settings group. Stored values are laid over the starting values and re-validated,
 * so a missing row or a field added later never breaks a page.
 */
export async function readSetting<K extends SettingKey>(db: Db, key: K): Promise<SettingValue<K>> {
  const row = await db.siteSetting.findUnique({ where: { key } });
  const stored = row && typeof row.value === "object" && row.value !== null ? row.value : {};
  const parsed = SETTING_SCHEMAS[key].safeParse({ ...DEFAULT_SETTINGS[key], ...stored });
  return (parsed.success ? parsed.data : DEFAULT_SETTINGS[key]) as SettingValue<K>;
}

export async function writeSetting<K extends SettingKey>(
  db: Db,
  key: K,
  value: SettingValue<K>,
  actorId: string | null
) {
  await db.siteSetting.upsert({
    where: { key },
    create: { key, value: value as Prisma.InputJsonValue, updatedById: actorId },
    update: { value: value as Prisma.InputJsonValue, updatedById: actorId },
  });
}

/** Seed helper: writes the starting value for every group that has no row yet. */
export async function seedSettings(db: Db): Promise<number> {
  let created = 0;
  for (const key of SETTING_KEYS) {
    const exists = await db.siteSetting.findUnique({ where: { key } });
    if (exists) continue;
    await db.siteSetting.create({ data: { key, value: DEFAULT_SETTINGS[key] as Prisma.InputJsonValue } });
    created++;
  }
  return created;
}
