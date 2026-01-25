import { describe, expect, it, vi } from 'vitest';
import { logger } from '@/lib/logger';

import { aiPricingService } from './ai-pricing-service';

describe('AIPricingService', () => {
  it('calculates cost using cached and cache creation input token rates', () => {
    const modelId = 'gpt-5-mini';

    const cost = aiPricingService.calculateCost(modelId, {
      inputTokens: 100,
      outputTokens: 50,
      cachedInputTokens: 40,
      cacheCreationInputTokens: 10,
    });

    const inputRate = 0.00000025;
    const outputRate = 0.000002;
    const cachedRate = 0.00000003;
    const cacheCreationRate = 0;
    const nonCachedInput = 100 - 40 - 10;
    const expected =
      nonCachedInput * inputRate +
      40 * cachedRate +
      10 * cacheCreationRate +
      50 * outputRate;

    expect(cost).toBeCloseTo(expected, 10);
  });

  it('falls back to input rate when cached rates are missing', () => {
    const modelId = 'gemini-2.5-flash';

    const cost = aiPricingService.calculateCost(modelId, {
      inputTokens: 120,
      outputTokens: 60,
      cachedInputTokens: 30,
      cacheCreationInputTokens: 20,
    });

    const inputRate = 0.0000003;
    const outputRate = 0.0000025;
    const expected = (120 - 30 - 20) * inputRate + 30 * inputRate + 20 * inputRate + 60 * outputRate;

    expect(cost).toBeCloseTo(expected, 10);
  });

  it('handles missing pricing gracefully', () => {
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => undefined);

    const cost = aiPricingService.calculateCost('missing-model', {
      inputTokens: 10,
      outputTokens: 5,
    });

    expect(cost).toBe(0);

    errorSpy.mockRestore();
  });
});
