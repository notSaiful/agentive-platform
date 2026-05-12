import { describe, it, expect } from 'vitest';
import { NURTURE_TEMPLATES, renderTemplate } from '../content.js';

describe('NURTURE_TEMPLATES', () => {
  it('has templates for all cadence stages', () => {
    const requiredKeys = ['check_in', 'market_update', 'new_listing_alert', 'long_term_nurture', 're_engagement', 'market_digest'];
    for (const key of requiredKeys) {
      expect(NURTURE_TEMPLATES[key]).toBeDefined();
      expect(NURTURE_TEMPLATES[key].body).toBeDefined();
    }
  });

  it('check_in has SMS variant', () => {
    expect(NURTURE_TEMPLATES.check_in.sms).toBeDefined();
  });

  it('market_update has SMS variant', () => {
    expect(NURTURE_TEMPLATES.market_update.sms).toBeDefined();
  });

  it('new_listing_alert has SMS variant', () => {
    expect(NURTURE_TEMPLATES.new_listing_alert.sms).toBeDefined();
  });

  it('re_engagement has SMS variant', () => {
    expect(NURTURE_TEMPLATES.re_engagement.sms).toBeDefined();
  });
});

describe('renderTemplate', () => {
  it('interpolates all variables in check_in template', () => {
    const result = renderTemplate('check_in', {
      firstName: 'Alice',
      agentName: 'Agentive',
    });

    expect(result.body).toContain('Alice');
    expect(result.body).toContain('Agentive');
    expect(result.sms).toContain('Alice');
    expect(result.sms).toContain('Agentive');
  });

  it('interpolates city and propertyType in market_update', () => {
    const result = renderTemplate('market_update', {
      firstName: 'Bob',
      city: 'Austin',
      listingChange: '12',
      avgDaysOnMarket: '45',
      priceTrend: 'stable',
      agentName: 'Agentive',
    });

    expect(result.body).toContain('Bob');
    expect(result.body).toContain('Austin');
    expect(result.sms).toContain('Austin');
  });

  it('interpolates month in market_digest subject', () => {
    const result = renderTemplate('market_digest', {
      firstName: 'Charlie',
      city: 'Dallas',
      month: 'May',
      marketDigestContent: 'Prices up 5%',
      agentName: 'Agentive',
    });

    expect(result.body).toContain('Charlie');
    expect(result.body).toContain('Dallas');
    expect(result.subject).toContain('May');
    expect(result.subject).toContain('Dallas');
  });

  it('preserves unmatched placeholders when variable missing', () => {
    const result = renderTemplate('market_update', {
      firstName: 'Dana',
    });

    expect(result.body).toContain('Dana');
    expect(result.body).toContain('{city}');
  });

  it('returns fallback for unknown template key', () => {
    const result = renderTemplate('nonexistent', {
      fallback: 'Custom fallback message',
    });

    expect(result.body).toBe('Custom fallback message');
  });

  it('returns default fallback when no fallback provided', () => {
    const result = renderTemplate('nonexistent', {});
    expect(result.body).toBe('Hello, following up on your inquiry.');
  });

  it('SMS stays under 160 characters for check_in', () => {
    const result = renderTemplate('check_in', {
      firstName: 'Alice',
      agentName: 'Agentive',
    });

    expect(result.sms!.length).toBeLessThanOrEqual(160);
  });
});
