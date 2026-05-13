import express from 'express';
import dotenv from 'dotenv';
import { handleLeadWebhook } from './ingest/lead-webhook.js';
import { handleInboundSms } from './ingest/sms-webhook.js';
import { handleRetellCallEnded } from './ingest/retell-webhook.js';
import { globalEmitter, AgentEvent } from '@agentive/shared';
import { UnifiedAgent } from './agents/unified/index.js';
import { createQueueConnection, createQueues, createWorkers } from './queue/processors.js';
import { JOB_TYPES, LEAD_PROCESS_QUEUE, NURTURE_QUEUE } from './queue/jobs.js';
import demoRoutes from './routes/demo.js';
import vapiDemoRoutes from './routes/vapi-demo.js';
import { calculateKPIs } from './analytics/kpi-tracker.js';
import { prisma } from './db/client.js';
import { DEFAULT_ORGANIZATION_ID } from './constants.js';

dotenv.config();

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// ── Rate Limiting (in-memory) ────────────────────────────────────────────────
interface RateLimitEntry {
  count: number;
  resetAt: number;
}
const rateLimitMap = new Map<string, RateLimitEntry>();
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const RATE_LIMIT_MAX = 100; // 100 requests per window

function rateLimitMiddleware(req: express.Request, res: express.Response, next: express.NextFunction): void {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  const entry = rateLimitMap.get(ip);

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    next();
    return;
  }

  if (entry.count >= RATE_LIMIT_MAX) {
    res.status(429).json({ error: 'Too many requests — please slow down' });
    return;
  }

  entry.count++;
  next();
}

// ── API Key Auth ─────────────────────────────────────────────────────────────
function apiKeyMiddleware(req: express.Request, res: express.Response, next: express.NextFunction): void {
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    // In development without API_KEY set, allow through
    if (process.env.NODE_ENV === 'development') {
      next();
      return;
    }
    res.status(500).json({ error: 'API_KEY not configured' });
    return;
  }

  const headerKey = req.headers['x-api-key'];
  if (headerKey !== apiKey) {
    res.status(401).json({ error: 'Unauthorized — invalid or missing x-api-key header' });
    return;
  }
  next();
}

// Queue setup
const connection = createQueueConnection();
const { leadQueue, nurtureQueue } = createQueues(connection);

// Start workers inline (same process for now, can split later)
const agent = new UnifiedAgent();
const { leadWorker, nurtureWorker } = createWorkers(connection, agent);

// ── Automated Nurture Scheduler ───────────────────────────────────────────────
// Schedule daily nurture health check at 9:00 AM UTC
async function scheduleNurtureJobs() {
  try {
    // Remove any existing repeatable jobs to avoid duplicates on restart
    const repeatableJobs = await nurtureQueue.getRepeatableJobs();
    for (const job of repeatableJobs) {
      await nurtureQueue.removeRepeatableByKey(job.key);
    }

    await nurtureQueue.add(
      JOB_TYPES.RUN_NURTURE_CAMPAIGN,
      { organizationId: DEFAULT_ORGANIZATION_ID, campaignType: 'daily-health-check' },
      { repeat: { pattern: '0 9 * * *' }, jobId: 'nurture-daily-health-check' }
    );

    console.log('[Scheduler] Daily nurture health check scheduled for 9:00 AM UTC');
  } catch (err) {
    console.error('[Scheduler] Failed to schedule nurture jobs:', err);
  }
}

scheduleNurtureJobs();

// Event bus → queue bridge
globalEmitter.on('lead.created', async (event: AgentEvent) => {
  const { leadId, contactId, source, message, preferredChannel } = event.payload as Record<string, string>;
  try {
    await leadQueue.add(JOB_TYPES.INGEST_LEAD, {
      leadId,
      contactId,
      source,
      message,
      channel: preferredChannel || 'sms',
    });
  } catch (err) {
    console.error('Error queuing lead ingest:', err);
  }
});

globalEmitter.on('message.inbound', async (event: AgentEvent) => {
  const { leadId, content, channel } = event.payload as Record<string, string>;
  try {
    await leadQueue.add(JOB_TYPES.PROCESS_MESSAGE, {
      leadId,
      content,
      channel,
    });
  } catch (err) {
    console.error('Error queuing message process:', err);
  }
});

// Webhook endpoints (rate limited)
app.post('/webhooks/leads', rateLimitMiddleware, handleLeadWebhook);
app.post('/webhooks/sms/inbound', rateLimitMiddleware, handleInboundSms);
app.post('/webhooks/retell/call-ended', rateLimitMiddleware, async (req, res) => {
  try {
    const { call_id, call_status, call_analysis, metadata, transcript } = req.body;

    const leadId = metadata?.leadId;
    if (!leadId) {
      res.status(400).json({ error: 'Missing leadId in metadata' });
      return;
    }

    const result = await handleRetellCallEnded({
      callId: call_id,
      leadId,
      callStatus: call_status,
      disposition: call_analysis?.call_summary || call_status,
      transcript,
      qualificationData: call_analysis?.custom_analysis_data
        ? {
            budget: call_analysis.custom_analysis_data.lead_budget,
            timelineDays: call_analysis.custom_analysis_data.lead_timeline_days,
            decisionMaker: call_analysis.custom_analysis_data.lead_is_decision_maker,
            intent: call_analysis.custom_analysis_data.lead_intent,
            propertyType: call_analysis.custom_analysis_data.lead_property_type,
            readyForAppointment: call_analysis.custom_analysis_data.lead_ready_for_appointment,
            appointmentPreference: call_analysis.custom_analysis_data.lead_appointment_preference,
          }
        : undefined,
    });

    if (result.shouldSmsFallback) {
      const contactId = metadata?.contactId;
      if (contactId && typeof contactId === 'string') {
        await agent.processInboundLead({
          leadId,
          contactId,
          source: 'retell-fallback',
          message: 'Lead did not answer phone call',
          channel: 'sms',
        });
      } else {
        console.warn('[Retell Webhook] Missing contactId in metadata — cannot SMS fallback');
      }
    }

    res.json({ status: 'processed', result });
  } catch (err) {
    console.error('Retell webhook error:', err);
    res.status(500).json({ error: 'Internal error' });
  }
});

