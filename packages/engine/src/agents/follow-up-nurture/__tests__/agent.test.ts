import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { mockPrisma, mockEmitter } = vi.hoisted(() => ({
  mockPrisma: {
    lead: { findUnique: vi.fn(), findMany: vi.fn() },
    nurtureCadence: { create: vi.fn(), findMany: vi.fn(), update: vi.fn() },
    communicationEvent: { create: vi.fn() },
  },
  mockEmitter: { emit: vi.fn() },
}));

const mockTwilioSendSms = vi.hoisted(() => vi.fn().mockResolvedValue({ sid: 'SMtest123', status: 'queued' }));
const mockTwilioCanSendNow = vi.hoisted(() => vi.fn().mockReturnValue(true));
const mockResendSendEmail = vi.hoisted(() => vi.fn().mockResolvedValue({ id: 'email_test_123', status: 'sent' }));

vi.mock('../../../db/client.js', () => ({ prisma: mockPrisma }));

vi.mock('@agentive/shared', async () => {
  const actual = await vi.importActual<typeof import('@agentive/shared')>('@agentive/shared');
  return {
    ...actual,
    globalEmitter: mockEmitter,
  };
});

vi.mock('@agentive/integrations', () => ({
  TwilioClient: vi.fn().mockImplementation(() => ({
    sendSms: mockTwilioSendSms,
    canSendNow: mockTwilioCanSendNow,
  })),
  ResendClient: vi.fn().mockImplementation(() => ({
    sendEmail: mockResendSendEmail,
  })),
}));

import { FollowUpNurtureAgent } from '../index.js';

