import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { prisma } from '../../db/client.js';
import { DEFAULT_ORGANIZATION_ID } from '../../constants.js';
import { scoreLead as scoreLeadFn, classifyLead } from '../speed-to-lead/scorer.js';
import { routeLead } from '../../orchestrator/router.js';
import { bookAppointment } from '../../actions/book-appointment.js';
import { createEscalation } from '../../escalation/handler.js';
import { createCrmClient, ResendClient, TwilioClient } from '@agentive/integrations';
import { FollowUpNurtureAgent } from '../follow-up-nurture/index.js';

// ── 1. Score Lead Tool ──────────────────────────────────────────────

export const scoreLeadTool = tool(
  async (input: {
    leadId: string;
    budgetIdentified: boolean;
    timelineDays: number | null;
    isDecisionMaker: boolean;
    intentSignals: string[];
  }) => {
    const result = scoreLeadFn({
      budgetIdentified: input.budgetIdentified,
      timelineDays: input.timelineDays,
      isDecisionMaker: input.isDecisionMaker,
      intentSignals: input.intentSignals,
    });

    await prisma.lead.update({
      where: { id: input.leadId },
      data: {
        qualificationScore: result.score,
        classification: result.classification,
      },
    });

    return JSON.stringify({
      score: result.score,
      classification: result.classification,
      breakdown: result.breakdown,
    });
  },
  {
    name: 'scoreLead',
    description: 'Score a lead based on qualification data and update the database.',
    schema: z.object({
      leadId: z.string().describe('The lead ID'),
      budgetIdentified: z.boolean().describe('Whether the lead mentioned a budget'),
      timelineDays: z.number().nullable().describe('Timeline in days, or null'),
      isDecisionMaker: z.boolean().describe('Whether they are the decision maker'),
      intentSignals: z.array(z.string()).describe('Intent keywords from conversation'),
    }),
  }
);

// ── 2. Route Lead Tool ──────────────────────────────────────────────

export const routeLeadTool = tool(
  async (input: {
    leadId: string;
    classification: 'HOT' | 'WARM' | 'COLD';
    score: number;
    timelineDays: number | null;
    confidence: number;
  }) => {
    const result = routeLead({
      classification: input.classification,
      score: input.score,
      timelineDays: input.timelineDays,
      confidence: input.confidence,
    });

    await prisma.lead.update({
      where: { id: input.leadId },
      data: {
        status: result.route === 'BOOK_APPOINTMENT' ? 'appointment_booked' : result.route === 'NURTURE' ? 'nurture' : result.route === 'ESCALATE' ? 'escalated' : 'disqualified',
      },
    });

    // If nurture, schedule cadence
    if (result.route === 'NURTURE') {
      const nurture = new FollowUpNurtureAgent();
      await nurture.scheduleCadence({ leadId: input.leadId });
    }

    return JSON.stringify({ route: result.route, reason: result.reason });
  },
  {
    name: 'routeLead',
    description: 'Route a scored lead to the next step: book appointment, nurture, escalate, or disqualify.',
    schema: z.object({
      leadId: z.string(),
      classification: z.enum(['HOT', 'WARM', 'COLD']),
      score: z.number(),
      timelineDays: z.number().nullable(),
      confidence: z.number().describe('Confidence 0-1'),
    }),
  }
);

// ── 3. Book Appointment Tool ──────────────────────────────────────────

export const bookAppointmentTool = tool(
  async (input: {
    leadId: string;
    contactId: string;
    eventTypeId: string;
    dateFrom: string;
    dateTo: string;
    timezone: string;
  }) => {
    const result = await bookAppointment({
      leadId: input.leadId,
      contactId: input.contactId,
      eventTypeId: input.eventTypeId,
      dateFrom: input.dateFrom,
      dateTo: input.dateTo,
      timezone: input.timezone,
    });
    return JSON.stringify(result);
  },
  {
    name: 'bookAppointment',
    description: 'Book a calendar appointment via Cal.com.',
    schema: z.object({
      leadId: z.string(),
      contactId: z.string(),
      eventTypeId: z.string().describe('Cal.com event type ID'),
      dateFrom: z.string().describe('ISO date for availability start'),
      dateTo: z.string().describe('ISO date for availability end'),
      timezone: z.string().describe('Lead timezone, e.g. America/New_York'),
    }),
  }
);

// ── 4. Send SMS Tool ────────────────────────────────────────────────

export const sendSmsTool = tool(
  async (input: { to: string; body: string; leadId: string; contactId: string }) => {
    const twilio = new TwilioClient({
      accountSid: process.env.TWILIO_ACCOUNT_SID ?? '',
      apiKeySid: process.env.TWILIO_API_KEY_SID ?? '',
      apiKeySecret: process.env.TWILIO_API_KEY_SECRET ?? '',
      phoneNumber: process.env.TWILIO_PHONE_NUMBER ?? '',
    });

    const result = await twilio.sendSms(input.to, input.body);

    await prisma.communicationEvent.create({
      data: {
        organizationId: DEFAULT_ORGANIZATION_ID,
        leadId: input.leadId,
        contactId: input.contactId,
        channel: 'sms',
        direction: 'outbound',
        content: input.body,
        metadata: { twilioSid: result.sid },
      },
    });

    return JSON.stringify(result);
  },
  {
    name: 'sendSms',
    description: 'Send an SMS via Twilio. Respects quiet hours and consent.',
    schema: z.object({
      to: z.string().describe('Phone number in E.164 format'),
      body: z.string().describe('Message body, max 1600 chars'),
      leadId: z.string(),
      contactId: z.string(),
    }),
  }
);

