import { logger } from '@/lib/logger';
import { tokenManager } from './tokenManager';

/**
 * Refresh the Asana OAuth token for a user
 * @param userId The ID of the user whose token needs to be refreshed
 * @returns Promise that resolves when the token is refreshed
 */
export async function refreshAsanaToken(userId: string): Promise<void> {
  const requestId = `refresh_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  logger.debug('TokenRefresh', 'Starting Asana token refresh for user:', {
    requestId,
    userId,
  });

  try {
    await tokenManager.getToken(userId, 'asana', { forceRefresh: true });

    logger.info('TokenRefresh', 'Successfully refreshed Asana token', {
      requestId,
      userId,
    });
  } catch (error) {
    logger.error('TokenRefresh', 'Failed to refresh Asana token:', {
      requestId,
      userId,
      error,
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}
