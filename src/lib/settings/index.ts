import { prisma } from "@/lib/prisma";
import { readSetting, writeSetting } from "./store";
import type { SettingKey, SettingValue } from "./definitions";

/** Server-side convenience wrappers around the shared database client. */
export function getSetting<K extends SettingKey>(key: K): Promise<SettingValue<K>> {
  return readSetting(prisma, key);
}

export function saveSetting<K extends SettingKey>(key: K, value: SettingValue<K>, actorId: string) {
  return writeSetting(prisma, key, value, actorId);
}

/** Currency used to format every price and salary. */
export const getCurrency = () => getSetting("currency");
