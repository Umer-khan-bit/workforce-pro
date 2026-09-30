import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { IPIP_50_ITEMS, IPIP_TRAITS } from "./ipipItems";
import { importIpipItems } from "./ipipImport";

describe("IPIP 50-item list", () => {
  it("has 50 unique items, 10 for each Big Five trait", () => {
    expect(IPIP_50_ITEMS).toHaveLength(50);
    expect(new Set(IPIP_50_ITEMS.map((i) => i.content)).size).toBe(50);
    for (const trait of IPIP_TRAITS) {
      expect(IPIP_50_ITEMS.filter((i) => i.trait === trait)).toHaveLength(10);
    }
  });

  it("marks reverse-keyed items (24 of 50, known per-trait counts)", () => {
    const reversed = (trait: string) => IPIP_50_ITEMS.filter((i) => i.trait === trait && i.reverse).length;
    expect(reversed("Extraversion")).toBe(5);
    expect(reversed("Agreeableness")).toBe(4);
    expect(reversed("Conscientiousness")).toBe(4);
    expect(reversed("Emotional Stability")).toBe(8);
    expect(reversed("Openness")).toBe(3);
    expect(IPIP_50_ITEMS.filter((i) => i.reverse)).toHaveLength(24);
  });

  it("marks a few well-known items correctly", () => {
    const find = (text: string) => IPIP_50_ITEMS.find((i) => i.content === text)!;
    expect(find("I am the life of the party.").reverse).toBe(false);
    expect(find("I don't talk a lot.").reverse).toBe(true);
    expect(find("I am relaxed most of the time.").reverse).toBe(false);
    expect(find("I get stressed out easily.").reverse).toBe(true);
  });
});

function fakePrisma(existingContents: string[]) {
  const createMany = vi.fn().mockResolvedValue({ count: 0 });
  const auditCreate = vi.fn().mockResolvedValue({});
  const prisma = {
    language: { findFirst: vi.fn().mockResolvedValue({ id: "en-id", code: "en", isDefault: true }) },
    siteSetting: { findUnique: vi.fn().mockResolvedValue(null) },
    question: {
      findMany: vi.fn().mockResolvedValue(existingContents.map((content) => ({ content }))),
      createMany,
    },
    auditLog: { create: auditCreate },
  } as unknown as PrismaClient;
  return { prisma, createMany, auditCreate };
}

describe("importIpipItems", () => {
  it("imports all 50 as approved English Likert items with approver recorded", async () => {
    const { prisma, createMany, auditCreate } = fakePrisma([]);
    const result = await importIpipItems(prisma, "admin-1");

    expect(result).toEqual({ created: 50, skipped: 0 });
    const data = createMany.mock.calls[0][0].data;
    expect(data).toHaveLength(50);
    expect(data.every((d: { status: string; type: string; testType: string; languageId: string; approvedById: string }) =>
      d.status === "APPROVED" && d.type === "LIKERT" && d.testType === "PERSONALITY" &&
      d.languageId === "en-id" && d.approvedById === "admin-1")).toBe(true);
    expect(data.filter((d: { reverseKeyed: boolean }) => d.reverseKeyed)).toHaveLength(24);
    expect(data[0].approvedAt).toBeInstanceOf(Date);
    expect(auditCreate).toHaveBeenCalledOnce();
  });

  it("does not create duplicates when run again", async () => {
    const { prisma, createMany } = fakePrisma(IPIP_50_ITEMS.map((i) => i.content));
    const result = await importIpipItems(prisma, "admin-1");
    expect(result).toEqual({ created: 0, skipped: 50 });
    expect(createMany).not.toHaveBeenCalled();
  });

  it("only adds the missing items on a partial bank", async () => {
    const { prisma, createMany } = fakePrisma(IPIP_50_ITEMS.slice(0, 20).map((i) => i.content));
    const result = await importIpipItems(prisma, null);
    expect(result).toEqual({ created: 30, skipped: 20 });
    expect(createMany.mock.calls[0][0].data).toHaveLength(30);
  });
});
