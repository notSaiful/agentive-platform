# Agent 1: Speed-to-Lead + Qualification — Design Spec

## Overview

Agent 1 engages inbound leads immediately via voice (Retell AI) and SMS (Twilio), qualifies them through conversation, and routes them to the right next step — book an appointment, hand to nurture, or escalate to a human.

## Architecture

**Retell handles voice. Engine orchestrates everything else.**

```
Lead webhook → Engine creates Lead in DB
                  │
                  ├─→ Trigger Retell phone call
                  │     Retell runs voice conversation (LLM + ElevenLabs TTS)
                  │     Retell webhook → Engine receives call result + qualification data
                  │
                  └─→ If Retell reports no-answer (webhook disposition) → Send SMS via Twilio
                        Engine runs conversation via Claude (OpenRouter)
                        SMS replies flow through /webhooks/sms/inbound

Both paths → same scoring + routing pipeline
  HOT + short timeline → book appointment (Cal.com)
  HOT/WARM → hand to nurture (Agent 2, future)
  Low confidence → escalate to human
```

### Separation of concerns

- **Retell AI**: Voice conversation — prompt, LLM, TTS, STT, function calling. Calls engine via webhooks at call end and mid-call for structured data.
- **Engine**: Orchestrator — triggers Retell calls, runs SMS conversations via OpenRouter (Claude), scores leads, routes outcomes, persists to DB, handles all webhooks.
- **Twilio**: SMS transport only — send/receive text messages.
- **Cal.com**: Appointment booking when lead qualifies as HOT with short timeline.
- **Postgres**: Single source of truth — no external CRM sync.

## Data Flow

### Voice path (Retell)

1. Lead arrives via webhook → engine creates Contact + Lead in Postgres
2. Engine calls Retell `POST /v2/create-phone-call` with agent ID + lead phone number
3. Retell agent runs the qualification conversation using a configured prompt
4. Retell uses function calling to push structured qualification data (budget, timeline, decision-maker, intent) to engine mid-call or at call end
5. Call ends → Retell hits `POST /webhooks/retell/call-ended` with transcript + extracted data + disposition (answered, voicemail, no-answer)
6. Engine scores the lead and routes

### SMS path (OpenRouter + Twilio)

1. Triggered when Retell call webhook reports disposition `no-answer` or `voicemail`, or lead explicitly prefers text
2. Engine sends initial SMS via Twilio with qualification starter prompt (Claude via OpenRouter)
3. Lead replies → `POST /webhooks/sms/inbound`
4. Engine loads conversation history from DB, sends to Claude via OpenRouter
5. Claude response → guardrails check (quiet hours, consent, fair housing) → send via Twilio
6. When Claude emits `ROUTE:` directive → extract qualification data → score → route

### Shared scoring + routing

Both voice and SMS results feed into `scoreLead()` and `routeLead()` (existing code in `packages/engine/src/agents/speed-to-lead/scorer.ts` and `packages/engine/src/orchestrator/router.ts`).

Scoring weights: budget 50, timeline-under-30 30, timeline-30-90 15, decision-maker 20, strong-intent 40, exploring -40. Thresholds: HOT >= 80, WARM >= 50, COLD below.

Routing: HOT + timeline < 30 days → book appointment; HOT/WARM → nurture; COLD → nurture; low confidence (< 0.6) → escalate.

## File Changes

### New files

| File | Purpose |
|------|---------|
| `packages/integrations/src/retell/client.ts` | Retell API client — create call, get call status, create/update agent |
| `packages/integrations/src/openrouter/client.ts` | OpenRouter API client — chat completions routing to Claude |
| `packages/engine/src/db/client.ts` | Prisma client singleton |
| `packages/engine/src/llm/prompts/qualification-starter.ts` | First outbound SMS system prompt |
| `packages/engine/src/llm/prompts/conversation-loop.ts` | SMS qualification conversation system prompt |
| `packages/engine/src/llm/prompts/retell-agent.ts` | Retell voice agent prompt config (exported as structured data for Retell API) |
| `packages/engine/src/ingest/retell-webhook.ts` | Handles Retell call-completed and mid-call function-call webhooks |

### Changed files

