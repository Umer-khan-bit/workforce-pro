# AI Engineer vacancy: poora end-to-end test (har role, har tab)

**Kahani:** "NeuralWorks" naam ki nayi company platform par aati hai, **AI Engineer** ki job dalti hai, do candidates (Ali aur Sara) test dete hain, recruiter dhoondta hai, Ali hire hota hai, Sara mana karti hai. Is ek kahani mein **chaaron roles ke saare tabs** test ho jate hain.

**Waqt:** 3–4 ghante (tests dena sab se lamba hissa hai)
**AI ka kharcha:** taqreeban 30–50 cents (sawal banana, AI feedback, AI search)

**Kaise use karein:** har line ke baad `[ ]` ko `[x]` banayein. Fail ho to Notes mein likh dein ke kya hua, aur step ka code (masalan **5.3**) aur screenshot bhej dein.

---

## 0. Tayyari (zaroori)

### 0.1 Backup (kal demo hai, is liye pehle backup)
Project folder mein terminal kholein aur ek ek line chalayein:
```
docker exec workforce-pro-postgres pg_dump -U workforce -Fc workforce_pro -f /tmp/demo_backup.dump
docker cp workforce-pro-postgres:/tmp/demo_backup.dump C:\Users\HP\Documents\demo_backup.dump
```
- [ ] `Documents` mein `demo_backup.dump` file aa gayi

### 0.2 App chalayein
```
docker compose up -d
npm run dev
```
- [ ] Terminal **khula aur nazar mein** rakhein: har email ka link yahin aata hai

### 0.3 Windows (har bande ki alag window: Chrome profiles, Edge, Firefox, Incognito)

| Window | Kaun | Login |
|---|---|---|
| **W1** | Platform admin (aap) | `demo.admin@demo.test` / `Demo@12345` |
| **W2** | Company admin: Hina | Step 2 mein banega |
| **W3** | Recruiter: Omar | Step 2 mein banega |
| **W4** | Candidate: Ali | Step 4 mein banega |
| **W5** | Candidate: Sara | Step 4 mein banega |

Naye accounts ka password: `Test@12345`

---

## 1. Admin platform tayyar karta hai (W1)

