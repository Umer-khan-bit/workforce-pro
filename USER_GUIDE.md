# Workforce Pro — User Guide (Guided Tour, Roman Urdu)

> Yeh guide 3 Oct 2026 tak ke code ko dekh kar likhi gayi hai (Day 1 se Day 5 tak + account fixes mukammal).
> **✅ Working** = abhi chalta hai. **⏳ Coming soon** = abhi sirf placeholder page hai (heading ke saath "Placeholder" badge aur "Coming in a later build" list), jis Day mein banega woh likha hai.
> Jahan build plan mein Day saaf nahi likha, wahan "andaza" likha hai.

---

## 0. Shuru karne se pehle

```bash
docker compose up -d        # Database (port 55432)
npm run dev                 # App → http://localhost:7310
```

**Demo accounts** — sab ka password: `Demo@12345`

| Role | Email | Company / Detail |
|---|---|---|
| Platform admin | `demo.admin@demo.test` | Poora platform |
| Company admin | `companyadmin@demo.test` | Karachi Tech Solutions (Advanced plan) |
| Company admin (Basic) | `admin.lahore@demo.test` | Lahore Retail Group (Basic plan) |
| Recruiter | `recruiter@demo.test` | Karachi Tech Solutions (Advanced) |
| Recruiter (Basic) | `recruiter.usman@demo.test` | Lahore Retail Group (Basic) |
| Candidate | `candidate@demo.test` | Ayesha Khan, Accountant, Lahore, 4 saal |

**Aam baatein jo har jagah lagti hain**
- Login ke baad system aap ka role dekh kar aap ko apne area mein bhejta hai. Kisi aur role ka URL kholen to **"Access denied"** page aata hai.
- Har role ki left side par **sidebar menu** hai (mobile par upar ☰ button se drawer khulta hai). Neeche aap ka naam, email aur **Log out**.
- Har Dashboard par upar kuch numbers (stats) aur neeche **har module ka ek card** hota hai — card par click = wohi page.
- Agar koi user deactivate ho jaye to uska **agla click hi** use login page par bhej deta hai.
- Email abhi (SMTP set nahi) asal mein nahi jati — **poori email aur link server console (terminal jahan `npm run dev` chal raha hai) mein print hoti hai.**
- Admin ka har save **audit log** mein jata hai (kis ne, kab, kya group — values nahi).

---

# ROLE 1 — PLATFORM ADMIN

**Login:** `demo.admin@demo.test` / `Demo@12345` → aap `/admin` (Admin Dashboard) par pohanchte hain.

Menu is tarteeb se hai (5 groups):
Dashboard → *Assessment content:* Question bank, Approvals, Item analysis, Recalibration, Test settings → *Business:* Companies, Plans & subscriptions, Payments, Pilot mode → *Platform:* Courses, Salary benchmarks, Roles regions & languages, Users, Reports, Audit log → *Settings:* Settings, Privacy policy, Message templates.

---

### 1.1 Dashboard ✅
- **Kis liye:** Platform ki sehat ek nazar mein.
- **Kya hai:** 4 numbers — **Candidates**, **Companies**, **Recruiters**, **Active subscriptions**. Neeche har module ka card.
- **Data kahan se:** seedha database se ginti. Koi candidate signup kare to Candidates barhta hai; company signup kare to Companies aur Active subscriptions (trial) barhte hain.
- **Quick test:** Numbers note karein → naye tab mein ek candidate signup karein → Dashboard refresh → **Candidates +1** hona chahiye (demo mein 64 → 65).

---

### 1.2 Question bank ✅
- **Kis liye:** Tamam test sawalon ki library — dekhna, dhoondna, add/edit/retire karna.

**Upar ke buttons**
| Button | Kya hota hai |
|---|---|
| **Generate with AI** | AI se sawal banwane wala page (1.2b) khulta hai |
| **Approvals (n)** | Approvals page; bracket mein pending sawalon ki tadaad |
| **Add question** | Naya sawal haath se likhne ka form (1.2a) |
| **Import IPIP Big Five (50 items)** | 50 muft personality sawal (English, approved) ek click mein daal deta hai. Message aata hai: "Imported X new item(s); Y already in the bank." Dobara dabayen to 0 new — duplicate nahi banta |

**Filters (section "All questions")**
- **Search** (sawal ka text ya topic), **Test** (Personality / EQ / IQ / Language / Skill), **Job role**, **Language**, **Difficulty** (Easy/Medium/Hard), **Status** (Pending / Approved / Retired / Flagged).
- **Apply filters** = list filter hoti hai. **Clear** = sab filter hat jate hain.
- **Table columns:** Question, Test, Role, Language, Difficulty, Status (AI ne flag kiya ho to laal "Flagged" badge).
- **Har row par:** **Edit** (form khulta hai) · **Retire** → **Confirm retire / Cancel** (sawal delete nahi hota, sirf test mein use band) · Retired sawal par **Restore**.
- **Previous / Next** — page badalna.

**"Coverage and gaps" tables**
- Har test ke liye Approved / Pending / Retired / Flagged / Total. Doosri table test × job role × language.
- **Laal** = ek bhi approved nahi, **Amber** = target se kam. Target **Settings → Question pool targets** se aata hai.

- **Data kahan jata hai:** Sirf **Approved** sawal hi aage candidate ke test mein aayenge (Day 3 test engine). Retired kabhi nahi aate.
- **Quick test:** Import IPIP dabayen → Status filter "Approved", Test "Personality" → 50 sawal dikhne chahiye; Coverage mein Personality ka Approved = 50 (target 50, to amber nahi).

