export interface MessageTemplate {
  key: string;
  subject?: string;
  body: string;
  sms?: string;
}

export const NURTURE_TEMPLATES: Record<string, MessageTemplate> = {
  check_in: {
    key: 'check_in',
    subject: 'Quick check-in',
    sms: "Hi {firstName}, just checking in — any questions about the property we discussed? I'm here to help. - {agentName}",
    body: `Hi {firstName},

I hope you're doing well. I wanted to follow up and see if you had any questions about the property we discussed, or if there's anything else I can help you with in your search.

Feel free to reply to this message or give me a call anytime.

Best,
{agentName}`,
  },
  market_update: {
    key: 'market_update',
    subject: 'Market update for {city}',
    sms: "Hi {firstName}, the {city} market is shifting. New listings up {listingChange}% this month. Want a quick update? - {agentName}",
    body: `Hi {firstName},

I wanted to share a quick market update for {city}:

• New listings are up {listingChange}% compared to last month
• Average days on market: {avgDaysOnMarket}
• Price per sq ft trending: {priceTrend}

If you'd like to see what's available in your target area, just reply and I'll send over a curated list.

Best,
{agentName}`,
  },
  new_listing_alert: {
    key: 'new_listing_alert',
    subject: 'New listing alert — {propertyType} in {city}',
    sms: "Hi {firstName}, a new {propertyType} just hit the market in {city} that matches your search. Want details? - {agentName}",
    body: `Hi {firstName},

A new {propertyType} just hit the market in {city} that I think you'll be interested in:

{propertyDetails}

Let me know if you'd like to schedule a tour or if you have any questions.

Best,
{agentName}`,
  },
  long_term_nurture: {
    key: 'long_term_nurture',
    subject: "Checking in — no pressure, just here when you're ready",
    body: `Hi {firstName},

I know the commercial real estate process can take time, and I want you to know that I'm here whenever you're ready to move forward.

In the meantime, if anything changes with your timeline or requirements, just let me know. I'll make sure you're the first to know about opportunities that fit your criteria.

Talk soon,
{agentName}`,
  },
  re_engagement: {
    key: 're_engagement',
    subject: 'A fresh angle for your search',
    sms: "Hi {firstName}, it's been a while. I found a new opportunity that might be a fit — different approach than what we discussed before. Interested? - {agentName}",
    body: `Hi {firstName},

It's been a little while since we last connected, and I wanted to reach out with a fresh angle.

I've come across some new opportunities that take a different approach than what we originally discussed — they might actually be a better fit for your goals.

Would you be open to a brief call to explore? No pressure at all.

Best,
{agentName}`,
  },
  market_digest: {
    key: 'market_digest',
    subject: '{month} market digest — {city}',
    body: `Hi {firstName},

Here's your monthly market digest for {city}:

{marketDigestContent}

If you'd like to discuss how these trends impact your search, just reply to this email.

Best,
{agentName}`,
  },
};

export function renderTemplate(
  templateKey: string,
  variables: Record<string, string>
): { subject?: string; body: string; sms?: string } {
  const template = NURTURE_TEMPLATES[templateKey];
  if (!template) {
    return { body: variables.fallback || 'Hello, following up on your inquiry.' };
  }

  const interpolate = (text: string) =>
    text.replace(/\{(\w+)\}/g, (_, key) => variables[key] || `{${key}}`);

  return {
    subject: template.subject ? interpolate(template.subject) : undefined,
    body: interpolate(template.body),
    sms: template.sms ? interpolate(template.sms) : undefined,
  };
}
