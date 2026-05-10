import { SCORING } from '@agentive/shared';
import { prisma } from '../db/client.js';
import { globalEmitter } from '@agentive/shared';
import { DEFAULT_ORGANIZATION_ID } from '../constants.js';

interface EscalationCheck {
  confidence: number;
  policyRisk?: boolean;
  highValue?: boolean;
  compliance?: boolean;
}

export function shouldEscalate(input: EscalationCheck): boolean {
  if (input.confidence < SCORING.CONFIDENCE_ESCALATION) return true;
  if (input.policyRisk) return true;
  if (input.highValue) return true;
  if (input.compliance) return true;
  return false;
}

export async function createEscalation(params: {
  leadId: string;
  conversationId: string;
  reason: string;
  confidence: number;
  context: string;
}): Promise<string> {
  const escalation = await prisma.escalation.create({
    data: {
      organizationId: DEFAULT_ORGANIZATION_ID,
      leadId: params.leadId,
      conversationId: params.conversationId,
      reason: params.reason,
      confidence: params.confidence,
      context: params.context,
      status: 'pending',
    },
  });

  await prisma.lead.update({
    where: { id: params.leadId },
    data: { status: 'escalated' },
  });

  globalEmitter.emit({
    id: `evt_${Date.now()}`,
    type: 'escalation.created',
    payload: { escalationId: escalation.id, leadId: params.leadId, reason: params.reason },
    timestamp: new Date(),
    source: 'agent',
  });

  return escalation.id;
}