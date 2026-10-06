import type { PrismaClient, TestType } from "@prisma/client";

/**
 * Starter training catalogue for demo mode: general courses for each assessment and a free and a paid
 * course per job role. Admins change all of it in Platform admin > Courses (this only sets starting
 * content). Safe to re-run: if any course exists, nothing is added.
 */
type Lesson = [title: string, minutes: number, text: string];
export type CourseSeed = { title: string; description: string; testType: TestType; role?: string; price: number; lessons: Lesson[] };

/** The starter catalogue (exported so its test looks only at these courses, not at courses other tests create at the same time). */
export const COURSES: CourseSeed[] = [
  {
    title: "Numerical Reasoning Basics",
    description: "Warm up for the IQ test: percentages, ratios, number patterns and quick estimation.",
    testType: "IQ",
    price: 0,
    lessons: [
      ["Percentages and ratios in minutes", 10, "Turn every percentage into a fraction first: 25% is one quarter, 20% is one fifth. For ratios, add the parts to find the whole before you share it out. Practise with three everyday examples: a discount, a recipe and a split bill."],
      ["Spotting number patterns", 12, "Check the differences between neighbours, then the differences of those differences. If the gaps grow by the same amount you have a squared pattern; if each number is multiplied by the same factor, it is a geometric one. Write the rule down before you pick an answer."],
      ["Estimating under time pressure", 8, "Round the numbers first, work out the rough answer, and only then look at the options. Often only one option is near your estimate, so you never need the exact calculation."],
    ],
  },
  {
    title: "Logical Thinking Workshop",
    description: "A structured approach to the trickiest reasoning questions, with worked examples and practice sets.",
    testType: "IQ",
    price: 3500,
    lessons: [
      ["Breaking a problem into steps", 15, "Name what you know, what you need, and the smallest step that connects them. Write each step on its own line. Most reasoning questions fall apart when you refuse to hold everything in your head at once."],
      ["Deductive and inductive reasoning", 15, "Deduction moves from a rule to a certain conclusion; induction moves from examples to a likely one. Practise telling them apart, because test questions often reward spotting which kind of conclusion is actually justified."],
      ["Abstract patterns and sequences", 15, "Look at one property at a time: shape, count, position, shading. Track how each changes from step to step. Eliminate options that break any one property."],
      ["A full practice set with answers", 20, "Work through the practice set against the clock. For every wrong answer write one sentence on what you missed, then redo the question a day later."],
    ],
  },
  {
    title: "Emotional Intelligence at Work",
    description: "Understand your own reactions and read colleagues better, in plain language with workplace examples.",
    testType: "EQ",
    price: 0,
    lessons: [
      ["Noticing your own reactions", 10, "Before you respond to a frustrating message, name the feeling: annoyed, worried, embarrassed. Naming it lowers its grip. Take one slow breath, then decide how you want to respond rather than how you feel like responding."],
      ["Listening to understand", 10, "Let the other person finish, then repeat back what you heard in your own words. You will catch misunderstandings early, and people feel respected even when you disagree."],
      ["Choosing the best response in tricky situations", 12, "In situational questions the best answer usually deals with the problem, respects the person, and involves the right people at the right time. Be wary of answers that avoid, blame or escalate too early."],
    ],
  },
  {
    title: "Handling Difficult Conversations",
    description: "Practical scripts for feedback, disagreement and bad news, with role-play exercises.",
    testType: "EQ",
    price: 2500,
    lessons: [
      ["Preparing before you speak", 10, "Decide the one thing you want the other person to understand and the outcome you want. Write your opening sentence in advance: calm, specific and about the situation, not the person."],
      ["Giving feedback people can use", 12, "Describe what happened, the effect it had, and what you would like next time. Keep it to one topic and offer help. Praise in public, correct in private."],
      ["Staying calm when others do not", 12, "Lower your voice and slow your pace. Acknowledge the feeling (\"I can see this is frustrating\") before the facts. If the conversation heats up, agree to pause and return to it."],
    ],
  },
  {
    title: "Business English for the Workplace",
    description: "Everyday workplace English: meetings, calls and clear short messages.",
    testType: "LANGUAGE",
    price: 0,
    lessons: [
      ["Clear sentences and common mistakes", 12, "Keep sentences short and put the main point first. Watch the usual traps: subject and verb agreement, tenses that match the time you mean, and the small words (a, the, in, on) that change the meaning."],
      ["Phrases for meetings and calls", 10, "Learn a handful of reliable phrases: \"Could you clarify...\", \"Let me summarise...\", \"I would suggest...\". Using them confidently is better than reaching for fancy vocabulary."],
      ["Writing a short professional answer", 15, "Plan in four parts: say what you will do, give one reason, add one example, close with a sentence about the result. Re-read for spelling and for sentences that are too long."],
    ],
  },
  {
    title: "Professional Email Writing",
    description: "Write emails people answer: subject lines, structure, tone and polite requests.",
    testType: "LANGUAGE",
    price: 2000,
    lessons: [
      ["Subject lines and openings", 8, "A good subject line says what you need and by when. Open with the point, not with background. Compare \"Meeting\" with \"Please confirm Tuesday's 3pm meeting by noon\"."],
      ["Structure and tone", 10, "Use short paragraphs and, for several requests, a numbered list. Be warm but direct, and match the formality of the person you are writing to."],
      ["Polite requests, apologies and follow-ups", 12, "Use a clear request plus a reason (\"Could you send the report by Friday? We present on Monday\"). Apologise once, briefly, and move to the fix. Follow up after two working days, not two hours."],
    ],
  },
  {
    title: "Accounting Fundamentals Refresher",
    description: "Debits and credits, reconciliations and month-end basics for working accountants.",
    testType: "SKILL",
    role: "Accountant",
    price: 0,
    lessons: [
      ["Debits, credits and the trial balance", 15, "Every entry has equal debits and credits. Assets and expenses increase with debits; liabilities, equity and income increase with credits. If the trial balance does not balance, look first for a one-sided entry or a transposed number."],
      ["Bank reconciliation step by step", 15, "Start with the bank balance, add deposits in transit, subtract outstanding cheques, and compare with the ledger. Investigate every difference that remains rather than forcing it."],
      ["The month-end close checklist", 12, "Accruals, prepayments, depreciation, reconciliations, and a review of unusual movements. Keep a checklist with owners and dates so the close is repeatable."],
    ],
  },
  {
    title: "Advanced Excel for Accountants",
    description: "Lookups, pivot tables and error checks that save hours at month end.",
    testType: "SKILL",
    role: "Accountant",
    price: 5000,
    lessons: [
      ["Lookups that do not break", 15, "Prefer lookups that search by exact match and handle missing values explicitly. Keep lookup tables on their own sheet and never type values that the sheet can calculate."],
      ["Pivot tables for management reports", 20, "Start from a clean table with one header row and no blanks. Group dates by month, add a calculated field for margin, and refresh the pivot after every data change."],
      ["Checks that catch errors early", 12, "Add control totals that must equal the ledger, highlight formulas that are typed over, and lock the cells nobody should edit."],
    ],
  },
  {
    title: "Consultative Selling Essentials",
    description: "Ask better questions, find the real need and present value instead of a price list.",
    testType: "SKILL",
    role: "Sales",
    price: 0,
    lessons: [
      ["Open questions that uncover needs", 12, "Start with the customer's situation, then the problem, then what a good outcome looks like. Listen for numbers: costs, deadlines and volumes tell you what is really at stake."],
      ["Presenting value, not features", 12, "Link every feature to a result the customer cares about, in their words. Quote one concrete example from a similar customer."],
      ["Handling objections calmly", 12, "Treat an objection as a request for more information. Acknowledge it, ask a question to find the real concern, then answer that concern."],
    ],
  },
  {
    title: "Negotiation Mastery",
    description: "Prepare, trade concessions wisely and close deals that last.",
    testType: "SKILL",
    role: "Sales",
    price: 4500,
    lessons: [
      ["Preparing your limits and options", 15, "Know your best alternative before you sit down, your target and your walk-away point. Prepare two or three things you can trade that cost you little and mean a lot to them."],
      ["Trading concessions", 15, "Never give something for nothing: every concession is tied to something in return. Make concessions smaller as you approach your limit so the other side can tell you are near it."],
      ["Closing and following up", 12, "Summarise what was agreed, confirm it in writing the same day, and name the next step with a date."],
    ],
  },
  {
    title: "Customer Service Essentials",
    description: "The habits behind excellent service: listening, ownership and clear next steps.",
    testType: "SKILL",
    role: "Customer Service",
    price: 0,
    lessons: [
      ["First contact: listen and confirm", 10, "Let the customer explain, then summarise the problem and check you have it right. Customers forgive many things but not feeling ignored."],
      ["Owning the problem", 10, "Say what you will do and by when. If you cannot fix it yourself, explain who will and stay involved until it is done."],
      ["Closing the loop", 8, "Confirm the problem is solved, thank the customer, and note what you learned so the next customer does not hit the same issue."],
    ],
  },
  {
    title: "De-escalation and Angry Customers",
    description: "Stay calm and turn an angry customer into a satisfied one.",
    testType: "SKILL",
    role: "Customer Service",
    price: 3000,
    lessons: [
      ["Why customers get angry", 10, "Anger is usually about a broken promise or feeling unheard, not about you. Remembering that helps you stay calm and professional."],
      ["Words that calm and words that inflame", 12, "Use \"I will\" rather than \"you should\". Avoid \"policy\" as a first answer. Apologise for the experience even when you are not at fault for the cause."],
      ["Knowing when to escalate", 10, "Escalate when you are out of authority, when safety is at risk, or when the customer asks for it twice. Hand over with a short summary so nobody repeats themselves."],
    ],
  },
  {
    title: "IT Helpdesk Troubleshooting",
    description: "A repeatable method for diagnosing common desktop, account and network problems.",
    testType: "SKILL",
    role: "IT Support",
    price: 0,
    lessons: [
      ["The troubleshooting loop", 12, "Define the problem, find what changed, form one hypothesis, test it, and record the result. Change one thing at a time so you know what fixed it."],
      ["Accounts, passwords and access", 12, "Verify identity before any reset, follow least privilege, and log every change. Most access problems are a wrong group, an expired password or a locked account."],
      ["Documenting for the next person", 8, "Write the symptom, cause and fix in a few lines. A good knowledge-base entry saves the next ticket."],
    ],
  },
  {
    title: "Networking Fundamentals",
    description: "IP addressing, DNS, DHCP and the first checks to run when the network is down.",
    testType: "SKILL",
    role: "IT Support",
    price: 4000,
    lessons: [
      ["IP addresses and subnets", 15, "An address has a network part and a host part; the subnet mask says where one ends. Two machines on different subnets need a router to talk."],
      ["DNS and DHCP in practice", 15, "DHCP hands out addresses; DNS turns names into addresses. If a site works by address but not by name, suspect DNS."],
      ["First checks when the network is down", 12, "Check the cable or Wi-Fi, then the address, then the gateway, then DNS, then the outside world. Each step rules out one layer."],
    ],
  },
];

export async function seedDemoCourses(prisma: PrismaClient): Promise<{ courses: number }> {
  if (process.env.DEMO_MODE !== "true") throw new Error("Refusing to create demo courses: DEMO_MODE is not 'true'.");
  if ((await prisma.course.count()) > 0) return { courses: 0 };

  const roles = new Map((await prisma.jobRole.findMany()).map((r) => [r.name, r.id]));
  let created = 0;
  for (const c of COURSES) {
    const jobRoleId = c.role ? roles.get(c.role) : undefined;
    if (c.role && !jobRoleId) continue; // that job role does not exist in this database
    await prisma.course.create({
      data: {
        title: c.title,
        description: c.description,
        testType: c.testType,
        isFree: c.price === 0,
        price: c.price,
        jobRoleId: jobRoleId ?? null,
        lessons: { create: c.lessons.map(([title, durationMinutes, content], i) => ({ title, durationMinutes, content, order: i + 1 })) },
      },
    });
    created++;
  }
  return { courses: created };
}
