# Workforce Pro - Day 1 status

## What you can do now

Start the stack and click through every role:

```bash
docker compose up -d          # Postgres on 55432
npm run prisma:migrate        # only if the DB is fresh
npm run prisma:seed           # reference data + demo data (needs DEMO_MODE="true" in .env)
npm run dev                   # http://localhost:7310
```

### Demo logins

All demo accounts share one password: **`Demo@12345`** (override with `SEED_DEMO_PASSWORD` before seeding).

| Role | Email | Notes |
| --- | --- | --- |
| Candidate | `candidate@demo.test` | Ayesha Khan, Accountant, Lahore, 4 yrs |
| Recruiter | `recruiter@demo.test` | Karachi Tech Solutions (Advanced plan) |
| Company admin | `companyadmin@demo.test` | Karachi Tech Solutions (Advanced plan) |
| Platform admin | `demo.admin@demo.test` | Separate from the real admin - see "Decisions for you" |

Your real platform admin (`SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`) is unchanged and its password is not used anywhere in the demo data.

To see the **Basic** plan, log in as `admin.lahore@demo.test` or `recruiter.usman@demo.test` (Lahore Retail Group).

## What was built

### Rate limiting on both signup endpoints
- `POST /api/signup/candidate` and `POST /api/signup/company` now allow **5 attempts per 15 minutes**, the same numbers as login. The constants live in one place (`AUTH_ATTEMPT_LIMIT` / `AUTH_WINDOW_MS` in `src/lib/rateLimit.ts`) and login now imports them too, so the three can't drift.
- Login is limited per email. Signup has no trustworthy email before validation, so it is limited **per client IP**, per endpoint. Every attempt counts (including invalid ones), and the response is `429` with `Retry-After: 900`. Both signup forms already show the server's `error` text, so users see "Too many signup attempts...".

### Layout and navigation (Prompts 5 + 6)
- One colour scheme (deep teal `brand-*` tokens + zinc neutrals) and one font (system stack), defined in `src/app/globals.css`. Dark mode is deliberately switched off so there is only one look. Shared classes: `btn-primary`, `btn-secondary`, `input`, `label`, `card`, `badge`.
- Each role has its own layout (`src/app/<role>/layout.tsx` -> `RoleLayout` -> `AppShell`): a fixed sidebar on desktop, a slide-in drawer with a top bar on mobile (44px touch targets, closes on tap, no horizontal scroll). Log out, name and email sit at the bottom of the nav.
- Every role's modules are defined once in `src/lib/navigation.ts`. That file drives the sidebar, the dashboard module cards and the placeholder pages, so adding a module is a single edit there. Each role has one `[module]/page.tsx` that renders the placeholder for any slug in that file and 404s for anything else.
- Dashboards show a few real numbers from the DB (candidate profile, company + plan, recruiter count, platform totals) above a grid of links to every module.
- Logged-out pages (home, login, both signups, privacy, change-password, access denied) share a `PublicPage` frame so they match.

Modules per role, matching `CLAUDE.md` (placeholders except where noted):

- **Candidate (9):** Dashboard, Assessments, My results (scores, quartiles, AI feedback, report), Badges, Salary guide, Training, Recruiter requests, Notifications, Profile & privacy
- **Recruiter (8):** Dashboard, Candidate search, Job openings, Shortlists, Contact requests, Reports, ATS export, Notifications
- **Company admin (8):** Dashboard, Recruiters (**real, from Day 0**), Job openings, Subscription & billing, Reports, ATS & webhooks, API keys, Notifications
- **Platform admin (16):** Dashboard; Assessment content: Question bank, Approvals, Item analysis, Recalibration, Test settings; Business: Companies, Plans & subscriptions, Payments, Pilot mode; Platform: Courses, Salary benchmarks, Roles regions & languages, Users, Reports, Audit log

#### CLAUDE.md is the source of truth for modules
CLAUDE.md "User roles" was updated and modules 16-20 were added (job openings, contact requests, notifications, company settings, platform business tools). The navigation was then restored to match. Rules captured there: a contact request is only allowed if the offer meets the candidate's minimum salary; API keys and webhooks are company settings (company admin) while recruiters push candidates to the ATS; Payments is separate from Plans & subscriptions; AI feedback stays inside My results. Recruiters and candidates have no separate "AI feedback" or recruiter "Salary guide" page.

### Demo seed (`prisma/seedDemo.ts`, called from `prisma/seed.ts`)
- Runs only when `DEMO_MODE=true`; otherwise the seed behaves exactly as before.
- **Plans:** Basic (PKR 15,000/mo) and Advanced (PKR 40,000/mo), (Basic = all candidates, Advanced adds exclusive Q1 access). `features` now holds only what CLAUDE.md defines (`allCandidates`, `q1Exclusive`); the earlier invented limits (seats, shortlist caps, etc.) are gone. **The prices are still placeholders.**
- **Companies:** Karachi Tech Solutions (Advanced), Lahore Retail Group (Basic), Islamabad Business Services (Advanced), each with an active subscription, a company admin and 1-2 recruiters (5 recruiters total).
- **Candidates:** 64, with Pakistani names, 16 cities mapped to the right province/territory, mobile numbers in the 0300-0349 range, all four job roles, 0-12 years of experience (skewed towards early career) and a salary expectation scaled to role and experience. Consent and privacy-policy version are filled in.
- Deterministic and idempotent: running the seed again changes nothing (checked - still 64 candidates, 3 companies, 3 subscriptions).

