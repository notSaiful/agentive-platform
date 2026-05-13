'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { AlertTriangle, Clock } from 'lucide-react';

interface Escalation {
  id: string; reason: string; status: string; confidence: number; context: string; createdAt: string;
  lead: { contact: { firstName: string | null; lastName: string | null; phone: string | null; email: string | null; } | null; } | null;
}

export default function EscalationsPage() {
  const [items, setItems] = useState<Escalation[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try { const data = await api.getEscalations(); setItems(data); } catch (e) { console.error(e); } finally { setLoading(false); }
  }

  useEffect(() => { load(); const i = setInterval(load, 30000); return () => clearInterval(i); }, []);

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <header className="flex items-center gap-3 mb-6">
        <AlertTriangle size={24} className="text-agentive-error" />
        <div>
          <h1 className="text-2xl font-bold font-mono">Escalations</h1>
          <p className="text-sm text-agentive-text-muted">{items.length} pending · needs human attention</p>
        </div>
      </header>

      <div className="space-y-4">
        {items.map((esc) => (
          <div key={esc.id} className="glass rounded-xl p-5 terminal-border">
            <div className="flex items-start justify-between mb-3">
              <div>
                <div className="text-sm font-semibold">
                  {esc.lead?.contact?.firstName || esc.lead?.contact?.lastName
                    ? `${esc.lead.contact.firstName || ''} ${esc.lead.contact.lastName || ''}`
                    : 'Unknown Lead'}
                </div>
                <div className="text-xs text-agentive-text-muted mt-1">{esc.lead?.contact?.phone || esc.lead?.contact?.email || 'No contact info'}</div>
              </div>
              <div className="flex items-center gap-2">
                <span className="px-2 py-1 rounded text-xs font-medium bg-agentive-error/20 text-agentive-error">{esc.status}</span>
                <div className="flex items-center gap-1 text-xs text-agentive-text-muted"><Clock size={12} />{new Date(esc.createdAt).toLocaleDateString()}</div>
              </div>
            </div>
            <div className="text-sm text-agentive-text-secondary mb-2"><span className="text-agentive-cyan font-mono">Reason:</span> {esc.reason}</div>
            <div className="text-xs text-agentive-text-muted bg-white/5 rounded-lg p-3 font-mono">{esc.context}</div>
            <div className="mt-3 flex items-center gap-2">
              <div className="text-xs text-agentive-text-muted">Confidence: {(esc.confidence * 100).toFixed(0)}%</div>
              <div className="flex-1 h-1 bg-white/10 rounded-full overflow-hidden">
                <div className="h-full bg-agentive-warning rounded-full" style={{ width: `${esc.confidence * 100}%` }} />
              </div>
            </div>
          </div>
        ))}
        {items.length === 0 && (
          <div className="glass rounded-xl p-8 text-center text-agentive-text-muted">{loading ? 'Loading...' : 'No pending escalations'}</div>
        )}
      </div>
    </div>
  );
}
