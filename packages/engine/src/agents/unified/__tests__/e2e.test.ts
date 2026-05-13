import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Hoisted Mocks ───────────────────────────────────────────────────────────
const { mockPrisma, mockEmitter } = vi.hoisted(() => ({
  mockPrisma: {
    lead: { findUnique: vi.fn(), update: vi.fn(), create: vi.fn(), findMany: vi.fn() },
    contact: { findUnique: vi.fn(), create: vi.fn() },
    conversation: { findFirst: vi.fn(), create: vi.fn() },
    message: { create: vi.fn() },
    communicationEvent: { create: vi.fn() },
    nurtureCadence: { create: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), update: vi.fn() },
    appointment: { create: vi.fn() },
    escalation: { create: vi.fn() },
  },
  mockEmitter: { emit: vi.fn() },
}));

const mockTwilioSendSms = vi.hoisted(() => vi.fn().mockResolvedValue({ sid: 'SMtest123', status: 'queued' }));
const mockTwilioCanSendNow = vi.hoisted(() => vi.fn().mockReturnValue(true));
const mockVapiCreateOutboundCall = vi.hoisted(() => vi.fn().mockResolvedValue({ callId: 'call_test_123' }));
const mockResendSendEmail = vi.hoisted(() => vi.fn().mockResolvedValue({ id: 'email_test_123', status: 'sent' }));
const mockAgentInvoke = vi.hoisted(() => vi.fn());
const mockBookAppointment = vi.hoisted(() => vi.fn().mockResolvedValue({
  bookingUid: 'booking_test_123',
  status: 'confirmed',
  link: 'https://cal.com/test',
}));
const mockCreateEscalation = vi.hoisted(() => vi.fn().mockResolvedValue('esc_test_123'));
const mockCrmCreatePerson = vi.hoisted(() => vi.fn().mockResolvedValue({ id: 'crm_person_123' }));
const mockCrmFindPersonByPhone = vi.hoisted(() => vi.fn().mockResolvedValue({ id: 'crm_person_123' }));
const mockCrmCreateTask = vi.hoisted(() => vi.fn().mockResolvedValue({ id: 'crm_task_123' }));
const mockCrmLogSms = vi.hoisted(() => vi.fn().mockResolvedValue({}));
const mockCreateCrmClient = vi.hoisted(() => vi.fn().mockResolvedValue({
  createPerson: mockCrmCreatePerson,
  findPersonByPhone: mockCrmFindPersonByPhone,
  logSms: mockCrmLogSms,
  createTask: mockCrmCreateTask,
}));

// ── Module Mocks ────────────────────────────────────────────────────────────
vi.mock('../../../db/client.js', () => ({ prisma: mockPrisma }));

vi.mock('@agentive/shared', async () => {
  const actual = await vi.importActual<typeof import('@agentive/shared')>('@agentive/shared');
  return {
    ...actual,
    globalEmitter: mockEmitter,
    COMPLIANCE: { QUIET_HOURS: { start: 21, end: 8 } },
    checkFairHousing: () => ({ safe: true, violations: [] }),
  };
});

vi.mock('../../../orchestrator/guardrails.js', () => ({
  checkGuardrails: vi.fn().mockReturnValue({ allowed: true }),
}));

vi.mock('../sarah-demo/tracer.js', () => ({
  startTrace: vi.fn().mockResolvedValue(undefined),
  endTrace: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@agentive/integrations', () => ({
  TwilioClient: vi.fn().mockImplementation(() => ({
    sendSms: mockTwilioSendSms,
    canSendNow: mockTwilioCanSendNow,
  })),
  VapiClient: vi.fn().mockImplementation(() => ({
    createOutboundCall: mockVapiCreateOutboundCall,
  })),
  ResendClient: vi.fn().mockImplementation(() => ({
    sendEmail: mockResendSendEmail,
  })),
  createCrmClient: mockCreateCrmClient,
  CircuitBreaker: vi.fn().mockImplementation(() => ({
    execute: vi.fn().mockImplementation((fn: () => Promise<unknown>) => fn()),
  })),
}));

