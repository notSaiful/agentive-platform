import express from 'express';
import { SarahDemoAgent } from '../agents/sarah-demo/index.js';
import { sarahTools } from '../agents/sarah-demo/tools.js';
import { startTrace, endTrace } from '../agents/sarah-demo/tracer.js';

const router = express.Router();
const sarahAgent = new SarahDemoAgent();

// POST /api/demo/start — Create a web call for the browser demo
router.post('/start', async (req, res) => {
  try {
    const { visitorId, source } = req.body;
    if (!visitorId) {
      res.status(400).json({ error: 'visitorId is required' });
      return;
    }

    const result = await sarahAgent.startDemo({
      visitorId,
      source: source ?? 'website-demo',
    });

    res.json(result);
  } catch (err) {
    console.error('Demo start error:', err);
    res.status(500).json({ error: 'Failed to start demo call', detail: (err as Error).message });
  }
});

// POST /api/demo/end — Log demo end
router.post('/end', async (req, res) => {
  try {
    const { callId } = req.body;
    if (!callId) {
      res.status(400).json({ error: 'callId is required' });
      return;
    }

    await sarahAgent.endDemo(callId);
    res.json({ status: 'ended' });
  } catch (err) {
    console.error('Demo end error:', err);
    res.status(500).json({ error: 'Failed to end demo call' });
  }
});

// GET /api/demo/status — Get demo call status and transcript
router.get('/status', async (req, res) => {
  try {
    const { callId, sessionId } = req.query;
    if (!callId || !sessionId) {
      res.status(400).json({ error: 'callId and sessionId are required' });
      return;
    }

    const status = await sarahAgent.getDemoStatus(callId as string, sessionId as string);
    res.json(status);
  } catch (err) {
    console.error('Demo status error:', err);
    res.status(500).json({ error: 'Failed to get demo status' });
  }
});

// POST /webhooks/retell/demo-call-ended — Webhook for demo calls
router.post('/webhooks/retell/demo-call-ended', async (req, res) => {
  try {
    const { call_id, call_status, call_analysis, transcript, metadata } = req.body;

    await sarahAgent.handleDemoCallEnded({
      call_id,
      call_status,
      call_analysis,
      transcript,
      metadata,
    });

    res.json({ status: 'processed' });
  } catch (err) {
    console.error('Demo call-ended webhook error:', err);
    res.status(500).json({ error: 'Internal error' });
  }
});

// POST /api/demo/tools/execute — Retell calls this when Sarah uses a tool
router.post('/tools/execute', async (req, res) => {
  try {
    const { tool_name, tool_args, session_id } = req.body;

    if (!tool_name) {
      res.status(400).json({ error: 'tool_name is required' });
      return;
    }

    // Find the LangChain tool by name
    const tool = sarahTools.find((t) => t.name === tool_name);
    if (!tool) {
      res.status(404).json({ error: `Tool '${tool_name}' not found` });
      return;
    }

    // Inject sessionId if the tool is collectQualificationData
    const args = tool_name === 'collectQualificationData'
      ? { ...tool_args, sessionId: session_id }
      : tool_args;

    // Execute the LangChain tool
    const result = await (tool as any).invoke(args);

    res.json({
      tool_name,
      result: typeof result === 'string' ? result : JSON.stringify(result),
      status: 'success',
    });
  } catch (err) {
    console.error('Tool execution error:', err);
    res.status(500).json({
      error: 'Tool execution failed',
      detail: (err as Error).message,
    });
  }
});

// POST /api/demo/trace/start — Frontend calls this to start a LangSmith trace
router.post('/trace/start', async (req, res) => {
  try {
    const { runId, name, runType, inputs, tags, metadata, sessionId } = req.body;
    await startTrace({
      runId,
      name,
      runType: runType ?? 'chain',
      inputs: inputs ?? {},
      tags: tags ?? [],
      metadata: { ...metadata, sessionId, source: 'frontend' },
    });
    res.json({ status: 'trace_started', runId });
  } catch (err) {
    console.error('Trace start error:', err);
    res.status(500).json({ error: 'Trace start failed' });
  }
});

// POST /api/demo/trace/end — Frontend calls this to end a LangSmith trace
router.post('/trace/end', async (req, res) => {
  try {
    const { runId, outputs, error } = req.body;
    await endTrace({
      runId,
      outputs: outputs ?? {},
      error: error,
    });
    res.json({ status: 'trace_ended', runId });
  } catch (err) {
    console.error('Trace end error:', err);
    res.status(500).json({ error: 'Trace end failed' });
  }
});

export default router;
