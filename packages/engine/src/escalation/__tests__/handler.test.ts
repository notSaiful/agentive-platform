import { describe, it, expect } from 'vitest';
import { shouldEscalate } from '../handler.js';

describe('shouldEscalate', () => {
  it('returns true for low confidence', () => {
    expect(shouldEscalate({ confidence: 0.4 })).toBe(true);
  });

  it('returns false for high confidence', () => {
    expect(shouldEscalate({ confidence: 0.9 })).toBe(false);
  });

  it('returns true for policy risk', () => {
    expect(shouldEscalate({ confidence: 0.9, policyRisk: true })).toBe(true);
  });

  it('returns true for high value', () => {
    expect(shouldEscalate({ confidence: 0.85, highValue: true })).toBe(true);
  });

  it('returns true for compliance', () => {
    expect(shouldEscalate({ confidence: 0.9, compliance: true })).toBe(true);
  });
});