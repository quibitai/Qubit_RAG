import { db } from '@/lib/db/client';
import { account } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { logger } from '@/lib/logger';

/**
 * Interface defining the requirements for token refresh operations
 */
export interface TokenRefreshConfig {
  provider: string;
  clientId: string;
  clientSecret: string;
  tokenEndpoint: string;
}

/**
 * Interface for token data
 */
export interface TokenData {
  access_token: string;
  refresh_token: string;
  expires_at: number | string | Date | null;
  token_type?: string;
  scope?: string;
}

/**
 * Options for token refresh operations
 */
export interface TokenRefreshOptions {
  forceRefresh?: boolean;
  expiryBufferMs?: number;
}

/**
 * TokenManager - A generic manager for OAuth token operations
 * Handles token refresh, caching, and validation
 */
export class TokenManager {
  private requestCache = new Map<string, Promise<TokenData>>();

  /**
   * Get provider-specific configuration
   * @param provider The OAuth provider name
   * @returns The provider configuration
   */
  private getProviderConfig(provider: string): TokenRefreshConfig {
    switch (provider.toLowerCase()) {
      case 'asana':
        return {
          provider: 'asana',
          clientId: process.env.ASANA_OAUTH_CLIENT_ID ?? '',
          clientSecret: process.env.ASANA_OAUTH_CLIENT_SECRET ?? '',
          tokenEndpoint: 'https://app.asana.com/-/oauth_token',
        };
      case 'google':
        return {
          provider: 'google',
          clientId: process.env.GOOGLE_CLIENT_ID ?? '',
          clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
          tokenEndpoint: 'https://oauth2.googleapis.com/token',
        };
      default:
        throw new Error(`Unsupported OAuth provider: ${provider}`);
    }
  }

