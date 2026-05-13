'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { HeartPulse, Clock, Send } from 'lucide-react';

interface Cadence {
  id: string; stage: string; channel: string; template: string; status: string; scheduledAt: string; sentAt: string | null;
  lead: { contact: { firstName: string | null; lastName: string | null; } | null; } | null;
}

const statusColors: Record<string, string> = {
  scheduled: 'bg-agentive-cyan/20 text-agentive-cyan',
  sent: 'bg-agentive-success/20 text-agentive-success',
  failed: 'bg-agentive-error/20 text-agentive-error',
  skipped: 'bg-agentive-text-muted/20 text-agentive-text-muted',
};

export default function NurturePage() {
  const [items, setItems] = useState<Cadence[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try { const data = await api.getNurtureCadences(); setItems(data); } catch (e) { console.error(e); } finally { setLoading(false); }
  }

  useEffect(() => { load(); const i = setInterval(load, 30000); return () => clearInterval(i); }, []);

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <header className="flex items-center gap-3 mb-6">
        <HeartPulse size={24} className="text-agentive-magenta" />
        <div>
          <h1 className="text-2xl font-bold font-mono">Nurture Cadences</h1>
          <p className="text-sm text-agentive-text-muted">{items.length} total · auto-scheduled follow-ups</p>
        </div>
      </header>

      <div className="glass rounded-xl overflow-hidden terminal-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/5 text-agentive-text-secondary">
              <th className="px-4 py-3 text-left font-mono">Lead</th>
              <th className="px-4 py-3 text-left font-mono">Stage</th>
              <th className="px-4 py-3 text-left font-mono">Channel</th>
              <th className="px-4 py-3 text-left font-mono">Template</th>
              <th className="px-4 py-3 text-left font-mono">Status</th>
              <th className="px-4 py-3 text-left font-mono">Scheduled</th>
              <th className="px-4 py-3 text-left font-mono">Sent</th>
            </tr>
          </thead>
          <tbody>
            {items.map((c) => (
              <tr key={c.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                <td className="px-4 py-3">
                  {c.lead?.contact?.firstName || c.lead?.contact?.lastName
                    ? `${c.lead.contact.firstName || ''} ${c.lead.contact.lastName || ''}`
                    : <span className="text-agentive-text-muted">—</span>}
                </td>
                <td className="px-4 py-3 font-mono text-agentive-cyan">{c.stage}</td>
                <td className="px-4 py-3">
                  <span className="flex items-center gap-1">
                    <Send size={12} /> {c.channel}
                  </span>
                </td>
                <td className="px-4 py-3 text-agentive-text-secondary">{c.template}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-1 rounded text-xs font-medium ${statusColors[c.status] || 'bg-white/10 text-white'}`}>{c.status}</span>
                </td>
                <td className="px-4 py-3 text-agentive-text-muted flex items-center gap-1"><Clock size={12} />{new Date(c.scheduledAt).toLocaleDateString()}</td>
                <td className="px-4 py-3 text-agentive-text-muted">{c.sentAt ? new Date(c.sentAt).toLocaleDateString() : '—'}</td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-agentive-text-muted">{loading ? 'Loading...' : 'No cadences scheduled'}</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
