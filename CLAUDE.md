# Ovyro — Land Marketplace Platform

Lead-generation marketplace for land-only real estate. Sellers list parcels (photos, videos, pricing); buyers browse, save listings, and submit inquiry/negotiation forms. Every inquiry becomes a lead routed to the listing owner. Sellers can connect their own Meta (Facebook) Pixel + Conversions API so their ad campaigns track conversions on Ovyro listing pages.

**Full specification:** `projectspec.html` (open in a browser, or extract text). Read the relevant section before building any feature — it defines roles, data model, API surface, and the phased build plan.

## Core domain rules

- **Roles are additive, stored as an array/join table — never a single enum.** `seller ⊇ buyer`: sellers get the full buyer experience. Buyer-facing features check "is authenticated," never `role === 'buyer'`.
- `admin` is assigned manually (seed script), never self-serve.
- v1 is **leads only** — no payments/escrow on-platform.
- Listing landing pages are **public** (no login) — required for Meta ads. Login is required only to save lists or submit inquiries.
- Sellers cannot inquire on their own listings.
- "Negotiation" in v1 = structured inquiry form (offer amount + message, phone-OTP verified), not chat.

## Tech stack (spec §8)

- **Next.js 15** (App Router, TypeScript), single app: public pages (SSR/ISR for SEO), buyer `/account`, seller `/dashboard`, `/admin`, API route handlers
- **PostgreSQL** + **Drizzle ORM**; migrations in `/drizzle`, run via `drizzle-kit migrate` as Railway pre-deploy (additive/backwards-compatible only)
- **Redis + BullMQ** — all async work (emails, CAPI dispatch, media processing, token checks, listing expiry) runs in a separate `worker` service (`/worker`), never in the web process
- **Cloudflare R2** for media (presigned direct uploads), **Mux** for video, `sharp` for image variants
- **Better Auth** — email/password, email OTP, phone OTP (Twilio Verify), Google OAuth
- **Resend** for transactional email, **Zod** everywhere, **Tailwind + shadcn/ui**, Mapbox GL, Sentry
- Deploy: **Railway** (`web` + `worker` services, Postgres + Redis plugins), auto-deploy from `main`, `/api/health` healthcheck

## Repo structure (target, spec §8.2)

```
/src
  /app          # App Router: (public), (auth), /account, /dashboard, /admin, /api
  /components
  /lib          # db, auth, meta, r2, queue, analytics
  /emails
/worker         # BullMQ processors (shares /src/lib)
/drizzle        # migrations
/scripts        # seeds, admin bootstrap
```

## Conventions

- Keep the web app stateless: sessions in DB/Redis, uploads direct-to-R2.
- Secrets/tokens (Meta tokens especially) are encrypted at rest with `TOKEN_ENCRYPTION_KEY`; never log them.
- Rate-limit auth, lead submission, and media presign endpoints (Redis sliding window).
- Follow the phased build plan in spec §13; check the v1 acceptance checklist (§14) before calling a phase done.

<!-- mulch:start -->
## Project Expertise (Mulch)
<!-- mulch-onboard:v0.10.7 -->

This project uses [Mulch](https://github.com/jayminwest/mulch) v0.10.7 for structured expertise management.

**At the start of every session**, run:
```bash
ml prime
```

Injects project-specific conventions, patterns, decisions, failures, references, and guides into
your context. Run `ml prime --files src/foo.ts` before editing a file to load only records
relevant to that path (per-file framing, classification age, and confirmation scores included).

For monolith projects where dumping every record wastes context, set
`prime.default_mode: manifest` in `.mulch/mulch.config.yaml` (or pass `--manifest`) to emit a
quick reference + domain index. Agents then scope-load with `ml prime <domain>` or
`ml prime --files <path>`.

**Before completing your task**, record insights worth preserving — conventions discovered,
patterns applied, failures encountered, or decisions made:
```bash
ml record <domain> --type <convention|pattern|failure|decision|reference|guide> --description "..."
```

Evidence auto-populates from git (current commit + changed files). Link explicitly with
`--evidence-seeds <id>` / `--evidence-gh <id>` / `--evidence-linear <id>` / `--evidence-bead <id>`,
`--evidence-commit <sha>`, or `--relates-to <mx-id>`. Upserts of named records merge outcomes
instead of replacing them; validation failures print a copy-paste retry hint with missing fields
pre-filled.

Run `ml status` for domain health, `ml doctor` to check record integrity (add `--fix` to strip
broken file anchors), `ml --help` for the full command list. Write commands use file locking and
atomic writes, so multiple agents can record concurrently. Expertise survives `git worktree`
cleanup — `.mulch/` resolves to the main repo.

`ml prune` soft-archives stale records to `.mulch/archive/` instead of deleting them; pass
`--hard` for true deletion. Restore an archived record with `ml restore <id>`. Do not read
`.mulch/archive/` directly — those records are stale by definition. If you need historical
context, run `ml search --archived <query>`.

### Before You Finish

If you discovered conventions, patterns, decisions, or failures worth preserving during
this session, record them before closing:

```bash
ml learn                                                                    # see what files changed
ml record <domain> --type <convention|pattern|failure|decision|reference|guide> --description "..."
ml sync                                                                     # validate, stage, commit
```

Skip if no insight surfaced. Unrecorded learnings are lost; ritual filler records are also noise.
<!-- mulch:end -->

<!-- seeds:start -->
## Issue Tracking (Seeds)
<!-- seeds-onboard-v:1 -->

This project uses [Seeds](https://github.com/jayminwest/seeds) for git-native issue tracking.

**At the start of every session**, run:
```
sd prime
```

This injects session context: rules, command reference, and workflows.

**Quick reference:**
- `sd ready` — Find unblocked work
- `sd create --title "..." --type task --priority 2` — Create issue
- `sd update <id> --status in_progress` — Claim work
- `sd close <id>` — Complete work
- `sd dep add <id> <depends-on>` — Add dependency between issues
- `sd sync` — Sync with git (run before pushing)

### Before You Finish
1. Close completed issues: `sd close <id>`
2. File issues for remaining work: `sd create --title "..."`
3. Sync and push: `sd sync && git push`
<!-- seeds:end -->
