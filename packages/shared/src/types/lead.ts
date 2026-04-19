import { z } from 'zod';

export const LeadSource = z.enum(['webform', 'portal', 'ad', 'sms', 'email', 'referral', 'walk_in', 'phone']);
export const LeadStatus = z.enum(['new', 'contacted', 'qualifying', 'qualified', 'appointment_booked', 'nurture', 'disqualified', 'escalated', 'closed']);
export const LeadClassification = z.enum(['HOT', 'WARM', 'COLD']);

export const LeadSchema = z.object({
  id: z.string(),
  source: LeadSource,
  sourceDetails: z.record(z.unknown()).optional(),
  contactId: z.string(),
  status: LeadStatus,
  qualificationScore: z.number().min(0).max(100).nullable(),
  classification: LeadClassification.nullable(),
  assignedAgentId: z.string().optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type Lead = z.infer<typeof LeadSchema>;
export type LeadSourceType = z.infer<typeof LeadSource>;
export type LeadStatusType = z.infer<typeof LeadStatus>;
export type LeadClassificationType = z.infer<typeof LeadClassification>;