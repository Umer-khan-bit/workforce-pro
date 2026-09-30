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

Modules per role (placeholders except where noted):

- **Candidate (10):** Dashboard, Assessments, My results, AI feedback, Badges, Salary guide, Training, Recruiter requests, Notifications, Profile & privacy
- **Recruiter (8):** Dashboard, Candidate search, Shortlists, Job openings, Contact requests, Salary guide, ATS export, Notifications
- **Company admin (8):** Dashboard, Recruiters (**real, from Day 0**), Job openings, Subscription & billing, Reports, ATS & webhooks, API keys, Notifications
- **Platform admin (16):** Dashboard; Assessment content: Question bank, Approvals, Item analysis, Recalibration, Test settings; Business: Companies, Plans & subscriptions, Payments, Pilot mode; Platform: Courses, Salary benchmarks, Reference data, Users, Reports, Audit log

### Demo seed (`prisma/seedDemo.ts`, called from `prisma/seed.ts`)
- Runs only when `DEMO_MODE=true`; otherwise the seed behaves exactly as before.
- **Plans:** Basic (PKR 15,000/mo) and Advanced (PKR 40,000/mo), with a `features` JSON. **These prices and feature limits are placeholders I made up.**
- **Companies:** Karachi Tech Solutions (Advanced), Lahore Retail Group (Basic), Islamabad Business Services (Advanced), each with an active subscription, a company admin and 1-2 recruiters (5 recruiters total).
- **Candidates:** 64, with Pakistani names, 16 cities mapped to the right province/territory, mobile numbers in the 0300-0349 range, all four job roles, 0-12 years of experience (skewed towards early career) and a salary expectation scaled to role and experience. Consent and privacy-policy version are filled in.
- Deterministic and idempotent: running the seed again changes nothing (checked - still 64 candidates, 3 companies, 3 subscriptions).

## Tests

- **Vitest: 35 passing** (30 from before + 5 new route-level tests proving each signup endpoint returns 429 after 5 attempts, per IP and per endpoint).
- **Playwright: 21 passing** (11 from before + 10 new): signup 429 on both endpoints; a click-through of **every nav item for all four roles** (asserts the URL, the active-link state and the page heading); dashboard cards; demo company admin sees plan and recruiters; unknown module 404s and cross-role access stays blocked; mobile drawer open/close and no horizontal overflow.
- `tsc --noEmit` clean; `eslint` has 0 errors (3 pre-existing unused-variable warnings in older tests). `next build` succeeds.

## Decisions for you

1. **`CLAUDE.md` has no module list or demo-data spec.** On disk it only contains `@AGENTS.md`, which is the Next.js warning. I couldn't read the BRD, so I derived modules from the database schema (whose commit says it covers "all BRD modules") and took "3 companies, both plans, 60+ candidates" from your message. **Please compare `src/lib/navigation.ts` against the BRD** - renaming, adding or removing a module is a one-line change there.
2. **`demo.admin@demo.test` is a second platform admin with a publicly known password.** I added it so there's a login for every role without touching your real admin's password. It only exists when `DEMO_MODE=true`; don't seed with that flag against any shared or production database.
3. Plan prices and feature limits are placeholders (see above).

## Known limitations

- **Rate limiting is in-memory**, so it resets on restart and isn't shared between server instances. It also trusts the first `x-forwarded-for` hop, so it needs a proxy that overwrites that header; behind one that appends, a caller could spoof IPs. A shared store (e.g. Redis) fixes both and is a small change in `rateLimit.ts`.
- Because it is in-memory, the e2e suite gives each spec file its own fake IP, and each demo account logs in only a couple of times per run. Re-running Playwright against an **already-running** test server more than a few times in 15 minutes can trip the login limit (5 per email per 15 min); a fresh server or a 15-minute wait clears it.
- The Playwright navigation tests need the demo seed to have been run first, like the existing tests need the reference data.
- Placeholder pages are placeholders: nothing behind them is wired to data yet except the four dashboards' summary numbers and the Recruiters page.
- Your dev DB still holds 6 "Test Co ..." companies from e2e runs in an earlier session, which inflate the platform admin's "Companies" count (9 instead of 3). I left them alone since it's your data; they're safe to delete.

## Suggested next steps

1. Check the module list against the BRD.
2. Pick the first real module to build. Recommended order: assessment engine (question bank -> test session -> scoring), since recruiter search, shortlists and candidate results all depend on scores.
3. Move the rate limiter to a shared store before any multi-instance deployment.
