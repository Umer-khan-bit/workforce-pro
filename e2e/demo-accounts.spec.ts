import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs";
import type { Role } from "@prisma/client";
import { allNavItems, navHref } from "../src/lib/navigation";
import { DEMO_PASSWORD, logInAs } from "./helpers";

// Every demo account must show real, complete data on every screen: no error pages and no empty-state messages.
// Set DEMO_AUDIT_DIR to also save a screenshot and the visible text of each screen (used when polishing the demo).
test.use({ viewport: { width: 1280, height: 900 } });

const LOGINS: Record<Role, string> = {
  CANDIDATE: "candidate@demo.test",
  RECRUITER: "recruiter@demo.test",
  COMPANY_ADMIN: "companyadmin@demo.test",
  PLATFORM_ADMIN: "demo.admin@demo.test",
};
const EMPTY = /(No [a-z ]{0,40}(yet|found|available)|Nothing (here|to show|has been)|Not available yet|You have no |None yet|No results)/;
const OUT = process.env.DEMO_AUDIT_DIR;

async function visit(page: Page, role: Role, path: string, problems: string[]) {
  const res = await page.goto(path);
  const name = `${role}${path.replace(/[^a-z0-9]+/gi, "_")}`;
  if (!res || res.status() >= 400) problems.push(`${path}: status ${res?.status()}`);
  await expect.soft(page.getByRole("heading", { level: 1 }).first(), `${path} heading`).toBeVisible();
  const text = await page.locator("main").first().innerText().catch(() => "");
  const m = text.match(EMPTY);
  if (m) problems.push(`${path}: empty-state text "${m[0]}"`);
  if (OUT) {
    fs.mkdirSync(OUT, { recursive: true });
    await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
    fs.writeFileSync(`${OUT}/${name}.txt`, text);
  }
}

const EXTRAS: Record<Role, string[]> = {
  CANDIDATE: ["/candidate/tests", "/candidate/results", "/candidate/profile", "/candidate/badges", "/candidate/training", "/candidate/contact-requests"],
  RECRUITER: ["/recruiter/candidates", "/recruiter/ats-export", "/recruiter/shortlists", "/recruiter/reports"],
  COMPANY_ADMIN: ["/company-admin/api-keys", "/company-admin/integrations", "/company-admin/subscription", "/company-admin/reports", "/company-admin/job-openings"],
  PLATFORM_ADMIN: ["/admin/fairness", "/admin/audit-log", "/admin/jobs", "/admin/recalibration", "/admin/item-analysis?view=all"],
};

for (const role of Object.keys(LOGINS) as Role[]) {
  test(`${role} demo account has data on every screen`, async ({ page }) => {
    await logInAs(page, LOGINS[role], DEMO_PASSWORD);
    await expect(page).not.toHaveURL(/\/login/);
    const problems: string[] = [];
    const paths = [...new Set([`/${{ CANDIDATE: "candidate", RECRUITER: "recruiter", COMPANY_ADMIN: "company-admin", PLATFORM_ADMIN: "admin" }[role]}`, ...allNavItems(role).map((i) => navHref(role, i)), ...EXTRAS[role]])];
    for (const p of paths) await visit(page, role, p, problems);
    expect(problems, problems.join("\n")).toEqual([]);
  });
}
