import { describe, it, expect } from 'vitest';
import { routeLead } from '../router.js';
import { checkGuardrails } from '../guardrails.js';

describe('routeLead', () => {
  it('routes HOT lead with short timeline to appointment booking', () => {
    const result = routeLead({ classification: 'HOT', score: 90, timelineDays: 14, confidence: 0.95 });
    expect(result.route).toBe('BOOK_APPOINTMENT');
  });

  it('routes WARM lead to nurture', () => {
    const result = routeLead({ classification: 'WARM', score: 65, timelineDays: 60, confidence: 0.8 });
    expect(result.route).toBe('NURTURE');
  });

  it('escalates low confidence leads', () => {
    const result = routeLead({ classification: 'HOT', score: 85, timelineDays: 14, confidence: 0.5 });
    expect(result.route).toBe('ESCALATE');
  });

  it('routes COLD lead to nurture', () => {
    const result = routeLead({ classification: 'COLD', score: 30, timelineDays: 180, confidence: 0.7 });
    expect(result.route).toBe('NURTURE');
  });

  it('routes HOT lead with long timeline to nurture', () => {
    const result = routeLead({ classification: 'HOT', score: 82, timelineDays: 90, confidence: 0.9 });
    expect(result.route).toBe('NURTURE');
  });
});

describe('checkGuardrails', () => {
  it('blocks message during quiet hours (10pm)', () => {
    const result = checkGuardrails({ channel: 'sms', localHour: 22, hasConsent: true });
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('Quiet');
  });

  it('blocks message during quiet hours (2am)', () => {
    const result = checkGuardrails({ channel: 'sms', localHour: 2, hasConsent: true });
    expect(result.allowed).toBe(false);
  });

  it('blocks message without consent', () => {
    const result = checkGuardrails({ channel: 'sms', localHour: 14, hasConsent: false });
    expect(result.allowed).toBe(false);
  });

  it('allows compliant message during business hours', () => {
    const result = checkGuardrails({ channel: 'sms', localHour: 14, hasConsent: true });
    expect(result.allowed).toBe(true);
  });

  it('blocks message with fair housing violation', () => {
    const result = checkGuardrails({ channel: 'sms', localHour: 14, hasConsent: true, messageContent: 'This is a family-friendly neighborhood with good schools' });
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('Fair housing');
  });
});