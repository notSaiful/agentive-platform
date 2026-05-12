import { describe, it, expect } from 'vitest';
import { DEFAULT_CADENCE, getNextStage, calculateNextTouchDate, shouldSendTouch } from '../cadence.js';

describe('DEFAULT_CADENCE', () => {
  it('has 7 stages from day_3 to monthly', () => {
    expect(DEFAULT_CADENCE.length).toBe(7);
    expect(DEFAULT_CADENCE[0].stage).toBe('day_3');
    expect(DEFAULT_CADENCE[6].stage).toBe('monthly');
  });

  it('each stage has required fields', () => {
    for (const rule of DEFAULT_CADENCE) {
      expect(rule.stage).toBeDefined();
      expect(rule.daysAfterPrevious).toBeGreaterThan(0);
      expect(rule.channels.length).toBeGreaterThan(0);
      expect(rule.template).toBeDefined();
      expect(rule.priority).toBeGreaterThan(0);
    }
  });
});

describe('getNextStage', () => {
  it('returns day_3 as first stage when no current stage', () => {
    const next = getNextStage(undefined);
    expect(next).toBeDefined();
    expect(next!.stage).toBe('day_3');
  });

  it('returns day_7 after day_3', () => {
    const next = getNextStage('day_3');
    expect(next!.stage).toBe('day_7');
  });

  it('returns day_14 after day_7', () => {
    const next = getNextStage('day_7');
    expect(next!.stage).toBe('day_14');
  });

  it('returns monthly after day_90', () => {
    const next = getNextStage('day_90');
    expect(next!.stage).toBe('monthly');
  });

  it('returns null after monthly (end of cadence)', () => {
    const next = getNextStage('monthly');
    expect(next).toBeNull();
  });

  it('returns null for unknown stage', () => {
    const next = getNextStage('unknown_stage' as any);
    expect(next).toBeNull();
  });
});

describe('calculateNextTouchDate', () => {
  it('adds daysAfterPrevious to lastTouchAt', () => {
    const lastTouch = new Date('2024-01-01T10:00:00Z');
    const rule = DEFAULT_CADENCE[0]; // day_3, 3 days after
    const next = calculateNextTouchDate(lastTouch, rule);

    const expected = new Date('2024-01-04T10:00:00Z');
    expect(next.getTime()).toBe(expected.getTime());
  });

  it('handles month boundaries correctly', () => {
    const lastTouch = new Date('2024-01-30T10:00:00Z');
    const rule = { stage: 'day_3' as const, daysAfterPrevious: 5, channels: ['sms'] as Array<'sms'>, template: 'test', priority: 1 };
    const next = calculateNextTouchDate(lastTouch, rule);

    const expected = new Date('2024-02-04T10:00:00Z');
    expect(next.getTime()).toBe(expected.getTime());
  });
});

describe('shouldSendTouch', () => {
  it('returns true when scheduled and past due', () => {
    const cadence = { scheduledAt: new Date(Date.now() - 1000), status: 'scheduled' };
    expect(shouldSendTouch(cadence)).toBe(true);
  });

  it('returns false when scheduled but future', () => {
    const cadence = { scheduledAt: new Date(Date.now() + 86400000), status: 'scheduled' };
    expect(shouldSendTouch(cadence)).toBe(false);
  });

  it('returns false when already sent', () => {
    const cadence = { scheduledAt: new Date(Date.now() - 1000), status: 'sent' };
    expect(shouldSendTouch(cadence)).toBe(false);
  });

  it('returns false when failed', () => {
    const cadence = { scheduledAt: new Date(Date.now() - 1000), status: 'failed' };
    expect(shouldSendTouch(cadence)).toBe(false);
  });
});
