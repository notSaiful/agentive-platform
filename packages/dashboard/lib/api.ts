const API_BASE = process.env.NEXT_PUBLIC_ENGINE_URL || 'https://agentive-engine.fly.dev';
const API_KEY = process.env.NEXT_PUBLIC_API_KEY || '';

async function fetchApi(path: string, options: RequestInit = {}) {
  const url = `${API_BASE}${path}`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(API_KEY ? { 'x-api-key': API_KEY } : {}),
    ...((options.headers as Record<string, string>) || {}),
  };

  const res = await fetch(url, { ...options, headers });
  if (!res.ok) {
    const err = await res.text().catch(() => 'Unknown error');
    throw new Error(`API ${res.status}: ${err}`);
  }
  return res.json();
}

export const api = {
  getLeads: (params?: { status?: string; classification?: string }) =>
    fetchApi(`/api/leads?${new URLSearchParams(params || {}).toString()}`),
  getLeadConversations: (leadId: string) => fetchApi(`/api/leads/${leadId}/conversations`),
  sendMessage: (body: { leadId: string; contactId: string; channel: string; content: string }) =>
    fetchApi('/api/messages/send', { method: 'POST', body: JSON.stringify(body) }),
  getMetrics: () => fetchApi('/api/metrics'),
  getEscalations: () => fetchApi('/api/escalations'),
  getAppointments: () => fetchApi('/api/appointments'),
  getNurtureCadences: (params?: { status?: string }) =>
    fetchApi(`/api/nurture/cadences?${new URLSearchParams(params || {}).toString()}`),
  getAlerts: () => fetchApi('/api/alerts'),
  getKpis: () => fetchApi('/api/kpis'),
  // Admin endpoints
  getOrganizations: () => fetchApi('/admin/organizations'),
  createOrganization: (body: { name: string; slug: string }) =>
    fetchApi('/admin/organizations', { method: 'POST', body: JSON.stringify(body) }),
  getOrganization: (id: string) => fetchApi(`/admin/organizations/${id}`),
  rotateApiKey: (id: string) =>
    fetchApi(`/admin/organizations/${id}/rotate-key`, { method: 'POST' }),
};
