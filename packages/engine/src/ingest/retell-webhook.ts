import { prisma } from '../db/client.js';
import { scoreLead } from '../agents/speed-to-lead/scorer.js';
import { routeLead } from '../orchestrator/router.js';

interface CallEndedInput {
  callId: string;
  leadId: string;
  callStatus: string;
  disposition: string;
  transcript?: string;
  organizationId?: string;
  qualificationData?: {
    budget?: string;
    timelineDays?: number;
    decisionMaker?: boolean | string;
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
  const organizationId = input.organizationId || 'system';

  // Fetch lead to get the real contactId for referential integrity
  const lead = await prisma.lead.findUnique({ where: { id: input.leadId } });
  const contactId = lead?.contactId ?? '';

  await prisma.communicationEvent.create({
    data: {
      organizationId,
      leadId: input.leadId,
      contactId,
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
    // Call was answered but Retell didn't provide qualification data — do NOT SMS fallback
    return { leadId: input.leadId, disposition: input.disposition, shouldSmsFallback: false };
  }

  const intentSignals: string[] = [];
  const intent = qData.intent?.toLowerCase() ?? '';
  if (intent === 'ready_to_buy' || intent === 'pre-approved') intentSignals.push('ready to buy');
  if (intent === 'seriously_looking' || intent === 'serious') intentSignals.push('serious');
  if (intent === 'just_browsing' || intent === 'exploring' || intent === 'just looking') intentSignals.push('just browsing');

  const isDecisionMaker = qData.decisionMaker === 'yes' || qData.decisionMaker === true;
  const budget = qData.budget;
  const timelineDays = qData.timelineDays ?? null;

  const scoreResult = scoreLead({
    budgetIdentified: !!budget,
    timelineDays,
    isDecisionMaker,
    intentSignals,
  });

  const routeResult = routeLead({
    classification: scoreResult.classification,
    score: scoreResult.score,
    timelineDays: qData.timelineDays ?? null,
    confidence: 0.85,
  });

  const existingLead = await prisma.lead.findUnique({ where: { id: input.leadId } });
  if (existingLead) {
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