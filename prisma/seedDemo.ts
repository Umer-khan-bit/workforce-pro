import type { PrismaClient, PlanName, Role } from "@prisma/client";
import bcrypt from "bcryptjs";

/**
 * Demo data for clicking through the whole system. Only runs when DEMO_MODE=true
 * (see seed.ts). Safe to re-run: everything is keyed on email / name / plan, and
 * existing rows are left untouched.
 */

const DEMO_EMAIL_DOMAIN = "demo.test";
const DEFAULT_DEMO_PASSWORD = "Demo@12345";
const PRIVACY_POLICY_VERSION = "1.0";
const CANDIDATE_COUNT = 64;

// Prices are placeholders until real pricing is agreed.
const PLANS: Array<{ name: PlanName; priceMonthly: number; features: Record<string, unknown> }> = [
  {
    name: "BASIC",
    priceMonthly: 15000,
    features: {
      recruiterSeats: 3,
      candidateSearch: true,
      shortlistsPerOpening: 25,
      contactRequestsPerMonth: 20,
      atsExport: false,
      webhooks: false,
      apiAccess: false,
    },
  },
  {
    name: "ADVANCED",
    priceMonthly: 40000,
    features: {
      recruiterSeats: 15,
      candidateSearch: true,
      shortlistsPerOpening: null,
      contactRequestsPerMonth: null,
      atsExport: true,
      webhooks: true,
      apiAccess: true,
    },
  },
];

type DemoUser = { name: string; email: string };

const DEMO_COMPANIES: Array<{
  name: string;
  industry: string;
  city: string;
  plan: PlanName;
  admin: DemoUser;
  recruiters: DemoUser[];
}> = [
  {
    name: "Karachi Tech Solutions",
    industry: "Information Technology",
    city: "Karachi",
    plan: "ADVANCED",
    // The one login per role: companyadmin@ and recruiter@ belong to this company.
    admin: { name: "Bilal Ahmed", email: `companyadmin@${DEMO_EMAIL_DOMAIN}` },
    recruiters: [
      { name: "Sana Malik", email: `recruiter@${DEMO_EMAIL_DOMAIN}` },
      { name: "Hamza Qureshi", email: `recruiter.hamza@${DEMO_EMAIL_DOMAIN}` },
    ],
  },
  {
    name: "Lahore Retail Group",
    industry: "Retail",
    city: "Lahore",
    plan: "BASIC",
    admin: { name: "Farah Naz", email: `admin.lahore@${DEMO_EMAIL_DOMAIN}` },
    recruiters: [
      { name: "Usman Ghani", email: `recruiter.usman@${DEMO_EMAIL_DOMAIN}` },
      { name: "Nimra Aslam", email: `recruiter.nimra@${DEMO_EMAIL_DOMAIN}` },
    ],
  },
  {
    name: "Islamabad Business Services",
    industry: "Business Process Outsourcing",
    city: "Islamabad",
    plan: "ADVANCED",
    admin: { name: "Tariq Mehmood", email: `admin.islamabad@${DEMO_EMAIL_DOMAIN}` },
    recruiters: [{ name: "Zainab Hussain", email: `recruiter.zainab@${DEMO_EMAIL_DOMAIN}` }],
  },
];

const MALE_NAMES = [
  "Ali", "Ahmed", "Usman", "Hassan", "Hussain", "Bilal", "Hamza", "Imran", "Kamran", "Faisal",
  "Zeeshan", "Waqas", "Asad", "Junaid", "Saad", "Umar", "Talha", "Fahad", "Shahid", "Adnan",
  "Naveed", "Rizwan", "Danish", "Arslan", "Haris", "Owais", "Sohail", "Yasir", "Zain", "Mubashir",
];

const FEMALE_NAMES = [
  "Ayesha", "Fatima", "Zainab", "Maryam", "Hina", "Sana", "Nimra", "Iqra", "Amna", "Sadia",
  "Rabia", "Mehwish", "Bushra", "Kinza", "Laiba", "Hira", "Anum", "Saima", "Noor", "Mahnoor",
  "Areeba", "Farah", "Sidra", "Komal", "Rida", "Javeria", "Tooba", "Mahira", "Shazia", "Uzma",
];

