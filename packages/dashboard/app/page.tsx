'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import {
  Users,
  MessageSquare,
  Calendar,
  AlertTriangle,
  HeartPulse,
  TrendingUp,
  Clock,
} from 'lucide-react';

interface Metrics {
  leads: { last24h: number; last7d: number; last30d: number };
  messages: { last24h: number };
  appointments: { last24h: number };
  escalations: { pending: number };
  nurture: { dueCadences: number };
  llm: { callCount: number; avgLatencyMs: number };
}

function KpiCard({
  title,
  value,
  sub,
  icon: Icon,
  color,
}: {
  title: string;
  value: string | number;
  sub?: string;
  icon: React.ElementType;
  color: string;
}) {
  return (
    <div className="glass rounded-xl p-5 terminal-border">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm text-agentive-text-secondary">{title}</span>
        <div className={`p-2 rounded-lg ${color}`}>
          <Icon size={18} className="text-white" />
        </div>
      </div>
      <div className="text-2xl font-bold font-mono text-white">{value}</div>
      {sub && <div className="text-xs text-agentive-text-muted mt-1">{sub}</div>}
    </div>
  );
}

export default function DashboardPage() {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        const data = await api.getMetrics();
        if (mounted) setMetrics(data);
      } catch (e) {
        if (mounted) setError((e as Error).message);
      } finally {
        if (mounted) setLoading(false);
      }
    }
    load();
    const interval = setInterval(load, 30000);
    return () => { mounted = false; clearInterval(interval); };
  }, []);

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center h-screen">
        <div className="text-agentive-cyan font-mono animate-pulse">Loading dashboard...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8">
        <div className="glass rounded-xl p-6 border border-agentive-error/30">
          <div className="text-agentive-error font-mono">Error: {error}</div>
          <div className="text-sm text-agentive-text-muted mt-2">
            Check that NEXT_PUBLIC_ENGINE_URL and NEXT_PUBLIC_API_KEY are set.
          </div>
        </div>
      </div>
    );
  }

  if (!metrics) return null;

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <header className="mb-8">
        <h1 className="text-3xl font-bold font-mono text-white mb-1">Dashboard</h1>
        <p className="text-sm text-agentive-text-muted">
          Real-time performance overview — updates every 30s
        </p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <KpiCard
          title="Leads (24h)"
          value={metrics.leads.last24h}
          sub={`${metrics.leads.last7d} this week · ${metrics.leads.last30d} this month`}
          icon={Users}
          color="bg-agentive-cyan/20"
        />
        <KpiCard
          title="Messages (24h)"
          value={metrics.messages.last24h}
          sub="Outbound + inbound"
          icon={MessageSquare}
          color="bg-agentive-violet/20"
        />
        <KpiCard
          title="Appointments (24h)"
          value={metrics.appointments.last24h}
          sub="Auto-booked via Cal.com"
          icon={Calendar}
          color="bg-agentive-success/20"
        />
        <KpiCard
          title="Pending Escalations"
          value={metrics.escalations.pending}
          sub="Need human attention"
          icon={AlertTriangle}
          color="bg-agentive-warning/20"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="glass rounded-xl p-5 terminal-border">
          <div className="flex items-center gap-2 mb-4">
            <HeartPulse size={18} className="text-agentive-magenta" />
            <span className="font-mono text-sm font-semibold">Nurture Queue</span>
          </div>
          <div className="text-3xl font-bold font-mono text-white mb-1">
            {metrics.nurture.dueCadences}
          </div>
          <div className="text-xs text-agentive-text-muted">
            Cadences due for delivery
          </div>
        </div>

        <div className="glass rounded-xl p-5 terminal-border">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp size={18} className="text-agentive-cyan" />
            <span className="font-mono text-sm font-semibold">LLM Calls</span>
          </div>
          <div className="text-3xl font-bold font-mono text-white mb-1">
            {metrics.llm.callCount}
          </div>
          <div className="text-xs text-agentive-text-muted">
            Avg latency: {metrics.llm.avgLatencyMs}ms
          </div>
        </div>

        <div className="glass rounded-xl p-5 terminal-border">
          <div className="flex items-center gap-2 mb-4">
            <Clock size={18} className="text-agentive-warning" />
            <span className="font-mono text-sm font-semibold">System Health</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-agentive-success animate-pulse"></span>
            <span className="text-sm text-agentive-text-secondary">All systems operational</span>
          </div>
          <div className="text-xs text-agentive-text-muted mt-2">
            Last updated: {new Date().toLocaleTimeString()}
          </div>
        </div>
      </div>
    </div>
  );
}
