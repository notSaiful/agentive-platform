import { describe, it, expect } from 'vitest';
import { scoreLead, classifyLead } from '../scorer.js';

describe('scoreLead', () => {
  it('scores a hot lead with all positive signals', () => {
    const result = scoreLead({
      budgetIdentified: true,
      timelineDays: 14,
      isDecisionMaker: true,
      intentSignals: ['ready to buy', 'pre-approved'],
    });
    expect(result.score).toBeGreaterThanOrEqual(80);
    expect(result.classification).toBe('HOT');
  });

  it('scores a cold browsing lead', () => {
    const result = scoreLead({
      budgetIdentified: false,
      timelineDays: 180,
      isDecisionMaker: false,
      intentSignals: ['just looking'],
    });
    expect(result.score).toBeLessThan(50);
    expect(result.classification).toBe('COLD');
  });

  it('scores a warm lead', () => {
    const result = scoreLead({
      budgetIdentified: true,
      timelineDays: 60,
      isDecisionMaker: false,
      intentSignals: [],
    });
    expect(result.classification).toBe('WARM');
  });

  it('applies exploring penalty', () => {
    const result = scoreLead({
      budgetIdentified: true,
      timelineDays: 14,
      isDecisionMaker: true,
      intentSignals: ['just browsing'],
    });
    expect(result.breakdown.exploring).toBe(-40);
  });
});

describe('classifyLead', () => {
  it('classifies 80+ as HOT', () => {
    expect(classifyLead(80)).toBe('HOT');
    expect(classifyLead(100)).toBe('HOT');
  });

  it('classifies 50-79 as WARM', () => {
    expect(classifyLead(50)).toBe('WARM');
    expect(classifyLead(79)).toBe('WARM');
  });

  it('classifies below 50 as COLD', () => {
    expect(classifyLead(49)).toBe('COLD');
    expect(classifyLead(0)).toBe('COLD');
  });
});