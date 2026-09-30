import type { PrismaClient } from "@prisma/client";

/** Returns an error message if a job role or language id doesn't exist, otherwise null. */
export async function findMissingReference(
  prisma: PrismaClient,
  ids: { jobRoleId: string | null; languageId: string | null }
): Promise<string | null> {
  if (ids.jobRoleId) {
    const role = await prisma.jobRole.findUnique({ where: { id: ids.jobRoleId } });
    if (!role) return "That job role does not exist";
  }
  if (ids.languageId) {
    const lang = await prisma.language.findUnique({ where: { id: ids.languageId } });
    if (!lang) return "That language does not exist";
  }
  return null;
}
