# Workforce Pro: Testing Checklist (Roman Urdu)

Yeh list aap (product manager) ke liye hai. Har row mein likha hai **kaun sa account**, **kahan click karna hai**, aur **kya nazar aana chahiye**. Result ke baad ek box tick karein: `[x] Pass` ya `[x] Fail`, aur **Notes** mein jo masla dikha woh likh dein (screen ka naam + kya hua).

**Kaise tick karein:** `[ ]` ko `[x]` bana dein. Ek row mein sirf Pass ya Fail tick hoga.

---

## 0. Reset the demo before testing (har testing round se pehle)

Yeh commands project folder `C:\Users\HP\Documents\workforce-pro` mein chalayein (PowerShell ya terminal).

| Step | Command | Kya hota hai |
|---|---|---|
| 1 | `docker compose up -d` | Database (port 55432) chalu. Pehle se chal raha ho to kuch nahi hota. |
| 2 | `npx prisma migrate deploy` | Database ke tables ko latest karta hai (agar kuch naya na ho to "No pending migrations"). |
| 3 | `npx prisma db seed` | Demo data poora karta hai: accounts, results, companies, job openings, shortlists, payments, ATS data, privacy policy ka naya version, aur jo kuch missing ho. Jo pehle se hai usay dobara nahi banata. |
| 4 | `npm run demo:reset` | Live demo wala hissa wapas laata hai: Sana (recruiter) ki Faisal ke liye shortlist/request hat jati hai, aur Ayesha ki "Waiting for you" request dobara aa jati hai. |
| 5 | `npm run dev` | App chalayein. Browser mein kholein: **http://localhost:7310** |

Zaruri baatein:
- **Port sirf 7310** (app). Port 3000 ya doosre ports kabhi nahi.
- **Database delete na karein** (`migrate reset` mat chalayein): us mein approved sawal hain jin ko banane mein paisa lagta hai.
- Email asal mein nahi jati. Jahan "link" ya "email" likha ho, woh **terminal (jahan `npm run dev` chal raha hai) mein print hota hai**. Wahan se link copy karein.
- Test ke dauran bani hui cheezein (naye candidates, naye companies) demo ko ganda kar sakti hain. Round ke baad dobara step 3 aur 4 chalayein.
- Ek hi browser mein do log ek saath login nahi ho sakte. **Alag browser, ya private/incognito window** use karein.
- Login ghalat password se 5 dafa karne par 15 minute ke liye band ho jata hai. Ghalat password ka test **sirf ek dafa** karein.

## Demo accounts (sab ka password: `Demo@12345`)

| Role | Email | Kaun hai |
|---|---|---|
| Platform admin | `demo.admin@demo.test` | Poora platform |
| Company admin (Advanced) | `companyadmin@demo.test` | Bilal Ahmed, Karachi Tech Solutions |
| Company admin (Basic) | `admin.lahore@demo.test` | Farah Naz, Lahore Retail Group |
| Recruiter (Advanced) | `recruiter@demo.test` | Sana Malik, Karachi Tech Solutions |
| Recruiter (Basic) | `recruiter.usman@demo.test` | Usman Ghani, Lahore Retail Group |
| Candidate | `candidate@demo.test` | Ayesha Khan, Accountant, Lahore. Language aur Job skill abhi dene baqi hain. |
| Candidate (Top Performer) | `faisal.chaudhry@demo.test` | Faisal Chaudhry, chaaron tests mein Q1 |

---

# PART 1: PLATFORM ADMIN (`demo.admin@demo.test`)

Login karein. Aap `/admin` par pohanchte hain. Menu ki tarteeb: Dashboard, Assessment content (Question bank, Approvals, Item analysis, Recalibration, Test settings), Business (Companies, Plans & subscriptions, Payments, Pilot mode), Platform (Courses, Salary benchmarks, Roles regions & languages, Users, Reports, Fairness report, Scheduled jobs, Audit log), Settings (Settings, Privacy policy, Message templates).

### A1. Dashboard

| # | Kya karein | Expected result | Pass | Fail | Notes |
|---|---|---|---|---|---|
| A1.1 | Login karein: `demo.admin@demo.test` / `Demo@12345` | "Welcome, Demo Platform Admin" nazar aata hai | [ ] | [ ] | |
| A1.2 | Upar ke numbers dekhein | Candidates, Companies (3), Recruiters (5), Active subscriptions (3), Hires. Koi number khali ya 0 nahi (Hires 0 nahi) | [ ] | [ ] | |
| A1.3 | Charts dekhein | "Candidates by city" aur "IQ: quartile distribution" bane hue hain | [ ] | [ ] | |
| A1.4 | Neeche module cards par "Question bank" card click karein | Question bank khulta hai | [ ] | [ ] | |

### A2. Question bank

| # | Kya karein | Expected result | Pass | Fail | Notes |
|---|---|---|---|---|---|
| A2.1 | Menu: **Question bank** | Sawalon ki list, upar buttons: Generate with AI, Approvals, Add question, Import IPIP | [ ] | [ ] | |
| A2.2 | Filter: Test = IQ, Status = Approved, **Apply filters** | Sirf approved IQ sawal dikhte hain | [ ] | [ ] | |
| A2.3 | **Clear** dabayen | Saare filter hat jate hain | [ ] | [ ] | |
| A2.4 | Neeche "Coverage and gaps" dekhein | Har test ka Approved / Pending / Total. Laal ya amber rang jahan sawal kam hain | [ ] | [ ] | |
| A2.5 | **Add question**: Test = IQ, format MCQ, sawal likhein, 4 options, option B "sahi" tick, **Add question** | Sawal list mein "Approved" ke saath aata hai; coverage mein IQ +1 | [ ] | [ ] | |
| A2.6 | Wohi sawal **Edit** karein, text badal kar **Save changes** | Naya text save hota hai | [ ] | [ ] | |
| A2.7 | Us sawal par **Retire** phir **Confirm retire** | Status "Retired" ho jata hai (sawal delete nahi hota) | [ ] | [ ] | |
| A2.8 | Retired sawal par **Restore** | Wapas Approved | [ ] | [ ] | |
| A2.9 | **Generate with AI** kholein (sirf dekhne ke liye; paise lagte hain, generate mat karein) | Form khulta hai: Test, Language, Difficulty, How many questions | [ ] | [ ] | |

