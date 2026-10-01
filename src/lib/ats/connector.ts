import type { PrismaClient } from "@prisma/client";
import { AtsError } from "./apiKeys";
import type { AtsCandidate } from "./payload";

/**
 * How a candidate is handed to a company's applicant tracking system. A real ATS (Greenhouse, Lever, a customer's
 * own system) is plugged in by adding a class that implements this interface and returning it from
 * `getAtsConnector`. In demo mode the built-in mock ATS is used: it keeps the pushed candidates in its own table
 * and shows them to the company, like a real ATS would.
 */
export interface AtsConnector {
  readonly name: string;
  /** Hands one candidate over. Pushing the same entry again updates it rather than creating a duplicate. */
  push(companyId: string, candidate: AtsCandidate): Promise<{ externalId: string }>;
}

export class MockAtsConnector implements AtsConnector {
  readonly name = "mock-ats";
  constructor(private readonly db: Pick<PrismaClient, "mockAtsCandidate">) {}

  async push(companyId: string, candidate: AtsCandidate) {
    const existing = await this.db.mockAtsCandidate.findFirst({ where: { companyId, externalRef: candidate.reference } });
    if (existing) {
      await this.db.mockAtsCandidate.update({ where: { id: existing.id }, data: { payload: candidate as never, receivedAt: new Date() } });
      return { externalId: existing.externalId };
    }
    const externalId = `MOCK-${Math.random().toString(36).slice(2, 8).toUpperCase()}${Date.now().toString(36).slice(-3).toUpperCase()}`;
    await this.db.mockAtsCandidate.create({ data: { companyId, externalRef: candidate.reference, externalId, payload: candidate as never } });
    return { externalId };
  }
}

export function getAtsConnector(db: Pick<PrismaClient, "mockAtsCandidate">, env: Record<string, string | undefined> = process.env): AtsConnector {
  if (env.DEMO_MODE === "true") return new MockAtsConnector(db);
  throw new AtsError(503, "ATS_UNAVAILABLE", "No ATS connector is set up for this site yet.");
}
