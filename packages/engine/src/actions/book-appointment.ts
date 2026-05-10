import { prisma } from '../db/client.js';
import { CalClient } from '@agentive/integrations';
import { globalEmitter } from '@agentive/shared';
import { DEFAULT_ORGANIZATION_ID } from '../constants.js';

export async function bookAppointment(params: {
  leadId: string;
  contactId: string;
  eventTypeId: string;
  dateFrom: string;
  dateTo: string;
  timezone: string;
}): Promise<{ appointmentId: string; scheduledAt: string }> {
  const cal = new CalClient({
    apiKey: process.env.CAL_API_KEY ?? '',
  });

  const availability = await cal.getAvailability({
    eventTypeId: params.eventTypeId,
    dateFrom: params.dateFrom,
    dateTo: params.dateTo,
    timezone: params.timezone,
  });

  if (!availability.slots?.length) throw new Error('No available slots');

  const contact = await prisma.contact.findUnique({ where: { id: params.contactId } });
  if (!contact) throw new Error('Contact not found');

  const firstSlot = availability.slots[0];
  const booking = await cal.bookSlot({
    eventTypeId: params.eventTypeId,
    start: firstSlot.start,
    name: `${contact.firstName} ${contact.lastName}`,
    email: contact.email ?? '',
    phone: contact.phone ?? undefined,
    timezone: params.timezone,
  });

  const appointment = await prisma.appointment.create({
    data: {
      organizationId: DEFAULT_ORGANIZATION_ID,
      leadId: params.leadId,
      contactId: params.contactId,
      agentId: 'speed-to-lead',
      scheduledAt: new Date(firstSlot.start),
      status: 'scheduled',
      type: 'phone',
    },
  });

  globalEmitter.emit({
    id: `evt_${Date.now()}`,
    type: 'appointment.booked' as const,
    payload: { appointmentId: appointment.id, leadId: params.leadId },
    timestamp: new Date(),
    source: 'agent' as const,
  });

  return { appointmentId: appointment.id, scheduledAt: firstSlot.start };
}