### A3. Approvals

| # | Kya karein | Expected result | Pass | Fail | Notes |
|---|---|---|---|---|---|
| A3.1 | Menu: **Approvals** | Pending sawal cards: sawal, options, sahi jawab, AI review notes ("Needs fixing"/"Reject") | [ ] | [ ] | |
| A3.2 | Ek sawal par **Reject**, reason "test" likhein, **Confirm reject** | Sawal queue se chala jata hai | [ ] | [ ] | |
| A3.3 | Ek sawal par **Approve** | Queue se hat kar Question bank mein Approved | [ ] | [ ] | |
| A3.4 | "Select all on this page" tick karein, "Include questions flagged by the AI review" **tick na karein**, **Approve selected** | Flagged sawal chhod diye jate hain; message batata hai kitne chhode | [ ] | [ ] | |
| A3.5 | "Translate the personality items" panel dekhein (translate **na** karein) | Language chunne ka dropdown aur button nazar aata hai | [ ] | [ ] | |

### A4. Item analysis

| # | Kya karein | Expected result | Pass | Fail | Notes |
|---|---|---|---|---|---|
| A4.1 | Menu: **Item analysis**, view "Needs review" | 3 flagged sawal, har ke saath wajah (too easy / low discrimination / possible bias by gender) | [ ] | [ ] | |
| A4.2 | View "Pretest ready" | 2 sawal | [ ] | [ ] | |
| A4.3 | View "All with answers" | 36 sawal ki table: Answers, Correct, Discrimination, Difficulty, Bias gap | [ ] | [ ] | |
| A4.4 | "Needs review" mein ek sawal par **Keep it** | Woh list se hat jata hai | [ ] | [ ] | |
| A4.5 | "Pretest ready" mein ek sawal par **Make operational** | Sawal operational hota hai, list se hat jata hai | [ ] | [ ] | |

### A5. Recalibration

| # | Kya karein | Expected result | Pass | Fail | Notes |
|---|---|---|---|---|---|
| A5.1 | Menu: **Recalibration** | Description aur "Recalibrate now" button; neeche History table (kam az kam ek purani run) | [ ] | [ ] | |
| A5.2 | **Recalibrate now** | "Done." message; History mein nayi row, status Completed | [ ] | [ ] | |

### A6. Test settings

| # | Kya karein | Expected result | Pass | Fail | Notes |
|---|---|---|---|---|---|
| A6.1 | Menu: **Test settings** | 5 cards: Personality, EQ, IQ, Language, Skill | [ ] | [ ] | |
| A6.2 | IQ card: Time limit 15 se 12 karein, **Save** | "Saved." message; page refresh par 12 hi rahe | [ ] | [ ] | |
| A6.3 | IQ card: Minimum questions ko Maximum se bara karein, **Save** | Error aata hai, save nahi hota | [ ] | [ ] | |
| A6.4 | IQ ka time limit wapas purani value karein, **Save** | Saved | [ ] | [ ] | |

### A7. Companies

| # | Kya karein | Expected result | Pass | Fail | Notes |
|---|---|---|---|---|---|
| A7.1 | Menu: **Companies** | 3 companies: plan, recruiters, job openings, hires, joined | [ ] | [ ] | |
| A7.2 | "Karachi Tech Solutions" par click | Company page: Plan, openings, pipeline, hires, Team, Plan history, Payments | [ ] | [ ] | |
| A7.3 | **Give a plan** (company "Lahore Retail Group" par): plan = Advanced, din = 45, button dabayen | Plan history mein nayi row; company admin ko notification | [ ] | [ ] | |
| A7.4 | (Test ke baad) wapas Lahore ko Basic de dein ya seed dobara chalayein | Basic wapas | [ ] | [ ] | |

### A8. Plans & subscriptions

| # | Kya karein | Expected result | Pass | Fail | Notes |
|---|---|---|---|---|---|
| A8.1 | Menu: **Plans & subscriptions** | Basic aur Advanced ke cards: code, name, price, features (on/off), limits | [ ] | [ ] | |
| A8.2 | Basic ka price badlein, **Save**; phir `companyadmin@demo.test` ke Subscription page par dekhein | Naya price wahan nazar aata hai | [ ] | [ ] | |
| A8.3 | Price wapas purana karein | Saved | [ ] | [ ] | |
| A8.4 | "Plan features" section dekhein | Features ke naam aur description editable hain | [ ] | [ ] | |

### A9. Payments

| # | Kya karein | Expected result | Pass | Fail | Notes |
|---|---|---|---|---|---|
| A9.1 | Menu: **Payments** | Ledger: tareekh, kis ne di, kis ke liye, amount, status (Paid/Failed), provider "simulated" | [ ] | [ ] | |
| A9.2 | Filter: For = Subscriptions, Status = Failed | Sirf failed rows | [ ] | [ ] | |
| A9.3 | Upar ke numbers dekhein | Subscriptions collected, Courses collected, Paid, Failed: koi khali nahi | [ ] | [ ] | |

### A10. Pilot mode

