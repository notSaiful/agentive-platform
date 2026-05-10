export const LEAD_PROCESS_QUEUE = 'lead-process';
export const NURTURE_QUEUE = 'nurture-campaign';

export const JOB_TYPES = {
  INGEST_LEAD: 'ingest-lead',
  PROCESS_MESSAGE: 'process-message',
  SEND_RESPONSE: 'send-response',
  SCORE_LEAD: 'score-lead',
  ROUTE_LEAD: 'route-lead',
  BOOK_APPOINTMENT: 'book-appointment',
  ESCALATE: 'escalate',
  SCHEDULE_FOLLOWUP: 'schedule-followup',
  RUN_NURTURE_CAMPAIGN: 'run-nurture-campaign',
  SEND_NURTURE_TOUCH: 'send-nurture-touch',
} as const;

export type JobType = (typeof JOB_TYPES)[keyof typeof JOB_TYPES];

export interface LeadIngestJob {
  contactId: string;
  leadId: string;
  source: string;
  message: string;
  channel: string;
  organizationId: string;
}

export interface MessageProcessJob {
  leadId: string;
  content: string;
  channel: string;
  organizationId: string;
}

export interface NurtureCampaignJob {
  organizationId: string;
  leadId?: string;
  campaignType: 'daily-health-check' | 'cold-revival' | 'manual';
}

export interface SendNurtureTouchJob {
  organizationId: string;
  leadId: string;
  cadenceId: string;
  channel: string;
  template: string;
}
