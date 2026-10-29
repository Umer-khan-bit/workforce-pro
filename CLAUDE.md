@AGENTS.md

# Workforce Pro — Project Guide for Claude Code

## What we are building
Workforce Pro (a.k.a. Smart Workforce) is a cloud-based, multi-company SaaS recruitment platform.
Candidates take four assessments (Personality, IQ & EQ, Language, Job Skill). The system scores and
ranks them into quartiles. Companies subscribe (Basic / Advanced) to search, filter and shortlist
candidates instead of screening CVs.

Goal this week: a FULLY WORKING system with every BRD feature. Payments, ATS and salary data run in
demo/test mode (see "Demo mode"). Everything else is real, working code.

## Tech stack (do not change without asking)
- Next.js (App Router) + TypeScript, full-stack in one app
- PostgreSQL (local via Docker) + Prisma ORM
- Tailwind CSS, mobile-first, responsive on phone/tablet/desktop
- Auth.js (credentials login), role-based access
- Claude API for AI features (key in `ANTHROPIC_API_KEY`, model in `ANTHROPIC_MODEL`)
- Emails via SMTP (Brevo); log to console if SMTP env vars are missing
- Vitest for unit tests, Playwright for end-to-end tests

## Ports and my laptop (STRICT — never break these rules)
- NEVER use ports 3000, 3400, 4600, 5173, 5183, 8800, or anything near them
  (e.g. 3001–3010, 5174–5190, 8801–8810). Other projects run there.
- Use ONLY these ports:
  - App (Next.js dev and start): 7310  → http://localhost:7310
  - PostgreSQL (Docker, host side): 55432
  - Prisma Studio: 7320
  - Playwright test server: 7330
- Set these ports explicitly in package.json scripts, docker-compose.yml, playwright.config and
  .env.example. Never rely on default ports.
- Before starting anything, check the port is free. If it is busy, STOP and ask me. Do not pick
  another port on your own.
- NEVER kill, stop, restart or modify any process, container, service or port you did not create
  for this project.
- NEVER touch files, folders, Docker containers/volumes or databases outside this project folder.
- NEVER change global settings (global npm packages, system PATH, Docker settings, hosts file)
  without asking me first.

## User roles
- CANDIDATE: profile, tests, results (incl. AI feedback), salary guide, training, recruiter
  requests (accept/decline), notifications
- RECRUITER: belongs to a Company; search, filter, shortlist, job openings, contact requests,
  reports, ATS export (push candidates to the ATS), notifications
- COMPANY_ADMIN: manages company recruiters and subscription, job openings, reports,
  ATS & webhooks and API keys (company settings), notifications
- PLATFORM_ADMIN: question bank, approvals, job roles, regions/languages/cities, companies, users,
  plans and plan features, payments (separate from plans), test settings, salary benchmarks,
  pilot mode, settings (branding, homepage, currency, quartile and top-performer rules, question
  defaults, pool targets), privacy policy, message templates, reports

## Modules
1. Auth and profiles (candidate: city, region, experience, job role, minimum salary)
2. Question bank: AI generates questions, PLATFORM_ADMIN approves before they go live
3. Test engine: adaptive testing (see rules below)
4. Scoring: score, percentile, quartile per test (Q1 = top 25%)
5. Candidate results: scores, quartiles, AI feedback and improvement tips, downloadable report
6. Salary guide: range from scores, experience, role and city
7. Minimum salary threshold: recruiters only see/contact candidates whose minimum fits their offer
8. Top-performer triggers: Q1 in IQ, EQ, Language and Skill sends recognition email and a badge.
   Decided: Personality is excluded because it has no better or worse direction. The counted tests
   are a setting (Settings > Top performer); this is its starting value.
9. Training: courses (free and paid), progress tracking, AI recommendations, retake after training
10. Recruiter tools: search, sort, filters (role, city, experience, salary, quartile per test,
    "Q1 in all tests"), AI plain-language search, shortlist, candidate detail report