const SURNAMES = [
  "Khan", "Ahmed", "Malik", "Sheikh", "Qureshi", "Butt", "Chaudhry", "Raza", "Siddiqui", "Ansari",
  "Hashmi", "Mirza", "Baig", "Javed", "Iqbal", "Hussain", "Shah", "Rana", "Awan", "Bhatti",
  "Gill", "Niazi", "Yousaf", "Farooq", "Abbasi", "Memon", "Soomro", "Lashari", "Afridi", "Yousafzai",
  "Durrani", "Kakar", "Baloch", "Rehman", "Nawaz", "Zaidi", "Rizvi", "Cheema", "Dar", "Lodhi",
];

// Weighted roughly by population; each city maps to its province / territory.
const CITIES: Array<{ city: string; region: string; weight: number }> = [
  { city: "Karachi", region: "Sindh", weight: 16 },
  { city: "Lahore", region: "Punjab", weight: 16 },
  { city: "Islamabad", region: "Islamabad Capital Territory", weight: 8 },
  { city: "Rawalpindi", region: "Punjab", weight: 7 },
  { city: "Faisalabad", region: "Punjab", weight: 7 },
  { city: "Multan", region: "Punjab", weight: 5 },
  { city: "Gujranwala", region: "Punjab", weight: 4 },
  { city: "Sialkot", region: "Punjab", weight: 3 },
  { city: "Hyderabad", region: "Sindh", weight: 5 },
  { city: "Sukkur", region: "Sindh", weight: 2 },
  { city: "Peshawar", region: "Khyber Pakhtunkhwa", weight: 6 },
  { city: "Mardan", region: "Khyber Pakhtunkhwa", weight: 2 },
  { city: "Abbottabad", region: "Khyber Pakhtunkhwa", weight: 2 },
  { city: "Quetta", region: "Balochistan", weight: 4 },
  { city: "Gilgit", region: "Gilgit-Baltistan", weight: 1 },
  { city: "Muzaffarabad", region: "Azad Kashmir", weight: 1 },
];

// Typical monthly PKR for a fresher, and the rise per year of experience.
const SALARY_BY_ROLE: Record<string, { base: number; perYear: number }> = {
  Accountant: { base: 50000, perYear: 8000 },
  Sales: { base: 45000, perYear: 9000 },
  "Customer Service": { base: 38000, perYear: 6000 },
  "IT Support": { base: 50000, perYear: 10000 },
};

/** Small deterministic PRNG so every run of the seed produces the same people. */
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Lookup = { id: string; name: string };

type SeedCandidate = {
  name: string;
  email: string;
  phone: string;
  city: string;
  regionName: string;
  jobRoleName: string;
  experienceYears: number;
  minimumSalary: number;
};

function buildCandidates(jobRoleNames: string[]): SeedCandidate[] {
  const rand = mulberry32(2026);
  const pick = <T,>(items: T[]): T => items[Math.floor(rand() * items.length)];
  const totalWeight = CITIES.reduce((sum, c) => sum + c.weight, 0);
  const pickCity = () => {
    let roll = rand() * totalWeight;
    for (const c of CITIES) {
      roll -= c.weight;
      if (roll < 0) return c;
    }
    return CITIES[0];
  };

  const used = new Set<string>();
  const candidates: SeedCandidate[] = [];

  while (candidates.length < CANDIDATE_COUNT) {
    const first = pick(rand() < 0.5 ? MALE_NAMES : FEMALE_NAMES);
    const last = pick(SURNAMES);
    const key = `${first} ${last}`;
    if (used.has(key)) continue;
    used.add(key);

    const { city, region } = pickCity();
    const jobRoleName = pick(jobRoleNames);
    // Skewed towards early-career, like a real applicant pool.
    const experienceYears = Math.min(12, Math.floor(Math.pow(rand(), 1.6) * 13));
    const { base, perYear } = SALARY_BY_ROLE[jobRoleName] ?? { base: 40000, perYear: 7000 };
    const raw = base + experienceYears * perYear * (0.85 + rand() * 0.3);
    const prefix = 300 + Math.floor(rand() * 50); // 0300-0349: Jazz, Zong, Telenor, Ufone
    const line = String(Math.floor(rand() * 10_000_000)).padStart(7, "0");

    candidates.push({
      name: key,
      email: `${first}.${last}@${DEMO_EMAIL_DOMAIN}`.toLowerCase(),
      phone: `0${prefix}${line}`,
      city,
      regionName: region,
      jobRoleName,
      experienceYears,
      minimumSalary: Math.round(raw / 5000) * 5000,
    });
  }

  // The one demo candidate login: fixed email, but otherwise a normal profile.
  candidates[0] = {
    ...candidates[0],
    name: "Ayesha Khan",
    email: `candidate@${DEMO_EMAIL_DOMAIN}`,
    city: "Lahore",
    regionName: "Punjab",
    jobRoleName: "Accountant",
    experienceYears: 4,
    minimumSalary: 80000,
  };

  return candidates;
}

