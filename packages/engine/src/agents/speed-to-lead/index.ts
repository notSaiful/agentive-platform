import { ClaudeClient } from '../../llm/client.js';
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

interface AgentResult {
  leadId: string;
  responseMessage: string;
  qualificationComplete: boolean;
  route?: string;
  score?: number;
  classification?: string;
}

export class SpeedToLeadAgent {
  private claude: ClaudeClient;

  constructor(claudeClient?: ClaudeClient) {
    this.claude = claudeClient ?? new ClaudeClient({
      apiKey: process.env.ANTHROPIC_API_KEY ?? '',
    });
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

    const firstName = contact.firstName || 'there';
    const systemPrompt = QUALIFICATION_STARTER_PROMPT.replace('{name}', firstName);
    const responseMessage = await this.claude.chat(systemPrompt, [
      { role: 'user', content: input.message },
    ]);

    await prisma.lead.update({
      where: { id: input.leadId },
      data: { status: 'contacted', firstResponseAt: new Date() },
    });

    const conversation = await this.getOrCreateConversation(input.leadId, contact.id);

    await prisma.message.create({
      data: {
        conversationId: conversation.id,
        role: 'agent',
        channel: input.channel,
        content: responseMessage,
      },
    });

    if (guardrailResult.allowed) {
      globalEmitter.emit({
        id: `evt_${Date.now()}`,
        type: 'message.outbound' as const,
        payload: { leadId: input.leadId, channel: input.channel, content: responseMessage },
        timestamp: new Date(),
        source: 'agent' as const,
      });
    }

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
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }));
    history.push({ role: 'user', content: input.message });

    const qualificationData = this.extractQualificationData(history);
    const remainingFields = this.getRemainingFields(qualificationData);

    const systemPrompt = CONVERSATION_LOOP_PROMPT
      .replace('{qualification_data}', JSON.stringify(qualificationData))
      .replace('{remaining_fields}', remainingFields.join(', '))
      .replace('{conversation_history}', history.map(m => `${m.role}: ${m.content}`).join('\n'));

    const responseText = await this.claude.chat(systemPrompt, history.slice(-4));

    if (responseText.startsWith('ROUTE:')) {
      return await this.handleRouteDirective(input.leadId, responseText, qualificationData);
    }

    await prisma.message.create({
      data: {
        conversationId: conversation.id,
        role: 'agent',
        channel: input.channel,
        content: responseText,
      },
    });

    return {
      leadId: input.leadId,
      responseMessage: responseText,
      qualificationComplete: false,
    };
  }

  private async handleRouteDirective(leadId: string, directive: string, qualData: Record<string, unknown>): Promise<AgentResult> {
    const routeType = directive.replace('ROUTE:', '').split(':')[0];
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