11. Subscriptions: Basic = all candidates; Advanced = adds exclusive access to Q1 scorers
12. Dashboards and reports: recruiter metrics, platform metrics, monthly fairness report
13. ATS integration: REST API + webhooks, CSV/Excel export, built-in mock ATS
14. Pilot mode: platform can be restricted to one company/team
15. Self-learning: pretest items, automatic recalibration, auto-retire bad or biased items
16. Job openings: recruiters and company admins create and manage openings; company admins see
    all openings in their company
17. Contact requests: a recruiter contacts a candidate (optionally for a job opening); only
    allowed if the offer meets the candidate's minimum salary. The candidate accepts or declines
    (candidate page: "Recruiter requests")
18. Notifications: in-app and email alerts for candidates, recruiters and company admins
19. Company settings (company admin): ATS & webhooks, API keys, company reports. Recruiters push
    candidates to the ATS
20. Platform admin business tools: companies, users, payments (ledger, separate from plans)

## Test engine rules
- Personality: Big Five, IPIP-style Likert items (1–5), includes reverse-keyed items, not adaptive
  - Decided: the fifth trait is scored and reported as Emotional Stability (high = calm), not Neuroticism.
    Its 8 worry/mood items are reverse-keyed (24 of the 50 items are reverse-keyed in total). The scoring
    module flips reverse-keyed answers (1–5 becomes 5–1) before averaging each trait.
- EQ: Likert + situational-judgement items, not adaptive
- IQ, Language (MCQ part), Skill: adaptive (CAT) with IRT 2PL
  - Start ability theta = 0. After each answer, update theta (EAP).
  - Next item = approved item with maximum information at current theta, not yet seen,
    respecting topic balance and exposure limits.
  - Stop when SE < 0.35 or 20 items (minimum 10). Time limit per test, configurable.
  - Uncalibrated items get default parameters: a = 1; b = -1 / 0 / +1 for easy / medium / hard.
  - Each session includes up to 2 unscored pretest items for calibration.
- Language: questions chosen by candidate region (admin-configurable region to language map);
  one short writing task scored by Claude API against a CEFR rubric (A1–C2).
- Skill: questions from the candidate's selected job role only.
- Quartiles: percentile vs. candidates of the same job role; fall back to all candidates if fewer than 30.
- Keep every test short (target 10–15 minutes). Save progress so a candidate can resume.
- Decided while building the engine (all numbers below are Settings, not constants):
  - Personality gets trait scores only: no percentile and no quartile (it has no better or worse direction).
  - Language score = (1 - w) x multiple-choice ability + w x writing grade, with w = 30% to start
    (Settings > Tests). The CEFR level is also shown on its own. The language tested is the primary
    language of the candidate's region; if there are too few approved questions, show "Not available yet".
  - The timer is the server's clock and keeps running if the browser is closed. When time runs out the test
    is scored if the minimum number of scored answers is in (pretest answers do not count), otherwise it is
    marked expired with no score and can be retaken at once. Otherwise a retake waits `retakeWaitingDays`.
  - Approved questions are operational (scored) unless approved "as pretest (unscored)"; pretest items are
    shown but never scored and are the ones recalibration measures first.
  - Rankings are always labelled "based on N candidates" (with a caution when N is under the minimum).
    Anonymised candidates and results still waiting for their writing grade are left out of rankings.
  - Written answers go to Claude as text only (never the name); the privacy policy says so, and the grading
    prompt and CEFR rubric are in Settings > Advanced > AI prompts. If grading fails, the score stays
    provisional and is finished the next time the candidate opens their result.
  - Tests that use the adaptive engine, or the Language writing task, must never send the correct answer,
    item parameters or pretest flags to the browser.

- Decided on Day 7 (a question retired while a candidate is answering it): the candidate may finish the question on screen, but
  the answer is not scored and does not count in the item statistics (the answer row is kept, marked as not scored). Adaptive tests
  pick another item because they run until enough scored answers are in; fixed tests (Personality, EQ) add one more approved
  question on the same topic (for Personality, the same trait) if there is one. A question retired before it is shown is never shown.
  A Language writing task retired while the candidate writes is finished but neither stored nor graded.

