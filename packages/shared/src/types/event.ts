import { z } from 'zod';

export const EventType = z.enum([
  'lead.created',
  'lead.updated',
  'message.inbound',
  'message.outbound',
  'qualification.completed',
  'appointment.booked',
  'appointment.confirmed',
  'escalation.created',
  'escalation.resolved',
  'lead.handed_off',
]);

export const AgentEventSchema = z.object({
  id: z.string(),
  type: EventType,
  payload: z.record(z.unknown()),
  timestamp: z.date(),
  source: z.enum(['webhook', 'agent', 'human', 'system']),
  correlationId: z.string().optional(),
});

export type AgentEvent = z.infer<typeof AgentEventSchema>;
export type EventTypeType = z.infer<typeof EventType>;