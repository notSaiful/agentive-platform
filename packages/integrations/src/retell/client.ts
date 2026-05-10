interface RetellConfig {
  apiKey: string;
  baseUrl?: string;
}

interface CreateCallParams {
  agentId: string;
  fromNumber: string;
  toNumber: string;
  metadata?: Record<string, string>;
  dynamicVariables?: Record<string, string>;
}

interface CreateWebCallParams {
  agentId: string;
  metadata?: Record<string, string>;
  retellLlDynamicVariables?: Record<string, string>;
}

interface WebCallResult {
  callId: string;
  accessToken: string;
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
        from_number: params.fromNumber,
        to_number: params.toNumber,
        override_agent_id: params.agentId,
        metadata: params.metadata || {},
        retell_llm_dynamic_variables: params.dynamicVariables || {},
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

  async createWebCall(params: CreateWebCallParams): Promise<WebCallResult> {
    const response = await fetch(`${this.baseUrl}/create-web-call`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        agent_id: params.agentId,
        metadata: params.metadata || {},
        retell_llm_dynamic_variables: params.retellLlDynamicVariables || {},
      }),
    });

    if (!response.ok) throw new Error(`Retell API error: ${response.status}`);
    const data = await response.json() as any;
    return {
      callId: data.call_id,
      accessToken: data.access_token,
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