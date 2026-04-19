import { z } from 'zod';

export const AppointmentSchema = z.object({
  id: z.string(),
  leadId: z.string(),
  contactId: z.string(),
  agentId: z.string(),
  scheduledAt: z.date(),
  durationMinutes: z.number().default(30),
  type: z.enum(['in_person', 'phone', 'video']),
  status: z.enum(['scheduled', 'confirmed', 'completed', 'cancelled', 'no_show']),
  notes: z.string().optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type Appointment = z.infer<typeof AppointmentSchema>;