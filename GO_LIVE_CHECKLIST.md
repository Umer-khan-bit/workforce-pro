# Workforce Pro: go-live checklist (demo to production)

Use this list top to bottom. Tick each box only when you have checked it on the real server, not on your laptop. Items marked **(code)** need a developer; the rest are settings, accounts or screens.

> Rule of thumb: the demo is a separate copy. The cleanest way to go live is a **new, empty production database** (section 6), not a cleaned-up copy of the demo database.

---

## 1. Decide and gather (before any work)

- [ ] **Domain name** for the site (for example `app.yourcompany.com`) and who controls its DNS.
- [ ] **Payment gateway** chosen (PayFast, JazzCash or another) and a merchant account opened. Note the sandbox and the live keys.
- [ ] **Email sending account** (Brevo or another SMTP service) and a sender address on your own domain, for example `no-reply@yourcompany.com`.
- [ ] **Final privacy policy** text approved by your lawyer. (The text in the demo is a placeholder and says so.)
- [ ] **Real plan prices** and which features each plan includes.
- [ ] **Real salary benchmarks** (the demo ones are sample figures).
- [ ] **Who gets the first platform admin account** (a real person's work email, not a shared one).
- [ ] **Claude API account** with a spending limit you are happy with, and a key used only for this site.

---

## 2. Turn demo mode off

- [ ] `DEMO_MODE` is **not** `true` on the server. Remove the line or set it to `false`.
- [ ] After a restart, check these in the browser (all of them must be true):
  - [ ] Checkout does not offer "Simulate a failed payment".
  - [ ] ATS export says no ATS is set up (until you connect a real one), and there is no "Mock ATS" table.
  - [ ] The address `/api/mock-ats/receive` answers "Not found".
  - [ ] The webhook screen no longer suggests a `localhost` address.
- [ ] No demo account exists (see section 7).

What `DEMO_MODE` controls in the code: the simulated payment gateway, the built-in mock ATS and its webhook receiver, and the seed that creates demo accounts. With it off, a payment or an ATS push **fails on purpose** until the real connectors below are added. This is deliberate, so a live site can never "charge" anyone for free.

---

## 3. Real payment gateway (code)

- [ ] Add a provider class that implements `PaymentProvider` in `src/lib/payments/provider.ts` (one `charge` method) and return it from `getPaymentProvider` when the environment says so (add a `PAYMENT_PROVIDER` variable and list it in `.env.example`).
- [ ] Keep the rule that the amount charged comes from our database (plan price, course price), never from the browser.
- [ ] Decide what happens on a payment that is **pending** or comes back later (most local gateways confirm by a callback). The simulated gateway answers at once; a real one may not. Add a confirmation endpoint that checks the gateway's signature, with a role/secret check (the security test fails otherwise).
- [ ] Test in the gateway's **sandbox** first: one success, one decline, one cancelled checkout, a plan upgrade with credit, and a course purchase.
- [ ] Refunds: decide who does them (by hand in the gateway dashboard is fine to start) and how the Payments ledger shows them.
- [ ] Put the live gateway keys only in the server's `.env` (see section 5). Never in the code or the repository.
- [ ] Send a test receipt: confirm the company admin gets the payment notification.

## 4. Real ATS connector (only if a client needs one on day one)

- [ ] Add a class that implements `AtsConnector` in `src/lib/ats/connector.ts` and return it from `getAtsConnector`. Until then, CSV and Excel export, the REST API (`/api/v1`) and signed webhooks already work without it.
- [ ] Webhooks only accept `https` addresses and refuse private networks. Check a real customer address works from the Oracle server.

---

## 5. Server settings (`.env` on the server)

Copy `.env.example`, then fill in real values. **Never commit the real `.env`.**

| Variable | What to set |
|---|---|
| `DATABASE_URL` | The production database (strong password, not `workforce:workforce`). |
| `AUTH_SECRET` | A new random secret (`npx auth secret`). Never reuse the demo one. |
| `APP_BASE_URL` | The public address with `https://`, for example `https://app.yourcompany.com`. All emailed links use this, never the request's host. |
| `ANTHROPIC_API_KEY` | The production Claude key. `ANTHROPIC_MODEL` as chosen. |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM` | The email account. With these missing the app only logs emails, so nobody receives a reset link. |
| `CRON_SECRET` | Only if an outside scheduler calls `POST /api/jobs/run` (16+ characters). |
| `JOBS_AUTORUN` | `true` on **exactly one** server so scheduled jobs (reminders, plan warnings, recalibration, fairness report, webhook retries) run once, not twice. |
| `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD` | Only for the first seed (section 6). Remove them afterwards. |
| `DEMO_MODE` | Not set (section 2). |

- [ ] Email test: signup of a real address on the live site delivers the confirmation email, and "Forgot password" delivers a working link. Check the link starts with your real address.
- [ ] SPF and DKIM (and DMARC) records set for the sender domain so emails do not land in spam.
- [ ] Log in as the first platform admin, change the password, and confirm the "must change password" rule works.
- [ ] In Platform admin > **Settings**: brand name, logo and colour, homepage text, currency, quartile and Top Performer rules, trial length, pool targets. These are database values, not code.
- [ ] In Platform admin > **Message templates**: read every email once and edit the wording and sender details.

---

## 6. Oracle Cloud deployment

- [ ] Create the Oracle Cloud server (an Always Free Ampere or an AMD VM both work; 2 CPUs and 8 GB or more is comfortable for the app plus Postgres). Ubuntu LTS.
- [ ] Open only ports **80 and 443** in the Oracle security list and the server firewall. Do **not** expose the database port to the internet.
- [ ] Install Node.js (the same major version as your laptop), Docker or a native PostgreSQL, and a web server that handles HTTPS (Caddy or nginx).
- [ ] Point the domain at the server's public IP; get an HTTPS certificate (Caddy does it automatically; nginx with Let's Encrypt).
- [ ] The reverse proxy must pass the real `Host` and `X-Forwarded-For` headers (the rate limiter and the cross-site check read them) and send `X-Forwarded-Proto: https`.
- [ ] Copy the code (git clone), then: `npm ci`, `npx prisma migrate deploy` (never `migrate dev` in production), `npm run build`.
- [ ] Run the app with a process manager (systemd or pm2) so it restarts after a crash or reboot: `npm run start` listens on port 7310 here; set the proxy to forward to the port you choose. The port rules in `CLAUDE.md` are for your laptop only.
- [ ] First data: run the seed **without** `DEMO_MODE` and with `SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD`: `npx prisma db seed`. It creates the platform admin, the settings, cities, plans, message templates, experience bands and the 50 free personality items. It creates **no demo accounts**.
- [ ] Review what the seed created and replace the starting values: **plans and prices** (placeholders), **privacy policy** (placeholder), **salary benchmarks** (sample figures), job roles, regions, languages, cities.
- [ ] Questions: Platform admin > Question bank > **Generate with AI** for each test and job role, then approve in **Approvals**. Nothing goes live without an admin's approval. Check the coverage table shows no red rows for the roles you launch with.
- [ ] Translate the personality items (Approvals > Translate) if you offer Urdu.
- [ ] Courses: add your real training catalogue in Platform admin > Courses (the 14 demo courses are not created in production).

## 7. Removing demo data

If you ever must clean a database that held demo data instead of starting fresh, remove **all** of these, in this order, and then check each list is empty:

- [ ] All users with an email ending `@demo.test` (candidates, recruiters, company admins and `demo.admin@demo.test`).
- [ ] The three demo companies (Karachi Tech Solutions, Lahore Retail Group, Islamabad Business Services) with their subscriptions, payments, job openings, shortlists, contact requests, ATS exports and the mock ATS inbox, API keys, webhooks and deliveries.
- [ ] Demo test sessions, scores, badges, notifications, AI feedback, course enrolments and payments.
- [ ] The seeded item statistics, the demo recalibration run and the demo fairness reports.
- [ ] The audit-log rows that belong to demo users (keep real ones).
- [ ] Questions: the AI-written demo questions that were approved only for the demo.

Doing this by hand is error-prone, which is why a **fresh production database is strongly recommended**.

- [ ] Final check: Platform admin > **Users** lists only real people; > **Companies** is empty or real; > **Payments** has no `simulated` rows.
- [ ] Nobody can log in with the demo password `Demo@12345`. Try it with `demo.admin@demo.test`, `recruiter@demo.test` and `candidate@demo.test`; each must fail.

---

## 8. Backups and recovery

- [ ] Nightly database backup: `pg_dump` (custom format) to a file, copied **off the server** (Oracle Object Storage or another cloud). Keep at least 14 daily and 6 monthly copies.
- [ ] Encrypt the backups (they hold personal data) and restrict who can read them.
- [ ] **Restore test**: restore last night's backup into a scratch database and log in. A backup you have never restored is not a backup. Repeat every quarter.
- [ ] Back up the `.env` file securely (a password manager), separate from the database backup.
- [ ] Oracle boot-volume backup or snapshot before every deployment.
- [ ] Write down the recovery steps (new server, restore, `.env`, DNS) and who does them.

## 9. Security and privacy before opening the doors

- [ ] HTTPS everywhere; the site redirects `http` to `https`. HSTS is sent automatically once the site runs in production.
- [ ] Run `npm test`, `npx playwright test` and `npm run build` on the exact code you deploy. All green.
- [ ] The automatic security checks in `src/lib/security.test.ts` pass (every route has a role/key/secret check, every admin change is audited, no secrets in logs, every environment variable documented).
- [ ] Database port closed to the internet; the database user is not a superuser.
- [ ] Server updates on (unattended security updates) and a named person who applies them.
- [ ] Consent: the signup checkbox links to the final privacy policy; the version shown at signup is the current one.
- [ ] Data protection: decide how long you keep data, who answers a "delete my data" request (the candidate can already delete their own account; it anonymises them and keeps test statistics) and where it is written down.
- [ ] A monitoring check on the site address (uptime) and an alert to a real phone or email.
- [ ] Error logs go somewhere you can read, and **do not contain** passwords, tokens, salaries or test answers (the app never logs them; keep it that way in the proxy logs too).

## 10. Dependency advisories (recheck before each release)

- [ ] Run `npm audit --omit=dev` and read the result.
- [ ] **nodemailer**: on 6 Oct 2026 the installed version was 8.0.11, flagged by 8 advisories that apply up to version 10.0.5; version 10.0.15 was the latest on npm. See the status line at the end of this section for what was done, and recheck on every release. Our use is plain-text mail to one validated address; none of the vulnerable features (raw messages, file or web attachments, address lists) are used.
- [ ] **Prisma command-line tool** (`deepmerge-ts` through `@prisma/config`): a development and deploy tool, not part of the running site. Recheck when Prisma publishes a release that updates it. Do not run `npm audit fix --force` (it would downgrade Prisma).
- [ ] `next-auth` depends on `@auth/core`, which lists nodemailer as an optional dependency. We do not use Auth.js email sign-in, so that path is never run. Recheck when Auth.js v5 is released as stable.

## 11. Launch day

- [ ] Pilot mode (Platform admin > Pilot mode) **on** for the first client or team if you want a soft start; candidates and platform admins are not affected.
- [ ] One full run-through on the live site with a real test candidate and a real test company: sign up, confirm email, take a test, see the result, recruiter finds the candidate, contact request, accept, hire, payment through the real gateway.
- [ ] Scheduled jobs: Platform admin > **Scheduled jobs** shows the scheduler is on and each job has run once (use Run now).
- [ ] Tell support who to call, and keep this list for the next release.
