import { ChatOpenAI } from '@langchain/openai';
import { AgentExecutor, createToolCallingAgent } from 'langchain/agents';
import { ChatPromptTemplate, MessagesPlaceholder } from '@langchain/core/prompts';
import { HumanMessage, AIMessage, SystemMessage } from '@langchain/core/messages';
import { prisma } from '../../db/client.js';
import { DEFAULT_ORGANIZATION_ID } from '../../constants.js';
import { unifiedAgentTools } from './tools.js';
import { UNIFIED_AGENT_SYSTEM_PROMPT, QUALIFICATION_STARTER_PROMPT } from './prompts.js';
import { FollowUpNurtureAgent } from '../follow-up-nurture/index.js';
import { checkGuardrails } from '../../orchestrator/guardrails.js';
import { globalEmitter } from '@agentive/shared';
import { createTraceRunId, startTrace, endTrace } from '../sarah-demo/tracer.js';
import { TwilioClient, VapiClient } from '@agentive/integrations';

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

interface AgentResult {
  leadId: string;
  responseMessage: string;
  qualificationComplete: boolean;
  route?: string;
  score?: number;
  classification?: string;
}

export class UnifiedAgent {
  private executor: AgentExecutor;
  private twilio: TwilioClient;
  private vapi: VapiClient;

  constructor() {
    const model = new ChatOpenAI({
      modelName: process.env.OPENROUTER_MODEL ?? 'anthropic/claude-sonnet-4-6',
      temperature: 0.7,
      maxTokens: 500,
      configuration: {
        baseURL: 'https://openrouter.ai/api/v1',
        defaultHeaders: {
          'HTTP-Referer': 'https://agentive.ai',
          'X-Title': 'Agentive Unified Agent',
        },
      },
      apiKey: process.env.OPENROUTER_API_KEY,
    });

    const prompt = ChatPromptTemplate.fromMessages([
      new SystemMessage(UNIFIED_AGENT_SYSTEM_PROMPT),
      new MessagesPlaceholder('chat_history'),
      new HumanMessage('{input}'),
      new MessagesPlaceholder('agent_scratchpad'),
    ]);

    const agent = createToolCallingAgent({ llm: model, tools: unifiedAgentTools, prompt });

    this.executor = new AgentExecutor({
      agent,
      tools: unifiedAgentTools,
      maxIterations: 5,
      verbose: process.env.NODE_ENV === 'development',
    });

    this.twilio = new TwilioClient({
      accountSid: process.env.TWILIO_ACCOUNT_SID ?? '',
      apiKeySid: process.env.TWILIO_API_KEY_SID ?? '',
      apiKeySecret: process.env.TWILIO_API_KEY_SECRET ?? '',
      phoneNumber: process.env.TWILIO_PHONE_NUMBER ?? '',
    });

    this.vapi = new VapiClient({
      apiKey: process.env.VAPI_API_KEY ?? '',
    });
  }

