import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveCommandResourcePaths } from './bash-tool';

// Mock Tauri path APIs
vi.mock('@tauri-apps/api/path', () => ({
  join: vi.fn((...parts: string[]) => parts.join('/')),
  resolveResource: vi.fn(),
}));

// Mock workspace root service
vi.mock('@/services/workspace-root-service', () => ({
  getEffectiveWorkspaceRoot: vi.fn(),
}));

// Mock logger
vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { join, resolveResource } from '@tauri-apps/api/path';
import { getEffectiveWorkspaceRoot } from '@/services/workspace-root-service';

const mockedJoin = vi.mocked(join);
const mockedResolveResource = vi.mocked(resolveResource);
const mockedGetEffectiveWorkspaceRoot = vi.mocked(getEffectiveWorkspaceRoot);

describe('bash-tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('resolveCommandResourcePaths', () => {
    it('returns command unchanged when no $RESOURCE references', async () => {
      const command = 'ls -la /Users/test/project';
      const result = await resolveCommandResourcePaths(command, 'task-123');

      expect(result).toBe(command);
      expect(mockedResolveResource).not.toHaveBeenCalled();
    });

    it('resolves single $RESOURCE reference using resolveResource', async () => {
      mockedResolveResource.mockResolvedValue('/bundle/resources/ppt-references/scripts/merge.ts');

      const command = 'bun $RESOURCE/ppt-references/scripts/merge.ts slides/test';
      const result = await resolveCommandResourcePaths(command, 'task-123');

      expect(result).toBe('bun /bundle/resources/ppt-references/scripts/merge.ts slides/test');
      expect(mockedResolveResource).toHaveBeenCalledWith('ppt-references/scripts/merge.ts');
    });

    it('resolves multiple $RESOURCE references in same command', async () => {
      mockedResolveResource
        .mockResolvedValueOnce('/bundle/resources/ppt-references/scripts/merge.ts')
        .mockResolvedValueOnce('/bundle/resources/ppt-references/base-prompt.md');

      const command =
        'bun $RESOURCE/ppt-references/scripts/merge.ts $RESOURCE/ppt-references/base-prompt.md';
      const result = await resolveCommandResourcePaths(command, 'task-123');

      expect(result).toBe(
        'bun /bundle/resources/ppt-references/scripts/merge.ts /bundle/resources/ppt-references/base-prompt.md'
      );
      expect(mockedResolveResource).toHaveBeenCalledTimes(2);
    });

    it('falls back to dev resource path when resolveResource fails', async () => {
      mockedResolveResource.mockRejectedValue(new Error('Resource not found'));
      mockedGetEffectiveWorkspaceRoot.mockResolvedValue('/dev/workspace');
      mockedJoin.mockImplementation((...parts) => parts.join('/'));

      const command = 'cat $RESOURCE/ppt-references/base-prompt.md';
      const result = await resolveCommandResourcePaths(command, 'task-123');

      expect(result).toBe('cat /dev/workspace/src-tauri/resources/ppt-references/base-prompt.md');
      expect(mockedGetEffectiveWorkspaceRoot).toHaveBeenCalledWith('task-123');
    });

    it('handles Windows-style backslashes in $RESOURCE paths', async () => {
      mockedResolveResource.mockResolvedValue('/bundle/resources/ppt-references/scripts/merge.ts');

      const command = 'bun $RESOURCE\\ppt-references\\scripts\\merge.ts slides/test';
      const result = await resolveCommandResourcePaths(command, 'task-123');

      expect(result).toBe('bun /bundle/resources/ppt-references/scripts/merge.ts slides/test');
      expect(mockedResolveResource).toHaveBeenCalledWith('ppt-references/scripts/merge.ts');
    });

    it('handles quoted $RESOURCE paths', async () => {
      mockedResolveResource.mockResolvedValue('/bundle/resources/ppt-references/base-prompt.md');

      const command = 'cat "$RESOURCE/ppt-references/base-prompt.md"';
      const result = await resolveCommandResourcePaths(command, 'task-123');

      expect(result).toBe('cat "/bundle/resources/ppt-references/base-prompt.md"');
    });

    it('handles complex command with pipes and $RESOURCE', async () => {
      mockedResolveResource.mockResolvedValue('/bundle/resources/ppt-references/base-prompt.md');

      const command = 'cat $RESOURCE/ppt-references/base-prompt.md | grep "test" | head -5';
      const result = await resolveCommandResourcePaths(command, 'task-123');

      expect(result).toBe(
        'cat /bundle/resources/ppt-references/base-prompt.md | grep "test" | head -5'
      );
    });

    it('preserves original command when resolveResource fails and no workspace root', async () => {
      mockedResolveResource.mockRejectedValue(new Error('Resource not found'));
      mockedGetEffectiveWorkspaceRoot.mockResolvedValue(null);

      const command = 'cat $RESOURCE/ppt-references/base-prompt.md';
      const result = await resolveCommandResourcePaths(command, 'task-123');

      // Should preserve original since no fallback available
      expect(result).toBe(command);
    });

    it('resolves nested resource paths correctly', async () => {
      mockedResolveResource.mockResolvedValue('/bundle/resources/ppt-references/styles/blueprint.md');

      const command = 'cat $RESOURCE/ppt-references/styles/blueprint.md';
      const result = await resolveCommandResourcePaths(command, 'task-123');

      expect(result).toBe('cat /bundle/resources/ppt-references/styles/blueprint.md');
      expect(mockedResolveResource).toHaveBeenCalledWith('ppt-references/styles/blueprint.md');
    });

    it('handles command with $RESOURCE at different positions', async () => {
      mockedResolveResource
        .mockResolvedValueOnce('/bundle/resources/file1.md')
        .mockResolvedValueOnce('/bundle/resources/file2.md');

      // $RESOURCE at start, middle, and end
      const command =
        '$RESOURCE/file1.md some args $RESOURCE/file2.md';
      const result = await resolveCommandResourcePaths(command, 'task-123');

      expect(result).toBe('/bundle/resources/file1.md some args /bundle/resources/file2.md');
    });

    it('handles empty or malformed $RESOURCE references gracefully', async () => {
      const command = 'echo $RESOURCE/';
      const result = await resolveCommandResourcePaths(command, 'task-123');

      // Should preserve original since there's no path after $RESOURCE/
      expect(result).toBe(command);
    });
  });
});
