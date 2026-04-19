interface OpenRouterConfig {
  apiKey: string;
  model?: string;
  baseUrl?: string;
}

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface ChatCompletionResponse {
  choices: Array<{
    message: { content: string | null };
  }>;
}

export class OpenRouterClient {
  private apiKey: string;
  private model: string;
  private baseUrl: string;

  constructor(config: OpenRouterConfig) {
    this.apiKey = config.apiKey;
    this.model = config.model || 'anthropic/claude-sonnet-4-6';
    this.baseUrl = config.baseUrl || 'https://openrouter.ai/api/v1';
  }

  async chat(
    messages: ChatMessage[],
    systemPrompt: string,
    retries = 3
  ): Promise<string> {
    const fullMessages = [
      { role: 'system' as const, content: systemPrompt },
      ...messages,
    ];

    const url = `${this.baseUrl}/chat/completions`;

    for (let attempt = 1; attempt <= retries; attempt++) {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://agentive.ai',
          'X-Title': 'Agentive Speed-to-Lead',
        },
        body: JSON.stringify({
          model: this.model,
          messages: fullMessages,
          max_tokens: 300,
          temperature: 0.7,
        }),
      });

      if (!response.ok) {
        if (attempt < retries && response.status >= 500) {
          const delay = Math.pow(2, attempt) * 1000;
          await new Promise(r => setTimeout(r, delay));
          continue;
        }
        throw new Error(`OpenRouter API error: ${response.status}`);
      }

      const data: ChatCompletionResponse = await response.json();
      const content = data.choices[0]?.message?.content;
      if (!content) throw new Error('Empty response from OpenRouter');
      return content;
    }

    throw new Error('OpenRouter API error: max retries exceeded');
  }
}