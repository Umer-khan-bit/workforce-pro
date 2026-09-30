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
