'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Users, Filter, RefreshCw, MessageCircle, Send, ChevronDown, ChevronUp, Phone, Mail } from 'lucide-react';

interface Lead {
  id: string; status: string; classification: string | null; qualificationScore: number | null;
  source: string; createdAt: string;
  contact: { id: string; firstName: string | null; lastName: string | null; phone: string | null; email: string | null; smsConsent: boolean; emailConsent: boolean; } | null;
}

interface Message {
  id: string; role: string; channel: string; content: string; timestamp: string;
}

interface Conversation {
  id: string; messages: Message[];
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

function ConversationPanel({ lead, onClose }: { lead: Lead; onClose: () => void }) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [reply, setReply] = useState('');
  const [channel, setChannel] = useState('sms');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const data = await api.getLeadConversations(lead.id);
      setConversations(data);
    } catch (e) { console.error(e); } finally { setLoading(false); }
  }

  useEffect(() => { load(); const i = setInterval(load, 10000); return () => clearInterval(i); }, [lead.id]);

  async function handleSend() {
    if (!reply.trim() || !lead.contact) return;
    setSending(true);
    try {
      await api.sendMessage({
        leadId: lead.id,
        contactId: lead.contact.id,
        channel,
        content: reply.trim(),
      });
      setReply('');
      await load();
    } catch (e) {
      alert('Failed to send: ' + (e as Error).message);
    } finally {
      setSending(false);
    }
  }

  const allMessages = conversations.flatMap((c) => c.messages).sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  return (
    <div className="glass rounded-xl p-5 terminal-border mt-4 animate-fade-up">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <MessageCircle size={18} className="text-agentive-cyan" />
          <span className="font-mono text-sm font-semibold">Conversation</span>
          <span className="text-xs text-agentive-text-muted">{allMessages.length} messages · auto-updating</span>
        </div>
        <button onClick={onClose} className="text-agentive-text-muted hover:text-white transition-colors">Close</button>
      </div>

      <div className="space-y-3 max-h-80 overflow-y-auto pr-2 mb-4">
        {loading && allMessages.length === 0 && (
          <div className="text-center text-agentive-text-muted py-4">Loading...</div>
        )}
        {allMessages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.role === 'lead' ? 'justify-start' : 'justify-end'}`}>
            <div className={`max-w-[80%] rounded-xl px-4 py-2 text-sm ${
              msg.role === 'lead'
                ? 'bg-white/5 text-white border border-white/5'
                : 'bg-agentive-cyan/10 text-agentive-cyan border border-agentive-cyan/20'
            }`}>
              <div className="text-xs opacity-60 mb-1 flex items-center gap-1">
                {msg.role === 'lead' ? 'Lead' : 'Agent'} · {msg.channel} · {new Date(msg.timestamp).toLocaleTimeString()}
              </div>
              <div className="whitespace-pre-wrap">{msg.content}</div>
            </div>
          </div>
        ))}
        {allMessages.length === 0 && !loading && (
          <div className="text-center text-agentive-text-muted py-4">No messages yet</div>
        )}
      </div>

      {lead.contact && (
        <div className="border-t border-white/5 pt-4">
          <div className="flex items-center gap-2 mb-2">
            <button
              onClick={() => setChannel('sms')}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                channel === 'sms' ? 'bg-agentive-cyan/20 text-agentive-cyan' : 'bg-white/5 text-agentive-text-muted hover:text-white'
              }`}
              disabled={!lead.contact.phone || !lead.contact.smsConsent}
            >
              <Phone size={12} /> SMS
            </button>
            <button
              onClick={() => setChannel('email')}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                channel === 'email' ? 'bg-agentive-cyan/20 text-agentive-cyan' : 'bg-white/5 text-agentive-text-muted hover:text-white'
              }`}
              disabled={!lead.contact.email || !lead.contact.emailConsent}
            >
              <Mail size={12} /> Email
            </button>
          </div>

          <div className="flex items-center gap-2">
            <input
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
              placeholder={`Type ${channel} reply...`}
              className="flex-1 px-4 py-2.5 rounded-lg glass text-sm text-white placeholder:text-agentive-text-muted focus:outline-none focus:border-agentive-cyan/30 border border-white/5"
            />
            <button
              onClick={handleSend}
              disabled={sending || !reply.trim()}
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-agentive-cyan/20 text-agentive-cyan text-sm font-medium hover:bg-agentive-cyan/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Send size={16} />
              {sending ? 'Sending...' : 'Send'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function LeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [expandedLeadId, setExpandedLeadId] = useState<string | null>(null);

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
            <p className="text-sm text-agentive-text-muted">{leads.length} total · auto-updating · click row to view conversation</p>
          </div>
        </div>
        <button onClick={load} className="flex items-center gap-2 px-4 py-2 rounded-lg glass text-sm text-agentive-cyan hover:bg-agentive-cyan/10 transition-colors"
        >
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
              <th className="px-4 py-3 text-left font-mono w-8"></th>
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
              <>
                <tr
                  key={lead.id}
                  onClick={() => setExpandedLeadId(expandedLeadId === lead.id ? null : lead.id)}
                  className="border-b border-white/5 hover:bg-white/5 transition-colors cursor-pointer"
                >
                  <td className="px-4 py-3">
                    {expandedLeadId === lead.id ? <ChevronUp size={16} className="text-agentive-cyan" /> : <ChevronDown size={16} className="text-agentive-text-muted" />}
                  </td>
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
                {expandedLeadId === lead.id && (
                  <tr>
                    <td colSpan={9} className="px-4 pb-4">
                      <ConversationPanel lead={lead} onClose={() => setExpandedLeadId(null)} />
                    </td>
                  </tr>
                )}
              </>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={9} className="px-4 py-8 text-center text-agentive-text-muted">{loading ? 'Loading...' : 'No leads found'}</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
