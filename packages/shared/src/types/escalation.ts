import { z } from 'zod';

export const EscalationReason = z.enum(['low_confidence', 'policy_risk', 'high_value', 'compliance', 'human_request', 'objection_unhandled']);
export const EscalationStatus = z.enum(['pending', 'acknowledged', 'resolved', 'dismissed']);

export const EscalationSchema = z.object({
  id: z.string(),
  leadId: z.string(),
  conversationId: z.string(),
  reason: EscalationReason,
  status: EscalationStatus,
  confidence: z.number().min(0).max(1),
  context: z.string(),
  assignedTo: z.string().optional(),
  resolvedAt: z.date().optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type Escalation = z.infer<typeof EscalationSchema>;