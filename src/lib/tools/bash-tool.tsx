import { join, resolveResource } from '@tauri-apps/api/path';
import { z } from 'zod';
import { BashToolDoing } from '@/components/tools/bash-tool-doing';
import { BashToolResult } from '@/components/tools/bash-tool-result';
import { createTool } from '@/lib/create-tool';
import { logger } from '@/lib/logger';
import type { BashResult } from '@/services/bash-executor';
import { bashExecutor } from '@/services/bash-executor';
import { getEffectiveWorkspaceRoot } from '@/services/workspace-root-service';

/**
 * Resolves $RESOURCE/ paths in a command string to actual file system paths.
 * Finds all occurrences of $RESOURCE/... and replaces them with resolved paths.
 *
 * Example:
 * Input: "bun $RESOURCE/ppt-references/scripts/merge.ts slides/test"
 * Output: "bun /path/to/resources/ppt-references/scripts/merge.ts slides/test"
 *
 * @param command - The command string that may contain $RESOURCE references
 * @param taskId - The task ID for workspace root resolution (fallback in dev mode)
 * @returns The command with $RESOURCE paths resolved to actual paths
 */
export async function resolveCommandResourcePaths(
  command: string,
  taskId: string
): Promise<string> {
  // Pattern to match $RESOURCE/ followed by path characters
  // Matches $RESOURCE/path/to/file or $RESOURCE\\path\\to\\file (Windows)
  const resourcePattern = /\$RESOURCE[/\\]([^\s"'";|&<>]+)/g;

  // Find all matches first
  const matches = [...command.matchAll(resourcePattern)];

  if (matches.length === 0) {
    return command;
  }

  // Build result string piece by piece to avoid index issues
  let result = '';
  let lastIndex = 0;

  for (const match of matches) {
    const fullMatch = match[0];
    const resourcePath = match[1] ?? '';
    const matchIndex = match.index ?? 0;

    // Append text before this match
    result += command.slice(lastIndex, matchIndex);

    if (!resourcePath) {
      // Keep original if no path specified
      result += fullMatch;
    } else {
      try {
        // Normalize the resource path (convert backslashes to forward slashes)
        const normalizedResourcePath = resourcePath.replace(/\\/g, '/');

        // Try to resolve using Tauri's resolveResource first
        let resolvedPath: string;
        try {
          resolvedPath = await resolveResource(normalizedResourcePath);
        } catch {
          // Fallback to dev resource path
          const rootPath = await getEffectiveWorkspaceRoot(taskId);
          if (!rootPath) {
            logger.warn('Cannot resolve $RESOURCE path: no workspace root', {
              resourcePath: normalizedResourcePath,
              taskId,
            });
            // Keep original since no fallback available
            result += fullMatch;
            lastIndex = matchIndex + fullMatch.length;
            continue;
          }
          const resourceSegments = normalizedResourcePath.split('/').filter(Boolean);
          resolvedPath = await join(rootPath, 'src-tauri', 'resources', ...resourceSegments);
        }

        // Append resolved path
        result += resolvedPath;
      } catch (error) {
        logger.warn('Failed to resolve $RESOURCE path:', {
          resourcePath,
          error: error instanceof Error ? error.message : String(error),
          taskId,
        });
        // Keep original on error
        result += fullMatch;
      }
    }

    lastIndex = matchIndex + fullMatch.length;
  }

  // Append remaining text after last match
  result += command.slice(lastIndex);

  return result;
}

export const bashTool = createTool({
  name: 'bash',
  description: `Execute shell commands safely on the system.

This tool allows you to run shell commands with built-in safety restrictions. Choose commands based on the Platform info in the environment context:

**Platform-specific command reference:**

| Task | macOS/Linux | Windows |
|------|-------------|---------|
| List files | ls -la | dir |
| Find files | find, fd | dir /s, where |
| Search content | grep, rg | findstr |
| Show file | cat, head, tail | type |
| Current directory | pwd | cd |
| Environment vars | env, export | set |
| Process list | ps aux | tasklist |
| Kill process | kill | taskkill |
| Network info | ifconfig, ip | ipconfig |
| Download file | curl, wget | curl, Invoke-WebRequest |
| Archive | tar, zip | tar, Compress-Archive |
| Package manager | brew (mac), apt (linux) | winget, choco |

**Cross-platform commands:**
- Git operations (git)
- Node.js (node, npm, yarn, pnpm, bun)
- Build tools (make, cargo, go)
- Python (python, pip)

The command will be executed in the current working directory.

**Resource Path Resolution:**
You can use the \`$RESOURCE\` prefix to reference bundled application resources:
- Example: \`bun $RESOURCE/ppt-references/scripts/merge-to-pptx.ts slides/my-deck\`
- The \`$RESOURCE\` prefix will be automatically resolved to the actual resource directory path
- Works for both bundled app resources and development resources

**Background execution:**
Use \`run_in_background: true\` to run long-running commands in the background. The command will continue running even if it produces no output for an extended period. Use this for:
- Development servers
- Long-running build processes
- Continuous processes

Output can be read using \`cat\` or \`tail -f\` on the output file path returned in the result.`,
  inputSchema: z.object({
    command: z
      .string()
      .describe(
        'The bash command to execute. Supports $RESOURCE/ prefix for bundled resources (e.g., $RESOURCE/ppt-references/scripts/merge-to-pptx.ts)'
      ),
    runInBackground: z
      .boolean()
      .optional()
      .default(false)
      .describe('Run command in background and return task ID'),
  }),
  canConcurrent: false,
  execute: async ({ command, runInBackground }, context): Promise<BashResult> => {
    // Resolve $RESOURCE paths before executing
    const resolvedCommand = await resolveCommandResourcePaths(command, context.taskId);

    // Log if command was modified
    if (resolvedCommand !== command) {
      logger.info('Resolved $RESOURCE paths in command', {
        original: command,
        resolved: resolvedCommand,
        taskId: context.taskId,
      });
    }

    if (runInBackground) {
      return await bashExecutor.executeInBackground(
        resolvedCommand,
        context.taskId,
        context.toolId
      );
    }
    return await bashExecutor.execute(resolvedCommand, context.taskId, context.toolId);
  },
  renderToolDoing: ({ command }) => <BashToolDoing command={command} />,
  renderToolResult: (result) => (
    <BashToolResult
      output={result?.output}
      error={result?.error}
      outputFilePath={result?.outputFilePath}
      errorFilePath={result?.errorFilePath}
      success={result?.success ?? false}
      exitCode={result?.exit_code}
      idleTimedOut={result?.idle_timed_out}
      timedOut={result?.timed_out}
      pid={result?.pid}
      taskId={result?.taskId}
      isBackground={result?.isBackground}
    />
  ),
});
