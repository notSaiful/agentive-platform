import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OpenRouterClient } from '../client.js';

describe('OpenRouterClient', () => {
  let client: OpenRouterClient;

  beforeEach(() => {
    client = new OpenRouterClient({
      apiKey: 'test-key',
      model: 'anthropic/claude-sonnet-4-6',
    });
  });

  it('sends chat completion request to OpenRouter', async () => {
    const mockResponse = {
      choices: [{ message: { content: 'Hello! How can I help?' } }],
    };

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    } as Response);

    const result = await client.chat(
      [{ role: 'user', content: 'Hi' }],
      'You are a helpful assistant.'
    );

    expect(result).toBe('Hello! How can I help?');
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://openrouter.ai/api/v1/chat/completions',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Authorization': 'Bearer test-key',
          'Content-Type': 'application/json',
        }),
      })
    );

    fetchSpy.mockRestore();
  });

  it('throws on API error', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 429,
      statusText: 'Rate Limited',
      json: () => Promise.resolve({ error: { message: 'Rate limited' } }),
    } as Response);

    await expect(
      client.chat([{ role: 'user', content: 'Hi' }], 'system prompt')
    ).rejects.toThrow('OpenRouter API error: 429');
  });

  it('retries on transient failures', async () => {
    vi.useFakeTimers();
    let callCount = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => {
      callCount++;
      if (callCount < 3) {
        return Promise.resolve({
          ok: false,
          status: 503,
          statusText: 'Service Unavailable',
          json: () => Promise.resolve({}),
        } as Response);
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          choices: [{ message: { content: 'Retried!' } }],
        }),
      } as Response);
    });

    const chatPromise = client.chat(
      [{ role: 'user', content: 'Hi' }],
      'system prompt'
    );
    await vi.runAllTimersAsync();
    const result = await chatPromise;
    expect(result).toBe('Retried!');
    expect(callCount).toBe(3);
    vi.useRealTimers();
  });
});