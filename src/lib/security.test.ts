import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { globSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * The security rules from CLAUDE.md as automatic checks over the source code. When someone adds a route or a log
 * line that breaks a rule, one of these fails and says which file.
 */
const routes = globSync("src/app/api/**/route.ts").map((p) => p.replace(/\\/g, "/"));
const read = (p: string) => readFileSync(p, "utf8");
const methodsOf = (src: string) => [...src.matchAll(/export (?:async )?function (GET|POST|PUT|PATCH|DELETE)\b/g)].map((m) => m[1]);

/** Routes that are public on purpose, and why. */
const PUBLIC: Record<string, string> = {
  "src/app/api/auth/[...nextauth]/route.ts": "Auth.js sign-in handlers",
  "src/app/api/auth/forgot-password/route.ts": "asks for a reset link; rate limited, answers the same for any address",
  "src/app/api/auth/reset-password/route.ts": "protected by a single-use token",
  "src/app/api/auth/verify-email/route.ts": "protected by a single-use token",
  "src/app/api/signup/candidate/route.ts": "creates an account; rate limited",
  "src/app/api/signup/company/route.ts": "creates an account; rate limited",
  "src/app/api/mock-ats/receive/route.ts": "demo receiver that stores nothing and does not exist outside demo mode",
};

const GUARDS = /requireStaff\(|requirePlatformAdmin\(|requireCandidate\(|candidateGuard\(|withApiKey\(|secretMatches\(|await auth\(\)/;

describe("every API route checks who is calling", () => {
  it("finds the routes", () => {
    expect(routes.length).toBeGreaterThan(60);
  });

  it("each route has a role check, an API key check or the cron secret, unless listed as public", () => {
    const open = routes.filter((r) => !GUARDS.test(read(r)) && !(r in PUBLIC));
    expect(open).toEqual([]);
  });

  it("the public list has no stale entries", () => {
    for (const p of Object.keys(PUBLIC)) expect(routes).toContain(p);
  });

  it("admin routes use the platform-admin guard, company and recruiter routes use the staff guard", () => {
    for (const r of routes.filter((x) => x.startsWith("src/app/api/admin/"))) expect(read(r), r).toMatch(/requirePlatformAdmin\(/);
    for (const r of routes.filter((x) => x.startsWith("src/app/api/company/"))) expect(read(r), r).toMatch(/requireStaff\(\["COMPANY_ADMIN"\]\)/);
    for (const r of routes.filter((x) => x.startsWith("src/app/api/v1/"))) expect(read(r), r).toMatch(/withApiKey\(/);
  });
});

describe("every route that takes input validates it", () => {
  it("a route that reads a JSON body parses it with zod", () => {
    const missing = routes.filter((r) => /\.json\(\)/.test(read(r)) && !/safeParse\(|\.parse\(/.test(read(r)) && !/\[\.\.\.nextauth\]/.test(r));
    expect(missing).toEqual([]);
  });
});

describe("admin actions are audited", () => {
  /** These hand the work to a library function that writes the audit entry itself. */
  const AUDITED_IN_LIBRARY = [
    "src/app/api/admin/ai/generate/route.ts",
    "src/app/api/admin/ai/translate-ipip/route.ts",
    "src/app/api/admin/companies/[id]/subscription/route.ts",
    "src/app/api/admin/questions/import-ipip/route.ts",
  ];

  it("every admin route that changes data writes an audit entry (or calls a library that does)", () => {
    const missing = routes.filter((r) => r.startsWith("src/app/api/admin/") && methodsOf(read(r)).some((m) => m !== "GET") && !/audit/i.test(read(r)) && !AUDITED_IN_LIBRARY.includes(r));
    expect(missing).toEqual([]);
  });

  it("the library functions named above really write audit entries", () => {
    expect(read("src/lib/ai/generate.ts")).toContain("auditLog.create");
    expect(read("src/lib/subscriptions.ts")).toContain("auditLog.create");
    expect(read("src/lib/questionBank/ipipImport.ts")).toContain("auditLog.create");
  });
});

describe("sensitive data and secrets", () => {
  const sources = globSync("src/**/*.{ts,tsx}").map((p) => p.replace(/\\/g, "/")).filter((p) => !/\.test\.tsx?$/.test(p));

  it("nothing logs passwords, tokens, secrets, CNIC, salaries or test answers", () => {
    const offenders: string[] = [];
    for (const f of sources) {
      read(f).split("\n").forEach((line, i) => {
        if (/console\.(log|info|warn|error|debug)\(/.test(line) && /\b(password|passwd|token|secret|apiKey|cnic|salary|minimumSalary|answerGiven|correctAnswer)\b/i.test(line)) offenders.push(`${f}:${i + 1}`);
      });
    }
    expect(offenders).toEqual([]);
  });

  it("every rate-limit check is awaited (the limiter is asynchronous: an un-awaited call is always truthy)", () => {
    const offenders: string[] = [];
    for (const f of sources) {
      read(f).split("\n").forEach((line, i) => {
        if (/isRateLimited\(/.test(line) && !/await\s|function |export |import /.test(line)) offenders.push(`${f}:${i + 1}`);
      });
    }
    expect(offenders).toEqual([]);
  });

  it("no real-looking secret is in the source, and .env is not committed", () => {
    for (const f of sources) expect(read(f), f).not.toMatch(/sk-ant-[A-Za-z0-9_-]{10,}|AKIA[0-9A-Z]{16}|-----BEGIN (RSA )?PRIVATE KEY-----/);
    const tracked = execSync("git ls-files", { encoding: "utf8" }).split(/\r?\n/);
    expect(tracked).not.toContain(".env");
    expect(tracked.filter((f) => /^\.env\.(local|production|development)/.test(f))).toEqual([]);
  });

  it(".env.example documents every environment variable the code reads", () => {
    const example = read(".env.example");
    const used = new Set<string>();
    for (const f of sources) for (const m of read(f).matchAll(/process\.env\.([A-Z][A-Z0-9_]+)/g)) used.add(m[1]);
    const framework = new Set(["NODE_ENV", "NEXT_RUNTIME", "CI", "PORT", "NEXT_PHASE"]);
    const undocumented = [...used].filter((v) => !framework.has(v) && !new RegExp(`^#?\\s*${v}=`, "m").test(example));
    expect(undocumented).toEqual([]);
  });

  it("emailed links use APP_BASE_URL, never the request's Host header", () => {
    for (const f of sources) {
      const src = read(f);
      if (/APP_BASE_URL/.test(src)) continue;
      expect(src, f).not.toMatch(/headers\(\)\.get\(["']host["']\)|request\.headers\.get\(["'](x-forwarded-host|host)["']\)/i);
    }
  });
});

describe("browser protections", () => {
  it("the app sends clickjacking, content-type and referrer protections on every page", () => {
    const config = read("next.config.ts");
    for (const h of ["X-Frame-Options", "X-Content-Type-Options", "Referrer-Policy", "Permissions-Policy", "Content-Security-Policy", "Strict-Transport-Security"]) expect(config).toContain(h);
    expect(config).toContain("poweredByHeader: false");
  });

  it("the proxy blocks cross-site changes on API routes", () => {
    expect(read("src/auth.config.ts")).toContain("crossSiteBlocks(");
    expect(existsSync("src/lib/originGuard.ts")).toBe(true);
  });

  it("passwords are hashed with bcrypt", () => {
    expect(read("src/lib/password.ts")).toMatch(/bcrypt/);
  });
});

/**
 * "No hardcoding": business values (brand, currency, cities, regions, job roles, languages, plan names) live in the database and
 * are edited by the platform admin. Starting values are allowed only in the seed and settings-definition files, and in tests.
 */
describe("no business value is written into the code", () => {
  const EXEMPT = /\.test\.tsx?$|\/testkit\.ts$|\/testWorld\.ts$|^src\/lib\/seedData\.ts$|^src\/lib\/settings\/definitions\.ts$|^src\/lib\/messageTemplates\.ts$/;
  const sources = globSync("src/**/*.{ts,tsx}").map((p) => p.replace(/\\/g, "/")).filter((p) => !EXEMPT.test(p));
  /** Source with comments removed (a comment may talk about Lahore; code must not). */
  const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");

  const RULES: Array<{ what: string; pattern: RegExp }> = [
    { what: "a brand name", pattern: /Workforce Pro|Smart Workforce|workforcepro/ },
    { what: "a currency code or locale", pattern: /\b(PKR|USD|EUR|GBP|AED|SAR)\b|\ben-PK\b/ },
    { what: "a city", pattern: /\b(Karachi|Lahore|Islamabad|Rawalpindi|Faisalabad|Multan|Gujranwala|Sialkot|Hyderabad|Sukkur|Peshawar|Mardan|Abbottabad|Quetta|Gilgit|Muzaffarabad)\b/ },
    { what: "a region", pattern: /\b(Punjab|Sindh|Balochistan|Khyber|Azad Kashmir|Gilgit-Baltistan)\b/ },
    { what: "a job role (as a text value)", pattern: /["'`](Accountant|Customer Service|IT Support|Sales)["'`]/ },
    { what: "a language name (as a text value)", pattern: /["'`](English|Urdu)["'`]/ },
    { what: "a plan name (as a text value)", pattern: /["'`](Basic|Advanced)["'`]/ },
  ];

  it("finds the source files", () => {
    expect(sources.length).toBeGreaterThan(200);
  });

  for (const rule of RULES) {
    it(`${rule.what} is not written in src/ (use the database and Settings)`, () => {
      const hits = sources.flatMap((p) => code(p).split("\n").flatMap((line, i) => (rule.pattern.test(line) ? [`${p}:${i + 1}: ${line.trim().slice(0, 100)}`] : [])));
      expect(hits).toEqual([]);
    });
  }
});