#### 1.2a Add question / Edit question ✅
- **Fields:** **Test** · **Question format** (test ke hisaab se: MCQ, Likert 1–5, Situational judgement, Writing) · **Question text** (Writing ho to "Writing prompt") · **Answer options A–D** + radio "yeh sahi hai" (sirf MCQ / Situational) · **Job role** (Skill test ke liye zaroori) · **Language** (Language test ke liye zaroori) · **Difficulty** (sirf MCQ) · **Topic** (Personality mein "Trait") · **Explanation (optional)** · **Reverse-keyed** checkbox (sirf Likert — "zyada jawab = trait mein kam score") · AI se bana ho to **AI review notes** nazar aate hain.
- **Buttons:** **Add question** / **Save changes**, **Cancel**.
- **Save par:** Haath se naya sawal **seedha Approved** hota hai aur aap approver record hote hain. Pending sawal edit karein to woh **Pending hi rehta hai** jab tak approve na ho.
- **Quick test:** IQ, MCQ, 4 options, option B sahi → Add question → list mein Status "Approved" aur Coverage mein IQ Approved +1.

#### 1.2b Generate with AI ✅ (API key chahiye)
- **Fields:** **Test** (IQ / EQ / Language / Skill) · **Language** · **Job role** (Skill ke liye) · **Difficulty** (EQ mein nahi; Language mein yeh CEFR level ban jata hai) · **How many questions** (max Settings se) · **Focus (optional)** e.g. "month-end closing".
- **Generate button:** Claude batches mein sawal likhta hai (progress bar), phir ek alag Claude call har sawal ko review karti hai: **OK / Needs fixing / Reject**. Duplicate ya ghalat format wale nikal diye jate hain.
- **Result box:** Saved as pending · Left out · Estimated cost · Tokens used · **Open approvals** button.
- **Data kahan:** Sab kuch **Pending** mein → Approvals page. Har run ka record (AiRun + audit log). Model, batch size, prompts **Settings → Advanced** se aate hain.
- Agar `.env` mein key nahi → button band aur saaf message.
- **Quick test:** IQ, English, Medium, 2 sawal → Generate → "Saved as pending: 2", cost ~$0.01 → Approvals mein dono nazar aayein.

---

### 1.3 Approvals ✅
- **Kis liye:** AI (ya translation) se aaye Pending sawal check karke live karna.
- **Upar:** **Generate with AI**, **Question bank** buttons.
- **Filters:** **Test**, **Source** (AI / translation / manual etc.) → **Filter**, **Clear**.
- **Har sawal card par:** sawal, options, sahi jawab, Reverse-keyed badge, English original (translation ho to), Topic, **Explanation**, **Review notes** (AI verdict).
  - **Approve** → Approved ho kar question bank mein live.
  - **Edit** → form khulta hai, save ke baad wapas queue mein (pending).
  - **Reject** → "Reason (optional)" box → **Confirm reject / Cancel**. Sawal delete nahi hota, "Rejected" mark hota hai.
- **Bulk:** **Select all on this page** · **Include questions flagged by the AI review** · **Approve selected (n)**. Flagged sawal tab tak chhod diye jate hain jab tak checkbox tick na ho (message batata hai kitne chhode).
- **"Translate the personality items" panel:** **Translate into** (language chunein, e.g. Urdu) → **Translate N items**. 50 IPIP sawal Urdu mein bante hain (trait aur reverse-keying same), back-translation aur AI check notes ke saath, sab Pending. Kharcha ~10 cents. **Abhi tak chalaya nahi gaya.**
- **"Translations that need updating" panel (peela):** Jab kisi English sawal ka **naya version** banta hai to uske Urdu translations yahan aa jate hain: translation, "English was" aur "English now". Woh tab tak chalte rehte hain jab tak naye wording ka translation approve na ho (phir purana khud retire ho jata hai). **Translate** panel naye English version ko dobara translate kar deta hai; ya yahan **Retire this translation** dabayen.
- **Pehle se pade hue:** AI se bane Pending sawal (IQ, EQ, Language, Skill) — approve/reject aap ko karna hai.
- **Quick test:** Ek sawal Reject karein reason "test" ke saath → Question bank mein Status filter "Rejected"/Any par woh reason ke saath nazar aaye; ek aur Approve → Question bank mein Approved.

---

### 1.4 Item analysis ⏳ (Day 6 — self-learning)
- **Kis liye:** Jo sawal bohat aasan/mushkil, kamzor ya biased (gender/region/language) hon unki list, admin review ke liye. Khud delete kabhi nahi hote.
- **Abhi:** Placeholder. Thresholds pehle hi **Settings → Self-learning** mein set ho sakte hain.
- **Quick test:** Page khulta hai, "Placeholder" badge dikhta hai.

### 1.5 Recalibration ⏳ (Day 6)
- **Kis liye:** 200+ jawab wale sawalon ki difficulty dobara calculate karna (scheduled + manual button), pretest sawal.
- **Quick test:** Placeholder badge.

---

### 1.6 Test settings ✅
- **Kis liye:** Har test ke rules.
- **5 cards** (Personality, EQ, IQ, Language, Skill), har card mein:
  **Minimum questions** · **Maximum questions** · **Stop when SE below** · **Time limit (minutes)** · **Days before retake** · **Unscored pretest questions** → **Save** ("Saved." message).
- **Data kahan jata hai:** Day 3 ka test engine yahin se parhega — kitne sawal, kab rukna, kitna time, retake kab.
- **Status:** Save ✅, asar Day 3 ke baad dikhega.
- **Quick test:** IQ time limit 15 → 12 → Save → refresh → 12 hi rehna chahiye. Minimum > Maximum karke Save → error aana chahiye.

---

### 1.7 Companies ✅
- **Table:** Company, Plan (Trial/Active, kab tak), Recruiters, Job openings, Hires, Joined. Naam click = company page.
- **Company page:** Plan, open openings, pipeline, hires; **Give a plan** (plan + din → bina payment foran lagu; pilot ya goodwill ke liye, audit log mein); **Team** (admin aur recruiters), **Plan history**, **Payments**.
- **Quick test:** Kisi company par **Give plan** (Advanced, 45 din) → Plan history mein nayi row, company admin ko "is now on Advanced" notification.