vi.mock('@langchain/openai', () => ({
  ChatOpenAI: vi.fn().mockImplementation(() => ({
    bindTools: vi.fn().mockReturnValue({}),
  })),
}));

vi.mock('langchain/agents', () => ({
  AgentExecutor: vi.fn().mockImplementation(() => ({
    invoke: mockAgentInvoke,
  })),
  createToolCallingAgent: vi.fn().mockReturnValue({}),
}));

vi.mock('../../../actions/book-appointment.js', () => ({
  bookAppointment: mockBookAppointment,
}));

vi.mock('../../../escalation/handler.js', () => ({
  createEscalation: mockCreateEscalation,
}));

// ── Test Suite ──────────────────────────────────────────────────────────────
import { UnifiedAgent } from '../index.js';

describe('UnifiedAgent E2E', () => {
  let agent: UnifiedAgent;

  beforeEach(() => {
    vi.clearAllMocks();
    mockTwilioCanSendNow.mockReturnValue(true);
    // Only clear call history on agent invoke — preserve the mock function itself
    mockAgentInvoke.mockClear();
    agent = new UnifiedAgent();
  });

  // ── Helper: Setup lead + contact ────────────────────────────────────────
  const setupLeadAndContact = (overrides?: {
    leadStatus?: string;
    phone?: string | null;
    email?: string | null;
    smsConsent?: boolean;
    emailConsent?: boolean;
  }) => {
    const leadId = `lead_${Date.now()}`;
    const contactId = `contact_${Date.now()}`;

    mockPrisma.lead.findUnique.mockResolvedValue({
      id: leadId,
      status: overrides?.leadStatus ?? 'new',
      qualificationScore: null,
      classification: null,
      contactId,
      createdAt: new Date(),
      nurtureCadences: [],
      contact: {
        id: contactId,
        firstName: 'Test',
        lastName: 'Lead',
        phone: overrides?.phone ?? '+15551234567',
        email: overrides?.email ?? 'test@example.com',
        smsConsent: overrides?.smsConsent ?? true,
        emailConsent: overrides?.emailConsent ?? true,
        timezone: 'America/New_York',
      },
    });

    mockPrisma.contact.findUnique.mockResolvedValue({
      id: contactId,
      firstName: 'Test',
      lastName: 'Lead',
      phone: overrides?.phone ?? '+15551234567',
      email: overrides?.email ?? 'test@example.com',
      smsConsent: overrides?.smsConsent ?? true,
      emailConsent: overrides?.emailConsent ?? true,
      timezone: 'America/New_York',
    });

    mockPrisma.conversation.findFirst.mockResolvedValue(null);
    mockPrisma.conversation.create.mockResolvedValue({ id: `conv_${Date.now()}` });
    mockPrisma.message.create.mockResolvedValue({});
    mockPrisma.lead.update.mockResolvedValue({});
    mockPrisma.communicationEvent.create.mockResolvedValue({});
    mockPrisma.nurtureCadence.create.mockResolvedValue({ id: `cadence_${Date.now()}` });

    return { leadId, contactId };
  };

  describe('processInboundLead', () => {
    it('full flow: inbound SMS lead → agent qualifies → routes to nurture → schedules cadence', async () => {
      const { leadId, contactId } = setupLeadAndContact();
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      // Agent qualifies and returns a ROUTE directive
      mockAgentInvoke.mockResolvedValue({
        output: `Thanks for reaching out! I'd love to help you find the right commercial space. What's your timeline looking like?\n\nROUTE: 65`,
      });

      const result = await agent.processInboundLead({
        leadId,
        contactId,
        source: 'website',
        message: 'I need office space for 20 people ASAP',
        channel: 'sms',
      });

      errorSpy.mockRestore();

      // Verify lead was contacted
      expect(mockPrisma.lead.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: leadId },
          data: expect.objectContaining({ status: 'contacted', firstResponseAt: expect.any(Date) }),
        })
      );

      // Verify message was saved
      expect(mockPrisma.message.create).toHaveBeenCalled();

      // Verify SMS was sent
      expect(mockTwilioSendSms).toHaveBeenCalled();

      // Verify event emitted
      expect(mockEmitter.emit).toHaveBeenCalled();

      // Verify routing happened (score 65 = WARM)
      expect(result.qualificationComplete).toBe(true);
      expect(result.classification).toBe('WARM');
      expect(result.route).toBe('NURTURE');

      // Verify nurture cadence was scheduled
      expect(mockPrisma.nurtureCadence.create).toHaveBeenCalled();
    });

    it('full flow: HOT lead (score 90) → books appointment + CRM sync', async () => {
      const { leadId, contactId } = setupLeadAndContact();

      mockAgentInvoke.mockResolvedValue({
        output: `Excellent! You sound ready to move. Let me get you scheduled.\n\nROUTE: 90`,
      });

      const result = await agent.processInboundLead({
        leadId,
        contactId,
        source: 'zillow',
        message: 'I have $5M budget, need to move in 2 weeks, I make decisions',
        channel: 'sms',
      });

      expect(result.classification).toBe('HOT');
      expect(result.route).toBe('BOOK_APPOINTMENT');
      expect(result.score).toBe(90);

      // Verify Cal.com booking was attempted
      expect(mockBookAppointment).toHaveBeenCalled();
    });

    it('voice channel: triggers VAPI outbound call instead of SMS', async () => {
      const { leadId, contactId } = setupLeadAndContact();

      const result = await agent.processInboundLead({
        leadId,
        contactId,
        source: 'website',
        message: 'Call me about listings',
        channel: 'phone',
      });

      expect(mockVapiCreateOutboundCall).toHaveBeenCalledWith(
        expect.objectContaining({
          assistantId: expect.any(String),
          customerPhoneNumber: '+15551234567',
        })
      );

      expect(result.responseMessage).toContain('Voice call initiated');
      expect(mockTwilioSendSms).not.toHaveBeenCalled();
    });

    it('handles VAPI failure gracefully and falls back to SMS', async () => {
      const { leadId, contactId } = setupLeadAndContact();

      mockVapiCreateOutboundCall.mockRejectedValueOnce(new Error('VAPI timeout'));
      mockAgentInvoke.mockResolvedValue({
        output: 'Hi Test! Sorry we missed you — are you still looking?',
      });

      const result = await agent.processInboundLead({
        leadId,
        contactId,
        source: 'website',
        message: 'Call me',
        channel: 'phone',
      });

      // Should have tried VAPI first
      expect(mockVapiCreateOutboundCall).toHaveBeenCalled();

      // Should have fallen back to SMS
      expect(mockTwilioSendSms).toHaveBeenCalled();
      expect(result.responseMessage).toContain('Sorry we missed you');
    });

    it('blocks during quiet hours without consent', async () => {
      const { leadId, contactId } = setupLeadAndContact({ smsConsent: false });

      const { checkGuardrails } = await import('../../../orchestrator/guardrails.js');
      vi.mocked(checkGuardrails).mockReturnValueOnce({ allowed: false, reason: 'No consent + quiet hours' });

      const result = await agent.processInboundLead({
        leadId,
        contactId,
        source: 'website',
        message: 'Hello',
        channel: 'sms',
      });

      expect(result.responseMessage).toContain('Blocked');
      expect(mockTwilioSendSms).not.toHaveBeenCalled();
    });
  });

  describe('processLeadReply', () => {
    it('re-qualifies a lead on reply and upgrades score', async () => {
      const leadId = `lead_${Date.now()}`;
      const contactId = `contact_${Date.now()}`;
      const convId = `conv_${Date.now()}`;

      mockPrisma.lead.findUnique.mockResolvedValue({
        id: leadId,
        status: 'contacted',
        qualificationScore: 45,
        classification: 'WARM',
        contact: {
          id: contactId,
          phone: '+15551234567',
          timezone: 'America/New_York',
        },
        conversations: [{
          id: convId,
          messages: [
            { role: 'agent', content: 'Hi! What are you looking for?' },
            { role: 'lead', content: 'Office space' },
          ],
        }],
      });

      mockPrisma.message.create.mockResolvedValue({});
      mockPrisma.lead.update.mockResolvedValue({});

      mockAgentInvoke.mockResolvedValue({
        output: `Great! Since you're the decision maker and need to move in 2 weeks, let me get you scheduled.\n\nROUTE: 85`,
      });

      const result = await agent.processLeadReply({
        leadId,
        message: "Yes, I'm the decision maker and need to move in 2 weeks",
        channel: 'sms',
      });

      expect(result.classification).toBe('HOT');
      expect(result.score).toBe(85);
      expect(mockBookAppointment).toHaveBeenCalled();
    });

    it('saves conversation history correctly', async () => {
      const leadId = `lead_${Date.now()}`;
      const contactId = `contact_${Date.now()}`;
      const convId = `conv_${Date.now()}`;

      mockPrisma.lead.findUnique.mockResolvedValue({
        id: leadId,
        status: 'contacted',
        contact: {
          id: contactId,
          phone: '+15551234567',
          timezone: 'America/New_York',
        },
        conversations: [{
          id: convId,
          messages: [
            { role: 'agent', content: 'Initial message' },
            { role: 'lead', content: 'Reply 1' },
            { role: 'agent', content: 'Follow up' },
          ],
        }],
      });

      mockPrisma.message.create.mockResolvedValue({});

      mockAgentInvoke.mockResolvedValue({
        output: 'Thanks for the info!',
      });

      await agent.processLeadReply({
        leadId,
        message: 'My budget is $2M',
        channel: 'sms',
      });

      // Should save the inbound message
      expect(mockPrisma.message.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ role: 'lead', content: 'My budget is $2M' }),
        })
      );

      // Should save the agent response
      expect(mockPrisma.message.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ role: 'agent', content: 'Thanks for the info!' }),
        })
      );
    });
  });

  describe('runNurtureDaily', () => {
    it('processes due cadences and sends SMS touches', async () => {
      const leadId = `lead_${Date.now()}`;
      const contactId = `contact_${Date.now()}`;
      const cadenceId = `cadence_${Date.now()}`;

      mockPrisma.lead.findUnique.mockResolvedValue({
        id: leadId,
        status: 'nurture',
        createdAt: new Date(),
        contact: {
          id: contactId,
          firstName: 'Test',
          lastName: 'Lead',
          phone: '+15551234567',
          email: 'test@example.com',
          timezone: 'America/New_York',
        },
        nurtureCadences: [],
      });

      mockPrisma.nurtureCadence.findMany.mockResolvedValue([{
        id: cadenceId,
        leadId,
        stage: 'day_3',
        channel: 'sms',
        template: 'check_in',
        status: 'scheduled',
        scheduledAt: new Date(Date.now() - 1000), // Due now
        lead: {
          id: leadId,
          contact: {
            id: contactId,
            firstName: 'Test',
            lastName: 'Lead',
            phone: '+15551234567',
            email: 'test@example.com',
            timezone: 'America/New_York',
          },
        },
      }]);

      mockPrisma.nurtureCadence.update.mockResolvedValue({});
      mockPrisma.nurtureCadence.create.mockResolvedValue({ id: `next_${Date.now()}` });
      mockPrisma.communicationEvent.create.mockResolvedValue({});

      const result = await agent.runNurtureDaily();

      expect(result.processed).toBe(1);
      expect(result.sent).toBe(1);
      expect(result.failed).toBe(0);
      expect(mockTwilioSendSms).toHaveBeenCalled();
    });

    it('skips cadences during quiet hours and reschedules', async () => {
      const leadId = `lead_${Date.now()}`;
      const contactId = `contact_${Date.now()}`;
      const cadenceId = `cadence_${Date.now()}`;

      mockTwilioCanSendNow.mockReturnValue(false);

      mockPrisma.lead.findUnique.mockResolvedValue({
        id: leadId,
        status: 'nurture',
        createdAt: new Date(),
        contact: {
          id: contactId,
          firstName: 'Test',
          lastName: 'Lead',
          phone: '+15551234567',
          email: 'test@example.com',
          timezone: 'America/New_York',
        },
        nurtureCadences: [],
      });

      mockPrisma.nurtureCadence.findMany.mockResolvedValue([{
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
            firstName: 'Test',
            lastName: 'Lead',
            phone: '+15551234567',
            email: 'test@example.com',
            timezone: 'America/New_York',
          },
        },
      }]);

      mockPrisma.nurtureCadence.update.mockResolvedValue({});

      const result = await agent.runNurtureDaily();

      expect(result.skipped).toBe(1);
      expect(mockTwilioSendSms).not.toHaveBeenCalled();

      // Should have rescheduled to tomorrow 9am
      expect(mockPrisma.nurtureCadence.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: cadenceId },
          data: expect.objectContaining({
            scheduledAt: expect.any(Date),
          }),
        })
      );
    });

    it('sends email touches when channel is email', async () => {
      const leadId = `lead_${Date.now()}`;
      const contactId = `contact_${Date.now()}`;
      const cadenceId = `cadence_${Date.now()}`;

      mockPrisma.lead.findUnique.mockResolvedValue({
        id: leadId,
        status: 'nurture',
        createdAt: new Date(),
        contact: {
          id: contactId,
          firstName: 'Test',
          lastName: 'Lead',
          phone: null,
          email: 'test@example.com',
          timezone: 'America/New_York',
        },
        nurtureCadences: [],
      });

      mockPrisma.nurtureCadence.findMany.mockResolvedValue([{
        id: cadenceId,
        leadId,
        stage: 'day_7',
        channel: 'email',
        template: 'market_update',
        status: 'scheduled',
        scheduledAt: new Date(Date.now() - 1000),
        lead: {
          id: leadId,
          contact: {
            id: contactId,
            firstName: 'Test',
            lastName: 'Lead',
            phone: null,
            email: 'test@example.com',
            timezone: 'America/New_York',
          },
        },
      }]);

      mockPrisma.nurtureCadence.update.mockResolvedValue({});
      mockPrisma.nurtureCadence.create.mockResolvedValue({ id: `next_${Date.now()}` });
      mockPrisma.communicationEvent.create.mockResolvedValue({});

      const result = await agent.runNurtureDaily();

      expect(result.sent).toBe(1);
      expect(mockResendSendEmail).toHaveBeenCalled();
      expect(mockTwilioSendSms).not.toHaveBeenCalled();
    });
  });

  describe('runColdRevival', () => {
    it('finds cold leads and schedules revival campaigns', async () => {
      const leadId = `lead_${Date.now()}`;
      const contactId = `contact_${Date.now()}`;

      mockPrisma.lead.findMany.mockResolvedValue([{
        id: leadId,
        status: 'nurture',
        updatedAt: new Date(Date.now() - 200 * 24 * 60 * 60 * 1000), // 200 days ago
        contact: {
          id: contactId,
          firstName: 'Cold',
          lastName: 'Lead',
          phone: '+15551234567',
          email: 'cold@example.com',
        },
      }]);

      mockPrisma.nurtureCadence.create.mockResolvedValue({ id: `cadence_${Date.now()}` });

      const result = await agent.runColdRevival();

      expect(result.processed).toBe(1);
      expect(result.sent).toBe(1);
      expect(mockPrisma.nurtureCadence.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            stage: 'day_60',
            channel: 'email',
            template: 're_engagement',
          }),
        })
      );
    });
  });

  describe('error handling', () => {
    it('handles Prisma errors gracefully in processInboundLead', async () => {
      mockPrisma.lead.findUnique.mockRejectedValue(new Error('DB connection lost'));

      await expect(
        agent.processInboundLead({
          leadId: 'lead_123',
          contactId: 'contact_123',
          source: 'website',
          message: 'Hello',
          channel: 'sms',
        })
      ).rejects.toThrow('DB connection lost');
    });

    it('handles SMS send failure without crashing', async () => {
      const { leadId, contactId } = setupLeadAndContact();

      mockTwilioSendSms.mockRejectedValueOnce(new Error('Twilio rate limit'));

      mockAgentInvoke.mockResolvedValue({
        output: 'Thanks for reaching out!',
      });

      // Should not throw — the agent catches and continues
      const result = await agent.processInboundLead({
        leadId,
        contactId,
        source: 'website',
        message: 'Hello',
        channel: 'sms',
      });

      expect(result.responseMessage).toContain('Thanks');
    });
  });
});