## Self-learning rules
- Recalibration job (scheduled + manual button) re-estimates item parameters from responses
  once an item has at least 200 responses.
- Auto-flag items that are too easy/hard, have low discrimination, or show bias (DIF by gender,
  region, language). Flagged items go to admin review; they are never deleted automatically.
- AI never makes hiring decisions. It only scores, ranks and recommends.
- Decided while building Day 6 (all numbers are Settings: `selfLearning`, `scheduledJobs`, `integrations`):
  - Recalibration (`src/lib/learning/recalibrate.ts`) re-fits difficulty and discrimination (2PL with a gentle prior) from
    COMPLETED sessions and saves them on the question. It flags too easy, too hard, low discrimination and DIF by gender,
    region and test language (compared among equally able candidates, groups under the minimum size ignored). It only
    ever sets a flag: retiring is the admin's decision (Item analysis: Keep it / Retire / Make operational).
  - "Keep it" records `reviewedAtCount`; the item is not flagged again until it has that many new answers again.
  - The monthly fairness report (`fairness.ts`) uses four-fifths impact ratios and hides groups under the minimum size.
    Gender is optional on the candidate profile and used only here and in the DIF check; recruiters never see it.
  - Scheduled jobs (`src/lib/jobs`): recalibration, fairness report, test reminders, plan-expiry warnings, webhook
    retries. Each run is a `JobRun`. The in-process scheduler starts only when `JOBS_AUTORUN=true`; an outside scheduler
    can call `POST /api/jobs/run` with `CRON_SECRET` (the endpoint is off without a secret). Tests never start it.

## Results, salary guide, training and notifications (decided)
- My results shows the candidate's latest result for each test (quartile, "better than X% of N candidates",
  CEFR level, personality traits). AI feedback and improvement tips are written by Claude once per result and
  saved (`AIFeedback.scoreId`), so a result is only ever sent once and a retake gets fresh feedback. Only the
  test, result, job role, experience and per-topic accuracy are sent: never the name, email, phone, city or
  salary. The prompt is in Settings > Advanced > AI prompts, the model and tip count in Settings > Advanced >
  AI feedback. Candidates see "Feedback is not available right now" when AI is not set up (never `.env` details).
- The PDF report (`/api/results/report`) is built from the same data, with whatever feedback exists (it writes
  missing feedback first, best effort). Text the PDF fonts cannot draw (for example Urdu) becomes "?".
- Salary guide (`src/lib/salary/guide.ts`): market line min / average / max for role, city and experience band
  from the salary benchmarks (average of all cities when the city has no figure). The candidate's quartiles in
  the counted tests give points (Q1..Q4 from Settings > Salary guide); the points, blended with "how much results
  move the range", place the candidate on the market line; the suggestion is as wide as the settings say, kept
  inside the market range. All numbers, the counted tests, rounding and the disclaimer are Settings.
- Minimum salary threshold lives in ONE place: `src/lib/recruiter/candidateAccess.ts`. Any query that shows
  candidates to a recruiter or company admin must start from `recruiterVisibleWhere(offerMax)` (not anonymised,
  consent given, user active, minimum at or below the offer; no stated minimum fits any offer), read candidates
  through `RECRUITER_CANDIDATE_SELECT` (never the minimum salary, phone or email), and every contact goes through
  `createContactRequest` (`src/lib/recruiter/contactRequests.ts`), which enforces the rule on the server and
  answers "not available" identically for a missing candidate and a too-high minimum, so a minimum cannot be
  probed. The offer is the job opening's top salary. A recruiter sees only that the offer fits.
  `viewCandidateAsRecruiter` writes the audit entry every recruiter profile view needs.
- Top performer is checked after every stored result (`evaluateTopPerformer`, called from `finalizeSession` and
  `regradePending`, outside the transaction). The rule is Settings > Top performer. The badge is awarded once and
  stays; the recognition email and in-app notification come from message templates. Quartiles are fixed when a
  result is stored (they are not recomputed as other candidates join).
