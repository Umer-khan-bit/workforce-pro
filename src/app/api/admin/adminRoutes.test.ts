import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function routeFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return routeFiles(full);
    return name === "route.ts" ? [full] : [];
  });
}

/** Every handler exported from an admin API route must start with the platform-admin check. */
describe("admin API routes", () => {
  const files = routeFiles(__dirname);

  it("finds the admin routes", () => {
    expect(files.length).toBeGreaterThanOrEqual(12);
  });

  it.each(files.map((f) => [path.relative(__dirname, f), f]))("%s checks for a platform admin in every handler", (_name, file) => {
    const source = readFileSync(file, "utf-8");
    const handlers = [...source.matchAll(/export async function (GET|POST|PUT|PATCH|DELETE)\b/g)];
    expect(handlers.length).toBeGreaterThan(0);

    const guards = [...source.matchAll(/await requirePlatformAdmin\(\)/g)];
    expect(guards.length).toBe(handlers.length);
    // The guard is the first await in the handler: nothing is read, parsed or saved before it.
    for (const h of handlers) {
      const body = source.slice(h.index! + h[0].length);
      const firstAwait = body.slice(body.indexOf("{"), body.length).match(/await [^\n]*/)?.[0];
      expect(firstAwait?.trim()).toBe("await requirePlatformAdmin();");
    }
  });
});
