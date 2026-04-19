# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Three-agent real estate workflow platform (Speed-to-Lead, Follow-Up/Nurture, Transaction Coordinator). Turborepo monorepo with npm workspaces. ESM-first (NodeNext module resolution, use `.js` extensions in imports).

## Commands

```bash
# Development
npm run dev              # Start all packages (turbo dev)
npm run build            # Build all packages (turbo build)
npm run test             # Run all tests (turbo test)

# Database (Prisma schema lives in engine package)
npm run db:push          # Push schema to Postgres without migration
npm run db:migrate       # Create and apply migration
npm run db:studio        # Open Prisma Studio

# Single package
npx turbo test --filter=@agentive/engine          # Test one package
npx turbo dev --filter=@agentive/engine            # Dev one package

# Single test file (vitest)
cd packages/engine && npx vitest run src/agents/speed-to-lead/__tests__/scorer.test.ts

# Infrastructure
docker compose up -d    # Postgres 16 (5432) + Redis 7 (6379)
```

## Architecture

```
packages/
  shared/       -- Zod schemas, domain types, constants, event emitter, fair-housing filter
  engine/       -- Express API, agents, orchestrator, queue, analytics (core backend)
  integrations/ -- Third-party adapters: Twilio (SMS), Follow Up Boss (CRM), Cal.com (calendar)
  dashboard/    -- Next.js 15 App Router (scaffolded, app/ is empty)
```

**Dependency graph:** `shared <- engine <- integrations`, `shared <- dashboard`, `engine <- integrations` (CalClient used by booking).

### Data Flow (Agent 1 - Speed-to-Lead)

1. External lead source → `POST /webhooks/leads` → creates Contact + Lead in Prisma, emits `lead.created`
2. `globalEmitter` handler → `SpeedToLeadAgent.processInboundLead()` → guardrails check → Claude chat → save message → emit `message.outbound`
3. Inbound SMS → `POST /webhooks/sms/inbound` → opt-out detection → emit `message.inbound`
4. `SpeedToLeadAgent.processLeadReply()` → extract qualification data → Claude conversation loop → `ROUTE:` directive → `scoreLead()` → `routeLead()` → book appointment (Cal.com) / nurture / escalate

### Key Patterns

- **Zod-first types**: All domain types defined as Zod schemas in `@agentive/shared`. TypeScript types are inferred (`z.infer<typeof XSchema>`). Prisma models are separate but parallel.
- **Event bus**: `globalEmitter` (in-process, Map-based) validates events through `AgentEventSchema.parse()` before emission. Events: `lead.created`, `message.inbound`, `message.outbound`, `escalation.created`, `appointment.booked`.
- **Agent class pattern**: Methods like `processInboundLead()` / `processLeadReply()`. LLM calls via `ClaudeClient`, qualification extraction via regex, scoring/routing pipeline.
- **Compliance guardrails**: TCPA quiet hours (9pm-8am local), consent checks, and `checkFairHousing()` regex scanner run before any outbound message.
- **Scoring**: Weighted system (budget 50, timeline-under-30 30, timeline-30-90 15, decision-maker 20, strong-intent 40, exploring -40). HOT >= 80, WARM >= 50, COLD below.
- **Routing**: HOT + timeline < 30d → book appointment; HOT/WARM → nurture; low confidence → escalate.

### Prisma Schema (packages/engine/prisma/schema.prisma)

8 models: Contact, Lead, Conversation, Message, Appointment, Escalation, CommunicationEvent, AgentEvent, Outcome. All use `cuid()` IDs. Key relations: Contact 1:N Lead/Conversation/Appointment, Lead 1:N Conversation/Appointment/Escalation, Conversation 1:N Message.

### Missing Implementations (as of init)

These files are imported by engine source but do not exist on disk yet:
- `packages/engine/src/db/client.ts` — Prisma client singleton (imported as `prisma`)
- `packages/engine/src/llm/client.ts` — Claude API client (imported as `ClaudeClient`)
- `packages/engine/src/llm/prompts/qualification-starter.ts` — system prompt for first outbound message
- `packages/engine/src/llm/prompts/conversation-loop.ts` — system prompt for ongoing qualification conversation

Dashboard `app/` directory is empty. SendGrid/nodemailer deps declared but unused. HubSpot in `.env.example` but no integration class.

### Test Framework

Vitest 3. Tests co-located in `__tests__/` directories. Existing tests: `scorer.test.ts` (7 cases), `router.test.ts` (8 cases), `handler.test.ts` (5 cases).

## Environment Variables

Required for local dev (see `.env.example`): `DATABASE_URL`, `REDIS_URL`, `ANTHROPIC_API_KEY`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`, `CAL_API_KEY`, `PORT` (default 3001), `SLA_RESPONSE_SECONDS` (default 300).