### 1.8 Plans & subscriptions ✅
- **Kis liye:** Plans banana, price rakhna, har plan mein kya milega.
- **"Plans" section — har plan card:**
  **Code** (e.g. `basic`) · **Name** · **Price per month (PKR)** · **Display order** · **Description** · **Features:** on/off checkboxes (Access to all candidates, Exclusive access to Q1 scorers, AI plain-language search, ATS and API access) aur limits (Maximum shortlisted candidates, Maximum open job openings — **Unlimited** checkbox ya number) · **Active (companies can subscribe to it)** → **Save**. **Delete plan → Confirm delete** (agar koi company use kar rahi ho to mana karega).
  Neeche khali (dashed) card = **naya plan add**.
- **"Plan features" section:** har feature ka **naam** aur **Description** badal sakte hain → **Save**.
- **Data kahan jata hai:** Company admin ka **Subscription & billing** page yahi plans, prices aur features dikhata hai. Settings → Accounts & trials ka dropdown bhi yahi plans dikhata hai. Day 5 se recruiter ki search/shortlist limits inhi features se chalengi.
- **Abhi ki values:** Basic PKR 15,000 (all candidates, 25 shortlists, 5 openings), Advanced PKR 40,000 (sab kuch, unlimited). **Prices placeholder hain.**
- **Quick test:** Basic ka price 15000 → 18000 → Save → `companyadmin@demo.test` se login → Subscription & billing → Basic par 18,000 dikhe.

### 1.9 Payments ✅
- **Ledger:** har subscription aur course payment: tareekh, kis ne di (company ya candidate), kis ke liye, amount, status (Paid/Failed), provider (demo mein simulated), reference.
- **Upar ke numbers:** Subscriptions collected, Courses collected, Paid, Failed. **Filters:** For (Subscriptions/Courses), Status.
- **Quick test:** Company admin se checkout karwayen (success aur failure) → yahan dono rows.

### 1.10 Pilot mode ✅ (save hota hai, enforce Day 6 mein)
- **Kis liye:** Platform ko sirf ek company tak mehdood karna.
- **Fields:** **Pilot mode is on** checkbox · **Company allowed in during the pilot** dropdown → **Save**.
- **Abhi:** Setting save ho jati hai lekin signup/search par asar **Day 6** ke security pass mein aayega.
- **Quick test:** On + Karachi Tech Solutions → Save → refresh → dono cheezein wahi rahein.

---

### 1.11 Courses ✅
- **Kis liye:** Training catalogue: free/paid courses aur unke lessons.
- **Table:** Course, Price, Role, Helps with, Lessons, Learners, Status. Course ka naam click = edit page.
- **Add a course:** Title, Description, **Job role** (General = sab ko dikhe), **Helps with test** (recommendations aur "training ke baad retake" ke liye), **Pricing** (Free/Paid + price), **Active** → **Create course**.
- **Edit page:** details badal kar **Save course**; **Lessons**: **Add lesson** (title, text, minutes), **Up/Down** se order, **Edit**, **Delete** (jis lesson par candidates kaam shuru kar chuke hon woh delete nahi hota). **Delete course** do dafa poochta hai; jis course mein candidates hon woh delete nahi hota — **Active** hata kar chhupa dein.
- 14 starter courses demo mein pehle se hain (har test ke liye, aur har role ke liye ek free + ek paid).
- **Quick test:** Course banayen (Paid, 1500) → 2 lessons add karein → candidate se Training mein dikhe → Active hata dein → candidate ke catalogue se ghayab.

### 1.12 Salary benchmarks ✅
- **Kis liye:** Salary guide ke peeche ka data.
- **Filters:** **Job role**, **City** → **Filter**, **Clear**.
- **Table (har row editable):** **Job role** · **City** · **Experience** (band) · **Minimum** · **Average** · **Maximum** → **Save**, **Delete → Confirm**. Upar khali row = **naya benchmark add**.
- **Data kahan jata hai:** Day 4 mein candidate ka **Salary guide** yahin se range dikhayega. City aur Experience ki list **Roles, regions & languages** se aati hai.
- **Quick test:** Accountant + Lahore filter → ek row ka Average badlen → Save → refresh → naya number rahe. Min > Max karein → error.

### 1.13 Roles, regions & languages ✅
- **Kis liye:** Platform ki basic lists. Upar 6 links (ek hi page ke sections par le jate hain). Har section ek editable table hai: har row par **Save**, **Delete → Confirm delete**, aur upar khali row se **Add**. Jo cheez use ho rahi ho (e.g. city jis mein candidate hai) woh delete nahi hoti — error message.

| Section | Fields | Asar kahan |
|---|---|---|
| **Job roles** | Name, Description, Active | Candidate signup/profile ka "Job role" dropdown; Skill test ke sawal; Salary benchmarks; Question bank filters |
| **Regions** | Name, Active | Signup ka "Region" dropdown; region = language test |
| **Cities** | City, Region, Active | Candidate aur company signup ka "City" dropdown (region ke hisaab se filter) |
| **Languages** | Name, Code, Active, Default, Right-to-left | Question bank / Generate ki language list; Urdu RTL dikhta hai; translation panel |
| **Region languages** | Region, Language, Primary | Day 3 mein candidate ka language test is se decide hoga |
| **Experience bands** | Label, Min years, Max years (khali = 10+), Order | Salary benchmarks ka "Experience" |

- **Quick test (sab se acha):** Cities mein "Sukkur", Region "Sindh", Active → Add → logout → `/signup` → Region Sindh chunein → City dropdown mein **Sukkur** nazar aaye. Active uncheck karein → gayab ho jaye.

### 1.14 Users ✅
- **Filters:** Role, Status, Search (naam, email ya company). 25 per page.
- **Har row:** naam/email, role, company (link), status, "New password required", "Email not confirmed", joined.
- **Actions:** **Deactivate / Activate** (deactivate hote hi us ka agla click login par bhej deta hai), **Require new password** (agle login par password badalna paray ga). Apna account deactivate nahi ho sakta; aakhri active platform admin bhi nahi. Delete ho chuke candidate accounts par koi action nahi.
- **Quick test:** `recruiter.usman@demo.test` search karein → Deactivate → us ki window mein kisi page par click → login page; wapas Activate.

