import dotenv from 'dotenv';
dotenv.config();

import { UnifiedAgent } from './agents/unified/index.js';
import { createQueueConnection, createWorkers } from './queue/processors.js';

const connection = createQueueConnection();

const agent = new UnifiedAgent();

const { leadWorker, nurtureWorker } = createWorkers(connection, agent);

console.log('Agentive workers started');
console.log(`Lead queue worker active`);
console.log(`Nurture queue worker active`);

process.on('SIGTERM', async () => {
  console.log('SIGTERM received, closing workers...');
  await leadWorker.close();
  await nurtureWorker.close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, closing workers...');
  await leadWorker.close();
  await nurtureWorker.close();
  process.exit(0);
});