- Training: courses (free or paid, general or for one job role, optionally tied to a test) are managed by the
  platform admin. Candidates only see general courses and those for their own job role. Paid courses go through
  the `PaymentProvider` interface (`src/lib/payments/provider.ts`): the simulated gateway exists only in demo mode
  and lets the person choose success or failure; a failed payment is recorded and enrols nobody. Lesson text is
  visible only to enrolled candidates. Finishing a course for a test lets the candidate retake that test without
  waiting (Settings > Training), but only if the course was finished after their last attempt.
- Course recommendations: weak areas are results at or below a quartile in Settings > Training (never
  Personality). Claude picks and explains courses (only ids it was given are accepted); if AI is unavailable
  simple rules are used. Saved per candidate and refreshed when a newer result exists.
- Notifications: `notifyUser` (`src/lib/notifications.ts`) sends from a message template: an IN_APP template
  becomes a notification, an EMAIL template is emailed (console when SMTP is not set up) and a record is kept.
  It never throws. Switched-off templates send nothing. Candidates have a notification centre with an unread
  count; recruiters and company admins get theirs on Day 5.
- Contact requests: a recruiter sends one for an open job opening of their company; the candidate accepts or
  declines under "Recruiter requests"; the recruiter gets an in-app notification.

## Recruiter tools, plans, billing and reports (decided)
- Every recruiter search starts from the minimum-salary rule (`recruiterVisibleWhere`, see above) against the
  **offer**: the top salary of a chosen job opening, an amount typed in the search, or by default the highest top
  salary among the company's open openings. With no offer nobody is shown. Search (`src/lib/recruiter/search.ts`)
  filters by role, city, experience and the weakest quartile accepted per test, "Q1 in all tests" means the
  top-performer rule; sorting is best overall (mean percentile over the top-performer tests), experience, or one test.
  The address holds the whole search; page size and pool size are Settings > Recruiter tools.
- Plan features are read ONLY through `src/lib/recruiter/entitlements.ts` (built on `hasFeature` / `featureLimit`):
  `allCandidates` = search, shortlist, contact and candidate reports; `q1Exclusive` = Top Performers (candidates who
  meet the top-performer rule) are hidden from search, detail, shortlist and contact for plans without it (a count
  of hidden ones is shown); `aiSearch`; `maxShortlists` (company-wide, entries in the pipeline that are not Hired or
  Rejected); `maxJobOpenings` (company-wide, OPEN openings only); `atsApiAccess` (Day 6). No plan or an ended plan
  means no features and a limit of 0. A test fails if any code compares a plan's name or code.
- AI search sends only the request text and the lists of roles and cities to Claude. Its answer is validated
  (`validateSearchReply`): roles and cities must exist, quartiles are clamped, anything else is dropped and shown to
  the recruiter. Prompt in Settings > Advanced > AI prompts; the run is recorded without the request text.
- Candidate detail report (page and PDF) goes through `getCandidateDetail`: plan, Top Performer access and the salary
  rule are checked BEFORE the view is audit-logged; it never shows the minimum salary; phone and email appear only
  after that company's request was accepted.
- Shortlist = one entry per recruiter, candidate and job opening, with a dated status history (Shortlisted,
  Contacted, Interviewing, Offered, Hired, Rejected). Sending a contact request moves a shortlisted candidate to
  Contacted. A hire notifies the company admins. Recruiters change their own entries, company admins any in the company.
- Job openings: recruiters manage their own, company admins every opening in the company. Openings and shortlists
  have a plan limit that the server enforces.
- Billing: `changePlan` (`src/lib/subscriptions.ts`) takes payment through the `PaymentProvider` (simulated in demo
  mode) and starts the new plan immediately for one billing period (Settings > Billing). Unused paid time on the old
  plan is credited against the new price when proration is on (a trial gives no credit). A failed payment is recorded
  and changes nothing. A change that credit covers entirely is free and makes no Payment row. The platform admin can
  also give a plan without payment. Company admins are warned before a plan ends (once per subscription).
