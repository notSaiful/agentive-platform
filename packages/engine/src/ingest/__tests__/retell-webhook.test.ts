import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockPrisma = vi.hoisted(() => ({
  lead: {
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  conversation: {
    findFirst: vi.fn(),
    create: vi.fn(),
  },
  message: {
    create: vi.fn(),
  },
  communicationEvent: {
    create: vi.fn(),
  },
}));

vi.mock('../../db/client.js', () => ({
  prisma: mockPrisma,
}));

import { handleRetellCallEnded } from '../retell-webhook.js';

describe('handleRetellCallEnded', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('processes a completed call with qualification data', async () => {
    mockPrisma.lead.findUnique.mockResolvedValue({
      id: 'lead_1',
      contactId: 'contact_1',
      status: 'new',
    });
    mockPrisma.conversation.findFirst.mockResolvedValue(null);
    mockPrisma.conversation.create.mockResolvedValue({ id: 'conv_1' });

    const result = await handleRetellCallEnded({
      callId: 'call_123',
      leadId: 'lead_1',
      callStatus: 'ended',
      disposition: 'answered',
      transcript: 'Lead wants a 3br house, budget around $500k',
      qualificationData: {
        budget: '$500k',
        timelineDays: 30,
        decisionMaker: 'yes',
        intent: 'ready_to_buy',
      },
    });

    expect(result.leadId).toBe('lead_1');
    expect(result.disposition).toBe('answered');
  });

  it('returns no-answer disposition for unanswered calls', async () => {
    const result = await handleRetellCallEnded({
      callId: 'call_456',
      leadId: 'lead_2',
      callStatus: 'ended',
      disposition: 'no-answer',
    });

    expect(result.disposition).toBe('no-answer');
    expect(result.shouldSmsFallback).toBe(true);
  });

  it('returns voicemail disposition with fallback flag', async () => {
    const result = await handleRetellCallEnded({
      callId: 'call_789',
      leadId: 'lead_3',
      callStatus: 'ended',
      disposition: 'voicemail',
    });

    expect(result.disposition).toBe('voicemail');
    expect(result.shouldSmsFallback).toBe(true);
  });
});