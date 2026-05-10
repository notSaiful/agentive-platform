import type { CrmClient, CrmContact, CrmPerson, CrmTask } from '../interface.js';

interface LoftyConfig {
  apiKey: string;
  baseUrl?: string;
}

export class LoftyClient implements CrmClient {
  private apiKey: string;
  private baseUrl: string;

  constructor(config: LoftyConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl ?? 'https://api.lofty.com/v1';
  }

  private async request<T>(path: string, options?: RequestInit): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const response = await fetch(url, {
      ...options,
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        ...options?.headers,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Lofty API error (${response.status}): ${error}`);
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
      method: 'PATCH',
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

  private async createActivity(personId: string, message: string, type: string): Promise<void> {
    await this.request('/activities', {
      method: 'POST',
      body: JSON.stringify({ personId, message, type, createdAt: new Date().toISOString() }),
    });
  }

  async logCall(personId: string, notes: string, _duration?: number): Promise<void> {
    await this.createActivity(personId, notes, 'Call');
  }

  async logSms(personId: string, message: string): Promise<void> {
    await this.createActivity(personId, message, 'Text');
  }

  async logEmail(personId: string, subject: string, body: string): Promise<void> {
    await this.createActivity(personId, `${subject}\n\n${body}`, 'Email');
  }

  async createTask(personId: string, title: string, dueDate?: Date): Promise<CrmTask> {
    return this.request<CrmTask>('/tasks', {
      method: 'POST',
      body: JSON.stringify({
        personId,
        title,
        dueDate: dueDate?.toISOString(),
        completed: false,
      }),
    });
  }
}