| # | Tab | Kya karein | Kya hona chahiye | Pass | Fail | Notes |
|---|---|---|---|---|---|---|
| 1.1 | Dashboard | Candidates, Companies, Hires ki ginti **likh lein** | Numbers aur 2 charts | [ ] | [ ] | |
| 1.2 | Roles, regions & languages → Job roles | Name `AI Engineer`, Description `Builds ML and LLM solutions`, Active ✔ → Add | Nayi row | [ ] | [ ] | |
| 1.3 | Roles, regions & languages → Cities | Karachi (Sindh) aur Lahore (Punjab) maujood aur Active hon | Dono hain | [ ] | [ ] | |
| 1.4 | Roles, regions & languages → Experience bands | Sirf dekhein | 0–1, 2–4, 5–9, 10+ | [ ] | [ ] | |
| 1.5 | Salary benchmarks | AI Engineer + **Karachi**: 0–1 `80000/120000/180000`, 2–4 `180000/280000/400000`, 5–9 `350000/500000/750000`, 10+ `600000/850000/1200000` | 4 rows save | [ ] | [ ] | |
| 1.6 | Salary benchmarks | AI Engineer + **Lahore**: wahi bands, ~10% kam | 4 rows save | [ ] | [ ] | |
| 1.7 | Salary benchmarks | Ghalti ka test: Min `300000`, Avg `200000`, Max `400000` → Add | Laal error "Salaries must run from minimum up to average up to maximum" | [ ] | [ ] | |
| 1.8 | Test settings | Job skill card sirf dekhein (min 10, max 20, 15 min) | 5 cards, kuch na badlein | [ ] | [ ] | |
| 1.9 | Question bank → Generate with AI | Test **Job skill**, Role **AI Engineer**, English, **Easy**, 15, Focus: `Python, machine learning basics, data preprocessing, model evaluation, LLMs, prompt engineering, MLOps` → Generate | Progress bar, "Saved as pending: ~15", cost dikhe | [ ] | [ ] | |
| 1.10 | Generate with AI | Wahi, **Medium** 15 | ~15 pending | [ ] | [ ] | |
| 1.11 | Generate with AI | Wahi, **Hard** 15 | ~15 pending | [ ] | [ ] | |
| 1.12 | Approvals | Filter Test = Job skill → Filter | AI Engineer ke ~45 cards, har ek par OK / Needs fixing / Reject | [ ] | [ ] | |
| 1.13 | Approvals | Ek **Needs fixing** sawal: review notes parhein → **Edit** → theek karke Save | Wapas queue mein (Pending) | [ ] | [ ] | |
| 1.14 | Approvals | Ek kamzor sawal: **Reject**, reason `test reject` → Confirm reject | Queue se hat jaye | [ ] | [ ] | |
| 1.15 | Approvals | **Select all on this page** ✔, "Include flagged" **✘** → **Approve selected** | Message: kitne approve hue aur kitne flagged chhode | [ ] | [ ] | |
| 1.16 | Approvals | Bache hue flagged sawal parh kar ek ek **Approve** ya Reject | Queue khaali (AI Engineer ki) | [ ] | [ ] | |
| 1.17 | Question bank | Filter: Job skill + AI Engineer + Approved → Apply | **30 ya zyada** sawal | [ ] | [ ] | |
| 1.18 | Question bank → Coverage | AI Engineer ki line | Laal nahi (30+ = peela ya saaf) | [ ] | [ ] | |
| 1.19 | Question bank → Add question | Job skill, MCQ, AI Engineer, Medium: `Which metric is best for an imbalanced classification problem?` A Accuracy, **B F1-score** ✔, C MSE, D R² → Add | Seedha **Approved** | [ ] | [ ] | |
| 1.20 | Question bank | Usi sawal par **Retire** → Confirm → phir **Restore** | Retired, phir Approved | [ ] | [ ] | |
| 1.21 | Question bank → Coverage | **EQ** line: English Approved **20+**? | Agar kam ho to 1.22 karein | [ ] | [ ] | |
| 1.22 | Generate with AI (sirf agar EQ kam ho) | EQ, English, 15 → Approvals mein approve | EQ 20+ | [ ] | [ ] | |
| 1.23 | Courses → Add a course | `AI Foundations`, role AI Engineer, helps with **Job skill**, **Free**, Active → Create; 2 lessons add karein (title, text, minutes) | Course + 2 lessons | [ ] | [ ] | |
| 1.24 | Courses → Add a course | `LLM Engineering Bootcamp`, AI Engineer, Job skill, **Paid 5000**, Active; 1 lesson | Paid course ban jaye | [ ] | [ ] | |
| 1.25 | Courses | Lesson ka **Up/Down** se order badlein | Order badal jaye | [ ] | [ ] | |
| 1.26 | Plans & subscriptions | Basic vs Advanced ke features dekhein (kuch na badlein) | Basic: Q1 ✘, AI search ✘, ATS ✘ | [ ] | [ ] | |
| 1.27 | Settings → Accounts & trials | Dekhein: nayi company kis plan aur kitne din trial | Basic, 14 din | [ ] | [ ] | |
| 1.28 | Message templates | "Recruiter request received - email" kholein, wording parhein (na badlein) | Subject, message, placeholders | [ ] | [ ] | |
| 1.29 | Privacy policy | Published versions | Current version nazar aaye | [ ] | [ ] | |

---

## 2. Nayi company "NeuralWorks" aati hai (W2 → W3)

