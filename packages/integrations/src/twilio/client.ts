import twilio from 'twilio';
import { COMPLIANCE, CircuitBreaker } from '@agentive/shared';

interface TwilioConfig {
  accountSid: string;
  apiKeySid: string;
  apiKeySecret: string;
  phoneNumber: string;
}

interface SmsLogEntry {
  to: string;
  body: string;
  timestamp: Date;
  status: string;
  sid: string;
}

export class TwilioClient {
  private client: ReturnType<typeof twilio>;
  private phoneNumber: string;
  private sendLog: Map<string, SmsLogEntry[]> = new Map();
  private breaker: CircuitBreaker;

  constructor(config: TwilioConfig) {
    this.client = twilio(config.apiKeySid, config.apiKeySecret, {
      accountSid: config.accountSid,
    });
    this.phoneNumber = config.phoneNumber;
    this.breaker = new CircuitBreaker('twilio', { failureThreshold: 5, resetTimeoutMs: 30000 });
  }

  /**
   * Send an SMS with circuit breaker, retries, rate limiting, and delivery tracking.
   */
  async sendSms(to: string, body: string, retries = 3): Promise<{ sid: string; status: string }> {
    return this.breaker.execute(async () => {
      // Rate limit checks
      const dailyCount = this.getDailyCount(to);
      if (dailyCount >= COMPLIANCE.MAX_MESSAGES_PER_DAY) {
        throw new Error(`Rate limit exceeded for ${to}: ${dailyCount} messages today (max ${COMPLIANCE.MAX_MESSAGES_PER_DAY})`);
      }

      const weeklyCount = this.getWeeklyCount(to);
      if (weeklyCount >= COMPLIANCE.MAX_MESSAGES_PER_WEEK) {
        throw new Error(`Rate limit exceeded for ${to}: ${weeklyCount} messages this week (max ${COMPLIANCE.MAX_MESSAGES_PER_WEEK})`);
      }

      for (let attempt = 1; attempt <= retries; attempt++) {
        try {
          const message = await this.client.messages.create({
            body,
            from: this.phoneNumber,
            to,
            statusCallback: process.env.TWILIO_STATUS_CALLBACK_URL,
          });

          // Log the send
          this.logSend(to, body, message.sid, message.status);

          return { sid: message.sid, status: message.status };
        } catch (err) {
          const error = err as Error;
          console.error(`Twilio SMS attempt ${attempt} failed:`, error.message);

          if (attempt === retries) {
            throw new Error(`Twilio SMS failed after ${retries} attempts: ${error.message}`);
          }

          // Exponential backoff: 1s, 2s, 4s
          await new Promise((r) => setTimeout(r, Math.pow(2, attempt) * 1000));
        }
      }

      throw new Error('Twilio SMS failed: unreachable');
    });
  }

  /**
   * Check if we can send SMS now (quiet hours + consent implied by caller).
   */
  canSendNow(timezone: string): boolean {
    const now = new Date();
    const localHour = parseInt(
      now.toLocaleString('en-US', { timeZone: timezone, hour: 'numeric', hour12: false })
    );
    const { start, end } = COMPLIANCE.QUIET_HOURS;
    // Quiet hours are [start, end). We can send when we're NOT in quiet hours.
    if (end <= start) {
      // Wrap-around (e.g., 21:00 to 08:00) — quiet hours span midnight
      return localHour >= end && localHour < start;
    }
    // Non-wrap-around (e.g., 10:00 to 18:00)
    return localHour < start || localHour >= end;
  }

  /**
   * Get daily message count for a contact.
   */
  getDailyCount(phone: string): number {
    const logs = this.sendLog.get(phone) ?? [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return logs.filter((l) => l.timestamp >= today).length;
  }

  /**
   * Get weekly message count for a contact.
   */
  getWeeklyCount(phone: string): number {
    const logs = this.sendLog.get(phone) ?? [];
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    weekAgo.setHours(0, 0, 0, 0);
    return logs.filter((l) => l.timestamp >= weekAgo).length;
  }

  private logSend(to: string, body: string, sid: string, status: string): void {
    const logs = this.sendLog.get(to) ?? [];
    logs.push({ to, body, timestamp: new Date(), status, sid });
    // Cap log size to prevent unbounded memory growth
    if (logs.length > 100) logs.shift();
    this.sendLog.set(to, logs);
  }
}