| # | Kya karein | Expected result | Pass | Fail | Notes |
|---|---|---|---|---|---|
| A10.1 | Menu: **Pilot mode** | Checkbox "Pilot mode is on" aur company dropdown | [ ] | [ ] | |
| A10.2 | On karein, company = Karachi Tech Solutions, **Save** | Saved | [ ] | [ ] | |
| A10.3 | Doosre browser mein `recruiter.usman@demo.test` se login karein | Pilot ka paigham, login nahi hota | [ ] | [ ] | |
| A10.4 | Pilot **Off** karke Save; Usman dobara login karein | Login chalta hai | [ ] | [ ] | |

### A11. Courses

| # | Kya karein | Expected result | Pass | Fail | Notes |
|---|---|---|---|---|---|
| A11.1 | Menu: **Courses** | 14 courses ki table: price, role, helps with, lessons, learners, status | [ ] | [ ] | |
| A11.2 | Ek course ka naam click karein | Edit page: details aur lessons ki list | [ ] | [ ] | |
| A11.3 | "Add a course": title "Test course", Pricing = Free, **Create course**; phir 1 lesson add karein | Course aur lesson ban jate hain | [ ] | [ ] | |
| A11.4 | Us course ko **Active** hata kar Save (ya Delete course) | Candidate ke catalogue se ghayab | [ ] | [ ] | |

### A12. Salary benchmarks

| # | Kya karein | Expected result | Pass | Fail | Notes |
|---|---|---|---|---|---|
| A12.1 | Menu: **Salary benchmarks**; Job role = Accountant, City = Lahore, **Filter** | Rows: experience band ke hisaab se Minimum/Average/Maximum | [ ] | [ ] | |
| A12.2 | Ek row ka Average badal kar **Save** | Refresh ke baad naya number | [ ] | [ ] | |
| A12.3 | Minimum ko Maximum se bara karke Save | Error aata hai | [ ] | [ ] | |

### A13. Roles, regions & languages

| # | Kya karein | Expected result | Pass | Fail | Notes |
|---|---|---|---|---|---|
| A13.1 | Menu: **Roles, regions & languages** | 6 sections: Job roles, Regions, Cities, Languages, Region languages, Experience bands | [ ] | [ ] | |
| A13.2 | Cities mein naya city "Testville", Region koi bhi, Active, **Add** | Row ban jati hai | [ ] | [ ] | |
| A13.3 | Logout karke `/signup` kholein, wohi region chunein | City dropdown mein "Testville" nazar aata hai | [ ] | [ ] | |
| A13.4 | Admin mein wapas, "Testville" ko Active se hataein (ya Delete) | Signup dropdown se ghayab | [ ] | [ ] | |

### A14. Users

| # | Kya karein | Expected result | Pass | Fail | Notes |
|---|---|---|---|---|---|
| A14.1 | Menu: **Users**; Search = `usman` | `recruiter.usman@demo.test` ki row | [ ] | [ ] | |
| A14.2 | **Deactivate** | Status Inactive; us ki window mein koi bhi click login page par le jata hai | [ ] | [ ] | |
| A14.3 | **Activate** | Wapas Active, login chalta hai | [ ] | [ ] | |
| A14.4 | Filter: Role = Candidate | Sirf candidates, 25 per page, Previous/Next | [ ] | [ ] | |

### A15. Reports

| # | Kya karein | Expected result | Pass | Fail | Notes |
|---|---|---|---|---|---|
| A15.1 | Menu: **Reports** | Period buttons (30/90/180/365 days) aur numbers: Candidates, Companies, Hires, Revenue | [ ] | [ ] | |
| A15.2 | "Last 365 days" par click | Charts badal jate hain (hiring funnel, time to hire, revenue, quartile distribution) | [ ] | [ ] | |

### A16. Fairness report

| # | Kya karein | Expected result | Pass | Fail | Notes |
|---|---|---|---|---|---|
| A16.1 | Menu: **Fairness report** | Mahine ke buttons aur ek report; upar likha hota hai "Groups were flagged below an impact ratio of 0.8" | [ ] | [ ] | |
| A16.2 | Report mein 4 test sections (IQ, EQ, Language, Job skill): gender / region / language ki tables | Chhote groups "Too few to report" dikhate hain | [ ] | [ ] | |
| A16.3 | Settings > Self-learning mein "Fairness flag below this impact ratio" 0.9 karein, wapas Fairness report par "Make or refresh this month's report" | Report par ab 0.9 likha hota hai | [ ] | [ ] | |
| A16.4 | Value wapas 0.8 karein aur dobara report banayein | Report par 0.8 | [ ] | [ ] | |

### A17. Scheduled jobs

| # | Kya karein | Expected result | Pass | Fail | Notes |
|---|---|---|---|---|---|
| A17.1 | Menu: **Scheduled jobs** | 5 jobs: Recalibration, Fairness report, Test reminders, Plan expiry warnings, Webhook retries; har ke saath Run now aur akhri run | [ ] | [ ] | |
| A17.2 | "Webhook retries" par **Run now** | "Done."; "Recent runs" mein nayi row, status completed | [ ] | [ ] | |
| A17.3 | Page par likha ho ke scheduler on hai (JOBS_AUTORUN) | "on" ya "off" saaf likha hai | [ ] | [ ] | |

### A18. Audit log

| # | Kya karein | Expected result | Pass | Fail | Notes |
|---|---|---|---|---|---|
| A18.1 | Menu: **Audit log** | Entries: When, Who, What, About, Details | [ ] | [ ] | |
| A18.2 | Filter "What happened" = candidate profile viewed (recruiter ne dekha) | Sirf wohi entries | [ ] | [ ] | |
| A18.3 | Details column mein dekhein | Sirf ids aur field ke naam; password, salary ya jawab kahin nahi | [ ] | [ ] | |

### A19. Settings

