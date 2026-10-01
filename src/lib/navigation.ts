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

const notifications: NavItem = {
  slug: "notifications",
  label: "Notifications",
  description: "In-app and email alerts.",
  planned: [],
  live: true,
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
            slug: "tests",
            label: "My tests",
            description: "Take your Personality, IQ, EQ, Language and job-skill tests and see your result.",
            planned: [],
            live: true,
          },
          {
            slug: "results",
            label: "My results",
            description: "Scores, quartiles, AI feedback and your report.",
            planned: [],
            live: true,
          },
          {
            slug: "badges",
            label: "Badges",
            description: "Recognition for top performance.",
            planned: [],
            live: true,
          },
          { ...salaryGuide, planned: [], live: true },
          {
            slug: "training",
            label: "Training",
            description: "Free and paid courses for your job role.",
            planned: [],
            live: true,
          },
          {
            slug: "contact-requests",
            label: "Recruiter requests",
            description: "Accept or decline contact from recruiters.",
            planned: [],
            live: true,
          },
          { ...notifications, planned: [], live: true },
          {
            slug: "profile",
            label: "Profile & privacy",
            description: "Your details, your email and consent, and deleting your account.",
            planned: [],
            live: true,
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
            planned: [],
            live: true,
          },
          {
            slug: "job-openings",
            label: "Job openings",
            description: "Roles you are hiring for.",
            planned: [],
            live: true,
          },
          {
            slug: "shortlists",
            label: "Shortlists",
            description: "Candidates you have shortlisted.",
            planned: [],
            live: true,
          },
          {
            slug: "contact-requests",
            label: "Contact requests",
            description: "Reach out to candidates and track replies.",
            planned: [],
            live: true,
          },
          {
            slug: "reports",
            label: "Reports",
            description: "Recruiter metrics.",
            planned: [],
            live: true,
          },
          {
            slug: "ats-export",
            label: "ATS export",
            description: "Send candidates to your applicant tracking system.",
            planned: [
              "Push shortlisted candidates to the built-in mock ATS (demo mode)",
              "CSV / Excel export",
              "Uses the company's ATS, webhook and API-key settings",
            ],
          },
          notifications,
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
            slug: "job-openings",
            label: "Job openings",
            description: "All openings across your company.",
            planned: [],
            live: true,
          },
          {
            slug: "subscription",
            label: "Subscription & billing",
            description: "Your plan, your free trial, and the plans you can upgrade to.",
            planned: [],
            live: true,
          },
          {
            slug: "reports",
            label: "Reports",
            description: "Company hiring reports.",
            planned: [],
            live: true,
          },
          {
            slug: "integrations",
            label: "ATS & webhooks",
            description: "Company ATS connection and event webhooks.",
            planned: [
              "ATS connection settings (mock ATS in demo mode)",
              "Webhook endpoints, signing secrets and delivery log",
            ],
          },
          {
            slug: "api-keys",
            label: "API keys",
            description: "Programmatic access for your systems.",
            planned: [
              "Create labelled API keys (shown once, stored hashed)",
              "See last-used time and revoke a key",
            ],
          },
          notifications,
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
            description: "Add, edit, retire, import and AI-generate test questions.",
            planned: [],
            live: true,
          },
          {
            slug: "approvals",
            label: "Approvals",
            description: "Review, approve, edit or reject pending questions.",
            planned: [],
            live: true,
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
            description: "Question counts, time limits, retake days and stop rules per test.",
            planned: [],
            live: true,
          },
        ],
      },
      {
        label: "Business",
        items: [
          {
            slug: "companies",
            label: "Companies",
            description: "Every company on the platform.",
            planned: [],
            live: true,
          },
          {
            slug: "plans",
            label: "Plans & subscriptions",
            description: "Create plans, set prices and choose what each plan includes.",
            planned: [],
            live: true,
          },
          {
            slug: "payments",
            label: "Payments",
            description: "Subscription and course payments.",
            planned: [],
            live: true,
          },
          {
            slug: "pilot-mode",
            label: "Pilot mode",
            description: "Restrict the platform to one company or team.",
            planned: [],
            live: true,
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
            planned: [],
            live: true,
          },
          {
            slug: "salary-benchmarks",
            label: "Salary benchmarks",
            description: "Data behind the salary guide.",
            planned: [],
            live: true,
          },
          {
            slug: "reference-data",
            label: "Roles, regions & languages",
            description: "Job roles, regions, cities, languages, the region-to-language map and experience bands.",
            planned: [],
            live: true,
          },
          {
            slug: "users",
            label: "Users",
            description: "All accounts across the four roles.",
            planned: [],
            live: true,
          },
          {
            slug: "reports",
            label: "Reports",
            description: "Platform metrics and fairness.",
            planned: [],
            live: true,
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
      {
        label: "Settings",
        items: [
          {
            slug: "settings",
            label: "Settings",
            description: "Branding, homepage, currency, quartile and top-performer rules, question defaults and targets.",
            planned: [],
            live: true,
          },
          {
            slug: "privacy-policy",
            label: "Privacy policy",
            description: "Publish new versions of the privacy policy.",
            planned: [],
            live: true,
          },
          {
            slug: "message-templates",
            label: "Message templates",
            description: "Wording of emails and in-app alerts.",
            planned: [],
            live: true,
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