### 1.15 Reports ✅
- **Period:** Last 30/90/180/365 days.
- **Numbers:** Candidates (delete shuda shamil nahi), Companies, Hires (aur average time to hire), Revenue.
- **Charts:** hiring funnel, time to hire, shortlisted vs hired over time, revenue by month (subscriptions aur courses), companies by plan, new candidates, new companies, job openings by status, candidates by city, by job role, aur har test ka quartile distribution.
- Monthly fairness report abhi nahi (Day 6 ke bias analysis ke baad).

### 1.16 Audit log ⏳ (andaza Day 6 — log abhi bhi database mein likha ja raha hai, sirf screen nahi)
- **Kis liye:** Admin actions aur har recruiter ki candidate profile view ka searchable record.

---

### 1.17 Settings ✅
- **Kis liye:** Platform-wide values; save karte hi foran lagu. Upar group buttons (tabs); neeche "Advanced settings" warning box ke andar technical tabs. Har field ke neeche ek line help. Har tab ka apna **Save** ("Saved.").

**Normal tabs**
| Tab | Fields | Kahan asar |
|---|---|---|
| **Branding** | Platform name, Tagline, Brand colour (ek rang → saare shades khud; preview patti), Logo (PNG/JPEG/WebP/SVG ~150KB) | Har page ka header, browser tab, emails, buttons ka rang |
| **Homepage** | Headline, Sub-heading, Log in button, Candidate sign-up button, Company sign-up button | Home page (/) |
| **Accounts & trials** | Plan new companies start on (plans list ya "No plan"), Free trial length (days), Password reset link lasts (minutes), Email confirmation link lasts (hours) | Company signup ka trial; forgot-password aur verify-email links |
| **Currency** | Currency code (PKR), Number format (en-PK) | Har jagah paise ka format (plans, salary) |
| **Quartiles** | Q1 = top ...%, Q2, Q3, Minimum candidates in a job role (30) | Day 3 scoring |
| **Top performer** | Quartile needed (1), Tests that must all reach it (IQ, EQ, Language, Skill ticked) | Badge + email + notification (har result ke baad check) |
| **Salary guide** | Results kitna range hilate hain (%), Range ki chaurai (%), Q1–Q4 ke points, Kaun se tests ginay jayen, Round to, Disclaimer | Candidate ka Salary guide aur PDF report |
| **Training** | Kitne courses recommend hon, Weak area kis quartile se, Course ke baad foran retake (Yes/No) | Training recommendations aur retake |
| **Question pool targets** | Har test ka target number | Question bank ki laal/amber coverage |

**Advanced tabs** (sirf jab pata ho kya kar rahe hain)
| Tab | Fields | Asar |
|---|---|---|
| **Question defaults** | Discrimination (a), Easy/Medium/Hard difficulty (b) | Naye sawalon ki starting values (Day 3 adaptive test) |
| **Self-learning** | Answers needed before recalibrating (200), Too easy / Too hard rate, Low discrimination, Possible bias gap | Day 6 item analysis |
| **AI generation** | Writer model, Review model, Thinking effort, Max reply length, Questions per batch, Most questions in one run, EQ % situational, Language % writing, 4 prices (cost estimate ke liye) | Generate with AI page |
| **AI feedback** | Model, Thinking effort, Max reply length, Improvement tips per test, Feedback length (words) | Candidate ke result ka feedback aur course recommendations |
| **AI prompts** | Shared system prompt, har test ka instruction, review/translation prompts, **Candidate result feedback**, **Course recommendations** (har box ke neeche allowed placeholders) | Claude ko kya kaha jata hai |

- **Quick test:** Branding → rang badal kar Save → kisi bhi page par refresh → buttons naye rang mein. Homepage → Headline badlen → logout → home page par naya headline.

### 1.18 Privacy policy ✅
- **Kis liye:** Privacy policy ka naya version publish karna.
- **Fields:** **Title** · **New version number** · **Policy text** (paragraph ke beech khali line) → **Publish**. Message: "Published. It is now the version candidates accept at signup."
- **Neeche:** "Published versions" table — Version, Title, Published, Status (Current / Older).
- **Asar:** `/privacy` page par naya text; candidate signup par consent is version ke saath record hota hai.
- **Quick test:** Version 1.1 publish → `/privacy` kholen → "Version 1.1" aur naya text.

### 1.19 Message templates ✅
- **Kis liye:** Emails aur in-app alerts ki wording.
- **9 templates:** Password reset (email), Email confirmation (email), Top performer (email + in-app), Recruiter request received (email + in-app), Request accepted (in-app), Request declined (in-app), Test reminder (in-app).
- **Har card:** **Subject** · **Message** · allowed placeholders (e.g. `{{brandName}}`, `{{candidateName}}`) · **enabled** checkbox → **Save**. Ghalat placeholder par error.
- **Note:** Password reset aur email confirmation **hamesha** jati hain chahe off hon (taake koi lock na ho). Baqi templates Day 4–5 mein use honge.
- **Quick test:** Password reset ka Subject badlen → Save → logout → Forgot password → terminal mein email ka naya subject dikhe.

### 🧭 Platform admin — flow story
Admin pehle **Roles, regions & languages** mein job roles, cities aur region→language map set karta hai, **Settings** mein brand, currency, trial aur quartile rules, **Plans** mein Basic/Advanced ki price aur features, aur **Privacy policy** publish karta hai. Phir **Question bank** mein IPIP import karta hai, **Generate with AI** se IQ/EQ/Language/Skill sawal banwata hai, **Approvals** mein check karke live karta hai, aur **Coverage** dekhta hai ke kahan kami hai. **Test settings** se time/stop rules, **Salary benchmarks** se salary data. Day 5–6 ke baad yeh Reports, Item analysis, Recalibration aur Audit log se platform ko monitor karega.

---

# ROLE 2 — COMPANY ADMIN

**Login:** `companyadmin@demo.test` / `Demo@12345` → `/company-admin` (Dashboard). Basic plan dekhne ke liye `admin.lahore@demo.test`.

Menu: Dashboard → Recruiters → Job openings → Subscription & billing → Reports → ATS & webhooks → API keys → Notifications.

