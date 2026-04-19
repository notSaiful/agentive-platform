import { z } from 'zod';

export const MessageRole = z.enum(['lead', 'agent', 'human']);
export const MessageChannel = z.enum(['sms', 'email', 'webchat', 'phone']);

export const MessageSchema = z.object({
  id: z.string(),
  role: MessageRole,
  channel: MessageChannel,
  content: z.string(),
  timestamp: z.date(),
  metadata: z.record(z.unknown()).optional(),
});

export const ConversationSchema = z.object({
  id: z.string(),
  leadId: z.string(),
  contactId: z.string(),
  messages: z.array(MessageSchema),
  status: z.enum(['active', 'paused', 'completed', 'escalated']),
  agentId: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type Message = z.infer<typeof MessageSchema>;
export type Conversation = z.infer<typeof ConversationSchema>;