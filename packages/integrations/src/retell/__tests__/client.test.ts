import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RetellClient } from '../client.js';

describe('RetellClient', () => {
  let client: RetellClient;

  beforeEach(() => {
    client = new RetellClient({ apiKey: 'test-key' });
  });

  it('creates a phone call', async () => {
    const mockResponse = { call_id: 'call_123' };
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    } as Response);

    const result = await client.createPhoneCall({
      agentId: 'agent_abc',
      fromNumber: '+16414589112',
      toNumber: '+15551234567',
      metadata: { leadId: 'lead_1', contactId: 'contact_1' },
    });

    expect(result.callId).toBe('call_123');
  });

  it('gets call status', async () => {
    const mockResponse = {
      call_id: 'call_123',
      call_status: 'ended',
      start_timestamp: 1000,
      end_timestamp: 5000,
      call_analysis: { call_summary: 'Lead is interested' },
    };
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    } as Response);

    const result = await client.getCall('call_123');
    expect(result.callStatus).toBe('ended');
    expect(result.callId).toBe('call_123');
  });

  it('creates a retell LLM agent', async () => {
    const mockResponse = { agent_id: 'agent_new' };
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    } as Response);

    const result = await client.createAgent({
      prompt: 'You are a real estate assistant.',
      voiceId: '11labs_voice_id',
    });

    expect(result.agentId).toBe('agent_new');
  });

  it('throws on API error', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      json: () => Promise.resolve({}),
    } as Response);

    await expect(client.createPhoneCall({
      agentId: 'agent_abc',
      fromNumber: '+16414589112',
      toNumber: '+15551234567',
    })).rejects.toThrow('Retell API error: 401');
  });
});