### 2.1 Dashboard ✅
- **Kis liye:** Company, plan aur team.
- **Plan callout (upar):** trial ho to "Free trial of the Basic plan: X days left (ends …)"; plan khatam ho to "Your plan has ended…"; plan na ho to "Your company has no plan yet…" + **Upgrade plan** button (→ Subscription & billing).
- **Stats:** **Company** (city ke saath), **Plan** (trial ho to din), **Active recruiters**. Neeche module cards.
- **Asar:** Plan ki info Platform admin ke Plans + Settings → Accounts & trials se aati hai.
- **Quick test:** Nayi company signup karein → dashboard par "Free trial … 14 days left" dikhe.

### 2.2 Recruiters ✅
- **Kis liye:** Apni company ke recruiters banana aur band karna.
- **Form:** **Name**, **Email** → **Add recruiter**. Kamyabi par ek box: "Share this temporary password with …" — yeh password recruiter ko dena hai. Recruiter ko confirmation email bhi jati hai (console).
- **Table:** Name, Email, Status (Active / Deactivated), **Deactivate** button.
- **Asar:** Naya recruiter jab pehli dafa login kare to use **Change password** page par zabardasti bheja jata hai. Deactivate karte hi uska session foran khatam — agla click login page. Dashboard ka "Active recruiters" aur admin dashboard ka "Recruiters" count badalta hai. Sirf apni company ke recruiters nazar aate hain.
- **Quick test:** "Test Rec", `testrec@demo.test` → Add → temporary password copy → logout → us se login → Change password page aaye → naya password → `/recruiter` dashboard. Wapas company admin → Deactivate → recruiter wali window mein click → login page.

### 2.3 Job openings ✅
- **Company ki saari openings** (kis ne banai, status, shortlisted, requests); **New job opening** (role, title, city, lowest salary, **highest salary jo aap de sakte hain**, status); **Edit**, **Delete** (jis opening par shortlist ya request ho woh delete nahi hoti — Closed kar dein).
- Upar likha hota hai plan ka limit ("2 of 5 open job openings used"). Limit sirf **Open** openings par lagta hai, poori company mein.
- **Quick test:** Basic company (`admin.lahore@demo.test`) mein limit tak openings banayen → agli par error "Your plan allows 5 open job openings...".

### 2.4 Subscription & billing ✅
- **"Current plan" card:** plan ka naam, trial/end date.
- **Plans:** har active plan — naam, price (per 30 din), features, aur button: **Choose / Upgrade to / Switch to / Renew** (saath mein jo abhi dena hai, ya "free").
- **Checkout:** order summary — plan price, **credit** (purane paid plan ka bacha hua waqt), **To pay now**, aur naya plan kab tak. Demo mein **Pay** ya **Simulate a failed payment** — koi asli paisa nahi. Fail hone par plan nahi badalta aur payment "Failed" likhi jati hai; dobara try kar sakte hain. Agar credit poori qeemat cover kar le (downgrade) to change free hai aur payment row nahi banti.
- **Payments:** is company ki payment history. Plan badalne par admins ko notification; plan khatam hone se 7 din pehle warning.
- **Asar:** Plans aur features sab admin ke **Plans & subscriptions** se.
- **Quick test:** `admin.lahore@demo.test` → Advanced par **Upgrade to** → pehle failed payment, phir Pay → "Your plan has been updated"; recruiter ab Top Performers aur AI search dekh sakta hai.

### 2.5 Reports ✅
- Period chunen (30/90/180/365 din). Numbers: shortlisted, hires (average days), open openings (plan limit ke saath), shortlist places used.
- Charts: hiring funnel (poori company), time to hire, shortlisted vs hired over time, openings by status, aur "Candidates that fit your company's offers" (city, role, quartiles).
- **Recruiter activity** table: har recruiter ne kitne shortlist kiye, requests bhejin, hires, open openings.

### 2.6 ATS & webhooks ⏳ (Day 6) — ATS connection (demo mein mock ATS), webhook endpoints, signing secret, delivery log.
### 2.7 API keys ⏳ (Day 6) — labelled keys (sirf ek dafa dikhengi, hashed save), last used, revoke.
### 2.8 Notifications ✅ — naya job opening, hire, plan change, failed payment, plan khatam hone wala; sidebar mein unread count, **Mark as read / Mark all as read**.

### 🧭 Company admin — flow story
Company **Company sign-up** se aati hai aur foran trial plan par hoti hai. Admin dashboard par trial ke din dekhta hai, **Recruiters** mein apni team add karta hai aur temporary password share karta hai; koi chala jaye to Deactivate. **Subscription & billing** mein plans compare karta hai (Day 5 se pay karke upgrade). Day 5–6 ke baad company-wide job openings, reports, ATS/webhooks aur API keys yahin se chalayega.

---

# ROLE 3 — RECRUITER

**Login:** `recruiter@demo.test` / `Demo@12345` → `/recruiter`. (Company admin ka banaya naya recruiter pehle **Change password** par jata hai.) Basic plan wala: `recruiter.usman@demo.test`.

Menu: Dashboard → Candidate search → Job openings → Shortlists → Contact requests → Reports → ATS export → Notifications.

### 3.1 Dashboard ✅ (ab charts ke saath: funnel, matching candidates by city)
- **Stats:** **Company** (city), **Company plan**, **Candidates on the platform**. Neeche module cards.
- Email confirm na ho to upar **"Please confirm your email address"** banner + **Send the link again**.
- **Quick test:** Candidate count platform admin dashboard ke "Candidates" ke barabar ho.

