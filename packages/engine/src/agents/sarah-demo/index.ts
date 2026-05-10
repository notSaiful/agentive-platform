import { RetellClient } from '@agentive/integrations';
import { runSarahOrchestrator, getQualificationData } from './orchestrator.js';
import { prisma } from '../../db/client.js';

interface StartDemoInput {
  visitorId: string;
  source?: string;
  metadata?: Record<string, string>;
}

interface StartDemoResult {
  callId: string;
  accessToken: string;
  sessionId: string;
}

interface DemoStatus {
  callId: string;
  status: 'active' | 'ended' | 'error';
  transcript?: string;
  qualificationData?: Record<string, unknown>;
}

export class SarahDemoAgent {
  private retell: RetellClient;
  private retellAgentId: string;

  constructor(config?: { retellClient?: RetellClient; retellAgentId?: string }) {
    this.retell =
      config?.retellClient ??
      new RetellClient({
        apiKey: process.env.RETELL_API_KEY ?? '',
      });
    this.retellAgentId = config?.retellAgentId ?? process.env.RETELL_DEMO_AGENT_ID ?? '';
  }

  async startDemo(input: StartDemoInput): Promise<StartDemoResult> {
    if (!this.retellAgentId) {
      throw new Error('RETELL_DEMO_AGENT_ID is not configured');
    }

    const sessionId = `demo_${input.visitorId}_${Date.now()}`;

    // Create a web call via Retell
    const { callId, accessToken } = await this.retell.createWebCall({
      agentId: this.retellAgentId,
      metadata: {
        ...input.metadata,
        sessionId,
        visitorId: input.visitorId,
        source: input.source ?? 'website-demo',
      },
      retellLlDynamicVariables: {
        prospect_name: 'there',
        company_name: 'your firm',
      },
    });

    // Log demo session start
    try {
      await prisma.communicationEvent.create({
        data: {
          leadId: sessionId,
          contactId: input.visitorId,
          channel: 'web-voice',
          direction: 'outbound',
          content: `Sarah demo started. CallId: ${callId}`,
          metadata: { callId, sessionId, source: input.source },
        },
      });
    } catch {
      // Non-blocking: Prisma might not be connected in quick demos
    }

    return { callId, accessToken, sessionId };
  }

  async endDemo(callId: string): Promise<void> {
    // Retell web calls end when the client disconnects, but we can log it
    try {
      const call = await this.retell.getCall(callId);
      await prisma.communicationEvent.create({
        data: {
          leadId: callId,
          contactId: '',
          channel: 'web-voice',
          direction: 'outbound',
          content: `Sarah demo ended. Status: ${call.callStatus}`,
          metadata: { callId, transcript: call.transcript },
        },
      });
    } catch {
      // Best-effort logging
    }
  }

  async getDemoStatus(callId: string, sessionId: string): Promise<DemoStatus> {
    try {
      const call = await this.retell.getCall(callId);
      const qualificationData = getQualificationData(sessionId);

      return {
        callId,
        status: call.callStatus === 'ended' ? 'ended' : 'active',
        transcript: call.transcript,
        qualificationData: qualificationData ? (qualificationData as unknown as Record<string, unknown>) : undefined,
      };
    } catch {
      return { callId, status: 'error' };
    }
  }

  // Webhook handler for Retell demo call-ended events
  async handleDemoCallEnded(payload: {
    call_id: string;
    call_status: string;
    call_analysis?: Record<string, unknown>;
    transcript?: string;
    metadata?: Record<string, string>;
  }): Promise<void> {
    const sessionId = payload.metadata?.sessionId;
    if (!sessionId) return;

    // If no qualification data was collected via tools, try to extract from Retell's analysis
    const existingQual = getQualificationData(sessionId);
    if (!existingQual && payload.call_analysis) {
      // Attempt to parse analysis data if Retell was configured with custom analysis
      const analysis = payload.call_analysis as Record<string, unknown>;
      // Store whatever we can — the orchestrator tool calls are the primary source
      console.log('Demo call ended. Analysis:', analysis);
    }

    console.log(`Demo session ${sessionId} ended. Transcript length: ${payload.transcript?.length ?? 0}`);
  }
}