| # | Kya karein | Expected result | Pass | Fail | Notes |
|---|---|---|---|---|---|
| A19.1 | Menu: **Settings** | Tabs: Branding, Homepage, Accounts & trials, Tests, Currency, Quartiles, Top Performer, Salary guide, Training, Recruiter tools, Billing, ATS and API, Question pool targets; neeche "Advanced settings" ke tabs | [ ] | [ ] | |
| A19.2 | Branding: Platform name "Test Brand" karein, **Save**; kisi bhi page par refresh | Header mein "Test Brand" | [ ] | [ ] | |
| A19.3 | Brand colour badlein, Save | Buttons naye rang mein | [ ] | [ ] | |
| A19.4 | Name aur colour wapas purane karein | Saved | [ ] | [ ] | |
| A19.5 | Homepage tab: Headline badlein, Save; logout, `/` kholein | Naya headline | [ ] | [ ] | |
| A19.6 | Headline wapas karein | Saved | [ ] | [ ] | |
| A19.7 | Recruiter tools tab: "Report period buttons (days)" = `7, 30` Save; kisi Reports page par dekhein | Sirf 7 aur 30 (aur current period) ke buttons | [ ] | [ ] | |
| A19.8 | Wapas `30, 90, 180, 365` karein | Saved | [ ] | [ ] | |
| A19.9 | Is tab mein "30, banana" likh kar Save | Error aata hai | [ ] | [ ] | |
| A19.10 | Advanced tabs mein har tab ek dafa kholein | Har tab khulta hai, har field ke neeche help line | [ ] | [ ] | |

### A20. Privacy policy

| # | Kya karein | Expected result | Pass | Fail | Notes |
|---|---|---|---|---|---|
| A20.1 | Menu: **Privacy policy** | "Published versions" table: 1.0, 1.1, 1.2 (Current) | [ ] | [ ] | |
| A20.2 | `/privacy` kholein | "Version 1.2" aur gender wali line: "Gender is optional..." | [ ] | [ ] | |

### A21. Message templates

| # | Kya karein | Expected result | Pass | Fail | Notes |
|---|---|---|---|---|---|
| A21.1 | Menu: **Message templates** | 21 cards: Subject, Message, allowed placeholders, enabled checkbox | [ ] | [ ] | |
| A21.2 | Ek template mein ghalat placeholder `{{nonsense}}` likh kar Save | Error aata hai | [ ] | [ ] | |
| A21.3 | Names dekhein: "Top Performer - email" aur "Top Performer - in-app" | Dono "Top Performer" (capital P) | [ ] | [ ] | |

---

# PART 2: COMPANY ADMIN (`companyadmin@demo.test`)

Menu: Dashboard, Recruiters, Job openings, Subscription & billing, Reports, ATS & webhooks, API keys, Notifications.

### B1. Dashboard

| # | Kya karein | Expected result | Pass | Fail | Notes |
|---|---|---|---|---|---|
| B1.1 | Login: `companyadmin@demo.test` | "Welcome, Bilal Ahmed". Stats: Company, Plan (Advanced), Active recruiters (2), Open job openings, Candidates in the pipeline | [ ] | [ ] | |
| B1.2 | Neeche charts dekhein | Hiring funnel, time to hire, activity chart bane hue | [ ] | [ ] | |

### B2. Recruiters

| # | Kya karein | Expected result | Pass | Fail | Notes |
|---|---|---|---|---|---|
| B2.1 | Menu: **Recruiters** | Sana Malik aur Hamza Qureshi, dono Active | [ ] | [ ] | |
| B2.2 | Name "Test Rec", email `testrec@demo.test`, **Add recruiter** | Ek box: "Share this temporary password..." (password copy karein) | [ ] | [ ] | |
| B2.3 | Logout; `testrec@demo.test` se us password se login | Seedha "Change password" page par jata hai | [ ] | [ ] | |
| B2.4 | Naya password rakhein | `/recruiter` dashboard khulta hai | [ ] | [ ] | |
| B2.5 | Company admin se wapas **Deactivate** (Test Rec par) | Us ki window mein agla click login page par | [ ] | [ ] | |

### B3. Job openings

| # | Kya karein | Expected result | Pass | Fail | Notes |
|---|---|---|---|---|---|
| B3.1 | Menu: **Job openings** | Company ki saari openings: Senior accountant, IT support engineer, Sales executive (Filled), created by, shortlisted, requests | [ ] | [ ] | |
| B3.2 | **New job opening**: role, title "Test opening", city, salary range, **highest salary** bharein, save | Nayi opening list mein | [ ] | [ ] | |
| B3.3 | Us par **Edit**, status = Closed, save | Status Closed | [ ] | [ ] | |
| B3.4 | Us par **Delete** | Delete ho jati hai (jis opening par shortlist ho woh delete nahi hoti, sirf Closed) | [ ] | [ ] | |

### B4. Subscription & billing

| # | Kya karein | Expected result | Pass | Fail | Notes |
|---|---|---|---|---|---|
| B4.1 | Menu: **Subscription & billing** | "Current plan" card (Advanced) aur dono plans ke cards | [ ] | [ ] | |
| B4.2 | Payments table dekhein | Company ki payment history | [ ] | [ ] | |
| B4.3 | `admin.lahore@demo.test` (Basic) se login karke "Upgrade to" Advanced dabayen | Checkout: plan price, credit, To pay now | [ ] | [ ] | |
| B4.4 | **Simulate a failed payment** | Error, plan Basic hi rahe, payment "Failed" likhi jaye | [ ] | [ ] | |
| B4.5 | Dobara **Pay** | "Your plan has been updated"; plan Advanced | [ ] | [ ] | |
| B4.6 | (Test ke baad) Platform admin se Lahore ko Basic de dein ya seed dobara chalayein | Basic wapas | [ ] | [ ] | |

### B5. Reports

