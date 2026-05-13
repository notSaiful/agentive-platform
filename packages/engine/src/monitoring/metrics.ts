import { prisma } from '../db/client.js';

interface LatencyRecord {
  count: number;
  totalMs: number;
}

class MetricsTracker {
  private llmCalls: LatencyRecord = { count: 0, totalMs: 0 };
  private startTimes = new Map<string, number>();

  startLlmCall(traceId: string) {
    this.startTimes.set(traceId, Date.now());
  }

  endLlmCall(traceId: string) {
    const start = this.startTimes.get(traceId);
    if (start) {
      this.llmCalls.count++;
      this.llmCalls.totalMs += Date.now() - start;
      this.startTimes.delete(traceId);
    }
  }

  getLlmMetrics() {
    return {
      callCount: this.llmCalls.count,
      avgLatencyMs: this.llmCalls.count > 0 ? Math.round(this.llmCalls.totalMs / this.llmCalls.count) : 0,
    };
  }

  reset() {
    this.llmCalls = { count: 0, totalMs: 0 };
    this.startTimes.clear();
  }
}

export const metricsTracker = new MetricsTracker();

// ── System Metrics ──────────────────────────────────────────────────────────

export async function getSystemMetrics() {
  const now = new Date();
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [
    leads24h,
    leads7d,
    leads30d,
    messages24h,
    appointments24h,
    pendingEscalations,
    dueCadences,
  ] = await Promise.all([
    prisma.lead.count({ where: { createdAt: { gte: dayAgo } } }),
    prisma.lead.count({ where: { createdAt: { gte: weekAgo } } }),
    prisma.lead.count({ where: { createdAt: { gte: monthAgo } } }),
    prisma.message.count({ where: { timestamp: { gte: dayAgo } } }),
    prisma.appointment.count({ where: { createdAt: { gte: dayAgo } } }),
    prisma.escalation.count({ where: { status: 'pending' } }),
    prisma.nurtureCadence.count({ where: { status: 'scheduled', scheduledAt: { lte: now } } }),
  ]);

  return {
    leads: { last24h: leads24h, last7d: leads7d, last30d: leads30d },
    messages: { last24h: messages24h },
    appointments: { last24h: appointments24h },
    escalations: { pending: pendingEscalations },
    nurture: { dueCadences },
    llm: metricsTracker.getLlmMetrics(),
  };
}
