import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SpeedToLeadAgent } from '../index.js';

const { mockPrisma, mockEmitter } = vi.hoisted(() => ({
  mockPrisma: {
    lead: { findUnique: vi.fn(), update: vi.fn() },
    contact: { findUnique: vi.fn() },
    conversation: { findFirst: vi.fn(), create: vi.fn() },
    message: { create: vi.fn() },
    communicationEvent: { create: vi.fn() },
  },
  mockEmitter: { emit: vi.fn() },
}));

vi.mock('../../../db/client.js', () => ({
  prisma: mockPrisma,
}));

vi.mock('@agentive/shared', () => ({
  globalEmitter: mockEmitter,
  COMPLIANCE: { QUIET_HOURS: { start: 21, end: 8 } },
  checkFairHousing: () => ({ safe: true, violations: [] }),
}));

vi.mock('../../../orchestrator/guardrails.js', () => ({
  checkGuardrails: vi.fn().mockReturnValue({ allowed: true }),
}));

const mockRetellClient = {
  createPhoneCall: vi.fn(),
};

const mockOpenRouterClient = {
  chat: vi.fn(),
};

const mockTwilioClient = {
  sendSms: vi.fn(),
  canSendNow: vi.fn().mockReturnValue(true),
};

describe('SpeedToLeadAgent', () => {
  let agent: SpeedToLeadAgent;
  let originalRetellAgentId: string | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    mockTwilioClient.canSendNow.mockReturnValue(true);
    originalRetellAgentId = process.env.RETELL_AGENT_ID;
    process.env.RETELL_AGENT_ID = 'retell_agent_test';
    agent = new SpeedToLeadAgent({
      retellClient: mockRetellClient as any,
      openRouterClient: mockOpenRouterClient as any,
      twilioClient: mockTwilioClient as any,
    });
  });

  afterEach(() => {
    process.env.RETELL_AGENT_ID = originalRetellAgentId;
  });

  it('triggers a Retell call for a new lead with phone number', async () => {
    mockPrisma.lead.findUnique.mockResolvedValue({ id: 'lead_1', status: 'new' });
    mockPrisma.contact.findUnique.mockResolvedValue({
      id: 'contact_1',
      firstName: 'Sarah',
      phone: '+15551234567',
      smsConsent: true,
      timezone: 'America/New_York',
    });
    mockPrisma.communicationEvent.create.mockResolvedValue({});
    mockRetellClient.createPhoneCall.mockResolvedValue({ callId: 'call_1' });

    const result = await agent.processInboundLead({
      leadId: 'lead_1',
      contactId: 'contact_1',
      source: 'webform',
      message: 'I am interested in the property',
      channel: 'phone',
    });

    expect(mockRetellClient.createPhoneCall).toHaveBeenCalledWith(
      expect.objectContaining({ toNumber: '+15551234567' })
    );
    expect(result.responseMessage).toContain('Voice call initiated');
  });

  it('falls back to SMS when lead has no phone', async () => {
    mockPrisma.lead.findUnique.mockResolvedValue({ id: 'lead_2', status: 'new' });
    mockPrisma.contact.findUnique.mockResolvedValue({
      id: 'contact_2',
      firstName: 'John',
      phone: null,
      email: 'john@test.com',
      emailConsent: true,
      smsConsent: false,
      timezone: 'America/New_York',
    });
    mockOpenRouterClient.chat.mockResolvedValue('Hi John! What kind of property are you looking for?');
    mockPrisma.conversation.findFirst.mockResolvedValue(null);
    mockPrisma.conversation.create.mockResolvedValue({ id: 'conv_1' });

    const result = await agent.processInboundLead({
      leadId: 'lead_2',
      contactId: 'contact_2',
      source: 'webform',
      message: 'Interested in a condo',
      channel: 'sms',
    });

    expect(mockRetellClient.createPhoneCall).not.toHaveBeenCalled();
    expect(mockOpenRouterClient.chat).toHaveBeenCalled();
    expect(result.responseMessage).toContain('John');
  });

  it('sends SMS fallback when Retell call is not answered', async () => {
    mockPrisma.lead.findUnique.mockResolvedValue({ id: 'lead_3', status: 'contacted' });
    mockPrisma.contact.findUnique.mockResolvedValue({
      id: 'contact_3',
      firstName: 'Alex',
      phone: '+15559876543',
      smsConsent: true,
      timezone: 'America/New_York',
    });
    mockOpenRouterClient.chat.mockResolvedValue('Hi Alex! Sorry we missed you — are you still looking?');
    mockPrisma.conversation.findFirst.mockResolvedValue(null);
    mockPrisma.conversation.create.mockResolvedValue({ id: 'conv_2' });

    const result = await agent.handleCallNoAnswer({
      leadId: 'lead_3',
      contactId: 'contact_3',
      callId: 'call_2',
    });

    expect(mockOpenRouterClient.chat).toHaveBeenCalled();
    expect(mockTwilioClient.sendSms).toHaveBeenCalled();
  });
});