- Reports (`src/lib/reports`): funnel = how many shortlisted candidates ever reached each stage; time to hire = days
  from shortlisting to the first Hired; charts are plain HTML/CSS (`src/components/charts`) with a table for screen
  readers. Recruiter, company admin and platform admin each see their own scope. Deleted accounts are never counted.
- Notifications exist for every role (sidebar count, same screen). Recruiters: contact request answers. Company
  admins: new job openings, hires, plan changes, failed payments, plans about to end.

## Demo mode (DEMO_MODE=true)
- Payments: full checkout flow with a simulated gateway (success/failure), no real money.
  Keep a `PaymentProvider` interface so PayFast/JazzCash can be plugged in later.
- ATS: mock ATS inside the app that receives pushed candidates. Keep an `AtsConnector` interface.
  - Decided: company API keys (`wfp_...`, hash only, shown once), REST API under `/api/v1` (Bearer key), signed webhooks
    (HMAC-SHA256 over `timestamp.body`, https and no private networks, never follow redirects, delivery log, retries from
    Settings), push from the shortlist and CSV/Excel export. All gated by the plan feature `atsApiAccess` through
    `entitlements.ts`, and by pilot mode. Candidate data in the API and exports never includes minimum salary, phone or email.
  - Pilot mode blocks recruiters and company admins of other companies at login and on every request, blocks company
    signup, and stops other companies' API keys and webhooks. Candidates and platform admins are unaffected.
  - The search offer defaults to the top salary of the recruiter's most recent open job opening (`resolveOffer` in
    `src/lib/recruiter/offer.ts`); a typed amount or a chosen opening wins.
- Salary data: seeded sample benchmarks by role, city and experience. Keep it replaceable.
- Seed data: 4 job roles (Accountant, Sales, Customer Service, IT Support), English + Urdu,
  60+ sample candidates with completed tests, 3 companies, recruiters on both plans.
  The demo results are summaries (sessions and scores, no answer rows, so no question gets locked), ranked
  across Q1-Q4 with the same code and settings the app uses; `candidate@demo.test` has Personality, IQ and EQ
  only, so Language and Job skill can still be taken live. 14 starter courses are added too.
  Demo hiring (`prisma/seedDemoHiring.ts`): 9 job openings, about 70 shortlisted candidates moving through the
  pipeline with dates over the last months, contact requests with answers, a payment history per company; it follows
  the same rules as the app (salary fit, Top Performers only for plans with Q1 access, shortlist limits).

## No hardcoding
Nothing business-related may be static or hardcoded. Every value an admin might want to change
must live in the database and be editable from the PLATFORM_ADMIN panel, including: job roles,
regions, languages, cities, plans, prices, plan features, test settings (question count, time
limit, retake days, stop rules), quartile thresholds, top-performer rules, salary benchmarks,
email/notification templates, courses and lessons, homepage and privacy policy text, branding
(name, logo, colours). Seed data only sets starting values. Security rules stay in code.
- Plan features are on/off options and numeric limits stored in the database (PlanFeature rows,
  Plan.features). Every access check in code must read these features through `src/lib/planFeatures.ts`
  (`hasFeature`, `featureLimit`, `canAddMore`). Never compare a plan's name or code.
- Settings groups live in `SiteSetting` (definitions and starting values in
  `src/lib/settings/definitions.ts`); read them with `getSetting()`. The numbers quoted elsewhere in
  this file (stop rules, quartiles, limits) are the starting values, not constants to copy into code.
- Adding a new admin-editable value means adding its edit screen in the same change.
- AI question generation: the models, thinking effort, batch size, prices (for the cost estimate) and every
  prompt live in Settings (`aiGeneration`, `aiPrompts`). The API key stays in `.env`. Everything AI writes
  is saved PENDING_APPROVAL; only an admin approves. Every AI run is logged (AiRun + audit log).

### Kept in code on purpose (not business values)
These look like fixed lists but are part of how the system works, so they stay in code. Anything else business-related must be a Setting.
- **Gender options (FEMALE / MALE / OTHER, plus "prefer not to say" meaning no value).** They are a database enum used by the
  fairness maths (the DIF check and the fairness report compare female with male; the others are too small to compare on their
  own). An admin editing this list would silently change what the fairness checks mean and could break comparisons between
  months. The wording on screen is plain labels only.
