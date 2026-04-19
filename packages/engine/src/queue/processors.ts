import { Queue, Worker, Job } from 'bullmq';
import { LEAD_PROCESS_QUEUE } from './jobs.js';

export function createLeadQueue(connection: { host: string; port: number }) {
  return new Queue(LEAD_PROCESS_QUEUE, { connection });
}

export function createLeadWorker(
  connection: { host: string; port: number },
  handlers: Record<string, (data: any) => Promise<void>>,
) {
  return new Worker(LEAD_PROCESS_QUEUE, async (job: Job) => {
    const handler = handlers[job.name];
    if (!handler) throw new Error(`No handler for job type: ${job.name}`);
    await handler(job.data);
  }, { connection });
}