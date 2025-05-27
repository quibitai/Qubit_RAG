/**
 * Tests for User-Friendly Error Handler
 */

import { describe, it, expect } from 'vitest';
import {
  analyzeAsanaError,
  formatUserFriendlyError,
  type UserFriendlyErrorResult,
} from '../recovery/userFriendlyErrorHandler';
import { AsanaIntegrationError } from '../utils/errorHandler';

describe('User-Friendly Error Handler', () => {
  describe('analyzeAsanaError', () => {
    it('should handle "Not a recognized ID" errors for tasks', () => {
      const error = new AsanaIntegrationError(
        'API responded with status 400',
        'PUT tasks/@1210394648960798',
        {
          errors: [
            {
              message: 'task: Not a recognized ID: @1210394648960798',
              help: 'For more information on API status codes and how to handle them, read the docs on errors: https://developers.asana.com/docs/errors',
            },
          ],
        },
      );

      const result = analyzeAsanaError(error, 'updating task', {
        task_id: '@1210394648960798',
      });

      expect(result.isUserError).toBe(true);
      expect(result.requiresUserInput).toBe(true);
      expect(result.userMessage).toContain(
        'I couldn\'t find the task "@1210394648960798"',
      );
      expect(result.suggestedAction).toContain('exact task name');
    });

    it('should handle "Not a Long" errors for parent tasks', () => {
      const error = new AsanaIntegrationError(
        'API responded with status 400',
        'POST tasks',
        {
          errors: [
            {
              message: 'parent: Not a Long: @1210394648960798',
              help: 'For more information on API status codes and how to handle them, read the docs on errors: https://developers.asana.com/docs/errors',
            },
          ],
        },
      );

      const result = analyzeAsanaError(error, 'creating subtask', {
        parent: '@1210394648960798',
      });

      expect(result.isUserError).toBe(true);
      expect(result.requiresUserInput).toBe(true);
      expect(result.userMessage).toContain(
        'I couldn\'t find the task "@1210394648960798"',
      );
      expect(result.suggestedAction).toContain('exact task name');
    });

    it('should handle "Not a Long" errors for projects', () => {
      const error = new AsanaIntegrationError(
        'API responded with status 400',
        'GET tasks',
        {
          errors: [
            {
              message: 'project: Not a Long: @1209859141336672',
              help: 'For more information on API status codes and how to handle them, read the docs on errors: https://developers.asana.com/docs/errors',
            },
          ],
        },
      );

      const result = analyzeAsanaError(error, 'listing tasks', {
        project: '@1209859141336672',
      });

      expect(result.isUserError).toBe(true);
      expect(result.requiresUserInput).toBe(true);
      expect(result.userMessage).toContain(
        'I couldn\'t find the project "@1209859141336672"',
      );
      expect(result.suggestedAction).toContain('exact project name');
    });

    it('should handle project not found errors', () => {
      const error = new AsanaIntegrationError(
        'API responded with status 400',
        'GET projects',
        {
          errors: [
            {
              message: 'project: Not a recognized ID: NonExistentProject',
            },
          ],
        },
      );

      const result = analyzeAsanaError(error, 'getting project details', {
        project_id: 'NonExistentProject',
      });

      expect(result.isUserError).toBe(true);
      expect(result.requiresUserInput).toBe(true);
      expect(result.userMessage).toContain(
        'I couldn\'t find the project "NonExistentProject"',
      );
      expect(result.suggestedAction).toContain('exact project name');
    });

    it('should handle assignee not found errors', () => {
      const error = new AsanaIntegrationError(
        'API responded with status 400',
        'POST tasks',
        {
          errors: [
            {
              message: 'assignee: Not a recognized ID: UnknownUser',
            },
          ],
        },
      );

      const result = analyzeAsanaError(error, 'creating task', {
        assignee: 'UnknownUser',
      });

      expect(result.isUserError).toBe(true);
      expect(result.requiresUserInput).toBe(true);
      expect(result.userMessage).toContain(
        'I couldn\'t find the user "UnknownUser"',
      );
      expect(result.suggestedAction).toContain(
        'full name as it appears in Asana',
      );
    });

    it('should handle invalid assignee format errors', () => {
      const error = new AsanaIntegrationError(
        'API responded with status 400',
        'POST tasks',
        {
          errors: [
            {
              message:
                'assignee: Not an email, GID, or "me": @1199522323334275',
            },
          ],
        },
      );

      const result = analyzeAsanaError(error, 'creating task', {
        assignee: '@1199522323334275',
      });

      expect(result.isUserError).toBe(true);
      expect(result.requiresUserInput).toBe(true);
      expect(result.userMessage).toContain(
        'There was an issue with the assignee format',
      );
      expect(result.suggestedAction).toContain(
        'full name as it appears in Asana',
      );
    });

    it('should handle missing required field errors', () => {
      const error = new AsanaIntegrationError(
        'API responded with status 400',
        'POST tasks',
        {
          errors: [
            {
              message: 'Missing required field: name',
            },
          ],
        },
      );

      const result = analyzeAsanaError(error, 'create task', {});

      expect(result.isUserError).toBe(true);
      expect(result.requiresUserInput).toBe(true);
      expect(result.userMessage).toContain(
        'To create task, I need you to specify the task or project name',
      );
    });

    it('should handle permission errors', () => {
      const error = new AsanaIntegrationError(
        'API responded with status 403',
        'GET tasks',
        {
          errors: [
            {
              message:
                'Forbidden: You do not have permission to access this resource',
            },
          ],
        },
      );

      const result = analyzeAsanaError(error, 'listing tasks', {});

      expect(result.isUserError).toBe(true);
      expect(result.requiresUserInput).toBe(false);
      expect(result.userMessage).toContain("I don't have permission");
    });

    it('should handle rate limit errors', () => {
      const error = new AsanaIntegrationError(
        'API responded with status 429',
        'GET tasks',
        {
          errors: [
            {
              message: 'Rate limit exceeded',
            },
          ],
        },
      );

      // Add status property as done in the API client
      (error as any).status = 429;

      const result = analyzeAsanaError(error, 'listing tasks', {});

      expect(result.isUserError).toBe(false);
      expect(result.requiresUserInput).toBe(false);
      expect(result.userMessage).toContain('rate limit');
      expect(result.suggestedAction).toContain('automatically retry');
    });

    it('should handle workspace access errors', () => {
      const error = new AsanaIntegrationError(
        'API responded with status 400',
        'GET workspaces',
        {
          errors: [
            {
              message: 'You do not have access to workspace 123456',
            },
          ],
        },
      );

      const result = analyzeAsanaError(error, 'listing projects', {
        workspace_id: '123456',
      });

      expect(result.isUserError).toBe(true);
      expect(result.requiresUserInput).toBe(true);
      expect(result.userMessage).toContain(
        "I don't have access to that workspace",
      );
      expect(result.suggestedAction).toContain('different workspace');
    });

    it('should handle unknown errors gracefully', () => {
      const error = new AsanaIntegrationError(
        'Some unexpected error',
        'GET tasks',
        {},
      );

      const result = analyzeAsanaError(error, 'listing tasks', {});

      expect(result.isUserError).toBe(false);
      expect(result.requiresUserInput).toBe(false);
      expect(result.userMessage).toContain('unexpected error');
    });

    it('should handle Asana API constraint errors', () => {
      const error = new AsanaIntegrationError(
        'API responded with status 400',
        'GET tasks',
        {
          errors: [
            {
              message:
                'Must specify exactly one of project, tag, section, user task list, or assignee + workspace',
              help: 'For more information on API status codes and how to handle them, read the docs on errors: https://developers.asana.com/docs/errors',
            },
          ],
        },
      );

      const result = analyzeAsanaError(error, 'listing tasks', {
        project: '1209859141336672',
        assignee: '1199602550925356',
      });

      expect(result.isUserError).toBe(false);
      expect(result.requiresUserInput).toBe(false);
      expect(result.userMessage).toContain(
        'I encountered an Asana API constraint',
      );
      expect(result.suggestedAction).toContain(
        'automatically retry with the appropriate filter',
      );
    });
  });

  describe('formatUserFriendlyError', () => {
    it('should format error with suggestion and user input required', () => {
      const errorResult: UserFriendlyErrorResult = {
        isUserError: true,
        userMessage: "I couldn't find that task.",
        suggestedAction: 'Please provide the exact task name.',
        requiresUserInput: true,
      };

      const formatted = formatUserFriendlyError(errorResult);

      expect(formatted).toContain("I couldn't find that task.");
      expect(formatted).toContain('💡 Please provide the exact task name.');
      expect(formatted).toContain(
        "Please let me know how you'd like to proceed!",
      );
    });

    it('should format error without suggestion', () => {
      const errorResult: UserFriendlyErrorResult = {
        isUserError: true,
        userMessage: 'Permission denied.',
        requiresUserInput: false,
      };

      const formatted = formatUserFriendlyError(errorResult);

      expect(formatted).toBe('Permission denied.');
      expect(formatted).not.toContain('💡');
      expect(formatted).not.toContain('Please let me know');
    });

    it('should format error with suggestion but no user input required', () => {
      const errorResult: UserFriendlyErrorResult = {
        isUserError: false,
        userMessage: 'Rate limit exceeded.',
        suggestedAction: "I'll retry automatically.",
        requiresUserInput: false,
      };

      const formatted = formatUserFriendlyError(errorResult);

      expect(formatted).toContain('Rate limit exceeded.');
      expect(formatted).toContain("💡 I'll retry automatically.");
      expect(formatted).not.toContain('Please let me know');
    });
  });
});
