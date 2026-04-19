import twilio from 'twilio';
import { COMPLIANCE } from '@agentive/shared';

interface TwilioConfig {
  accountSid: string;
  authToken: string;
  phoneNumber: string;
}

export class TwilioClient {
  private client: ReturnType<typeof twilio>;
  private phoneNumber: string;

  constructor(config: TwilioConfig) {
    this.client = twilio(config.accountSid, config.authToken);
    this.phoneNumber = config.phoneNumber;
  }

  async sendSms(to: string, body: string): Promise<{ sid: string; status: string }> {
    const message = await this.client.messages.create({
      body,
      from: this.phoneNumber,
      to,
    });
    return { sid: message.sid, status: message.status };
  }

  canSendNow(timezone: string): boolean {
    const now = new Date();
    const localHour = parseInt(
      now.toLocaleString('en-US', { timeZone: timezone, hour: 'numeric', hour12: false })
    );
    const { start, end } = COMPLIANCE.QUIET_HOURS;
    if (end <= start) return localHour >= end && localHour < start;
    return localHour >= end && localHour < start;
  }
}