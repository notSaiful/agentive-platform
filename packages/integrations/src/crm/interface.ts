export interface CrmContact {
  firstName?: string;
  lastName?: string;
  emails?: Array<{ value: string; type?: string }>;
  phones?: Array<{ value: string; type?: string }>;
  stage?: string;
  source?: string;
  tags?: string[];
  customFields?: Record<string, string>;
}

export interface CrmPerson {
  id: string;
}

export interface CrmTask {
  id: string;
}

export interface CrmEvent {
  personId: string;
  message: string;
  type: string;
  created?: string;
}

/**
 * Generic CRM interface. All CRM providers must implement this.
 * This keeps agent logic decoupled from any specific CRM.
 */
export interface CrmClient {
  /** Create a new person/lead in the CRM */
  createPerson(person: CrmContact): Promise<CrmPerson>;

  /** Update an existing person */
  updatePerson(personId: string, person: Partial<CrmContact>): Promise<void>;

  /** Find person by email */
  findPersonByEmail(email: string): Promise<CrmPerson | null>;

  /** Find person by phone */
  findPersonByPhone(phone: string): Promise<CrmPerson | null>;

  /** Log a call event */
  logCall(personId: string, notes: string, duration?: number): Promise<void>;

  /** Log an SMS event */
  logSms(personId: string, message: string): Promise<void>;

  /** Log an email event */
  logEmail(personId: string, subject: string, body: string): Promise<void>;

  /** Create a task for a broker/agent */
  createTask(personId: string, title: string, dueDate?: Date): Promise<CrmTask>;
}

/**
 * Factory: returns the right CRM client based on env config.
 * Add new providers here — agent code never changes.
 */
export async function createCrmClient(): Promise<CrmClient> {
  const provider = process.env.CRM_PROVIDER?.toLowerCase() ?? 'hubspot';

  switch (provider) {
    case 'hubspot': {
      const { HubSpotClient } = await import('./hubspot/client.js');
      return new HubSpotClient({ accessToken: process.env.HUBSPOT_ACCESS_TOKEN ?? '' });
    }

    case 'followupboss': {
      const { FollowUpBossClient } = await import('./followupboss/client.js');
      return new FollowUpBossClient({
        apiKey: process.env.FOLLOWUPBOSS_API_KEY ?? '',
        apiSecret: process.env.FOLLOWUPBOSS_API_SECRET ?? '',
      });
    }

    case 'lofty': {
      const { LoftyClient } = await import('./lofty/client.js');
      return new LoftyClient({
        apiKey: process.env.LOFTY_API_KEY ?? '',
        baseUrl: process.env.LOFTY_BASE_URL,
      });
    }

    default:
      throw new Error(`Unknown CRM provider: ${provider}`);
  }
}
