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

const notifications: NavItem = {
  slug: "notifications",
  label: "Notifications",
  description: "Email and in-app alerts.",
  planned: [
    "In-app notification centre with read/unread state",
    "Email delivery for the same alerts",
    "Reminders and subscription-expiry warnings",
  ],
};

const salaryGuide: NavItem = {
  slug: "salary-guide",
  label: "Salary guide",
  description: "Salary benchmarks by job role, city and experience.",
  planned: [
    "Min / average / max salary per job role, city and experience band",
    "Compare a salary expectation against the market",
    "Benchmarks run on demo data until real sources are connected",
  ],
};

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
            description: "Personality, EQ, IQ, language and skill tests.",
            planned: [
              "Adaptive personality, EQ, IQ, language and job-skill tests",
              "Timed sessions that can be resumed if interrupted",
              "Retake waiting period between attempts",
              "Writing assessment with CEFR level grading",
            ],
          },
          {
            slug: "results",
            label: "My results",
            description: "Scores, percentile and quartile ranking.",
            planned: [
              "Score, percentile and quartile for every completed test",
              "CEFR level for language tests",
              "History across retakes",
            ],
          },
          {
            slug: "feedback",
            label: "AI feedback",
            description: "Personalised feedback and improvement tips.",
            planned: [
              "AI-written feedback for each completed test",
              "Concrete improvement tips",
              "Training recommendations based on weak areas",
            ],
          },
          {
            slug: "badges",
            label: "Badges",
            description: "Recognition for top performance.",
            planned: [
              "Top Performer badge for ranking in the top quartile on every test",
              "Badge notifications",
              "Badge shown on your recruiter-facing profile",
            ],
          },
          salaryGuide,
          {
            slug: "training",
            label: "Training",
            description: "Free and paid courses for your job role.",
            planned: [
              "Course catalogue filtered by job role",
              "Enrol, track lesson progress and resume where you left off",
              "Free courses and paid courses (demo payments)",
            ],
          },
          {
            slug: "contact-requests",
            label: "Recruiter requests",
            description: "Accept or decline contact from recruiters.",
            planned: [
              "See which recruiters and job openings want to contact you",
              "Accept or decline each request",
              "Your contact details stay hidden until you accept",
            ],
          },
          notifications,
          {
            slug: "profile",
            label: "Profile & privacy",
            description: "Your details, consent and data controls.",
            planned: [
              "Edit contact details, city, job role and salary expectation",
              "View the privacy policy version you accepted",
              "Export or delete your data",
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
            description: "Search and rank assessed candidates.",
            planned: [
              "Filter by job role, region, city, experience and salary expectation",
              "Rank by test scores and quartile",
              "Open a candidate profile with result breakdown (never raw answers)",
            ],
          },
          {
            slug: "shortlists",
            label: "Shortlists",
            description: "Move candidates through your hiring pipeline.",
            planned: [
              "Shortlist candidates against a job opening",
              "Pipeline stages: shortlisted, contacted, interviewing, offered, hired, rejected",
              "Notes and a full status history per candidate",
            ],
          },
          {
            slug: "job-openings",
            label: "Job openings",
            description: "Roles your company is hiring for.",
            planned: [
              "Create and manage openings with job role, city and salary range",
              "Open, pause, fill or close an opening",
              "See matching candidates for each opening",
            ],
          },
          {
            slug: "contact-requests",
            label: "Contact requests",
            description: "Reach out to candidates and track replies.",
            planned: [
              "Send a contact request tied to a job opening",
              "Track sent, accepted and declined",
              "Candidate contact details unlock on acceptance",
            ],
          },
          salaryGuide,
          {
            slug: "ats-export",
            label: "ATS export",
            description: "Push candidates to your applicant tracking system.",
            planned: [
              "Export a candidate profile and scores to your ATS",
              "Track export status and external IDs",
              "Runs in simulated mode until a real ATS is connected",
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
            planned: [
              "Company-wide view of openings and their status",
              "Reassign or close openings created by any recruiter",
            ],
          },
          {
            slug: "subscription",
            label: "Subscription & billing",
            description: "Your plan, renewal and payment history.",
            planned: [
              "Current plan (Basic or Advanced) and what it includes",
              "Upgrade, downgrade, cancel and auto-renew",
              "Payment history (demo payments)",
            ],
          },
          {
            slug: "reports",
            label: "Reports",
            description: "Hiring funnel and recruiter activity.",
            planned: [
              "Shortlist-to-hire funnel by job opening",
              "Activity per recruiter",
              "Export reports",
            ],
          },
          {
            slug: "integrations",
            label: "ATS & webhooks",
            description: "Connect your ATS and receive event webhooks.",
            planned: [
              "ATS export settings and history",
              "Webhook endpoints, signing secrets and delivery log",
              "Retry failed deliveries",
            ],
          },
          {
            slug: "api-keys",
            label: "API keys",
            description: "Programmatic access for your systems.",
            planned: [
              "Create labelled API keys (shown once, stored hashed)",
              "See last-used time",
              "Revoke a key",
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
            description: "Author and manage test questions.",
            planned: [
              "Create Likert, MCQ, situational-judgement and writing questions",
              "Tag by test type, job role, region and language",
              "Reverse-keyed items and IRT parameters",
            ],
          },
          {
            slug: "approvals",
            label: "Approvals",
            description: "Review questions before they go live.",
            planned: [
              "Queue of questions pending approval",
              "Approve or reject with a reason",
              "Retire questions that should no longer be served",
            ],
          },
          {
            slug: "item-analysis",
            label: "Item analysis",
            description: "Question quality from real responses.",
            planned: [
              "Difficulty and discrimination per question",
              "Bias (DIF) checks by gender, region and language",
              "Flagged items for review",
            ],
          },
          {
            slug: "recalibration",
            label: "Recalibration",
            description: "Self-learning updates to question parameters.",
            planned: [
              "Run and monitor recalibration jobs",
              "History of items updated per run",
              "Promote pretest items into live scoring",
            ],
          },
          {
            slug: "test-settings",
            label: "Test settings",
            description: "Length, time limit and retake rules per test.",
            planned: [
              "Min/max items and standard-error stopping threshold",
              "Time limit and retake waiting days",
              "Pretest items per session",
            ],
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
            planned: [
              "Company list with plan, recruiters and status",
              "Drill into a company's users and activity",
              "Suspend or reinstate a company",
            ],
          },
          {
            slug: "plans",
            label: "Plans & subscriptions",
            description: "Basic and Advanced plans and who is on them.",
            planned: [
              "Edit plan features and monthly price",
              "All subscriptions with status and renewal date",
              "Manually extend or cancel a subscription",
            ],
          },
          {
            slug: "payments",
            label: "Payments",
            description: "Subscription and course payments.",
            planned: [
              "Payment ledger with status and provider reference",
              "Refunds",
              "Demo-mode payments only until a real gateway is connected",
            ],
          },
          {
            slug: "pilot-mode",
            label: "Pilot mode",
            description: "Run a company as a pilot.",
            planned: [
              "Turn pilot mode on globally or per company",
              "Pilot-specific limits and reporting",
            ],
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
            planned: [
              "Create courses and ordered lessons",
              "Mark free or paid and set price",
              "Link courses to job roles",
            ],
          },
          {
            slug: "salary-benchmarks",
            label: "Salary benchmarks",
            description: "Data behind the salary guide.",
            planned: [
              "Edit benchmarks per job role, city and experience band",
              "Bulk import",
            ],
          },
          {
            slug: "reference-data",
            label: "Reference data",
            description: "Job roles, regions and languages.",
            planned: [
              "Add or deactivate job roles",
              "Regions and their primary and secondary languages",
            ],
          },
          {
            slug: "users",
            label: "Users",
            description: "All accounts across the four roles.",
            planned: [
              "Search users by role, company or email",
              "Deactivate or reactivate accounts",
              "Reset a password",
            ],
          },
          {
            slug: "reports",
            label: "Reports",
            description: "Platform-wide analytics.",
            planned: [
              "Signups, test completions and score distributions",
              "Subscription and revenue summary (demo)",
            ],
          },
          {
            slug: "audit-log",
            label: "Audit log",
            description: "Who did what, and when.",
            planned: [
              "Searchable log of sensitive actions",
              "Filter by actor, target and date",
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
