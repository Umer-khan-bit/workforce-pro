import type { Role } from "@prisma/client";
import { ROLE_HOME_PATH } from "@/lib/authz";

export type NavItem = {
  /** URL segment under the role's base path; "" is the dashboard. */
  slug: string;
  label: string;
  description: string;
  /** What the finished module will cover. Shown on placeholder pages. */
  planned: string[];
  /** True once the module has a real page of its own instead of a placeholder. */
  live?: boolean;
};

export type NavGroup = { label?: string; items: NavItem[] };

export type RoleNav = { base: string; roleLabel: string; groups: NavGroup[] };

const dashboard = (description: string): NavItem => ({
  slug: "",
  label: "Dashboard",
  description,
  planned: [],
  live: true,
});

const salaryGuide: NavItem = {
  slug: "salary-guide",
  label: "Salary guide",
  description: "Salary range from your scores, experience, role and city.",
  planned: [
    "Salary range based on your scores, experience, job role and city",
    "Runs on seeded sample benchmarks in demo mode",
  ],
};

// Every module below must appear in CLAUDE.md ("Modules" and "User roles").
// Add or rename modules only after checking that file.
export const ROLE_NAV: Record<Role, RoleNav> = {
  CANDIDATE: {
    base: ROLE_HOME_PATH.CANDIDATE,
    roleLabel: "Candidate",
    groups: [
      {
        items: [
          dashboard("Your profile, progress and next steps."),
          {
            slug: "assessments",
            label: "Assessments",
            description: "Personality, IQ & EQ, language and job-skill tests.",
            planned: [
              "Personality (Big Five) and EQ tests",
              "Adaptive IQ, language and job-skill tests",
              "Language test by region, with a short writing task graded on the CEFR scale (A1-C2)",
              "Short timed sessions that save progress so you can resume",
            ],
          },
          {
            slug: "results",
            label: "My results",
            description: "Scores, quartiles, AI feedback and your report.",
            planned: [
              "Score, percentile and quartile for each test (Q1 = top 25%)",
              "AI feedback and improvement tips",
              "Downloadable report",
            ],
          },
          {
            slug: "badges",
            label: "Badges",
            description: "Recognition for top performance.",
            planned: [
              "Top Performer badge for Q1 in all four tests",
              "Recognition email when you earn it",
            ],
          },
          salaryGuide,
          {
            slug: "training",
            label: "Training",
            description: "Free and paid courses for your job role.",
            planned: [
              "Free and paid courses (demo payments)",
              "Progress tracking",
              "AI course recommendations from your results",
              "Retake a test after finishing training",
            ],
          },
          {
            slug: "profile",
            label: "Profile & privacy",
            description: "Your details and consent.",
            planned: [
              "Edit city, region, experience, job role and minimum salary",
              "View the privacy policy you accepted",
            ],
          },
        ],
      },
    ],
  },

  RECRUITER: {
    base: ROLE_HOME_PATH.RECRUITER,
    roleLabel: "Recruiter",
    groups: [
      {
        items: [
          dashboard("Your hiring activity at a glance."),
          {
            slug: "candidates",
            label: "Candidate search",
            description: "Search, filter and rank assessed candidates.",
            planned: [
              "Sort and filter by job role, city, experience, salary and quartile per test",
              '"Q1 in all tests" filter (exclusive to the Advanced plan)',
              "Plain-language AI search",
              "Only candidates whose minimum salary fits your offer",
              "Candidate detail report (every profile view is audit-logged)",
            ],
          },
          {
            slug: "shortlists",
            label: "Shortlists",
            description: "Candidates you have shortlisted.",
            planned: [
              "Add and remove candidates from your shortlist",
              "Open a shortlisted candidate's detail report",
            ],
          },
          {
            slug: "reports",
            label: "Reports",
            description: "Recruiter metrics.",
            planned: ["Recruiter dashboard metrics", "Shortlist activity over time"],
          },
          {
            slug: "ats-export",
            label: "ATS export",
            description: "Send candidates to your applicant tracking system.",
            planned: [
              "Push shortlisted candidates to the built-in mock ATS (demo mode)",
              "CSV / Excel export",
              "REST API and webhooks",
            ],
          },
        ],
      },
    ],
  },

  COMPANY_ADMIN: {
    base: ROLE_HOME_PATH.COMPANY_ADMIN,
    roleLabel: "Company admin",
    groups: [
      {
        items: [
          dashboard("Your company, plan and team."),
          {
            slug: "recruiters",
            label: "Recruiters",
            description: "Add, list and deactivate your recruiters.",
            planned: [],
            live: true,
          },
          {
            slug: "subscription",
            label: "Subscription & billing",
            description: "Your plan and payments.",
            planned: [
              "Current plan: Basic (all candidates) or Advanced (adds exclusive access to Q1 scorers)",
              "Subscribe or upgrade through the demo checkout (simulated payment)",
            ],
          },
        ],
      },
    ],
  },

  PLATFORM_ADMIN: {
    base: ROLE_HOME_PATH.PLATFORM_ADMIN,
    roleLabel: "Platform admin",
    groups: [
      { items: [dashboard("Platform health and activity.")] },
      {
        label: "Assessment content",
        items: [
          {
            slug: "question-bank",
            label: "Question bank",
            description: "Author and generate test questions.",
            planned: [
              "AI-generated questions",
              "Likert, MCQ, situational-judgement and writing items, with reverse-keyed items",
              "Tag by test, job role, region and language",
            ],
          },
          {
            slug: "approvals",
            label: "Approvals",
            description: "Approve questions before they go live.",
            planned: [
              "Queue of questions pending approval",
              "Approve or reject before a question can be served",
            ],
          },
          {
            slug: "item-analysis",
            label: "Item analysis",
            description: "Flagged questions for review.",
            planned: [
              "Items flagged as too easy/hard, low discrimination or biased (DIF by gender, region, language)",
              "Admin review - flagged items are never deleted automatically",
            ],
          },
          {
            slug: "recalibration",
            label: "Recalibration",
            description: "Self-learning updates to question parameters.",
            planned: [
              "Scheduled job plus a manual run button",
              "Re-estimates items with at least 200 responses",
              "Pretest items for calibration",
            ],
          },
          {
            slug: "test-settings",
            label: "Test settings",
            description: "Length and time limit per test.",
            planned: [
              "Stop rules: SE below 0.35 or 20 items (minimum 10)",
              "Time limit per test",
            ],
          },
        ],
      },
      {
        label: "Business",
        items: [
          {
            slug: "plans",
            label: "Plans & subscriptions",
            description: "Basic and Advanced plans and who is on them.",
            planned: [
              "Edit plan features and price",
              "All company subscriptions and their status",
            ],
          },
          {
            slug: "pilot-mode",
            label: "Pilot mode",
            description: "Restrict the platform to one company or team.",
            planned: ["Turn pilot mode on or off", "Choose the company or team allowed in"],
          },
        ],
      },
      {
        label: "Platform",
        items: [
          {
            slug: "courses",
            label: "Courses",
            description: "Training catalogue management.",
            planned: ["Create free and paid courses", "Link courses to job roles"],
          },
          {
            slug: "salary-benchmarks",
            label: "Salary benchmarks",
            description: "Data behind the salary guide.",
            planned: [
              "Sample benchmarks by job role, city and experience (demo data, replaceable)",
            ],
          },
          {
            slug: "reference-data",
            label: "Roles, regions & languages",
            description: "Job roles, regions and the region-to-language map.",
            planned: [
              "Add or edit job roles",
              "Regions and which language each region's language test uses",
            ],
          },
          {
            slug: "reports",
            label: "Reports",
            description: "Platform metrics and fairness.",
            planned: ["Platform metrics", "Monthly fairness report"],
          },
          {
            slug: "audit-log",
            label: "Audit log",
            description: "Admin actions and recruiter profile views.",
            planned: [
              "Searchable log of admin actions",
              "Every recruiter view of a candidate profile",
            ],
          },
        ],
      },
    ],
  },
};

export function navHref(role: Role, item: NavItem): string {
  const base = ROLE_NAV[role].base;
  return item.slug ? `${base}/${item.slug}` : base;
}

export function allNavItems(role: Role): NavItem[] {
  return ROLE_NAV[role].groups.flatMap((g) => g.items);
}

export function findModule(role: Role, slug: string): NavItem | undefined {
  return allNavItems(role).find((i) => i.slug === slug && i.slug !== "");
}
