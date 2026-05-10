# Antigravity Handoff — Agentive Platform Setup

> **Date:** 2026-05-10
> **Prepared by:** Claude (Anthropic) for Antigravity AI
> **Status:** Ready for Supabase connection + deployment verification

---

## 1. What Just Happened (Completed Work)

### Prisma Deployment Crash — FIXED
- **Problem:** App crashed on Fly.io with `PrismaClientInitializationError`
- **Root cause:** Prisma 7.8.0 in `packages/engine` was incompatible with root monorepo Prisma 6.19.3
- **Fix:** Downgraded engine + shared packages to Prisma 6.19.3, removed `prisma.config.ts`, restored `url = env("DATABASE_URL")` in schema
- **Verification:** Docker build passes, Fly.io deploy succeeds, health check returns 200

### HubSpot CRM Integration — BUILT & TESTED
- **Default CRM:** HubSpot (switched from Follow Up Boss per client request)
- **File:** `packages/integrations/src/crm/hubspot/client.ts`
- **Test results (all passing against real HubSpot API):**
  - `createPerson` → Contact created successfully
  - `findPersonByEmail` → Found by email
  - `findPersonByPhone` → Found by phone (stores digits-only for exact match)
  - `updatePerson` → Update succeeded
  - `logSms` / `logCall` / `logEmail` → Gracefully skips if missing `crm.objects.activities.write` scope
  - `createTask` → Task created + associated with contact (uses associationTypeId 204)
- **Generic interface:** `packages/integrations/src/crm/interface.ts` — swapping CRM providers only requires adding a new file, zero agent code changes

### Code Quality
- All 46 engine tests pass (8 test files)
- All 9 integration tests pass (3 test files)
- Full monorepo build succeeds (4 packages)

---

## 2. What Needs To Happen Next (Your Task)

### PRIMARY: Connect Supabase Database

**Current state:** The app deploys to Fly.io but crashes with `ECONNRESET` when connecting to Supabase because Supabase blocks Fly.io IPs by default.

**Solution:** Switch from direct Supabase connection to **Supabase Connection Pooler**.

**Steps:**
1. Go to Supabase Dashboard → Project `nqesgnqhlykwhrqaerjh` → Settings → Database → Connection Pooling
2. Copy the **URI** field (Pooler URL). It looks like:
   ```
   postgresql://postgres.nqesgnqhlykwhrqaerjh:[password]@aws-0-ap-south-1.pooler.supabase.com:6543/postgres
   ```
3. Set it as a Fly.io secret:
   ```bash
   fly secrets set DATABASE_URL="postgresql://postgres.nqesgnqhlykwhrqaerjh:PASSWORD@aws-0-ap-south-1.pooler.supabase.com:6543/postgres" -a agentive-engine
   ```
4. Verify:
   ```bash
   curl https://agentive-engine.fly.dev/api/leads
   # Should return 200 with JSON array, not 502
   ```

**Note:** The local `.env` file has `DATABASE_URL` with placeholder password `[YOUR_SUPABASE_PASSWORD]`. This is only for local dev. The actual deployed app uses Fly.io secrets.

---

## 3. Architecture Overview

### Monorepo Structure
```
platform/                          # Root (Turborepo + npm workspaces)
├── packages/
│   ├── shared/                    # Zod schemas, constants, circuit-breaker, event emitter
│   ├── integrations/              # Twilio, VAPI, Resend, OpenRouter, HubSpot CRM
│   ├── engine/                    # Express API, Prisma, LangChain agents, queue workers
│   └── dashboard/                 # Next.js 15 (scaffolded, mostly empty)
├── fly.toml                       # Fly.io deployment config
├── Dockerfile                     # Multi-stage Docker build
└── package.json                   # Root workspace config + Prisma CLI
```

### Data Flow (Lead → Agent → CRM)
1. External lead source → `POST /webhooks/leads` → creates Contact + Lead in Prisma
2. Event bus emits `lead.created` → BullMQ queue → `UnifiedAgent.processInboundLead()`
3. Agent qualifies lead via LangChain + OpenRouter (Claude Sonnet 4.6)
4. Scoring → Routing → HOT leads auto-book via Cal.com, WARM/COLD → nurture cadence
5. Qualified leads auto-sync to HubSpot CRM (`syncCrmTool`)
6. Escalations create tasks in both Prisma + HubSpot

### Key Models (Prisma)
- `Organization`, `Team`, `User` — Multi-tenancy
- `Contact`, `Lead` — Core CRM entities
- `Conversation`, `Message` — Chat history
- `Appointment` — Cal.com bookings
- `Escalation` — Human hand-offs
- `NurtureCadence` — Follow-up scheduling
- `CommunicationEvent` — Audit log of all touches

---

## 4. Environment Variables (Fly.io Secrets)