| # | Tab | Kya karein | Kya hona chahiye | Pass | Fail | Notes |
|---|---|---|---|---|---|---|
| 2.1 | Home page | Login ke bagair `localhost:7310` | Headline + 3 buttons | [ ] | [ ] | |
| 2.2 | Company sign-up | Company `NeuralWorks`, City Karachi, Naam `Hina`, Email `hina@neuralworks.pk`, Password `Test@12345` → Sign up | Company admin dashboard: "Free trial of the Basic plan: 14 days left" | [ ] | [ ] | |
| 2.3 | Email confirm | Terminal mein `hina@neuralworks.pk` ka link → browser mein kholein | "Your email address is confirmed" | [ ] | [ ] | |
| 2.4 | Subscription & billing | Dekhein | Current plan Basic (trial), Advanced ka "Upgrade" option | [ ] | [ ] | |
| 2.5 | API keys | Kholein | Basic par mana: plan mein "ATS and API access" nahi | [ ] | [ ] | |
| 2.6 | ATS & webhooks | Kholein | Basic par mana / upgrade ka paigham | [ ] | [ ] | |
| 2.7 | Recruiters | Naam `Omar`, Email `omar@neuralworks.pk` → Add recruiter | **Temporary password** dikhe → copy kar lein | [ ] | [ ] | |
| 2.8 | W3: Login | Omar + temporary password | **Change password** page zabardasti aaye | [ ] | [ ] | |
| 2.9 | W3: Change password | Naya `Test@12345` | Recruiter dashboard | [ ] | [ ] | |
| 2.10 | W3: Email confirm | Terminal mein `omar@neuralworks.pk` ka link | Confirmed (iske bina contact nahi kar sakta) | [ ] | [ ] | |

---

## 3. Recruiter job dalta hai (W3 Omar)

| # | Tab | Kya karein | Kya hona chahiye | Pass | Fail | Notes |
|---|---|---|---|---|---|---|
| 3.1 | Job openings → New job opening | Title `AI Engineer`, Role **AI Engineer**, City Karachi, Salary **250000 – 450000**, Open → Save | Opening list mein, status Open; plan limit ka zikr (Basic: 5) | [ ] | [ ] | |
| 3.2 | Job openings → Edit | Description ya title mein kuch badlein → Save | Badlav save | [ ] | [ ] | |
| 3.3 | W2 Hina: Job openings | Company ki saari openings | AI Engineer, "created by Omar" | [ ] | [ ] | |
| 3.4 | W2 Hina: Notifications | Sidebar mein unread count | "New job opening" ki khabar → Mark as read | [ ] | [ ] | |

---

## 4. Do candidates aate hain aur test dete hain (W4 Ali, W5 Sara)

