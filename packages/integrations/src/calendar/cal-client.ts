interface CalConfig { apiKey: string; baseUrl?: string; }

interface AvailabilityRequest {
  eventTypeId: string;
  dateFrom: string;
  dateTo: string;
  timezone: string;
}

export class CalClient {
  private apiKey: string;
  private baseUrl: string;

  constructor(config: CalConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl || 'https://api.cal.com/v2';
  }

  buildAvailabilityRequest(params: AvailabilityRequest): AvailabilityRequest & { apiKey: string } {
    return { ...params, apiKey: this.apiKey };
  }

  async getAvailability(params: AvailabilityRequest): Promise<{ slots: { start: string; end: string }[] }> {
    const query = new URLSearchParams({
      apiKey: this.apiKey,
      eventTypeId: params.eventTypeId,
      dateFrom: params.dateFrom,
      dateTo: params.dateTo,
      timezone: params.timezone,
    });
    const response = await fetch(`${this.baseUrl}/slots?${query}`);
    if (!response.ok) throw new Error(`Cal.com API error: ${response.status}`);
    return response.json();
  }

  async bookSlot(params: {
    eventTypeId: string;
    start: string;
    name: string;
    email: string;
    phone?: string;
    timezone: string;
  }): Promise<{ bookingId: string }> {
    const response = await fetch(`${this.baseUrl}/bookings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'cal-api-version': '2024-08-13' },
      body: JSON.stringify({ ...params, apiKey: this.apiKey }),
    });
    if (!response.ok) throw new Error(`Booking failed: ${response.status}`);
    return response.json();
  }
}