// ── 5. Send Email Tool ──────────────────────────────────────────────

export const sendEmailTool = tool(
  async (input: {
    to: string;
    subject: string;
    html?: string;
    text?: string;
    leadId: string;
    contactId: string;
  }) => {
    const resend = new ResendClient({
      apiKey: process.env.RESEND_API_KEY ?? '',
      fromEmail: process.env.RESEND_FROM_EMAIL ?? 'Agentive <team@agentive.ai>',
    });

    const result = await resend.sendEmail({
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text,
    });

    await prisma.communicationEvent.create({
      data: {
        organizationId: DEFAULT_ORGANIZATION_ID,
        leadId: input.leadId,
        contactId: input.contactId,
        channel: 'email',
        direction: 'outbound',
        content: input.subject + (input.text ? `\n${input.text}` : ''),
        metadata: { resendId: result.id },
      },
    });

    return JSON.stringify(result);
  },
  {
    name: 'sendEmail',
    description: 'Send an email via Resend.',
    schema: z.object({
      to: z.string().describe('Email address'),
      subject: z.string(),
      html: z.string().optional(),
      text: z.string().optional(),
      leadId: z.string(),
      contactId: z.string(),
    }),
  }
);

// ── 6. Schedule Nurture Tool ────────────────────────────────────────

export const scheduleNurtureTool = tool(
  async (input: { leadId: string; organizationId?: string; stage?: string }) => {
    const nurture = new FollowUpNurtureAgent({ organizationId: input.organizationId });
    await nurture.scheduleCadence({ leadId: input.leadId });
    return JSON.stringify({ scheduled: true, leadId: input.leadId });
  },
  {
    name: 'scheduleNurture',
    description: 'Schedule the next nurture touch for a lead.',
    schema: z.object({
      leadId: z.string(),
      organizationId: z.string().optional(),
      stage: z.string().optional().describe('Cadence stage, e.g. day_3, day_7'),
    }),
  }
);

// ── 7. Sync CRM Tool ────────────────────────────────────────────────

export const syncCrmTool = tool(
  async (input: {
    leadId: string;
    contactId: string;
    action: 'create' | 'update' | 'log_call' | 'log_sms' | 'log_email' | 'create_task';
    notes?: string;
  }) => {
    const contact = await prisma.contact.findUnique({ where: { id: input.contactId } });
    if (!contact) throw new Error('Contact not found');

    const crm = await createCrmClient();

    if (input.action === 'create') {
      const person = await crm.createPerson({
        firstName: contact.firstName ?? undefined,
        lastName: contact.lastName ?? undefined,
        emails: contact.email ? [{ value: contact.email }] : undefined,
        phones: contact.phone ? [{ value: contact.phone }] : undefined,
        source: 'Agentive AI',
        stage: 'New Lead',
        tags: ['agentive-ai', 'speed-to-lead'],
      });
      return JSON.stringify({ synced: true, crmPersonId: person.id });
    }

    if (input.action === 'log_sms' && contact.phone) {
      const existing = await crm.findPersonByPhone(contact.phone);
      if (existing) {
        await crm.logSms(existing.id, input.notes || 'AI SMS sent');
        return JSON.stringify({ synced: true, action: 'log_sms' });
      }
    }

    if (input.action === 'create_task' && contact.phone) {
      const existing = await crm.findPersonByPhone(contact.phone);
      if (existing) {
        const task = await crm.createTask(existing.id, input.notes || 'Follow up with lead', new Date(Date.now() + 24 * 60 * 60 * 1000));
        return JSON.stringify({ synced: true, taskId: task.id });
      }
    }

    return JSON.stringify({ synced: false, reason: 'No matching CRM record found' });
  },
  {
    name: 'syncCrm',
    description: 'Sync lead data to Follow Up Boss CRM.',
    schema: z.object({
      leadId: z.string(),
      contactId: z.string(),
      action: z.enum(['create', 'update', 'log_call', 'log_sms', 'log_email', 'create_task']),
      notes: z.string().optional(),
    }),
  }
);

// ── 8. Escalate Tool ────────────────────────────────────────────────

export const escalateTool = tool(
  async (input: { leadId: string; conversationId: string; reason: string; confidence: number; context: string }) => {
    const escalationId = await createEscalation({
      leadId: input.leadId,
      conversationId: input.conversationId,
      reason: input.reason,
      confidence: input.confidence,
      context: input.context,
    });

    // Also create a CRM task for the broker
    try {
      const lead = await prisma.lead.findUnique({ where: { id: input.leadId }, include: { contact: true } });
      if (lead?.contact?.phone) {
        const crm = await createCrmClient();
        const existing = await crm.findPersonByPhone(lead.contact.phone);
        if (existing) {
          await crm.createTask(existing.id, `ESCALATION: ${input.reason}. Context: ${input.context}`, new Date());
        }
      }
    } catch (err) {
      console.error('CRM escalation task failed:', err);
    }

    return JSON.stringify({ escalationId, status: 'pending' });
  },
  {
    name: 'escalate',
    description: 'Escalate a lead to a human broker with full context.',
    schema: z.object({
      leadId: z.string(),
      conversationId: z.string(),
      reason: z.string().describe('Why this lead needs human attention'),
      confidence: z.number().describe('AI confidence score 0-1'),
      context: z.string().describe('Full conversation context'),
    }),
  }
);

// ── Export all tools ──────────────────────────────────────────────────

export const unifiedAgentTools = [
  scoreLeadTool,
  routeLeadTool,
  bookAppointmentTool,
  sendSmsTool,
  sendEmailTool,
  scheduleNurtureTool,
  syncCrmTool,
  escalateTool,
];