  async processInboundLead(input: InboundLeadInput): Promise<AgentResult> {
    const runId = createTraceRunId();

    await startTrace({
      runId,
      name: 'processInboundLead',
      runType: 'chain',
      inputs: input as unknown as Record<string, unknown>,
      tags: ['unified-agent', 'inbound-lead'],
      metadata: { leadId: input.leadId, source: input.source },
    });

    try {
      const lead = await prisma.lead.findUnique({ where: { id: input.leadId } });
      const contact = await prisma.contact.findUnique({ where: { id: input.contactId } });
      if (!lead || !contact) throw new Error('Lead or contact not found');

      // Guardrails
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

      // Voice call path (VAPI)
      if (input.channel === 'phone' && contact.phone) {
        try {
          const { callId } = await this.vapi.createOutboundCall({
            assistantId: process.env.VAPI_ASSISTANT_ID ?? '',
            customerPhoneNumber: contact.phone,
            fromNumber: process.env.TWILIO_PHONE_NUMBER,
            metadata: {
              leadId: input.leadId,
              contactId: input.contactId,
              source: input.source,
            },
          });

          await prisma.communicationEvent.create({
            data: {
              organizationId: DEFAULT_ORGANIZATION_ID,
              leadId: input.leadId,
              contactId: contact.id,
              channel: 'phone',
              direction: 'outbound',
              content: `VAPI outbound call initiated: ${callId}`,
              metadata: { callId, assistantId: process.env.VAPI_ASSISTANT_ID },
            },
          });

          await prisma.lead.update({
            where: { id: input.leadId },
            data: { status: 'contacted', firstResponseAt: new Date() },
          });

          return {
            leadId: input.leadId,
            responseMessage: `Voice call initiated (callId: ${callId})`,
            qualificationComplete: false,
          };
        } catch (err) {
          console.error('VAPI call failed, falling back to SMS:', err);
          // Fall through to SMS
        }
      }

      // Build prompt for first contact
      const firstName = contact.firstName || 'there';
      const systemPrompt = QUALIFICATION_STARTER_PROMPT.replace('{name}', firstName);

      // Run the agent
      const result = await this.executor.invoke({
        input: `${systemPrompt}\n\nLead message: "${input.message}"\n\nContact: ${firstName}, Phone: ${contact.phone ?? 'N/A'}, Email: ${contact.email ?? 'N/A'}`,
        chat_history: [],
      });

      const responseText = result.output as string;

      // Save conversation
      const conversation = await this.getOrCreateConversation(input.leadId, contact.id);
      await prisma.message.create({
        data: {
          organizationId: DEFAULT_ORGANIZATION_ID,
          conversationId: conversation.id,
          role: 'agent',
          channel: input.channel,
          content: responseText,
        },
      });

      // Update lead status
      await prisma.lead.update({
        where: { id: input.leadId },
        data: { status: 'contacted', firstResponseAt: new Date() },
      });

      // Send SMS if channel is SMS (or phone fallback)
      if (contact.phone && this.twilio.canSendNow(contact.timezone)) {
        try {
          await this.twilio.sendSms(contact.phone, responseText);
        } catch (err) {
          console.error('SMS send failed:', err);
          // Don't crash — the message is already saved and the agent response is valid
        }
      }

      // Emit event
      globalEmitter.emit({
        id: `evt_${Date.now()}`,
        type: 'message.outbound' as const,
        payload: { leadId: input.leadId, channel: input.channel, content: responseText },
        timestamp: new Date(),
        source: 'agent' as const,
      });

      // Check if agent routed the lead
      const routeMatch = responseText.match(/ROUTE:\s*(\d+|disqualify)/i);
      if (routeMatch) {
        return this.handleRouteFromAgent(input.leadId, routeMatch[1], contact.id);
      }

      await endTrace({ runId, outputs: { responseText, status: 'contacted' } });

      return {
        leadId: input.leadId,
        responseMessage: responseText,
        qualificationComplete: false,
      };
    } catch (err) {
      await endTrace({ runId, error: (err as Error).message });
      throw err;
    }
  }

  async processLeadReply(input: LeadReplyInput): Promise<AgentResult> {
    const runId = createTraceRunId();

    await startTrace({
      runId,
      name: 'processLeadReply',
      runType: 'chain',
      inputs: input as unknown as Record<string, unknown>,
      tags: ['unified-agent', 'lead-reply'],
      metadata: { leadId: input.leadId },
    });

    try {
      const lead = await prisma.lead.findUnique({
        where: { id: input.leadId },
        include: { conversations: { include: { messages: true } }, contact: true },
      });
      if (!lead || !lead.contact) throw new Error('Lead or contact not found');

      const conversation = lead.conversations[0];
      if (!conversation) throw new Error('No conversation found');

      // Save inbound message
      await prisma.message.create({
        data: {
          organizationId: DEFAULT_ORGANIZATION_ID,
          conversationId: conversation.id,
          role: 'lead',
          channel: input.channel,
          content: input.message,
        },
      });

      // Build chat history for LangChain
      const chatHistory = conversation.messages.map((m) =>
        m.role === 'agent'
          ? new AIMessage(m.content)
          : new HumanMessage(m.content)
      );

      // Run the agent
      const result = await this.executor.invoke({
        input: `Lead replied: "${input.message}"\n\nLead status: ${lead.status}, Score: ${lead.qualificationScore ?? 'N/A'}, Classification: ${lead.classification ?? 'N/A'}`,
        chat_history: chatHistory,
      });

      const responseText = result.output as string;

      // Save agent response
      await prisma.message.create({
        data: {
          organizationId: DEFAULT_ORGANIZATION_ID,
          conversationId: conversation.id,
          role: 'agent',
          channel: input.channel,
          content: responseText,
        },
      });

      // Send SMS if applicable
      if (input.channel === 'sms' && lead.contact.phone && this.twilio.canSendNow(lead.contact.timezone)) {
        try {
          await this.twilio.sendSms(lead.contact.phone, responseText);
        } catch (err) {
          console.error('SMS send failed:', err);
        }
      }

      globalEmitter.emit({
        id: `evt_${Date.now()}`,
        type: 'message.outbound' as const,
        payload: { leadId: input.leadId, channel: input.channel, content: responseText },
        timestamp: new Date(),
        source: 'agent' as const,
      });

      // Check for ROUTE directive
      const routeMatch = responseText.match(/ROUTE:\s*(\d+|disqualify)/i);
      if (routeMatch) {
        return this.handleRouteFromAgent(input.leadId, routeMatch[1], lead.contact.id);
      }

      await endTrace({ runId, outputs: { responseText, status: lead.status } });

      return {
        leadId: input.leadId,
        responseMessage: responseText,
        qualificationComplete: false,
      };
    } catch (err) {
      await endTrace({ runId, error: (err as Error).message });
      throw err;
    }
  }

