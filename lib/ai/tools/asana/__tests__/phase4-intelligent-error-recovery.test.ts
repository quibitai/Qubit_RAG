/**
 * Phase 4 Tests - Intelligent Error Recovery
 * Tests for sophisticated error handling, retry mechanisms, and user-friendly recovery
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Import Phase 4 components
import {
  IntelligentErrorRecovery,
  intelligentErrorRecovery,
  type ErrorContext,
  type RecoveryResult,
} from '../recovery/errorRecovery';
import {
  FallbackHandler,
  type FallbackResult,
} from '../recovery/fallbackHandler';

// Import test utilities
import { setupAsanaTestEnv, clearAsanaTestEnv } from './mocks/mockSetup';
import { AsanaIntegrationError } from '../utils/errorHandler';

describe('Phase 4 - Intelligent Error Recovery', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    setupAsanaTestEnv();

    // Clear recovery history between tests
    intelligentErrorRecovery.clearRecoveryHistory();
  });

  afterEach(() => {
    clearAsanaTestEnv();
    vi.clearAllMocks();
  });

  describe('IntelligentErrorRecovery', () => {
    let recovery: IntelligentErrorRecovery;

    beforeEach(() => {
      recovery = new IntelligentErrorRecovery({
        maxRetries: 3,
        baseDelayMs: 100, // Faster for testing
        maxDelayMs: 1000,
        retryableStatusCodes: [429, 500, 502, 503, 504],
        enableUserGuidance: true,
        contextualSuggestions: true,
      });
    });

    describe('Successful Operations', () => {
      it('should return success on first attempt', async () => {
        const mockOperation = vi.fn().mockResolvedValue('success');
        const context: ErrorContext = {
          operation: 'test_operation',
          parameters: { test: 'value' },
          requestId: 'test-123',
        };

        const result = await recovery.executeWithRecovery(
          mockOperation,
          context,
        );

        expect(result.success).toBe(true);
        expect(result.data).toBe('success');
        expect(result.attemptCount).toBe(1);
        expect(mockOperation).toHaveBeenCalledTimes(1);
      });

      it('should succeed after retries', async () => {
        const mockOperation = vi
          .fn()
          .mockRejectedValueOnce(new Error('Temporary failure'))
          .mockRejectedValueOnce(new Error('Another failure'))
          .mockResolvedValue('success');

        const context: ErrorContext = {
          operation: 'retry_test',
          parameters: {},
          requestId: 'retry-123',
        };

        const result = await recovery.executeWithRecovery(
          mockOperation,
          context,
        );

        expect(result.success).toBe(true);
        expect(result.data).toBe('success');
        expect(result.attemptCount).toBe(3);
        expect(mockOperation).toHaveBeenCalledTimes(3);
      });
    });

    describe('Retry Logic', () => {
      it('should retry on retryable HTTP status codes', async () => {
        const error = new AsanaIntegrationError(
          'Rate limited',
          'test',
          {},
          'test-123',
        );
        (error as any).status = 429;

        const mockOperation = vi
          .fn()
          .mockRejectedValueOnce(error)
          .mockResolvedValue('success');

        const context: ErrorContext = {
          operation: 'rate_limit_test',
          parameters: {},
          requestId: 'rate-123',
        };

        const result = await recovery.executeWithRecovery(
          mockOperation,
          context,
        );

        expect(result.success).toBe(true);
        expect(result.attemptCount).toBe(2);
      });

      it('should not retry on authentication errors', async () => {
        const error = new AsanaIntegrationError(
          'Unauthorized',
          'test',
          {},
          'test-123',
        );
        (error as any).status = 401;

        const mockOperation = vi.fn().mockRejectedValue(error);

        const context: ErrorContext = {
          operation: 'auth_test',
          parameters: {},
          requestId: 'auth-123',
        };

        const result = await recovery.executeWithRecovery(
          mockOperation,
          context,
        );

        expect(result.success).toBe(false);
        expect(result.attemptCount).toBe(1); // No retries
        expect(mockOperation).toHaveBeenCalledTimes(1);
      });

      it('should retry on network errors', async () => {
        const networkError = new Error('network timeout');
        const mockOperation = vi
          .fn()
          .mockRejectedValueOnce(networkError)
          .mockResolvedValue('success');

        const context: ErrorContext = {
          operation: 'network_test',
          parameters: {},
          requestId: 'network-123',
        };

        const result = await recovery.executeWithRecovery(
          mockOperation,
          context,
        );

        expect(result.success).toBe(true);
        expect(result.attemptCount).toBe(2);
      });

      it('should not retry on validation errors', async () => {
        const validationError = new Error('name is required');
        const mockOperation = vi.fn().mockRejectedValue(validationError);

        const context: ErrorContext = {
          operation: 'validation_test',
          parameters: {},
          requestId: 'validation-123',
        };

        const result = await recovery.executeWithRecovery(
          mockOperation,
          context,
        );

        expect(result.success).toBe(false);
        expect(result.attemptCount).toBe(1); // No retries
      });

      it('should respect max retry limit', async () => {
        const error = new Error('persistent failure');
        const mockOperation = vi.fn().mockRejectedValue(error);

        const context: ErrorContext = {
          operation: 'max_retry_test',
          parameters: {},
          requestId: 'max-retry-123',
        };

        const result = await recovery.executeWithRecovery(
          mockOperation,
          context,
        );

        expect(result.success).toBe(false);
        expect(result.attemptCount).toBe(3); // Max retries
        expect(mockOperation).toHaveBeenCalledTimes(3);
      });
    });

    describe('Recovery Strategy Determination', () => {
      it('should suggest user guidance for authentication errors', async () => {
        const error = new AsanaIntegrationError(
          'Unauthorized',
          'test',
          {},
          'test-123',
        );
        (error as any).status = 401;

        const mockOperation = vi.fn().mockRejectedValue(error);
        const context: ErrorContext = {
          operation: 'create_task',
          parameters: { name: 'Test Task' },
          requestId: 'auth-strategy-123',
        };

        const result = await recovery.executeWithRecovery(
          mockOperation,
          context,
        );

        expect(result.success).toBe(false);
        expect(result.recoveryStrategy).toBe('user_guidance');
        expect(result.userGuidance).toContain('Authentication Required');
        expect(result.userGuidance).toContain('access token');
      });

      it('should suggest alternative approach for not found errors', async () => {
        const error = new AsanaIntegrationError(
          'Not Found',
          'test',
          {},
          'test-123',
        );
        (error as any).status = 404;

        const mockOperation = vi.fn().mockRejectedValue(error);
        const context: ErrorContext = {
          operation: 'get_task_details',
          parameters: { task_name: 'Missing Task' },
          requestId: 'not-found-123',
        };

        const result = await recovery.executeWithRecovery(
          mockOperation,
          context,
        );

        expect(result.success).toBe(false);
        expect(result.recoveryStrategy).toBe('alternative_approach');
        expect(result.userGuidance).toContain('Resource Not Found');
        expect(result.alternativeActions).toContain(
          'Search for similar items using partial names',
        );
      });

      it('should suggest retry for rate limiting', async () => {
        const error = new AsanaIntegrationError(
          'Rate Limited',
          'test',
          {},
          'test-123',
        );
        (error as any).status = 429;

        const mockOperation = vi.fn().mockRejectedValue(error);
        const context: ErrorContext = {
          operation: 'list_tasks',
          parameters: {},
          requestId: 'rate-limit-123',
        };

        const result = await recovery.executeWithRecovery(
          mockOperation,
          context,
        );

        expect(result.success).toBe(false);
        expect(result.recoveryStrategy).toBe('retry');
        expect(result.userGuidance).toContain('Rate Limit Exceeded');
        expect(result.alternativeActions).toContain(
          'Wait 1-2 minutes before trying again',
        );
      });

      it('should suggest fallback for server errors', async () => {
        const error = new AsanaIntegrationError(
          'Internal Server Error',
          'test',
          {},
          'test-123',
        );
        (error as any).status = 500;

        const mockOperation = vi.fn().mockRejectedValue(error);
        const context: ErrorContext = {
          operation: 'update_task',
          parameters: { notes: 'Updated notes' },
          requestId: 'server-error-123',
        };

        const result = await recovery.executeWithRecovery(
          mockOperation,
          context,
        );

        expect(result.success).toBe(false);
        expect(result.recoveryStrategy).toBe('fallback');
        expect(result.userGuidance).toContain(
          'Service Temporarily Unavailable',
        );
      });
    });

    describe('User Guidance Generation', () => {
      it('should provide contextual guidance for permission errors', async () => {
        const error = new AsanaIntegrationError(
          'Forbidden',
          'test',
          {},
          'test-123',
        );
        (error as any).status = 403;

        const mockOperation = vi.fn().mockRejectedValue(error);
        const context: ErrorContext = {
          operation: 'create_project',
          parameters: { name: 'New Project' },
          requestId: 'permission-123',
        };

        const result = await recovery.executeWithRecovery(
          mockOperation,
          context,
        );

        expect(result.userGuidance).toContain('Permission Denied');
        expect(result.userGuidance).toContain('create project');
        expect(result.userGuidance).toContain('necessary permissions');
      });

      it('should provide timeout-specific guidance', async () => {
        const timeoutError = new Error('Request timeout after 30000ms');
        const mockOperation = vi.fn().mockRejectedValue(timeoutError);

        const context: ErrorContext = {
          operation: 'list_tasks',
          parameters: {},
          requestId: 'timeout-123',
        };

        const result = await recovery.executeWithRecovery(
          mockOperation,
          context,
        );

        expect(result.userGuidance).toContain('Connection Timeout');
        expect(result.userGuidance).toContain('list tasks');
        expect(result.userGuidance).toContain('internet connection');
      });

      it('should provide validation-specific guidance', async () => {
        const validationError = new Error('Task name is required');
        const mockOperation = vi.fn().mockRejectedValue(validationError);

        const context: ErrorContext = {
          operation: 'create_task',
          parameters: {},
          requestId: 'validation-123',
        };

        const result = await recovery.executeWithRecovery(
          mockOperation,
          context,
        );

        expect(result.userGuidance).toContain('Missing Required Information');
        expect(result.userGuidance).toContain('create task');
        expect(result.userGuidance).toContain('mandatory fields');
      });
    });

    describe('Alternative Actions', () => {
      it('should suggest operation-specific alternatives for task creation', async () => {
        const error = new Error('Task creation failed');
        const mockOperation = vi.fn().mockRejectedValue(error);

        const context: ErrorContext = {
          operation: 'create_task',
          parameters: { name: 'Test Task' },
          requestId: 'create-alt-123',
        };

        const result = await recovery.executeWithRecovery(
          mockOperation,
          context,
        );

        expect(result.alternativeActions).toContain(
          'Try creating the task in a different project',
        );
        expect(result.alternativeActions).toContain(
          'Simplify the task details and add more information later',
        );
      });

      it('should suggest operation-specific alternatives for task updates', async () => {
        const error = new Error('Update failed');
        const mockOperation = vi.fn().mockRejectedValue(error);

        const context: ErrorContext = {
          operation: 'update_task',
          parameters: { notes: 'New notes' },
          requestId: 'update-alt-123',
        };

        const result = await recovery.executeWithRecovery(
          mockOperation,
          context,
        );

        expect(result.alternativeActions).toContain(
          'Try updating individual fields separately',
        );
        expect(result.alternativeActions).toContain(
          'Check if the task still exists',
        );
      });
    });

    describe('Recovery Statistics', () => {
      it('should track recovery attempts', async () => {
        const error = new Error('Test error');
        const mockOperation = vi.fn().mockRejectedValue(error);

        const context: ErrorContext = {
          operation: 'test_operation',
          parameters: {},
          requestId: 'stats-123',
        };

        await recovery.executeWithRecovery(mockOperation, context);
        await recovery.executeWithRecovery(mockOperation, context);

        const stats = recovery.getRecoveryStats();
        expect(stats.totalRecoveryAttempts).toBe(2);
        expect(stats.uniqueErrorTypes).toBe(1);
      });

      it('should clear recovery history', () => {
        recovery.clearRecoveryHistory();
        const stats = recovery.getRecoveryStats();
        expect(stats.totalRecoveryAttempts).toBe(0);
        expect(stats.uniqueErrorTypes).toBe(0);
      });
    });
  });

  describe('FallbackHandler', () => {
    let fallbackHandler: FallbackHandler;
    let mockClient: any;

    beforeEach(() => {
      mockClient = {
        createResource: vi.fn(),
        updateResource: vi.fn(),
        request: vi.fn(),
      };

      fallbackHandler = new FallbackHandler(mockClient, {
        enableSimplifiedOperations: true,
        enableOfflineMode: false,
        enableAlternativeApproaches: true,
        maxFallbackAttempts: 2,
      });
    });

    describe('Task Creation Fallback', () => {
      it('should attempt simplified task creation', async () => {
        const originalParams = {
          name: 'Test Task',
          workspace: 'workspace123',
          notes: 'Detailed notes',
          assignee: 'user123',
          due_on: '2024-12-31',
        };

        const originalError = new Error('Complex creation failed');

        mockClient.createResource.mockResolvedValue({
          gid: 'task123',
          name: 'Test Task',
        });

        const result = await fallbackHandler.fallbackCreateTask(
          originalParams,
          originalError,
          'fallback-123',
        );

        expect(result.success).toBe(true);
        expect(result.fallbackUsed).toBe(true);
        expect(result.fallbackType).toBe('simplified_operation');
        expect(result.limitations).toContain(
          'Task created with basic information only',
        );
        expect(result.userMessage).toContain('Task Created Successfully');

        expect(mockClient.createResource).toHaveBeenCalledWith(
          'tasks',
          {
            name: 'Test Task',
            workspace: 'workspace123',
          },
          'fallback-123',
        );
      });

      it('should provide manual guidance when simplified creation fails', async () => {
        const originalParams = {
          name: 'Test Task',
          workspace: 'workspace123',
        };

        const originalError = new Error('Creation failed');
        mockClient.createResource.mockRejectedValue(
          new Error('Simplified creation also failed'),
        );

        const result = await fallbackHandler.fallbackCreateTask(
          originalParams,
          originalError,
          'manual-123',
        );

        expect(result.success).toBe(false);
        expect(result.fallbackUsed).toBe(true);
        expect(result.fallbackType).toBe('manual_guidance');
        expect(result.userMessage).toContain('Task Creation Failed');
        expect(result.userMessage).toContain('Manual Steps');
        expect(result.userMessage).toContain('Test Task');
      });
    });

    describe('Task Update Fallback', () => {
      it('should attempt individual field updates', async () => {
        const updateParams = {
          notes: 'Updated notes',
          completed: true,
          due_on: '2024-12-31',
        };

        const originalError = new Error('Bulk update failed');

        mockClient.updateResource
          .mockResolvedValueOnce({ gid: 'task123', notes: 'Updated notes' })
          .mockRejectedValueOnce(new Error('Completed update failed'))
          .mockResolvedValueOnce({ gid: 'task123', due_on: '2024-12-31' });

        const result = await fallbackHandler.fallbackUpdateTask(
          'task123',
          updateParams,
          originalError,
          'update-fallback-123',
        );

        expect(result.success).toBe(true);
        expect(result.fallbackUsed).toBe(true);
        expect(result.fallbackType).toBe('partial_success');
        expect(result.limitations).toContain('Could not update: completed');
        expect(result.userMessage).toContain('2 field(s) updated successfully');
        expect(result.userMessage).toContain('Could not update: completed');

        expect(mockClient.updateResource).toHaveBeenCalledTimes(3);
      });

      it('should provide manual guidance when all field updates fail', async () => {
        const updateParams = {
          notes: 'Updated notes',
        };

        const originalError = new Error('Update failed');
        mockClient.updateResource.mockRejectedValue(
          new Error('Field update failed'),
        );

        const result = await fallbackHandler.fallbackUpdateTask(
          'task123',
          updateParams,
          originalError,
          'manual-update-123',
        );

        expect(result.success).toBe(false);
        expect(result.fallbackUsed).toBe(true);
        expect(result.fallbackType).toBe('manual_guidance');
        expect(result.userMessage).toContain('Task Update Failed');
        expect(result.userMessage).toContain('Manual Steps');
      });
    });

    describe('Task Listing Fallback', () => {
      it('should return cached data when available', async () => {
        const originalParams = { workspace: 'workspace123' };
        const cachedData = [{ gid: 'task1', name: 'Cached Task' }];

        // Set up cache
        (fallbackHandler as any).setCachedData(
          `tasks:${JSON.stringify(originalParams)}`,
          cachedData,
        );

        const result = await fallbackHandler.fallbackListTasks(
          originalParams,
          new Error('API failed'),
          'cache-123',
        );

        expect(result.success).toBe(true);
        expect(result.fallbackUsed).toBe(true);
        expect(result.fallbackType).toBe('cached_data');
        expect(result.data).toEqual(cachedData);
        expect(result.limitations).toContain('Data may be up to 5 minutes old');
      });

      it('should attempt simplified listing when no cache available', async () => {
        const originalParams = { workspace: 'workspace123' };
        const simplifiedData = [{ gid: 'task1', name: 'Simple Task' }];

        vi.doMock('../config', () => ({
          getWorkspaceGid: () => 'workspace123',
        }));

        mockClient.request.mockResolvedValue(simplifiedData);

        const result = await fallbackHandler.fallbackListTasks(
          originalParams,
          new Error('Complex listing failed'),
          'simple-123',
        );

        expect(result.success).toBe(true);
        expect(result.fallbackUsed).toBe(true);
        expect(result.fallbackType).toBe('simplified_operation');
        expect(result.data).toEqual(simplifiedData);
        expect(result.limitations).toContain('Limited task information shown');
      });
    });

    describe('Cache Management', () => {
      it('should cache and retrieve data correctly', () => {
        const testData = { test: 'data' };
        const cacheKey = 'test:key';

        (fallbackHandler as any).setCachedData(cacheKey, testData);
        const retrieved = (fallbackHandler as any).getCachedData(cacheKey);

        expect(retrieved).toEqual(testData);
      });

      it('should return null for expired cache', async () => {
        const testData = { test: 'data' };
        const cacheKey = 'test:expired';

        // Create a handler and set cache data
        const shortTtlHandler = new FallbackHandler(mockClient);
        (shortTtlHandler as any).setCachedData(cacheKey, testData);

        // Manually expire the cache by modifying the timestamp to be older than CACHE_TTL (5 minutes)
        const cache = (shortTtlHandler as any).cache;
        const entry = cache.get(cacheKey);
        if (entry) {
          entry.timestamp = Date.now() - 6 * 60 * 1000; // 6 minutes ago (older than 5 minute TTL)
        }

        const retrieved = (shortTtlHandler as any).getCachedData(cacheKey);
        expect(retrieved).toBeNull();
      });

      it('should clear cache', () => {
        (fallbackHandler as any).setCachedData('key1', 'data1');
        (fallbackHandler as any).setCachedData('key2', 'data2');

        fallbackHandler.clearCache();

        const stats = fallbackHandler.getCacheStats();
        expect(stats.totalEntries).toBe(0);
        expect(stats.totalSize).toBe(0);
      });

      it('should provide cache statistics', () => {
        (fallbackHandler as any).setCachedData('key1', { data: 'test1' });
        (fallbackHandler as any).setCachedData('key2', { data: 'test2' });

        const stats = fallbackHandler.getCacheStats();
        expect(stats.totalEntries).toBe(2);
        expect(stats.totalSize).toBeGreaterThan(0);
      });
    });
  });
});
