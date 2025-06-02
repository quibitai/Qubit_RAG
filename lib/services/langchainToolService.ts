/**
 * LangChainToolService
 *
 * Handles tool loading, configuration, and management for LangChain agents.
 * Extracted from langchainBridge to create clean separation of concerns.
 * Target: ~160 lines as per roadmap specifications.
 */

import { availableTools } from '@/lib/ai/tools/index';
import type { RequestLogger } from './observabilityService';
import type { ClientConfig } from '@/lib/db/queries';

/**
 * Tool configuration for LangChain integration
 */
export interface LangChainToolConfig {
  contextId?: string | null;
  clientConfig?: ClientConfig | null;
  enableToolExecution?: boolean;
  maxTools?: number;
  toolFilters?: string[];
  verbose?: boolean;
}

/**
 * Tool selection result
 */
export interface ToolSelectionResult {
  tools: any[];
  totalAvailable: number;
  selected: number;
  selectionTime: number;
  appliedFilters: string[];
  clientSpecificConfigs: boolean;
}

/**
 * Tool category for organization
 */
export enum LangChainToolCategory {
  DOCUMENT = 'document',
  SEARCH = 'search',
  ASANA = 'asana',
  EXTERNAL = 'external',
  UTILITY = 'utility',
  RAG = 'rag',
}

/**
 * Tool metadata for better management
 */
export interface LangChainToolMetadata {
  name: string;
  category: LangChainToolCategory;
  description: string;
  priority: number;
  contextRequirements?: string[];
  clientRestrictions?: string[];
}

/**
 * LangChainToolService class
 *
 * Provides centralized tool management for LangChain agents
 */
export class LangChainToolService {
  private logger: RequestLogger;
  private config: LangChainToolConfig;
  private toolMetadata: Map<string, LangChainToolMetadata>;

  constructor(logger: RequestLogger, config: LangChainToolConfig = {}) {
    this.logger = logger;
    this.config = {
      enableToolExecution: true,
      maxTools: 26,
      verbose: false,
      ...config,
    };
    this.toolMetadata = new Map();
    this.initializeToolMetadata();
  }

  /**
   * Select and filter tools based on context and configuration
   * Extracted from langchainBridge.selectTools()
   */
  public selectTools(): ToolSelectionResult {
    const startTime = performance.now();

    this.logger.info('Starting LangChain tool selection', {
      contextId: this.config.contextId,
      enableToolExecution: this.config.enableToolExecution,
      maxTools: this.config.maxTools,
    });

    // Setup client-specific tool configurations
    const clientSpecificConfigs = this.setupClientToolConfigs();

    // Start with all available tools
    let selectedTools = [...availableTools];
    const appliedFilters: string[] = [];

    // Apply tool execution filter
    if (this.config.enableToolExecution === false) {
      selectedTools = [];
      appliedFilters.push('tool_execution_disabled');
    }

    // Apply context-specific filtering if needed
    if (this.config.contextId) {
      selectedTools = this.filterToolsByContext(
        selectedTools,
        this.config.contextId,
      );
      appliedFilters.push('context_filtering');
    }

    // Apply client-specific filtering
    if (this.config.clientConfig) {
      selectedTools = this.filterToolsByClient(
        selectedTools,
        this.config.clientConfig,
      );
      appliedFilters.push('client_filtering');
    }

    // Apply tool filters if specified
    if (this.config.toolFilters && this.config.toolFilters.length > 0) {
      selectedTools = this.applyToolFilters(
        selectedTools,
        this.config.toolFilters,
      );
      appliedFilters.push('custom_filters');
    }

    // Limit tools if specified
    if (
      this.config.maxTools !== undefined &&
      selectedTools.length > this.config.maxTools
    ) {
      selectedTools = this.prioritizeAndLimitTools(
        selectedTools,
        this.config.maxTools,
      );
      appliedFilters.push('count_limiting');
    }

    const duration = performance.now() - startTime;

    this.logger.info('LangChain tool selection completed', {
      totalAvailable: availableTools.length,
      selected: selectedTools.length,
      selectionTime: `${duration.toFixed(2)}ms`,
      appliedFilters,
      tools: selectedTools.map((t) => t.name),
    });

    return {
      tools: selectedTools,
      totalAvailable: availableTools.length,
      selected: selectedTools.length,
      selectionTime: duration,
      appliedFilters,
      clientSpecificConfigs,
    };
  }

  /**
   * Setup client-specific tool configurations
   */
  private setupClientToolConfigs(): boolean {
    if (this.config.clientConfig?.configJson?.tool_configs) {
      this.logger.info('Setting up client-specific tool configurations', {
        clientId: this.config.clientConfig.id,
        configCount: Object.keys(
          this.config.clientConfig.configJson.tool_configs,
        ).length,
      });

      // Set global tool configs for tools to access
      global.CURRENT_TOOL_CONFIGS =
        this.config.clientConfig.configJson.tool_configs;
      return true;
    }
    return false;
  }

