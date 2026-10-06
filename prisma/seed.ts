import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { seedDemoData } from "./seedDemo";
import { seedDemoResults } from "./seedDemoResults";
import { seedDemoCourses } from "./seedDemoCourses";
import { seedDemoHiring } from "./seedDemoHiring";
import { seedDemoIntegrations } from "./seedDemoIntegrations";
import { seedDemoItemStats } from "./seedDemoItemStats";
import { seedDemoStory } from "./seedDemoStory";
import { approveDemoContent } from "./approveDemoContent";
import { generateFairnessReport, monthOf, previousMonth } from "../src/lib/learning/fairness";
import { importIpipItems } from "../src/lib/questionBank/ipipImport";
import { seedConfig } from "./seedConfig";

const prisma = new PrismaClient();

const JOB_ROLES = [
  { name: "Accountant", description: "Accounting and finance roles" },
  { name: "Sales", description: "Sales and business development roles" },
  { name: "Customer Service", description: "Customer support and service roles" },
  { name: "IT Support", description: "IT helpdesk and support roles" },
];

const REGIONS = [
  "Punjab",
  "Sindh",
  "Khyber Pakhtunkhwa",
  "Balochistan",
  "Islamabad Capital Territory",
  "Gilgit-Baltistan",
  "Azad Kashmir",
];

const LANGUAGES = [
  { name: "English", code: "en" },
  { name: "Urdu", code: "ur", isRtl: true },
];

async function main() {
  const jobRoles = await Promise.all(
    JOB_ROLES.map((role) =>
      prisma.jobRole.upsert({
        where: { name: role.name },
        update: {},
        create: role,
      })
    )
  );
  console.log(`Job roles ready: ${jobRoles.map((r) => r.name).join(", ")}`);

  const regions = await Promise.all(
    REGIONS.map((name) =>
      prisma.region.upsert({
        where: { name },
        update: {},
        create: { name },
      })
    )
  );
  console.log(`Regions ready: ${regions.map((r) => r.name).join(", ")}`);

  const languages = await Promise.all(
    LANGUAGES.map((lang) =>
      prisma.language.upsert({
        where: { code: lang.code },
        update: {},
        create: lang,
      })
    )
  );
  console.log(`Languages ready: ${languages.map((l) => l.name).join(", ")}`);

  const english = languages.find((l) => l.code === "en")!;
  const urdu = languages.find((l) => l.code === "ur")!;

  for (const region of regions) {
    await prisma.regionLanguage.upsert({
      where: { regionId_languageId: { regionId: region.id, languageId: english.id } },
      update: {},
      create: { regionId: region.id, languageId: english.id, isPrimary: true },
    });
    await prisma.regionLanguage.upsert({
      where: { regionId_languageId: { regionId: region.id, languageId: urdu.id } },
      update: {},
      create: { regionId: region.id, languageId: urdu.id, isPrimary: false },
    });
  }
  console.log("Region-language mappings ready (English primary, Urdu secondary for all regions)");

  const config = await seedConfig(prisma, regions);
  console.log(
    `Configuration ready: ${config.cities} cities, ${config.plans} plans, ${config.testConfigs} test settings, ` +
      `${config.experienceBands} experience bands, ${config.templates} message templates ` +
      `(${config.settings} new setting groups)`
  );

  const adminEmail = process.env.SEED_ADMIN_EMAIL;
  const adminPassword = process.env.SEED_ADMIN_PASSWORD;

  if (!adminEmail || !adminPassword) {
    console.log(
      "SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD not set - skipping platform admin creation."
    );
  } else {
    const hashedPassword = await bcrypt.hash(adminPassword, 10);
    await prisma.user.upsert({
      where: { email: adminEmail },
      update: {},
      create: {
        email: adminEmail,
        password: hashedPassword,
        role: "PLATFORM_ADMIN",
        name: "Platform Admin",
        emailVerified: new Date(),
      },
    });
    console.log(`Platform admin ready: ${adminEmail}`);
  }

  const seedAdmin = adminEmail ? await prisma.user.findUnique({ where: { email: adminEmail } }) : null;
  const ipip = await importIpipItems(prisma, seedAdmin?.id ?? null);
  console.log(`IPIP Big Five items: ${ipip.created} added, ${ipip.skipped} already present`);

  if (process.env.DEMO_MODE !== "true") {
    console.log("DEMO_MODE is not 'true' - skipping demo data (plans, companies, candidates).");
    return;
  }

  const demo = await seedDemoData(prisma, { jobRoles, regions });
  console.log(
    `Demo data ready: ${demo.plans} plans, ${demo.companies} companies, ` +
      `${demo.recruiters} recruiters, ${demo.candidates} candidates`
  );
  const results = await seedDemoResults(prisma);
  console.log(
    `Demo results: ${results.candidatesSeeded} candidates, ${results.sessions} completed tests, ` +
      `${results.badges} Top Performer badges (ranked results Q1 ${results.quartileCounts[1] ?? 0}, Q2 ${results.quartileCounts[2] ?? 0}, ` +
      `Q3 ${results.quartileCounts[3] ?? 0}, Q4 ${results.quartileCounts[4] ?? 0})`
  );
  const courses = await seedDemoCourses(prisma);
  console.log(`Demo training: ${courses.courses} courses added`);
  const hiring = await seedDemoHiring(prisma);
  console.log(`Demo hiring: ${hiring.openings} job openings, ${hiring.shortlists} shortlisted candidates, ${hiring.requests} contact requests, ${hiring.payments} payments`);
  const integrations = await seedDemoIntegrations(prisma);
  console.log(`Demo ATS: ${integrations.companies} companies set up, ${integrations.pushed} candidates pushed, ${integrations.deliveries} webhook deliveries`);
  const approved = await approveDemoContent(prisma);
  console.log(`Demo questions approved: ${approved}`);
  console.log(`Demo request waiting for the demo candidate: ${(await seedDemoStory(prisma)) ? "added" : "none added"}`);
  console.log(`Demo item analysis: ${await seedDemoItemStats(prisma)} questions`);
  // Fairness reports for last month and this month, so the screen has something to show.
  const now = new Date();
  for (const month of [previousMonth(now), monthOf(now)]) await generateFairnessReport(prisma, { month, notifyAdmins: false });
  console.log("Demo fairness reports ready");
  // Never print the password. Demo accounts share SEED_DEMO_PASSWORD (default in DAY1_STATUS.md).
  console.log("Demo logins (shared demo password, see SEED_DEMO_PASSWORD):");
  for (const login of demo.logins) {
    console.log(`  ${login.role.padEnd(15)} ${login.email}`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