### 3.2 Candidate search ✅
- **Offer:** upar **Job opening** chunen ya **Highest salary you can offer** likhen. Sirf woh candidates nazar aate hain jin ki minimum salary is offer mein fit ho (jin ne minimum nahi likhi woh har offer mein). Offer ke baghair koi candidate nahi. Candidate ki minimum salary, phone aur email aap ko kabhi nahi dikhte (accept ke baad contact details).
- **Filters:** Job role, City, Experience (from/up to), har test (IQ, EQ, Language, Job skill) ka quartile (Q1 only / Q2 or better / Q3 or better), **Q1 in all tests (Top Performers)**. **Sort:** Best overall, Most experience, ya kisi ek test se. **Search / Clear**; neeche Previous/Next.
- **Plan features:** "Access to all candidates" ke baghair search band (wajah likhi hoti hai). **Top Performers** sirf "Exclusive access to Q1 scorers" wale plan ko; Basic ko "1 Top Performer matches this search but is only open to plans with exclusive Q1 access". **AI search** sirf is feature wale plan ko.
- **AI search:** likhen "accountants in Lahore with at least 3 years and strong IQ" → **Search with AI** → "AI understood: ..." (jo samajh na aaya woh bhi likha hota hai) → filters lag kar results.
- **Har row:** naam (detail link), role, city, experience, chaaron quartiles, Overall (average percentile), **Shortlist** (opening chun kar).
- **Candidate detail (naam par click):** har test ka quartile aur "Better than X% of N candidates", CEFR, personality bars, shortlist aur contact, **Download PDF report**. Har view audit log mein.
- **Quick test:** `recruiter@demo.test` (Advanced) → Candidate search: offer likhen 90000 → Job role Accountant + Q1 only IQ → ek candidate kholen → Shortlist → Download PDF report.

### 3.3 Job openings ✅
- Aap ki apni openings: **New job opening**, **Edit**, **Delete**; status Open / Paused / Filled / Closed. Limit plan se (Open openings, company-wide). **Highest salary** hi woh offer hai jis se candidates dikhte hain.

### 3.4 Shortlists ✅
- Opening ke hisaab se candidates. Upar **pipeline summary** (Shortlisted, Contacted, Interviewing, Offered, Hired, Rejected). Har candidate par: stage dropdown (har badlao ki tareekh), **note**, **Dates** (poori history), **Remove**.
- Contact request bhejte hi shortlisted candidate **Contacted** ho jata hai. **Hired** par company admin ko notification.
- Limit: plan ka "Maximum shortlisted candidates" (Hired/Rejected ginay nahi jate); limit par error batata hai kya karna hai.
- **Quick test:** Shortlists → ek candidate ko Contacted → Interviewing → Hired; **Dates** kholen.

### 3.5 Contact requests ✅
- Candidate detail se **Send contact request** (opening chun kar, message optional). **Server par** check hota hai: offer candidate ki minimum se kam ho to request nahi banti ("This candidate is not available"); Top Performer aur plan ke rules; email confirm.
- **Contact requests page:** Waiting / Accepted / Declined, bhejne aur jawab ki tareekh; **accept ke baad** hi candidate ka email aur phone.
- Candidate **Recruiter requests** mein Accept/Decline karta hai; aap ko notification.

### 3.6 Reports ✅
- Period chunen. Shortlisted, Hired, Requests sent (kitni accepted), Open openings; hiring funnel, time to hire, activity over time, aur "Candidates that fit your offers" (city, role, quartiles).

### 3.7 ATS export ⏳ (Day 6) — shortlisted candidates mock ATS mein push, CSV/Excel export (plan mein "ATS and API access" chahiye).
### 3.8 Notifications ✅ — contact request accept/decline; sidebar mein unread count.

### 🧭 Recruiter — flow story
Company admin recruiter banata hai → recruiter login karke password badalta hai → dashboard par company aur plan dekhta hai. Day 5 ke baad: **Candidate search** mein role/city/quartile se filter → acche candidates **Shortlist** → kisi **Job opening** ke liye offer ke saath **Contact request** → candidate accept kare to aage baat → Day 6 se **ATS export** se apne ATS mein bhej deta hai. Plan jitna bara, utne features (Q1 access, AI search, zyada shortlists).

---

# ROLE 4 — CANDIDATE

**Login:** `candidate@demo.test` / `Demo@12345` → `/candidate`. Naya candidate signup ke baad khud login ho kar yahin aata hai.

Menu: Dashboard → Assessments → My results → Badges → Salary guide → Training → Recruiter requests → Notifications → Profile & privacy.

### 4.1 Dashboard ✅
- **"Welcome, Naam"** + stats: **Job role**, **Location** (city, region), **Experience**, **Minimum salary**. Neeche module cards.
- Email confirm na ho to banner + **Send the link again** (15 min mein 3 dafa). Unconfirmed candidate test nahi de sakega (Day 3 se guard).
- **Quick test:** Profile mein salary badlen → Dashboard par naya number.

