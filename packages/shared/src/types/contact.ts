import { z } from 'zod';

export const ContactSchema = z.object({
  id: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  email: z.string().email().nullable(),
  phone: z.string().nullable(),
  smsConsent: z.boolean().default(false),
  emailConsent: z.boolean().default(false),
  preferredChannel: z.enum(['sms', 'email', 'phone']).default('sms'),
  timezone: z.string().default('America/New_York'),
  metadata: z.record(z.unknown()).optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type Contact = z.infer<typeof ContactSchema>;