  /**
   * Filter tools by context requirements
   */
  private filterToolsByContext(tools: any[], contextId: string): any[] {
    // For now, return all tools as all specialists have access to all tools
    // This can be extended later for context-specific tool restrictions
    this.logger.info('All tools available to all specialists', {
      contextId,
      toolCount: tools.length,
    });
    return tools;
  }

  /**
   * Filter tools by client restrictions
   */
  private filterToolsByClient(tools: any[], clientConfig: ClientConfig): any[] {
    // Check if client has tool restrictions
    const availableBitIds = clientConfig.configJson?.available_bit_ids;
    if (availableBitIds && Array.isArray(availableBitIds)) {
      // Filter tools based on available bit IDs if needed
      // For now, return all tools as this filtering is not implemented
      this.logger.info(
        'Client tool filtering not implemented, using all tools',
        {
          clientId: clientConfig.id,
          availableBitIds: availableBitIds.length,
        },
      );
    }
    return tools;
  }

  /**
   * Apply custom tool filters
   */
  private applyToolFilters(tools: any[], filters: string[]): any[] {
    return tools.filter((tool) => {
      // Check if tool matches any of the filters
      return filters.some(
        (filter) =>
          tool.name.toLowerCase().includes(filter.toLowerCase()) ||
          tool.description?.toLowerCase().includes(filter.toLowerCase()),
      );
    });
  }

  /**
   * Prioritize and limit tools based on metadata
   */
  private prioritizeAndLimitTools(tools: any[], maxTools: number): any[] {
    // Sort tools by priority from metadata
    const sortedTools = tools.sort((a, b) => {
      const metadataA = this.toolMetadata.get(a.name);
      const metadataB = this.toolMetadata.get(b.name);
      const priorityA = metadataA?.priority || 5;
      const priorityB = metadataB?.priority || 5;
      return priorityB - priorityA; // Higher priority first
    });

    return sortedTools.slice(0, maxTools);
  }

  /**
   * Initialize tool metadata for better management
   */
  private initializeToolMetadata(): void {
    // Initialize metadata for available tools
    for (const tool of availableTools) {
      const category = this.categorizeToolByName(tool.name);
      const priority = this.getPriorityByCategory(category);

      this.toolMetadata.set(tool.name, {
        name: tool.name,
        category,
        description: tool.description || '',
        priority,
      });
    }

    this.logger.info('Tool metadata initialized', {
      toolCount: this.toolMetadata.size,
      categories: this.getCategoryDistribution(),
    });
  }

  /**
   * Categorize tool by name patterns
   */
  private categorizeToolByName(toolName: string): LangChainToolCategory {
    const name = toolName.toLowerCase();

    if (
      name.includes('document') ||
      name.includes('create') ||
      name.includes('update')
    ) {
      return LangChainToolCategory.DOCUMENT;
    }
    if (
      name.includes('search') ||
      name.includes('knowledge') ||
      name.includes('rag')
    ) {
      return LangChainToolCategory.RAG;
    }
    if (name.includes('asana')) {
      return LangChainToolCategory.ASANA;
    }
    if (
      name.includes('tavily') ||
      name.includes('weather') ||
      name.includes('calendar')
    ) {
      return LangChainToolCategory.EXTERNAL;
    }

    return LangChainToolCategory.UTILITY;
  }

  /**
   * Get priority by category
   */
  private getPriorityByCategory(category: LangChainToolCategory): number {
    switch (category) {
      case LangChainToolCategory.RAG:
        return 9;
      case LangChainToolCategory.DOCUMENT:
        return 8;
      case LangChainToolCategory.ASANA:
        return 7;
      case LangChainToolCategory.SEARCH:
        return 6;
      case LangChainToolCategory.EXTERNAL:
        return 5;
      case LangChainToolCategory.UTILITY:
        return 4;
      default:
        return 3;
    }
  }

  /**
   * Get category distribution for logging
   */
  private getCategoryDistribution(): Record<string, number> {
    const distribution: Record<string, number> = {};

    for (const metadata of this.toolMetadata.values()) {
      distribution[metadata.category] =
        (distribution[metadata.category] || 0) + 1;
    }

    return distribution;
  }

  /**
   * Get tool metadata
   */
  public getToolMetadata(toolName: string): LangChainToolMetadata | undefined {
    return this.toolMetadata.get(toolName);
  }

  /**
   * Get tools by category
   */
  public getToolsByCategory(category: LangChainToolCategory): any[] {
    return availableTools.filter((tool) => {
      const metadata = this.toolMetadata.get(tool.name);
      return metadata?.category === category;
    });
  }
}

/**
 * Convenience functions for tool operations
 */

/**
 * Create a LangChainToolService instance with default configuration
 */
export function createLangChainToolService(
  logger: RequestLogger,
  config?: LangChainToolConfig,
): LangChainToolService {
  return new LangChainToolService(logger, config);
}

/**
 * Quick tool selection utility
 */
export function selectLangChainTools(
  logger: RequestLogger,
  config: LangChainToolConfig,
): ToolSelectionResult {
  const service = createLangChainToolService(logger, config);
  return service.selectTools();
}
