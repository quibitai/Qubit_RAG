import { tokenManager } from '../lib/auth/tokenManager';
import { logger } from '../lib/logger';

/**
 * Script to force refresh an Asana OAuth token
 */
async function forceRefreshAsanaToken() {
  const userId = '4b69adea-a46a-4701-acf1-f56723df868b'; // The user ID from extract-asana-token.ts

  logger.info('SCRIPT', '🚀 Starting forced token refresh for Asana');

  try {
    logger.info('SCRIPT', '🔄 Forcing token refresh');

    // Force refresh the token
    const tokenData = await tokenManager.getToken(userId, 'asana', {
      forceRefresh: true,
    });

    logger.info('SCRIPT', '✅ Token refreshed successfully', {
      hasAccessToken: !!tokenData.access_token,
      accessTokenLength: tokenData.access_token?.length || 0,
      expiresAt: tokenData.expires_at,
      tokenType: tokenData.token_type,
      scope: tokenData.scope,
    });

    // Display the new token for testing
    console.log('\n✅ Here is your refreshed Asana access token:');
    console.log('---------------------------------------');
    console.log(tokenData.access_token);
    console.log('---------------------------------------\n');
  } catch (error) {
    logger.error('SCRIPT', '❌ Error refreshing token', {
      error,
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    console.error(
      '❌ Error:',
      error instanceof Error ? error.message : String(error),
    );
  }
}

// Run the function
forceRefreshAsanaToken().catch(console.error);
