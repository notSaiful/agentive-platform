'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Users, Filter, RefreshCw } from 'lucide-react';

interface Lead {
  id: string;
  status: string;
  classification: string | null;
  qualificationScore: number | null;
  source: string;
  createdAt: string;
  contact: {
    firstName: string | null;
    lastName: string | null;
    phone: string | null;
    email: string | null;
  } | null;
}

const statusColors: Record<string, string> = {
  new: 'bg-agentive-cyan/20 text-agentive-cyan',
  contacted: 'bg-agentive-violet/20 text-agentive-violet',
  qualified: 'bg-agentive-success/20 text-agentive-success',
  nurture: 'bg-agentive-warning/20 text-agentive-warning',
  appointment_booked: 'bg-agentive-success/20 text-agentive-success',
  escalated: 'bg-agentive-error/20 text-agentive-error',
  disqualified: 'bg-agentive-text-muted/20 text-agentive-text-muted',
};

const classColors: Record<string, string> = {
  HOT: 'bg-agentive-error/20 text-agentive-error',
  WARM: 'bg-agentive-warning/20 text-agentive-warning',
  COLD: 'bg-agentive-cyan/20 text-agentive-cyan',
};

export default function LeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');

  async function load() {
    setLoading(true);
    try { const data = await api.getLeads(); setLeads(data); } catch (e) { console.error(e); } finally { setLoading(false); }
  }

  useEffect(() => { load(); const i = setInterval(load, 30000); return () => clearInterval(i); }, []);

  const filtered = leads.filter((l) =>
    `${l.contact?.firstName} ${l.contact?.lastName} ${l.contact?.email} ${l.contact?.phone} ${l.source}`
      .toLowerCase().includes(filter.toLowerCase())
  );

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <header className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Users size={24} className="text-agentive-cyan" />
          <div>
            <h1 className="text-2xl font-bold font-mono">Leads</h1>
            <p className="text-sm text-agentive-text-muted">{leads.length} total · auto-updating</p>
          </div>
        </div>
        <button onClick={load} className="flex items-center gap-2 px-4 py-2 rounded-lg glass text-sm text-agentive-cyan hover:bg-agentive-cyan/10 transition-colors">
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </header>

      <div className="relative max-w-sm mb-4">
        <Filter size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-agentive-text-muted" />
        <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter leads..."
          className="w-full pl-9 pr-4 py-2 rounded-lg glass text-sm text-white placeholder:text-agentive-text-muted focus:outline-none focus:border-agentive-cyan/30 border border-white/5" />
      </div>

      <div className="glass rounded-xl overflow-hidden terminal-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/5 text-agentive-text-secondary">
              <th className="px-4 py-3 text-left font-mono">Name</th>
              <th className="px-4 py-3 text-left font-mono">Contact</th>
              <th className="px-4 py-3 text-left font-mono">Source</th>
              <th className="px-4 py-3 text-left font-mono">Status</th>
              <th className="px-4 py-3 text-left font-mono">Class</th>
              <th className="px-4 py-3 text-left font-mono">Score</th>
              <th className="px-4 py-3 text-left font-mono">Created</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((lead) => (
              <tr key={lead.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                <td className="px-4 py-3">
                  {lead.contact?.firstName || lead.contact?.lastName
                    ? `${lead.contact.firstName || ''} ${lead.contact.lastName || ''}`
                    : <span className="text-agentive-text-muted">—</span>}
                </td>
                <td className="px-4 py-3 text-agentive-text-secondary">{lead.contact?.phone || lead.contact?.email || '—'}</td>
                <td className="px-4 py-3 text-agentive-text-secondary">{lead.source}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-1 rounded text-xs font-medium ${statusColors[lead.status] || 'bg-white/10 text-white'}`}>{lead.status}</span>
                </td>
                <td className="px-4 py-3">
                  {lead.classification ? (
                    <span className={`px-2 py-1 rounded text-xs font-medium ${classColors[lead.classification] || 'bg-white/10 text-white'}`}>{lead.classification}</span>
                  ) : (<span className="text-agentive-text-muted">—</span>)}
                </td>
                <td className="px-4 py-3 font-mono">{lead.qualificationScore ?? <span className="text-agentive-text-muted">—</span>}</td>
                <td className="px-4 py-3 text-agentive-text-muted">{new Date(lead.createdAt).toLocaleDateString()}</td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-agentive-text-muted">{loading ? 'Loading...' : 'No leads found'}</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
