import { COMPLIANCE, checkFairHousing } from '@agentive/shared';

interface GuardrailInput {
  channel: string;
  localHour: number;
  hasConsent: boolean;
  messageContent?: string;
}

interface GuardrailResult {
  allowed: boolean;
  reason?: string;
}

export function checkGuardrails(input: GuardrailInput): GuardrailResult {
  const { start, end } = COMPLIANCE.QUIET_HOURS;
  if (input.localHour >= start || input.localHour < end) {
    return { allowed: false, reason: `Quiet hours active (${start}:00-${end}:00)` };
  }

  if (!input.hasConsent) {
    return { allowed: false, reason: `No ${input.channel} consent on file` };
  }

  if (input.messageContent) {
    const { safe, violations } = checkFairHousing(input.messageContent);
    if (!safe) {
      return { allowed: false, reason: `Fair housing violation detected: ${violations.join(', ')}` };
    }
  }

  return { allowed: true };
}