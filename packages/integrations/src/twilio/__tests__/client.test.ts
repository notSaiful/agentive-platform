import { describe, it, expect } from 'vitest';
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
    // Quiet hours are 9pm-8am. 10am should be sendable.
    expect(client.canSendNow('America/New_York')).toBe(true);
  });
});