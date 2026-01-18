import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAgentTool } from './create-agent-tool';

vi.mock('@/services/agents/agent-registry', () => ({
  agentRegistry: {
    get: vi.fn().mockResolvedValue(undefined),
    forceRegister: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('@/services/agents/tool-registry', () => ({
  getAvailableToolsForUISync: vi.fn(() => [
    { id: 'readFile', ref: { name: 'readFile' } },
    { id: 'editFile', ref: { name: 'editFile' } },
  ]),
}));

vi.mock('@/services/agents/agent-tool-access', () => ({
  isToolAllowedForAgent: vi.fn(() => true),
}));

vi.mock('@/stores/agent-store', () => ({
  useAgentStore: {
    getState: () => ({
      refreshAgents: vi.fn().mockResolvedValue(undefined),
    }),
  },
}));

vi.mock('@/types/model-types', () => ({
  getModelType: vi.fn(() => 'main_model'),
}));

describe('createAgentTool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Reset mocks after each test
  });

  it('creates agent and returns success', async () => {
    const result = await createAgentTool.execute({
      name: 'My Agent',
      systemPrompt: 'Do the thing',
      tools: ['readFile'],
      modelType: 'main_model',
    });

    expect(result.success).toBe(true);
    expect(result.id).toBe('my-agent');
    expect(result.message).toContain('Agent "My Agent" created');
  });

  it('adds numeric suffix when id already exists', async () => {
    const { agentRegistry } = await import('@/services/agents/agent-registry');
    vi.mocked(agentRegistry.get)
      .mockResolvedValueOnce({ id: 'my-agent' } as any)
      .mockResolvedValueOnce(undefined);

    const result = await createAgentTool.execute({
      name: 'My Agent',
      systemPrompt: 'Do the thing',
    });

    expect(result.success).toBe(true);
    expect(result.id).toBe('my-agent-1');
  });

  it('filters disallowed tools and keeps MCP placeholders', async () => {
    const { isToolAllowedForAgent } = await import('@/services/agents/agent-tool-access');
    vi.mocked(isToolAllowedForAgent).mockImplementation((_agentId, toolId) => toolId !== 'editFile');

    const result = await createAgentTool.execute({
      name: 'My Agent',
      systemPrompt: 'Do the thing',
      tools: ['readFile', 'editFile', 'mcp__tool'],
    });

    expect(result.success).toBe(true);
    expect(result.disallowedTools).toEqual(['editFile']);
    expect(result.skippedTools).toEqual([]);
  });

  it('rejects empty id and name', async () => {
    const result = await createAgentTool.execute({
      name: '   ',
      systemPrompt: 'Do the thing',
    });

    expect(result.success).toBe(false);
    expect(result.message).toContain('Invalid agent id');
  });
});
