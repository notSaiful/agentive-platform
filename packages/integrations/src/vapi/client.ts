import { CircuitBreaker } from '@agentive/shared';

interface VapiConfig {
  apiKey: string;
  baseUrl?: string;
}

interface CreateOutboundCallParams {
  assistantId: string;
  customerPhoneNumber: string;
  fromNumber?: string;
  metadata?: Record<string, unknown>;
}

interface CallResult {
  id: string;
  status: string;
  transcript?: string;
  recordingUrl?: string;
  summary?: string;
  startedAt?: string;
  endedAt?: string;
  durationSeconds?: number;
}

export class VapiClient {
  private apiKey: string;
  private baseUrl: string;
  private breaker: CircuitBreaker;

  constructor(config: VapiConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl || 'https://api.vapi.ai';
    this.breaker = new CircuitBreaker('vapi', { failureThreshold: 5, resetTimeoutMs: 30000 });
  }

  async createOutboundCall(params: CreateOutboundCallParams): Promise<{ callId: string }> {
    return this.breaker.execute(async () => {
      const response = await fetch(`${this.baseUrl}/call`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          assistantId: params.assistantId,
          customer: {
            number: params.customerPhoneNumber,
          },
          phoneNumberId: process.env.VAPI_PHONE_NUMBER_ID || params.fromNumber,
          metadata: params.metadata,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`VAPI error (${response.status}): ${error}`);
      }

      const data = await response.json();
      return { callId: data.id };
    });
  }

  async getCall(callId: string): Promise<CallResult> {
    return this.breaker.execute(async () => {
      const response = await fetch(`${this.baseUrl}/call/${callId}`, {
        headers: { 'Authorization': `Bearer ${this.apiKey}` },
      });

      if (!response.ok) throw new Error(`VAPI error: ${response.status}`);
      const data = await response.json();
      return {
        id: data.id,
        status: data.status,
        transcript: data.transcript,
        recordingUrl: data.recordingUrl,
        summary: data.analysis?.summary,
        startedAt: data.startedAt,
        endedAt: data.endedAt,
        durationSeconds: data.durationSeconds,
      };
    });
  }

  async updateAssistant(assistantId: string, updates: {
    model?: string;
    firstMessage?: string;
    voice?: { provider: string; voiceId: string };
    tools?: unknown[];
    server?: { url: string; secret: string };
  }): Promise<void> {
    return this.breaker.execute(async () => {
      const response = await fetch(`${this.baseUrl}/assistant/${assistantId}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updates),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`VAPI update error (${response.status}): ${error}`);
      }
    });
  }
}