| # | Tab | Kya karein | Kya hona chahiye | Pass | Fail | Notes |
|---|---|---|---|---|---|---|
| 4.1 | Candidate sign-up (W4) | `Ali`, `ali@test.pk`, Sindh → **Karachi**, 3 saal, **AI Engineer**, minimum **300000**, consent ✔ | Candidate dashboard + peela banner | [ ] | [ ] | |
| 4.2 | Candidate sign-up (W5) | `Sara`, `sara.ai@test.pk`, Punjab → **Lahore**, 5 saal, **AI Engineer**, minimum **500000** (jaan boojh kar zyada), consent ✔ | Dashboard + banner | [ ] | [ ] | |
| 4.3 | My tests (W4, confirm se pehle) | Kholein | Har button "Confirm your email to start" | [ ] | [ ] | |
| 4.4 | Email confirm | Dono ke links terminal se kholein | Dono confirmed | [ ] | [ ] | |
| 4.5 | My tests | Dekhein | 5 cards, **koi "Not available yet" nahi** (EQ aur Job skill bhi) | [ ] | [ ] | |
| 4.6 | Ali → IQ | Start → 4–5 sawal → **browser band** → dobara login → My tests → **Resume** | Wahi sawal, wahi ghari se | [ ] | [ ] | |
| 4.7 | Ali → IQ | Poora karein, **sahi jawab** dene ki koshish | Result: Q1–Q4, 10–20 sawal mein ruka | [ ] | [ ] | |
| 4.8 | Ali → Job skill | Poora karein, achi koshish | **AI/ML ke sawal**, accounting ke nahi | [ ] | [ ] | |
| 4.9 | Ali → EQ, Language, Personality | Teeno dein (Language mein chhota essay) | Language mein CEFR level (A1–C2) | [ ] | [ ] | |
| 4.10 | Sara → IQ aur Job skill | Dein, **kuch ghalat** jawab jaan boojh kar | Ali se kam darja | [ ] | [ ] | |
| 4.11 | My results (Ali) | Kholein | Har test ka darja, "based on N candidates" (AI Engineer kam hain, is liye "all job roles") | [ ] | [ ] | |
| 4.12 | My results (Ali) | Neeche scroll | **AI feedback** + tips | [ ] | [ ] | |
| 4.13 | My results (Ali) | **Download PDF report** | PDF khule | [ ] | [ ] | |
| 4.14 | Badges (Ali) | Kholein | Har test ki progress; chaaron mein Q1 ho to badge | [ ] | [ ] | |
| 4.15 | Salary guide (Ali) | Kholein | Range step 1.5 ke Karachi 2–4 data ke aas paas; 300000 ka muqabla | [ ] | [ ] | |
| 4.16 | Training (Ali) | Kholein | Recommended mein AI Engineer ke courses | [ ] | [ ] | |
| 4.17 | Training → AI Foundations | **Join this course** → dono lessons complete | Progress 100%, notification "course completed" | [ ] | [ ] | |
| 4.18 | Training → LLM Engineering Bootcamp | **Buy** → **Simulate a failed payment** | Error, course nahi mila | [ ] | [ ] | |
| 4.19 | Wahi | Dobara → **Pay** | Course mil jaye | [ ] | [ ] | |
| 4.20 | My tests (Ali) | Job skill card | Retake ki tareekh (course ke baad jaldi retake ho sakta hai) | [ ] | [ ] | |
| 4.21 | Profile & privacy (Ali) | Phone badlein → Save | "Saved (phone updated)"; email "Confirmed" | [ ] | [ ] | |

---

## 5. Recruiter dhoondta hai, abhi BASIC plan par (W3 Omar)

| # | Tab | Kya karein | Kya hona chahiye | Pass | Fail | Notes |
|---|---|---|---|---|---|---|
| 5.1 | Candidate search | Job opening **AI Engineer**, Job role **AI Engineer** → Search | **Ali nazar aaye, Sara nahi** (500000 > 450000) | [ ] | [ ] | |
| 5.2 | Candidate search | Highest salary `550000` → Search | **Sara bhi** aa jaye | [ ] | [ ] | |
| 5.3 | Candidate search | Salary khali, **Q1 in all tests** ✔ | Basic par Top Performers band; sirf ginti ya upgrade ka paigham | [ ] | [ ] | |
| 5.4 | AI search | Kuch likh kar Search with AI | Basic par mana (plan feature) | [ ] | [ ] | |
| 5.5 | Candidate search → Ali | Naam par click | Report: darje, personality bars; **phone, email, salary nahi** | [ ] | [ ] | |
| 5.6 | Ali ki report | **Download PDF report** | PDF khule | [ ] | [ ] | |
| 5.7 | Ali ki report → Shortlist | AI Engineer → Shortlist | Shortlisted | [ ] | [ ] | |
| 5.8 | Ali ki report → Contact | AI Engineer, message `Hi Ali, we'd like to discuss our AI Engineer role` → **Send contact request** | "Request sent..." | [ ] | [ ] | |
| 5.9 | Job openings → Edit | AI Engineer ki salary max **550000** → Save | Save | [ ] | [ ] | |
| 5.10 | Candidate search | Opening AI Engineer → Sara ab nazar aaye → Sara ki report → Shortlist + **Send contact request** | Dono ho jayen | [ ] | [ ] | |
| 5.11 | Shortlists | AI Engineer tab | Ali aur Sara, stage **Contacted** | [ ] | [ ] | |
| 5.12 | Contact requests | Dekhein | Dono **Waiting**, contact "After they accept" | [ ] | [ ] | |

---

## 6. Candidates jawab dete hain

