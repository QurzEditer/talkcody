export type UsageLike = {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  promptTokens?: number;
  completionTokens?: number;
  cachedInputTokens?: number;
  cacheCreationInputTokens?: number;
};

export type NormalizedUsage = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cachedInputTokens?: number;
  cacheCreationInputTokens?: number;
};

export class UsageTokenUtils {
  static normalizeUsageTokens(
    usage?: UsageLike | null,
    totalUsage?: UsageLike | null
  ): NormalizedUsage | null {
    const primary = usage ?? totalUsage ?? null;
    const inputTokens =
      primary?.inputTokens ??
      primary?.promptTokens ??
      totalUsage?.inputTokens ??
      totalUsage?.promptTokens ??
      0;
    const outputTokens =
      primary?.outputTokens ??
      primary?.completionTokens ??
      totalUsage?.outputTokens ??
      totalUsage?.completionTokens ??
      0;
    const cachedInputTokens =
      primary?.cachedInputTokens ?? totalUsage?.cachedInputTokens ?? undefined;
    const cacheCreationInputTokens =
      primary?.cacheCreationInputTokens ?? totalUsage?.cacheCreationInputTokens ?? undefined;
    let totalTokens = primary?.totalTokens ?? totalUsage?.totalTokens ?? inputTokens + outputTokens;

    if (totalTokens > 0 && (inputTokens > 0 || outputTokens > 0)) {
      totalTokens = inputTokens + outputTokens;
    }

    if (totalTokens > 0 && inputTokens === 0 && outputTokens === 0) {
      return { inputTokens: totalTokens, outputTokens: 0, totalTokens };
    }

    if (totalTokens === 0 && (inputTokens > 0 || outputTokens > 0)) {
      totalTokens = inputTokens + outputTokens;
    }

    if (totalTokens === 0) return null;

    const normalized: NormalizedUsage = { inputTokens, outputTokens, totalTokens };
    if (cachedInputTokens !== undefined) {
      normalized.cachedInputTokens = cachedInputTokens;
    }
    if (cacheCreationInputTokens !== undefined) {
      normalized.cacheCreationInputTokens = cacheCreationInputTokens;
    }
    return normalized;
  }
}
