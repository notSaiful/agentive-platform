import { SCORING } from '@agentive/shared';

interface RouteInput {
  classification: 'HOT' | 'WARM' | 'COLD';
  score: number;
  timelineDays: number | null;
  confidence: number;
}

interface RouteResult {
  route: 'BOOK_APPOINTMENT' | 'NURTURE' | 'DISQUALIFY' | 'ESCALATE';
  reason: string;
  targetAgent?: string;
}

export function routeLead(input: RouteInput): RouteResult {
  if (input.confidence < SCORING.CONFIDENCE_ESCALATION) {
    return { route: 'ESCALATE', reason: `Low confidence: ${input.confidence}` };
  }

  if (input.classification === 'HOT' && input.timelineDays !== null && input.timelineDays <= 30) {
    return { route: 'BOOK_APPOINTMENT', reason: 'Hot lead, ready now' };
  }

  if (input.classification === 'HOT' || input.classification === 'WARM') {
    return { route: 'NURTURE', reason: `${input.classification} lead, not ready for booking`, targetAgent: 'follow-up-nurture' };
  }

  if (input.classification === 'COLD') {
    return { route: 'NURTURE', reason: 'Cold lead, needs nurture', targetAgent: 'follow-up-nurture' };
  }

  return { route: 'DISQUALIFY', reason: 'Does not meet qualification criteria' };
}