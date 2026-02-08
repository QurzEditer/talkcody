import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const inboundUnsubscribe = vi.fn();
  const executionUnsubscribe = vi.fn();
  const editReviewUnsubscribe = vi.fn();

  const startAll = vi.fn().mockResolvedValue(undefined);
  const stopAll = vi.fn().mockResolvedValue(undefined);
  const onInbound = vi.fn().mockReturnValue(inboundUnsubscribe);
  const sendMessage = vi.fn().mockResolvedValue({ messageId: '1' });
  const editMessage = vi.fn().mockResolvedValue(undefined);
  const executionListener = vi.fn();

  const executionSubscribe = vi.fn().mockImplementation((listener) => {
    mocks.executionListener = listener;
    return executionUnsubscribe;
  });
  const useExecutionStore = Object.assign(vi.fn(), {
    subscribe: executionSubscribe,
    getState: vi.fn().mockReturnValue({
      getExecution: vi.fn(),
    }),
  });

  const editReviewSubscribe = vi.fn().mockReturnValue(editReviewUnsubscribe);
  const useEditReviewStore = Object.assign(vi.fn(), {
    subscribe: editReviewSubscribe,
    getState: vi.fn().mockReturnValue({
      pendingEdits: new Map(),
    }),
  });

  return {
    inboundUnsubscribe,
    executionUnsubscribe,
    editReviewUnsubscribe,
    startAll,
    stopAll,
    onInbound,
    sendMessage,
    editMessage,
    executionSubscribe,
    executionListener,
    editReviewSubscribe,
    useExecutionStore,
    useEditReviewStore,
  };
});

vi.mock('@/services/remote/remote-channel-manager', () => ({
  remoteChannelManager: {
    startAll: mocks.startAll,
    stopAll: mocks.stopAll,
    onInbound: mocks.onInbound,
    sendMessage: mocks.sendMessage,
    editMessage: mocks.editMessage,
  },
}));

vi.mock('@/stores/execution-store', () => ({
  useExecutionStore: mocks.useExecutionStore,
}));

vi.mock('@/stores/edit-review-store', () => ({
  useEditReviewStore: mocks.useEditReviewStore,
}));

import { remoteChatService } from '@/services/remote/remote-chat-service';

describe('remote-chat-service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const service = remoteChatService as {
      running: boolean;
      inboundUnsubscribe: (() => void) | null;
      executionUnsubscribe: (() => void) | null;
      executionStreamCancel: (() => void) | null;
      editReviewUnsubscribe: (() => void) | null;
      sessions: Map<string, unknown>;
      approvals: Map<string, unknown>;
      lastStreamContent: Map<string, string>;
    };
    service.running = false;
    service.inboundUnsubscribe = null;
    service.executionUnsubscribe = null;
    service.executionStreamCancel = null;
    service.editReviewUnsubscribe = null;
    service.sessions.clear();
    service.approvals.clear();
    service.lastStreamContent.clear();
  });

  it('unsubscribes listeners on stop', async () => {
    await remoteChatService.start();

    expect(mocks.startAll).toHaveBeenCalledTimes(1);
    expect(mocks.onInbound).toHaveBeenCalledTimes(1);
    expect(mocks.executionSubscribe).toHaveBeenCalledTimes(1);
    expect(mocks.editReviewSubscribe).toHaveBeenCalledTimes(1);

    await remoteChatService.stop();

    expect(mocks.inboundUnsubscribe).toHaveBeenCalledTimes(1);
    expect(mocks.executionUnsubscribe).toHaveBeenCalledTimes(1);
    expect(mocks.editReviewUnsubscribe).toHaveBeenCalledTimes(1);
    expect(mocks.stopAll).toHaveBeenCalledTimes(1);
  });

  it('streams updates while running', async () => {
    vi.useFakeTimers();
    const session = {
      channelId: 'telegram',
      chatId: '1',
      taskId: 'task-1',
      lastSentAt: 0,
      sentChunks: [],
      streamingMessageId: 'msg-1',
      lastStatusAck: 'running',
    };
    const execution = {
      taskId: 'task-1',
      status: 'running',
      streamingContent: 'hello world',
    };

    mocks.useExecutionStore.getState.mockReturnValue({
      getExecution: vi.fn().mockReturnValue(execution),
    });

    // @ts-expect-error - test setup
    remoteChatService.sessions.set('telegram:1', session);

    await remoteChatService.start();

    mocks.executionListener();
    vi.advanceTimersByTime(1100);

    expect(mocks.editMessage).toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('sends terminal status after completion', async () => {
    vi.useFakeTimers();
    const session = {
      channelId: 'telegram',
      chatId: '1',
      taskId: 'task-1',
      lastSentAt: 0,
      sentChunks: [],
      streamingMessageId: 'msg-1',
      lastStatusAck: 'running',
    };
    const execution = {
      taskId: 'task-1',
      status: 'completed',
      streamingContent: 'done',
    };

    mocks.useExecutionStore.getState.mockReturnValue({
      getExecution: vi.fn().mockReturnValue(execution),
    });

    await remoteChatService.start();

    // @ts-expect-error - test setup
    remoteChatService.sessions.set('telegram:1', session);

    await mocks.executionListener();
    vi.advanceTimersByTime(1100);
    await Promise.resolve();

    expect(mocks.sendMessage).toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('does not send messages when stopped', async () => {
    const message = { channelId: 'telegram', chatId: '1' };
    // @ts-expect-error - testing private method
    const result = await remoteChatService.sendMessage(message, 'hello');

    expect(result.messageId).toBe('');
    expect(mocks.sendMessage).not.toHaveBeenCalled();
  });

  it('does not edit messages when stopped', async () => {
    const session = {
      channelId: 'telegram',
      chatId: '1',
      taskId: 'task-1',
      lastSentAt: 0,
      sentChunks: [],
      streamingMessageId: 'msg-1',
    };

    // @ts-expect-error - testing private method
    await remoteChatService.editMessage(session, 'update');

    expect(mocks.editMessage).not.toHaveBeenCalled();
  });
});
