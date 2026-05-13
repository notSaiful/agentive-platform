'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Bell, AlertTriangle, Info, XCircle } from 'lucide-react';

interface Alert {
  id: string; type: string; severity: 'critical' | 'warning' | 'info'; message: string; metadata?: Record<string, unknown>; createdAt: string;
}

const severityConfig = {
  critical: { icon: XCircle, color: 'bg-agentive-error/20 text-agentive-error border-agentive-error/30' },
  warning: { icon: AlertTriangle, color: 'bg-agentive-warning/20 text-agentive-warning border-agentive-warning/30' },
  info: { icon: Info, color: 'bg-agentive-cyan/20 text-agentive-cyan border-agentive-cyan/30' },
};

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try { const data = await api.getAlerts(); setAlerts(data.active || []); } catch (e) { console.error(e); } finally { setLoading(false); }
  }

  useEffect(() => { load(); const i = setInterval(load, 30000); return () => clearInterval(i); }, []);

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <header className="flex items-center gap-3 mb-6">
        <Bell size={24} className="text-agentive-cyan" />
        <div>
          <h1 className="text-2xl font-bold font-mono">Alerts</h1>
          <p className="text-sm text-agentive-text-muted">{alerts.length} active · system health monitoring</p>
        </div>
      </header>

      <div className="space-y-4">
        {alerts.map((alert) => {
          const cfg = severityConfig[alert.severity] || severityConfig.info;
          const Icon = cfg.icon;
          return (
            <div key={alert.id} className={`glass rounded-xl p-5 border ${cfg.color}`}>
              <div className="flex items-start gap-3">
                <Icon size={20} className="mt-0.5 shrink-0" />
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-mono uppercase tracking-wider opacity-70">{alert.severity}</span>
                    <span className="text-xs text-agentive-text-muted">{alert.type}</span>
                  </div>
                  <div className="text-sm">{alert.message}</div>
                  {alert.metadata && (
                    <pre className="mt-2 text-xs text-agentive-text-muted bg-white/5 rounded-lg p-2 font-mono overflow-auto">{JSON.stringify(alert.metadata, null, 2)}</pre>
                  )}
                  <div className="text-xs text-agentive-text-muted mt-2">{new Date(alert.createdAt).toLocaleString()}</div>
                </div>
              </div>
            </div>
          );
        })}
        {alerts.length === 0 && (
          <div className="glass rounded-xl p-8 text-center">
            <Info size={32} className="mx-auto mb-3 text-agentive-cyan" />
            <div className="text-agentive-text-secondary">{loading ? 'Loading...' : 'All systems healthy'}</div>
            <div className="text-xs text-agentive-text-muted mt-1">No active alerts at this time</div>
          </div>
        )}
      </div>
    </div>
  );
}
