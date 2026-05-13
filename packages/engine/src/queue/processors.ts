import { Queue, Worker, Job, type ConnectionOptions } from 'bullmq';
import { LEAD_PROCESS_QUEUE, NURTURE_QUEUE, JOB_TYPES } from './jobs.js';
import { UnifiedAgent } from '../agents/unified/index.js';
import { prisma } from '../db/client.js';
import { TwilioClient, ResendClient } from '@agentive/integrations';
import { Sentry } from '../monitoring/sentry.js';
import { logger } from '../monitoring/logger.js';
import { failureThrottler, alertManager } from '../monitoring/alerts.js';

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
  const defaultJobOptions = {
    attempts: 3,
    backoff: { type: 'exponential' as const, delay: 2000 },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 50 },
  };

  return {
    leadQueue: new Queue(LEAD_PROCESS_QUEUE, { connection, defaultJobOptions }),
    nurtureQueue: new Queue(NURTURE_QUEUE, { connection, defaultJobOptions }),
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
          throw new Error('SEND_RESPONSE is not implemented as a queue job — responses are sent inline by the agent');
        }
        case JOB_TYPES.SCORE_LEAD: {
          throw new Error('SCORE_LEAD is not implemented as a queue job — scoring is done inline by the agent');
        }
        case JOB_TYPES.ROUTE_LEAD: {
          throw new Error('ROUTE_LEAD is not implemented as a queue job — routing is done inline by the agent');
        }
        case JOB_TYPES.BOOK_APPOINTMENT: {
          throw new Error('BOOK_APPOINTMENT is not implemented as a queue job — booking is done inline by the agent');
        }
        case JOB_TYPES.ESCALATE: {
          throw new Error('ESCALATE is not implemented as a queue job — escalations are created inline by the agent');
        }
        case JOB_TYPES.SCHEDULE_FOLLOWUP: {
          throw new Error('SCHEDULE_FOLLOWUP is not implemented as a queue job — follow-ups are scheduled inline by the agent');
        }
        default:
          throw new Error(`No handler for job type: ${job.name}`);
      }
    },
    {
      connection,
      concurrency: 5,
      limiter: { max: 10, duration: 1000 },
    },
  );

  const nurtureWorker = new Worker(
    NURTURE_QUEUE,
    async (job: Job) => {
      switch (job.name) {
        case JOB_TYPES.RUN_NURTURE_CAMPAIGN: {
          const { organizationId, campaignType } = job.data;
          logger.info(`Running nurture campaign for org ${organizationId}, type: ${campaignType}`);

          if (campaignType === 'daily-health-check') {
            const result = await agent.runNurtureDaily(organizationId);
            logger.info('Daily nurture result', result as unknown as Record<string, unknown>);
          } else if (campaignType === 'cold-revival') {
            const result = await agent.runColdRevival(organizationId);
            logger.info('Cold revival result', result as unknown as Record<string, unknown>);
          }
          break;
        }
        case JOB_TYPES.SEND_NURTURE_TOUCH: {
          const { organizationId, leadId, cadenceId, channel, template } = job.data;
          logger.info(`Sending nurture touch to lead ${leadId} via ${channel}, template: ${template}`);

          const lead = await prisma.lead.findUnique({
            where: { id: leadId },
            include: { contact: true },
          });
          if (!lead || !lead.contact) {
            throw new Error(`Lead ${leadId} or contact not found for nurture touch`);
          }

          const { renderTemplate } = await import('../agents/follow-up-nurture/content.js');
          const rendered = renderTemplate(template, {
            firstName: lead.contact.firstName || 'there',
            lastName: lead.contact.lastName || '',
            agentName: 'Agentive',
            city: 'your area',
            propertyType: 'commercial space',
            month: new Date().toLocaleString('default', { month: 'long' }),
          });

          const twilio = new TwilioClient({
            accountSid: process.env.TWILIO_ACCOUNT_SID ?? '',
            apiKeySid: process.env.TWILIO_API_KEY_SID ?? '',
            apiKeySecret: process.env.TWILIO_API_KEY_SECRET ?? '',
            phoneNumber: process.env.TWILIO_PHONE_NUMBER ?? '',
          });
          const resend = new ResendClient({
            apiKey: process.env.RESEND_API_KEY ?? '',
            fromEmail: process.env.RESEND_FROM_EMAIL ?? 'Agentive <team@agentive.ai>',
          });

          if (channel === 'sms' && lead.contact.phone) {
            if (twilio.canSendNow(lead.contact.timezone)) {
              const smsResult = await twilio.sendSms(lead.contact.phone, rendered.sms || rendered.body);
              await prisma.communicationEvent.create({
                data: {
                  organizationId,
                  leadId,
                  contactId: lead.contact.id,
                  channel: 'sms',
                  direction: 'outbound',
                  content: rendered.sms || rendered.body,
                  metadata: { twilioSid: smsResult.sid, cadenceId },
                },
              });
            } else {
              throw new Error(`Quiet hours active for ${lead.contact.timezone} — nurture touch rescheduled`);
            }
          } else if (channel === 'email' && lead.contact.email) {
            const emailResult = await resend.sendEmail({
              to: lead.contact.email,
              subject: rendered.subject || 'Follow-up from Agentive',
              text: rendered.body,
            });
            await prisma.communicationEvent.create({
              data: {
                organizationId,
                leadId,
                contactId: lead.contact.id,
                channel: 'email',
                direction: 'outbound',
                content: rendered.body,
                metadata: { resendId: emailResult.id, cadenceId },
              },
            });
          } else {
            throw new Error(`No valid channel for nurture touch: ${channel}`);
          }

          await prisma.nurtureCadence.update({
            where: { id: cadenceId },
            data: { status: 'sent', sentAt: new Date() },
          });

          // Schedule next cadence
          const { FollowUpNurtureAgent } = await import('../agents/follow-up-nurture/index.js');
          const nurture = new FollowUpNurtureAgent({ organizationId });
          await nurture.scheduleCadence({ leadId, organizationId });

          break;
        }
        default:
          throw new Error(`No handler for nurture job type: ${job.name}`);
      }
    },
    {
      connection,
      concurrency: 3,
      limiter: { max: 5, duration: 1000 },
    },
  );

  leadWorker.on('completed', (job) => {
    logger.info(`Lead job completed: ${job.id} - ${job.name}`);
  });

  leadWorker.on('failed', (job, err) => {
    logger.error(`Lead job failed: ${job?.id} - ${job?.name}`, { error: (err as Error).message, jobData: job?.data });
    Sentry.captureException(err, {
      tags: { queue: LEAD_PROCESS_QUEUE, jobName: job?.name },
      extra: { jobId: job?.id, jobData: job?.data, attempts: job?.attemptsMade },
    });
    if (failureThrottler.recordFailure(LEAD_PROCESS_QUEUE, job?.name || 'unknown')) {
      alertManager.addAlert('high_failure_rate', 'critical', `Lead queue high failure rate: ${failureThrottler.getFailureCount(LEAD_PROCESS_QUEUE)} failures in 10min`, { queue: LEAD_PROCESS_QUEUE, jobName: job?.name });
    }
  });

  nurtureWorker.on('completed', (job) => {
    logger.info(`Nurture job completed: ${job.id} - ${job.name}`);
  });

  nurtureWorker.on('failed', (job, err) => {
    logger.error(`Nurture job failed: ${job?.id} - ${job?.name}`, { error: (err as Error).message, jobData: job?.data });
    Sentry.captureException(err, {
      tags: { queue: NURTURE_QUEUE, jobName: job?.name },
      extra: { jobId: job?.id, jobData: job?.data, attempts: job?.attemptsMade },
    });
    if (failureThrottler.recordFailure(NURTURE_QUEUE, job?.name || 'unknown')) {
      alertManager.addAlert('high_failure_rate', 'critical', `Nurture queue high failure rate: ${failureThrottler.getFailureCount(NURTURE_QUEUE)} failures in 10min`, { queue: NURTURE_QUEUE, jobName: job?.name });
    }
  });

  return { leadWorker, nurtureWorker };
}
