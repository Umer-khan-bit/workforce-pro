# Workforce Pro - status (Day 1 to Day 4, the fixes and the demo data)

> Newest first: the sections directly below were added after Day 1. Everything further down is the Day 1 write-up, with the few statements the later work changed corrected in place.

## Day 3 part 2 and Day 4: results, salary guide, badge, training, notifications (done)

Two fixes first, then the build. Run the seed once (`npx prisma db seed`) to get the demo results and courses (already done on this laptop's database).

### The two fixes
1. **Every API route now blocks users who must change their password.** One rule in the proxy (`/api/:path*`, `src/lib/passwordGate.ts`): a signed-in user with a temporary password gets 403 `PASSWORD_CHANGE_REQUIRED`, except on change-password and the Auth.js sign-in/sign-out/session routes (and the emailed-link routes under `/api/auth`). Routes added later are covered automatically. Tests: unit tests, a test that walks every route file, and an end-to-end test that calls APIs as such a user.
2. **A new version of an English question marks its translations as needing a new translation.** They appear in Approvals in a yellow panel (translation, "English was", "English now"). They stay in use until the replacement is approved (then the old one retires itself), or you retire one by hand. The **Translate** button now also picks up the new English version.

### What was built
- **Demo results (Day 3 part 2).** 64 demo candidates have completed sessions and scores (307 tests): IQ, EQ, Language and Job skill ranked with the app's own code and your quartile settings, about 60 in each of Q1 to Q4 per test; Personality has traits only. 7 candidates are Top Performers (badge and in-app notification). Language results have a CEFR level and a graded writing sample. `candidate@demo.test` has Personality, IQ and EQ only, so she can still take Language and Job skill live. These are summaries: no answer rows, so no question gets locked.
- **My results.** Quartile, "better than X% of N candidates", CEFR, personality bars, AI feedback and tips per test (written by Claude on first view, then saved), links to the summary and retake. **Download PDF report** (scores, traits, feedback, tips, badge, salary guide, disclaimer).
- **Salary guide.** Market range for role, city and experience band from the benchmarks (average of all cities if the city has no figure), moved up or down by the candidate's quartiles; compares the candidate's own minimum. Every number is in Settings > Salary guide.
- **Minimum salary rule, in one place** (`src/lib/recruiter/candidateAccess.ts`). Recruiters only see and contact candidates whose minimum is at or below the offer (the job opening's top salary); no stated minimum fits any offer; deleted, non-consenting and inactive candidates are never shown; recruiters never read the minimum, phone or email. A test fails if recruiter-facing code reads candidates any other way. The recruiter dashboard count now follows the rule (it used to count everyone, including deleted accounts).
- **Contact requests.** A recruiter (or company admin) can send a request for an open job opening of their company (API; the screen comes with Day 5). The server enforces the salary rule and email confirmation; the answer is identical for a missing candidate and a too-high minimum. The candidate sees it under **Recruiter requests**, accepts or declines once, and the recruiter gets an in-app notification.
- **Top performer.** Checked after every stored result, using Settings > Top performer. Badge once (kept), recognition email and in-app notification from the message templates. **Badges** page shows progress per test.
- **Training.** Admin: **Courses** (create, edit, price, role, test, active; lessons with text, minutes, order; guarded deletes). Candidate: **Training** with recommendations, My courses, All courses; join a free course, or buy a paid one through the `PaymentProvider` interface (demo: simulated gateway with Pay and Simulate a failed payment; failures are recorded and enrol nobody); lessons with progress; completion notification; retake without waiting after finishing a course for that test (Settings > Training).
- **Recommendations.** Weak areas = Q3 or Q4 (Settings). Claude picks and explains courses (only ids it was given are accepted); simple rules if AI is unavailable. Refreshes by itself when a newer result exists.
- **Notifications (candidates).** In-app centre with unread count in the sidebar, mark one or all as read; emails go through SMTP or are written to the server console. Two new templates: course joined, course completed.
- **Settings.** New groups: Salary guide, Training (normal tabs), AI feedback (Advanced); two new prompts (result feedback, course recommendations) under AI prompts.
- **Dashboard.** The candidate dashboard shows the latest results, Top Performer badge and unread count.

### Tests
- **Vitest: 521 passing** (was 371). **Playwright: 61 passing** (was 43). `tsc` clean, `eslint` 0 errors.
- Real Claude calls were exercised once by the navigation test (it opens My results as the demo candidate): 3 feedback texts and 1 course recommendation, about 2 cents. Nothing else in the tests calls the API (a fake Claude is used).
- Hardened two end-to-end tests that were flaky under load (a 60-second token lifetime; the demo admin's login limit of 5 per 15 minutes).

### Decisions I made (change any of them)
1. **Password gate in the proxy**, not per route; exempt: change-password and `/api/auth/*`.
2. **Outdated translations stay live** until the replacement is approved, so Urdu candidates never lose a personality item in between.
3. **Demo results are summaries** (no answer rows) because answered questions are frozen and the bank has few approved questions.
4. **Ranks are fixed when a result is stored.** Candidates who join later do not change older quartiles.
5. **Feedback is written on first view and saved**; a retake gets new feedback. About 0.5 cent each. Candidates see "not available right now" if AI is down, never setup details.
6. **PDF** uses the `pdf-lib` package (added to the project). The standard PDF fonts cannot draw Urdu script, so non-Latin text shows as "?".
7. **Salary formula defaults:** results move the range 60%; the suggestion is half as wide as the market range; Q1/Q2/Q3/Q4 = 100/66/33/0 points; rounded to 1,000; tests counted = IQ, EQ, Language, Job skill.
8. **Offer = the job opening's top salary**; a candidate with no stated minimum is visible to every offer.
9. **Top performer badge is kept** even if a retake is worse.
10. **Weak area = Q3 or worse**, up to 3 recommendations; free courses are preferred when two help equally.
11. **Courses are visible to a candidate only if general or for their own job role**; lesson text only after joining.
12. **Paying needs a confirmed email**; the simulated gateway only works in demo mode.
13. **Payment rows** now also store the course and the payer (two new columns), so failed payments are on record.
14. **Candidate notifications only** for now; recruiters and company admins get their centre on Day 5.
15. **Small extras beyond the list**, needed to make "contacted" real and testable: the contact-request API, the candidate Recruiter requests page, and the recruiter dashboard count.

### Not done / worth knowing
- **No Git remote is configured, so nothing was pushed.** Add one (`git remote add origin <url>`) and I will push.
- Emails are written to the server console until `SMTP_*` is set in `.env`.
- The recruiter screens for contact requests (and search, shortlists) come with Day 5.
- Test reminders have a template and two demo notifications, but nothing sends them on a schedule yet.
- Restart `npm run dev` on 7310 after pulling this (new database tables and the new client).

---

## Fix batch: line endings, forced password change, question versioning, generator check (done)

Five commits, each tested on its own.

1. **Line endings** (`faa3c4e`). git was hiding that 62 working files were CRLF while the repository stores LF (this machine has `core.autocrlf=true`). Added `.gitattributes` (`* text=auto eol=lf`), converted the files to LF, stopped tracking the runtime file `.claude/scheduled_tasks.lock` (now in `.gitignore`). **Three** applied migrations (`no_hardcoding`, `auth_tokens_rate_limit`, `test_engine`) had been written and applied as CRLF, and Prisma hashes the raw bytes; once LF they would have shown as "modified after being applied". Their stored checksums were updated to the LF hash (metadata only, database not reset). `git diff` and `git status` are empty and `prisma migrate status` reports 10 migrations, none modified. A new test fails on any CR in a migration, any CRLF stored in the repository, and any applied migration whose checksum no longer matches its file. Rule added to CLAUDE.md: never edit an applied migration.
2. **Forced password change** (`adf4656`). The browser could clear `mustChangePassword` by calling `session.update({ mustChangePassword: false })`. The flag is now read from the database on every request (together with the deactivation and password-reset checks) in the `jwt` callback in `auth.ts`; `auth.config.ts` ignores the update payload entirely and the change-password form sends nothing. Tests: unit tests (the old code fails them), wiring guards, and end-to-end tests that perform the attack in a browser and that honour a flag an admin sets while the user is signed in.
3. **Question versioning** (`8c26bc5`). Once a question has any candidate response, its text, options, correct answer, format, test, topic, reverse-keying, language, job role and difficulty are frozen; only the explanation can change (API returns 409 `QUESTION_IN_USE`; the edit page explains and offers **Retire it and add a new version**). A database trigger refuses the same edits from any script (calibration, status, pretest flag and review notes still work). New `previousVersionId` link; adding a version creates a linked, approved question (with a **Start as pretest (unscored)** checkbox) and retires the old one in one step, with audit entries; list and edit pages show the version links.
4. **AI generator count check** (`5a5408c`). Each batch now counts what came back. If fewer good questions than requested are saved it asks again for exactly the missing number (listing what it already has), up to **Extra tries when Claude returns too few** (Settings > Advanced > AI generation, default 2, 0 = off). Anything still short is reported on the Generate page, in the audit log and in `npm run content:demo`; a failed retry keeps what was saved. Translation batches get the same check. The IQ batch that returned 1 of 10 earlier is exactly the case now covered.
5. **USER_GUIDE.md** (`bd1723d`) is committed.

### Things to know
- **Not changed, worth a follow-up:** the forced password change is enforced on pages (the proxy), but most API routes do not check `mustChangePassword`, so a user with a temporary password who calls an API directly is not stopped. Easy to add in one shared guard.
- **Question versions and translations:** an Urdu translation is linked to the English original; if the English item is versioned, the translation still points to the retired original and needs its own new version.
- **A test already under way** can finish a question that gets retired mid-test; its answer is stored against the old version.
- **Dev server:** the database client was regenerated while your `npm run dev` was running; restart it to pick up the new `previousVersionId` field and the trigger-aware client.

### Tests
- **Vitest: 371 passing** (was 295), **Playwright: 43 passing** (was 39), `tsc` clean, `eslint` 0 errors.

---

## Day 3, part 1: the test engine (done)

Follows "Test engine rules" in CLAUDE.md. Every number below is a Settings value, not a constant.

**Candidate screens**
- **My tests** (`/candidate/tests`, the old "Assessments" placeholder): one card per test (Personality, IQ, EQ, Language, Job skill) showing Not started, In progress (Resume), Completed (summary and retake date from the test settings), or **Not available yet** with the reason (too few approved questions for your language or job role, or no Language writing task). Starting needs a confirmed email address (`requireVerifiedEmail()` on every test endpoint, and the page explains it).
- **Start screen:** number of questions, time limit, the instructions from Settings > Tests, and (Language) the notice that AI grades the writing.
- **Test screen** (full screen, mobile first): one question at a time, countdown timer, progress bar, 44px+ buttons, a Next button that stays at the thumb, no going back. Every answer is saved on the server, so closing the browser and coming back resumes at the same question with the same clock. At zero the page submits automatically (an unfinished essay is sent as it stands), and the server enforces the deadline on every request anyway.
- **Result summary** after each test: quartile and percentile with "based on N candidates in your job role / across all job roles" (and a caution when N is under the minimum), CEFR level and feedback for Language, trait bars for Personality, retake date. The full results page and AI feedback stay for Day 4.

**Engine** (`src/lib/testEngine/`)
- **IRT 2PL with EAP:** theta starts at 0 and is re-estimated after every scored answer (standard-normal prior, grid -4 to +4); the standard error comes from the same posterior. Checked against an independent high-resolution calculation.
- **Next question:** maximum information at the current theta among unseen items, with topic balance and exposure control (random pick among the best K, and a cap on how often one item is used, both in Settings > Advanced > Test engine). Never repeats a question.
- **Stopping rule:** standard error below the test's threshold after at least the minimum number of scored items, or the maximum. Pretest items do not count.
- **Pretest:** up to the test's pretest count of unscored items at random positions inside the first questions, never first; their answers feed the running item statistics.
- **Personality and EQ** are fixed length, balanced across traits or dimensions, shuffled with a per-session seed so a resumed test keeps its order.
- **Language:** a CAT on the multiple-choice part, then one writing prompt graded by Claude against the CEFR rubric in Settings (prompt, rubric, word limits and weight are all settings). Only the prompt and the answer text are sent, never the name; each grading is an AI run in the audit log. If grading fails the score stays *provisional* (no ranking) and is finished the next time the candidate opens the result.

**Scoring**
- **Stored per test:** raw score, theta and standard error, percentile, quartile, who it was ranked against and how many, and a provisional flag.
- **IQ and Skill:** raw score = % correct; ranked on theta. **EQ:** 0-100 from Likert (reverse-keyed) and situational-judgement items; ranked on that. **Language:** composite = 70% multiple-choice ability + 30% writing (CEFR scores on the same scale), both in Settings; with no writing it is the multiple-choice ability alone.
- **Personality:** five trait scores from 1 to 5, reverse-keyed items flipped (1-5 becomes 5-1), Emotional Stability scored toward stability. **No percentile and no quartile**, as decided.
- **Ranking:** percentile (ties count half) against each other candidate's latest finished result, same job role if it has at least the minimum from Settings (30), otherwise everyone; quartile from the cut-offs in Settings. Anonymised candidates and provisional results are left out.
- **Timer rules (decided):** the server clock keeps running when the browser is closed. At timeout the test is scored if the minimum number of scored answers is in; otherwise it is marked expired with no score and can be retaken at once.

**Also done**
- **Approve as pretest (unscored)** in the approval queue (bulk and single); a Pretest badge in the question bank.
- **Approvals page:** search and an "AI review" filter (needed once the queue holds hundreds of questions).
- **Privacy policy v1.1** (published as a new version, so existing consent records stay accurate): "Some tests include a short written answer. The text of that answer (never your name or any other personal detail) is graded by an AI service..." Candidates who accepted 1.0 are informed again on the Language start screen; you may want to ask existing candidates to accept 1.1.
- **Settings:** new Tests group (instructions, writing notice, writing weight, word limits, CEFR scores) and Advanced > Test engine; two new prompts under Advanced > AI prompts.
- New migration `20260930210000_test_engine` (score fields, `isScored`, one answer per question per session, language used by the session, AI run kind for grading). `npm run content:demo` runs the generator for demo content.

### Demo questions are ready to approve
The generator ran once for English demo content (stopped well inside the $4 cap): **245 new questions, all Pending**, estimated cost **$1.12** (29 batches, each written and then reviewed by a second Claude pass). **Approvals now holds 248 pending questions**; 75 are flagged by the AI review (Needs fixing or Reject), 173 are marked OK.

| Test | New pending | Notes |
| --- | --- | --- |
| IQ | 31 | easy 10, medium 13, hard 10 (one batch returned a single question, so 31 instead of 40; top up from Generate) |
| EQ | 30 | 18 situational-judgement, 12 Likert |
| Language | 30 | 24 multiple choice (8 easy, 8 medium, 8 hard) and 6 writing prompts |
| Skill: Accountant | 41 | easy 11, medium 20, hard 10 |
| Skill: Customer Service | 35 | easy 10, medium 20, hard 5 |
| Skill: IT Support | 40 | easy 10, medium 20, hard 10 |
| Skill: Sales | 39 | easy 10, medium 20, hard 9 |

Suggested way to approve: Approvals > filter **AI review = OK** > Select all on the page > Approve (repeat per page, or filter by test). Read the flagged ones one by one (Edit or Reject). Tick "Approve as pretest (unscored)" for any batch you want measured before it counts; otherwise approved questions are scored straight away. Until then, only Personality can be taken with the real bank (50 approved items); IQ has 9 approved and Skill 3.

### Decisions and things to know
- **Restart your dev server.** The database client was regenerated while your `npm run dev` on port 7310 was running (I did not stop it). Stop it and start it again so it picks up the new tables and fields.
- **Language of each test** is the primary language of the candidate's region (today English everywhere). The Urdu personality translations stay Pending, so a region mapped to Urdu would show Personality as "Not available yet".
- **Exposure control** divides an item's uses by the number of tests taken, with a warm-up floor (30 tests) so a fresh bank is not over-restricted; items over the cap are only skipped while at least K alternatives remain.
- The generator does not check that a batch returned the number of questions asked for (the IQ batch above returned 1 of 10). Worth adding.
- Writing grading uses the "writer" model and prices from Settings > Advanced > AI generation.

### Tests
- **Vitest: 295 passing** (was 202). Engine maths (probability, information, EAP vs an independent calculation, standard-error shrinkage), stopping rule, item selection (max information, no repeats, topic balance, exposure cap, randomised top K, seeded and order-independent), pretest placement, fixed forms, reverse-keying (all 8 Emotional Stability items), Personality/EQ/Language scoring, percentile and quartile (ties, boundaries, custom cut-offs, role vs all fallback) and settings validation, plus integration tests that play whole sessions against the real database in an isolated world: adaptive behaviour for strong and weak candidates, pretest and statistics, resume, the timer (scored vs expired vs late answers), retake dates, Language with a fake Claude (composite, weights, short or long essays, provisional then regraded, no name sent), cohort fallback, secrecy of answers, ownership, double submits from two tabs, audit log contents, and the API routes (403 for non-candidates and unconfirmed emails).
- **Playwright: 39 passing** (33 + 6 new, on a phone-sized screen): a full IQ test with instructions, timer, progress, closing the browser and resuming, result, retake date and lock; a full Personality test; auto-submit on timeout (scored) and too-early timeout (no score, immediate retake); the Language writing screen up to the word counter (not submitted, because the real grader costs money); an unconfirmed email blocked on the page and through the API.
- `tsc` clean; `eslint` 0 errors (3 old warnings).

---

## Account gaps and fixes (done)

Eight items, all built, tested and committed.

1. **Forgot password.** Login page > "Forgot your password?" > enter email > emailed link > choose a new password. The link is single-use and expires (60 minutes, in Settings). The answer is the same whether or not the address has an account, and the email is sent in the background so timing does not give it away. A reset also ends every session that was open before it. Limits: 5 requests per IP and 3 per address per 15 minutes; 10 link attempts per IP. The email is the `PASSWORD_RESET_EMAIL` message template (editable under Message templates). With no SMTP set, the whole email, link included, is written to the server console.
2. **Email confirmation.** Candidate and company signup (and recruiters created by a company admin) get a confirmation email (`EMAIL_VERIFICATION_EMAIL` template, link lasts 48 hours by default). Unverified users can log in and see a banner with "Send the link again" (limited to 3 per 15 minutes). They must not take tests or contact candidates: `requireVerifiedEmail()` (`src/lib/emailVerification.ts`) is the guard every such route has to call; those routes are built on Day 3 and Day 5 and CLAUDE.md now says so. Accounts that existed before this change, and all seeded accounts, count as verified.
3. **New companies.** The plan and free-trial days come from Settings > Accounts & trials (starting values: Basic plan, 14 days; 0 days or "No plan" means no subscription). A new company admin sees their plan, the days left and an **Upgrade plan** button on the dashboard, and the new **Subscription & billing** page compares the plans (prices and features from the database). Plans are now also checked against their end date, so an ended trial gives no access. The "Choose" buttons are switched off for now: checkout is part of the Day 5 subscriptions module, and the page says so.
4. **Candidate profile page** (Profile & privacy): edit name, phone, region, city (filtered by region), experience, job role and minimum salary, with the same rules as signup. Each save is audit-logged with the **names** of the fields that changed, never the values.
5. **Account deletion.** Candidates only. The page asks for confirmation (warning, then type DELETE and enter the password). Personal data is erased: name, email (replaced by an unusable address, so the original can sign up again), password, phone, city, salary expectation, notifications, AI feedback, badges, written essay text, shortlist entries, contact requests and ATS exports. Kept for calibration: test sessions, answers and scores, plus region, job role and years of experience (needed to check questions for bias). The audit log keeps the event. The profile is marked `anonymisedAt`; candidate search, shortlists and cohorts must skip those (CLAUDE.md now says so).
6. **Settings.** Question defaults, Self-learning, AI generation (models and prices) and AI prompts now sit under an **Advanced** tab with a warning. I included AI generation as well as the three you listed, because it is equally technical. Every setting has a one-line plain-English help text (a test fails if one is missing), and prompt boxes list their allowed placeholders on a separate line.
7. **Rate limiter in the database.** Attempts are stored in a table, so limits survive restarts and are shared by every server on the same database. Counting is atomic (a per-key lock), so simultaneous requests cannot slip past; a test fires 12 at once and exactly 4 get through. If the database is unreachable the limiter throws, so callers fail closed. Servers should keep their clocks in sync (normal time sync is plenty). `isRateLimited` is now async.
8. **Build plan** (CLAUDE.md): Day 3 seeds realistic test sessions and scores across Q1-Q4 for all demo candidates; Day 5 dashboards and reports use charts (by city, role, quartile distribution, hiring funnel); Day 7 covers design polish of every screen and one consistent vocabulary.

### Decisions and things to know
- **Set `APP_BASE_URL`** in `.env` for any real deployment (added to `.env.example`). Emailed links are built from it, never from the request, so a forged Host header cannot point a reset email somewhere else. It falls back to http://localhost:7310 in development.
- **Real email not tried.** Sending goes through `nodemailer` using the existing `SMTP_*` variables (Brevo). I tested the SMTP path with a fake transport (from-address, failure handling, no secrets or links in error logs) but not against a real Brevo account. Until SMTP is set, links appear in the server console.
- **Reset and confirmation emails always send**, even if their template is switched off, so nobody is locked out; the template descriptions say so.
- **Starting trial** is Basic for 14 days: my choice, change it in Settings > Accounts & trials.
- **Tests now clear the rate-limit table before each Playwright run** (`e2e/global-setup.ts`). Because limits now survive restarts, running the suite twice within 15 minutes would otherwise lock the demo accounts out (5 logins per address per 15 minutes).
- Fixed a real bug found on the way: after a bulk approve, the approvals page could wipe its own "flagged questions were skipped" message when it refreshed.
- Migration `20260930180000_auth_tokens_rate_limit` adds the auth-token and rate-limit tables, `passwordChangedAt` and `anonymisedAt`, and marks existing accounts verified. New dependency: `nodemailer`.

### Tests
- **Vitest: 202 passing** (was 159). Many run against the real database with throw-away accounts that are removed afterwards: token single-use and concurrent use, forgot/reset/verify endpoints end to end (link read from the console), rate limits per IP and per address, the database limiter across two connections and after a "restart", profile updates and audit content, full anonymisation, delete-route checks, trial and expiry logic, SMTP path, settings help text and Advanced grouping.
- **Playwright: 33 passing, three runs in a row** (28 + 5 new): forgot and reset with old-session and old-password checks, email confirmation with banner and resend, company trial and upgrade page, profile editing with audit check, account deletion with confirmation.
- `tsc` clean; `eslint` 0 errors (3 old warnings).

---

## Day 2, part 2: AI question generation and approval (done)

**Generate** (Platform admin > Question bank > Generate with AI): pick test (IQ, EQ, Language, Job skill), job role (Skill), language, difficulty, how many and an optional focus note. Claude writes the questions in batches (size set in Settings; the page sends one batch at a time with a progress bar, and batches already saved are kept if a later one fails). A second, separate Claude call reviews each batch for errors, ambiguity and bias and writes a verdict (OK / Needs fixing / Reject) and notes. Everything is saved **Pending** with the explanation and review notes; repeats of existing questions and anything failing the normal question rules are dropped. IQ and Skill get multiple choice; EQ gets situational-judgement and Likert items (split set in Settings); Language gets multiple choice and writing prompts, with the CEFR level taken from the difficulty (mapping in Settings).

**Approvals** (Platform admin > Approvals): the queue of pending questions with options, correct answer, explanation and the AI review. Approve, Edit (stays pending until approved), Reject (kept, marked Rejected, with an optional reason), and bulk approve. Bulk approve skips questions the AI review flagged (Needs fixing / Reject) unless "include flagged" is ticked. Approving records who and when.

**Urdu translation of the 50 IPIP items**: a panel on the Approvals page translates them in batches into any second language, saved as Pending and linked to the English original, keeping trait and reverse-keying, with a back-translation and an AI check of meaning and negation in the notes. Urdu shows right-to-left (a "Right-to-left" flag on each language, editable under Roles, regions & languages). **Not run yet**: it is one click on the Approvals page and costs roughly 10 cents.

**Settings** (Settings > AI generation, AI prompts): models (both `claude-sonnet-5-5`), thinking effort, reply length, batch size, maximum per run, EQ and Language mix, the four prices used for the cost estimate, all prompts (with their allowed placeholders checked on save), difficulty wording and the CEFR mapping. The key stays in `.env`.

**Logging**: every batch is an `AiRun` row and an audit-log entry (who, when, model, counts, tokens, estimated cost), failures included. AI endpoints are rate-limited per admin (30 calls per 15 minutes, in code).

**No key / no credit**: clear messages on the page and from the API (missing key, rejected key, no credit, rate limit, busy, unreachable, refusal, cut-off reply), never a crash. Checked for real with the key blanked.

### Live check (one small batch, as agreed)
5 IQ questions, medium, English: all 5 saved as Pending, 0 dropped, reviewed (4 OK, 1 Needs fixing), 3,233 input + 1,670 output tokens, estimated cost **$0.023**. I checked the answers of three by hand and they were right; the reviewer correctly flagged the one weak logic question. **These 5 are in your Approvals queue** so you can see what it produces; approve or reject them as you like.

### Notes and decisions
- `.env` has `ANTHROPIC_MODEL="claude-sonnet-5"` (older); the app uses the Settings value `claude-sonnet-5-5` and does not read that variable.
- Claude's own difficulty rating is stored as a note when it differs from the level you asked for; the level you asked for is what is saved.
- The language of a question is not machine-checked; the reviewer judges wording quality in the target language, and you do the final read for Urdu.
- Maximum questions per run is enforced by the page, not the server; the server limits each call to one batch and each admin to 30 calls per 15 minutes, which also bounds spend.
- New dependency: `@anthropic-ai/sdk`. Schema change: explanation, review notes and verdict, rejection reason, source, link to the AI run, link from a translation to its original, right-to-left flag, and the `AiRun` table (migration `20260930150000_ai_questions`).

### Tests
- **Vitest: 159 passing** (was 117). Claude is faked in every automated test, so they cost nothing: prompts filled from Settings, parsing and validation, cost maths, every error message, repeats dropped, review failure still saves, everything AI-made is Pending, failed runs logged, translation keeps trait and reverse-keying, bulk approve skips flagged, and the admin-only guard on every new route.
- **Playwright: 28 passing** (25 + 3 new: bulk approve and the flagged skip, reject with reason, single approve, edit returns to the queue, the generate page).
- `tsc` clean; `eslint` 0 errors (3 old warnings).

---

## Day 2, part 1: question bank (done)

Platform admin > **Question bank**: list, search and filter by test, job role, language, difficulty and status (pending, approved, retired, flagged); add, edit, retire and restore; import the 50 public-domain IPIP Big Five items (24 reverse-keyed, approved, English); coverage tables showing gaps against the pool targets. Manual questions are created Approved and record who approved them and when. Retiring never deletes.

## No-hardcoding audit and fix (done)

New permanent rule in CLAUDE.md ("No hardcoding"): nothing business-related is static; it lives in the database and is edited in the Platform admin panel; seed data only sets starting values; security rules stay in code.

### What was hardcoded and where it lives now

| Was hardcoded | Now | Edit it at (Platform admin) |
| --- | --- | --- |
| Job roles, regions, languages, region-to-language map | database (added active flags; default language) | Roles, regions & languages |
| **Cities** (free-text box on signup; list only in the seed) | `City` table; signup uses a region-filtered dropdown (company signup too) | Roles, regions & languages |
| Experience bands | `ExperienceBand` table | Roles, regions & languages |
| **Plans** (fixed BASIC/ADVANCED enum), prices, features | `Plan` (free-text name/code, active, order) + `PlanFeature` definitions; admins can add plans | Plans & subscriptions |
| Plan features (only two, checked nowhere) | on/off options and numeric limits: all candidates, exclusive Q1 access, AI search, ATS/API access, max shortlists, max job openings | Plans & subscriptions |
| Test settings (counts, time limit, retake days, SE stop rule) | `TestConfig`, now seeded for all five tests, no schema defaults | Test settings |
| Salary benchmarks | `SalaryBenchmark` (now keyed to experience bands); sample data in demo mode | Salary benchmarks |
| Pilot mode | `PilotConfig` | Pilot mode |
| Brand name (6 places), logo, colours | `branding` setting; one picked colour generates all shades; logo stored as a small image in the database | Settings > Branding |
| Homepage text and buttons | `homepage` setting | Settings > Homepage |
| Privacy policy text and version | `PolicyDocument`, versioned; signup records the current version | Privacy policy |
| Currency ("PKR", "en-PK") | `currency` setting (`formatMoney`) | Settings > Currency |
| Quartile cut-offs and the 30-candidate fallback | `quartiles` setting | Settings > Quartiles |
| Top-performer rule | `topPerformer` setting | Settings > Top performer |
| Uncalibrated-question defaults (a = 1, b = -1/0/+1) | `itemDefaults` setting; question edits no longer reset calibrated values | Settings > Question defaults |
| Recalibration and flagging thresholds | `selfLearning` setting | Settings > Self-learning |
| Pool targets behind red/amber in the question bank | `poolTargets` setting | Settings > Question pool targets |
| Email and in-app message wording | `MessageTemplate` (9 templates; fixed keys and placeholders, editable wording; sending arrives on Day 4) | Message templates |
| Text "(placeholder price)", default language "en" in the IPIP import | removed / uses the default language | - |

Kept in code on purpose (confirmed): security rules (rate limits, bcrypt, role checks, password length), product structure (the five test types, question formats, A-D keys, Likert 1-5, role menus, field maxima, page size) and question content (already in the database).

### Plan features drive access
Access checks must call `hasFeature`, `featureLimit` or `canAddMore` (`src/lib/planFeatures.ts`) with a plan's features, never compare a plan name or code. A test scans the source and fails if any file does. No plan, or a missing value, means no access (never "unlimited by accident"). Nothing in the app enforces the features yet because search, shortlists and job openings are not built; they will use these helpers.

### How it works
- Settings live in `SiteSetting` (one row per group), validated by zod. Definitions and starting values: `src/lib/settings/definitions.ts`; read with `getSetting()`. Starting values are written by the seed only when the row is missing, so re-seeding never overwrites admin edits.
- Every page now renders on demand (`dynamic = "force-dynamic"` in the root layout). The production build had been prerendering login, privacy and both signup pages, which would have frozen admin edits until the next build.
- Every admin write is audit-logged (settings log which group changed, never the values).
- Migration `20260930120000_no_hardcoding` keeps the two existing plans (name -> code, display name, starting values for the new features).

### Decisions for you
1. **Top-performer rule (decided):** Q1 in IQ, EQ, Language and Skill. Personality is excluded because it has no better or worse direction. It is a setting (Settings > Top performer); this is its starting value.
2. **Self-learning thresholds** (too easy above 90% correct, too hard below 10%, low discrimination below 0.3, bias gap above 0.2) and **pool targets** (Personality 50, EQ 30, IQ 40, Language 30, Skill 40) are my starting guesses, only the 200-response figure comes from CLAUDE.md. Tune them in Settings.
3. **Starting plan features:** Basic = all candidates, 25 shortlisted, 5 open job openings, no AI search, no ATS/API; Advanced = everything, unlimited. Edit under Plans.
4. **Courses and lessons** have tables but no screens yet; their admin screens arrive with the training module, per the rule.
5. Pilot mode saves the setting; enforcing it across signup and search is part of Day 6's security pass.

### Tests
- **Vitest: 117 passing** (was 65): settings definitions and validation, brand-colour shades, money format, plan features (incl. the no-plan-name scan), message templates, reference-data rules (default language, bands, benchmarks), test-settings and plan validation, and a check that every admin API handler starts with the platform-admin guard.
- **Playwright: 25 passing** (22 existing, with signup updated for the city dropdown, plus 3 new: branding change shows site-wide, add and delete a plan through the UI, cities on signup come from the admin list).
- Also checked by hand against the running app: every new admin screen loads; settings, plans, policy, templates, test settings, pilot, reference data and salary benchmarks save and validate; in-use items refuse deletion; a candidate account gets 403 on every admin route; signup records the current policy version and rejects a city outside the chosen region.
- `tsc --noEmit` clean; `eslint` 0 errors (3 pre-existing warnings).

### Note on ports
A dev server you had running on 7310 was stopped at your request earlier; the servers I started on 7310 and 7330 for checking were mine and are stopped again. Start the app with `npm run dev`.

---

## Day 1 write-up

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
- **Platform admin (19 after the no-hardcoding work, which added a Settings group: Settings, Privacy policy, Message templates):** Dashboard; Assessment content: Question bank, Approvals, Item analysis, Recalibration, Test settings; Business: Companies, Plans & subscriptions, Payments, Pilot mode; Platform: Courses, Salary benchmarks, Roles regions & languages, Users, Reports, Audit log

#### CLAUDE.md is the source of truth for modules
CLAUDE.md "User roles" was updated and modules 16-20 were added (job openings, contact requests, notifications, company settings, platform business tools). The navigation was then restored to match. Rules captured there: a contact request is only allowed if the offer meets the candidate's minimum salary; API keys and webhooks are company settings (company admin) while recruiters push candidates to the ATS; Payments is separate from Plans & subscriptions; AI feedback stays inside My results. Recruiters and candidates have no separate "AI feedback" or recruiter "Salary guide" page.

### Demo seed (`prisma/seedDemo.ts`, called from `prisma/seed.ts`)
- Runs only when `DEMO_MODE=true`; otherwise the seed behaves exactly as before.
- **Plans:** Basic (PKR 15,000/mo) and Advanced (PKR 40,000/mo). Plans are now created by the core seed and edited in Platform admin > Plans & subscriptions (see the no-hardcoding section above). **The prices are still placeholders.**
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

- **Rate limiting** is now stored in the database (see "Account gaps and fixes"), so it survives restarts and is shared between servers. It still trusts the first `x-forwarded-for` hop, so it needs a proxy that overwrites that header; behind one that appends, a caller could spoof IPs.
- The e2e suite gives each spec file its own fake IP for signups, and clears the stored rate limits before every run (`e2e/global-setup.ts`).
- The Playwright navigation tests need the demo seed to have been run first, like the existing tests need the reference data.
- Placeholder pages are placeholders: nothing behind them is wired to data yet except the four dashboards' summary numbers and the Recruiters page.
- The leftover "Test Co" companies and every old `@example.com` test user are deleted from the dev DB (3 companies, 0 test users). The e2e specs now clean up after themselves.
- A dev server was already running on port 7310 (not started by me) and was left untouched.

## Suggested next steps

1. Pick the first real module to build. Recommended order: assessment engine (question bank -> test session -> scoring), since recruiter search, shortlists and candidate results all depend on scores.
2. (Done) The rate limiter now uses the database.
