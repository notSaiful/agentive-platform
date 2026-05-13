import { CircuitBreaker } from '@agentive/shared';

interface ResendConfig {
  apiKey: string;
  fromEmail: string;
}

export interface EmailMessage {
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  replyTo?: string;
  bcc?: string | string[];
  attachments?: Array<{
    filename: string;
    content: string;
  }>;
}

interface EmailLogEntry {
  to: string;
  subject: string;
  timestamp: Date;
  status: string;
  id: string;
}

export class ResendClient {
  private apiKey: string;
  private fromEmail: string;
  private sendLog: Map<string, EmailLogEntry[]> = new Map();
  private breaker: CircuitBreaker;

  constructor(config: ResendConfig) {
    this.apiKey = config.apiKey;
    this.fromEmail = config.fromEmail;
    this.breaker = new CircuitBreaker('resend', { failureThreshold: 5, resetTimeoutMs: 30000 });
  }

  /**
   * Send an email with circuit breaker, retries, and delivery tracking.
   */
  async sendEmail(message: EmailMessage, retries = 3): Promise<{ id: string; status: string }> {
    return this.breaker.execute(async () => {
      // Rate limit check: max 3 emails per contact per day
      const dailyCount = this.getDailyCount(Array.isArray(message.to) ? message.to[0] : message.to);
      if (dailyCount >= 3) {
        throw new Error(`Rate limit exceeded: ${dailyCount} emails today`);
      }

      for (let attempt = 1; attempt <= retries; attempt++) {
        try {
          const response = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${this.apiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              from: this.fromEmail,
              to: message.to,
              subject: message.subject,
              html: message.html,
              text: message.text,
              reply_to: message.replyTo,
              bcc: message.bcc,
              attachments: message.attachments,
            }),
          });

          if (!response.ok) {
            const error = await response.text();
            throw new Error(`Resend API error (${response.status}): ${error}`);
          }

          const data = await response.json();

          // Log the send
          const to = Array.isArray(message.to) ? message.to[0] : message.to;
          this.logSend(to, message.subject, data.id, 'sent');

          return { id: data.id, status: 'sent' };
        } catch (err) {
          const error = err as Error;
          console.error(`Resend attempt ${attempt} failed:`, error.message);

          if (attempt === retries) {
            throw new Error(`Resend failed after ${retries} attempts: ${error.message}`);
          }

          // Exponential backoff: 1s, 2s, 4s
          await new Promise((r) => setTimeout(r, Math.pow(2, attempt) * 1000));
        }
      }

      throw new Error('Resend failed: unreachable');
    });
  }

  /**
   * Send a batch of emails. Failures are logged but don't stop the batch.
   */
  async sendBatch(messages: EmailMessage[]): Promise<{ id: string; status: string }[]> {
    const results = await Promise.all(
      messages.map((msg) =>
        this.sendEmail(msg).catch((err) => {
          console.error('Batch email send failed:', err);
          return { id: '', status: 'failed' };
        })
      )
    );
    return results;
  }

  /**
   * Get daily email count for a contact.
   */
  getDailyCount(email: string): number {
    const logs = this.sendLog.get(email) ?? [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return logs.filter((l) => l.timestamp >= today).length;
  }

  private logSend(to: string, subject: string, id: string, status: string): void {
    const logs = this.sendLog.get(to) ?? [];
    logs.push({ to, subject, timestamp: new Date(), status, id });
    // Cap log size to prevent unbounded memory growth
    if (logs.length > 100) logs.shift();
    this.sendLog.set(to, logs);
  }
}
