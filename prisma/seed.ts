import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { seedDemoData } from "./seedDemo";

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
  { name: "Urdu", code: "ur" },
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
      },
    });
    console.log(`Platform admin ready: ${adminEmail}`);
  }

  if (process.env.DEMO_MODE !== "true") {
    console.log("DEMO_MODE is not 'true' - skipping demo data (plans, companies, candidates).");
    return;
  }

  const demo = await seedDemoData(prisma, { jobRoles, regions });
  console.log(
    `Demo data ready: ${demo.plans} plans, ${demo.companies} companies, ` +
      `${demo.recruiters} recruiters, ${demo.candidates} candidates`
  );
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
