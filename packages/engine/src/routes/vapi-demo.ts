import express from 'express';
import { sarahTools } from '../agents/sarah-demo/tools.js';
import { traceVapiWebhook, traceToolExecution } from '../agents/sarah-demo/tracer.js';

const router = express.Router();

// POST /api/demo/webhooks/vapi/tool-calls — VAPI sends this when Sarah uses a tool
router.post('/webhooks/vapi/tool-calls', async (req, res) => {
  const toolNames: string[] = [];
  const sessionId = req.body.message?.sessionId || req.body.sessionId;

  try {
    const result = await traceVapiWebhook(toolNames, sessionId, async () => {
      const body = req.body;

      // VAPI sends tool-calls in this format:
      // {
      //   "message": {
      //     "type": "tool-calls",
      //     "toolCallList": [
      //       { "id": "abc123", "name": "getPricingInfo", "parameters": { ... } }
      //     ]
      //   }
      // }

      const message = body.message;
      if (!message || message.type !== 'tool-calls') {
        throw new Error('Invalid webhook format');
      }

      const toolCallList = message.toolCallList || [];
      const results: Array<{ name: string; toolCallId: string; result: string }> = [];

      for (const toolCall of toolCallList) {
        const { id, name, parameters } = toolCall;
        toolNames.push(name);

        // Find the LangChain tool by name
        const tool = sarahTools.find((t) => t.name === name);
        if (!tool) {
          results.push({
            name,
            toolCallId: id,
            result: JSON.stringify({ error: `Tool '${name}' not found` }),
          });
          continue;
        }

        try {
          // Execute the LangChain tool with tracing
          const result = await traceToolExecution(
            name,
            parameters || {},
            sessionId || 'unknown',
            () => (tool as any).invoke(parameters || {})
          );
          results.push({
            name,
            toolCallId: id,
            result: typeof result === 'string' ? result : JSON.stringify(result),
          });
        } catch (err) {
          console.error(`Tool execution error for ${name}:`, err);
          results.push({
            name,
            toolCallId: id,
            result: JSON.stringify({ error: (err as Error).message }),
          });
        }
      }

      return results;
    });

    // VAPI expects this exact response format
    res.json({ results: result });
  } catch (err) {
    console.error('VAPI tool-calls webhook error:', err);
    res.status(500).json({ error: 'Internal error', detail: (err as Error).message });
  }
});

// POST /api/demo/webhooks/vapi/call-ended — Optional: log call ended
router.post('/webhooks/vapi/call-ended', async (req, res) => {
  try {
    const { call, transcript } = req.body;
    console.log('VAPI call ended:', {
      callId: call?.id,
      status: call?.status,
      transcriptLength: transcript?.length,
    });
    res.json({ status: 'logged' });
  } catch (err) {
    console.error('VAPI call-ended webhook error:', err);
    res.status(500).json({ error: 'Internal error' });
  }
});

// GET /api/demo/health — VAPI-specific health check
router.get('/health', (_req, res) => {
  res.json({ status: 'ok', provider: 'vapi', tools: sarahTools.map((t) => t.name) });
});

export default router;
