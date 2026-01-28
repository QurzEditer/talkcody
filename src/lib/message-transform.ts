import type { ReasoningPart, TextPart } from '@ai-sdk/provider-utils';
import type { ModelMessage } from 'ai';

export namespace MessageTransform {
  function shouldApplyCaching(providerId: string, modelId: string): boolean {
    const lowerProviderId = providerId.toLowerCase();
    const lowerModelId = modelId.toLowerCase();

    return (
      lowerProviderId.includes('anthropic') ||
      lowerProviderId.includes('claude') ||
      lowerModelId.includes('anthropic') ||
      lowerModelId.includes('claude') ||
      lowerModelId.includes('minimax')
    );
  }

  function applyCacheToMessage(msg: ModelMessage, providerId: string): void {
    const normalized = providerId.toLowerCase();
    const providerOptions =
      normalized.includes('anthropic') || normalized.includes('claude')
        ? { anthropic: { cacheControl: { type: 'ephemeral' } } }
        : normalized.includes('openrouter')
          ? { openrouter: { cache_control: { type: 'ephemeral' } } }
          : { openaiCompatible: { cache_control: { type: 'ephemeral' } } };

    const msgWithOptions = msg as unknown as { providerOptions?: object };
    msgWithOptions.providerOptions = {
      ...(msgWithOptions.providerOptions ?? {}),
      ...providerOptions,
    };
  }

  function applyCaching(msgs: ModelMessage[], providerId: string): void {
    const finalMsgs = msgs.filter((msg) => msg.role !== 'system').slice(-2);
    for (const msg of finalMsgs) {
      applyCacheToMessage(msg, providerId);
    }
  }

  /**
   * Unified transformation function for messages.
   *
   * Handles:
   * - Prompt caching for Anthropic/Claude providers
   * - DeepSeek reasoning content extraction (when assistantContent provided)
   *
   * @param msgs - The messages array to transform
   * @param modelId - The model identifier
   * @param providerId - The provider identifier
   * @param assistantContent - Optional: assistant content to transform (for DeepSeek)
   * @returns Transformed messages and optional transformed content
   */
  function extractReasoning(content: Array<TextPart | ReasoningPart>): {
    content: Array<TextPart | ReasoningPart>;
    reasoningText: string;
  } {
    const reasoningParts = content.filter((part) => part.type === 'reasoning') as ReasoningPart[];
    const reasoningText = reasoningParts.map((part) => part.text).join('');
    const filteredContent = content.filter((part) => part.type !== 'reasoning');

    return { content: filteredContent, reasoningText };
  }

  export function transform(
    msgs: ModelMessage[],
    modelId: string,
    providerId?: string,
    assistantContent?: Array<TextPart | ReasoningPart>
  ): {
    messages: ModelMessage[];
    transformedContent?: {
      content: Array<TextPart | ReasoningPart>;
      providerOptions?: { openaiCompatible: { reasoning_content: string } };
    };
  } {
    // Apply prompt caching for supported providers
    if (providerId && shouldApplyCaching(providerId, modelId)) {
      applyCaching(msgs, providerId);
    }

    // Transform assistant content for Moonshot thinking
    if (assistantContent && providerId === 'moonshot') {
      const extracted = extractReasoning(assistantContent);
      const transformedContent = {
        content: extracted.content,
        providerOptions: extracted.reasoningText
          ? {
              openaiCompatible: {
                reasoning_content: extracted.reasoningText,
              },
            }
          : undefined,
      };

      return { messages: msgs, transformedContent };
    }

    // Default passthrough
    const transformedContent = assistantContent ? { content: assistantContent } : undefined;

    return { messages: msgs, transformedContent };
  }
}