### 4.2 Assessments ⏳ (Day 3)
Personality (Big Five, 50 sawal), EQ, adaptive IQ, Language (region ke hisaab se, ek writing task CEFR A1–C2), Skill (apne job role ke sawal). 10–15 min, progress save, resume. Sawal sirf admin ke **Approved** bank se; rules admin ke **Test settings** se.
### 4.3 My results ✅
- **Har test ka card:** quartile (**Q1** = top 25%), "Better than 63% of 64 candidates (top 37%)" — hamesha likha hota hai kitne candidates par based hai (kam hon to warning), Language par **CEFR level**, Personality par 5 traits ki bars (Emotional Stability: high = calm; Personality ki ranking nahi hoti).
- **Feedback and how to improve:** AI likhta hai (pehli dafa kholne par "Writing your feedback…"), phir save ho jata hai — dobara paise nahi lagte. AI ko sirf test, result, job role, experience aur topic-wise accuracy bheji jati hai — **naam, email, phone, city, salary kabhi nahi**. AI available na ho to "Feedback is not available right now" + **Try again**.
- **Download PDF report** (upar) — saare results, traits, feedback, tips, badge, salary guide aur disclaimer ek PDF mein.
- Neeche **Test summary** aur **Test details and retake** links.
- **Quick test:** `candidate@demo.test` → My results → Personality, IQ, EQ ke cards (Language/Skill abhi liye nahi) → feedback aane tak intezar → **Download PDF report**.
### 4.4 Badges ✅
- **Top Performer:** IQ, EQ, Language aur Skill chaaron mein Q1 (admin Settings > Top performer se badal sakta hai). Har test ke saamne "Q1 - reached" / "Q3 - not there yet" / "Not taken yet" aur link.
- Jis lamhe rule poora hota hai (har result save hone ke baad check): badge + **recognition email** + **in-app notification**. Badge ek dafa milta hai aur rehta hai.
- **Demo mein:** 7 seeded candidates ke paas badge hai. Apna test: ek naya candidate signup karke (ya admin Settings mein rule dheela karke) dekhein.
### 4.5 Salary guide ✅
- **Suggested monthly range** (e.g. PKR 70,000 to PKR 90,000) + bar jo market low / average / high dikhati hai.
- **Kaise bana:** aap ke role + city + experience band ka benchmark (city na ho to sab shehron ka average — likha hota hai), phir aap ke quartiles (Q1 = upar, Q4 = neeche) range ko upar/neeche khisakate hain. Sab numbers admin ki **Settings > Salary guide** se.
- **Your minimum salary:** aap ki minimum range ke neeche / andar / upar — recruiters sirf woh offers dekh/bhej sakte hain jo aap ki minimum ke barabar ya zyada hon.
- Profile adhoori ho to "Complete your profile" (job role, city, experience chahiye). Neeche disclaimer.
### 4.6 Training ✅
- **Recommended for you:** weak areas (Q3/Q4 wale tests) ke hisaab se AI courses chunta hai aur wajah likhta hai (AI na chale to simple rules). Naye result ke baad khud refresh hota hai; **Refresh** button bhi hai.
- **My courses:** progress bar (% done), "Completed", aur "Retake your … test" link.
- **All courses:** sirf General aur aap ke apne job role ke courses (aur jo aap ne abhi join nahi kiye).
- **Course page:** free → **Join this course**; paid → **Buy for PKR …** → **Checkout**: order summary, **Pay** ya (demo mein) **Simulate a failed payment** — koi asli paisa nahi. Fail hone par course nahi milta aur dobara try kar sakte hain; payment ledger mein (Success/Failed) likha jata hai. Join ke baad lessons khulte hain: har lesson kholen, **Mark as done**; aakhri lesson par "You completed this course" + notification.
- **Training ke baad retake:** jis test ke course ko aap ne **apne aakhri attempt ke baad** mukammal kiya, woh test intezar ke baghair dobara de sakte hain (admin Settings > Training se band bhi kar sakta hai).
- **Quick test:** Training → koi free course Join → 2 lessons done → Notifications mein "You joined …" aur "You completed …"; phir paid course → Checkout → "Simulate a failed payment" (error) → **Pay** (lessons khul jayen).
### 4.7 Recruiter requests ✅ (recruiter ki taraf ka screen Day 5)
- Recruiter ki request yahan aati hai: company, role/city, message, **Waiting for you**. **Accept** / **Decline** (ek hi dafa). Aap ka phone/email accept se pehle private rehta hai, aur aap ki minimum salary recruiter ko kabhi nahi dikhti.
- **Salary rule server par:** recruiter ki opening ki top salary aap ki minimum se kam ho to request ban hi nahi sakti (wohi jawab jo "candidate nahi mila" ka hota hai, taake koi minimum andaza na laga sake).
### 4.8 Notifications ✅
- Sidebar mein unread count. List: title, text, waqt, **Open** (related page), **Mark as read**, **Mark all as read**. Email wali notifications alag record hoti hain, list mein nahi.
- Kab aati hain: Top Performer badge, course join/complete, course recommendation, recruiter request, test reminder (demo mein 2 Ayesha ke liye).

### 4.9 Profile & privacy ✅
**"Your details"**
- **Fields:** Full name · Phone · Region · City (region ke hisaab se filter) · Years of experience · Job role · **Minimum expected salary per month (PKR)** ("Recruiters can only contact you with an offer at or above this amount") → **Save changes**.
- **Save par:** "Saved (name, phone updated)." ya "Nothing changed." Audit log mein sirf **field ke naam** jate hain, values nahi. Region/city/role ki lists admin ke **Roles, regions & languages** se.
- **Asar:** Dashboard stats; Day 5 se recruiter search aur minimum-salary check.

**"Your account"**
- Email + **Confirmed / Not confirmed** badge · **Change your password** link (→ `/change-password`: Current password, New password, Confirm new password).

**"Privacy" → Delete my account**
- **Delete my account** → warning → **Type DELETE to confirm** + **Your password** → **Permanently delete my account** (tab tak disabled jab tak DELETE aur password na ho) / Cancel.
- **Kya hota hai:** Naam, email, phone, city, salary, notifications, feedback, badges, shortlists, contact requests mit jate hain; test ke jawab/scores, region, role, experience rehte hain (statistics aur bias check ke liye). Account logout, wohi email dobara signup kar sakti hai. Recruiter search mein kabhi nazar nahi aayega.

- **Quick test:** City Lahore → Karachi (region Sindh) → Save → "Saved (city, region updated)" → Dashboard par Location Karachi. Delete ka test **naye test account** par karein, demo account par nahi.

### 🧭 Candidate — flow story
Candidate home page se **Sign up** karta hai (role, city, minimum salary, consent) → khud login ho kar dashboard par aata hai → email ka link click karke confirm karta hai. **Assessments** deta hai → **My results** mein quartile aur AI feedback (PDF report bhi), **Salary guide**, **Training** aur Top Performer **Badge** → Day 5 se recruiters use dhoondte hain aur **Recruiter requests** mein offers aate hain jinhein woh accept/decline karta hai. Kabhi bhi **Profile & privacy** se details badal ya account delete kar sakta hai.

---

# ROLE 5 — PUBLIC PAGES (bina login)

### 5.1 Home `/` ✅
- Headline, sub-heading aur 3 buttons: **Log in**, **Candidate sign-up**, **Company sign-up** (sab wording admin **Settings → Homepage** se; naam/logo **Branding** se).
- Pehle se login ho to seedha apne dashboard par redirect.
- **Quick test:** Admin se headline badlen → logout → naya headline.

