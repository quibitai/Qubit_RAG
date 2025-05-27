/**
 * Fallback Handler
 *
 * Provides graceful degradation and alternative approaches when primary
 * Asana operations fail, ensuring the user can still accomplish their goals.
 */

import type { AsanaApiClient } from '../api-client/client';
import { getWorkspaceGid } from '../config';

export interface FallbackOptions {
  enableSimplifiedOperations: boolean;
  enableOfflineMode: boolean;
  enableAlternativeApproaches: boolean;
  maxFallbackAttempts: number;
}

export interface FallbackResult<T> {
  success: boolean;
  data?: T;
  fallbackUsed: boolean;
  fallbackType?: string;
  limitations?: string[];
  userMessage?: string;
}

export type FallbackType =
  | 'simplified_operation'
  | 'alternative_endpoint'
  | 'cached_data'
  | 'manual_guidance'
  | 'partial_success';

export class FallbackHandler {
  private config: FallbackOptions;
  private cache: Map<string, { data: any; timestamp: number }> = new Map();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  constructor(
    private client: AsanaApiClient,
    config: Partial<FallbackOptions> = {},
  ) {
    this.config = {
      enableSimplifiedOperations: true,
      enableOfflineMode: false,
      enableAlternativeApproaches: true,
      maxFallbackAttempts: 2,
      ...config,
    };
  }

  /**
   * Attempt fallback for task creation
   */
  async fallbackCreateTask(
    originalParams: any,
    originalError: Error,
    requestId?: string,
  ): Promise<FallbackResult<any>> {
    console.log(
      `[FallbackHandler] [${requestId}] Attempting task creation fallback`,
    );

    // Try simplified task creation
    if (this.config.enableSimplifiedOperations) {
      try {
        const simplifiedParams = {
          name: originalParams.name,
          workspace: originalParams.workspace,
          // Remove optional fields that might be causing issues
        };

        const result = await this.client.createResource(
          'tasks',
          simplifiedParams,
          requestId,
        );

        return {
          success: true,
          data: result,
          fallbackUsed: true,
          fallbackType: 'simplified_operation',
          limitations: [
            'Task created with basic information only',
            'Additional details can be added separately',
          ],
          userMessage: `✅ **Task Created Successfully** (Simplified Mode)\n\nYour task "${originalParams.name}" has been created with basic information. You can add more details like due dates, assignees, and notes separately.`,
        };
      } catch (fallbackError) {
        console.log(
          `[FallbackHandler] [${requestId}] Simplified creation failed:`,
          fallbackError,
        );
      }
    }

    // Provide manual guidance as last resort
    return {
      success: false,
      fallbackUsed: true,
      fallbackType: 'manual_guidance',
      userMessage: `❌ **Task Creation Failed**\n\nI couldn't create the task "${originalParams.name}" automatically. Here's what you can do:\n\n**Manual Steps:**\n1. Open Asana in your browser\n2. Navigate to the appropriate project\n3. Click "Add Task" and enter: "${originalParams.name}"\n4. Add any additional details as needed\n\n**Alternative:** Try creating a simpler task first, then add details later.`,
    };
  }

  /**
   * Attempt fallback for task listing
   */
  async fallbackListTasks(
    originalParams: any,
    originalError: Error,
    requestId?: string,
  ): Promise<FallbackResult<any>> {
    console.log(
      `[FallbackHandler] [${requestId}] Attempting task listing fallback`,
    );

    // Try cached data first
    const cacheKey = `tasks:${JSON.stringify(originalParams)}`;
    const cached = this.getCachedData(cacheKey);
    if (cached) {
      return {
        success: true,
        data: cached,
        fallbackUsed: true,
        fallbackType: 'cached_data',
        limitations: ['Data may be up to 5 minutes old'],
        userMessage: `📋 **Task List Retrieved** (Cached Data)\n\nShowing recently cached task data. Some information may be slightly outdated.`,
      };
    }

    // Try simplified listing without filters
    if (this.config.enableSimplifiedOperations) {
      try {
        const workspaceGid = getWorkspaceGid();
        if (workspaceGid) {
          const simplifiedParams = {
            workspace: workspaceGid,
            opt_fields: ['name', 'gid'], // Minimal fields
          };

          const result = await this.client.request(
            'tasks',
            'GET',
            undefined,
            simplifiedParams,
            requestId,
          );

          // Cache the result
          this.setCachedData(cacheKey, result);

          return {
            success: true,
            data: result,
            fallbackUsed: true,
            fallbackType: 'simplified_operation',
            limitations: [
              'Limited task information shown',
              'Some filters may not be applied',
            ],
            userMessage: `📋 **Task List Retrieved** (Simplified Mode)\n\nShowing basic task information. For detailed task data, try again when the connection is more stable.`,
          };
        }
      } catch (fallbackError) {
        console.log(
          `[FallbackHandler] [${requestId}] Simplified listing failed:`,
          fallbackError,
        );
      }
    }

    // Provide guidance for manual task viewing
    return {
      success: false,
      fallbackUsed: true,
      fallbackType: 'manual_guidance',
      userMessage: `❌ **Task Listing Failed**\n\nI couldn't retrieve your tasks automatically. Here are some alternatives:\n\n**Manual Options:**\n1. Open Asana in your browser to view tasks\n2. Check specific projects for task lists\n3. Use Asana's mobile app if available\n\n**Try Again:** The issue might be temporary - try again in a few minutes.`,
    };
  }