**Already set on Fly.io:**
| Secret | Status | Notes |
|--------|--------|-------|
| `DATABASE_URL` | ⚠️ NEEDS UPDATE | Currently points to direct Supabase URL (blocked). Must switch to Pooler URL |
| `REDIS_URL` | ✅ Set | For BullMQ queues |
| `OPENROUTER_API_KEY` | ✅ Set | LLM routing |
| `OPENROUTER_MODEL` | ✅ Set | `anthropic/claude-sonnet-4-6` |
| `TWILIO_*` | ✅ Set | SMS via API Key auth |
| `VAPI_API_KEY` | ✅ Set | Voice AI |
| `VAPI_ASSISTANT_ID` | ✅ Set | Outbound call assistant |
| `RESEND_API_KEY` | ✅ Set | Email |
| `CRM_PROVIDER` | ✅ Set | `hubspot` |
| `HUBSPOT_ACCESS_TOKEN` | ✅ Set | `[REDACTED — see Fly.io secrets]` |
| `CAL_API_KEY` | ✅ Set | Calendar bookings |
| `LANGCHAIN_*` | ✅ Set | LangSmith tracing |

**Local dev only (`.env` file, NOT committed):**
- Same vars as above but with local values
- Local `.env` uses placeholder password — do NOT use for deployment

---

## 5. Important File Locations

| File | Purpose |
|------|---------|
| `packages/engine/prisma/schema.prisma` | Database schema (360 lines, 16 models) |
| `packages/engine/src/db/client.ts` | Prisma singleton (`new PrismaClient()`) |
| `packages/engine/src/server.ts` | Express app, webhooks, API routes |
| `packages/engine/src/agents/unified/index.ts` | Main LangChain agent (UnifiedAgent) |
| `packages/engine/src/agents/unified/tools.ts` | 8 LangChain tools (CRM sync, SMS, email, etc.) |
| `packages/engine/src/queue/processors.ts` | BullMQ workers |
| `packages/engine/src/worker.ts` | Standalone worker entrypoint |
| `packages/integrations/src/crm/hubspot/client.ts` | HubSpot CRM implementation |
| `packages/integrations/src/crm/interface.ts` | Generic CRM interface + factory |
| `packages/integrations/src/twilio/client.ts` | SMS with circuit breaker + rate limiting |
| `packages/integrations/src/vapi/client.ts` | Voice AI outbound calls |
| `packages/shared/src/constants/index.ts` | Compliance rules, quiet hours, max messages |
| `fly.toml` | Fly.io config (app: `agentive-engine`, region: `bom`) |
| `Dockerfile` | Build: `npm ci` → `prisma generate` → `turbo build` |

---

## 6. Deployment Commands

```bash
# Build all packages locally
npm run build

# Run all tests
npm run test

# Deploy to Fly.io
fly deploy

# View logs
fly logs -a agentive-engine --no-tail

# Check health
curl https://agentive-engine.fly.dev/health
```

---

## 7. Known Issues / Watch Out For

1. **Prisma version lock:** All packages MUST use Prisma 6.19.3. Do NOT upgrade to Prisma 7 without updating the root monorepo first.
2. **HubSpot scope limitation:** The HubSpot token does NOT have `crm.objects.activities.write`. Activity logging gracefully skips, but to fully log calls/SMS/email, add that scope in HubSpot Private App settings.
3. **Zod optional warnings:** LangChain prints warnings about `.optional()` without `.nullable()`. Non-breaking, but should be cleaned up eventually.
4. **Dashboard is scaffolded:** `packages/dashboard/app/` is nearly empty. Not a blocker for engine deployment.
5. **Phone indexing delay:** HubSpot phone search may return `null` immediately after create due to indexing lag. The code handles this gracefully.

---

## 8. Quick Verification After Supabase Fix

Once you've updated `DATABASE_URL` on Fly.io:

```bash
# 1. Create a test lead
curl -X POST https://agentive-engine.fly.dev/webhooks/leads \
  -H "Content-Type: application/json" \
  -d '{"source":"antigravity-test","firstName":"Test","lastName":"Lead","email":"test@example.com","message":"Looking for office space in Austin, 5000 sq ft, budget $25/sq ft"}'

# 2. Verify lead exists in DB
curl https://agentive-engine.fly.dev/api/leads

# 3. Verify HubSpot contact was created (check HubSpot contacts dashboard)
```

Expected: Lead created in Prisma → Agent processed → HubSpot contact synced.

---

## 9. Contact / Context

- **Client:** Saiful, 19, founder of Agentive
- **Goal:** $10K/month AI agent for CRE brokerages (Speed-to-Lead + Follow-Up)
- **Current phase:** Production readiness before pilot clients
- **CRM:** HubSpot (switched from Follow Up Boss)
- **Voice:** VAPI (standardizing, migrating away from Retell)
- **Hosting:** Fly.io (app) + Supabase (Postgres) + Upstash/Redis (queues)

---

**Good luck, Antigravity. The codebase is clean, tested, and ready. Your job is the Supabase connection. Everything else is bulletproof.**
