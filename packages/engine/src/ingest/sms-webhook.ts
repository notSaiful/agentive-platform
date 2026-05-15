import { Request, Response } from 'express';
import { prisma } from '../db/client.js';
import { COMPLIANCE, globalEmitter } from '@agentive/shared';

export async function handleInboundSms(req: Request, res: Response): Promise<void> {
  const { From, Body, MessageSid } = req.body;
  const organizationId = (req as Request & { organizationId?: string }).organizationId;

  const isOptOut = COMPLIANCE.OPT_OUT_KEYWORDS.some((kw: string) =>
    Body?.toUpperCase().includes(kw)
  );

  try {
    if (isOptOut && From) {
      const where = organizationId ? { phone: From, organizationId } : { phone: From };
      await prisma.contact.updateMany({
        where,
        data: { smsConsent: false },
      });
      res.type('text/xml').send('<Response></Response>');
      return;
    }

    const contactWhere = organizationId ? { phone: From, organizationId } : { phone: From };
    const contact = await prisma.contact.findFirst({ where: contactWhere });
    if (!contact) {
      res.type('text/xml').send('<Response></Response>');
      return;
    }

    const lead = await prisma.lead.findFirst({
      where: { contactId: contact.id, organizationId: contact.organizationId },
      orderBy: { createdAt: 'desc' },
    });
    if (!lead) {
      res.type('text/xml').send('<Response></Response>');
      return;
    }

    globalEmitter.emit({
      id: `evt_${Date.now()}`,
      type: 'message.inbound' as const,
      payload: { leadId: lead.id, contactId: contact.id, channel: 'sms', content: Body, messageSid: MessageSid },
      timestamp: new Date(),
      source: 'webhook' as const,
    });

    res.type('text/xml').send('<Response></Response>');
  } catch (err) {
    console.error('[SMS Webhook] Unhandled error:', err);
    // Always respond 200 to Twilio so it doesn't retry indefinitely
    res.type('text/xml').send('<Response></Response>');
  }
}