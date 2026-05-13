'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Calendar, Clock, Link2 } from 'lucide-react';

interface Appointment {
  id: string; status: string; scheduledAt: string; link: string | null; metadata: Record<string, unknown>;
  lead: { contact: { firstName: string | null; lastName: string | null; phone: string | null; email: string | null; } | null; } | null;
}

export default function AppointmentsPage() {
  const [items, setItems] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try { const data = await api.getAppointments(); setItems(data); } catch (e) { console.error(e); } finally { setLoading(false); }
  }

  useEffect(() => { load(); const i = setInterval(load, 30000); return () => clearInterval(i); }, []);

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <header className="flex items-center gap-3 mb-6">
        <Calendar size={24} className="text-agentive-success" />
        <div>
          <h1 className="text-2xl font-bold font-mono">Appointments</h1>
          <p className="text-sm text-agentive-text-muted">{items.length} total · auto-booked via Cal.com</p>
        </div>
      </header>

      <div className="space-y-4">
        {items.map((appt) => (
          <div key={appt.id} className="glass rounded-xl p-5 terminal-border flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold">
                {appt.lead?.contact?.firstName || appt.lead?.contact?.lastName
                  ? `${appt.lead.contact.firstName || ''} ${appt.lead.contact.lastName || ''}`
                  : 'Unknown Lead'}
              </div>
              <div className="flex items-center gap-4 mt-2 text-xs text-agentive-text-muted">
                <span className="flex items-center gap-1"><Clock size={12} />{new Date(appt.scheduledAt).toLocaleString()}</span>
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${appt.status === 'confirmed' ? 'bg-agentive-success/20 text-agentive-success' : 'bg-agentive-warning/20 text-agentive-warning'}`}>{appt.status}</span>
              </div>
            </div>
            {appt.link && (
              <a href={appt.link} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1 px-3 py-2 rounded-lg bg-agentive-cyan/10 text-agentive-cyan text-xs hover:bg-agentive-cyan/20 transition-colors">
                <Link2 size={14} /> Open
              </a>
            )}
          </div>
        ))}
        {items.length === 0 && (
          <div className="glass rounded-xl p-8 text-center text-agentive-text-muted">{loading ? 'Loading...' : 'No appointments booked'}</div>
        )}
      </div>
    </div>
  );
}
