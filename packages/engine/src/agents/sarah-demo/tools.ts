import { tool } from '@langchain/core/tools';
import { z } from 'zod';

// ── Pricing Info Tool ───────────────────────────────────────────────

const PRICING_TIERS: Record<string, string> = {
  starter:
    'Starter at $49 per month: 1 AI voice agent, 100 calls per month, Cal.com integration, basic SMS follow-up. Perfect for solo agents.',
  growth:
    'Growth at $149 per month: 3 AI agents, unlimited calls, Twilio SMS + voice, CRM sync, appointment booking, and lead scoring. Best for small teams.',
  enterprise:
    'Enterprise at $499 per month: Unlimited agents, white-glove onboarding, custom integrations, dedicated support, and SLA guarantees. For firms with 20+ agents.',
};

export const getPricingInfoTool = tool(
  async ({ tier }: { tier?: string }) => {
    if (tier && PRICING_TIERS[tier]) {
      return PRICING_TIERS[tier];
    }
    return Object.values(PRICING_TIERS).join('\n\n');
  },
  {
    name: 'getPricingInfo',
    description: 'Explain Agentive pricing tiers. Call when the user asks about cost or budget.',
    schema: z.object({
      tier: z.enum(['starter', 'growth', 'enterprise']).optional().describe('Which tier to explain. Omit to get all tiers.'),
    }),
  }
);

// ── Integration List Tool ─────────────────────────────────────────

const INTEGRATIONS = [
  'Cal.com — Appointment scheduling',
  'Twilio — SMS and voice',
  'Follow Up Boss — CRM sync',
  'HubSpot — CRM and pipeline management',
  'Retell AI — Voice agent runtime',
  'Zapier — Connect to 5,000+ apps',
  'Google Calendar — Two-way sync',
  'Make.com — Advanced workflows',
];

export const getIntegrationListTool = tool(
  async () => {
    return `Agentive integrates with the following platforms:\n${INTEGRATIONS.map((i) => `- ${i}`).join('\n')}\n\nNeed a custom integration? We can build it in under 2 weeks.`;
  },
  {
    name: 'getIntegrationList',
    description: 'List CRM, calendar, and phone integrations Agentive supports.',
    schema: z.object({}),
  }
);

// ── Escalate to Human Tool ────────────────────────────────────────

export const escalateToHumanTool = tool(
  async ({ reason }: { reason: string }) => {
    return `Escalated to human team. Reason: ${reason}. Saiful or a team member will reach out within 2 hours.`;
  },
  {
    name: 'escalateToHuman',
    description: 'Escalate the conversation to a human team member.',
    schema: z.object({
      reason: z.string().describe('Why you are escalating'),
    }),
  }
);

// ── Book Demo Appointment Tool ────────────────────────────────────

export const bookDemoAppointmentTool = tool(
  async (input: { name: string; email: string; company?: string; role?: string; preferredTime?: string }) => {
    // In production, this would call Cal.com API to create a booking link
    const baseBookingUrl = process.env.CAL_BOOKING_URL ?? 'https://cal.com/saiful-agentive/demo';
    const params = new URLSearchParams();
    params.set('name', input.name);
    params.set('email', input.email);
    if (input.company) params.set('company', input.company);
    if (input.role) params.set('role', input.role);
    if (input.preferredTime) params.set('notes', `Preferred time: ${input.preferredTime}`);

    const bookingUrl = `${baseBookingUrl}?${params.toString()}`;

    return `Demo booked! I've sent a booking link to ${input.email}. You can also book directly here: ${bookingUrl}. Saiful will see your preferred time and reach out to confirm.`;
  },
  {
    name: 'bookDemoAppointment',
    description: 'Book a demo appointment with Saiful, the founder.',
    schema: z.object({
      name: z.string().describe('Full name of the prospect'),
      email: z.string().describe('Email address'),
      company: z.string().optional().describe('Company or firm name'),
      role: z.string().optional().describe('Role, e.g. Broker, Agent, Owner'),
      preferredTime: z.string().optional().describe('Preferred demo time'),
    }),
  }
);

// ── Collect Qualification Data Tool ───────────────────────────────

interface QualificationRecord {
  companyName?: string;
  role?: string;
  teamSize?: string;
  painPoint?: string;
  currentTools?: string;
  timeline?: string;
  intent: 'hot' | 'warm' | 'cold';
}

// In-memory store for demo sessions (replace with Redis/DB in production)
const demoQualificationStore = new Map<string, QualificationRecord>();

export const collectQualificationDataTool = tool(
  async (input: QualificationRecord & { sessionId: string }) => {
    const { sessionId, ...data } = input;
    demoQualificationStore.set(sessionId, data);

    let summary = 'Qualification data saved. ';
    if (data.intent === 'hot') summary += 'This is a HOT lead — follow up within 1 hour.';
    else if (data.intent === 'warm') summary += 'This is a WARM lead — nurture over the next few days.';
    else summary += 'This is a COLD lead — add to long-term nurture sequence.';

    return summary;
  },
  {
    name: 'collectQualificationData',
    description: "Save the prospect's qualification data after the conversation.",
    schema: z.object({
      sessionId: z.string().describe('Unique demo session ID'),
      companyName: z.string().optional(),
      role: z.string().optional(),
      teamSize: z.string().optional().describe('e.g. "1-5", "6-20", "21-50", "50+"'),
      painPoint: z.string().optional(),
      currentTools: z.string().optional(),
      timeline: z.string().optional().describe('e.g. "immediately", "1-3 months", "just exploring"'),
      intent: z.enum(['hot', 'warm', 'cold']).describe('Lead temperature'),
    }),
  }
);

// ── Export all tools ──────────────────────────────────────────────

export const sarahTools = [
  getPricingInfoTool,
  getIntegrationListTool,
  escalateToHumanTool,
  bookDemoAppointmentTool,
  collectQualificationDataTool,
];

export function getQualificationData(sessionId: string): QualificationRecord | undefined {
  return demoQualificationStore.get(sessionId);
}