| # | Tab | Kya karein | Kya hona chahiye | Pass | Fail | Notes |
|---|---|---|---|---|---|---|
| 6.1 | W4 Ali → Notifications | Unread count | NeuralWorks ki khabar → Mark all as read | [ ] | [ ] | |
| 6.2 | W4 Ali → Recruiter requests | **Accept** | Accepted | [ ] | [ ] | |
| 6.3 | W5 Sara → Recruiter requests | **Decline** | Declined | [ ] | [ ] | |
| 6.4 | W3 Omar → Contact requests | Refresh | Ali **Accepted + email aur phone**; Sara **Declined, koi contact nahi** | [ ] | [ ] | |
| 6.5 | W3 Omar → Notifications | Dekhein | Dono jawabon ki khabar | [ ] | [ ] | |

---

## 7. Hiring pipeline (W3 Omar)

| # | Tab | Kya karein | Kya hona chahiye | Pass | Fail | Notes |
|---|---|---|---|---|---|---|
| 7.1 | Shortlists → Ali | Stage **Interviewing**; Note `Interview on 30 Oct` → Save note | Stage + note save | [ ] | [ ] | |
| 7.2 | Shortlists → Ali | **Offered**, phir **Hired** | Har stage ki tareekh "Dates" mein | [ ] | [ ] | |
| 7.3 | Shortlists → Sara | **Rejected** | Rejected | [ ] | [ ] | |
| 7.4 | Dashboard (Omar) | Kholein | Funnel mein shortlisted, contacted, hired | [ ] | [ ] | |
| 7.5 | Reports (Omar) | Period badlein | Charts badlein | [ ] | [ ] | |
| 7.6 | ATS export (Basic) | Kholein | Basic par mana / upgrade ka paigham | [ ] | [ ] | |
| 7.7 | W2 Hina → Notifications | Dekhein | "Ali hired" ki khabar | [ ] | [ ] | |

---

## 8. Company upgrade karti hai aur systems jodti hai (W2 Hina, W3 Omar)

| # | Tab | Kya karein | Kya hona chahiye | Pass | Fail | Notes |
|---|---|---|---|---|---|---|
| 8.1 | Subscription & billing | Advanced → Upgrade → **Simulate a failed payment** | Error, plan Basic hi; notification "payment failed" | [ ] | [ ] | |
| 8.2 | Wahi | Dobara → **Pay** | "Your plan has been updated", plan **Advanced**; payment history mein dono | [ ] | [ ] | |
| 8.3 | API keys | Label `HR system` → Create | Key **sirf ek dafa** dikhe (wfp_...); list mein sirf shuru ka hissa | [ ] | [ ] | |
| 8.4 | ATS & webhooks → Webhooks | Diya hua demo address (mock receiver) daal kar endpoint add → **Send test event** | Delivery log mein "Delivered" | [ ] | [ ] | |
| 8.5 | W3 Omar → Candidate search | **Q1 in all tests** ✔ | Ab Top Performers nazar aate hain (Advanced) | [ ] | [ ] | |
| 8.6 | W3 → AI search | `AI engineers in Karachi with at least 2 years of experience` → Search with AI | "AI understood: ..." aur Ali | [ ] | [ ] | |
| 8.7 | W3 → ATS export | Ali ✔ → **Push to ATS** | "Pushed 1 candidate", ATS id | [ ] | [ ] | |
| 8.8 | W3 → ATS export | **CSV** aur **Excel** download | File khole: naam, darje; **phone, email, salary NAHI** | [ ] | [ ] | |
| 8.9 | W2 → ATS & webhooks | Mock ATS table aur Delivery log | Ali ATS mein; events (shortlisted / hired / pushed) log mein | [ ] | [ ] | |
| 8.10 | W2 → API keys | Key **Revoke** | Status revoked | [ ] | [ ] | |
| 8.11 | W2 → Reports | Kholein | Company ke charts, hiring funnel mein hire | [ ] | [ ] | |
| 8.12 | W2 → Dashboard | Kholein | Plan Advanced, recruiters 1 | [ ] | [ ] | |

