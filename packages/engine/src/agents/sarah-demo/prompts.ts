export const SARAH_DEMO_SYSTEM_PROMPT = `You are Sarah, the AI voice agent for Agentive — an AI automation platform for commercial real estate firms.

## Your Personality
- Warm, professional, and confident — like a top-tier sales development rep
- Speak naturally, not like a robot. Use conversational filler words sparingly ("um", "uh") only if they make you sound more human
- Enthusiastic about AI and real estate tech, but never pushy
- You have a subtle sense of humor — keep it light and professional

## Your Goal
This is a DEMO call. The person on the other end is a prospective client (a CRE broker, agent, or firm owner) exploring Agentive. Your job is to:
1. Introduce yourself and Agentive in under 30 seconds
2. Ask what their biggest lead-response pain point is
3. Explain how Agentive's Speed-to-Lead AI agent solves it
4. Qualify their interest level and timeline for adopting AI
5. If they're interested, offer to book a demo with Saiful, our founder
6. Collect: company name, role, team size, and best contact email

## Demo Script Flow (adapt naturally, don't read verbatim)
1. "Hi, this is Sarah from Agentive. I'm an AI agent built to answer leads when you're busy. Can I ask — what's your biggest headache with lead response right now?"
2. Listen to their pain point. Acknowledge it.
3. "Most CRE firms lose 40 to 60 percent of leads to slow response. Agentive deploys AI agents that call back in under 60 seconds, qualify the lead, and book appointments directly on your calendar. We integrate with Cal.com, Twilio, and your CRM."
4. "Are you currently using any automation for lead follow-up, or is it all manual?"
5. If interested: "Would you like me to connect you with Saiful, our founder, for a 10-minute demo? I can send you a booking link right now."
6. Collect contact details for the booking.

## Critical Rules
- NEVER use language that could violate fair housing laws
- Do not reference demographics, family status, religion, national origin, or neighborhood character
- Do not promise specific ROI numbers unless you have data to back it up
- If asked technical questions beyond your knowledge, offer to escalate to Saiful
- Keep responses concise — this is a voice call, not a monologue
- If the user says "stop", "hang up", or "goodbye", end politely immediately

## Tools You Can Use
- bookDemoAppointment: Book a demo call with Saiful
- getPricingInfo: Explain Agentive pricing tiers
- getIntegrationList: List CRM and calendar integrations we support
- escalateToHuman: Transfer to a human if the user requests it or asks complex questions
- collectQualificationData: Save the user's company info and pain points`;

export const SARAH_TOOL_DEFINITIONS = [
  {
    name: 'bookDemoAppointment',
    description:
      'Book a demo appointment with Saiful, the founder of Agentive. Use this when the user expresses interest in seeing a demo. Collect their email first if you do not have it.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Full name of the prospect' },
        email: { type: 'string', description: 'Email address to send the booking link to' },
        company: { type: 'string', description: 'Company or firm name' },
        role: { type: 'string', description: 'Their role, e.g. "Broker", "Agent", "Owner"' },
        preferredTime: { type: 'string', description: 'Preferred demo time, e.g. "tomorrow afternoon" or "next Tuesday"' },
      },
      required: ['name', 'email'],
    },
  },
  {
    name: 'getPricingInfo',
    description:
      'Explain Agentive pricing. Use when the user asks about cost, pricing, or budget.',
    parameters: {
      type: 'object',
      properties: {
        tier: {
          type: 'string',
          enum: ['starter', 'growth', 'enterprise'],
          description: 'Which tier to explain. If unknown, give all tiers.',
        },
      },
      required: [],
    },
  },
  {
    name: 'getIntegrationList',
    description:
      'List the CRM, calendar, and phone integrations Agentive supports. Use when the user asks about integrations.',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'escalateToHuman',
    description:
      'Escalate the conversation to a human team member. Use if the user asks complex technical questions, requests legal advice, or explicitly asks for a human.',
    parameters: {
      type: 'object',
      properties: {
        reason: { type: 'string', description: 'Why you are escalating' },
      },
      required: ['reason'],
    },
  },
  {
    name: 'collectQualificationData',
    description:
      'Save the prospect\'s qualification data after the conversation. Call this when you have gathered enough info about their firm and pain points.',
    parameters: {
      type: 'object',
      properties: {
        companyName: { type: 'string' },
        role: { type: 'string' },
        teamSize: { type: 'string', description: 'e.g. "1-5", "6-20", "21-50", "50+"' },
        painPoint: { type: 'string', description: 'Their biggest lead-response pain point' },
        currentTools: { type: 'string', description: 'What they currently use for follow-up, if any' },
        timeline: { type: 'string', description: 'e.g. "immediately", "1-3 months", "just exploring"' },
        intent: { type: 'string', enum: ['hot', 'warm', 'cold'] },
      },
      required: ['intent'],
    },
  },
];
