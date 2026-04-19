export const LEAD_PROCESS_QUEUE = 'lead-process';

export const JOB_TYPES = {
  INGEST_LEAD: 'ingest-lead',
  PROCESS_MESSAGE: 'process-message',
  SEND_RESPONSE: 'send-response',
  SCORE_LEAD: 'score-lead',
  ROUTE_LEAD: 'route-lead',
  BOOK_APPOINTMENT: 'book-appointment',
  ESCALATE: 'escalate',
  SCHEDULE_FOLLOWUP: 'schedule-followup',
} as const;