// Health check
app.use('/api/demo', demoRoutes);
app.use('/api/vapi', vapiDemoRoutes);

app.get('/health', async (_req, res) => {
  const checks: Record<string, { ok: boolean; error?: string }> = {};

  // DB check
  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.database = { ok: true };
  } catch (err) {
    checks.database = { ok: false, error: (err as Error).message };
  }

  // Redis check
  try {
    const redisClient = await leadQueue.client;
    const redisHealth = await redisClient.ping();
    checks.redis = { ok: redisHealth === 'PONG' };
  } catch (err) {
    checks.redis = { ok: false, error: (err as Error).message };
  }

  const allOk = Object.values(checks).every((c) => c.ok);

  res.status(allOk ? 200 : 503).json({
    status: allOk ? 'ok' : 'degraded',
    agent: 'unified',
    queues: {
      lead: LEAD_PROCESS_QUEUE,
      nurture: NURTURE_QUEUE,
    },
    checks,
  });
});

app.get('/', (_req, res) => {
  res.json({
    name: 'Agentive Engine',
    status: 'running',
    services: ['unified-agent', 'sarah-demo', 'nurture-campaign'],
    endpoints: ['/health', '/api/vapi/health', '/api/demo', '/webhooks/leads', '/webhooks/sms/inbound'],
    website: 'https://agentive-website-ten.vercel.app',
  });
});

// API endpoints for dashboard (auth required)
app.use('/api/leads', apiKeyMiddleware);
app.use('/api/kpis', apiKeyMiddleware);
app.use('/api/escalations', apiKeyMiddleware);
app.use('/api/appointments', apiKeyMiddleware);
app.use('/api/nurture', apiKeyMiddleware);

app.get('/api/leads', async (req, res) => {
  const { status, classification } = req.query;
  const where: Record<string, string> = {};
  if (status) where.status = status as string;
  if (classification) where.classification = classification as string;
  const leads = await prisma.lead.findMany({ where, include: { contact: true }, orderBy: { createdAt: 'desc' } });
  res.json(leads);
});

app.get('/api/kpis', async (_req, res) => {
  const leads = await prisma.lead.findMany({
    where: { createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } },
  });
  const kpis = calculateKPIs(leads);
  res.json(kpis);
});

app.get('/api/escalations', async (_req, res) => {
  const escalations = await prisma.escalation.findMany({
    where: { status: 'pending' },
    include: { lead: { include: { contact: true } } },
    orderBy: { createdAt: 'desc' },
  });
  res.json(escalations);
});

app.patch('/api/escalations/:id', async (req, res) => {
  const { id } = req.params;
  const { status, assignedTo } = req.body;
  try {
    const escalation = await prisma.escalation.update({
      where: { id },
      data: { status, assignedTo, resolvedAt: status === 'resolved' ? new Date() : undefined, updatedAt: new Date() },
    });
    res.json(escalation);
  } catch (err) {
    if ((err as Error).message.includes('P2025')) {
      res.status(404).json({ error: 'Escalation not found' });
      return;
    }
    console.error('Escalation patch error:', err);
    res.status(500).json({ error: 'Internal error' });
  }
});

app.get('/api/appointments', async (_req, res) => {
  const appointments = await prisma.appointment.findMany({
    include: { lead: { include: { contact: true } } },
    orderBy: { scheduledAt: 'asc' },
  });
  res.json(appointments);
});

// Nurture campaign endpoints
app.post('/api/nurture/campaigns', async (req, res) => {
  const { organizationId, campaignType, leadId } = req.body;
  const job = await nurtureQueue.add(JOB_TYPES.RUN_NURTURE_CAMPAIGN, {
    organizationId,
    campaignType,
    leadId,
  });
  res.json({ jobId: job.id, status: 'queued' });
});

app.get('/api/nurture/cadences', async (req, res) => {
  const { organizationId, status } = req.query;
  const where: Record<string, string> = {};
  if (organizationId) where.organizationId = organizationId as string;
  if (status) where.status = status as string;
  const cadences = await prisma.nurtureCadence.findMany({
    where,
    include: { lead: { include: { contact: true } } },
    orderBy: { scheduledAt: 'asc' },
  });
  res.json(cadences);
});

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3001;

const server = app.listen(PORT, () => {
  console.log(`Agentive Engine running on port ${PORT}`);
});

process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down...');
  await leadWorker?.close();
  await nurtureWorker?.close();
  await leadQueue?.close();
  await nurtureQueue?.close();
  server.close(() => process.exit(0));
});

export { app, leadQueue, nurtureQueue };
