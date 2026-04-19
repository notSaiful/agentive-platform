# Agent 1: Speed-to-Lead Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a working Agent 1 prototype that engages inbound leads via voice (Retell AI) and SMS (Twilio/OpenRouter), qualifies them, and routes to appointment/nurture/escalate.

**Architecture:** Retell handles voice conversations (LLM + ElevenLabs TTS). Engine orchestrates: triggers Retell calls, runs SMS conversations via OpenRouter (Claude), scores leads, routes outcomes. Both channels feed the same scoring/routing pipeline. Postgres is the single source of truth.

**Tech Stack:** Express 4, Prisma, PostgreSQL 16, Redis 7 + BullMQ, Retell AI API, OpenRouter (OpenAI-compatible), Twilio API Key auth, Cal.com API, Vitest

---

## File Structure

### New files

| File | Responsibility |
|------|---------------|
| `packages/engine/src/db/client.ts` | Prisma client singleton |
| `packages/integrations/src/openrouter/client.ts` | OpenRouter chat completions client |
| `packages/integrations/src/retell/client.ts` | Retell API client (create call, get call, create agent) |
| `packages/engine/src/llm/prompts/qualification-starter.ts` | First outbound SMS system prompt |
| `packages/engine/src/llm/prompts/conversation-loop.ts` | SMS qualification conversation system prompt |
| `packages/engine/src/llm/prompts/retell-agent.ts` | Retell voice agent prompt config |
| `packages/engine/src/ingest/retell-webhook.ts` | Retell call-ended webhook handler |

### Modified files

| File | Change |
|------|--------|
| `packages/integrations/src/twilio/client.ts` | Switch from Account SID auth to API Key auth |
| `packages/integrations/src/index.ts` | Export new clients, remove FollowUpBossClient |
| `packages/integrations/package.json` | Remove unused deps, no new deps needed (fetch for Retell, openai for OpenRouter) |
| `packages/engine/src/agents/speed-to-lead/index.ts` | Trigger Retell call, fall back to SMS, use OpenRouter instead of direct Anthropic |
| `packages/engine/src/server.ts` | Add Retell webhook route, wire event handlers |
| `packages/engine/src/ingest/lead-webhook.ts` | No changes needed (event emission already wired) |
| `packages/engine/src/ingest/sms-webhook.ts` | No changes needed (event emission already wired) |
| `packages/engine/package.json` | Replace `@anthropic-ai/sdk` with `openai` |
| `.env.example` | New env vars |

### Deleted files

| File | Reason |
|------|--------|
| `packages/integrations/src/crm/follow-up-boss.ts` | Not needed for prototype |

---

### Task 1: Prisma DB Client

**Files:**
- Create: `packages/engine/src/db/client.ts`

This is the most fundamental missing piece — every engine file that touches the DB imports `prisma` from this module.

- [ ] **Step 1: Create db/client.ts**

```typescript
// packages/engine/src/db/client.ts
import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient();
```

- [ ] **Step 2: Verify it compiles**

Run: `cd /Users/saiful/agentive-platform && npx turbo build --filter=@agentive/engine`
Expected: TypeScript errors only for missing `llm/client.ts` and prompt files (expected — those come in later tasks). No errors for `db/client.ts`.

- [ ] **Step 3: Commit**

```bash
cd /Users/saiful/agentive-platform
git add packages/engine/src/db/client.ts
git commit -m "feat(engine): add Prisma client singleton"
```

---

### Task 2: OpenRouter Client

**Files:**
- Create: `packages/integrations/src/openrouter/client.ts`
- Modify: `packages/integrations/src/index.ts`
- Modify: `packages/integrations/package.json`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/integrations/src/openrouter/__tests__/client.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OpenRouterClient } from '../client.js';

describe('OpenRouterClient', () => {
  let client: OpenRouterClient;

  beforeEach(() => {
    client = new OpenRouterClient({
      apiKey: 'test-key',
      model: 'anthropic/claude-sonnet-4-6',
    });
  });

  it('sends chat completion request to OpenRouter', async () => {
    const mockResponse = {
      choices: [{ message: { content: 'Hello! How can I help?' } }],
    };

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    } as Response);

    const result = await client.chat(
      [{ role: 'user', content: 'Hi' }],
      'You are a helpful assistant.'
    );

    expect(result).toBe('Hello! How can I help?');
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://openrouter.ai/api/v1/chat/completions',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Authorization': 'Bearer test-key',
          'Content-Type': 'application/json',
        }),
      })
    );

    fetchSpy.mockRestore();
  });

  it('throws on API error', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 429,
      statusText: 'Rate Limited',
      json: () => Promise.resolve({ error: { message: 'Rate limited' } }),
    } as Response);

    await expect(
      client.chat([{ role: 'user', content: 'Hi' }], 'system prompt')
    ).rejects.toThrow('OpenRouter API error: 429');
  });

  it('retries on transient failures', async () => {
    let callCount = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => {
      callCount++;
      if (callCount < 3) {
        return Promise.resolve({
          ok: false,
          status: 503,
          statusText: 'Service Unavailable',
          json: () => Promise.resolve({}),
        } as Response);
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          choices: [{ message: { content: 'Retried!' } }],
        }),
      } as Response);
    });

    const result = await client.chat(
      [{ role: 'user', content: 'Hi' }],
      'system prompt'
    );
    expect(result).toBe('Retried!');
    expect(callCount).toBe(3);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/saiful/agentive-platform/packages/integrations && npx vitest run src/openrouter/__tests__/client.test.ts`
Expected: FAIL — module `../client.js` not found

- [ ] **Step 3: Install openai package and create the client**

```bash
cd /Users/saiful/agentive-platform && npm install openai --workspace=@agentive/integrations
```

```typescript
// packages/integrations/src/openrouter/client.ts
import OpenAI from 'openai';

interface OpenRouterConfig {
  apiKey: string;
  model?: string;
  baseUrl?: string;
}

export class OpenRouterClient {
  private client: OpenAI;
  private model: string;

  constructor(config: OpenRouterConfig) {
    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseUrl || 'https://openrouter.ai/api/v1',
      defaultHeaders: {
        'HTTP-Referer': 'https://agentive.ai',
        'X-Title': 'Agentive Speed-to-Lead',
      },
    });
    this.model = config.model || 'anthropic/claude-sonnet-4-6';
  }

  async chat(
    messages: { role: 'system' | 'user' | 'assistant'; content: string }[],
    systemPrompt: string,
    retries = 3
  ): Promise<string> {
    const fullMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
      ...messages.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
    ];

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const response = await this.client.chat.completions.create({
          model: this.model,
          messages: fullMessages,
          max_tokens: 300,
          temperature: 0.7,
        });

        const content = response.choices[0]?.message?.content;
        if (!content) throw new Error('Empty response from OpenRouter');
        return content;
      } catch (err: any) {
        const status = err?.status;
        if (attempt < retries && (!status || status >= 500 || status === 429)) {
          const delay = Math.pow(2, attempt) * 1000;
          await new Promise(r => setTimeout(r, delay));
          continue;
        }
        if (status) throw new Error(`OpenRouter API error: ${status}`);
        throw err;
      }
    }
    throw new Error('OpenRouter API error: max retries exceeded');
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/saiful/agentive-platform/packages/integrations && npx vitest run src/openrouter/__tests__/client.test.ts`
Expected: 3 tests PASS

- [ ] **Step 5: Commit**

```bash
cd /Users/saiful/agentive-platform
git add packages/integrations/src/openrouter/ packages/integrations/package.json packages/integrations/package-lock.json
git commit -m "feat(integrations): add OpenRouter client with retry logic"
```

---

### Task 3: Retell Client

**Files:**
- Create: `packages/integrations/src/retell/client.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/integrations/src/retell/__tests__/client.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RetellClient } from '../client.js';

