interface FUBConfig { apiKey: string; baseUrl?: string; }

interface LeadPayload {
  firstName: string;
  lastName: string;
  email?: string | null;
  phone?: string | null;
  source: string;
  stage?: string;
  notes?: string;
}

export class FollowUpBossClient {
  private apiKey: string;
  private baseUrl: string;

  constructor(config: FUBConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl || 'https://api.followupboss.com/v1';
  }

  formatLeadPayload(data: LeadPayload): Record<string, unknown> {
    return {
      firstName: data.firstName,
      lastName: data.lastName,
      emails: data.email ? [{ value: data.email }] : [],
      phones: data.phone ? [{ value: data.phone }] : [],
      source: data.source,
      stage: data.stage || 'New Lead',
      notes: data.notes || '',
    };
  }

  async createLead(data: LeadPayload): Promise<{ id: string }> {
    const payload = this.formatLeadPayload(data);
    const response = await fetch(`${this.baseUrl}/people`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${Buffer.from(this.apiKey + ':').toString('base64')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    if (!response.ok) throw new Error(`FUB API error: ${response.status}`);
    return response.json();
  }

  async updateStage(personId: string, stage: string): Promise<void> {
    await fetch(`${this.baseUrl}/people/${personId}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Basic ${Buffer.from(this.apiKey + ':').toString('base64')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ stage }),
    });
  }

  async addNote(personId: string, note: string): Promise<void> {
    await fetch(`${this.baseUrl}/notes`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${Buffer.from(this.apiKey + ':').toString('base64')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ personId, body: note }),
    });
  }
}