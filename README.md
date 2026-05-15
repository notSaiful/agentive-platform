# Agentive

AI-powered lead qualification and engagement platform for commercial real estate.

## Live URLs

- **Dashboard:** https://dashboard-oy23i7wfr-notsaifuls-projects.vercel.app
- **Engine API:** https://agentive-engine.fly.dev
- **Admin Panel:** `/admin` on dashboard
- **Lead Source Guide:** `/admin/guide` on dashboard

## What It Does

Agentive runs 24/7 to qualify and route real estate leads:

1. **Speed-to-Lead** — Responds to inquiries via SMS/voice in under 5 minutes
2. **AI Qualification** — Asks budget, timeline, property type, decision-making authority
3. **Smart Scoring** — Rates leads HOT (>=80), WARM (>=50), or COLD
4. **Auto-Routing** — HOT leads get Cal.com appointments; WARM enter nurture queue; low-confidence leads escalate to human
5. **Compliance** — TCPA quiet hours, fair housing guardrails, opt-out detection

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | Next.js 15, Tailwind CSS v3, App Router |
| Backend | Express.js, Prisma ORM, PostgreSQL |
| Queue | BullMQ + Redis 7 |
| AI | Claude Sonnet 4.6 via OpenRouter |
| SMS | Twilio |
| Calendar | Cal.com |
| Deploy | Fly.io (engine), Vercel (dashboard) |

## Monorepo Structure

```
packages/
  shared/       -- Zod schemas, domain types, event emitter
  engine/       -- Express API, agents, orchestrator, queues
  integrations/ -- Twilio, Cal.com adapters
  dashboard/    -- Next.js admin + analytics dashboard
```

## Quick Start (Local)

```bash
# 1. Start infrastructure
docker compose up -d  # Postgres + Redis

# 2. Install dependencies
npm ci

# 3. Push database schema
npm run db:push

# 4. Start all packages
npm run dev
```

## Environment Variables

See `.env.example` in the repo root. Required:

- `DATABASE_URL` — Postgres connection string
- `REDIS_URL` — Redis connection string
- `OPENROUTER_API_KEY` — OpenRouter API key
- `TWILIO_ACCOUNT_SID`, `TWILIO_API_KEY_SID`, `TWILIO_API_KEY_SECRET`, `TWILIO_PHONE_NUMBER`
- `CAL_API_KEY`, `CAL_EVENT_TYPE_ID`, `CAL_BOOKING_URL`
- `ADMIN_API_KEY` — for admin endpoints

## API Overview

### Lead Ingestion

```bash
curl -X POST 'https://agentive-engine.fly.dev/webhooks/leads?orgSlug=demo-broker' \
  -H 'Content-Type: application/json' \
  -d '{"name":"Rajesh","phone":"+919876543210","source":"facebook-ads"}'
```

### Admin

```bash
# List organizations
curl 'https://agentive-engine.fly.dev/admin/organizations' \
  -H 'x-api-key: YOUR_ADMIN_KEY'

# Create organization
curl -X POST 'https://agentive-engine.fly.dev/admin/organizations' \
  -H 'x-api-key: YOUR_ADMIN_KEY' \
  -H 'Content-Type: application/json' \
  -d '{"name":"Demo Broker","slug":"demo-broker"}'
```

## Webhook URLs for Clients

| Source | Webhook URL |
|--------|-------------|
| Lead Forms / CRM | `https://agentive-engine.fly.dev/webhooks/leads?orgSlug=YOUR_SLUG` |
| Twilio Inbound SMS | `https://agentive-engine.fly.dev/webhooks/sms/inbound?orgSlug=YOUR_SLUG` |
| Retell Call Ended | `https://agentive-engine.fly.dev/webhooks/retell/call-ended?orgSlug=YOUR_SLUG` |

## Admin Dashboard

The dashboard includes:

- Real-time KPIs (leads, messages, appointments, escalations)
- Lead list with qualification status
- Conversation viewer
- Appointment calendar
- Escalation queue
- **Admin panel** (`/admin`) — create orgs, rotate API keys, view connection guide
- **Legal pages** — Privacy Policy, Terms of Service, TCPA Consent Policy

## Scoring & Routing

| Factor | Weight |
|--------|--------|
| Budget | 50 |
| Timeline < 30d | 30 |
| Timeline 30-90d | 15 |
| Decision maker | 20 |
| Strong intent | 40 |
| Exploring | -40 |

**Routing:**
- HOT (>=80) + timeline < 30d → book appointment
- HOT/WARM (>=50) → nurture
- Low confidence → escalate

## Compliance

- **TCPA:** Quiet hours 9 PM–8 AM, automatic opt-out handling
- **Fair Housing:** Regex scanner on all outbound messages
- **DPDP Act 2023:** Indian data protection compliant
- **Legal pages:** `/privacy`, `/terms`, `/tcpa` on dashboard

## Commands

```bash
# Development
npm run dev              # Start all packages (turbo dev)
npm run build            # Build all packages (turbo build)
npm run test             # Run all tests (turbo test)

# Database
npm run db:push          # Push schema to Postgres
npm run db:migrate       # Create and apply migration
npm run db:studio        # Open Prisma Studio

# Single package
npx turbo dev --filter=@agentive/engine
npx turbo build --filter=@agentive/engine

# Test single file
cd packages/engine && npx vitest run src/agents/speed-to-lead/__tests__/scorer.test.ts

# Deploy
flyctl deploy -c fly.toml -a agentive-engine    # Engine
cd packages/dashboard && vercel --prod            # Dashboard
```

## GitHub Repo

https://github.com/notSaiful/agentive-platform

## License

Private — all rights reserved by Agentive Technologies Pvt. Ltd.