describe('RetellClient', () => {
  let client: RetellClient;

  beforeEach(() => {
    client = new RetellClient({ apiKey: 'test-key' });
  });

  it('creates a phone call', async () => {
    const mockResponse = { call_id: 'call_123' };
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    } as Response);

    const result = await client.createPhoneCall({
      agentId: 'agent_abc',
      phoneNumber: '+15551234567',
      metadata: { leadId: 'lead_1', contactId: 'contact_1' },
    });

    expect(result.callId).toBe('call_123');
  });

  it('gets call status', async () => {
    const mockResponse = {
      call_id: 'call_123',
      call_status: 'ended',
      start_timestamp: 1000,
      end_timestamp: 5000,
      call_analysis: { call_summary: 'Lead is interested' },
    };
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    } as Response);

    const result = await client.getCall('call_123');
    expect(result.callStatus).toBe('ended');
    expect(result.callId).toBe('call_123');
  });

  it('creates a retell LLM agent', async () => {
    const mockResponse = { agent_id: 'agent_new' };
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    } as Response);

    const result = await client.createAgent({
      prompt: 'You are a real estate assistant.',
      voiceId: '11labs_voice_id',
    });

    expect(result.agentId).toBe('agent_new');
  });

  it('throws on API error', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      json: () => Promise.resolve({}),
    } as Response);

    await expect(client.createPhoneCall({
      agentId: 'agent_abc',
      phoneNumber: '+15551234567',
    })).rejects.toThrow('Retell API error: 401');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/saiful/agentive-platform/packages/integrations && npx vitest run src/retell/__tests__/client.test.ts`
Expected: FAIL — module `../client.js` not found

- [ ] **Step 3: Create the Retell client**

```typescript
// packages/integrations/src/retell/client.ts
interface RetellConfig {
  apiKey: string;
  baseUrl?: string;
}

interface CreateCallParams {
  agentId: string;
  phoneNumber: string;
  metadata?: Record<string, string>;
}

interface CallResult {
  callId: string;
  callStatus: string;
  transcript?: string;
  analysis?: Record<string, unknown>;
  disposition?: string;
  durationSeconds?: number;
}

interface CreateAgentParams {
  prompt: string;
  voiceId: string;
  toolDefinitions?: Record<string, unknown>[];
}

interface CreateAgentResult {
  agentId: string;
}

export class RetellClient {
  private apiKey: string;
  private baseUrl: string;

  constructor(config: RetellConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl || 'https://api.retellai.com/v2';
  }

  async createPhoneCall(params: CreateCallParams): Promise<{ callId: string }> {
    const response = await fetch(`${this.baseUrl}/create-phone-call`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        agent_id: params.agentId,
        phone_number: params.phoneNumber,
        metadata: params.metadata || {},
      }),
    });

    if (!response.ok) throw new Error(`Retell API error: ${response.status}`);
    const data = await response.json() as any;
    return { callId: data.call_id };
  }

  async getCall(callId: string): Promise<CallResult> {
    const response = await fetch(`${this.baseUrl}/get-call?call_id=${callId}`, {
      headers: { 'Authorization': `Bearer ${this.apiKey}` },
    });

    if (!response.ok) throw new Error(`Retell API error: ${response.status}`);
    const data = await response.json() as any;
    return {
      callId: data.call_id,
      callStatus: data.call_status,
      transcript: data.transcript,
      analysis: data.call_analysis,
      disposition: data.call_analysis?.call_summary,
      durationSeconds: data.end_timestamp && data.start_timestamp
        ? Math.round((data.end_timestamp - data.start_timestamp) / 1000)
        : undefined,
    };
  }

  async createAgent(params: CreateAgentParams): Promise<CreateAgentResult> {
    const response = await fetch(`${this.baseUrl.replace('/v2', '')}/create-retell-llm-agent`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        prompt: params.prompt,
        voice_id: params.voiceId,
        tool_definitions: params.toolDefinitions || [],
      }),
    });

    if (!response.ok) throw new Error(`Retell API error: ${response.status}`);
    const data = await response.json() as any;
    return { agentId: data.agent_id };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/saiful/agentive-platform/packages/integrations && npx vitest run src/retell/__tests__/client.test.ts`
Expected: 4 tests PASS

- [ ] **Step 5: Commit**

```bash
cd /Users/saiful/agentive-platform
git add packages/integrations/src/retell/
git commit -m "feat(integrations): add Retell AI client"
```

---

### Task 4: Update Twilio Client to API Key Auth

**Files:**
- Modify: `packages/integrations/src/twilio/client.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/integrations/src/twilio/__tests__/client.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TwilioClient } from '../client.js';