- **Security limits.** Login, signup, password-reset, email-verification, AI and download rate limits and their windows, bcrypt
  rounds, single-use token rules. CLAUDE.md says security rules stay in code, and a wrong value set by mistake in a screen would
  weaken protection.
- **The five tests themselves** (Personality, IQ, EQ, Language, Job skill) and their names, and **Q1 to Q4** as four groups. They are
  the product's structure; what an admin can change is how each test behaves (Settings > Tests) and where the quartile cut-offs are
  (Settings > Quartiles). Wording on screen says "highest group", never "top 25%", because that number is a Setting.
- **Maths constants** of the adaptive engine and the recalibration: the ability grid, the allowed range of difficulty and
  discrimination, the Likert scale 1 to 5, the midpoint of the salary line.
- **Technical timing and safety caps**: the server's small grace time on answers (3 seconds, 20 seconds for a written answer), how long a
  scheduled job may run before it counts as stuck (30 minutes), the 23-hour guard that stops a daily job running twice, and the largest
  batch sizes of one request (200 shortlist entries per ATS push, 500 openings in the API, 2000 questions looked at when avoiding
  duplicates, 40 shown to Claude).
- **Display formats**: how dates are written (day, short month, year) and how a report chart groups time (by month when the period is over 120
  days, otherwise by week). They change how things look, not what they mean.
- **List page sizes in admin screens** (audit log, payments, users, item analysis, notifications). The recruiter search page size is a Setting.
- **The wording of the example in the AI search box** ("with at least 3 years of experience and strong IQ"); the role and the city in it come from the database.

Scan: `src/lib/security.test.ts` ("no business value is written into the code") fails when a brand name, currency code, city,
region, or a job role, language or plan name written as a text value appears in `src/` outside tests, the seed data
(`seedData.ts`), the settings starting values (`settings/definitions.ts`) and the message template starting text.

## Security and privacy (bank-grade, non-negotiable)
- Never log passwords, tokens, CNIC, salaries or test answers.
- Hash passwords (bcrypt). Validate all input (zod). Role checks on every API route.
- Candidate consent checkbox at signup, with link to privacy policy page.
- Audit log for admin actions and for every recruiter view of a candidate profile.
- Secrets only in `.env` (never commit it); keep `.env.example` updated.
- Rate-limit login, signup, password-reset, email-verification and AI endpoints. The limiter is stored in
  the database (`isRateLimited` in `src/lib/rateLimit.ts`, async), so it survives restarts and works on
  several servers. Always `await` it.
- Email links (password reset, email confirmation) hold single-use, time-limited tokens; only a hash is
  stored. Links use `APP_BASE_URL` from the environment, never the request's Host header.
- Email verification: unverified users can log in and see a banner, but must not take tests or contact
  candidates. Every such route must call `requireVerifiedEmail()` (`src/lib/emailVerification.ts`).
- Forced password change: a signed-in user with `mustChangePassword` is refused on EVERY API route (403
  `PASSWORD_CHANGE_REQUIRED`) except change-password and the Auth.js routes. This is one rule in the proxy
  (`src/lib/passwordGate.ts`, matcher `/api/:path*`), so new routes are covered without calling anything.
- Account deletion anonymises a candidate (personal data erased, test statistics kept, audit event kept).
  Candidate search, shortlists, cohorts and exports must skip profiles where `anonymisedAt` is set.
- Day 6 security pass: security headers on every response (`next.config.ts`), a cross-site check on data-changing API
  calls (`src/lib/originGuard.ts`, used by the proxy), no message bodies logged in production when SMTP is missing, and
  `src/lib/security.test.ts`, which fails when a route has no role/API-key/secret check, reads a body without zod,
  changes admin data without an audit entry, logs a secret, forgets to `await` the rate limiter, or uses an environment
  variable missing from `.env.example`. A new route must pass these without being added to an exception list unless it
  is public on purpose (and then say why in that list).

