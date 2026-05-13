export type AlertSeverity = 'critical' | 'warning' | 'info';

export interface Alert {
  id: string;
  type: string;
  severity: AlertSeverity;
  message: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  resolvedAt?: Date;
}

class AlertManager {
  private alerts: Alert[] = [];
  private maxAlerts = 100;

  addAlert(type: string, severity: AlertSeverity, message: string, metadata?: Record<string, unknown>) {
    const alert: Alert = {
      id: `alert_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      type,
      severity,
      message,
      metadata,
      createdAt: new Date(),
    };
    this.alerts.push(alert);
    if (this.alerts.length > this.maxAlerts) {
      this.alerts.shift();
    }
    return alert;
  }

  getActiveAlerts(): Alert[] {
    return this.alerts.filter((a) => !a.resolvedAt);
  }

  resolveAlert(id: string) {
    const alert = this.alerts.find((a) => a.id === id);
    if (alert) {
      alert.resolvedAt = new Date();
    }
  }

  clearOldAlerts(maxAgeMs = 24 * 60 * 60 * 1000) {
    const cutoff = Date.now() - maxAgeMs;
    this.alerts = this.alerts.filter((a) =>
      !a.resolvedAt || a.resolvedAt.getTime() > cutoff,
    );
  }
}

export const alertManager = new AlertManager();

// ── Failure Throttler ─────────────────────────────────────────────────────────

class FailureThrottler {
  private failures: { timestamp: number; queue: string; jobName: string }[] = [];
  private windowMs: number;
  private threshold: number;

  constructor(threshold = 5, windowMs = 10 * 60 * 1000) {
    this.threshold = threshold;
    this.windowMs = windowMs;
  }

  recordFailure(queue: string, jobName: string): boolean {
    const now = Date.now();
    this.failures = this.failures.filter((f) => now - f.timestamp < this.windowMs);
    this.failures.push({ timestamp: now, queue, jobName });

    const countInWindow = this.failures.filter((f) => f.queue === queue).length;
    return countInWindow >= this.threshold;
  }

  getFailureCount(queue: string): number {
    const now = Date.now();
    return this.failures.filter((f) => now - f.timestamp < this.windowMs && f.queue === queue).length;
  }
}

export const failureThrottler = new FailureThrottler(5, 10 * 60 * 1000);