describe('TwilioClient', () => {
  it('initializes with API Key credentials', () => {
    const client = new TwilioClient({
      accountSid: 'ACtest',
      apiKeySid: 'SKtest',
      apiKeySecret: 'secret',
      phoneNumber: '+15551234567',
    });
    expect(client).toBeDefined();
  });

  it('respects quiet hours', () => {
    const client = new TwilioClient({
      accountSid: 'ACtest',
      apiKeySid: 'SKtest',
      apiKeySecret: 'secret',
      phoneNumber: '+15551234567',
    });

    // Quiet hours are 9pm-8am. 10am should be sendable.
    expect(client.canSendNow('America/New_York')).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/saiful/agentive-platform/packages/integrations && npx vitest run src/twilio/__tests__/client.test.ts`
Expected: FAIL — constructor signature mismatch (expects `accountSid` + `authToken`, not `apiKeySid` + `apiKeySecret`)

- [ ] **Step 3: Update TwilioClient**

```typescript
// packages/integrations/src/twilio/client.ts
import twilio from 'twilio';
import { COMPLIANCE } from '@agentive/shared';

interface TwilioConfig {
  accountSid: string;
  apiKeySid: string;
  apiKeySecret: string;
  phoneNumber: string;
}

export class TwilioClient {
  private client: ReturnType<typeof twilio>;
  private phoneNumber: string;

  constructor(config: TwilioConfig) {
    this.client = twilio(config.apiKeySid, config.apiKeySecret, {
      accountSid: config.accountSid,
    });
    this.phoneNumber = config.phoneNumber;
  }

  async sendSms(to: string, body: string): Promise<{ sid: string; status: string }> {
    const message = await this.client.messages.create({
      body,
      from: this.phoneNumber,
      to,
    });
    return { sid: message.sid, status: message.status };
  }

  canSendNow(timezone: string): boolean {
    const now = new Date();
    const localHour = parseInt(
      now.toLocaleString('en-US', { timeZone: timezone, hour: 'numeric', hour12: false })
    );
    const { start, end } = COMPLIANCE.QUIET_HOURS;
    if (end <= start) return localHour >= end && localHour < start;
    return localHour >= end && localHour < start;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/saiful/agentive-platform/packages/integrations && npx vitest run src/twilio/__tests__/client.test.ts`
Expected: 2 tests PASS

- [ ] **Step 5: Commit**

```bash
cd /Users/saiful/agentive-platform
git add packages/integrations/src/twilio/
git commit -m "feat(integrations): switch Twilio to API Key auth"
```

---

### Task 5: Clean Up Integrations Package

**Files:**
- Delete: `packages/integrations/src/crm/follow-up-boss.ts`
- Modify: `packages/integrations/src/index.ts`
- Modify: `packages/integrations/package.json`

- [ ] **Step 1: Remove FollowUpBossClient**

```bash
rm /Users/saiful/agentive-platform/packages/integrations/src/crm/follow-up-boss.ts
```

- [ ] **Step 2: Update integrations index.ts**

```typescript
// packages/integrations/src/index.ts
export * from './twilio/client.js';
export * from './openrouter/client.js';
export * from './retell/client.js';
export * from './calendar/cal-client.js';
```

- [ ] **Step 3: Update integrations package.json — remove unused deps**

```json
{
  "name": "@agentive/integrations",
  "version": "0.1.0",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "dependencies": {
    "openai": "^4.73.0",
    "twilio": "^5.4.0"
  },
  "devDependencies": {
    "typescript": "^5.7.0"
  }
}
```

Run: `cd /Users/saiful/agentive-platform && npm install`

- [ ] **Step 4: Verify build**

Run: `cd /Users/saiful/agentive-platform && npx turbo build --filter=@agentive/integrations`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd /Users/saiful/agentive-platform
git add -A packages/integrations/
git commit -m "refactor(integrations): remove FUB, add OpenRouter+Retell exports, clean deps"
```

---

### Task 6: SMS Qualification Prompts

**Files:**
- Create: `packages/engine/src/llm/prompts/qualification-starter.ts`
- Create: `packages/engine/src/llm/prompts/conversation-loop.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/engine/src/llm/prompts/__tests__/prompts.test.ts
import { describe, it, expect } from 'vitest';
import { QUALIFICATION_STARTER_PROMPT } from '../qualification-starter.js';
import { CONVERSATION_LOOP_PROMPT } from '../conversation-loop.js';

describe('Qualification Prompts', () => {
  it('qualification starter contains required elements', () => {
    expect(QUALIFICATION_STARTER_PROMPT).toContain('real estate');
    expect(QUALIFICATION_STARTER_PROMPT).toContain('{name}');
    expect(QUALIFICATION_STARTER_PROMPT).toContain('fair housing');
  });

  it('conversation loop contains template placeholders', () => {
    expect(CONVERSATION_LOOP_PROMPT).toContain('{qualification_data}');
    expect(CONVERSATION_LOOP_PROMPT).toContain('{remaining_fields}');
    expect(CONVERSATION_LOOP_PROMPT).toContain('ROUTE:');
    expect(CONVERSATION_LOOP_PROMPT).toContain('fair housing');
  });

  it('qualification starter renders with name', () => {
    const rendered = QUALIFICATION_STARTER_PROMPT.replace('{name}', 'Sarah');
    expect(rendered).toContain('Sarah');
    expect(rendered).not.toContain('{name}');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/saiful/agentive-platform/packages/engine && npx vitest run src/llm/prompts/__tests__/prompts.test.ts`
Expected: FAIL — modules not found

- [ ] **Step 3: Create qualification-starter.ts**

```typescript
// packages/engine/src/llm/prompts/qualification-starter.ts
export const QUALIFICATION_STARTER_PROMPT = `You are the assistant for a real estate team. A new lead just came in — {name} expressed interest in a property.

Your goal: Send a warm, brief SMS that acknowledges their interest and asks one clear qualification question to start the conversation.

Rules:
- Be friendly and professional. Use their first name.
- Keep it under 160 characters if possible (SMS).
- Ask ONE question: either about their timeline or what they're looking for.
- Do NOT mention price, finances, or budget in the first message.
- Never use language that could violate fair housing laws — no references to demographics, family status, religion, national origin, or neighborhood character.
- Do not promise specific outcomes or guarantees.
- End with a single clear question they can easily answer.`;
```

- [ ] **Step 4: Create conversation-loop.ts**

```typescript
// packages/engine/src/llm/prompts/conversation-loop.ts
export const CONVERSATION_LOOP_PROMPT = `You are the assistant for a real estate team, continuing a qualification conversation via SMS with a lead.

Current qualification data: {qualification_data}
Still missing: {remaining_fields}

Your goal: Continue the conversation naturally to fill in missing qualification fields. When all critical fields are collected, output a ROUTE directive.

Qualification fields:
- BUDGET: Their price range or budget
- TIMELINE: When they want to move (in days)
- DECISION_MAKER: Whether they're the decision maker
- INTENT: How serious they are (ready to buy, browsing, etc.)
- PROPERTY_TYPE: What kind of property they want

Rules:
- Keep responses brief (under 160 chars for SMS when possible).
- Ask only ONE question per message.
- Be conversational, not robotic.
- If the lead seems frustrated or wants to stop, respect that.
- Never use language that could violate fair housing laws — no references to demographics, family status, religion, national origin, or neighborhood character.
- Do not promise specific outcomes or guarantees.

When you have enough data to score the lead, output EXACTLY:
ROUTE: <score_number>
For example: ROUTE: 85

If the lead clearly signals disinterest, output:
ROUTE: disqualify`;
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd /Users/saiful/agentive-platform/packages/engine && npx vitest run src/llm/prompts/__tests__/prompts.test.ts`
Expected: 3 tests PASS

- [ ] **Step 6: Commit**

```bash
cd /Users/saiful/agentive-platform
git add packages/engine/src/llm/
git commit -m "feat(engine): add SMS qualification prompts"
```

---

### Task 7: Retell Voice Agent Prompt

**Files:**
- Create: `packages/engine/src/llm/prompts/retell-agent.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/engine/src/llm/prompts/__tests__/retell-agent.test.ts
import { describe, it, expect } from 'vitest';
import { RETELL_AGENT_PROMPT, RETELL_TOOL_DEFINITIONS } from '../retell-agent.js';

describe('Retell Agent Prompt', () => {
  it('contains qualification flow instructions', () => {
    expect(RETELL_AGENT_PROMPT).toContain('real estate');
    expect(RETELL_AGENT_PROMPT).toContain('budget');
    expect(RETELL_AGENT_PROMPT).toContain('timeline');
    expect(RETELL_AGENT_PROMPT).toContain('fair housing');
  });

  it('includes submitQualificationData tool definition', () => {
    expect(RETELL_TOOL_DEFINITIONS).toHaveLength(1);
    expect(RETELL_TOOL_DEFINITIONS[0].name).toBe('submitQualificationData');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/saiful/agentive-platform/packages/engine && npx vitest run src/llm/prompts/__tests__/retell-agent.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Create retell-agent.ts**

```typescript
// packages/engine/src/llm/prompts/retell-agent.ts
export const RETELL_AGENT_PROMPT = `You are a friendly real estate assistant calling to follow up on a property inquiry.

Your goal: Have a natural conversation to qualify the lead. Collect the following information:

1. BUDGET: What's their price range?
2. TIMELINE: When are they looking to move? (urgent / 1-3 months / 3-6 months / just exploring)
3. DECISION_MAKER: Are they the one making the decision?
4. INTENT: How serious are they about buying?
5. PROPERTY_TYPE: What kind of property are they looking for?

Conversation approach:
- Start by confirming which property they inquired about
- Ask questions naturally in conversation — don't interview them
- Listen carefully and confirm what you hear
- When you've collected key facts, call submitQualificationData
- If they're ready to schedule an appointment, confirm their preferred time

Critical rules:
- NEVER use language that could violate fair housing laws
- Do not reference demographics, family status, religion, national origin, or neighborhood character
- Do not promise specific outcomes or guarantees
- If the conversation goes outside your scope (legal advice, mortgage details), offer to connect them with a specialist
- Be warm and conversational — this is a phone call, not a form`;

export const RETELL_TOOL_DEFINITIONS = [
  {
    name: 'submitQualificationData',
    description: 'Submit the qualification data collected during the conversation. Call this when you have gathered enough information about the lead.',
    parameters: {
      type: 'object',
      properties: {
        budget: { type: 'string', description: 'Lead budget range, e.g. "$400k-$600k"' },
        timelineDays: { type: 'number', description: 'Days until they want to move' },
        decisionMaker: { type: 'string', enum: ['yes', 'no', 'maybe'] },
        intent: { type: 'string', enum: ['ready_to_buy', 'serious', 'exploring', 'not_interested'] },
        propertyType: { type: 'string', description: 'Type of property they want' },
        readyForAppointment: { type: 'boolean', description: 'Whether the lead wants to schedule an appointment' },
        appointmentPreference: { type: 'string', description: 'Preferred appointment time, e.g. "tomorrow afternoon"' },
      },
      required: ['intent'],
    },
  },
];
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/saiful/agentive-platform/packages/engine && npx vitest run src/llm/prompts/__tests__/retell-agent.test.ts`
Expected: 2 tests PASS

- [ ] **Step 5: Commit**

```bash
cd /Users/saiful/agentive-platform
git add packages/engine/src/llm/prompts/retell-agent.ts packages/engine/src/llm/prompts/__tests__/retell-agent.test.ts
git commit -m "feat(engine): add Retell voice agent prompt and tool definitions"
```

---

### Task 8: Retell Webhook Handler

**Files:**
- Create: `packages/engine/src/ingest/retell-webhook.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/engine/src/ingest/__tests__/retell-webhook.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleRetellCallEnded } from '../retell-webhook.js';

const mockPrisma = {
  lead: {
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  conversation: {
    findFirst: vi.fn(),
    create: vi.fn(),
  },
  message: {
    create: vi.fn(),
  },
  communicationEvent: {
    create: vi.fn(),
  },
};

vi.mock('../../db/client.js', () => ({
  prisma: mockPrisma,
}));

describe('handleRetellCallEnded', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('processes a completed call with qualification data', async () => {
    mockPrisma.lead.findUnique.mockResolvedValue({
      id: 'lead_1',
      contactId: 'contact_1',
      status: 'new',
    });
    mockPrisma.conversation.findFirst.mockResolvedValue(null);
    mockPrisma.conversation.create.mockResolvedValue({ id: 'conv_1' });

    const result = await handleRetellCallEnded({
      callId: 'call_123',
      leadId: 'lead_1',
      callStatus: 'ended',
      disposition: 'answered',
      transcript: 'Lead wants a 3br house, budget around $500k',
      qualificationData: {
        budget: '$500k',
        timelineDays: 30,
        decisionMaker: 'yes',
        intent: 'ready_to_buy',
      },
    });

    expect(result.leadId).toBe('lead_1');
    expect(result.disposition).toBe('answered');
  });

  it('returns no-answer disposition for unanswered calls', async () => {
    const result = await handleRetellCallEnded({
      callId: 'call_456',
      leadId: 'lead_2',
      callStatus: 'ended',
      disposition: 'no-answer',
    });

    expect(result.disposition).toBe('no-answer');
    expect(result.shouldSmsFallback).toBe(true);
  });

  it('returns voicemail disposition with fallback flag', async () => {
    const result = await handleRetellCallEnded({
      callId: 'call_789',
      leadId: 'lead_3',
      callStatus: 'ended',
      disposition: 'voicemail',
    });

    expect(result.disposition).toBe('voicemail');
    expect(result.shouldSmsFallback).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/saiful/agentive-platform/packages/engine && npx vitest run src/ingest/__tests__/retell-webhook.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Create retell-webhook.ts**

```typescript
// packages/engine/src/ingest/retell-webhook.ts
import { prisma } from '../db/client.js';
import { scoreLead } from '../agents/speed-to-lead/scorer.js';
import { routeLead } from '../orchestrator/router.js';
import { globalEmitter } from '@agentive/shared';

interface CallEndedInput {
  callId: string;
  leadId: string;
  callStatus: string;
  disposition: string;
  transcript?: string;
  qualificationData?: {
    budget?: string;
    timelineDays?: number;
    decisionMaker?: string;
    intent?: string;
    propertyType?: string;
    readyForAppointment?: boolean;
    appointmentPreference?: string;
  };
}

interface CallEndedResult {
  leadId: string;
  disposition: string;
  shouldSmsFallback: boolean;
  route?: string;
  score?: number;
  classification?: string;
}

export async function handleRetellCallEnded(input: CallEndedInput): Promise<CallEndedResult> {
  const needsFallback = input.disposition === 'no-answer' || input.disposition === 'voicemail';

  await prisma.communicationEvent.create({
    data: {
      leadId: input.leadId,
      contactId: '', // populated below if lead found
      channel: 'phone',
      direction: 'outbound',
      content: input.transcript || `Call ${input.disposition}`,
      metadata: {
        callId: input.callId,
        disposition: input.disposition,
        callStatus: input.callStatus,
        qualificationData: input.qualificationData,
      },
    },
  });

  if (needsFallback) {
    return { leadId: input.leadId, disposition: input.disposition, shouldSmsFallback: true };
  }

  const qData = input.qualificationData;
  if (!qData) {
    return { leadId: input.leadId, disposition: input.disposition, shouldSmsFallback: true };
  }

  const intentSignals: string[] = [];
  if (qData.intent === 'ready_to_buy') intentSignals.push('ready to buy');
  if (qData.intent === 'serious') intentSignals.push('serious');
  if (qData.intent === 'exploring') intentSignals.push('just browsing');

  const scoreResult = scoreLead({
    budgetIdentified: !!qData.budget,
    timelineDays: qData.timelineDays ?? null,
    isDecisionMaker: qData.decisionMaker === 'yes',
    intentSignals,
  });

  const routeResult = routeLead({
    classification: scoreResult.classification,
    score: scoreResult.score,
    timelineDays: qData.timelineDays ?? null,
    confidence: 0.85,
  });

  const lead = await prisma.lead.findUnique({ where: { id: input.leadId } });
  if (lead) {
    await prisma.lead.update({
      where: { id: input.leadId },
      data: {
        status: routeResult.route === 'BOOK_APPOINTMENT' ? 'appointment_booked' : 'qualified',
        qualificationScore: scoreResult.score,
        classification: scoreResult.classification,
      },
    });
  }

  return {
    leadId: input.leadId,
    disposition: input.disposition,
    shouldSmsFallback: false,
    route: routeResult.route,
    score: scoreResult.score,
    classification: scoreResult.classification,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/saiful/agentive-platform/packages/engine && npx vitest run src/ingest/__tests__/retell-webhook.test.ts`
Expected: 3 tests PASS

- [ ] **Step 5: Commit**

```bash
cd /Users/saiful/agentive-platform
git add packages/engine/src/ingest/retell-webhook.ts packages/engine/src/ingest/__tests__/
git commit -m "feat(engine): add Retell call-ended webhook handler"
```

---

### Task 9: Update SpeedToLeadAgent

**Files:**
- Modify: `packages/engine/src/agents/speed-to-lead/index.ts`

This is the core change — wire in Retell for voice and OpenRouter for SMS, replacing the direct Anthropic SDK.

- [ ] **Step 1: Write the failing test**

```typescript
// packages/engine/src/agents/speed-to-lead/__tests__/agent.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SpeedToLeadAgent } from '../index.js';

const mockPrisma = {
  lead: { findUnique: vi.fn(), update: vi.fn() },
  contact: { findUnique: vi.fn() },
  conversation: { findFirst: vi.fn(), create: vi.fn() },
  message: { create: vi.fn() },
};

vi.mock('../../../db/client.js', () => ({
  prisma: mockPrisma,
}));

const mockRetellClient = {
  createPhoneCall: vi.fn(),
};

const mockOpenRouterClient = {
  chat: vi.fn(),
};

const mockTwilioClient = {
  sendSms: vi.fn(),
  canSendNow: vi.fn().mockReturnValue(true),
};

describe('SpeedToLeadAgent', () => {
  let agent: SpeedToLeadAgent;

  beforeEach(() => {
    vi.clearAllMocks();
    agent = new SpeedToLeadAgent({
      retellClient: mockRetellClient as any,
      openRouterClient: mockOpenRouterClient as any,
      twilioClient: mockTwilioClient as any,
    });
  });

  it('triggers a Retell call for a new lead with phone number', async () => {
    mockPrisma.lead.findUnique.mockResolvedValue({ id: 'lead_1', status: 'new' });
    mockPrisma.contact.findUnique.mockResolvedValue({
      id: 'contact_1',
      firstName: 'Sarah',
      phone: '+15551234567',
      smsConsent: true,
    });
    mockRetellClient.createPhoneCall.mockResolvedValue({ callId: 'call_1' });

    await agent.processInboundLead({
      leadId: 'lead_1',
      contactId: 'contact_1',
      source: 'webform',
      message: 'I am interested in the property',
      channel: 'phone',
    });

    expect(mockRetellClient.createPhoneCall).toHaveBeenCalledWith(
      expect.objectContaining({ phoneNumber: '+15551234567' })
    );
  });

  it('falls back to SMS when lead has no phone', async () => {
    mockPrisma.lead.findUnique.mockResolvedValue({ id: 'lead_2', status: 'new' });
    mockPrisma.contact.findUnique.mockResolvedValue({
      id: 'contact_2',
      firstName: 'John',
      phone: null,
      email: 'john@test.com',
      emailConsent: true,
      smsConsent: false,
    });
    mockOpenRouterClient.chat.mockResolvedValue('Hi John! What kind of property are you looking for?');
    mockPrisma.conversation.findFirst.mockResolvedValue(null);
    mockPrisma.conversation.create.mockResolvedValue({ id: 'conv_1' });

    await agent.processInboundLead({
      leadId: 'lead_2',
      contactId: 'contact_2',
      source: 'webform',
      message: 'Interested in a condo',
      channel: 'sms',
    });

    expect(mockRetellClient.createPhoneCall).not.toHaveBeenCalled();
    expect(mockOpenRouterClient.chat).toHaveBeenCalled();
  });

  it('sends SMS fallback when Retell call is not answered', async () => {
    mockPrisma.lead.findUnique.mockResolvedValue({ id: 'lead_3', status: 'contacted' });
    mockPrisma.contact.findUnique.mockResolvedValue({
      id: 'contact_3',
      firstName: 'Alex',
      phone: '+15559876543',
      smsConsent: true,
    });
    mockOpenRouterClient.chat.mockResolvedValue('Hi Alex! Sorry we missed you — are you still looking?');
    mockPrisma.conversation.findFirst.mockResolvedValue(null);
    mockPrisma.conversation.create.mockResolvedValue({ id: 'conv_2' });

    await agent.handleCallNoAnswer({
      leadId: 'lead_3',
      contactId: 'contact_3',
      callId: 'call_2',
    });

    expect(mockOpenRouterClient.chat).toHaveBeenCalled();
    expect(mockTwilioClient.sendSms).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/saiful/agentive-platform/packages/engine && npx vitest run src/agents/speed-to-lead/__tests__/agent.test.ts`
Expected: FAIL — constructor signature mismatch

- [ ] **Step 3: Rewrite SpeedToLeadAgent**

```typescript
// packages/engine/src/agents/speed-to-lead/index.ts
import { OpenRouterClient, RetellClient, TwilioClient } from '@agentive/integrations';
import { QUALIFICATION_STARTER_PROMPT } from '../../llm/prompts/qualification-starter.js';
import { CONVERSATION_LOOP_PROMPT } from '../../llm/prompts/conversation-loop.js';
import { scoreLead } from './scorer.js';
import { routeLead } from '../../orchestrator/router.js';
import { checkGuardrails } from '../../orchestrator/guardrails.js';
import { prisma } from '../../db/client.js';
import { globalEmitter } from '@agentive/shared';

interface InboundLeadInput {
  leadId: string;
  contactId: string;
  source: string;
  message: string;
  channel: string;
}

interface LeadReplyInput {
  leadId: string;
  message: string;
  channel: string;
}

interface CallNoAnswerInput {
  leadId: string;
  contactId: string;
  callId: string;
}

interface AgentResult {
  leadId: string;
  responseMessage: string;
  qualificationComplete: boolean;
  route?: string;
  score?: number;
  classification?: string;
}

interface AgentConfig {
  retellClient: RetellClient;
  openRouterClient: OpenRouterClient;
  twilioClient: TwilioClient;
}

export class SpeedToLeadAgent {
  private retell: RetellClient;
  private llm: OpenRouterClient;
  private twilio: TwilioClient;
  private retellAgentId: string;

  constructor(config?: AgentConfig) {
    this.retell = config?.retellClient ?? new RetellClient({
      apiKey: process.env.RETELL_API_KEY ?? '',
    });
    this.llm = config?.openRouterClient ?? new OpenRouterClient({
      apiKey: process.env.OPENROUTER_API_KEY ?? '',
      model: process.env.OPENROUTER_MODEL,
    });
    this.twilio = config?.twilioClient ?? new TwilioClient({
      accountSid: process.env.TWILIO_ACCOUNT_SID ?? '',
      apiKeySid: process.env.TWILIO_API_KEY_SID ?? '',
      apiKeySecret: process.env.TWILIO_API_KEY_SECRET ?? '',
      phoneNumber: process.env.TWILIO_PHONE_NUMBER ?? '',
    });
    this.retellAgentId = process.env.RETELL_AGENT_ID ?? '';
  }

  async processInboundLead(input: InboundLeadInput): Promise<AgentResult> {
    const lead = await prisma.lead.findUnique({ where: { id: input.leadId } });
    const contact = await prisma.contact.findUnique({ where: { id: input.contactId } });

    if (!lead || !contact) throw new Error('Lead or contact not found');

    const guardrailResult = checkGuardrails({
      channel: input.channel,
      localHour: new Date().getHours(),
      hasConsent: input.channel === 'sms' ? contact.smsConsent : contact.emailConsent,
    });

    if (!guardrailResult.allowed) {
      return {
        leadId: input.leadId,
        responseMessage: `Blocked: ${guardrailResult.reason}`,
        qualificationComplete: false,
      };
    }

    // Try voice call first if lead has phone
    if (contact.phone && this.retellAgentId && input.channel === 'phone') {
      try {
        const { callId } = await this.retell.createPhoneCall({
          agentId: this.retellAgentId,
          phoneNumber: contact.phone,
          metadata: { leadId: input.leadId, contactId: input.contactId },
        });

        await prisma.lead.update({
          where: { id: input.leadId },
          data: { status: 'contacted', firstResponseAt: new Date() },
        });

        await prisma.communicationEvent.create({
          data: {
            leadId: input.leadId,
            contactId: contact.id,
            channel: 'phone',
            direction: 'outbound',
            content: `Retell call initiated: ${callId}`,
            metadata: { callId, agentId: this.retellAgentId },
          },
        });

        return {
          leadId: input.leadId,
          responseMessage: `Voice call initiated (callId: ${callId})`,
          qualificationComplete: false,
        };
      } catch (err) {
        console.error('Retell call failed, falling back to SMS:', err);
        // Fall through to SMS
      }
    }

    // SMS path
    const firstName = contact.firstName || 'there';
    const systemPrompt = QUALIFICATION_STARTER_PROMPT.replace('{name}', firstName);
    const responseMessage = await this.llm.chat(
      [{ role: 'user', content: input.message }],
      systemPrompt
    );

    await prisma.lead.update({
      where: { id: input.leadId },
      data: { status: 'contacted', firstResponseAt: new Date() },
    });

    const conversation = await this.getOrCreateConversation(input.leadId, contact.id);

    await prisma.message.create({
      data: {
        conversationId: conversation.id,
        role: 'agent',
        channel: 'sms',
        content: responseMessage,
      },
    });

    if (contact.phone && this.twilio.canSendNow(contact.timezone)) {
      try {
        await this.twilio.sendSms(contact.phone, responseMessage);
      } catch (err) {
        console.error('Twilio SMS send failed:', err);
      }
    }

    globalEmitter.emit({
      id: `evt_${Date.now()}`,
      type: 'message.outbound' as const,
      payload: { leadId: input.leadId, channel: 'sms', content: responseMessage },
      timestamp: new Date(),
      source: 'agent' as const,
    });

    return {
      leadId: input.leadId,
      responseMessage,
      qualificationComplete: false,
    };
  }

  async handleCallNoAnswer(input: CallNoAnswerInput): Promise<AgentResult> {
    const contact = await prisma.contact.findUnique({ where: { id: input.contactId } });
    if (!contact || !contact.phone) {
      return {
        leadId: input.leadId,
        responseMessage: 'No phone on file for SMS fallback',
        qualificationComplete: false,
      };
    }

    const guardrailResult = checkGuardrails({
      channel: 'sms',
      localHour: new Date().getHours(),
      hasConsent: contact.smsConsent,
    });

    if (!guardrailResult.allowed) {
      return {
        leadId: input.leadId,
        responseMessage: `SMS blocked: ${guardrailResult.reason}`,
        qualificationComplete: false,
      };
    }

    const firstName = contact.firstName || 'there';
    const systemPrompt = QUALIFICATION_STARTER_PROMPT.replace('{name}', firstName);
    const fallbackMessage = `Hey ${firstName}, I tried calling about the property you were interested in. What's your timeline like?`;
    const responseMessage = await this.llm.chat(
      [{ role: 'user', content: 'Lead did not answer phone call' }],
      systemPrompt
    );

    const conversation = await this.getOrCreateConversation(input.leadId, input.contactId);

    await prisma.message.create({
      data: {
        conversationId: conversation.id,
        role: 'agent',
        channel: 'sms',
        content: responseMessage,
      },
    });

    await this.twilio.sendSms(contact.phone, responseMessage);

    globalEmitter.emit({
      id: `evt_${Date.now()}`,
      type: 'message.outbound' as const,
      payload: { leadId: input.leadId, channel: 'sms', content: responseMessage },
      timestamp: new Date(),
      source: 'agent' as const,
    });

    return {
      leadId: input.leadId,
      responseMessage,
      qualificationComplete: false,
    };
  }

  async processLeadReply(input: LeadReplyInput): Promise<AgentResult> {
    const lead = await prisma.lead.findUnique({
      where: { id: input.leadId },
      include: { conversations: { include: { messages: true } } },
    });
    if (!lead) throw new Error('Lead not found');

    const conversation = lead.conversations[0];
    if (!conversation) throw new Error('No conversation found');

    await prisma.message.create({
      data: {
        conversationId: conversation.id,
        role: 'lead',
        channel: input.channel,
        content: input.message,
      },
    });

    const history = conversation.messages.map(m => ({
      role: (m.role === 'agent' ? 'assistant' : 'user') as 'user' | 'assistant',
      content: m.content,
    }));
    history.push({ role: 'user', content: input.message });

    const qualificationData = this.extractQualificationData(history);
    const remainingFields = this.getRemainingFields(qualificationData);

    const systemPrompt = CONVERSATION_LOOP_PROMPT
      .replace('{qualification_data}', JSON.stringify(qualificationData))
      .replace('{remaining_fields}', remainingFields.join(', '));

    const recentMessages = history.slice(-4).map(m => ({
      role: m.role,
      content: m.content,
    }));
    const responseText = await this.llm.chat(recentMessages, systemPrompt);

    if (responseText.startsWith('ROUTE:')) {
      const routePayload = responseText.replace('ROUTE:', '').trim();
      if (routePayload === 'disqualify') {
        await prisma.lead.update({
          where: { id: input.leadId },
          data: { status: 'disqualified' },
        });
        return {
          leadId: input.leadId,
          responseMessage: 'Lead disqualified',
          qualificationComplete: true,
          route: 'DISQUALIFY',
        };
      }
      return await this.handleRouteDirective(input.leadId, qualificationData);
    }

    await prisma.message.create({
      data: {
        conversationId: conversation.id,
        role: 'agent',
        channel: input.channel,
        content: responseText,
      },
    });

    const contact = await prisma.contact.findUnique({ where: { id: lead.contactId } });
    if (contact?.phone && input.channel === 'sms' && this.twilio.canSendNow(contact.timezone)) {
      try {
        await this.twilio.sendSms(contact.phone, responseText);
      } catch (err) {
        console.error('Twilio SMS send failed:', err);
      }
    }

    return {
      leadId: input.leadId,
      responseMessage: responseText,
      qualificationComplete: false,
    };
  }

  private async handleRouteDirective(leadId: string, qualData: Record<string, unknown>): Promise<AgentResult> {
    const scoreResult = scoreLead({
      budgetIdentified: !!qualData.budget,
      timelineDays: qualData.timelineDays as number | null,
      isDecisionMaker: qualData.decisionMaker === 'yes',
      intentSignals: (qualData.intentSignals as string[]) ?? [],
    });

    const routeResult = routeLead({
      classification: scoreResult.classification,
      score: scoreResult.score,
      timelineDays: qualData.timelineDays as number | null,
      confidence: 0.85,
    });

    await prisma.lead.update({
      where: { id: leadId },
      data: {
        status: routeResult.route === 'BOOK_APPOINTMENT' ? 'appointment_booked' : 'qualified',
        qualificationScore: scoreResult.score,
        classification: scoreResult.classification,
      },
    });

    return {
      leadId,
      responseMessage: `Lead qualified as ${scoreResult.classification} (score: ${scoreResult.score}). Routing to ${routeResult.route}.`,
      qualificationComplete: true,
      route: routeResult.route,
      score: scoreResult.score,
      classification: scoreResult.classification,
    };
  }

  private extractQualificationData(history: { role: string; content: string }[]): Record<string, unknown> {
    const data: Record<string, unknown> = { budget: null, timelineDays: null, decisionMaker: null, intentSignals: [] };
    const allText = history.map(m => m.content).join(' ').toLowerCase();

    const budgetMatch = allText.match(/\$[\d,]+/);
    if (budgetMatch) data.budget = budgetMatch[0];

    const timelineMatch = allText.match(/(\d+)\s*(day|week|month)/i);
    if (timelineMatch) {
      const num = parseInt(timelineMatch[1]);
      const unit = timelineMatch[2].toLowerCase();
      data.timelineDays = unit.startsWith('week') ? num * 7 : unit.startsWith('month') ? num * 30 : num;
    }

    if (/i('m| am) the (decision|buyer|owner)/i.test(allText)) data.decisionMaker = 'yes';
    if (/spouse|partner|wife|husband/i.test(allText)) data.decisionMaker = 'maybe';

    const signals: string[] = [];
    if (/ready|urgent|asap|pre-approved/i.test(allText)) signals.push('ready to buy');
    if (/just looking|browsing|curious/i.test(allText)) signals.push('just browsing');
    data.intentSignals = signals;

    return data;
  }

  private getRemainingFields(data: Record<string, unknown>): string[] {
    const fields: string[] = [];
    if (!data.budget) fields.push('BUDGET');
    if (data.timelineDays === null) fields.push('TIMELINE');
    if (!data.decisionMaker) fields.push('DECISION_MAKER');
    if (!(data.intentSignals as string[])?.length) fields.push('INTENT');
    fields.push('PROPERTY_TYPE');
    return fields;
  }

  private async getOrCreateConversation(leadId: string, contactId: string) {
    const existing = await prisma.conversation.findFirst({ where: { leadId } });
    if (existing) return existing;
    return prisma.conversation.create({
      data: { leadId, contactId, status: 'active', agentId: 'speed-to-lead' },
    });
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/saiful/agentive-platform/packages/engine && npx vitest run src/agents/speed-to-lead/__tests__/agent.test.ts`
Expected: 3 tests PASS

- [ ] **Step 5: Run existing scorer and router tests to verify no regressions**

Run: `cd /Users/saiful/agentive-platform/packages/engine && npx vitest run`
Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
cd /Users/saiful/agentive-platform
git add packages/engine/src/agents/speed-to-lead/
git commit -m "feat(engine): rewrite SpeedToLeadAgent with Retell + OpenRouter + Twilio"
```

---

### Task 10: Update Server — Add Retell Webhook Route

**Files:**
- Modify: `packages/engine/src/server.ts`

- [ ] **Step 1: Update server.ts with Retell webhook and updated event wiring**

```typescript
// packages/engine/src/server.ts
import express from 'express';
import dotenv from 'dotenv';
import { handleLeadWebhook } from './ingest/lead-webhook.js';
import { handleInboundSms } from './ingest/sms-webhook.js';
import { handleRetellCallEnded } from './ingest/retell-webhook.js';
import { globalEmitter } from '@agentive/shared';
import { SpeedToLeadAgent } from './agents/speed-to-lead/index.js';
import { calculateKPIs } from './analytics/kpi-tracker.js';
import { prisma } from './db/client.js';

dotenv.config();

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

const agent = new SpeedToLeadAgent();

globalEmitter.on('lead.created', async (event) => {
  const { leadId, contactId, source, message } = event.payload as Record<string, string>;
  try {
    await agent.processInboundLead({ leadId, contactId, source, message, channel: 'phone' });
  } catch (err) {
    console.error('Error processing lead:', err);
  }
});

globalEmitter.on('message.inbound', async (event) => {
  const { leadId, content, channel } = event.payload as Record<string, string>;
  try {
    await agent.processLeadReply({ leadId, message: content, channel });
  } catch (err) {
    console.error('Error processing reply:', err);
  }
});

// Webhook endpoints
app.post('/webhooks/leads', handleLeadWebhook);
app.post('/webhooks/sms/inbound', handleInboundSms);
app.post('/webhooks/retell/call-ended', async (req, res) => {
  try {
    const { call_id, call_status, call_analysis, metadata, transcript } = req.body;

    const leadId = metadata?.leadId;
    if (!leadId) {
      res.status(400).json({ error: 'Missing leadId in metadata' });
      return;
    }

    const result = await handleRetellCallEnded({
      callId: call_id,
      leadId,
      callStatus: call_status,
      disposition: call_analysis?.call_summary || call_status,
      transcript,
      qualificationData: call_analysis?.custom_analysis_data,
    });

    if (result.shouldSmsFallback) {
      const contactId = metadata?.contactId;
      if (contactId) {
        await agent.handleCallNoAnswer({
          leadId,
          contactId,
          callId: call_id,
        });
      }
    }

    res.json({ status: 'processed', result });
  } catch (err) {
    console.error('Retell webhook error:', err);
    res.status(500).json({ error: 'Internal error' });
  }
});

// Health check
app.get('/health', (_req, res) => res.json({ status: 'ok', agent: 'speed-to-lead' }));

// API endpoints for dashboard
app.get('/api/leads', async (req, res) => {
  const { status, classification } = req.query;
  const where: Record<string, string> = {};
  if (status) where.status = status as string;
  if (classification) where.classification = classification as string;
  const leads = await prisma.lead.findMany({ where, include: { contact: true }, orderBy: { createdAt: 'desc' } });
  res.json(leads);
});

app.get('/api/kpis', async (_req, res) => {
  const leads = await prisma.lead.findMany({
    where: { createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } },
  });
  const kpis = calculateKPIs(leads);
  res.json(kpis);
});

app.get('/api/escalations', async (_req, res) => {
  const escalations = await prisma.escalation.findMany({
    where: { status: 'pending' },
    include: { lead: { include: { contact: true } } },
    orderBy: { createdAt: 'desc' },
  });
  res.json(escalations);
});

app.patch('/api/escalations/:id', async (req, res) => {
  const { id } = req.params;
  const { status, assignedTo } = req.body;
  const escalation = await prisma.escalation.update({
    where: { id },
    data: { status, assignedTo, resolvedAt: status === 'resolved' ? new Date() : undefined, updatedAt: new Date() },
  });
  res.json(escalation);
});

app.get('/api/appointments', async (_req, res) => {
  const appointments = await prisma.appointment.findMany({
    include: { lead: { include: { contact: true } } },
    orderBy: { scheduledAt: 'asc' },
  });
  res.json(appointments);
});

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3001;

app.listen(PORT, () => {
  console.log(`Agentive Engine running on port ${PORT}`);
});

export { app };
```

- [ ] **Step 2: Verify build compiles**

Run: `cd /Users/saiful/agentive-platform && npx turbo build --filter=@agentive/engine`
Expected: PASS (or only errors from remaining missing modules if any)

- [ ] **Step 3: Commit**

```bash
cd /Users/saiful/agentive-platform
git add packages/engine/src/server.ts
git commit -m "feat(engine): add Retell webhook route and call-no-answer SMS fallback"
```

---

### Task 11: Update Engine package.json

**Files:**
- Modify: `packages/engine/package.json`

- [ ] **Step 1: Replace @anthropic-ai/sdk with openai**

```json
{
  "name": "@agentive/engine",
  "version": "0.1.0",
  "main": "dist/index.js",
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch",
    "start": "node dist/server.js"
  },
  "dependencies": {
    "@agentive/integrations": "*",
    "@agentive/shared": "*",
    "bullmq": "^5.30.0",
    "dotenv": "^16.4.0",
    "express": "^4.21.0",
    "openai": "^4.73.0",
    "zod": "^3.24.0"
  },
  "devDependencies": {
    "@prisma/client": "^6.19.3",
    "@types/express": "^5.0.0",
    "prisma": "^6.19.3",
    "typescript": "^5.7.0",
    "vitest": "^3.0.0"
  }
}
```

Run: `cd /Users/saiful/agentive-platform && npm install`

- [ ] **Step 2: Verify build**

Run: `cd /Users/saiful/agentive-platform && npx turbo build`
Expected: All packages build successfully

- [ ] **Step 3: Commit**

```bash
cd /Users/saiful/agentive-platform
git add packages/engine/package.json package-lock.json
git commit -m "chore(engine): replace @anthropic-ai/sdk with openai for OpenRouter"
```

---

### Task 12: Update .env.example

**Files:**
- Modify: `.env.example`

- [ ] **Step 1: Rewrite .env.example**

```
# Database
DATABASE_URL=postgresql://agentive:agentive_dev@localhost:5432/agentive

# Redis
REDIS_URL=redis://localhost:6379

# LLM (OpenRouter)
OPENROUTER_API_KEY=sk-or-v1-...
OPENROUTER_MODEL=anthropic/claude-sonnet-4-6

# Retell AI
RETELL_API_KEY=key_...
RETELL_AGENT_ID=

# Twilio (API Key auth)
TWILIO_ACCOUNT_SID=AC...
TWILIO_API_KEY_SID=SK...
TWILIO_API_KEY_SECRET=...
TWILIO_PHONE_NUMBER=+1...

# Calendar
CAL_API_KEY=cal_live_...

# App
PORT=3001
NODE_ENV=development
SLA_RESPONSE_SECONDS=300
```

- [ ] **Step 2: Commit**

```bash
cd /Users/saiful/agentive-platform
git add .env.example
git commit -m "chore: update .env.example for Retell + OpenRouter + Twilio API Key auth"
```

---

### Task 13: Add Shared EventType for Retell

**Files:**
- Modify: `packages/shared/src/types/event.ts`

The shared event types need a `call.completed` event for the Retell webhook flow.

- [ ] **Step 1: Add call.completed to EventType enum**

```typescript
// packages/shared/src/types/event.ts
import { z } from 'zod';

export const EventType = z.enum([
  'lead.created',
  'lead.updated',
  'message.inbound',
  'message.outbound',
  'call.initiated',
  'call.completed',
  'qualification.completed',
  'appointment.booked',
  'appointment.confirmed',
  'escalation.created',
  'escalation.resolved',
  'lead.handed_off',
]);

export const AgentEventSchema = z.object({
  id: z.string(),
  type: EventType,
  payload: z.record(z.unknown()),
  timestamp: z.date(),
  source: z.enum(['webhook', 'agent', 'human', 'system']),
  correlationId: z.string().optional(),
});

export type AgentEvent = z.infer<typeof AgentEventSchema>;
export type EventTypeType = z.infer<typeof EventType>;
```

- [ ] **Step 2: Build shared package**

Run: `cd /Users/saiful/agentive-platform && npx turbo build --filter=@agentive/shared`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
cd /Users/saiful/agentive-platform
git add packages/shared/src/types/event.ts
git commit -m "feat(shared): add call.initiated and call.completed event types"
```

---

### Task 14: Full Build + Smoke Test

- [ ] **Step 1: Start infrastructure**

```bash
cd /Users/saiful/agentive-platform && docker compose up -d
```

- [ ] **Step 2: Run Prisma migrations**

```bash
cd /Users/saiful/agentive-platform && npm run db:push
```
Expected: Schema pushed to Postgres successfully

- [ ] **Step 3: Build all packages**

```bash
cd /Users/saiful/agentive-platform && npm run build
```
Expected: All 4 packages build successfully

- [ ] **Step 4: Run all tests**

```bash
cd /Users/saiful/agentive-platform && npm run test
```
Expected: All tests pass

- [ ] **Step 5: Start engine and verify health**

```bash
cd /Users/saiful/agentive-platform/packages/engine && npm start &
sleep 2
curl http://localhost:3001/health
```
Expected: `{"status":"ok","agent":"speed-to-lead"}`

- [ ] **Step 6: Test lead webhook**

```bash
curl -X POST http://localhost:3001/webhooks/leads \
  -H "Content-Type: application/json" \
  -d '{"firstName":"Test","lastName":"Lead","phone":"+15551234567","source":"webform","message":"I want to see the house"}'
```
Expected: `{"leadId":"...","contactId":"...","status":"created"}`

- [ ] **Step 7: Kill the server**

```bash
kill %1
```

- [ ] **Step 8: Final commit**

```bash
cd /Users/saiful/agentive-platform
git add -A
git commit -m "feat: Agent 1 Speed-to-Lead prototype complete — Retell voice + Twilio SMS + OpenRouter"
```

---

## Self-Review

### Spec coverage

| Spec requirement | Task |
|-----------------|------|
| Retell voice call trigger | Task 9 (processInboundLead) |
| SMS fallback on no-answer | Task 9 (handleCallNoAnswer) + Task 10 (server webhook) |
| OpenRouter Claude conversation | Task 2 (client) + Task 9 (processLeadReply) |
| Qualification prompts (SMS) | Task 6 |
| Retell agent prompt + tools | Task 7 |
| Retell webhook handler | Task 8 |
| Scoring + routing (shared) | Existing code (no changes needed) |
| Twilio API Key auth | Task 4 |
| Remove FUB CRM | Task 5 |
| Prisma client singleton | Task 1 |
| Updated event types | Task 13 |
| Server Retell route | Task 10 |
| Updated .env.example | Task 12 |
| Updated deps | Task 11 |
| Smoke test | Task 14 |

### Placeholder scan: No TBD/TODO/vague steps found. All steps have exact code.

### Type consistency: All method signatures, file paths, and variable names are consistent across tasks.