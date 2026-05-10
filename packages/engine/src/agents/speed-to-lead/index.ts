import { OpenRouterClient, RetellClient, TwilioClient } from '@agentive/integrations';
import { QUALIFICATION_STARTER_PROMPT } from '../../llm/prompts/qualification-starter.js';
import { CONVERSATION_LOOP_PROMPT } from '../../llm/prompts/conversation-loop.js';
import { scoreLead } from './scorer.js';
import { routeLead } from '../../orchestrator/router.js';
import { checkGuardrails } from '../../orchestrator/guardrails.js';
import { prisma } from '../../db/client.js';
import { globalEmitter } from '@agentive/shared';
import { DEFAULT_ORGANIZATION_ID } from '../../constants.js';

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

    // Try voice call first if lead has phone and agent is configured
    if (contact.phone && this.retellAgentId && input.channel === 'phone') {
      try {
        const { callId } = await this.retell.createPhoneCall({
          agentId: this.retellAgentId,
          fromNumber: process.env.TWILIO_PHONE_NUMBER ?? '',
          toNumber: contact.phone,
          metadata: { leadId: input.leadId, contactId: input.contactId },
          dynamicVariables: {
            event_type_id: process.env.CAL_EVENT_TYPE_ID ?? '5413213',
            specialist_phone_number: process.env.SPECIALIST_PHONE_NUMBER ?? '',
          },
        });

        await prisma.lead.update({
          where: { id: input.leadId },
          data: { status: 'contacted', firstResponseAt: new Date() },
        });

        await prisma.communicationEvent.create({
          data: {
            organizationId: DEFAULT_ORGANIZATION_ID,
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
        organizationId: DEFAULT_ORGANIZATION_ID,
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
    const responseMessage = await this.llm.chat(
      [{ role: 'user', content: 'Lead did not answer phone call' }],
      systemPrompt
    );

    const conversation = await this.getOrCreateConversation(input.leadId, input.contactId);

    await prisma.message.create({
      data: {
        organizationId: DEFAULT_ORGANIZATION_ID,
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
        organizationId: DEFAULT_ORGANIZATION_ID,
        conversationId: conversation.id,
        role: 'lead',
        channel: input.channel,
        content: input.message,
      },
    });

    const history = conversation.messages.map((m: { role: string; content: string }) => ({
      role: (m.role === 'agent' ? 'assistant' : 'user') as 'user' | 'assistant',
      content: m.content,
    }));
    history.push({ role: 'user', content: input.message });

    const qualificationData = this.extractQualificationData(history);
    const remainingFields = this.getRemainingFields(qualificationData);

    const systemPrompt = CONVERSATION_LOOP_PROMPT
      .replace('{qualification_data}', JSON.stringify(qualificationData))
      .replace('{remaining_fields}', remainingFields.join(', '));

    const recentMessages = history.slice(-4).map((m: { role: 'user' | 'assistant'; content: string }) => ({
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
        organizationId: DEFAULT_ORGANIZATION_ID,
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
      data: { organizationId: DEFAULT_ORGANIZATION_ID, leadId, contactId, status: 'active', agentId: 'speed-to-lead' },
    });
  }
}