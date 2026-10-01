/**
 * Message templates: the keys and the placeholders each one may use are fixed (they match a
 * trigger in the code); the wording is edited in Platform admin > Message templates and stored
 * in the database. The text below is only the starting wording written by the seed.
 * Sending arrives with the notifications module.
 */
export type TemplateSeed = {
  key: string;
  name: string;
  description: string;
  channel: "EMAIL" | "IN_APP";
  variables: string[];
  subject: string;
  body: string;
};

export const TEMPLATE_SEEDS: TemplateSeed[] = [
  {
    key: "PASSWORD_RESET_EMAIL",
    name: "Password reset - email",
    description: "Sent when someone asks to reset their password. Always sent, even if switched off, because people would otherwise be locked out.",
    channel: "EMAIL",
    variables: ["name", "link", "minutes", "brandName"],
    subject: "Reset your {{brandName}} password",
    body:
      "Hello {{name}},\n\nWe received a request to reset your {{brandName}} password. Open this link to choose a new one:\n\n{{link}}\n\n" +
      "The link works once and expires in {{minutes}} minutes. If you did not ask for this, ignore this email; your password stays the same.\n\nThe {{brandName}} team",
  },
  {
    key: "EMAIL_VERIFICATION_EMAIL",
    name: "Email confirmation - email",
    description: "Sent after signup, and when someone asks for a new link, to confirm their email address. Always sent, even if switched off.",
    channel: "EMAIL",
    variables: ["name", "link", "hours", "brandName"],
    subject: "Confirm your email address for {{brandName}}",
    body:
      "Hello {{name}},\n\nPlease confirm your email address so you can use everything on {{brandName}}:\n\n{{link}}\n\n" +
      "The link works once and expires in {{hours}} hours. If you did not create an account, ignore this email.\n\nThe {{brandName}} team",
  },
  {
    key: "TOP_PERFORMER_EMAIL",
    name: "Top performer - email",
    description: "Sent to a candidate who reaches the top-performer rule.",
    channel: "EMAIL",
    variables: ["candidateName", "brandName"],
    subject: "Congratulations, {{candidateName}} - you are a Top Performer",
    body:
      "Hello {{candidateName}},\n\nYou have reached the top quartile in every required assessment on {{brandName}}. " +
      "Your Top Performer badge is now on your profile and recruiters can see it.\n\nWell done,\nThe {{brandName}} team",
  },
  {
    key: "TOP_PERFORMER_IN_APP",
    name: "Top performer - in-app",
    description: "In-app alert for the same achievement.",
    channel: "IN_APP",
    variables: ["candidateName"],
    subject: "You earned the Top Performer badge",
    body: "Congratulations {{candidateName}}! You reached the top quartile in every required assessment.",
  },
  {
    key: "CONTACT_REQUEST_RECEIVED_EMAIL",
    name: "Recruiter request received - email",
    description: "Sent to a candidate when a recruiter asks to contact them.",
    channel: "EMAIL",
    variables: ["candidateName", "recruiterName", "companyName", "brandName"],
    subject: "{{companyName}} would like to contact you",
    body:
      "Hello {{candidateName}},\n\n{{recruiterName}} from {{companyName}} has sent you a contact request on {{brandName}}. " +
      "Log in to accept or decline it.\n\nThe {{brandName}} team",
  },
  {
    key: "CONTACT_REQUEST_RECEIVED_IN_APP",
    name: "Recruiter request received - in-app",
    description: "In-app alert to a candidate about a new recruiter request.",
    channel: "IN_APP",
    variables: ["recruiterName", "companyName"],
    subject: "New recruiter request",
    body: "{{recruiterName}} from {{companyName}} wants to contact you. Open Recruiter requests to respond.",
  },
  {
    key: "CONTACT_REQUEST_ACCEPTED_IN_APP",
    name: "Request accepted - in-app",
    description: "In-app alert to a recruiter when a candidate accepts.",
    channel: "IN_APP",
    variables: ["candidateName"],
    subject: "Contact request accepted",
    body: "{{candidateName}} accepted your contact request.",
  },
  {
    key: "CONTACT_REQUEST_DECLINED_IN_APP",
    name: "Request declined - in-app",
    description: "In-app alert to a recruiter when a candidate declines.",
    channel: "IN_APP",
    variables: ["candidateName"],
    subject: "Contact request declined",
    body: "{{candidateName}} declined your contact request.",
  },
  {
    key: "TEST_REMINDER_IN_APP",
    name: "Test reminder - in-app",
    description: "Reminds a candidate to finish or retake an assessment.",
    channel: "IN_APP",
    variables: ["candidateName", "testName"],
    subject: "Your {{testName}} is waiting",
    body: "Hello {{candidateName}}, you can take or finish your {{testName}} now.",
  },
  {
    key: "TRAINING_RECOMMENDATION_IN_APP",
    name: "Training recommendation - in-app",
    description: "Suggests a course based on a candidate's results.",
    channel: "IN_APP",
    variables: ["candidateName", "courseTitle"],
    subject: "A course to help you improve",
    body: "Hello {{candidateName}}, based on your results we recommend the course \"{{courseTitle}}\".",
  },
  {
    key: "COURSE_ENROLLED_IN_APP",
    name: "Course joined - in-app",
    description: "Confirms to a candidate that they joined a course (free, or after a successful payment).",
    channel: "IN_APP",
    variables: ["candidateName", "courseTitle"],
    subject: "You joined {{courseTitle}}",
    body: "Hello {{candidateName}}, you are now enrolled in \"{{courseTitle}}\". Open Training to start the first lesson.",
  },
  {
    key: "COURSE_COMPLETED_IN_APP",
    name: "Course completed - in-app",
    description: "Tells a candidate they finished a course and may be able to retake the related test.",
    channel: "IN_APP",
    variables: ["candidateName", "courseTitle"],
    subject: "You completed {{courseTitle}}",
    body: "Well done {{candidateName}}! You finished \"{{courseTitle}}\". If it relates to one of your tests you may be able to retake that test now.",
  },
  {
    key: "TEST_REMINDER_EMAIL",
    name: "Test reminder - email",
    description: "Emails a candidate who has not taken all their tests yet. Sent by the scheduled reminder job.",
    channel: "EMAIL",
    variables: ["candidateName", "testName", "brandName"],
    subject: "Your {{testName}} is waiting on {{brandName}}",
    body:
      "Hello {{candidateName}},\n\nYou can take your {{testName}} now. Recruiters rank candidates by their test results, so the more tests you finish, the more companies can find you.\n\nThe {{brandName}} team",
  },
  {
    key: "SUBSCRIPTION_EXPIRING_EMAIL",
    name: "Plan expiring - email",
    description: "Emails the company admins when the plan is about to end. Sent together with the in-app warning.",
    channel: "EMAIL",
    variables: ["companyName", "planName", "endDate", "brandName"],
    subject: "{{companyName}}'s {{planName}} plan ends on {{endDate}}",
    body:
      "Hello,\n\nThe {{planName}} plan for {{companyName}} ends on {{endDate}}. After that your recruiters can no longer search or contact candidates. Log in and open Subscription & billing to renew.\n\nThe {{brandName}} team",
  },
  {
    key: "FAIRNESS_REPORT_READY_IN_APP",
    name: "Fairness report ready - in-app",
    description: "Tells the platform admins that the monthly fairness report has been made.",
    channel: "IN_APP",
    variables: ["month"],
    subject: "Fairness report for {{month}}",
    body: "The fairness report for {{month}} is ready under Reports > Fairness report.",
  },
  {
    key: "WEBHOOK_FAILING_IN_APP",
    name: "Webhook failing - in-app",
    description: "Tells the company admins that a webhook could not be delivered after all its attempts.",
    channel: "IN_APP",
    variables: ["endpointHost"],
    subject: "A webhook is failing",
    body: "Deliveries to {{endpointHost}} are failing. Check the delivery log under ATS & webhooks.",
  },
  {
    key: "JOB_OPENING_CREATED_IN_APP",
    name: "Job opening created - in-app",
    description: "Tells a company admin that a recruiter opened a new job opening.",
    channel: "IN_APP",
    variables: ["recruiterName", "roleName"],
    subject: "New job opening: {{roleName}}",
    body: "{{recruiterName}} opened a new job opening for {{roleName}}.",
  },
  {
    key: "CANDIDATE_HIRED_IN_APP",
    name: "Candidate hired - in-app",
    description: "Tells a company admin that a recruiter marked a candidate as hired.",
    channel: "IN_APP",
    variables: ["recruiterName", "roleName"],
    subject: "A hire for {{roleName}}",
    body: "{{recruiterName}} marked a candidate as hired for {{roleName}}.",
  },
  {
    key: "SUBSCRIPTION_CHANGED_IN_APP",
    name: "Plan changed - in-app",
    description: "Confirms to a company admin that the company's plan changed after a payment.",
    channel: "IN_APP",
    variables: ["companyName", "planName", "endDate"],
    subject: "{{companyName}} is now on {{planName}}",
    body: "The {{planName}} plan is active for {{companyName}} until {{endDate}}.",
  },
  {
    key: "PAYMENT_FAILED_IN_APP",
    name: "Payment failed - in-app",
    description: "Tells a company admin that a subscription payment did not go through.",
    channel: "IN_APP",
    variables: ["companyName", "planName"],
    subject: "Payment for {{planName}} failed",
    body: "The payment for the {{planName}} plan for {{companyName}} did not go through, so the plan was not changed. You can try again from Subscription & billing.",
  },
  {
    key: "SUBSCRIPTION_EXPIRING_IN_APP",
    name: "Subscription expiring - in-app",
    description: "Warns a company admin that their plan is about to end.",
    channel: "IN_APP",
    variables: ["companyName", "planName", "endDate"],
    subject: "Your plan is expiring",
    body: "{{companyName}}'s {{planName}} plan ends on {{endDate}}. Renew to keep your access.",
  },
];

const PLACEHOLDER = /\{\{\s*([A-Za-z][A-Za-z0-9]*)\s*\}\}/g;

/** Placeholders used in `text` that are not in the allowed list. */
export function unknownPlaceholders(text: string, allowed: string[]): string[] {
  const bad = new Set<string>();
  for (const m of text.matchAll(PLACEHOLDER)) {
    if (!allowed.includes(m[1])) bad.add(m[1]);
  }
  return [...bad];
}

/** Fills {{placeholders}}; unknown or missing ones are left visible rather than dropped. */
export function renderTemplate(text: string, values: Record<string, string>): string {
  return text.replace(PLACEHOLDER, (whole, name: string) => values[name] ?? whole);
}