  async runNurtureDaily(organizationId?: string): Promise<{ processed: number; sent: number; failed: number; skipped: number }> {
    const nurture = new FollowUpNurtureAgent({ organizationId });
    return nurture.runDailyHealthCheck(organizationId);
  }

  async runColdRevival(organizationId?: string): Promise<{ processed: number; sent: number; failed: number }> {
    const nurture = new FollowUpNurtureAgent({ organizationId });
    return nurture.runColdRevivalCampaign(organizationId);
  }

  private async handleRouteFromAgent(leadId: string, routeValue: string, contactId: string): Promise<AgentResult> {
    if (routeValue.toLowerCase() === 'disqualify') {
      await prisma.lead.update({ where: { id: leadId }, data: { status: 'disqualified' } });
      return { leadId, responseMessage: 'Lead disqualified', qualificationComplete: true, route: 'DISQUALIFY' };
    }

    const score = parseInt(routeValue, 10);
    const classification = score >= 80 ? 'HOT' : score >= 50 ? 'WARM' : 'COLD';

    // Auto-sync to CRM on any qualified lead
    if (score >= 50) {
      try {
        const { syncCrmTool } = await import('./tools.js');
        await syncCrmTool.invoke({ leadId, contactId, action: 'create' });
      } catch (err) {
        console.error('CRM sync failed:', err);
      }
    }

    if (classification === 'HOT') {
      // Try to book appointment
      try {
        const { bookAppointmentTool } = await import('./tools.js');
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        const nextWeek = new Date();
        nextWeek.setDate(nextWeek.getDate() + 7);

        await bookAppointmentTool.invoke({
          leadId,
          contactId,
          eventTypeId: process.env.CAL_EVENT_TYPE_ID ?? '5413213',
          dateFrom: tomorrow.toISOString().split('T')[0],
          dateTo: nextWeek.toISOString().split('T')[0],
          timezone: 'America/New_York',
        });

        return {
          leadId,
          responseMessage: `Lead qualified as HOT (score: ${score}). Appointment booked. Broker notified.`,
          qualificationComplete: true,
          route: 'BOOK_APPOINTMENT',
          score,
          classification,
        };
      } catch (err) {
        console.error('Auto-booking failed:', err);
        // Fall through to nurture
      }
    }

    // Schedule nurture for WARM and COLD
    try {
      const { scheduleNurtureTool } = await import('./tools.js');
      await scheduleNurtureTool.invoke({ leadId });
    } catch (err) {
      console.error('Nurture scheduling failed:', err);
    }

    await prisma.lead.update({
      where: { id: leadId },
      data: { status: 'nurture', qualificationScore: score, classification },
    });

    return {
      leadId,
      responseMessage: `Lead qualified as ${classification} (score: ${score}). Scheduled for nurture follow-up.`,
      qualificationComplete: true,
      route: 'NURTURE',
      score,
      classification,
    };
  }

  private async getOrCreateConversation(leadId: string, contactId: string) {
    const existing = await prisma.conversation.findFirst({ where: { leadId } });
    if (existing) return existing;
    return prisma.conversation.create({
      data: { organizationId: DEFAULT_ORGANIZATION_ID, leadId, contactId, status: 'active', agentId: 'unified' },
    });
  }
}
