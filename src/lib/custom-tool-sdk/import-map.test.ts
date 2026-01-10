import { describe, expect, it, beforeEach, vi } from 'vitest';
import { createMockTauriPath } from '@/test/mocks/tauri-path';
import { __getInternalModuleLoaderKeys, resolveCustomToolModule } from './import-map';

const TEST_FILE_PATTERNS = [/\.test\./, /\/src\/test\//];

const fsState = {
  existing: new Set<string>(),
  files: new Map<string, string>(),
};

vi.mock('@tauri-apps/api/path', () =>
  createMockTauriPath({
    join: (...paths: string[]) => paths.filter(Boolean).join('/'),
    normalize: (path: string) => path,
  })
);

vi.mock('@tauri-apps/plugin-fs', () => ({
  exists: vi.fn((path: string) => Promise.resolve(fsState.existing.has(path))),
  readTextFile: vi.fn((path: string) => Promise.resolve(fsState.files.get(path) ?? '')),
}));

vi.mock('@/services/tools/custom-tool-compiler', () => ({
  compileCustomTool: vi.fn(async (_source: string, options: { filename: string }) => ({
    code: `compiled:${options.filename}`,
  })),
  createCustomToolModuleUrl: vi.fn(async (_compiled: unknown, filename: string) => `module://${filename}`),
  resolveCustomToolDefinition: vi.fn(async () => ({ name: 'mock-tool' })),
}));

describe('custom tool import map', () => {
  const loaderKeys = __getInternalModuleLoaderKeys();

  beforeEach(() => {
    fsState.existing.clear();
    fsState.files.clear();
    vi.clearAllMocks();
  });

  it('excludes test files from module registry', () => {
    TEST_FILE_PATTERNS.forEach((pattern) => {
      expect(loaderKeys.some((key) => pattern.test(key))).toBe(false);
    });
  });

  it('still includes regular source files', () => {
    expect(loaderKeys).toContain('/src/lib/utils/debounce.ts');
  });

  it('resolves relative imports without extensions', async () => {
    const baseDir = '/tools';
    const filePath = '/tools/analysis-utils.ts';
    fsState.existing.add(filePath);
    fsState.files.set(filePath, 'export default {}');

    const resolved = await resolveCustomToolModule('./analysis-utils', baseDir);
    expect(resolved).toEqual({ name: 'mock-tool' });
  });

  it('resolves directory imports to index files', async () => {
    const baseDir = '/tools';
    const filePath = '/tools/helpers/index.ts';
    fsState.existing.add(filePath);
    fsState.files.set(filePath, 'export default {}');

    const resolved = await resolveCustomToolModule('./helpers', baseDir);
    expect(resolved).toEqual({ name: 'mock-tool' });
  });
});
