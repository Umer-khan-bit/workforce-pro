import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";

const root = process.cwd();
const migrationsDir = path.join(root, "prisma", "migrations");
const migrationNames = readdirSync(migrationsDir, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .sort();

describe("line endings", () => {
  it(".gitattributes keeps every text file LF on every machine", () => {
    const attributes = readFileSync(path.join(root, ".gitattributes"), "utf-8");
    expect(attributes).toMatch(/^\* text=auto eol=lf$/m);
  });

  it.each(migrationNames)("migration %s has LF line endings only (Prisma hashes the raw bytes)", (name) => {
    const sql = readFileSync(path.join(migrationsDir, name, "migration.sql"));
    expect(sql.includes(0x0d), "contains a carriage return (CR)").toBe(false);
  });

  it("no file is stored in the repository with CRLF endings", () => {
    let listing: string;
    try {
      listing = execFileSync("git", ["ls-files", "--eol"], { cwd: root, encoding: "utf-8" });
    } catch {
      return; // git is not available here (for example a source download): nothing to check
    }
    const bad = listing
      .split("\n")
      .filter((line) => /^i\/(crlf|mixed)\s/.test(line))
      .map((line) => line.split("\t").pop());
    expect(bad).toEqual([]);
  });
});

// Applied migrations must still match their files: a changed byte makes `prisma migrate status` report
// "modified after it was applied". Uses the real database; skipped if it is not reachable.
const dbUp = await prisma.$queryRaw`SELECT 1`.then(() => true, () => false);

describe.skipIf(!dbUp)("applied migrations (real database)", () => {
  it("every applied migration's recorded checksum matches its file", async () => {
    const rows = await prisma.$queryRaw<{ migration_name: string; checksum: string }[]>`SELECT migration_name, checksum FROM _prisma_migrations`;
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      const file = path.join(migrationsDir, row.migration_name, "migration.sql");
      expect(existsSync(file), `${row.migration_name} is missing from the project`).toBe(true);
      const sha = createHash("sha256").update(readFileSync(file)).digest("hex");
      expect(sha, `${row.migration_name} was changed after it was applied`).toBe(row.checksum);
    }
  });
});