| # | Kya karein | Expected result | Pass | Fail | Notes |
|---|---|---|---|---|---|
| B5.1 | Menu: **Reports** | Period buttons; numbers: shortlisted, hires, open openings, shortlist places used | [ ] | [ ] | |
| B5.2 | Charts aur "Recruiter activity" table | Har recruiter ki row: shortlisted, requests, hires | [ ] | [ ] | |

### B6. ATS & webhooks

| # | Kya karein | Expected result | Pass | Fail | Notes |
|---|---|---|---|---|---|
| B6.1 | Menu: **ATS & webhooks** | Ek webhook, "Delivery log" (kai Delivered (200) aur ek Failed), "Mock ATS" table mein candidates | [ ] | [ ] | |
| B6.2 | Webhook par **Send test** | Log mein "webhook.test: Delivered (200)" | [ ] | [ ] | |
| B6.3 | Failed row par **Resend** | Nayi koshish, result dikhta hai | [ ] | [ ] | |
| B6.4 | Naya webhook address `http://10.0.0.5/x` likh kar Add | Error: "points inside a private network" | [ ] | [ ] | |
| B6.5 | `admin.lahore@demo.test` (Basic) se yeh page kholein | Plan block ka paigham: plan mein "ATS and API access" chahiye | [ ] | [ ] | |

### B7. API keys

| # | Kya karein | Expected result | Pass | Fail | Notes |
|---|---|---|---|---|---|
| B7.1 | Menu: **API keys** | Ek key ki row: naam, shuru ke 8 harf, kab bani, last used | [ ] | [ ] | |
| B7.2 | Naya key "Test key" banayein | Poori key (`wfp_...`) sirf ek dafa dikhti hai; copy karein | [ ] | [ ] | |
| B7.3 | Terminal mein: `curl -H "Authorization: Bearer <key>" http://localhost:7310/api/v1/job-openings` | JSON jawab (200) | [ ] | [ ] | |
| B7.4 | **Revoke** karein, wohi curl dobara | 401 (Unauthorized) | [ ] | [ ] | |

### B8. Notifications

| # | Kya karein | Expected result | Pass | Fail | Notes |
|---|---|---|---|---|---|
| B8.1 | Menu: **Notifications** | List: title, text, waqt; sidebar mein unread count | [ ] | [ ] | |
| B8.2 | Ek par **Mark as read**; phir **Mark all as read** | Count kam hota hai, phir 0 | [ ] | [ ] | |

---

# PART 3: RECRUITER (`recruiter@demo.test`)

Pehle Reset section ka step 4 (`npm run demo:reset`) chalayein. Menu: Dashboard, Candidate search, Job openings, Shortlists, Contact requests, Reports, ATS export, Notifications.

### C1. Dashboard

| # | Kya karein | Expected result | Pass | Fail | Notes |
|---|---|---|---|---|---|
| C1.1 | Login: `recruiter@demo.test` | "Welcome, Sana Malik". Company (Karachi Tech Solutions, Advanced plan), Candidates matching your offers, In your pipeline, Requests waiting | [ ] | [ ] | |
| C1.2 | Hiring funnel, Time to hire, activity chart, matching candidates by city | Sab bane hue, khali nahi | [ ] | [ ] | |

### C2. Candidate search

| # | Kya karein | Expected result | Pass | Fail | Notes |
|---|---|---|---|---|---|
| C2.1 | Menu: **Candidate search** | Upar "Using your most recent open job opening: ... up to PKR ..." aur candidates ki list | [ ] | [ ] | |
| C2.2 | "Highest salary you can offer" = `40000`, **Search** | List chhoti ho jati hai (sirf wohi jin ki minimum 40,000 tak fit ho) | [ ] | [ ] | |
| C2.3 | **Clear** | Wapas poori list | [ ] | [ ] | |
| C2.4 | Job role = Accountant, City = Lahore, **Search** | Sirf Accountants jo Lahore mein hain | [ ] | [ ] | |
| C2.5 | "Q1 in all tests (Top Performers)" tick karke Search | Sirf "Top Performer" badge wale (Faisal Chaudhry upar) | [ ] | [ ] | |
| C2.6 | Sort by = Most experience | Sab se zyada experience wale upar | [ ] | [ ] | |
| C2.7 | AI search: `accountants in Karachi with at least 3 years of experience and strong IQ`, **Search with AI** | "AI understood: ..." box aur filters lagte hain (Claude key chahiye; key na ho to saaf paigham) | [ ] | [ ] | |
| C2.8 | AI search box ke upar example sentence dekhein | Example mein database ki role aur city ka naam hai | [ ] | [ ] | |
| C2.9 | `recruiter.usman@demo.test` (Basic) se search | Top Performers chhupe hue; "N Top Performer matches this search but is only open to plans with exclusive Q1 access"; AI search band | [ ] | [ ] | |

### C3. Candidate detail

| # | Kya karein | Expected result | Pass | Fail | Notes |
|---|---|---|---|---|---|
| C3.1 | Search se "Faisal Chaudhry" par click | Detail page: har test ka quartile aur "Better than X% of N candidates", CEFR, personality bars | [ ] | [ ] | |
| C3.2 | Page par phone, email, **minimum salary** dhoondein | Kahin nahi (phone/email sirf accept ke baad) | [ ] | [ ] | |
| C3.3 | **Download PDF report** | PDF download hoti hai | [ ] | [ ] | |
| C3.4 | Platform admin ka Audit log kholein | Is profile view ki entry maujood | [ ] | [ ] | |

### C4. Job openings

| # | Kya karein | Expected result | Pass | Fail | Notes |
|---|---|---|---|---|---|
| C4.1 | Menu: **Job openings** | Sana ki apni openings; upar "N open job openings in your company. Your plan has no limit." | [ ] | [ ] | |
| C4.2 | **New job opening** banayein, phir **Edit**, phir **Delete** | Teeno kaam karte hain | [ ] | [ ] | |
| C4.3 | `recruiter.usman@demo.test` (Basic) se limit tak openings banayein | Limit par error "Your plan allows 5 open job openings..." | [ ] | [ ] | |