## Tests

- **Vitest: 39 passing** (37 + 2 new proving change-password returns 429 after 5 attempts, per user).
- Test cleanup fixed: the company/recruiter specs used to leave "Test Co" rows behind because deleting the admin failed on the audit-log foreign key. Cleanup now removes audit rows first and runs after every test, pass or fail. Verified: company count stays at 3 after a full run.
- **Playwright: 22 passing** (the new one opens a recruiter session, has the admin deactivate them, and checks their next request goes to login; it fails without the fix): signup 429 on both endpoints; a click-through of **every nav item for all four roles** (asserts the URL, the active-link state and the page heading); dashboard cards; demo company admin sees plan and recruiters; unknown module 404s and cross-role access stays blocked; mobile drawer open/close and no horizontal overflow.
- `tsc --noEmit` clean; `eslint` has 0 errors (3 pre-existing unused-variable warnings in older tests). `next build` succeeds.

## Rules audit (ports, security, privacy): done

Checked everything built so far against "Ports and my laptop" and "Security and privacy".

**Ports, compliant (one doc fix):** dev 7310, Postgres 55432, Studio 7320, Playwright 7330, all set explicitly in `package.json`, `docker-compose.yml`, `playwright.config.ts` and `.env.example`; no other port appears in the code. `README.md` was still the create-next-app default telling you to open port 3000; it now lists the project's ports.

**Security, compliant:** bcrypt hashing; zod on every API body; a role check on every API route (`/api/recruiters*` company-admin only and scoped to the caller's company, `/api/account/change-password` needs a session, signup is public); login and signup rate-limited; consent checkbox with privacy link; audit log for recruiter create/deactivate; `.env` is git-ignored and `.env.example` is current; nothing logs passwords, tokens, CNIC, salaries or answers.

**Fixed:**
1. `prisma/seed.ts` printed the shared demo password to the console. Removed (it is documented above instead).
2. `.env.example` had the wrong model name (`claude-sonnet-5`); now `claude-sonnet-5-5`.
3. Plan `features` no longer contain made-up limits (see above). Dev DB updated to match.

## Session and rate-limit fixes: done
- **Deactivation ends sessions immediately.** Sessions are JWTs, which used to stay valid until they expired. Now every session read checks the user's `isActive` flag in the database and drops the session if it is off, and the route protection (`src/proxy.ts`, which runs on Node) uses that same check. A deactivated recruiter's next click goes to the login page. Cost: one small database lookup per request.
- **Change-password is rate-limited like login:** 5 attempts per 15 minutes, per user, every attempt counts, `429` with `Retry-After: 900`.

## Demo admin guard: done

`demo.admin@demo.test` is created only inside `seedDemoData`, which now throws before touching the database unless `DEMO_MODE` is exactly `"true"`, on top of `seed.ts` already skipping it. Covered by a unit test. The seed does not *remove* the account from a database that already has it; if a database ever leaves demo mode, delete that user by hand.

## Decisions for you

1. CLAUDE.md is the source of truth and the navigation matches it (see above). Nothing is pending on this.
2. **`demo.admin@demo.test` is a second platform admin with a publicly known password.** It only exists when `DEMO_MODE=true` (now enforced in code and tested); don't seed with that flag against any shared or production database.
3. Plan prices are placeholders.

## Known limitations

- **Rate limiting is in-memory**, so it resets on restart and isn't shared between server instances. It also trusts the first `x-forwarded-for` hop, so it needs a proxy that overwrites that header; behind one that appends, a caller could spoof IPs. A shared store (e.g. Redis) fixes both and is a small change in `rateLimit.ts`.
- Because it is in-memory, the e2e suite gives each spec file its own fake IP, and each demo account logs in only a couple of times per run. Re-running Playwright against an **already-running** test server more than a few times in 15 minutes can trip the login limit (5 per email per 15 min); a fresh server or a 15-minute wait clears it.
- The Playwright navigation tests need the demo seed to have been run first, like the existing tests need the reference data.
- Placeholder pages are placeholders: nothing behind them is wired to data yet except the four dashboards' summary numbers and the Recruiters page.
- The leftover "Test Co" companies and every old `@example.com` test user are deleted from the dev DB (3 companies, 0 test users). The e2e specs now clean up after themselves.
- A dev server was already running on port 7310 (not started by me) and was left untouched.

## Suggested next steps

1. Pick the first real module to build. Recommended order: assessment engine (question bank -> test session -> scoring), since recruiter search, shortlists and candidate results all depend on scores.
2. Move the rate limiter to a shared store before any multi-instance deployment.
