import { Request, Response } from 'express';
import { prisma } from '../db/client.js';
import { COMPLIANCE, globalEmitter } from '@agentive/shared';

export async function handleInboundSms(req: Request, res: Response): Promise<void> {
  const { From, Body, MessageSid } = req.body;

  const isOptOut = COMPLIANCE.OPT_OUT_KEYWORDS.some(kw => Body?.toUpperCase().trim() === kw);

  res.type('text/xml').send('<Response></Response>');

  if (isOptOut && From) {
    await prisma.contact.updateMany({
      where: { phone: From },
      data: { smsConsent: false },
    });
    return;
  }

  const contact = await prisma.contact.findFirst({ where: { phone: From } });
  if (!contact) return;

  const lead = await prisma.lead.findFirst({
    where: { contactId: contact.id },
    orderBy: { createdAt: 'desc' },
  });
  if (!lead) return;

  globalEmitter.emit({
    id: `evt_${Date.now()}`,
    type: 'message.inbound' as const,
    payload: { leadId: lead.id, contactId: contact.id, channel: 'sms', content: Body, messageSid: MessageSid },
    timestamp: new Date(),
    source: 'webhook' as const,
  });
}