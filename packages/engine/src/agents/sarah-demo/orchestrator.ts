import { ChatOpenAI } from '@langchain/openai';
import { AIMessage, HumanMessage, ToolMessage } from '@langchain/core/messages';
import { sarahTools, getQualificationData } from './tools.js';
import { SARAH_DEMO_SYSTEM_PROMPT } from './prompts.js';
import { traceToolExecution, traceOrchestrator } from './tracer.js';

interface OrchestratorInput {
  messages: { role: 'user' | 'assistant' | 'tool'; content: string; tool_call_id?: string }[];
  sessionId: string;
  model?: string;
  apiKey?: string;
}

interface OrchestratorOutput {
  response: string;
  toolCalls: Array<{
    name: string;
    args: Record<string, unknown>;
    result?: string;
  }>;
}

export async function runSarahOrchestrator(input: OrchestratorInput): Promise<OrchestratorOutput> {
  return traceOrchestrator(input.sessionId, input.messages.length, async () => {
    const modelName = input.model ?? process.env.OPENROUTER_MODEL ?? 'gpt-4o';
    const apiKey = input.apiKey ?? process.env.OPENROUTER_API_KEY ?? process.env.ANTHROPIC_API_KEY ?? '';

    // Use OpenRouter-compatible endpoint if OPENROUTER_API_KEY is set
    const baseUrl = process.env.OPENROUTER_API_KEY ? 'https://openrouter.ai/api/v1' : undefined;

    const llm = new ChatOpenAI({
      modelName,
      apiKey,
      configuration: baseUrl ? { baseURL: baseUrl } : undefined,
      temperature: 0.7,
      // LangSmith tracing metadata
      callbacks: [],
      tags: ['sarah-demo', 'orchestrator', input.sessionId],
      metadata: { sessionId: input.sessionId, model: modelName },
    }).bindTools(sarahTools);

    const langChainMessages = [
      { role: 'system', content: SARAH_DEMO_SYSTEM_PROMPT },
      ...input.messages.map((m) => {
        if (m.role === 'user') return new HumanMessage(m.content);
        if (m.role === 'assistant') return new AIMessage(m.content);
        return new ToolMessage({ content: m.content, tool_call_id: m.tool_call_id ?? 'unknown' });
      }),
    ];

    const response = await llm.invoke(langChainMessages);

    const toolCalls: OrchestratorOutput['toolCalls'] = [];

    if (response.tool_calls && response.tool_calls.length > 0) {
      for (const tc of response.tool_calls) {
        // Find the matching tool
        const tool = sarahTools.find((t) => t.name === tc.name);
        if (!tool) continue;

        // Inject sessionId for collectQualificationData
        const args = tc.name === 'collectQualificationData'
          ? { ...tc.args, sessionId: input.sessionId }
          : tc.args;

        // Execute with LangSmith tracing
        const result = await traceToolExecution(
          tc.name,
          args,
          input.sessionId,
          () => (tool as any).invoke(args)
        );

        toolCalls.push({
          name: tc.name,
          args: tc.args as Record<string, unknown>,
          result: typeof result === 'string' ? result : JSON.stringify(result),
        });
      }

      // Re-invoke with tool results for final response
      const toolResultMessages = toolCalls.map(
        (tc) => new ToolMessage({ content: tc.result ?? '', tool_call_id: tc.name })
      );

      const finalResponse = await llm.invoke([...langChainMessages, response, ...toolResultMessages]);

      return {
        response: typeof finalResponse.content === 'string' ? finalResponse.content : JSON.stringify(finalResponse.content),
        toolCalls,
      };
    }

    return {
      response: typeof response.content === 'string' ? response.content : JSON.stringify(response.content),
      toolCalls,
    };
  });
}

export { getQualificationData };
