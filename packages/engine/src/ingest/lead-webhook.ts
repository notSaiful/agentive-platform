import { Request, Response } from 'express';
import { prisma } from '../db/client.js';
import { globalEmitter } from '@agentive/shared';

export async function handleLeadWebhook(req: Request, res: Response): Promise<void> {
  const { source, firstName, lastName, email, phone, message, smsConsent, emailConsent } = req.body;
  const organizationId = (req as Request & { organizationId?: string }).organizationId || 'system';

  if (!firstName || !lastName || (!email && !phone)) {
    res.status(400).json({ error: 'First name, last name, and email or phone required' });
    return;
  }

  // Deduplicate: check for existing contact by email or phone scoped to org
  const existingContact = email
    ? await prisma.contact.findFirst({ where: { email, organizationId } })
    : phone
      ? await prisma.contact.findFirst({ where: { phone, organizationId } })
      : null;

  if (existingContact) {
    // Create a new lead for the existing contact (multi-property inquiries)
    const lead = await prisma.lead.create({
      data: {
        organizationId,
        source,
        sourceDetails: req.body.sourceDetails || {},
        contactId: existingContact.id,
        status: 'new',
      },
    });

    globalEmitter.emit({
      id: `evt_${Date.now()}`,
      type: 'lead.created' as const,
      payload: { leadId: lead.id, contactId: existingContact.id, source, message, preferredChannel: existingContact.preferredChannel },
      timestamp: new Date(),
      source: 'webhook' as const,
    });

    res.status(200).json({ leadId: lead.id, contactId: existingContact.id, status: 'created', deduplicated: true });
    return;
  }

  // Explicit consent required — do NOT auto-consent just because contact info was provided
  const contact = await prisma.contact.create({
    data: {
      organizationId,
      firstName,
      lastName,
      email: email || null,
      phone: phone || null,
      smsConsent: smsConsent === true || smsConsent === 'true',
      emailConsent: emailConsent === true || emailConsent === 'true',
      preferredChannel: phone ? 'sms' : 'email',
    },
  });

  const lead = await prisma.lead.create({
    data: {
      organizationId,
      source,
      sourceDetails: req.body.sourceDetails || {},
      contactId: contact.id,
      status: 'new',
    },
  });

  globalEmitter.emit({
    id: `evt_${Date.now()}`,
    type: 'lead.created' as const,
    payload: { leadId: lead.id, contactId: contact.id, source, message, preferredChannel: contact.preferredChannel },
    timestamp: new Date(),
    source: 'webhook' as const,
  });

  res.status(200).json({ leadId: lead.id, contactId: contact.id, status: 'created' });
}