import { describe, expect, it, vi } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import { llmClient } from './llm-client';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(async (_event, handler) => {
    handler({
      payload: { type: 'text-delta', text: 'Hello ' },
    });
    handler({
      payload: { type: 'text-delta', text: 'world' },
    });
    handler({
      payload: { type: 'done', finish_reason: 'stop' },
    });
    return () => {};
  }),
}));

describe('llmClient', () => {
  it('collects text from streamed events', async () => {
    (invoke as any).mockResolvedValue({ request_id: 'test-request-id' });

    const result = await llmClient.collectText({
      model: 'test',
      messages: [{ role: 'user', content: 'Hello' }],
      stream: true,
      requestId: 'test-request-id',
      traceContext: {
        traceId: 'trace-1',
        spanName: 'Step1-llm',
        parentSpanId: null,
      },
    });

    expect(result.text).toBe('Hello world');
    expect(result.finishReason).toBe('stop');
  });

});
