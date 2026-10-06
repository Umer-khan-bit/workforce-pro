import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { createKit } from "../src/lib/testEngine/testkit";
import { createCompany } from "../src/lib/recruiter/testWorld";
import { buildSearchQuery } from "../src/lib/recruiter/searchParams";
import { hashPassword } from "../src/lib/password";

/**
 * Load check (measures only, changes nothing in the design):
 *   npm run load:check
 * 100 temporary candidates take the IQ test at the same time while 20 temporary recruiters keep searching for candidates in the
 * demo data. It talks to the Playwright test server on port 7330 only (it starts it if it is not running, and stops it again
 * afterwards), logs every virtual person in through the real login, and removes everything it created when it finishes.
 * Everything it creates lives in its own isolated world (own language, region, job role and questions), so the demo candidates and
 * demo questions are never answered or changed.
 *
 *   CHECK_CANDIDATES=100 CHECK_RECRUITERS=20 CHECK_SEARCHES=6 CHECK_THINK_MS=400 npm run load:check
 *
 * With the default think time (0.4 seconds) every person acts about 50 times faster than a real person, so it is a stress test.
 * CHECK_THINK_MS=8000 is close to real life (a candidate spends several seconds on a question).
 */
const PORT = 7330;
const BASE = `http://localhost:${PORT}`;
const CANDIDATES = Number(process.env.CHECK_CANDIDATES ?? 100);
const RECRUITERS = Number(process.env.CHECK_RECRUITERS ?? 20);
const SEARCHES = Number(process.env.CHECK_SEARCHES ?? 6);
/** How long a virtual person thinks between two actions, on average (milliseconds). The default is far faster than a real person, which makes it a stress test. */
const THINK_MS = Number(process.env.CHECK_THINK_MS ?? 400);
const SLOW_MS = 1000;
const PASSWORD = "load-check-pass-1";

// A small connection pool for this script's own database client.
const dbUrl = new URL(process.env.DATABASE_URL ?? "");
dbUrl.searchParams.set("connection_limit", "5");
const prisma = new PrismaClient({ datasources: { db: { url: dbUrl.toString() } } });

type Sample = { label: string; ms: number; ok: boolean; status: number; note?: string };
const samples: Sample[] = [];

async function timed(label: string, run: () => Promise<Response>, okStatus: (s: number) => boolean = (s) => s >= 200 && s < 300): Promise<Response | null> {
  const t0 = performance.now();
  try {
    const res = await run();
    await res.arrayBuffer().catch(() => null); // the whole page or answer, not only the first byte
    const ms = performance.now() - t0;
    samples.push({ label, ms, ok: okStatus(res.status), status: res.status });
    return res;
  } catch (err) {
    samples.push({ label, ms: performance.now() - t0, ok: false, status: 0, note: err instanceof Error ? err.message : "error" });
    return null;
  }
}

// ------------------------------------------------------------------ the server

async function serverUp(): Promise<boolean> {
  try {
    const res = await fetch(`${BASE}/login`, { signal: AbortSignal.timeout(3000) });
    return res.status < 500;
  } catch {
    return false;
  }
}

async function ensureServer(): Promise<ChildProcess | null> {
  if (await serverUp()) return null;
  console.log(`Nothing answers on port ${PORT}; starting the test server (npm run start:test). It needs a finished build (npm run build).`);
  const child = spawn("npm", ["run", "start:test"], { shell: true, stdio: "ignore", env: { ...process.env, JOBS_AUTORUN: "false", APP_BASE_URL: BASE } });
  for (let i = 0; i < 60; i++) {
    if (await serverUp()) return child;
    await new Promise((r) => setTimeout(r, 1000));
  }
  stopServer(child);
  throw new Error(`The test server did not start on port ${PORT}. Run "npm run build" first.`);
}

function stopServer(child: ChildProcess | null) {
  if (!child?.pid) return;
  if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
  else child.kill("SIGTERM");
}

// ------------------------------------------------------------------ a virtual person with a login

class Person {
  private jar = new Map<string, string>();
  constructor(readonly email: string) {}

  private take(res: Response) {
    for (const line of res.headers.getSetCookie()) {
      const [pair] = line.split(";");
      const i = pair.indexOf("=");
      if (i > 0) this.jar.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim());
    }
  }
  private get cookie() {
    return [...this.jar].map(([k, v]) => `${k}=${v}`).join("; ");
  }

  async login(): Promise<boolean> {
    let csrfToken = "";
    try {
      const csrfRes = await fetch(`${BASE}/api/auth/csrf`);
      this.take(csrfRes);
      csrfToken = ((await csrfRes.json()) as { csrfToken: string }).csrfToken;
    } catch {
      samples.push({ label: "login", ms: 0, ok: false, status: 0, note: "no csrf token" });
      return false;
    }
    const body = new URLSearchParams({ csrfToken, email: this.email, password: PASSWORD, callbackUrl: BASE });
    const res = await timed(
      "login",
      () => fetch(`${BASE}/api/auth/callback/credentials`, { method: "POST", redirect: "manual", headers: { "content-type": "application/x-www-form-urlencoded", cookie: this.cookie, origin: BASE }, body }),
      (s) => s === 302 || s === 200
    );
    if (!res) return false;
    this.take(res);
    return [...this.jar.keys()].some((k) => k.includes("session-token"));
  }

  get(label: string, path: string) {
    return timed(label, () => fetch(`${BASE}${path}`, { headers: { cookie: this.cookie } }));
  }
}