### C5. Shortlists

| # | Kya karein | Expected result | Pass | Fail | Notes |
|---|---|---|---|---|---|
| C5.1 | Menu: **Shortlists** | Opening ke hisaab se candidates; upar pipeline summary (Shortlisted, Contacted, Interviewing, Offered, Hired, Rejected) | [ ] | [ ] | |
| C5.2 | Search mein Faisal Chaudhry ko "Job opening to shortlist for" = Senior accountant chun kar **Shortlist** karein | Shortlists mein aa jata hai | [ ] | [ ] | |
| C5.3 | Us ka stage Contacted, phir Interviewing karein | Stage badalta hai | [ ] | [ ] | |
| C5.4 | **Dates** kholein | Har stage ki tareekh | [ ] | [ ] | |
| C5.5 | **Remove** | Shortlist se hat jata hai | [ ] | [ ] | |

### C6. Contact requests

| # | Kya karein | Expected result | Pass | Fail | Notes |
|---|---|---|---|---|---|
| C6.1 | Menu: **Contact requests** | Purani requests: Waiting / Accepted / Declined; Accepted par candidate ka email aur phone | [ ] | [ ] | |
| C6.2 | Faisal Chaudhry ka detail page, opening = Senior accountant, message likhein, **Send contact request** | "Request sent. The candidate will see it under Recruiter requests." | [ ] | [ ] | |
| C6.3 | Contact requests page par dekhein | Faisal ki request "Waiting" | [ ] | [ ] | |
| C6.4 | (Faisal se accept karwa kar, dekhein Part 4 D7) | Request "Accepted", us ka phone aur email nazar aate hain; Notifications mein "accepted your contact request" | [ ] | [ ] | |
| C6.5 | Wohi request dobara bhejne ki koshish | Error: already requested | [ ] | [ ] | |

### C7. Reports

| # | Kya karein | Expected result | Pass | Fail | Notes |
|---|---|---|---|---|---|
| C7.1 | Menu: **Reports** | Period buttons, Shortlisted, Hired, Requests sent (kitni accepted), Open openings; funnel, time to hire, activity chart | [ ] | [ ] | |

### C8. ATS export

| # | Kya karein | Expected result | Pass | Fail | Notes |
|---|---|---|---|---|---|
| C8.1 | Menu: **ATS export** | Shortlisted candidates ki table; column "In the ATS" | [ ] | [ ] | |
| C8.2 | 2 candidates tick karke **Push to ATS** | "Pushed 2 candidates to the ATS"; "In the ATS" mein ATS id | [ ] | [ ] | |
| C8.3 | Wohi dobara push | Duplicate nahi banta, entry update hoti hai | [ ] | [ ] | |
| C8.4 | **Download CSV** aur **Download Excel** | Dono file khulti hain; minimum salary, phone, email nahi | [ ] | [ ] | |
| C8.5 | `companyadmin@demo.test` ke "ATS & webhooks" mein Mock ATS table | Push kiye hue candidates nazar aate hain | [ ] | [ ] | |

### C9. Notifications

| # | Kya karein | Expected result | Pass | Fail | Notes |
|---|---|---|---|---|---|
| C9.1 | Menu: **Notifications** | "Contact request accepted" waghera, unread count sidebar mein | [ ] | [ ] | |
| C9.2 | **Open** par click | Related page khulta hai | [ ] | [ ] | |

---

# PART 4: CANDIDATE (`candidate@demo.test`, aur Faisal)

Menu: Dashboard, My tests, My results, Badges, Salary guide, Training, Recruiter requests, Notifications, Profile & privacy.

### D1. Dashboard

| # | Kya karein | Expected result | Pass | Fail | Notes |
|---|---|---|---|---|---|
| D1.1 | Login: `candidate@demo.test` | "Welcome, Ayesha Khan"; Job role Accountant, Location Lahore, Experience 4 yrs, Minimum salary PKR 80,000 | [ ] | [ ] | |
| D1.2 | "Your results" box | Personality Done, IQ Q3, EQ Q2; unread notifications ka link | [ ] | [ ] | |

### D2. My tests

| # | Kya karein | Expected result | Pass | Fail | Notes |
|---|---|---|---|---|---|
| D2.1 | Menu: **My tests** | 5 cards: Personality, IQ, EQ Completed; Language aur Job skill "Not started" ke saath **Start** | [ ] | [ ] | |
| D2.2 | Language card: **Start** | "Before you start" page, "The timer starts as soon as you press the button" | [ ] | [ ] | |
| D2.3 | **Start the test**; 10+ sawal jawab dein | Har jawab ke baad agla sawal; progress dikhta hai; sahi jawab kahin nazar nahi aata | [ ] | [ ] | |
| D2.4 | Browser tab band karke dobara My tests kholein, **Resume** | Wohi test wahin se jaari | [ ] | [ ] | |
| D2.5 | Multiple choice ke baad "Writing task" aaye; 40+ lafz likhein, **Submit** | Test mukammal; result page (Claude key chahiye; na ho to "provisional") | [ ] | [ ] | |
| D2.6 | Job skill: **Start**, poora karein | Test mukammal, result page | [ ] | [ ] | |
| D2.7 | IQ card par "Take again" (agar wait period guzar chuka) ya message | "You can take it again on <tareekh>" ya Take again | [ ] | [ ] | |

### D3. My results

