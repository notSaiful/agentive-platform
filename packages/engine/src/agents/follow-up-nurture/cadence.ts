export type NurtureStage =
  | 'day_3'
  | 'day_7'
  | 'day_14'
  | 'day_30'
  | 'day_60'
  | 'day_90'
  | 'monthly';

export interface CadenceRule {
  stage: NurtureStage;
  daysAfterPrevious: number;
  channels: Array<'sms' | 'email' | 'voice'>;
  template: string;
  priority: number;
}

export const DEFAULT_CADENCE: CadenceRule[] = [
  { stage: 'day_3', daysAfterPrevious: 3, channels: ['sms', 'email'], template: 'check_in', priority: 10 },
  { stage: 'day_7', daysAfterPrevious: 4, channels: ['sms', 'email'], template: 'market_update', priority: 9 },
  { stage: 'day_14', daysAfterPrevious: 7, channels: ['sms', 'email'], template: 'new_listing_alert', priority: 8 },
  { stage: 'day_30', daysAfterPrevious: 16, channels: ['email'], template: 'long_term_nurture', priority: 7 },
  { stage: 'day_60', daysAfterPrevious: 30, channels: ['sms', 'email'], template: 're_engagement', priority: 6 },
  { stage: 'day_90', daysAfterPrevious: 30, channels: ['email'], template: 'market_digest', priority: 5 },
  { stage: 'monthly', daysAfterPrevious: 30, channels: ['email'], template: 'market_digest', priority: 4 },
];

export function getNextStage(currentStage?: NurtureStage): CadenceRule | null {
  if (!currentStage) return DEFAULT_CADENCE[0];
  const idx = DEFAULT_CADENCE.findIndex((r) => r.stage === currentStage);
  if (idx === -1) return null;
  return DEFAULT_CADENCE[idx + 1] ?? null;
}

export function calculateNextTouchDate(lastTouchAt: Date, rule: CadenceRule): Date {
  const next = new Date(lastTouchAt);
  next.setDate(next.getDate() + rule.daysAfterPrevious);
  return next;
}

export function shouldSendTouch(cadence: { scheduledAt: Date; status: string }): boolean {
  return cadence.status === 'scheduled' && new Date() >= cadence.scheduledAt;
}