// The answers of the test need their JSON body, so this helper reads it itself.
async function call<T>(person: Person, label: string, method: "GET" | "POST", path: string, json?: unknown): Promise<T | null> {
  const cookie = (person as unknown as { cookie: string }).cookie;
  const t0 = performance.now();
  try {
    const res = await fetch(`${BASE}${path}`, { method, headers: { "content-type": "application/json", cookie, origin: BASE }, body: json === undefined ? undefined : JSON.stringify(json) });
    const data = (await res.json().catch(() => null)) as T | null;
    samples.push({ label, ms: performance.now() - t0, ok: res.ok, status: res.status, note: res.ok ? undefined : JSON.stringify(data)?.slice(0, 120) });
    return res.ok ? data : null;
  } catch (err) {
    samples.push({ label, ms: performance.now() - t0, ok: false, status: 0, note: err instanceof Error ? err.message : "error" });
    return null;
  }
}

type View = { status: string; question: null | { id: string; type: string; options: { key: string }[] } };

async function takeTest(person: Person, seed: number) {
  const started = await call<{ sessionId: string }>(person, "candidate: start test", "POST", "/api/tests/IQ/start");
  if (!started) return;
  let view = await call<View>(person, "candidate: open test", "GET", `/api/tests/sessions/${started.sessionId}`);
  let n = 0;
  while (view && view.status === "IN_PROGRESS" && view.question && n++ < 40) {
    const key = (seed + n) % 3 === 0 ? "A" : "B"; // about two thirds right
    view = await call<View>(person, "candidate: answer a question", "POST", `/api/tests/sessions/${started.sessionId}/answer`, { questionId: view.question.id, answer: { key } });
    await new Promise((r) => setTimeout(r, THINK_MS * (0.5 + ((seed * 37 + n * 11) % 100) / 100))); // people think for a moment
  }
}

async function searchLoop(person: Person, who: number, queries: string[]) {
  for (let i = 0; i < SEARCHES; i++) {
    await person.get("recruiter: candidate search", `/recruiter/candidates${queries[(who + i) % queries.length]}`);
    await new Promise((r) => setTimeout(r, THINK_MS * (0.75 + ((who * 53 + i * 17) % 100) / 100)));
  }
}

// ------------------------------------------------------------------ database connections

async function connectionStats() {
  const [{ n }] = await prisma.$queryRaw<{ n: number }[]>`select count(*)::int as n from pg_stat_activity where datname = current_database()`;
  const [{ max_connections }] = await prisma.$queryRaw<{ max_connections: string }[]>`select setting as max_connections from pg_settings where name = 'max_connections'`;
  return { n, max: Number(max_connections) };
}

// ------------------------------------------------------------------ report

function summarize(label: string) {
  const rows = samples.filter((s) => s.label === label);
  if (rows.length === 0) return null;
  const sorted = rows.map((r) => r.ms).sort((a, b) => a - b);
  const avg = sorted.reduce((a, b) => a + b, 0) / sorted.length;
  const p95 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))];
  return { label, count: rows.length, avg, p95, max: sorted[sorted.length - 1], errors: rows.filter((r) => !r.ok).length, slow: rows.filter((r) => r.ms > SLOW_MS).length };
}

const fmt = (ms: number) => `${Math.round(ms)} ms`;

