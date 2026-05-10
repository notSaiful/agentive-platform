import { Request, Response } from 'express';
import { prisma } from '../db/client.js';
import { globalEmitter } from '@agentive/shared';
import { DEFAULT_ORGANIZATION_ID } from '../constants.js';

export async function handleLeadWebhook(req: Request, res: Response): Promise<void> {
  const { source, firstName, lastName, email, phone, message } = req.body;

  if (!firstName || !lastName || (!email && !phone)) {
    res.status(400).json({ error: 'First name, last name, and email or phone required' });
    return;
  }

  const contact = await prisma.contact.create({
    data: {
      organizationId: DEFAULT_ORGANIZATION_ID,
      firstName,
      lastName,
      email: email || null,
      phone: phone || null,
      smsConsent: !!phone,
      emailConsent: !!email,
      preferredChannel: phone ? 'sms' : 'email',
    },
  });

  const lead = await prisma.lead.create({
    data: {
      organizationId: DEFAULT_ORGANIZATION_ID,
      source,
      sourceDetails: req.body.sourceDetails || {},
      contactId: contact.id,
      status: 'new',
    },
  });

  globalEmitter.emit({
    id: `evt_${Date.now()}`,
    type: 'lead.created' as const,
    payload: { leadId: lead.id, contactId: contact.id, source, message },
    timestamp: new Date(),
    source: 'webhook' as const,
  });

  res.status(200).json({ leadId: lead.id, contactId: contact.id, status: 'created' });
}