export type DemoSeedSummary = {
  password: string;
  logins: Array<{ role: Role; email: string }>;
  plans: number;
  companies: number;
  recruiters: number;
  candidates: number;
};

export async function seedDemoData(
  prisma: PrismaClient,
  lookups: { jobRoles: Lookup[]; regions: Lookup[] }
): Promise<DemoSeedSummary> {
  const password = process.env.SEED_DEMO_PASSWORD || DEFAULT_DEMO_PASSWORD;
  // Hash once: bcrypt is deliberately slow and every demo account shares the password.
  const hashedPassword = await bcrypt.hash(password, 10);

  const regionId = new Map(lookups.regions.map((r) => [r.name, r.id]));
  const jobRoleId = new Map(lookups.jobRoles.map((r) => [r.name, r.id]));

  // Plans
  const plans = new Map<PlanName, string>();
  for (const plan of PLANS) {
    const row = await prisma.plan.upsert({
      where: { name: plan.name },
      update: {},
      create: {
        name: plan.name,
        priceMonthly: plan.priceMonthly,
        features: plan.features as object,
      },
    });
    plans.set(plan.name, row.id);
  }

  // Companies, company admins, recruiters, subscriptions
  let recruiterCount = 0;
  for (const c of DEMO_COMPANIES) {
    const company =
      (await prisma.company.findFirst({ where: { name: c.name } })) ??
      (await prisma.company.create({
        data: { name: c.name, industry: c.industry, city: c.city },
      }));

    const accounts: Array<{ user: DemoUser; role: Role }> = [
      { user: c.admin, role: "COMPANY_ADMIN" },
      ...c.recruiters.map((user) => ({ user, role: "RECRUITER" as Role })),
    ];
    for (const { user, role } of accounts) {
      await prisma.user.upsert({
        where: { email: user.email },
        update: {},
        create: {
          email: user.email,
          name: user.name,
          password: hashedPassword,
          role,
          companyId: company.id,
        },
      });
    }
    recruiterCount += c.recruiters.length;

    const hasSubscription = await prisma.subscription.findFirst({
      where: { companyId: company.id },
    });
    if (!hasSubscription) {
      const start = new Date();
      const end = new Date(start);
      end.setMonth(end.getMonth() + 1);
      await prisma.subscription.create({
        data: {
          companyId: company.id,
          planId: plans.get(c.plan)!,
          status: "ACTIVE",
          startDate: start,
          endDate: end,
        },
      });
    }
  }

  // Candidates
  const candidates = buildCandidates(lookups.jobRoles.map((r) => r.name));
  for (const c of candidates) {
    await prisma.user.upsert({
      where: { email: c.email },
      update: {},
      create: {
        email: c.email,
        name: c.name,
        password: hashedPassword,
        role: "CANDIDATE",
        candidateProfile: {
          create: {
            phone: c.phone,
            city: c.city,
            regionId: regionId.get(c.regionName),
            jobRoleId: jobRoleId.get(c.jobRoleName),
            experienceYears: c.experienceYears,
            minimumSalary: c.minimumSalary,
            consentGiven: true,
            consentAt: new Date(),
            privacyPolicyVersion: PRIVACY_POLICY_VERSION,
          },
        },
      },
    });
  }

  // One login per role. The demo platform admin is separate from the real one
  // created in seed.ts, so the real admin password never needs to be shared.
  const demoAdmin = `demo.admin@${DEMO_EMAIL_DOMAIN}`;
  await prisma.user.upsert({
    where: { email: demoAdmin },
    update: {},
    create: {
      email: demoAdmin,
      name: "Demo Platform Admin",
      password: hashedPassword,
      role: "PLATFORM_ADMIN",
    },
  });

  return {
    password,
    logins: [
      { role: "CANDIDATE", email: `candidate@${DEMO_EMAIL_DOMAIN}` },
      { role: "RECRUITER", email: `recruiter@${DEMO_EMAIL_DOMAIN}` },
      { role: "COMPANY_ADMIN", email: `companyadmin@${DEMO_EMAIL_DOMAIN}` },
      { role: "PLATFORM_ADMIN", email: demoAdmin },
    ],
    plans: PLANS.length,
    companies: DEMO_COMPANIES.length,
    recruiters: recruiterCount,
    candidates: candidates.length,
  };
}
