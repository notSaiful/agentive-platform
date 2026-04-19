import { prisma } from '../db/client.js';
import { scoreLead } from '../agents/speed-to-lead/scorer.js';
import { routeLead } from '../orchestrator/router.js';

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
      contactId: '',
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