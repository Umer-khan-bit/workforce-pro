# Workforce Pro

Multi-company recruitment platform: candidates take four assessments, the system scores and
ranks them, and companies search and shortlist instead of screening CVs. See `CLAUDE.md` for
the full spec and `DAY1_STATUS.md` for current progress.

## Run it locally

Ports are fixed (see `CLAUDE.md`): app 7310, PostgreSQL 55432, Prisma Studio 7320, Playwright 7330.

```bash
docker compose up -d      # PostgreSQL on 55432
npm run prisma:migrate    # only if the database is fresh
npm run prisma:seed       # reference data (+ demo data when DEMO_MODE="true")
npm run dev               # http://localhost:7310
```

Copy `.env.example` to `.env` and fill it in first. Never commit `.env`.

## Tests

```bash
npm test                  # Vitest unit tests
npm run test:e2e          # Playwright (builds and serves on 7330; needs the demo seed)
```