| File | Change |
|------|--------|
| `packages/engine/src/server.ts` | Add `POST /webhooks/retell/call-ended` route; update event subscriptions |
| `packages/engine/src/agents/speed-to-lead/index.ts` | Trigger Retell call on new lead; fall back to SMS on no-answer; replace direct Claude calls with OpenRouter client |
| `packages/engine/package.json` | Replace `@anthropic-ai/sdk` with `openai` (OpenRouter is OpenAI-compatible). No Retell SDK — use native `fetch`. |
| `packages/integrations/src/index.ts` | Export RetellClient + OpenRouterClient; remove FollowUpBossClient |
| `packages/integrations/src/crm/follow-up-boss.ts` | Remove — not needed for prototype |
| `packages/integrations/src/twilio/client.ts` | Switch from Account SID + Auth Token auth to API Key SID + Secret auth |
| `packages/integrations/package.json` | Remove `@sendgrid/mail`, `nodemailer`; remove unused CRM deps |
| `.env.example` | Replace `ANTHROPIC_API_KEY` with `OPENROUTER_API_KEY`; add `RETELL_API_KEY`, `RETELL_AGENT_ID`, `TWILIO_API_KEY_SID`, `TWILIO_API_KEY_SECRET`; remove CRM keys |
| `packages/engine/src/ingest/lead-webhook.ts` | Add Retell call trigger after lead creation |
| `packages/engine/src/ingest/sms-webhook.ts` | Wire to SpeedToLeadAgent.processLeadReply() |

## Integration Details

### Retell AI

- **Create call**: `POST /v2/create-phone-call` with `agent_id`, `metadata` (lead ID, contact ID for tracking)
- **Webhook**: Retell posts to `POST /webhooks/retell/call-ended` on call completion with transcript, call disposition, duration, and any function-call results
- **Function calling**: Retell agent prompt includes tool definitions for `submitQualificationData` — called mid-conversation to push structured data to engine
- **Agent config**: Created via Retell API (`POST /create-retell-llm-agent`) on engine startup if `RETELL_AGENT_ID` is not set. Engine logs the created agent ID for the user to add to `.env`. Subsequent startups reuse the stored ID.

### OpenRouter

- OpenAI-compatible API at `https://openrouter.ai/api/v1/chat/completions`
- Use `openai` npm package with `baseURL` set to OpenRouter
- Model: `anthropic/claude-sonnet-4-6` (configurable via `OPENROUTER_MODEL` env var)
- Pass `HTTP-Referer` and `X-Title` headers for attribution

### Twilio

- Already implemented in `packages/integrations/src/twilio/client.ts`
- Switching from Account SID + Auth Token auth to API Key auth (SID + Secret) — matches the provided credentials
- TwilioClient class needs updating to use `twilio(API_KEY_SID, API_KEY_SECRET, { accountSid })` instead of `twilio(ACCOUNT_SID, AUTH_TOKEN)`
- SMS sending/receiving via webhooks otherwise unchanged

### Cal.com

- Already implemented in `packages/integrations/src/calendar/cal-client.ts`
- Get availability → book slot → create Appointment in DB

## Prompts

### Qualification Starter (SMS first message)

System prompt that instructs Claude to:
- Identify as the real estate team's assistant
- Acknowledge the lead's inquiry warmly
- Ask the first qualification question (property interest / timeline)
- Keep it brief and conversational for SMS
- Never violate fair housing language
- End with a single clear question

### Conversation Loop (SMS ongoing)

System prompt that instructs Claude to:
- Continue the qualification conversation naturally
- Extract: budget range, timeline, decision-maker status, intent level, property type
- Track which fields are still missing
- When all critical fields collected, output `ROUTE: <score>` directive
- If lead signals disinterest, output `ROUTE: disqualify`
- Stay within fair housing and compliance boundaries

### Retell Voice Agent

Retell agent prompt (configured via API or dashboard) that instructs the voice AI to:
- Same qualification flow as SMS but adapted for spoken conversation
- Natural conversational tone, not reading off a script
- Use `submitQualificationData` function call when key facts are collected
- Confirm appointment booking verbally if lead is ready
- Transfer to human if conversation goes outside scope

## Compliance

Existing guardrails in `packages/engine/src/orchestrator/guardrails.ts` enforce:
- TCPA quiet hours (9pm–8am lead local time) — no calls or SMS outside hours
- Consent checks before any outbound
- Fair housing violation detection via `checkFairHousing()` in shared package

Retell calls additionally respect quiet hours — engine checks guardrails before triggering a Retell call.

## Error Handling

- **Retell call fails**: Log error, fall back to SMS immediately
- **Retell webhook timeout**: Call status polling as fallback (retry every 10s, 3 attempts)
- **OpenRouter API failure**: Retry with exponential backoff (3 attempts), then escalate
- **Twilio SMS fails**: Retry once, then mark lead as "needs manual outreach"
- **Cal.com booking fails**: Escalate to human with appointment request details
- **All failures**: Create Escalation record in DB, surface in supervisor dashboard

## Testing

- Unit tests for Retell client, OpenRouter client (mocked HTTP)
- Unit tests for retell-webhook handler (call-ended parsing, scoring trigger)
- Integration test: full lead → Retell call → webhook → scoring → routing flow
- Integration test: full lead → SMS fallback → conversation → scoring → routing flow
- Existing tests (scorer, router, escalation handler) remain unchanged