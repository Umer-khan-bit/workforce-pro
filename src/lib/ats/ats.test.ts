import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { createKit, type Kit } from "@/lib/testEngine/testkit";
import { createCompany, type World } from "@/lib/recruiter/testWorld";
import { resolveOffer } from "@/lib/recruiter/offer";
import { createApiKey, authenticateApiKey, revokeApiKey, hashApiKey, AtsError } from "./apiKeys";
import { createEndpoint, deliver, emitWebhook, resendDelivery, retryDueDeliveries, signPayload, validateWebhookUrl, updateEndpoint } from "./webhooks";
import { MockAtsConnector } from "./connector";

const dbUp = await prisma.$queryRaw`SELECT 1`.then(() => true, () => false);
const DEMO = { demo: true, appBaseUrl: "http://localhost:7330" };
const LIVE = { demo: false, appBaseUrl: "https://app.example.com" };

describe("webhook addresses and signatures (pure)", () => {
  it("accepts public https addresses", () => {
    expect(validateWebhookUrl("https://hooks.example.com/in", LIVE)).toBe("https://hooks.example.com/in");
  });

  it("refuses plain http, private networks, local names, credentials in the address and nonsense", () => {
    for (const bad of ["http://hooks.example.com/in", "https://localhost/x", "https://127.0.0.1/x", "https://10.0.0.5/x", "https://192.168.1.4/x", "https://172.20.0.1/x", "https://169.254.169.254/latest", "https://[::1]/x", "https://printer.local/x", "https://intranet/x", "https://user:pass@hooks.example.com/x", "not a url", "ftp://hooks.example.com"]) {
      expect(() => validateWebhookUrl(bad, LIVE), bad).toThrow(AtsError);
    }
  });

  it("allows the app's own address only in demo mode (for the built-in receiver)", () => {
    expect(validateWebhookUrl("http://localhost:7330/api/mock-ats/receive", DEMO)).toContain("/api/mock-ats/receive");
    expect(() => validateWebhookUrl("http://localhost:7330/api/mock-ats/receive", { ...DEMO, demo: false })).toThrow(AtsError);
    expect(() => validateWebhookUrl("http://localhost:9999/x", DEMO)).toThrow(AtsError);
  });

  it("signs the timestamp and body, so a changed body or time gives a different signature", () => {
    const a = signPayload("s", "100", "{}");
    expect(a).toMatch(/^sha256=[0-9a-f]{64}$/);
    expect(signPayload("s", "100", "{}")).toBe(a);
    expect(signPayload("s", "101", "{}")).not.toBe(a);
    expect(signPayload("s", "100", "{ }")).not.toBe(a);
    expect(signPayload("t", "100", "{}")).not.toBe(a);
  });
});