async function main() {
  const server = await ensureServer();
  const kit = await createKit(prisma, "load");
  const world = await createCompany(prisma, `${kit.run}l`);
  let exitCode = 0;
  try {
    console.log(`Setting up ${CANDIDATES} temporary candidates and ${RECRUITERS} temporary recruiters...`);
    await kit.addCatBank("IQ", 60, 2);
    const hash = await hashPassword(PASSWORD);
    const candidates = [] as { email: string }[];
    for (let i = 0; i < CANDIDATES; i++) {
      const c = await kit.addCandidate(`load${i}`);
      candidates.push({ email: c.email });
    }
    await prisma.user.updateMany({ where: { email: { in: candidates.map((c) => c.email) } }, data: { password: hash } });

    const recruiters = [{ email: world.recruiter.email }];
    for (let i = 1; i < RECRUITERS; i++) recruiters.push({ email: (await world.addUser(`rec${i}`, "RECRUITER")).email });
    await prisma.user.updateMany({ where: { email: { in: recruiters.map((r) => r.email) } }, data: { password: hash } });
    const role = await prisma.jobRole.findFirst({ where: { isActive: true, name: { not: { startsWith: "Test role" } } }, orderBy: { name: "asc" } });
    const city = await prisma.city.findFirst({ where: { isActive: true }, orderBy: { name: "asc" } });
    await prisma.jobOpening.create({ data: { companyId: world.company.id, createdById: world.recruiter.id, jobRoleId: role?.id ?? kit.role.id, title: "Load check opening", salaryRangeMin: 50_000, salaryRangeMax: 400_000 } });
    const queries = [
      "",
      `?${buildSearchQuery({ filters: role ? { jobRoleId: role.id } : {}, sort: "overall", offer: null, opening: null })}`,
      `?${buildSearchQuery({ filters: city ? { city: city.name } : {}, sort: "experience", offer: null, opening: null })}`,
      `?${buildSearchQuery({ filters: { quartiles: { IQ: 2 } }, sort: "iq", offer: null, opening: null })}`,
      `?${buildSearchQuery({ filters: { topPerformersOnly: true }, sort: "overall", offer: null, opening: null })}`,
    ].map((q) => (q === "?" ? "" : q));

    const demoCandidates = await prisma.candidateProfile.count({ where: { anonymisedAt: null } });
    const before = await connectionStats();
    console.log(`Logging everyone in through the real login (database: ${before.n} of ${before.max} connections in use, ${demoCandidates} candidate profiles)...`);

    const people = { c: candidates.map((c) => new Person(c.email)), r: recruiters.map((r) => new Person(r.email)) };
    const everyone = [...people.c, ...people.r];
    const loggedIn: boolean[] = [];
    for (let i = 0; i < everyone.length; i += 20) loggedIn.push(...(await Promise.all(everyone.slice(i, i + 20).map((p) => p.login()))));
    const failedLogins = loggedIn.filter((ok) => !ok).length;
    if (failedLogins > 0) console.log(`  ${failedLogins} logins failed.`);

    console.log("Running: all candidates answer test questions and all recruiters search, at the same time...");
    let peak = before.n;
    const sampler = setInterval(() => void connectionStats().then((s) => (peak = Math.max(peak, s.n))).catch(() => undefined), 400);
    const t0 = performance.now();
    await Promise.all([...people.c.map((p, i) => takeTest(p, i)), ...people.r.map((p, i) => searchLoop(p, i, queries))]);
    const seconds = (performance.now() - t0) / 1000;
    clearInterval(sampler);
    const after = await connectionStats();
    peak = Math.max(peak, after.n);

    console.log(`\nFinished in ${seconds.toFixed(1)} s. Response times (slow means over ${SLOW_MS} ms):\n`);
    const labels = ["login", "candidate: start test", "candidate: open test", "candidate: answer a question", "recruiter: candidate search"];
    console.log("request".padEnd(32) + "count".padStart(7) + "average".padStart(11) + "95th pct".padStart(11) + "slowest".padStart(11) + "errors".padStart(8) + "slow".padStart(6));
    let errors = 0;
    let slowest = 0;
    for (const label of labels) {
      const s = summarize(label);
      if (!s) continue;
      errors += s.errors;
      slowest = Math.max(slowest, s.max);
      console.log(s.label.padEnd(32) + String(s.count).padStart(7) + fmt(s.avg).padStart(11) + fmt(s.p95).padStart(11) + fmt(s.max).padStart(11) + String(s.errors).padStart(8) + String(s.slow).padStart(6));
    }
    const bad = samples.filter((s) => !s.ok).slice(0, 5);
    for (const b of bad) console.log(`  error: ${b.label} -> HTTP ${b.status} ${b.note ?? ""}`);
    const finished = await prisma.testSession.count({ where: { candidateProfileId: { in: (await prisma.candidateProfile.findMany({ where: { user: { email: { in: candidates.map((c) => c.email) } } }, select: { id: true } })).map((p) => p.id) }, status: "COMPLETED" } });
    console.log(`\nTests finished: ${finished} of ${CANDIDATES}. Failed logins: ${failedLogins}. Errors: ${errors}.`);
    console.log(`Database connections: ${before.n} before, ${peak} at the busiest moment, ${after.n} after (limit ${before.max}).`);
    console.log(slowest > SLOW_MS || errors > 0 || failedLogins > 0 ? `\nRESULT: needs attention (slowest ${fmt(slowest)}).` : `\nRESULT: fine (slowest ${fmt(slowest)}, no errors).`);
    if (errors > 0 || failedLogins > 0) exitCode = 1;
  } finally {
    console.log("\nCleaning up the temporary accounts...");
    await world.cleanup().catch((e) => console.error("company clean-up:", e instanceof Error ? e.message : e));
    await kit.cleanup().catch((e) => console.error("kit clean-up:", e instanceof Error ? e.message : e));
    await prisma.rateLimitHit.deleteMany({ where: { key: { startsWith: "login:", contains: kit.run } } }).catch(() => undefined);
    await prisma.$disconnect();
    stopServer(server);
  }
  process.exit(exitCode);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
