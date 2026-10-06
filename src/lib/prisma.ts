import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

// Kept on the global object in production too: the server is built from several bundles (pages, API routes, the proxy), and without
// this each of them opened its own pool of connections, so one server used two or three times the connections it needed.
globalForPrisma.prisma = prisma;
