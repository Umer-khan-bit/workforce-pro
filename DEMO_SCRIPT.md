# Workforce Pro: 15-minute demo script

**Who this is for:** you, presenting to a client who hires people (an HR head, a business owner or a recruiting manager).
**The story in one line:** "Stop reading hundreds of CVs. Candidates take fair, short tests. We rank them. You only talk to the best ones, and only about offers they can accept."

---

## Before the client arrives (5 minutes, do this the day before and again 30 minutes before)

1. Start the database and the app: `docker compose up -d`, then `npm run dev`. Open **http://localhost:7310**.
2. Open **four browser windows or profiles** (or four private windows) so you can stay logged in as four people at the same time. Name them in your head: Candidate, Recruiter, Company admin, Platform admin.
3. All demo accounts use the password **`Demo@12345`**.

| Window | Email | Who they are |
|---|---|---|
| Candidate | `candidate@demo.test` | Ayesha Khan, accountant in Lahore, 4 years' experience |
| Candidate 2 | `faisal.chaudhry@demo.test` | Faisal Chaudhry, a "Top Performer" (use at step 5) |
| Recruiter | `recruiter@demo.test` | Sana Malik, recruiter at Karachi Tech Solutions (Advanced plan) |
| Company admin | `companyadmin@demo.test` | Bilal Ahmed, owner of the Karachi Tech Solutions account |
| Platform admin | `demo.admin@demo.test` | You: the person who runs the whole platform |

4. If you have a fresh database: run `npx prisma db seed` once. It rebuilds everything the demo needs (64 candidates with results, 3 companies, job openings, shortlists, payments, ATS activity, one request waiting for Ayesha).
5. Check that the **Claude key** is in `.env` (`ANTHROPIC_API_KEY`). Without it, the AI parts (AI search, new feedback) show a polite "not available" message. Everything else still works.
6. **Rehearsed it already?** A request can be answered only once, so put the live part back first: run `npm run demo:reset`. It removes Sana's shortlist entry and request for Faisal and sends Ayesha's waiting request again. Nothing else is touched.

---

## The 15 minutes

### Minute 0 to 1: The problem (no screen, or the home page at `/`)

**Say:** "Hiring today means a recruiter reads 200 CVs to find 10 people. CVs are not comparable, they are not checked, and good people get missed. We replace that first screening with four short tests, and we rank every candidate fairly."

**Show:** the home page (log out first). Point at the three buttons: Log in, Candidate sign up, Company sign up.

---

### Minute 1 to 4: The candidate's side (window: Candidate, Ayesha)

**Log in** as `candidate@demo.test`.

1. **Dashboard.** "This is Ayesha. She told us her job role, city, experience and her **minimum salary**. She has already taken three of the four tests."
2. **My tests** (left menu). "Four tests: Personality, IQ, EQ, Language and Job skill. Each takes 10 to 15 minutes. The IQ and the Job skill test are **adaptive**: the questions get harder or easier depending on her answers, so we measure her level in 10 to 20 questions instead of 100." Point at the "Start" buttons on Language and Job skill. (Do not take a test in the demo; it takes too long. If the client insists, take the Language test: it ends with a short writing task that the AI marks on a standard A1 to C2 scale.)
3. **My results.** "She sees her **quartile**: Q1 is the top 25%, Q4 the bottom. It always says how many candidates it is based on, so nobody is misled." Scroll to **Feedback and how to improve**. "The AI writes feedback and three practical tips. It only sees her result and job role. **It never sees her name, phone, email or salary.**" Click **Download PDF report** to show the report.
4. **Salary guide.** "From market data and her results, we suggest a fair salary range. She set a minimum of 80,000. That is inside the range."
5. **Training.** "For weak areas we recommend courses, free or paid. After finishing a course she can retake the test straight away."
6. **Recruiter requests.** "Here is a request waiting for her from another company. We will answer it in a moment. First, let us see the recruiter's side." (Leave it unanswered.)

**Say, as a bridge:** "Nothing here costs the candidate anything. Their reward is being seen by the right employers."

---

### Minute 4 to 9: The recruiter's side (window: Recruiter, Sana)

**Log in** as `recruiter@demo.test`.

1. **Dashboard.** "Sana's hiring funnel: how many candidates she shortlisted, contacted, interviewed, offered and hired, and how long hiring takes."
2. **Job openings.** "She has an open job: Senior accountant, with the highest salary she can offer: 120,000. **This number matters.** The system uses it to protect candidates."
3. **Candidate search.** "Only candidates whose minimum salary fits this offer are shown. She never sees what a candidate's minimum is. A candidate is never contacted about money they would refuse."
   - **Prove the rule (30 seconds):** in **Highest salary you can offer**, type `40000` and press **Search**. The list shrinks. Clear it again. Say: "With a smaller offer, fewer people qualify."
   - Tick **Q1 in all tests (Top Performers)** and press **Search**. "These are the candidates in the top 25% in every test. This is exclusive to the **Advanced plan**." (Sort order: best overall first. Faisal Chaudhry is near the top.)
   - **AI search.** Type: `accountants in Karachi with at least 3 years of experience and strong IQ` and press **Search with AI**. "She can just write what she wants. The AI turns it into filters and tells her exactly what it understood. The AI never decides who to hire; it only fills in the filters."
4. **Open a candidate** (click the name **Faisal Chaudhry**). "Every test, with the quartile and the percentile. Personality as five traits. But **no phone, no email, no minimum salary** until the candidate agrees." Mention: "Every time a recruiter opens a profile, it is written in an audit log. I will show you that at the end."
5. **Send the request.** Choose the opening **Senior accountant**, write "We would like to talk to you about this role." and press **Send contact request**. Also press **Shortlist** on his row (back in search) or the shortlist button on the page.
6. **Shortlists.** "Her shortlist, by job opening, with a stage for every person: Shortlisted, Contacted, Interviewing, Offered, Hired. Faisal moved to **Contacted** by himself when the request was sent."

