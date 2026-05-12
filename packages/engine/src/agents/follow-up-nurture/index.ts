import { prisma } from '../../db/client.js';
import { DEFAULT_ORGANIZATION_ID } from '../../constants.js';
import { DEFAULT_CADENCE, getNextStage, calculateNextTouchDate, shouldSendTouch, CadenceRule } from './cadence.js';
import { renderTemplate } from './content.js';
import { TwilioClient, ResendClient } from '@agentive/integrations';

export interface NurtureLeadInput {
  leadId: string;
  organizationId?: string;
}

export interface CampaignResult {
  processed: number;
  sent: number;
  failed: number;
  skipped: number;
}

export class FollowUpNurtureAgent {
  private organizationId: string;
  private twilio: TwilioClient;
  private resend: ResendClient;

  constructor(config?: { organizationId?: string }) {
    this.organizationId = config?.organizationId ?? DEFAULT_ORGANIZATION_ID;
    this.twilio = new TwilioClient({
      accountSid: process.env.TWILIO_ACCOUNT_SID ?? '',
      apiKeySid: process.env.TWILIO_API_KEY_SID ?? '',
      apiKeySecret: process.env.TWILIO_API_KEY_SECRET ?? '',
      phoneNumber: process.env.TWILIO_PHONE_NUMBER ?? '',
    });
    this.resend = new ResendClient({
      apiKey: process.env.RESEND_API_KEY ?? '',
      fromEmail: process.env.RESEND_FROM_EMAIL ?? 'Agentive <team@agentive.ai>',
    });
  }

  async scheduleCadence(input: NurtureLeadInput): Promise<void> {
    const leadId = input.leadId;
    const orgId = input.organizationId ?? this.organizationId;

    const lead = await prisma.lead.findUnique({
      where: { id: leadId },
      include: { contact: true, nurtureCadences: { orderBy: { scheduledAt: 'desc' }, take: 1 } },
    });

    if (!lead || !lead.contact) return;

    const lastCadence = (lead.nurtureCadences ?? [])[0];
    const nextRule = getNextStage(lastCadence?.stage as CadenceRule['stage'] | undefined);

    if (!nextRule) return;

    const lastTouchAt = lastCadence?.sentAt ?? lead.createdAt;
    const scheduledAt = calculateNextTouchDate(lastTouchAt, nextRule);

    const preferredChannel = nextRule.channels.find((c) =>
      c === 'sms' ? lead.contact.phone : c === 'email' ? lead.contact.email : false
    ) ?? nextRule.channels[0];

    await prisma.nurtureCadence.create({
      data: {
        organizationId: orgId,
        leadId,
        stage: nextRule.stage,
        channel: preferredChannel,
        template: nextRule.template,
        scheduledAt,
        status: 'scheduled',
      },
    });
  }

  async runDailyHealthCheck(organizationId?: string): Promise<CampaignResult> {
    const orgId = organizationId ?? this.organizationId;
    const result: CampaignResult = { processed: 0, sent: 0, failed: 0, skipped: 0 };

    const dueCadences = await prisma.nurtureCadence.findMany({
      where: {
        organizationId: orgId,
        status: 'scheduled',
        scheduledAt: { lte: new Date() },
      },
      include: { lead: { include: { contact: true } } },
    });

    for (const cadence of dueCadences) {
      result.processed++;

      if (!cadence.lead || !cadence.lead.contact) {
        result.skipped++;
        continue;
      }

      try {
        const rendered = this.renderMessage(cadence.template, cadence.lead.contact);
        const contact = cadence.lead.contact;

        // Send via the correct channel
        if (cadence.channel === 'sms' && contact.phone) {
          if (this.twilio.canSendNow(contact.timezone)) {
            const smsResult = await this.twilio.sendSms(contact.phone, rendered.sms || rendered.body);
            await this.logCommunicationEvent(cadence.leadId, contact.id, 'sms', rendered.sms || rendered.body, { twilioSid: smsResult.sid, cadenceId: cadence.id });
          } else {
            // Skip due to quiet hours — reschedule for tomorrow morning
            const tomorrow = new Date();
            tomorrow.setDate(tomorrow.getDate() + 1);
            tomorrow.setHours(9, 0, 0, 0);
            await prisma.nurtureCadence.update({
              where: { id: cadence.id },
              data: { scheduledAt: tomorrow },
            });
            result.skipped++;
            continue;
          }
        } else if (cadence.channel === 'email' && contact.email) {
          const emailResult = await this.resend.sendEmail({
            to: contact.email,
            subject: rendered.subject || 'Follow-up from Agentive',
            text: rendered.body,
          });
          await this.logCommunicationEvent(cadence.leadId, contact.id, 'email', rendered.body, { resendId: emailResult.id, cadenceId: cadence.id });
        } else {
          // No valid channel — skip
          result.skipped++;
          await prisma.nurtureCadence.update({
            where: { id: cadence.id },
            data: { status: 'skipped' },
          });
          continue;
        }

        await prisma.nurtureCadence.update({
          where: { id: cadence.id },
          data: { status: 'sent', sentAt: new Date() },
        });

        await this.scheduleCadence({ leadId: cadence.leadId, organizationId: orgId });
        result.sent++;
      } catch (err) {
        console.error(`[Nurture] Failed to send touch to ${cadence.leadId}:`, err);
        await prisma.nurtureCadence.update({
          where: { id: cadence.id },
          data: { status: 'failed' },
        });
        result.failed++;
      }
    }

    return result;
  }

  async runColdRevivalCampaign(organizationId?: string, minDaysInactive = 180): Promise<CampaignResult> {
    const orgId = organizationId ?? this.organizationId;
    const result: CampaignResult = { processed: 0, sent: 0, failed: 0, skipped: 0 };

    const coldLeads = await prisma.lead.findMany({
      where: {
        organizationId: orgId,
        status: { in: ['nurture', 'qualified'] },
        updatedAt: { lte: new Date(Date.now() - minDaysInactive * 24 * 60 * 60 * 1000) },
        nurtureCadences: { none: { status: { in: ['scheduled', 'sent'] } } },
      },
      include: { contact: true },
    });

    for (const lead of coldLeads) {
      result.processed++;
      if (!lead.contact) {
        result.skipped++;
        continue;
      }

      try {
        await prisma.nurtureCadence.create({
          data: {
            organizationId: orgId,
            leadId: lead.id,
            stage: 'day_60',
            channel: 'email',
            template: 're_engagement',
            scheduledAt: new Date(),
            status: 'scheduled',
          },
        });
        result.sent++;
      } catch (err) {
        console.error(`[Nurture] Failed to schedule revival for ${lead.id}:`, err);
        result.failed++;
      }
    }

    return result;
  }

  private async logCommunicationEvent(
    leadId: string,
    contactId: string,
    channel: string,
    content: string,
    metadata: Record<string, unknown>
  ): Promise<void> {
    await prisma.communicationEvent.create({
      data: {
        organizationId: this.organizationId,
        leadId,
        contactId,
        channel,
        direction: 'outbound',
        content,
        metadata: metadata as unknown as Record<string, string>,
      },
    });
  }

  private renderMessage(templateKey: string, contact: { firstName?: string | null; lastName?: string | null }): { subject?: string; body: string; sms?: string } {
    return renderTemplate(templateKey, {
      firstName: contact.firstName || 'there',
      lastName: contact.lastName || '',
      agentName: 'Agentive',
      city: 'your area',
      propertyType: 'commercial space',
      month: new Date().toLocaleString('default', { month: 'long' }),
    });
  }
}