| # | Kya karein | Expected result | Pass | Fail | Notes |
|---|---|---|---|---|---|
| D3.1 | Menu: **My results** | Har test ka card: quartile, "Better than X% of N candidates", Questions answered correctly | [ ] | [ ] | |
| D3.2 | Personality card | 5 traits ki bars (Emotional Stability: higher means calmer); koi ranking nahi | [ ] | [ ] | |
| D3.3 | "Feedback and how to improve" | AI feedback aur 3 tips; neeche "Written by AI from your result. It is advice, not a hiring decision." | [ ] | [ ] | |
| D3.4 | Quartile ka text dekhein | "Quartile Q3 (Q1 is the highest group, Q4 the lowest)." | [ ] | [ ] | |
| D3.5 | **Download PDF report** | PDF khulti hai: results, traits, feedback, badge, salary guide | [ ] | [ ] | |

### D4. Badges

| # | Kya karein | Expected result | Pass | Fail | Notes |
|---|---|---|---|---|---|
| D4.1 | Menu: **Badges** | "Top Performer" card, "Not earned yet"; har test ke saamne Q-status ya "Take it" | [ ] | [ ] | |
| D4.2 | `faisal.chaudhry@demo.test` se Badges | "Top Performer" earned | [ ] | [ ] | |

### D5. Salary guide

| # | Kya karein | Expected result | Pass | Fail | Notes |
|---|---|---|---|---|---|
| D5.1 | Menu: **Salary guide** | "Suggested monthly range" (jaise PKR 65,000 to 82,000), market low/average/high bar | [ ] | [ ] | |
| D5.2 | "Your minimum salary" section | "You have set a minimum of PKR 80,000. That is inside the suggested range." | [ ] | [ ] | |
| D5.3 | Neeche disclaimer | "This is a guide, not an offer or a promise..." | [ ] | [ ] | |

### D6. Training

| # | Kya karein | Expected result | Pass | Fail | Notes |
|---|---|---|---|---|---|
| D6.1 | Menu: **Training** | "Recommended for you", "My courses", "All courses" | [ ] | [ ] | |
| D6.2 | Koi free course kholein, **Join this course** | Lessons khulte hain | [ ] | [ ] | |
| D6.3 | Lessons par **Mark as done** (sab) | Progress bar 100%, "You completed this course", notification | [ ] | [ ] | |
| D6.4 | Koi paid course: **Buy for PKR...** | Checkout page: order summary, Pay, Simulate a failed payment | [ ] | [ ] | |
| D6.5 | **Simulate a failed payment** | Error, course nahi milta; phir **Pay** par mil jata hai | [ ] | [ ] | |

### D7. Recruiter requests

| # | Kya karein | Expected result | Pass | Fail | Notes |
|---|---|---|---|---|---|
| D7.1 | Menu: **Recruiter requests** (Ayesha) | Islamabad Business Services ki request "Waiting for you" (**Accept** / **Decline**) aur Karachi ki "Accepted" | [ ] | [ ] | |
| D7.2 | Waiting request par **Accept** | Status Accepted; (recruiter.zainab ko notification) | [ ] | [ ] | |
| D7.3 | `faisal.chaudhry@demo.test` se Recruiter requests | Sana ki request (agar C6.2 kiya ho): company, role, message | [ ] | [ ] | |
| D7.4 | Faisal se **Accept** | Accepted; ab Sana ko Faisal ka phone/email nazar aata hai (C6.4) | [ ] | [ ] | |
| D7.5 | (Dobara test ke liye) `npm run demo:reset` | Ayesha ki request wapas "Waiting" | [ ] | [ ] | |

### D8. Notifications

| # | Kya karein | Expected result | Pass | Fail | Notes |
|---|---|---|---|---|---|
| D8.1 | Menu: **Notifications** | List; sidebar mein unread count (5 ke qareeb) | [ ] | [ ] | |
| D8.2 | **Mark all as read** | Count 0 | [ ] | [ ] | |

### D9. Profile & privacy

| # | Kya karein | Expected result | Pass | Fail | Notes |
|---|---|---|---|---|---|
| D9.1 | Menu: **Profile & privacy** | "Your details" form: name, phone, region, city, experience, job role, minimum salary, gender (optional) | [ ] | [ ] | |
| D9.2 | Minimum salary badal kar **Save changes** | "Saved (...)"; Dashboard par naya number | [ ] | [ ] | |
| D9.3 | Salary wapas 80000 karein | Saved | [ ] | [ ] | |
| D9.4 | "Your account": email aur "Confirmed" badge; "Change your password" link | Maujood | [ ] | [ ] | |
| D9.5 | Delete ka sirf **naye test account par** karein: **Delete my account**, DELETE type karein, password, confirm | Account anonymise ho jata hai, logout, recruiter search mein nazar nahi aata (**demo account par mat karein**) | [ ] | [ ] | |

---

# PART 5: PUBLIC PAGES (bina login; pehle logout karein)

| # | Kya karein | Expected result | Pass | Fail | Notes |
|---|---|---|---|---|---|
| E1 | `http://localhost:7310/` | Headline, sub-heading, 3 buttons: Log in, Candidate sign up, Company sign up | [ ] | [ ] | |
| E2 | `/signup`: sab fields bhar kar (consent tick) sign up | Account banta hai, seedha candidate dashboard; "confirm your email" banner; terminal mein confirmation link | [ ] | [ ] | |
| E3 | Gender dropdown dekhein | "Gender (optional)" aur neeche line: "Used only to check that the tests are fair... never shown to recruiters" | [ ] | [ ] | |
| E4 | `/signup/company`: company aur admin ki details, sign up | Company admin dashboard par "Free trial ... days left" | [ ] | [ ] | |
| E5 | `/login`: ghalat password (sirf ek dafa) | "Incorrect email or password." | [ ] | [ ] | |
| E6 | `/forgot-password`: apna email, **Send reset link** | "Check your email"; terminal mein link; link se naya password rakhein, login chalta hai | [ ] | [ ] | |
| E7 | Terminal ka email-confirmation link kholein | "Your email address is confirmed." + Continue; dashboard se banner ghayab | [ ] | [ ] | |
| E8 | `/privacy` | Version 1.2 aur poora text | [ ] | [ ] | |
| E9 | Candidate login ke baad `/admin` kholein | "Access denied" page | [ ] | [ ] | |
| E10 | Phone par (ya browser ko chhota karke) koi bhi page kholein | Koi cheez screen se bahar nahi jati, menu button kaam karta hai | [ ] | [ ] | |

