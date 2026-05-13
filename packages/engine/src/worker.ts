import dotenv from 'dotenv';
dotenv.config();

import { UnifiedAgent } from './agents/unified/index.js';
import { createQueueConnection, createWorkers } from './queue/processors.js';
import { initSentry } from './monitoring/sentry.js';
import { logger } from './monitoring/logger.js';

initSentry();

const connection = createQueueConnection();

const agent = new UnifiedAgent();

const { leadWorker, nurtureWorker } = createWorkers(connection, agent);

logger.info('Agentive workers started');
logger.info('Lead queue worker active');
logger.info('Nurture queue worker active');

process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, closing workers...');
  await leadWorker.close();
  await nurtureWorker.close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, closing workers...');
  await leadWorker.close();
  await nurtureWorker.close();
  process.exit(0);
});
