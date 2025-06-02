import type { DynamicStructuredTool } from '@langchain/core/tools';
import { availableTools } from '@/lib/ai/tools';
import type { RequestLogger } from './observabilityService';
import { z } from 'zod';

/**
 * ModernToolService
 *
 * Provides intelligent tool selection and context management for the hybrid architecture
 * Bridges LangChain tools with modern patterns while maintaining compatibility
 */

export interface ToolContext {
  userQuery: string;
  activeBitContextId?: string;
  uploadedContent?: any;
  artifactContext?: any;
  fileContext?: any;
  crossUIContext?: any;
  logger: RequestLogger;
}

export interface ToolExecutionResult {
  success: boolean;
  result?: any;
  error?: string;
  duration: number;
  toolName: string;
}

/**
 * Tool categories for better organization
 */
export enum ToolCategory {
  DOCUMENT = 'document',
  SEARCH = 'search',
  ASANA = 'asana',
  EXTERNAL = 'external',
  UTILITY = 'utility',
}

export interface CategorizedTool {
  tool: any; // Use any to avoid complex type issues with mixed tool types
  category: ToolCategory;
  priority: number;
  contextRequirements?: string[];
}

/**
 * Executes a tool with monitoring and error handling
 */
export async function executeToolWithMonitoring(
  tool: any, // Use any to handle different tool types
  params: any,
  context: ToolContext,
): Promise<ToolExecutionResult> {
  const startTime = performance.now();
  context.logger.info(`Executing tool: ${tool.name}`, { params });

  try {
    // Handle different tool types
    const result = tool.func
      ? await tool.func(params)
      : await tool.execute?.(params);
    const duration = performance.now() - startTime;

    context.logger.info(`Tool completed: ${tool.name}`, {
      duration: `${duration.toFixed(2)}ms`,
      success: true,
    });

    return {
      success: true,
      result,
      toolName: tool.name,
      duration,
    };
  } catch (error) {
    const duration = performance.now() - startTime;
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';

    context.logger.error(`Tool failed: ${tool.name}`, error);

    return {
      success: false,
      error: errorMessage,
      toolName: tool.name,
      duration,
    };
  }
}

/**
 * Categorizes available tools
 */
export function categorizeTools(): CategorizedTool[] {
  const categorized: CategorizedTool[] = [];

  for (const tool of availableTools) {
    const category: ToolCategory =
      tool.name.includes('Document') || tool.name.includes('document')
        ? ToolCategory.DOCUMENT
        : tool.name.includes('search') ||
            tool.name.includes('Search') ||
            tool.name.includes('knowledge')
          ? ToolCategory.SEARCH
          : tool.name.includes('asana') || tool.name.includes('Asana')
            ? ToolCategory.ASANA
            : tool.name.includes('tavily') ||
                tool.name.includes('weather') ||
                tool.name.includes('calendar')
              ? ToolCategory.EXTERNAL
              : ToolCategory.UTILITY;

    const priority =
      category === ToolCategory.DOCUMENT
        ? 8
        : category === ToolCategory.SEARCH
          ? 7
          : category === ToolCategory.ASANA
            ? 6
            : category === ToolCategory.EXTERNAL
              ? 4
              : 3;

    const contextRequirements: string[] = [];
    if (category === ToolCategory.SEARCH && tool.description?.includes('⚠️')) {
      contextRequirements.push('check_uploaded_content');
    }

    categorized.push({
      tool,
      category,
      priority,
      contextRequirements,
    });
  }

  return categorized.sort((a, b) => b.priority - a.priority);
}

/**
 * Intelligent tool selection based on user query analysis
 */
