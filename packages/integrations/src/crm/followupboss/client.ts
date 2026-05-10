import type { CrmClient, CrmContact, CrmPerson, CrmTask } from '../interface.js';

interface FollowUpBossConfig {
  apiKey: string;
  apiSecret: string;
}

export class FollowUpBossClient implements CrmClient {
  private apiKey: string;
  private apiSecret: string;
  private baseUrl = 'https://api.followupboss.com/v1';

  constructor(config: FollowUpBossConfig) {
    this.apiKey = config.apiKey;
    this.apiSecret = config.apiSecret;
  }

  private async request<T>(path: string, options?: RequestInit): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const response = await fetch(url, {
      ...options,
      headers: {
        'Authorization': `Basic ${Buffer.from(`${this.apiKey}:${this.apiSecret}`).toString('base64')}`,
        'Content-Type': 'application/json',
        ...options?.headers,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Follow Up Boss API error (${response.status}): ${error}`);
    }

    return response.json() as Promise<T>;
  }

  async createPerson(person: CrmContact): Promise<CrmPerson> {
    return this.request<CrmPerson>('/people', {
      method: 'POST',
      body: JSON.stringify(person),
    });
  }

  async updatePerson(personId: string, person: Partial<CrmContact>): Promise<void> {
    await this.request(`/people/${personId}`, {
      method: 'PUT',
      body: JSON.stringify(person),
    });
  }

  async findPersonByEmail(email: string): Promise<CrmPerson | null> {
    const result = await this.request<{ people: Array<{ id: string; emails: Array<{ value: string }> }> }>(`/people?email=${encodeURIComponent(email)}`);
    const person = result.people.find((p) => p.emails?.some((e) => e.value === email));
    return person ? { id: person.id } : null;
  }

  async findPersonByPhone(phone: string): Promise<CrmPerson | null> {
    const cleaned = phone.replace(/\D/g, '');
    const result = await this.request<{ people: Array<{ id: string; phones: Array<{ value: string }> }> }>(`/people?phone=${encodeURIComponent(cleaned)}`);
    const person = result.people.find((p) =>
      p.phones?.some((ph) => ph.value.replace(/\D/g, '') === cleaned)
    );
    return person ? { id: person.id } : null;
  }

  private async createEvent(personId: string, message: string, type: string): Promise<void> {
    await this.request('/events', {
      method: 'POST',
      body: JSON.stringify({ personId, message, type, created: new Date().toISOString() }),
    });
  }

  async logCall(personId: string, notes: string, _duration?: number): Promise<void> {
    await this.createEvent(personId, notes, 'Call');
  }

  async logSms(personId: string, message: string): Promise<void> {
    await this.createEvent(personId, message, 'Text');
  }

  async logEmail(personId: string, subject: string, body: string): Promise<void> {
    await this.createEvent(personId, `${subject}\n\n${body}`, 'Email');
  }

  async createTask(personId: string, title: string, dueDate?: Date): Promise<CrmTask> {
    return this.request<CrmTask>('/tasks', {
      method: 'POST',
      body: JSON.stringify({
        personId,
        title,
        dueDate: dueDate?.toISOString(),
        isCompleted: false,
      }),
    });
  }
}
