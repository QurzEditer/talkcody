import { z } from 'zod';
import { GenericToolDoing } from '@/components/tools/generic-tool-doing';
import { GenericToolResult } from '@/components/tools/generic-tool-result';
import { createTool } from '@/lib/create-tool';
import { logger } from '@/lib/logger';
import { getFileBasedSkillService } from '@/services/skills/file-based-skill-service';

function inferScriptType(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'py':
      return 'python';
    case 'sh':
    case 'bash':
      return 'bash';
    case 'js':
    case 'ts':
    case 'mjs':
      return 'nodejs';
    default:
      return 'bash';
  }
}

/**
 * get-skill tool
 * Fetches complete file-based skill content including domain knowledge, workflow rules, documentation, and executable scripts
 * This tool enables dynamic skill loading to reduce system prompt size
 */
export const getSkillTool = createTool({
  name: 'getSkill',
  description: `Use this tool to fetch the complete content of a skill when you need domain-specific knowledge, workflow rules, reference documentation, or executable scripts.

Skills may include executable scripts (Python, Bash, Node.js) that you can run using the execute_skill_script tool.`,
  inputSchema: z.object({
    skill_name: z.string().describe('The exact name of the skill to fetch (case-sensitive)'),
  }),
  canConcurrent: true, // Multiple skills can be fetched in parallel
  hidden: true,
  execute: async ({ skill_name }) => {
    try {
      const skillService = await getFileBasedSkillService();

      // Get all skills to find by name
      const allSkills = await skillService.listSkills();
      const skill = allSkills.find((s) => s.name.toLowerCase() === skill_name.toLowerCase());

      if (!skill) {
        return {
          success: false,
          skill_name,
          content: null,
          message: `Skill not found: ${skill_name}. Please check the available skills list.`,
        };
      }

      // Build formatted skill content
      const sections: string[] = [];

      // Skill header
      sections.push(`# Skill: ${skill.name}`);
      if (skill.description) {
        sections.push(`\n${skill.description}\n`);
      }

      // Add skill metadata
      sections.push('\n## Skill Information\n');
      sections.push(`- **Skill ID**: ${skill.id}`);
      sections.push(`- **Category**: ${skill.category}`);
      sections.push(`- **Version**: ${skill.frontmatter.version || 'Not specified'}`);
      if (skill.metadata.source) {
        sections.push(`- **Source**: ${skill.metadata.source}`);
      }
      if (skill.metadata.tags && skill.metadata.tags.length > 0) {
        sections.push(`- **Tags**: ${skill.metadata.tags.join(', ')}`);
      }

      // Main skill content (from SKILL.md)
      if (skill.content) {
        sections.push('\n## Skill Content\n');
        sections.push(skill.content);
      }

      // Reference documentation (from REFERENCE.md if exists)
      if (skill.referenceContent) {
        sections.push('\n## Reference Documentation\n');
        sections.push(skill.referenceContent);
      }

      // Available scripts section
      if (skill.hasScripts && skill.scriptFiles && skill.scriptFiles.length > 0) {
        sections.push('\n## Available Scripts\n');
        sections.push(
          'This skill includes executable scripts that you can run using the `execute_skill_script` tool:\n'
        );

        for (const scriptFile of skill.scriptFiles) {
          const scriptPath = `${skill.localPath}/scripts/${scriptFile}`;
          const scriptType = inferScriptType(scriptFile);

          sections.push(`\n### ${scriptFile}\n`);
          sections.push(`- **Path**: \`${scriptPath}\``);
          sections.push(`- **Type**: ${scriptType}`);
          sections.push(
            `- **Usage**: To execute this script, use the \`execute_skill_script\` tool with:`
          );
          sections.push('  ```json');
          sections.push('  {');
          sections.push(`    "script_path": "${scriptPath}",`);
          sections.push(`    "script_type": "${scriptType}",`);
          sections.push('    "args": []  // Add any required arguments here');
          sections.push('  }');
          sections.push('  ```');
        }

        sections.push(
          '\n**Important**: Before executing any script, you should review its purpose and ensure you have proper permissions. Scripts may require specific permission levels (read-only, write-project, write-all, network, or full access).'
        );
      }

      const formattedContent = sections.join('\n');

      logger.info(`get-skill: Successfully fetched skill: ${skill.name}`, {
        hasScripts: skill.hasScripts,
        scriptCount: skill.scriptFiles?.length || 0,
      });

      return {
        success: true,
        skill_name,
        content: formattedContent,
        message: `Successfully loaded skill: ${skill.name}${
          skill.hasScripts && skill.scriptFiles
            ? ` (includes ${skill.scriptFiles.length} script(s))`
            : ''
        }`,
      };
    } catch (error) {
      logger.error('Error fetching skill:', error);
      return {
        success: false,
        skill_name,
        content: null,
        message: `Failed to fetch skill: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  },
  renderToolDoing: ({ skill_name }) => (
    <GenericToolDoing operation="skill" filePath={`skill: ${skill_name}`} />
  ),
  renderToolResult: (result) => (
    <GenericToolResult success={result?.success ?? false} message={result?.content} />
  ),
});