describe('FollowUpNurtureAgent', () => {
  let agent: FollowUpNurtureAgent;

  beforeEach(() => {
    vi.clearAllMocks();
    mockTwilioCanSendNow.mockReturnValue(true);
    agent = new FollowUpNurtureAgent();
  });

  describe('scheduleCadence', () => {
    it('schedules day_3 as first touch for a new lead', async () => {
      const leadId = 'lead_new';
      const contactId = 'contact_new';

      mockPrisma.lead.findUnique.mockResolvedValue({
        id: leadId,
        contact: { id: contactId, firstName: 'Test' },
        nurtureCadences: [],
        createdAt: new Date(),
      });

      mockPrisma.nurtureCadence.create.mockResolvedValue({ id: 'cadence_1' });

      await agent.scheduleCadence({ leadId });

      expect(mockPrisma.nurtureCadence.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            leadId,
            stage: 'day_3',
            channel: 'sms',
            template: 'check_in',
            status: 'scheduled',
          }),
        })
      );
    });

    it('schedules next stage after existing cadence', async () => {
      const leadId = 'lead_existing';
      const contactId = 'contact_existing';

      mockPrisma.lead.findUnique.mockResolvedValue({
        id: leadId,
        contact: { id: contactId, firstName: 'Test' },
        nurtureCadences: [
          { stage: 'day_3', sentAt: new Date(), scheduledAt: new Date() },
        ],
        createdAt: new Date(),
      });

      mockPrisma.nurtureCadence.create.mockResolvedValue({ id: 'cadence_2' });

      await agent.scheduleCadence({ leadId });

      expect(mockPrisma.nurtureCadence.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            leadId,
            stage: 'day_7',
            channel: 'sms',
            template: 'market_update',
          }),
        })
      );
    });

    it('does nothing when lead has no contact', async () => {
      mockPrisma.lead.findUnique.mockResolvedValue({
        id: 'lead_no_contact',
        contact: null,
        nurtureCadences: [],
      });

      await agent.scheduleCadence({ leadId: 'lead_no_contact' });

      expect(mockPrisma.nurtureCadence.create).not.toHaveBeenCalled();
    });

    it('does nothing when cadence is complete', async () => {
      mockPrisma.lead.findUnique.mockResolvedValue({
        id: 'lead_complete',
        contact: { id: 'c1', firstName: 'Test' },
        nurtureCadences: [
          { stage: 'monthly', sentAt: new Date(), scheduledAt: new Date() },
        ],
        createdAt: new Date(),
      });

      await agent.scheduleCadence({ leadId: 'lead_complete' });

      expect(mockPrisma.nurtureCadence.create).not.toHaveBeenCalled();
    });
  });

  describe('runDailyHealthCheck', () => {
    it('sends SMS touch for due SMS cadence', async () => {
      const leadId = 'lead_due';
      const contactId = 'contact_due';
      const cadenceId = 'cadence_due';

      mockPrisma.nurtureCadence.findMany.mockResolvedValue([
        {
          id: cadenceId,
          leadId,
          stage: 'day_3',
          channel: 'sms',
          template: 'check_in',
          status: 'scheduled',
          scheduledAt: new Date(Date.now() - 1000),
          lead: {
            id: leadId,
            contact: {
              id: contactId,
              firstName: 'Alice',
              lastName: 'Smith',
              phone: '+15551234567',
              email: 'alice@example.com',
              timezone: 'America/New_York',
            },
          },
        },
      ]);

      mockPrisma.nurtureCadence.update.mockResolvedValue({});
      mockPrisma.nurtureCadence.create.mockResolvedValue({ id: 'next_cadence' });
      mockPrisma.communicationEvent.create.mockResolvedValue({});

      const result = await agent.runDailyHealthCheck();

      expect(result.processed).toBe(1);
      expect(result.sent).toBe(1);
      expect(result.failed).toBe(0);
      expect(mockTwilioSendSms).toHaveBeenCalled();
      expect(mockPrisma.nurtureCadence.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: cadenceId },
          data: expect.objectContaining({ status: 'sent', sentAt: expect.any(Date) }),
        })
      );
    });

    it('skips SMS during quiet hours and reschedules', async () => {
      mockTwilioCanSendNow.mockReturnValue(false);

      mockPrisma.nurtureCadence.findMany.mockResolvedValue([
        {
          id: 'cadence_qh',
          leadId: 'lead_qh',
          stage: 'day_3',
          channel: 'sms',
          template: 'check_in',
          status: 'scheduled',
          scheduledAt: new Date(Date.now() - 1000),
          lead: {
            id: 'lead_qh',
            contact: {
              id: 'contact_qh',
              firstName: 'Bob',
              lastName: 'Jones',
              phone: '+15551234567',
              timezone: 'America/New_York',
            },
          },
        },
      ]);

      mockPrisma.nurtureCadence.update.mockResolvedValue({});

      const result = await agent.runDailyHealthCheck();

      expect(result.skipped).toBe(1);
      expect(mockTwilioSendSms).not.toHaveBeenCalled();
      expect(mockPrisma.nurtureCadence.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'cadence_qh' },
          data: expect.objectContaining({ scheduledAt: expect.any(Date) }),
        })
      );
    });

    it('sends email touch for due email cadence', async () => {
      mockPrisma.nurtureCadence.findMany.mockResolvedValue([
        {
          id: 'cadence_email',
          leadId: 'lead_email',
          stage: 'day_7',
          channel: 'email',
          template: 'market_update',
          status: 'scheduled',
          scheduledAt: new Date(Date.now() - 1000),
          lead: {
            id: 'lead_email',
            contact: {
              id: 'contact_email',
              firstName: 'Charlie',
              lastName: 'Brown',
              phone: null,
              email: 'charlie@example.com',
              timezone: 'America/New_York',
            },
          },
        },
      ]);

      mockPrisma.nurtureCadence.update.mockResolvedValue({});
      mockPrisma.nurtureCadence.create.mockResolvedValue({ id: 'next_cadence' });
      mockPrisma.communicationEvent.create.mockResolvedValue({});

      const result = await agent.runDailyHealthCheck();

      expect(result.sent).toBe(1);
      expect(mockResendSendEmail).toHaveBeenCalled();
      expect(mockTwilioSendSms).not.toHaveBeenCalled();
    });

    it('skips cadence with no valid channel', async () => {
      mockPrisma.nurtureCadence.findMany.mockResolvedValue([
        {
          id: 'cadence_no_channel',
          leadId: 'lead_nc',
          stage: 'day_3',
          channel: 'sms',
          template: 'check_in',
          status: 'scheduled',
          scheduledAt: new Date(Date.now() - 1000),
          lead: {
            id: 'lead_nc',
            contact: {
              id: 'contact_nc',
              firstName: 'Dana',
              phone: null,
              email: null,
              timezone: 'America/New_York',
            },
          },
        },
      ]);

      mockPrisma.nurtureCadence.update.mockResolvedValue({});

      const result = await agent.runDailyHealthCheck();

      expect(result.skipped).toBe(1);
      expect(mockTwilioSendSms).not.toHaveBeenCalled();
      expect(mockResendSendEmail).not.toHaveBeenCalled();
    });

    it('handles send failure gracefully', async () => {
      mockTwilioSendSms.mockRejectedValueOnce(new Error('Twilio rate limit'));

      mockPrisma.nurtureCadence.findMany.mockResolvedValue([
        {
          id: 'cadence_fail',
          leadId: 'lead_fail',
          stage: 'day_3',
          channel: 'sms',
          template: 'check_in',
          status: 'scheduled',
          scheduledAt: new Date(Date.now() - 1000),
          lead: {
            id: 'lead_fail',
            contact: {
              id: 'contact_fail',
              firstName: 'Eve',
              phone: '+15551234567',
              timezone: 'America/New_York',
            },
          },
        },
      ]);

      mockPrisma.nurtureCadence.update.mockResolvedValue({});

      const result = await agent.runDailyHealthCheck();

      expect(result.failed).toBe(1);
      expect(mockPrisma.nurtureCadence.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'cadence_fail' },
          data: expect.objectContaining({ status: 'failed' }),
        })
      );
    });
  });

  describe('runColdRevivalCampaign', () => {
    it('schedules revival cadence for cold leads', async () => {
      mockPrisma.lead.findMany.mockResolvedValue([
        {
          id: 'lead_cold',
          status: 'nurture',
          updatedAt: new Date(Date.now() - 200 * 24 * 60 * 60 * 1000),
          contact: {
            id: 'contact_cold',
            firstName: 'Cold',
            lastName: 'Lead',
            phone: '+15551234567',
            email: 'cold@example.com',
          },
        },
      ]);

      mockPrisma.nurtureCadence.create.mockResolvedValue({ id: 'revival_cadence' });

      const result = await agent.runColdRevivalCampaign();

      expect(result.processed).toBe(1);
      expect(result.sent).toBe(1);
      expect(mockPrisma.nurtureCadence.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            leadId: 'lead_cold',
            stage: 'day_60',
            channel: 'email',
            template: 're_engagement',
          }),
        })
      );
    });

    it('skips leads without contact', async () => {
      mockPrisma.lead.findMany.mockResolvedValue([
        {
          id: 'lead_no_contact',
          status: 'nurture',
          updatedAt: new Date(Date.now() - 200 * 24 * 60 * 60 * 1000),
          contact: null,
        },
      ]);

      const result = await agent.runColdRevivalCampaign();

      expect(result.skipped).toBe(1);
      expect(mockPrisma.nurtureCadence.create).not.toHaveBeenCalled();
    });
  });
});