---

### Minute 9 to 10: The candidate answers (window: Candidate 2, Faisal)

1. Log in as `faisal.chaudhry@demo.test` (a different window from Ayesha).
2. Open **Recruiter requests**. "He sees the company, the role and the message. His phone and email are still private." Press **Accept**.
3. Say: "He decides. That is the whole idea: both sides agree before anyone is contacted."

**Switch back to the Recruiter window.**

4. Open **Contact requests**. Faisal's request now says **Accepted**, and his phone and email are shown. "Now, and only now, she has his details." Also open **Notifications**: "She was told in the app, and by email."

---

### Minute 10 to 12: Pushing to the company's own system (Recruiter, then Company admin)

1. In the Recruiter window open **ATS export** (ATS means applicant tracking system, the software many companies already use). "Her shortlist can go straight to their own system with one click." Tick two candidates and press **Push to ATS**. "Or she can download it as CSV or Excel. Phone, email and minimum salary are never in the export."
2. Switch to the **Company admin** window (`companyadmin@demo.test`, Bilal).
3. **Dashboard.** "The company owner sees the whole company: openings, pipeline, plan."
4. **ATS & webhooks.** "Our built-in demo ATS. The two candidates just pushed are at the top of this table." Scroll to the **Delivery log**: "Every message we send to their systems is recorded: delivered, or failed with the reason, with a button to resend." (One failed delivery is there on purpose.)
5. **API keys.** "Their developers can also read the shortlist through a secure API with a key that is shown once and can be revoked."
6. **Reports.** "Charts: the hiring funnel, time to hire, candidates by city and by role."
7. **Subscription & billing.** "Two plans. Basic gives access to all candidates. **Advanced** adds exclusive access to the top performers, AI search and the ATS tools. Upgrading is a checkout with a payment gateway." (In the demo no real money moves; a button lets you simulate a failed payment.)

---

### Minute 12 to 15: The platform admin (window: Platform admin, you)

**Log in** as `demo.admin@demo.test`. "This is the owner's control room. **Nothing in the platform is fixed in code.** Prices, plans, test rules, wording, branding: everything is a setting."

1. **Dashboard.** "Candidates, companies, hires, and charts across the whole platform."
2. **Approvals.** "The AI writes test questions, a **second AI checks them**, but **a person must approve every question before a candidate sees it**. Some questions are waiting here, flagged by the checker."
3. **Item analysis.** "After candidates answer, the system measures every question. This one is too easy, this one does not separate strong from weak candidates, this one may favour one gender. **It flags them. It never deletes anything on its own. You decide: Keep, Retire.**"
4. **Fairness report.** "Every month, a report on whether the tests treat groups of candidates equally. Groups that are too small are hidden, so no individual can be identified."
5. **Settings** (quick). Open **Top Performer**. "Even the rule for who is a top performer is a setting." Open **Plans & subscriptions** to show prices. Do **not** change anything during the demo.
6. **Audit log.** Choose **What happened**: the recruiter profile views. "Here is Sana opening Faisal's profile a few minutes ago. Every admin change and every recruiter view is recorded. Nobody can edit it."
7. **Pilot mode** (one sentence). "To start small, we can restrict the whole platform to one company, and switch it on or off from here."

**Close (30 seconds):**
"To summarise: candidates get a fair, short assessment and feedback. Recruiters get a ranked, searchable pool and only talk to people who agree and whose salary fits. Companies connect it to their existing systems. And you control all the rules. **AI helps to score, rank and recommend. People make every hiring decision.**"
Then ask: "Which of your roles would you like to try first?"

---

## Questions the client often asks (short answers)

| Question | Answer |
|---|---|
| "Is it fair?" | Tests are checked for bias every month. Gender is optional and used only for that check. Recruiters never see it. |
| "Can candidates cheat?" | Tests have a server-side timer and a different question set each time (the adaptive test picks questions per answer). Answers are never sent to the browser. |
| "What does the AI see?" | Only a result and a job role. Never names, phone numbers, emails, cities or salaries. |
| "Where is our data?" | In your own PostgreSQL database, on your own server. Candidates can delete their account; personal data is erased and only anonymous test statistics stay. |
| "Can we add our own job roles and cities?" | Yes, in Platform admin > Roles, regions & languages. No developer needed. |
| "Is the payment real?" | Not in the demo. A real gateway (PayFast, JazzCash) is plugged in at go-live. See `GO_LIVE_CHECKLIST.md`. |
| "Can it work in Urdu?" | The tests, the writing task and the Personality items can be translated; the interface text is English today. |

## If something goes wrong

- **A page shows "Please log in again"**: someone used the same browser window for two people. Use separate windows.
- **Login says "too many attempts"**: wait 15 minutes, or use another demo account.
- **The AI says "not available"**: the Claude key is missing or out of credit. Carry on; say "this part needs our AI service, which is switched off in this environment".
- **Faisal's request was already answered** (you forgot to reset): run `npm run demo:reset`, or pick another Top Performer who has no request yet, for example **Shazia Kakar** (log in as `shazia.kakar@demo.test` to accept).
- **The numbers look different from this script**: the demo data is generated, and names near the top of a list can change if the seed is run with different settings. Pick any candidate marked **Top Performer**.
- **After the demo**: run `npm run demo:reset` to put the live part back for next time. Do not delete the database: it holds the approved test questions, which cost money to generate.
