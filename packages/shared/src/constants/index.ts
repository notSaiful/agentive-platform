export const SLA = {
  FIRST_RESPONSE_SECONDS: 300,      // 5 minutes
  FOLLOW_UP_SECONDS: 900,           // 15 minutes
  ESCALATION_TIMEOUT_SECONDS: 1800,  // 30 minutes
} as const;

export const SCORING = {
  WEIGHTS: {
    BUDGET_IDENTIFIED: 50,
    TIMELINE_UNDER_30: 30,
    TIMELINE_30_90: 15,
    DECISION_MAKER: 20,
    STRONG_INTENT: 40,
    EXPLORING_PENALTY: -40,
  },
  THRESHOLDS: {
    HOT: 80,
    WARM: 50,
  },
  CONFIDENCE_ESCALATION: 0.6,
} as const;

export const COMPLIANCE = {
  QUIET_HOURS: { start: 21, end: 8 },   // 9pm - 8am local time
  MAX_MESSAGES_PER_DAY: 3,
  MAX_MESSAGES_PER_WEEK: 7,
  OPT_OUT_KEYWORDS: ['STOP', 'UNSUBSCRIBE', 'CANCEL', 'QUIT', 'END'],
} as const;

export const CHANNELS = {
  SMS: 'sms',
  EMAIL: 'email',
  PHONE: 'phone',
  WEBCHAT: 'webchat',
} as const;