---

# PART 6: End-to-end kahani (poora safar, ek dafa)

Waqt: lagbhag 60 se 90 minute (tests ki wajah se). Pehle Reset section ke **sab steps** chalayein. Teen browsers/windows tayyar rakhein.

| # | Kaun | Kya karein | Expected result | Pass | Fail | Notes |
|---|---|---|---|---|---|---|
| F1 | Platform admin | Roles, regions & languages mein Cities mein nayi city "Storyville" (Region = Punjab) add karein | City list mein | [ ] | [ ] | |
| F2 | Platform admin | Plans & subscriptions mein dekhein Basic aur Advanced theek hain | Prices aur features nazar aate hain | [ ] | [ ] | |
| F3 | Platform admin | Privacy policy: Version 1.2 current hai | `/privacy` par 1.2 | [ ] | [ ] | |
| F4 | Platform admin | Question bank coverage: Accountant (Job skill), IQ, EQ, Language mein approved sawal hain | Koi laal row nahi jis test ko aap lenge | [ ] | [ ] | |
| F5 | Nayi company | `/signup/company`: "Story Traders", city Storyville (ya koi), admin "Story Admin", email `story.admin@demo.test` | Company admin dashboard, Basic trial "Free trial ... days left" | [ ] | [ ] | |
| F6 | Platform admin | Companies mein "Story Traders" nazar aati hai; Dashboard par Companies +1 | Haan | [ ] | [ ] | |
| F7 | Company admin (Story) | Recruiters: "Story Rec", `story.rec@demo.test` add; temporary password copy | Password dikhta hai | [ ] | [ ] | |
| F8 | Recruiter (Story) | Login, Change password; phir Job openings: "Accountant" role, title "Story accountant", city Lahore, highest salary 150000 | Opening ban jati hai | [ ] | [ ] | |
| F9 | Naya candidate | `/signup`: naam "Story Candidate", email `story.candidate@demo.test`, region Punjab, city Lahore, job role Accountant, minimum salary 90000, consent | Candidate dashboard | [ ] | [ ] | |
| F10 | Naya candidate | Terminal ka confirmation link kholein | Email confirmed | [ ] | [ ] | |
| F11 | Naya candidate | My tests: Personality (50 sawal), IQ, EQ, Language (+ writing), Job skill: sab poore karein | Har test "Completed" | [ ] | [ ] | |
| F12 | Naya candidate | My results, Badges, Salary guide, Training dekhein | Har jagah data; salary guide mein range | [ ] | [ ] | |
| F13 | Recruiter (Story) | Candidate search: opening default; Job role = Accountant | "Story Candidate" list mein (minimum 90,000 offer 150,000 mein fit hai) | [ ] | [ ] | |
| F14 | Recruiter (Story) | Candidate ke naam par click; **Shortlist** (Story accountant) | Shortlists mein aata hai | [ ] | [ ] | |
| F15 | Recruiter (Story) | **Send contact request** | "Request sent" | [ ] | [ ] | |
| F16 | Recruiter (Story) | Search mein offer `50000` likhein | "Story Candidate" ab list mein nahi (minimum 90,000 se kam offer) | [ ] | [ ] | |
| F17 | Naya candidate | Recruiter requests: request dekhein, **Accept** | Accepted | [ ] | [ ] | |
| F18 | Recruiter (Story) | Contact requests: Accepted; candidate ka phone/email nazar aata hai; Notifications mein khabar | Haan | [ ] | [ ] | |
| F19 | Recruiter (Story) | Shortlists: stage Contacted, Interviewing, Offered, phir **Hired** | Har badlao ki tareekh Dates mein | [ ] | [ ] | |
| F20 | Company admin (Story) | Notifications: "hired" ki khabar; Reports mein Hires 1 | Haan | [ ] | [ ] | |
| F21 | Company admin (Story) | Subscription & billing: Advanced par "Upgrade to"; pehle **Simulate a failed payment**, phir **Pay** | Pehli bar failed (plan wahi), doosri bar plan Advanced | [ ] | [ ] | |
| F22 | Platform admin | Payments: dono payments (Failed aur Paid) "Story Traders" ke naam se | Ledger mein dono rows | [ ] | [ ] | |
| F23 | Platform admin | Audit log: recruiter ka candidate profile dekhna aur plan ka badalna | Dono entries maujood | [ ] | [ ] | |
| F24 | Platform admin | Users: story wale accounts maujood | Haan | [ ] | [ ] | |

**Test ke baad safai:** Reset section ke steps 3 aur 4 chalayein (`npx prisma db seed`, `npm run demo:reset`). Story wali company aur accounts demo mein reh jate hain; zaroorat ho to unhein Platform admin > Users se Deactivate kar dein.

---

## Natija ka khulasa

| Hissa | Total rows | Pass | Fail |
|---|---|---|---|
| Part 1: Platform admin | | | |
| Part 2: Company admin | | | |
| Part 3: Recruiter | | | |
| Part 4: Candidate | | | |
| Part 5: Public pages | | | |
| Part 6: End-to-end | | | |

Koi bhi Fail ho to **Notes** mein screen ka naam, aap ne kya click kiya, aur kya nazar aaya (agar ho sake to screenshot) likh dein, aur mujhe bhej dein.
