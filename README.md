# Ovyro

Ovyro is a lead-generation marketplace for land-only real estate: landowners list parcels with photos, videos, and pricing, and investors browse, save listings, and submit inquiries. Every inquiry becomes a lead routed to the listing owner, and sellers can connect their own Meta Pixel + Conversions API so their ad campaigns track conversions on Ovyro listing pages.

## Local setup

```bash
bun install
cp .env.example .env    # fill in what you need; the scaffold runs with defaults
bun run dev             # http://localhost:3000
```

Nothing in the current scaffold requires Postgres, Redis, or any third-party key — `/api/health` is deliberately dependency-free so Railway's healthcheck passes before plugins are wired.

## Scripts

| Script | What it does |
| --- | --- |
| `bun run dev` | Next.js dev server |
| `bun run build` | Production build |
| `bun run start` | Serve the production build |
| `bun run typecheck` | `tsc --noEmit` (strict mode) |
| `bun run lint` | ESLint |
| `bun test` | Bun test runner |
| `bun run db:generate` | Generate Drizzle migrations from schema |
| `bun run db:migrate` | Apply migrations |
| `bun run seed` | Seed admin user + demo data |
| `bun run worker` | Run the BullMQ worker process |

`db:*`, `seed`, and `worker` point at files that arrive in later phases — the script slots exist now so `package.json` stays stable.

## Deployment (Railway)

One Railway project, two services from this same repo, plus two plugins.

1. **Postgres plugin** and **Redis plugin** — add both; they expose `DATABASE_URL` and `REDIS_URL`.
2. **`web` service** — config file `railway.json`. Serves Next.js, healthcheck `/api/health`, and runs `bunx drizzle-kit migrate` as a pre-deploy command so schema migrates before new code takes traffic. Keep migrations additive and backwards-compatible between deploys.
3. **`worker` service** — config file `railway.worker.json`, same repo/image, start command `bun run worker`. Queue consumers (emails, CAPI dispatch, media processing, token checks, listing expiry) never run in the web process — Railway restarts would drop jobs. Recurring work runs as repeatable BullMQ jobs inside the worker rather than as a separate cron service.

Set each service's config file path under Settings → Config-as-code.

**Environments.** Run `production` and `staging` as separate Railway environments with their own Postgres and Redis plugins and their own Meta test app, per spec §8.1. Auto-deploy `production` from `main`.

**Domain.** Attach the custom domain to the `web` service before starting Meta App Review — Meta OAuth redirect URIs and pixel domains must already point at the final production domain.

Copy every variable in `.env.example` into each service's Railway variables.

## Further reading

- `projectspec.html` — full specification (roles, data model, API surface, phased build plan). Read the relevant section before building a feature.
- `CLAUDE.md` — core domain rules and conventions.
