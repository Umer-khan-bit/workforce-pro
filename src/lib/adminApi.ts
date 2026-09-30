import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import type { ZodError } from "zod";
import { prisma } from "@/lib/prisma";

/** Writes an audit-log row for an admin action. Never put secrets or personal data in `metadata`. */
export function audit(
  actorId: string,
  action: string,
  targetType: string,
  targetId?: string | null,
  metadata?: Prisma.InputJsonValue
) {
  return prisma.auditLog.create({
    data: { actorId, action, targetType, targetId: targetId ?? null, metadata },
  });
}

export function invalidInput(error: ZodError) {
  return NextResponse.json({ error: "Invalid input", issues: error.flatten() }, { status: 400 });
}

/** Turns common database errors into a friendly response, or returns null if it is something else. */
export function databaseErrorResponse(err: unknown): NextResponse | null {
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2002") {
      return NextResponse.json({ error: "That already exists" }, { status: 409 });
    }
    if (err.code === "P2003") {
      return NextResponse.json(
        { error: "It is in use, so it cannot be deleted. Deactivate it instead." },
        { status: 409 }
      );
    }
    if (err.code === "P2025") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
  }
  return null;
}