---

## 9. Admin nigrani karta hai (W1)

| # | Tab | Kya karein | Kya hona chahiye | Pass | Fail | Notes |
|---|---|---|---|---|---|---|
| 9.1 | Dashboard | 1.1 se milayein | Companies +1, Candidates +2, Hires +1 | [ ] | [ ] | |
| 9.2 | Companies → NeuralWorks | Kholein | Advanced, team (Hina, Omar), plan history (trial → Advanced), payments | [ ] | [ ] | |
| 9.3 | Payments | Dekhein | NeuralWorks: 1 Failed + 1 Paid; Ali ka course: 1 Failed + 1 Paid | [ ] | [ ] | |
| 9.4 | Users | Search `neuralworks` | Hina aur Omar | [ ] | [ ] | |
| 9.5 | Users → Omar | **Require new password** → W3 mein logout + login | Change password page aaye | [ ] | [ ] | |
| 9.6 | Users → Omar | **Deactivate** → W3 mein koi click | Login page; phir admin se **Activate** | [ ] | [ ] | |
| 9.7 | Audit log | Who: `omar` | Omar ne Ali aur Sara ki profiles kab dekhin | [ ] | [ ] | |
| 9.8 | Audit log | What happened: koi admin action (approve / course create) | Aap ke kaam darj | [ ] | [ ] | |
| 9.9 | Reports | "Candidates by job role" | **AI Engineer: 2** | [ ] | [ ] | |
| 9.10 | Question bank | AI Engineer ka jo sawal Ali ko aaya tha, **Edit** karne ki koshish | Band: "Retire it and add a new version" | [ ] | [ ] | |
| 9.11 | Item analysis → All with answers | Dekhein | AI Engineer ke sawal jawabon ke saath; flag nahi (200 jawab nahi) | [ ] | [ ] | |
| 9.12 | Recalibration | **Recalibrate now** | "Done.", History mein Completed | [ ] | [ ] | |
| 9.13 | Fairness report | Is mahine ki report → **Make or refresh** | Chhote groups "Too few to report" | [ ] | [ ] | |
| 9.14 | Scheduled jobs | **Test reminders** → Run now | Completed; jinke test baqi hain unko notification | [ ] | [ ] | |
| 9.15 | Scheduled jobs | **Webhook retries** → Run now | Completed | [ ] | [ ] | |
| 9.16 | Pilot mode | On + **NeuralWorks** → Save; doosri window mein `recruiter@demo.test` login | Pilot ka paigham, login band | [ ] | [ ] | |
| 9.17 | Pilot mode | **Off** → Save | Login phir chale | [ ] | [ ] | |
| 9.18 | Settings → Branding | Naam `Test Brand` → Save → kisi page par refresh | Header mein naya naam; **phir wapas** purana | [ ] | [ ] | |
| 9.19 | Settings → Advanced tabs | Har tab ek dafa kholein | Sab khulein, har field ke neeche help line | [ ] | [ ] | |

---

## 10. Account aur public pages

| # | Tab | Kya karein | Kya hona chahiye | Pass | Fail | Notes |
|---|---|---|---|---|---|---|
| 10.1 | Login | Sara ka **ghalat password** (sirf **ek** dafa) | "Incorrect email or password" | [ ] | [ ] | |
| 10.2 | Forgot password | Sara ka email → Send reset link | "Check your email"; link terminal mein | [ ] | [ ] | |
| 10.3 | Reset password | Link kholein → naya `Test@54321` | Login page; purana password fail, naya pass | [ ] | [ ] | |
| 10.4 | Access denied | Ali login ho kar address bar mein `localhost:7310/admin` | "Access denied" | [ ] | [ ] | |
| 10.5 | Privacy | `localhost:7310/privacy` | Current version ka text | [ ] | [ ] | |
| 10.6 | Profile & privacy (Sara) | **Delete my account** → `DELETE` + password → confirm | Logout; Sara ke email se login fail | [ ] | [ ] | |
| 10.7 | W3 Omar → Candidate search | Offer 550000, AI Engineer | **Sara nazar nahi aati** | [ ] | [ ] | |
| 10.8 | W1 → Users | Search `sara.ai` | Account anonymised / mila hi nahi | [ ] | [ ] | |

