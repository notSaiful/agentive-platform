import { Queue, Worker, Job, type ConnectionOptions } from 'bullmq';
import { LEAD_PROCESS_QUEUE, NURTURE_QUEUE, JOB_TYPES } from './jobs.js';
import { UnifiedAgent } from '../agents/unified/index.js';

export function createQueueConnection(redisUrl = process.env.REDIS_URL): ConnectionOptions {
  if (!redisUrl) {
    return { host: 'localhost', port: 6379, maxRetriesPerRequest: null };
  }

  const url = new URL(redisUrl);
  const db = url.pathname.length > 1 ? Number.parseInt(url.pathname.slice(1), 10) : undefined;
  const requiresTls =
    url.protocol === 'rediss:' ||
    url.searchParams.get('tls') === 'true' ||
    url.hostname.endsWith('.upstash.io');

  return {
    host: url.hostname,
    port: Number.parseInt(url.port || '6379', 10),
    username: url.username ? decodeURIComponent(url.username) : undefined,
    password: url.password ? decodeURIComponent(url.password) : undefined,
    db: Number.isNaN(db) ? undefined : db,
    tls: requiresTls ? {} : undefined,
    maxRetriesPerRequest: null,
  };
}

export function createQueues(connection: ConnectionOptions) {
  return {
    leadQueue: new Queue(LEAD_PROCESS_QUEUE, { connection }),
    nurtureQueue: new Queue(NURTURE_QUEUE, { connection }),
  };
}

export function createWorkers(
  connection: ConnectionOptions,
  agent: UnifiedAgent,
) {
  const leadWorker = new Worker(
    LEAD_PROCESS_QUEUE,
    async (job: Job) => {
      switch (job.name) {
        case JOB_TYPES.INGEST_LEAD: {
          const { leadId, contactId, source, message, channel } = job.data;
          await agent.processInboundLead({ leadId, contactId, source, message, channel });
          break;
        }
        case JOB_TYPES.PROCESS_MESSAGE: {
          const { leadId, content, channel } = job.data;
          await agent.processLeadReply({ leadId, message: content, channel });
          break;
        }
        case JOB_TYPES.SEND_RESPONSE: {
          // Handled by messaging service
          break;
        }
        case JOB_TYPES.SCORE_LEAD: {
          // Handled inline after qualification
          break;
        }
        case JOB_TYPES.ROUTE_LEAD: {
          // Handled inline after scoring
          break;
        }
        case JOB_TYPES.BOOK_APPOINTMENT: {
          // Handled by Cal.com integration
          break;
        }
        case JOB_TYPES.ESCALATE: {
          // Handled by escalation service
          break;
        }
        case JOB_TYPES.SCHEDULE_FOLLOWUP: {
          // Will be handled by nurture agent
          break;
        }
        default:
          throw new Error(`No handler for job type: ${job.name}`);
      }
    },
    { connection },
  );

  const nurtureWorker = new Worker(
    NURTURE_QUEUE,
    async (job: Job) => {
      switch (job.name) {
        case JOB_TYPES.RUN_NURTURE_CAMPAIGN: {
          const { organizationId, campaignType } = job.data;
          console.log(`Running nurture campaign for org ${organizationId}, type: ${campaignType}`);

          if (campaignType === 'daily-health-check') {
            const result = await agent.runNurtureDaily(organizationId);
            console.log(`Daily nurture result:`, result);
          } else if (campaignType === 'cold-revival') {
            const result = await agent.runColdRevival(organizationId);
            console.log(`Cold revival result:`, result);
          }
          break;
        }
        case JOB_TYPES.SEND_NURTURE_TOUCH: {
          const { organizationId, leadId, cadenceId, channel, template } = job.data;
          console.log(`Sending nurture touch to lead ${leadId} via ${channel}, template: ${template}`);
          // Will be wired to messaging service
          break;
        }
        default:
          throw new Error(`No handler for nurture job type: ${job.name}`);
      }
    },
    { connection },
  );

  leadWorker.on('completed', (job) => {
    console.log(`Lead job completed: ${job.id} - ${job.name}`);
  });

  leadWorker.on('failed', (job, err) => {
    console.error(`Lead job failed: ${job?.id} - ${job?.name}`, err);
  });

  nurtureWorker.on('completed', (job) => {
    console.log(`Nurture job completed: ${job.id} - ${job.name}`);
  });

  nurtureWorker.on('failed', (job, err) => {
    console.error(`Nurture job failed: ${job?.id} - ${job?.name}`, err);
  });

  return { leadWorker, nurtureWorker };
}
