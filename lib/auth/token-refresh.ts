import { db } from '@/lib/db/client';
import { account } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { logger } from '@/lib/logger';

/**
 * Refresh the Asana OAuth token for a user
 * @param userId The ID of the user whose token needs to be refreshed
 * @returns Promise that resolves when the token is refreshed
 */
export async function refreshAsanaToken(userId: string): Promise<void> {
  const requestId = `refresh_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  logger.debug('TokenRefresh', 'Starting token refresh for user:', {
    requestId,
    userId,
  });

  try {
    // Get the user's Asana account
    const userAccount = await db.query.account.findFirst({
      where: and(eq(account.userId, userId), eq(account.provider, 'asana')),
    });

    if (!userAccount) {
      throw new Error('Asana account not found');
    }

    if (!userAccount.refresh_token) {
      throw new Error('No refresh token available');
    }

    // Prepare the token refresh request
    const tokenEndpoint = 'https://app.asana.com/-/oauth_token';
    const params = new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: process.env.ASANA_OAUTH_CLIENT_ID ?? '',
      client_secret: process.env.ASANA_OAUTH_CLIENT_SECRET ?? '',
      refresh_token: userAccount.refresh_token,
    });

    // Make the token refresh request
    const response = await fetch(tokenEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Token refresh failed: ${response.status} ${errorText}`);
    }

    const tokens = await response.json();

    // Update the account with new tokens
    await db
      .update(account)
      .set({
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expires_at: Date.now() + tokens.expires_in * 1000,
        token_type: tokens.token_type,
        scope: tokens.scope,
      })
      .where(and(eq(account.userId, userId), eq(account.provider, 'asana')));

    logger.info('TokenRefresh', 'Successfully refreshed Asana token', {
      requestId,
      userId,
    });
  } catch (error) {
    logger.error('TokenRefresh', 'Failed to refresh Asana token:', {
      requestId,
      userId,
      error,
    });
    throw error;
  }
}