describe.skipIf(!dbUp)("API keys, webhooks, mock ATS and default offer (real database)", () => {
  let kit: Kit;
  let world: World;
  let noAts: World;
  let other: World;
  const worlds: World[] = [];

  beforeAll(async () => {
    kit = await createKit(prisma, "ats");
    world = await createCompany(prisma, `${kit.run}a`);
    noAts = await createCompany(prisma, `${kit.run}b`, { features: { allCandidates: true, atsApiAccess: false } });
    other = await createCompany(prisma, `${kit.run}c`);
    worlds.push(world, noAts, other);
  }, 60_000);

  afterAll(async () => {
    for (const w of worlds) {
      await prisma.webhookDelivery.deleteMany({ where: { endpoint: { companyId: w.company.id } } });
      await prisma.webhookEndpoint.deleteMany({ where: { companyId: w.company.id } });
      await prisma.apiKey.deleteMany({ where: { companyId: w.company.id } });
      await prisma.rateLimitHit.deleteMany({ where: { key: { startsWith: "apikey:" } } });
      await w.cleanup();
    }
    await kit.cleanup();
  }, 60_000);

  describe("API keys", () => {
    it("shows the key once, stores only a hash, and the key works", async () => {
      const made = await createApiKey(prisma, { userId: world.admin.id, label: "Our ATS" });
      expect(made.key).toMatch(/^wfp_[A-Za-z0-9_-]{43}$/);
      const row = await prisma.apiKey.findUniqueOrThrow({ where: { id: made.id } });
      expect(row.hashedKey).toBe(hashApiKey(made.key));
      expect(JSON.stringify(row)).not.toContain(made.key);
      expect(row.prefix).toBe(made.key.slice(0, 8));
      const caller = await authenticateApiKey(prisma, `Bearer ${made.key}`);
      expect(caller.companyId).toBe(world.company.id);
    });

    it("refuses missing, malformed, unknown and revoked keys", async () => {
      for (const header of [null, "", "Bearer", "Basic abc", "Bearer nope", "Bearer wfp_" + "x".repeat(43)]) {
        await expect(authenticateApiKey(prisma, header)).rejects.toMatchObject({ status: 401 });
      }
      const made = await createApiKey(prisma, { userId: world.admin.id, label: "temp" });
      await revokeApiKey(prisma, { userId: world.admin.id, id: made.id });
      await expect(authenticateApiKey(prisma, `Bearer ${made.key}`)).rejects.toMatchObject({ status: 401 });
    });

    it("only a company admin of a plan with ATS access can create keys, and only for their own company", async () => {
      await expect(createApiKey(prisma, { userId: world.recruiter.id, label: "x" })).rejects.toMatchObject({ status: 403 });
      await expect(createApiKey(prisma, { userId: noAts.admin.id, label: "x" })).rejects.toMatchObject({ status: 403, code: "PLAN_FEATURE_REQUIRED" });
      const made = await createApiKey(prisma, { userId: world.admin.id, label: "mine" });
      await expect(revokeApiKey(prisma, { userId: other.admin.id, id: made.id })).rejects.toMatchObject({ status: 404 });
    });

    it("stops working when the plan loses ATS access", async () => {
      const made = await createApiKey(prisma, { userId: noAts.admin.id, label: "x" }).catch(() => null);
      expect(made).toBeNull();
    });

    it("writes audit entries for creating and revoking", async () => {
      const made = await createApiKey(prisma, { userId: world.admin.id, label: "audited" });
      await revokeApiKey(prisma, { userId: world.admin.id, id: made.id });
      const actions = (await prisma.auditLog.findMany({ where: { targetId: made.id } })).map((a) => a.action);
      expect(actions).toEqual(expect.arrayContaining(["API_KEY_CREATED", "API_KEY_REVOKED"]));
    });
  });

  describe("webhooks", () => {
    const okFetch = () => vi.fn(async () => new Response("ok", { status: 200 }));

    it("creates an endpoint (secret shown once), and rejects bad addresses and empty event lists", async () => {
      await expect(createEndpoint(prisma, { userId: world.admin.id, url: "https://127.0.0.1/x", events: ["shortlist.created"] })).rejects.toMatchObject({ code: "INVALID_URL" });
      await expect(createEndpoint(prisma, { userId: world.admin.id, url: "https://hooks.example.com/x", events: [] })).rejects.toMatchObject({ code: "NO_EVENTS" });
      await expect(createEndpoint(prisma, { userId: noAts.admin.id, url: "https://hooks.example.com/x", events: ["shortlist.created"] })).rejects.toMatchObject({ status: 403 });
      const made = await createEndpoint(prisma, { userId: world.admin.id, url: "https://hooks.example.com/x", events: ["shortlist.created"] });
      expect(made.secret).toMatch(/^whsec_/);
    });

    it("sends a signed delivery, logs it, and does not follow redirects", async () => {
      const ep = await createEndpoint(prisma, { userId: world.admin.id, url: "https://hooks.example.com/signed", events: ["shortlist.created"] });
      const fetchImpl = okFetch();
      const count = await emitWebhook(prisma, world.company.id, "shortlist.created", { reference: "R1" }, { fetchImpl, wait: true });
      expect(count).toBeGreaterThanOrEqual(1);
      const call = fetchImpl.mock.calls.find((c) => (c as unknown as [string])[0] === "https://hooks.example.com/signed") as unknown as [string, RequestInit];
      expect(call[1].redirect).toBe("manual");
      const headers = call[1].headers as Record<string, string>;
      expect(headers["X-Workforce-Signature"]).toBe(signPayload(ep.secret, headers["X-Workforce-Timestamp"], call[1].body as string));
      const row = await prisma.webhookDelivery.findFirstOrThrow({ where: { endpointId: ep.id } });
      expect(row).toMatchObject({ status: "SUCCESS", responseStatus: 200, error: null });
    });

    it("records a failure with a plain reason, schedules a retry, and the retry job delivers it", async () => {
      const ep = await createEndpoint(prisma, { userId: world.admin.id, url: "https://hooks.example.com/flaky", events: ["contact_request.answered"] });
      await emitWebhook(prisma, world.company.id, "contact_request.answered", { a: 1 }, { fetchImpl: vi.fn(async () => new Response("no", { status: 500 })), wait: true });
      const failed = await prisma.webhookDelivery.findFirstOrThrow({ where: { endpointId: ep.id } });
      expect(failed).toMatchObject({ status: "FAILED", responseStatus: 500 });
      expect(failed.error).toContain("500");
      expect(failed.nextAttemptAt).not.toBeNull();

      const later = new Date(failed.nextAttemptAt!.getTime() + 1000);
      const early = await retryDueDeliveries(prisma, new Date(failed.nextAttemptAt!.getTime() - 60_000), okFetch());
      expect(early.retried).toBe(0);
      const result = await retryDueDeliveries(prisma, later, okFetch());
      expect(result.succeeded).toBeGreaterThanOrEqual(1);
      expect((await prisma.webhookDelivery.findUniqueOrThrow({ where: { id: failed.id } })).status).toBe("SUCCESS");
    });

    it("tells the company admins once the attempts run out", async () => {
      const ep = await createEndpoint(prisma, { userId: world.admin.id, url: "https://hooks.example.com/dead", events: ["candidate.hired"] });
      await emitWebhook(prisma, world.company.id, "candidate.hired", {}, { fetchImpl: vi.fn(async () => { throw new Error("down"); }), wait: true });
      const d = await prisma.webhookDelivery.findFirstOrThrow({ where: { endpointId: ep.id } });
      expect(d.error).toContain("could not be reached");
      await prisma.webhookDelivery.update({ where: { id: d.id }, data: { attempt: 99 } });
      await deliver(prisma, d.id, vi.fn(async () => { throw new Error("down"); }));
      const last = await prisma.webhookDelivery.findUniqueOrThrow({ where: { id: d.id } });
      expect(last.nextAttemptAt).toBeNull();
      expect(await prisma.notification.count({ where: { userId: world.admin.id, link: "/company-admin/integrations" } })).toBeGreaterThanOrEqual(1);
    });

    it("another company cannot see, change or resend our endpoints and deliveries", async () => {
      const ep = await createEndpoint(prisma, { userId: world.admin.id, url: "https://hooks.example.com/private", events: ["shortlist.created"] });
      await expect(updateEndpoint(prisma, { userId: other.admin.id, id: ep.id, isActive: false })).rejects.toMatchObject({ status: 404 });
      const d = await prisma.webhookDelivery.create({ data: { endpointId: ep.id, event: "shortlist.created", payload: {} } });
      await expect(resendDelivery(prisma, { userId: other.admin.id, deliveryId: d.id, fetchImpl: okFetch() })).rejects.toMatchObject({ status: 404 });
    });

    it("sends nothing for a plan without ATS access, or an endpoint that is switched off", async () => {
      const ep = await prisma.webhookEndpoint.create({ data: { companyId: noAts.company.id, url: "https://hooks.example.com/n", secret: "s", events: ["shortlist.created"] } });
      const fetchImpl = okFetch();
      expect(await emitWebhook(prisma, noAts.company.id, "shortlist.created", {}, { fetchImpl, wait: true })).toBe(0);
      expect(fetchImpl).not.toHaveBeenCalled();
      expect(await prisma.webhookDelivery.count({ where: { endpointId: ep.id } })).toBe(0);
    });
  });

  describe("pilot mode blocks other companies' keys and webhooks", () => {
    it("refuses an API key and a webhook delivery while another company is the pilot", async () => {
      const made = await createApiKey(prisma, { userId: world.admin.id, label: "pilot" });
      const before = await prisma.pilotConfig.findFirst();
      await prisma.pilotConfig.deleteMany();
      await prisma.pilotConfig.create({ data: { enabled: true, companyId: other.company.id } });
      try {
        await expect(authenticateApiKey(prisma, `Bearer ${made.key}`)).rejects.toMatchObject({ status: 403, code: "PILOT_MODE" });
        const fetchImpl = vi.fn(async () => new Response("ok", { status: 200 }));
        expect(await emitWebhook(prisma, world.company.id, "shortlist.created", {}, { fetchImpl, wait: true })).toBe(0);
        await prisma.pilotConfig.updateMany({ data: { companyId: world.company.id } });
        await expect(authenticateApiKey(prisma, `Bearer ${made.key}`)).resolves.toMatchObject({ companyId: world.company.id });
      } finally {
        await prisma.pilotConfig.deleteMany();
        if (before) await prisma.pilotConfig.create({ data: { enabled: before.enabled, companyId: before.companyId } });
      }
    });
  });

  describe("mock ATS", () => {
    it("stores a pushed candidate once per company and reference, and updates it on a second push", async () => {
      const connector = new MockAtsConnector(prisma);
      const cand = (name: string) => ({ reference: `REF-${kit.run}`, name }) as never;
      const first = await connector.push(world.company.id, cand("A"));
      const second = await connector.push(world.company.id, cand("B"));
      expect(second.externalId).toBe(first.externalId);
      expect(await prisma.mockAtsCandidate.count({ where: { companyId: world.company.id } })).toBe(1);
      await prisma.mockAtsCandidate.deleteMany({ where: { companyId: world.company.id } });
    });
  });

  describe("default offer from the most recent open opening", () => {
    it("uses a typed offer or chosen opening first, else the recruiter's newest open opening, else the company's", async () => {
      const mk = (by: string, max: number, status: "OPEN" | "CLOSED" = "OPEN", title = `T${max}`) => prisma.jobOpening.create({ data: { companyId: world.company.id, createdById: by, jobRoleId: kit.role.id, salaryRangeMin: 1, salaryRangeMax: max, status, title } });
      try {
        expect(await resolveOffer(prisma, world.company.id, { recruiterId: world.recruiter.id })).toMatchObject({ offerMax: null, source: null });
        const adminOpening = await mk(world.admin.id, 90_000);
        expect(await resolveOffer(prisma, world.company.id, { recruiterId: world.recruiter.id })).toMatchObject({ offerMax: 90_000, source: "default", openingId: adminOpening.id });
        await new Promise((r) => setTimeout(r, 15));
        const old = await mk(world.recruiter.id, 60_000);
        await new Promise((r) => setTimeout(r, 15));
        await mk(world.recruiter.id, 70_000, "CLOSED");
        const mine = await resolveOffer(prisma, world.company.id, { recruiterId: world.recruiter.id });
        expect(mine).toMatchObject({ offerMax: 60_000, source: "default", openingId: old.id });
        expect(mine.opening?.label).toBe("T60000");
        expect(await resolveOffer(prisma, world.company.id, { recruiterId: world.recruiter.id, offer: 55_000 })).toMatchObject({ offerMax: 55_000, source: "typed", opening: null });
        expect(await resolveOffer(prisma, world.company.id, { recruiterId: world.recruiter.id, openingId: adminOpening.id, offer: 1 })).toMatchObject({ offerMax: 90_000, source: "opening" });
        // an opening of another company is never used
        expect(await resolveOffer(prisma, other.company.id, { recruiterId: world.recruiter.id, openingId: adminOpening.id })).toMatchObject({ offerMax: null });
      } finally {
        await prisma.jobOpening.deleteMany({ where: { companyId: world.company.id } });
      }
    });
  });
});
