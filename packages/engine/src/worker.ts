import dotenv from 'dotenv';
dotenv.config();

import { UnifiedAgent } from './agents/unified/index.js';
import { createWorkers } from './queue/processors.js';

const redisHost = process.env.REDIS_URL
  ? new URL(process.env.REDIS_URL).hostname
  : 'localhost';
const redisPort = process.env.REDIS_URL
  ? parseInt(new URL(process.env.REDIS_URL).port || '6379')
  : 6379;

const connection = { host: redisHost, port: redisPort };

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
