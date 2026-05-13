'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { AlertTriangle, Clock, Send, MessageCircle } from 'lucide-react';

interface Escalation {
  id: string; reason: string; status: string; confidence: number; context: string; createdAt: string;
  lead: { id: string; contact: { id: string; firstName: string | null; lastName: string | null; phone: string | null; email: string | null; smsConsent: boolean; emailConsent: boolean; } | null; } | null;
}

export default function EscalationsPage() {
  const [items, setItems] = useState<Escalation[]>([]);
  const [loading, setLoading] = useState(true);
  const [replyingId, setReplyingId] = useState<string | null>(null);
  const [replyContent, setReplyContent] = useState('');
  const [replyChannel, setReplyChannel] = useState('sms');
  const [sending, setSending] = useState(false);

  async function load() {
    setLoading(true);
    try { const data = await api.getEscalations(); setItems(data); } catch (e) { console.error(e); } finally { setLoading(false); }
  }

  useEffect(() => { load(); const i = setInterval(load, 30000); return () => clearInterval(i); }, []);

  async function handleReply(esc: Escalation) {
    if (!replyContent.trim() || !esc.lead?.contact) return;
    setSending(true);
    try {
      await api.sendMessage({
        leadId: esc.lead.id,
        contactId: esc.lead.contact.id,
        channel: replyChannel,
        content: replyContent.trim(),
      });
      setReplyContent('');
      setReplyingId(null);
      alert('Reply sent successfully');
    } catch (e) {
      alert('Failed to send: ' + (e as Error).message);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <header className="flex items-center gap-3 mb-6">
        <AlertTriangle size={24} className="text-agentive-error" />
        <div>
          <h1 className="text-2xl font-bold font-mono">Escalations</h1>
          <p className="text-sm text-agentive-text-muted">{items.length} pending · needs human attention · reply directly from here</p>
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

            <div className="text-xs text-agentive-text-muted bg-white/5 rounded-lg p-3 font-mono mb-3">{esc.context}</div>

            <div className="flex items-center gap-2 mb-3">
              <div className="text-xs text-agentive-text-muted">Confidence: {(esc.confidence * 100).toFixed(0)}%</div>
              <div className="flex-1 h-1 bg-white/10 rounded-full overflow-hidden">
                <div className="h-full bg-agentive-warning rounded-full" style={{ width: `${esc.confidence * 100}%` }} />
              </div>
            </div>

            {replyingId === esc.id ? (
              <div className="border-t border-white/5 pt-3 animate-fade-up">
                <div className="flex items-center gap-2 mb-2">
                  <button onClick={() => setReplyChannel('sms')}
                    className={`px-3 py-1 rounded text-xs ${replyChannel === 'sms' ? 'bg-agentive-cyan/20 text-agentive-cyan' : 'bg-white/5 text-agentive-text-muted'}`}
                    disabled={!esc.lead?.contact?.phone}
                  >SMS</button>
                  <button onClick={() => setReplyChannel('email')}
                    className={`px-3 py-1 rounded text-xs ${replyChannel === 'email' ? 'bg-agentive-cyan/20 text-agentive-cyan' : 'bg-white/5 text-agentive-text-muted'}`}
                    disabled={!esc.lead?.contact?.email}
                  >Email</button>
                </div>
                <div className="flex items-center gap-2">
                  <input value={replyContent} onChange={(e) => setReplyContent(e.target.value)}
                    placeholder="Type your reply..." onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleReply(esc); } }}
                    className="flex-1 px-3 py-2 rounded-lg glass text-sm text-white placeholder:text-agentive-text-muted border border-white/5 focus:outline-none focus:border-agentive-cyan/30" />
                  <button onClick={() => handleReply(esc)} disabled={sending || !replyContent.trim()}
                    className="flex items-center gap-1 px-3 py-2 rounded-lg bg-agentive-cyan/20 text-agentive-cyan text-xs hover:bg-agentive-cyan/30 disabled:opacity-50"
                  ><Send size={14} /> {sending ? '...' : 'Send'}</button>
                  <button onClick={() => setReplyingId(null)} className="text-xs text-agentive-text-muted hover:text-white">Cancel</button>
                </div>
              </div>
            ) : (
              <button onClick={() => setReplyingId(esc.id)}
                className="flex items-center gap-1 text-xs text-agentive-cyan hover:text-white transition-colors"
              >
                <MessageCircle size={14} /> Reply to lead
              </button>
            )}
          </div>
        ))}

        {items.length === 0 && (
          <div className="glass rounded-xl p-8 text-center text-agentive-text-muted">{loading ? 'Loading...' : 'No pending escalations'}</div>
        )}
      </div>
    </div>
  );
}