  /**
   * Get or refresh a user's OAuth token
   * @param userId The user ID
   * @param provider The OAuth provider (e.g., 'asana', 'google')
   * @param options Token refresh options
   * @returns A promise that resolves to the token data
   */
  public async getToken(
    userId: string,
    provider: string,
    options: TokenRefreshOptions = {},
  ): Promise<TokenData> {
    const requestId = `token_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    // Add initial logging
    logger.debug('TokenManager', 'Starting token retrieval', {
      requestId,
      timestamp: new Date().toISOString(),
      userId,
      provider,
      options: JSON.stringify(options),
    });

    const cacheKey = `${userId}:${provider}`;

    // Check if this request is already in progress
    const existingRequest = this.requestCache.get(cacheKey);
    if (existingRequest) {
      logger.debug('TokenManager', 'Using cached token request', {
        requestId,
        userId,
        provider,
        timestamp: new Date().toISOString(),
      });
      return existingRequest;
    }

    // Create a new token request
    const tokenPromise = this.fetchToken(userId, provider, options);

    // Cache the promise to prevent duplicate requests
    this.requestCache.set(cacheKey, tokenPromise);

    // Remove from cache when resolved or rejected
    tokenPromise
      .then(() => {
        logger.debug('TokenManager', 'Token request completed successfully', {
          requestId,
          userId,
          provider,
          timestamp: new Date().toISOString(),
        });
        this.requestCache.delete(cacheKey);
      })
      .catch((error) => {
        logger.error('TokenManager', 'Token request failed', {
          requestId,
          userId,
          provider,
          error: error instanceof Error ? error.message : String(error),
          timestamp: new Date().toISOString(),
        });
        this.requestCache.delete(cacheKey);
      });

    return tokenPromise;
  }

  /**
   * Fetch a token for a user, refreshing if necessary
   * @param userId The user ID
   * @param provider The OAuth provider
   * @param options Token refresh options
   * @returns The token data
   */
  private async fetchToken(
    userId: string,
    provider: string,
    options: TokenRefreshOptions = {},
  ): Promise<TokenData> {
    const { forceRefresh = false, expiryBufferMs = 5 * 60 * 1000 } = options;
    const requestId = `token_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    logger.debug('TokenManager', 'Fetching token', {
      requestId,
      userId,
      provider,
      forceRefresh,
      expiryBufferMs,
    });

    // Get the user's account
    const userAccount = await db.query.account.findFirst({
      where: and(eq(account.userId, userId), eq(account.provider, provider)),
    });

    // Enhanced debugging for account lookup
    logger.debug('TokenManager', 'Account lookup result', {
      requestId,
      userId,
      provider,
      accountFound: !!userAccount,
      tableName: 'account',
      accountDetails: userAccount
        ? {
            id: userAccount.id,
            providerAccountId: userAccount.providerAccountId,
            hasAccessToken: !!userAccount.access_token,
            hasRefreshToken: !!userAccount.refresh_token,
            expiresAt: userAccount.expires_at,
            tokenType: userAccount.token_type,
            scope: userAccount.scope,
          }
        : null,
    });

    if (!userAccount) {
      // Additional debugging: Try a raw query to see what accounts exist
      try {
        const rawAccounts = await db.select().from(account).execute();
        logger.debug('TokenManager', 'Raw accounts in database', {
          requestId,
          count: rawAccounts.length,
          providers: rawAccounts.map((acc) => acc.provider).join(', '),
          sampleAccount:
            rawAccounts.length > 0
              ? {
                  id: rawAccounts[0].id,
                  provider: rawAccounts[0].provider,
                  userId: rawAccounts[0].userId,
                  hasAccessToken: !!rawAccounts[0].access_token,
                  hasRefreshToken: !!rawAccounts[0].refresh_token,
                }
              : null,
        });
      } catch (err) {
        logger.error('TokenManager', 'Error querying raw accounts', {
          requestId,
          error: err instanceof Error ? err.message : String(err),
        });
      }

      const error = `${provider} account not found for user`;
      logger.error('TokenManager', error, { requestId, userId, provider });
      throw new Error(error);
    }

    if (!userAccount.refresh_token) {
      const error = `No refresh token available for ${provider}`;
      logger.error('TokenManager', error, { requestId, userId, provider });
      throw new Error(error);
    }

    // Check if we need to refresh
    const tokenExpiry = userAccount.expires_at
      ? typeof userAccount.expires_at === 'bigint'
        ? Number(userAccount.expires_at)
        : new Date(userAccount.expires_at).getTime()
      : 0;
    const now = Date.now();

    logger.debug('TokenManager', 'Token expiry check', {
      requestId,
      userId,
      provider,
      tokenExpiry,
      now,
      timeUntilExpiry: tokenExpiry - now,
      needsRefresh:
        forceRefresh ||
        !userAccount.access_token ||
        tokenExpiry - now < expiryBufferMs,
    });

    if (
      forceRefresh ||
      !userAccount.access_token ||
      tokenExpiry - now < expiryBufferMs
    ) {
      logger.debug('TokenManager', 'Token needs refresh', {
        requestId,
        userId,
        provider,
        tokenExpiry,
        now,
        timeUntilExpiry: tokenExpiry - now,
        forceRefresh,
      });

      // Get provider configuration
      const config = this.getProviderConfig(provider);

      // Refresh the token
      const tokens = await this.refreshToken(
        userAccount.refresh_token,
        config,
        requestId,
      );

      // Update the account with new tokens
      await db
        .update(account)
        .set({
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token || userAccount.refresh_token,
          expires_at:
            typeof tokens.expires_at === 'number'
              ? BigInt(tokens.expires_at)
              : tokens.expires_at instanceof Date
                ? BigInt(tokens.expires_at.getTime())
                : userAccount.expires_at,
          token_type: tokens.token_type || userAccount.token_type,
          scope: tokens.scope || userAccount.scope,
        })
        .where(and(eq(account.userId, userId), eq(account.provider, provider)));

      logger.info('TokenManager', 'Successfully refreshed token', {
        requestId,
        userId,
        provider,
        newExpiry: tokens.expires_at,
      });

      return tokens;
    }

    // Return existing token
    logger.debug('TokenManager', 'Using existing token', {
      requestId,
      userId,
      provider,
      expiresIn: tokenExpiry - now,
    });

    return {
      access_token: userAccount.access_token,
      refresh_token: userAccount.refresh_token,
      expires_at:
        typeof userAccount.expires_at === 'bigint'
          ? Number(userAccount.expires_at)
          : userAccount.expires_at,
      token_type: userAccount.token_type || undefined,
      scope: userAccount.scope || undefined,
    };
  }

  /**
   * Refresh an OAuth token
   * @param refreshToken The refresh token
   * @param config The provider configuration
   * @param requestId The request ID for logging
   * @returns The new token data
   */
  private async refreshToken(
    refreshToken: string,
    config: TokenRefreshConfig,
    requestId: string,
  ): Promise<TokenData> {
    logger.debug('TokenManager', 'Refreshing token', {
      requestId,
      provider: config.provider,
    });

    // Prepare the token refresh request
    const params = new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: refreshToken,
    });

    // Make the token refresh request
    const response = await fetch(config.tokenEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      const error = `Token refresh failed: ${response.status} ${errorText}`;
      logger.error('TokenManager', error, {
        requestId,
        provider: config.provider,
        status: response.status,
      });
      throw new Error(error);
    }

    const tokens = await response.json();

    // Calculate expiry time if expires_in is provided
    let expiresAt = null;
    if (tokens.expires_in) {
      expiresAt = Date.now() + tokens.expires_in * 1000;
    }

    return {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token || refreshToken, // Some providers don't return a new refresh token
      expires_at: expiresAt,
      token_type: tokens.token_type,
      scope: tokens.scope,
    };
  }

  /**
   * Invalidate a token for a user
   * @param userId The user ID
   * @param provider The OAuth provider
   */
  public async invalidateToken(
    userId: string,
    provider: string,
  ): Promise<void> {
    const cacheKey = `${userId}:${provider}`;
    this.requestCache.delete(cacheKey);

    logger.debug('TokenManager', 'Token invalidated', {
      userId,
      provider,
    });
  }
}

// Create a singleton instance for use throughout the application
export const tokenManager = new TokenManager();
