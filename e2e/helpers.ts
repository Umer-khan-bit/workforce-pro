import type { Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

export const prisma = new PrismaClient();

export function uniqueEmail(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 100000)}@example.com`;
}

export const DEMO_PASSWORD = process.env.SEED_DEMO_PASSWORD || "Demo@12345";

/**
 * A fresh client IP per spec file. Signups are rate limited per IP, so specs that
 * create accounts send their own x-forwarded-for instead of sharing "unknown".
 */
export function randomIp(): string {
  const octet = () => Math.floor(Math.random() * 254) + 1;
  return `10.${octet()}.${octet()}.${octet()}`;
}

export async function logInAs(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Log in" }).click();
}
