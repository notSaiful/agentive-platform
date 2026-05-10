import { Client } from 'langsmith';

const client = new Client({
  apiKey: process.env.LANGCHAIN_API_KEY,
  apiUrl: process.env.LANGCHAIN_ENDPOINT ?? 'https://api.smith.langchain.com',
});

interface TraceRunInput {
  runId: string;
  name: string;
  inputs: Record<string, unknown>;
  runType?: 'llm' | 'tool' | 'chain' | 'retriever';
  tags?: string[];
  metadata?: Record<string, unknown>;
  parentRunId?: string;
}

interface TraceRunOutput {
  runId: string;
  outputs?: Record<string, unknown>;
  error?: string;
}

/**
 * Start a traced run in LangSmith.
 */
export async function startTrace(input: TraceRunInput): Promise<void> {
  if (process.env.LANGCHAIN_TRACING_V2 !== 'true') return;

  try {
    await client.createRun({
      id: input.runId,
      name: input.name,
      run_type: input.runType ?? 'chain',
      inputs: input.inputs,
      extra: {
        metadata: input.metadata,
        tags: input.tags ?? [],
      },
      start_time: Date.now(),
      parent_run_id: input.parentRunId,
      project_name: process.env.LANGCHAIN_PROJECT ?? 'agentive-sarah-demo',
    });
  } catch (err) {
    console.error('LangSmith startTrace error:', err);
  }
}

/**
 * End a traced run in LangSmith.
 */
export async function endTrace(input: TraceRunOutput): Promise<void> {
  if (process.env.LANGCHAIN_TRACING_V2 !== 'true') return;

  try {
    await client.updateRun(input.runId, {
      outputs: input.outputs,
      error: input.error,
      end_time: Date.now(),
    });
  } catch (err) {
    console.error('LangSmith endTrace error:', err);
  }
}

/**
 * Trace a LangChain tool execution.
 */
export async function traceToolExecution<T>(
  toolName: string,
  args: Record<string, unknown>,
  sessionId: string,
  fn: () => Promise<T>
): Promise<T> {
  const runId = `run_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  await startTrace({
    runId,
    name: toolName,
    runType: 'tool',
    inputs: args,
    tags: ['sarah-demo', 'tool', toolName],
    metadata: { sessionId, toolName },
  });

  try {
    const result = await fn();
    await endTrace({
      runId,
      outputs: { result: typeof result === 'string' ? result : JSON.stringify(result) },
    });
    return result;
  } catch (err) {
    await endTrace({
      runId,
      error: (err as Error).message,
    });
    throw err;
  }
}

/**
 * Trace the full orchestrator conversation turn.
 */
export async function traceOrchestrator<T>(
  sessionId: string,
  messageCount: number,
  fn: () => Promise<T>
): Promise<T> {
  const runId = `run_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  await startTrace({
    runId,
    name: 'sarah-orchestrator',
    runType: 'chain',
    inputs: { sessionId, messageCount },
    tags: ['sarah-demo', 'orchestrator'],
    metadata: { sessionId, messageCount },
  });

  try {
    const result = await fn();
    await endTrace({
      runId,
      outputs: { result: typeof result === 'string' ? result : 'object' },
    });
    return result;
  } catch (err) {
    await endTrace({
      runId,
      error: (err as Error).message,
    });
    throw err;
  }
}

/**
 * Trace a VAPI tool-calls webhook request.
 */
export async function traceVapiWebhook<T>(
  toolNames: string[],
  sessionId: string | undefined,
  fn: () => Promise<T>
): Promise<T> {
  const runId = `run_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  await startTrace({
    runId,
    name: 'vapi-webhook',
    runType: 'chain',
    inputs: { toolNames, sessionId },
    tags: ['sarah-demo', 'vapi', 'webhook'],
    metadata: { toolNames, sessionId },
  });

  try {
    const result = await fn();
    await endTrace({
      runId,
      outputs: { result: typeof result === 'string' ? result : 'object' },
    });
    return result;
  } catch (err) {
    await endTrace({
      runId,
      error: (err as Error).message,
    });
    throw err;
  }
}
