import { describe, it, expect, vi } from 'vitest';
import { TwilioClient } from '../client.js';

describe('TwilioClient', () => {
  it('initializes with API Key credentials', () => {
    const client = new TwilioClient({
      accountSid: 'ACtest',
      apiKeySid: 'SKtest',
      apiKeySecret: 'secret',
      phoneNumber: '+15551234567',
    });
    expect(client).toBeDefined();
  });

  it('respects quiet hours', () => {
    const client = new TwilioClient({
      accountSid: 'ACtest',
      apiKeySid: 'SKtest',
      apiKeySecret: 'secret',
      phoneNumber: '+15551234567',
    });
    // Mock 10am ET (sendable)
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-15T10:00:00-05:00'));
    expect(client.canSendNow('America/New_York')).toBe(true);
    // Mock 11pm ET (quiet hours)
    vi.setSystemTime(new Date('2026-01-15T23:00:00-05:00'));
    expect(client.canSendNow('America/New_York')).toBe(false);
    vi.useRealTimers();
  });
});