## How to work
- One module at a time. Do not start the next module until the current one works.
- Before coding a module, show a short plan and wait for my OK.
- Write tests for scoring, adaptive logic, quartiles, salary guide and access rules.
- After each module: run tests, run the app, tell me exactly what to click to check it.
- Explain errors and fixes in simple language. I am a product manager, not a developer.
- Commit to Git after each working module with a clear message.
- Line endings: every file is LF (`.gitattributes` enforces it). Write migration files with LF only: Prisma
  hashes them byte for byte, so a stray CRLF makes an applied migration look modified. A test checks this.
  Never edit a migration after it has been applied; add a new one.
- If a requirement is unclear, ask me. Do not invent new features.
- Keep the UI clean and professional: consistent colours, fonts and spacing across all screens.

## Build plan
- Day 1: setup, database schema, auth, roles, layouts, seed data
- Day 2: question bank, AI question generation, admin approval
- Day 3: test engine (all four tests), scoring, quartiles, language by region
  - After the test engine, seed realistic test sessions and scores for all demo candidates, spread across
    quartiles (Q1-Q4), so recruiter filters and dashboards have data.
- Day 4: results, AI feedback, salary guide, minimum salary, training, top-performer emails
- Day 5: recruiter dashboard, filters, AI search, subscriptions, reports
  - Dashboards and reports use charts, not only numbers: candidates by city, by role, quartile
    distribution, and the hiring funnel.
- Day 6: ATS API/webhooks/mock/export, pilot mode, self-learning jobs, security pass, mobile polish
- Day 7: end-to-end testing, bug fixes, demo rehearsal
  - Design polish of every screen.
  - One consistent vocabulary across the whole app (for example always "Candidate", never "Job seeker"
    or "Applicant"; the same word for the same thing on every screen, email and template).

## Integrity (decided)
- Test screen: copy, cut, paste, right-click and text selection are blocked on questions; pasting into the Language writing box is refused. Every
  time a candidate leaves the window, `POST /api/tests/sessions/[id]/focus` writes `TEST_FOCUS_LOST` to the audit log (count only, own running session,
  rate limited). The honesty pledge wording is Settings > Tests.
- A test is flagged when window exits reach `integrityFlagThreshold` (Settings > Tests, starting value 3). Recruiters see only "Integrity: no concerns" or
  "Integrity: N window exits" (a cleared flag reads as no concerns). `src/lib/integrity/`.
- Platform admin "Integrity review": Clear flag, Void result, Undo void (all audit-logged; `IntegrityReview` table). Voiding sets `Score.voidedAt`; EVERY
  reader of results must filter `voidedAt: null` (ranking, search, filters, Top Performer, salary guide, training, reports, fairness, exports, AI feedback).
  A badge that depended on the voided result is withdrawn (`BADGE_REMOVED`); Undo re-checks it. A voided last result lets the candidate retake at once.
  The wording the candidate sees is Settings > Tests ("Integrity: message for a cancelled result"). Paste attempts are not recorded.

## Demo, polish and go-live (decided on Day 7)
- Demo data lives only in the seed (`prisma/seed.ts`, DEMO_MODE only): results, courses, hiring, ATS activity (`seedDemoIntegrations`), item statistics (`seedDemoItemStats`), one waiting request (`seedDemoStory`), and the approval of AI-reviewed-OK demo questions (`approveDemoContent`). `npm run demo:reset` repeats the live demo step. `e2e/demo-accounts.spec.ts` fails if a demo account meets an empty or broken screen.
- Privacy policy versions are added in `PRIVACY_POLICY_UPDATES` (`src/lib/seedData.ts`); the current one is 1.2 (gender is optional, fairness checks only).
- Wording: "Candidate", "Top Performer", "Job skill", "Recruiter requests" (candidate side) / "Contact requests" (recruiter side).
- `DEMO_SCRIPT.md` is the client demo; `GO_LIVE_CHECKLIST.md` is demo to production. Both must be updated when a screen they mention changes.
