import type { CrmClient, CrmContact, CrmPerson, CrmTask } from '../interface.js';

interface HubSpotConfig {
  accessToken: string;
}

export class HubSpotClient implements CrmClient {
  private accessToken: string;
  private baseUrl = 'https://api.hubapi.com';

  constructor(config: HubSpotConfig) {
    this.accessToken = config.accessToken;
  }

  private async request<T>(path: string, options?: RequestInit): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const response = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
        ...options?.headers,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`HubSpot API error (${response.status}): ${error}`);
    }

    return response.json() as Promise<T>;
  }

  async createPerson(person: CrmContact): Promise<CrmPerson> {
    const properties: Record<string, string> = {
      firstname: person.firstName ?? '',
      lastname: person.lastName ?? '',
      lifecyclestage: 'lead',
    };

    if (person.emails?.[0]?.value) {
      properties.email = person.emails[0].value;
    }
    if (person.phones?.[0]?.value) {
      // Store digits-only so findPersonByPhone (which also cleans) can match exactly
      properties.phone = person.phones[0].value.replace(/\D/g, '');
    }
    if (person.source) {
      properties.hs_lead_status = 'NEW';
      // Note: HubSpot standard contacts don't have a "source" property.
      // If you need source tracking, create a custom property in HubSpot
      // Settings > Properties > Contact properties > Create property.
    }

    const result = await this.request<{ id: string }>('/crm/v3/objects/contacts', {
      method: 'POST',
      body: JSON.stringify({ properties }),
    });

    return { id: result.id };
  }

  async updatePerson(personId: string, person: Partial<CrmContact>): Promise<void> {
    const properties: Record<string, string> = {};
    if (person.firstName) properties.firstname = person.firstName;
    if (person.lastName) properties.lastname = person.lastName;
    if (person.emails?.[0]?.value) properties.email = person.emails[0].value;
    if (person.phones?.[0]?.value) properties.phone = person.phones[0].value;

    await this.request(`/crm/v3/objects/contacts/${personId}`, {
      method: 'PATCH',
      body: JSON.stringify({ properties }),
    });
  }

  async findPersonByEmail(email: string): Promise<CrmPerson | null> {
    try {
      const result = await this.request<{
        total: number;
        results: Array<{ id: string; properties: { email: string } }>;
      }>(`/crm/v3/objects/contacts/search`, {
        method: 'POST',
        body: JSON.stringify({
          filterGroups: [
            {
              filters: [
                { propertyName: 'email', operator: 'EQ', value: email },
              ],
            },
          ],
          properties: ['email'],
          limit: 1,
        }),
      });

      if (result.total === 0 || result.results.length === 0) return null;
      return { id: result.results[0].id };
    } catch {
      return null;
    }
  }

  async findPersonByPhone(phone: string): Promise<CrmPerson | null> {
    const cleaned = phone.replace(/\D/g, '');
    try {
      const result = await this.request<{
        total: number;
        results: Array<{ id: string; properties: { phone: string } }>;
      }>(`/crm/v3/objects/contacts/search`, {
        method: 'POST',
        body: JSON.stringify({
          filterGroups: [
            {
              filters: [
                { propertyName: 'phone', operator: 'EQ', value: cleaned },
              ],
            },
          ],
          properties: ['phone'],
          limit: 1,
        }),
      });

      if (result.total === 0 || result.results.length === 0) return null;
      return { id: result.results[0].id };
    } catch {
      return null;
    }
  }

  private async createEngagement(personId: string, type: string, metadata: Record<string, unknown>): Promise<void> {
    try {
      await this.request('/engagements/v1/engagements', {
        method: 'POST',
        body: JSON.stringify({
          engagement: { active: true, type: type.toUpperCase(), timestamp: Date.now() },
          associations: { contactIds: [parseInt(personId, 10)] },
          metadata,
        }),
      });
    } catch (err) {
      // If activities scope is missing, log locally and continue
      console.warn(`[HubSpot] Activity logging failed (missing scope?). ${type} to ${personId} logged locally only.`);
    }
  }

  async logCall(personId: string, notes: string, duration?: number): Promise<void> {
    await this.createEngagement(personId, 'CALL', {
      body: notes,
      durationMilliseconds: (duration ?? 0) * 1000,
    });
  }

  async logSms(personId: string, message: string): Promise<void> {
    await this.createEngagement(personId, 'SMS', {
      body: message,
      fromNumber: process.env.TWILIO_PHONE_NUMBER ?? '',
      toNumber: '',
      status: 'SENT',
    });
  }

  async logEmail(personId: string, subject: string, body: string): Promise<void> {
    await this.createEngagement(personId, 'EMAIL', {
      subject,
      text: body,
      from: { email: process.env.RESEND_FROM_EMAIL ?? '' },
      to: [{ email: '' }],
    });
  }

  async createTask(personId: string, title: string, dueDate?: Date): Promise<CrmTask> {
    // Step 1: create the task without associations
    const result = await this.request<{ id: string }>('/crm/v3/objects/tasks', {
      method: 'POST',
      body: JSON.stringify({
        properties: {
          hs_task_body: title,
          hs_timestamp: dueDate?.toISOString() ?? new Date().toISOString(),
          hs_task_status: 'NOT_STARTED',
          hs_task_priority: 'HIGH',
          hs_task_subject: title,
        },
      }),
    });

    // Step 2: associate task (0-27) to contact (0-1) using the portal-specific typeId
    try {
      await this.request('/crm/v4/associations/0-27/0-1/batch/create', {
        method: 'POST',
        body: JSON.stringify({
          inputs: [
            {
              from: { id: result.id },
              to: { id: personId },
              types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 204 }],
            },
          ],
        }),
      });
    } catch (err) {
      console.warn(`[HubSpot] Task created but association to contact failed: ${(err as Error).message}`);
    }

    return { id: result.id };
  }
}
