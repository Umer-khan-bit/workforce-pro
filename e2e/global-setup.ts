import { PrismaClient } from "@prisma/client";

/**
 * Rate limits are stored in the database, so they now survive server restarts. The demo accounts
 * log in many times per test run (and runs follow each other closely), so start every run with an
 * empty attempt history, as a fresh server used to give us.
 */
export default async function globalSetup() {
  const prisma = new PrismaClient();
  try {
    await prisma.rateLimitHit.deleteMany({});
  } finally {
    await prisma.$disconnect();
  }
}