### 5.2 Candidate signup `/signup` ✅
- **Fields:** Full name · Email · Password (min 8) · Phone · Region · City (region filter) · Years of experience · Job role · Minimum expected salary · **Consent checkbox** ("privacy policy" link naye tab mein) → **Sign up**.
- **Kya hota hai:** Account banta hai, consent + policy version record, confirmation email (console), **khud login** ho kar `/candidate`. 15 min mein 5 se zyada koshish = "Too many signup attempts". Ghalat region ki city reject.
- **Quick test:** Naya email se signup → candidate dashboard + yellow "confirm your email" banner; terminal mein confirmation link.

### 5.3 Company signup `/signup/company` ✅
- **Company section:** Company name · Industry (optional) · City.
- **Admin section:** Your name · Email · Password → **Sign up**.
- **Kya hota hai:** Company + company admin account; trial plan (Settings → Accounts & trials, default Basic 14 din); confirmation email; login ho kar `/company-admin`.
- **Quick test:** Nayi company → dashboard par "Free trial … 14 days left"; admin dashboard par Companies +1.

### 5.4 Login `/login` ✅
- **Email**, **Password** → **Log in**; ghalat ho to "Incorrect email or password." · **Forgot your password?** link.
- Role ke hisaab se dashboard; temporary password ho to pehle Change password. Ek email par 15 min mein 5 koshishein.
- **Quick test:** Ghalat password 1 dafa → error; sahi → apna dashboard.

### 5.5 Forgot password `/forgot-password` → Reset `/reset-password` ✅
- **Email** → **Send reset link** → "Check your email" (email ho ya na ho, jawab same — security). **Back to log in**.
- Link (console mein) → **New password** + **Repeat the new password** → **Change password** → login page par notice. Link ek dafa chalta hai, 60 min (Settings) mein expire; purane saare sessions khatam. Expire ho to **Ask for a new link**.
- **Quick test:** `candidate@demo.test` → terminal se link → naya password → purana password se login fail, naye se pass. (Test ke baad wapas `Demo@12345` kar dein.)

### 5.6 Email verification `/verify-email` ✅
- Email ka link khulte hi "Confirming your email..." → **"Your email address is confirmed."** + **Continue**. Expire/ghalat ho to "Go to the app to ask for a new link" (dashboard banner se). Link 48 ghante (Settings).
- **Quick test:** Naya candidate signup → terminal link kholen → confirmed → dashboard banner gayab, Profile par "Confirmed" badge.

### 5.7 Doosre pages
- **Privacy** `/privacy` ✅ — current policy + "Version X".
- **Change password** `/change-password` ✅ — Current (temporary) password, New, Confirm.
- **Access denied** `/unauthorized` ✅ — ghalat role ka page kholne par; button se ghar.

---

# 🌐 END-TO-END KAHANI — sab roles ek saath

**1. Admin setup (aaj bhi ho sakta hai ✅)**
Platform admin login karta hai. **Roles, regions & languages** mein "Accountant", "Sales" jaise roles, Sindh/Punjab regions, Karachi/Lahore cities aur "Punjab → Urdu" map set karta hai. **Settings** mein brand ka naam, rang, logo, PKR currency, 14 din trial. **Plans** mein Basic aur Advanced ki asli price aur features. **Privacy policy** v1 publish. **Question bank** mein IPIP import, **Generate with AI** se IQ/EQ/Language/Skill sawal, **Approvals** mein check karke live, Urdu translation. **Test settings** aur **Salary benchmarks** fill.

**2. Company join karti hai (✅)**
"ABC Traders" home page se **Company sign-up** karti hai → trial Basic plan mil jata hai → admin email confirm karta hai → **Recruiters** mein 2 recruiters add → woh login karke password badalte hain. Company admin **Subscription & billing** mein Advanced dekhta hai (Day 5 se pay karke upgrade).

**3. Candidate signup (✅)**
Sara (Accountant, Lahore, 3 saal, min salary 80,000) **Candidate sign-up** karti hai — city list wohi jo admin ne banayi, consent us policy version ke saath jo admin ne publish ki. Email confirm karti hai. Profile mein kabhi bhi salary ya city badal sakti hai.

**4. Aage kya hoga (jab baqi Days ban jayenge ⏳)**
- **Day 3:** Sara **Assessments** mein 4 tests deti hai — sawal admin ke approved bank se, Punjab region ki wajah se Language test Urdu/English map ke hisaab se, Skill test Accountant ke sawal. Test adaptive hai aur admin ki Test settings par rukta hai. Score → percentile → quartile (admin ki Quartiles setting). Demo ke 64 candidates ke bhi scores seed honge.
- **Day 4:** Sara **My results** mein quartiles aur AI feedback dekhti hai, **Salary guide** admin ke benchmarks se range dikhata hai, kamzor test ke liye **Training** course karke retake. Chaaron mein Q1 → **Top Performer badge** + email (admin ka template).
- **Day 5:** ABC Traders ka recruiter **Candidate search** mein "Accountant, Lahore, Q1" filter karta hai (Q1-exclusive sirf Advanced plan par). Sara ko **Shortlist**, phir 90,000 ke offer ke saath **Contact request** — 80,000 minimum se zyada hai, is liye allowed (70,000 hota to block). Sara ko **Recruiter requests** + notification + email aati hai; woh **Accept** karti hai, recruiter ko pata chalta hai. Company admin **Subscription** mein demo payment se Advanced leta hai (**Payments** ledger mein entry), **Reports** mein charts.
- **Day 6:** Recruiter Sara ko **ATS export** se mock ATS mein bhejta hai (company admin ki ATS & webhooks aur API keys settings ke saath). Admin **Item analysis / Recalibration** se sawalon ko behtar karta hai, **Pilot mode** enforce hota hai, **Audit log** mein recruiter ka Sara ki profile dekhna record.
- **Day 7:** Poora end-to-end test, design polish, demo rehearsal.

> Yaad rahe: AI kabhi hiring ka faisla nahi karta — sirf score, rank aur recommend karta hai. Faisla recruiter ka hota hai.
