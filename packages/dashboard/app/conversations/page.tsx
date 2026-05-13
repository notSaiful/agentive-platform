'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { MessageSquare } from 'lucide-react';

interface Conversation {
  id: string; status: string; agentId: string; createdAt: string;
  lead: { contact: { firstName: string | null; lastName: string | null; } | null; } | null;
  messages: { role: string; content: string; channel: string; timestamp: string }[];
}

export default function ConversationsPage() {
  const [items, setItems] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try { const data = await api.getLeads(); setItems([]); } catch (e) { console.error(e); } finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <header className="flex items-center gap-3 mb-6">
        <MessageSquare size={24} className="text-agentive-violet" />
        <div>
          <h1 className="text-2xl font-bold font-mono">Conversations</h1>
          <p className="text-sm text-agentive-text-muted">Chat history across all leads</p>
        </div>
      </header>

      <div className="glass rounded-xl p-8 text-center text-agentive-text-muted">
        {loading ? 'Loading...' : 'Conversation viewer coming soon. View lead details in the Leads tab.'}
      </div>
    </div>
  );
}