---

## 11. Testing ke baad: demo wapas lana (zaroori)

1. Terminal mein app band: **Ctrl + C**
2. Ek ek line chalayein:
```
docker cp C:\Users\HP\Documents\demo_backup.dump workforce-pro-postgres:/tmp/demo_backup.dump
docker exec workforce-pro-postgres pg_restore -U workforce -d workforce_pro --clean --if-exists /tmp/demo_backup.dump
npm run dev
```
- [ ] Admin → Companies: **sirf 3 demo companies** (NeuralWorks nahi)
- [ ] Admin → Item analysis: **3 flagged** sawal
- [ ] Ayesha → My tests: Language aur Job skill par **Start**

> Note: restore se AI Engineer ke sawal bhi hat jayenge. Unhein rakhna ho to backup **is test ke Step 1 ke baad** lein, Step 0 mein nahi.

---

## Kis step mein kaunsa tab test hua

| Role | Tab | Step |
|---|---|---|
| **Admin** | Dashboard | 1.1, 9.1 |
| | Question bank (+ Add, Edit, Retire/Restore, Coverage) | 1.17–1.21, 9.10 |
| | Generate with AI | 1.9–1.11, 1.22 |
| | Approvals | 1.12–1.16 |
| | Item analysis | 9.11 |
| | Recalibration | 9.12 |
| | Test settings | 1.8 |
| | Companies | 9.2 |
| | Plans & subscriptions | 1.26 |
| | Payments | 9.3 |
| | Pilot mode | 9.16–9.17 |
| | Courses | 1.23–1.25 |
| | Salary benchmarks | 1.5–1.7 |
| | Roles, regions & languages | 1.2–1.4 |
| | Users | 9.4–9.6, 10.8 |
| | Reports | 9.9 |
| | Fairness report | 9.13 |
| | Scheduled jobs | 9.14–9.15 |
| | Audit log | 9.7–9.8 |
| | Settings | 1.27, 9.18–9.19 |
| | Privacy policy | 1.29 |
| | Message templates | 1.28 |
| **Company admin** | Dashboard | 2.2, 8.12 |
| | Recruiters | 2.7 |
| | Job openings | 3.3 |
| | Subscription & billing | 2.4, 8.1–8.2 |
| | Reports | 8.11 |
| | ATS & webhooks | 2.6, 8.4, 8.9 |
| | API keys | 2.5, 8.3, 8.10 |
| | Notifications | 3.4, 7.7 |
| **Recruiter** | Dashboard | 7.4 |
| | Candidate search (+ AI search, filters) | 5.1–5.4, 8.5–8.6, 10.7 |
| | Candidate report (+ PDF, Shortlist, Contact) | 5.5–5.8, 5.10 |
| | Job openings | 3.1–3.2, 5.9 |
| | Shortlists | 5.11, 7.1–7.3 |
| | Contact requests | 5.12, 6.4 |
| | Reports | 7.5 |
| | ATS export | 7.6, 8.7–8.8 |
| | Notifications | 6.5 |
| **Candidate** | Dashboard | 4.1 |
| | My tests (+ resume, retake) | 4.3–4.10, 4.20 |
| | My results (+ AI feedback, PDF) | 4.11–4.13 |
| | Badges | 4.14 |
| | Salary guide | 4.15 |
| | Training (+ free, paid, failed payment) | 4.16–4.19 |
| | Recruiter requests (Accept, Decline) | 6.2–6.3 |
| | Notifications | 6.1 |
| | Profile & privacy (+ delete) | 4.21, 10.6 |
| **Public** | Home, Company/Candidate sign-up, Email confirm, Login, Forgot/Reset password, Privacy, Access denied, Change password | 2.1–2.3, 2.8–2.10, 4.1–4.4, 10.1–10.5 |