  /**
   * Attempt fallback for task updates
   */
  async fallbackUpdateTask(
    taskGid: string,
    updateParams: any,
    originalError: Error,
    requestId?: string,
  ): Promise<FallbackResult<any>> {
    console.log(
      `[FallbackHandler] [${requestId}] Attempting task update fallback`,
    );

    // Try updating individual fields separately
    if (
      this.config.enableSimplifiedOperations &&
      Object.keys(updateParams).length > 1
    ) {
      const results: any[] = [];
      const failures: string[] = [];

      for (const [field, value] of Object.entries(updateParams)) {
        try {
          const singleFieldUpdate = { [field]: value };
          const result = await this.client.updateResource(
            'tasks',
            taskGid,
            singleFieldUpdate,
            requestId,
          );
          results.push({ field, success: true, result });
        } catch (fieldError) {
          failures.push(field);
          console.log(
            `[FallbackHandler] [${requestId}] Failed to update ${field}:`,
            fieldError,
          );
        }
      }

      if (results.length > 0) {
        return {
          success: true,
          data: results[results.length - 1].result, // Return last successful update
          fallbackUsed: true,
          fallbackType: 'partial_success',
          limitations:
            failures.length > 0
              ? [`Could not update: ${failures.join(', ')}`]
              : [],
          userMessage: `✅ **Task Updated** (Partial Success)\n\n${results.length} field(s) updated successfully.${failures.length > 0 ? `\n\n⚠️ Could not update: ${failures.join(', ')}. Try updating these fields separately.` : ''}`,
        };
      }
    }

    // Provide manual guidance
    return {
      success: false,
      fallbackUsed: true,
      fallbackType: 'manual_guidance',
      userMessage: `❌ **Task Update Failed**\n\nI couldn't update the task automatically. Here's what you can do:\n\n**Manual Steps:**\n1. Open the task in Asana\n2. Make the changes directly in the interface\n3. Save your changes\n\n**Alternative:** Try updating one field at a time instead of multiple fields together.`,
    };
  }

  /**
   * Attempt fallback for project operations
   */
  async fallbackProjectOperation(
    operation: string,
    params: any,
    originalError: Error,
    requestId?: string,
  ): Promise<FallbackResult<any>> {
    console.log(
      `[FallbackHandler] [${requestId}] Attempting project operation fallback: ${operation}`,
    );

    // Try cached data for read operations
    if (operation.includes('list') || operation.includes('get')) {
      const cacheKey = `projects:${operation}:${JSON.stringify(params)}`;
      const cached = this.getCachedData(cacheKey);
      if (cached) {
        return {
          success: true,
          data: cached,
          fallbackUsed: true,
          fallbackType: 'cached_data',
          limitations: ['Data may be up to 5 minutes old'],
          userMessage: `📁 **Project Information Retrieved** (Cached Data)\n\nShowing recently cached project data.`,
        };
      }
    }

    // Provide operation-specific guidance
    let guidance = '';
    switch (operation) {
      case 'create_project':
        guidance = `❌ **Project Creation Failed**\n\nI couldn't create the project automatically. Try:\n\n1. Creating the project directly in Asana\n2. Using a simpler project name\n3. Checking your workspace permissions`;
        break;
      case 'list_projects':
        guidance = `❌ **Project Listing Failed**\n\nI couldn't retrieve your projects. Try:\n\n1. Opening Asana in your browser\n2. Checking your workspace access\n3. Trying again in a few minutes`;
        break;
      default:
        guidance = `❌ **Project Operation Failed**\n\nThe ${operation} operation couldn't be completed automatically. Please try the operation manually in Asana.`;
    }

    return {
      success: false,
      fallbackUsed: true,
      fallbackType: 'manual_guidance',
      userMessage: guidance,
    };
  }

  /**
   * Get cached data if available and not expired
   */
  private getCachedData(key: string): any | null {
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      return cached.data;
    }
    if (cached) {
      this.cache.delete(key); // Remove expired cache
    }
    return null;
  }

  /**
   * Set cached data with timestamp
   */
  private setCachedData(key: string, data: any): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
    });
  }

  /**
   * Clear all cached data
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { totalEntries: number; totalSize: number } {
    let totalSize = 0;
    for (const entry of this.cache.values()) {
      totalSize += JSON.stringify(entry.data).length;
    }

    return {
      totalEntries: this.cache.size,
      totalSize,
    };
  }
}