export async function selectRelevantTools(
  context: ToolContext,
  maxTools = 26, // Increased to allow access to all available tools
): Promise<any[]> {
  const { userQuery, logger } = context;
  const categorizedTools = categorizeTools();
  const keywords = userQuery.toLowerCase();

  logger.info('Starting intelligent tool selection for all specialists', {
    userQuery: userQuery.substring(0, 100),
    totalTools: categorizedTools.length,
    specialist: context.activeBitContextId,
  });

  // Scoring system for tool relevance
  const toolScores: Map<string, number> = new Map();

  for (const {
    tool,
    category,
    priority,
    contextRequirements,
  } of categorizedTools) {
    let score = priority;

    // Advanced keyword matching with intent detection

    // Document operations
    if (
      tool.name.toLowerCase().includes('document') ||
      tool.name.toLowerCase().includes('create') ||
      tool.name.toLowerCase().includes('update')
    ) {
      if (
        keywords.includes('create') ||
        keywords.includes('document') ||
        keywords.includes('write') ||
        keywords.includes('edit') ||
        keywords.includes('draft')
      ) {
        score += 15;
      }
    }

    // Knowledge base and search operations
    if (
      tool.name.toLowerCase().includes('search') ||
      tool.name.toLowerCase().includes('knowledge') ||
      tool.name.toLowerCase().includes('list')
    ) {
      if (
        keywords.includes('search') ||
        keywords.includes('find') ||
        keywords.includes('knowledge') ||
        keywords.includes('what') ||
        keywords.includes('show me') ||
        keywords.includes('list') ||
        keywords.includes('contents') ||
        keywords.includes('files') ||
        keywords.includes('documents')
      ) {
        score += 20; // Higher priority for knowledge operations
      }
    }

    // Content retrieval
    if (tool.name.toLowerCase().includes('getfilecontents')) {
      if (
        keywords.includes('contents') ||
        keywords.includes('read') ||
        keywords.includes('file') ||
        keywords.includes('complete') ||
        keywords.includes('full')
      ) {
        score += 18;
      }
    }

    // Asana project management
    if (tool.name.toLowerCase().includes('asana')) {
      if (
        keywords.includes('asana') ||
        keywords.includes('task') ||
        keywords.includes('project') ||
        keywords.includes('assign') ||
        keywords.includes('deadline')
      ) {
        score += 12;
      }
    }

    // External search
    if (tool.name.toLowerCase().includes('tavily')) {
      if (
        keywords.includes('web') ||
        keywords.includes('internet') ||
        keywords.includes('online') ||
        keywords.includes('latest') ||
        keywords.includes('current')
      ) {
        score += 8;
      }
    }

    // Calendar operations
    if (tool.name.toLowerCase().includes('calendar')) {
      if (
        keywords.includes('calendar') ||
        keywords.includes('schedule') ||
        keywords.includes('meeting') ||
        keywords.includes('appointment')
      ) {
        score += 10;
      }
    }

    // Context-based scoring adjustments (but still include all tools)
    if (context.activeBitContextId === 'echo-tango-specialist') {
      // Echo Tango specialist gets slight priority boost for creative and project tools
      if (
        category === ToolCategory.DOCUMENT ||
        category === ToolCategory.ASANA
      ) {
        score += 3; // Reduced from 5 to keep selection more balanced
      }
    }

    if (context.activeBitContextId === 'global-orchestrator') {
      // Global orchestrator gets slight priority boost for knowledge and search tools
      if (
        category === ToolCategory.SEARCH ||
        category === ToolCategory.EXTERNAL
      ) {
        score += 3; // Reduced from 5 to keep selection more balanced
      }

      // Ensure cross-context tool is always available to orchestrator
      if (tool.name === 'getMessagesFromOtherChat') {
        score += 50; // Very high priority for orchestrator
      }
    }

    toolScores.set(tool.name, score);
  }

  // Sort tools by score and select top tools
  const sortedTools = categorizedTools
    .sort(
      (a, b) =>
        (toolScores.get(b.tool.name) || 0) - (toolScores.get(a.tool.name) || 0),
    )
    .slice(0, maxTools)
    .map((ct) => ct.tool);

  logger.info('Intelligent tool selection completed', {
    selectedTools: sortedTools.map((t) => t.name),
    scores: Object.fromEntries(
      sortedTools.map((t) => [t.name, toolScores.get(t.name) || 0]),
    ),
    specialist: context.activeBitContextId,
  });

  return sortedTools;
}

/**
 * Gets tools by category
 */
export function getToolsByCategory(category: ToolCategory): any[] {
  const categorizedTools = categorizeTools();
  return categorizedTools
    .filter((ct) => ct.category === category)
    .map((ct) => ct.tool);
}

/**
 * Validates tool parameters before execution
 */
export function validateToolParameters(
  tool: any,
  params: any,
): { valid: boolean; errors?: string[] } {
  try {
    // Check if tool has a schema and it supports safeParse (Zod schema)
    if (tool.schema && typeof tool.schema.safeParse === 'function') {
      const result = tool.schema.safeParse(params);

      if (result.success) {
        return { valid: true };
      } else {
        const errors = result.error.errors.map(
          (err: any) => `${err.path.join('.')}: ${err.message}`,
        );
        return { valid: false, errors };
      }
    }

    // If no schema or not a Zod schema, assume valid
    return { valid: true };
  } catch (error) {
    return { valid: false, errors: ['Schema validation failed'] };
  }
}

/**
 * Gets tool information for display purposes
 */
export function getToolInfo(toolName: string): {
  name: string;
  description: string;
  parameters: any;
  category: ToolCategory;
} | null {
  const tool = availableTools.find((t) => t.name === toolName);
  if (!tool) return null;

  const categorized = categorizeTools().find((ct) => ct.tool.name === toolName);

  return {
    name: tool.name,
    description: tool.description || '',
    parameters: tool.schema,
    category: categorized?.category || ToolCategory.UTILITY,
  };
}

/**
 * Context-aware tool filtering
 */
export function filterToolsForContext(
  tools: any[],
  context: ToolContext,
): any[] {
  return tools.filter((tool) => {
    // Filter out tools that require specific context we don't have
    if (
      tool.description?.includes('⚠️ Knowledge Base Search') &&
      context.uploadedContent
    ) {
      return false;
    }

    // Add other context-based filtering logic here
    return true;
  });
}
