import type { OAuthConfig, OAuthUserConfig } from 'next-auth/providers';
import { logger } from '@/lib/logger';

/**
 * Represents the tokens returned by the OAuth provider
 */
interface TokenSet {
  access_token?: string;
  token_type?: string;
  id_token?: string;
  refresh_token?: string;
  scope?: string;
  expires_in?: number;
  expires_at?: number;
}

/**
 * Asana OAuth provider configuration
 */
export interface AsanaProfile extends Record<string, any> {
  data: {
    gid: string;
    email: string;
    name: string;
  };
}

/**
 * Custom Asana OAuth configuration
 */
export interface AsanaOAuthConfig
  extends Omit<
    OAuthConfig<AsanaProfile>,
    'accessTokenUrl' | 'authorizationUrl' | 'profileUrl' | 'scope' | 'userinfo'
  > {
  accessTokenUrl?: string;
  authorizationUrl?: string;
  profileUrl?: string;
  scope?: string;
  userinfo?: {
    url: string;
    params: Record<string, string>;
  };
}

/**
 * Create a custom Asana OAuth provider for NextAuth.js
 */
export default function Asana<P extends AsanaProfile>(
  options: OAuthUserConfig<P>,
): OAuthConfig<P> {
  logger.debug('AsanaProvider', 'Creating Asana Provider', {
    clientId: !!options.clientId,
    hasClientSecret: !!options.clientSecret,
    requestedScopes: process.env.ASANA_OAUTH_SCOPES,
  });

  return {
    id: 'asana',
    name: 'Asana',
    type: 'oauth',
    // Override Asana provider with correct issuer
    issuer: 'https://app.asana.com/api/1.0',
    authorization: {
      url: 'https://app.asana.com/oauth2/authorize',
      params: {
        scope: process.env.ASANA_OAUTH_SCOPES || '',
        response_type: 'code',
        approval_prompt: 'auto',
      },
    },
    token: {
      url: 'https://app.asana.com/oauth2/token',
      async request({
        params,
        provider,
        tokens,
      }: {
        params: Record<string, any>;
        provider: OAuthConfig<P>;
        tokens: TokenSet | null;
      }) {
        try {
          // Log the parameters and tokens received
          logger.debug('AsanaProvider', 'Token request', {
            params,
            hasRefreshToken: !!params.refresh_token,
            hasPreviousToken: !!tokens,
            providerTokenUrl: provider.token?.url,
          });

          // Make the token request
          const response = await fetch(provider.token?.url as string, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
              Accept: 'application/json',
            },
            body: new URLSearchParams({
              client_id: provider.clientId as string,
              client_secret: provider.clientSecret as string,
              ...params,
            }),
          });

          // Log raw response for debugging
          const responseText = await response.text();
          let resBody: Record<string, any>;
          try {
            resBody = JSON.parse(responseText);
            logger.debug('AsanaProvider', 'Raw OAuth response body', {
              responseTextLength: responseText.length,
              responseFields: Object.keys(resBody),
              hasAccessToken: !!resBody.access_token,
              hasRefreshToken: !!resBody.refresh_token,
              hasIdToken: !!resBody.id_token,
            });
          } catch (e) {
            logger.error('AsanaProvider', 'Failed to parse token response', {
              error: e instanceof Error ? e.message : String(e),
              responseText:
                responseText.substring(0, 200) +
                (responseText.length > 200 ? '...' : ''),
            });
            throw new Error(`Failed to parse token response: ${e}`);
          }

          // Check if response contains access_token as a field
          if (!resBody.access_token) {
            logger.error('AsanaProvider', 'No access_token in OAuth response', {
              responseFields: Object.keys(resBody),
            });
            throw new Error('No access_token in OAuth response');
          }

          // Check if the access_token appears to be a JWT
          const isJwt =
            resBody.access_token?.includes('.') &&
            resBody.access_token?.split('.').length === 3;

          // Store the original token
          const originalAccessToken = resBody.access_token;
          let realAccessToken = originalAccessToken;

          // NEW: If we have a JWT token and a refresh token, immediately perform a token refresh
          // to get an opaque token suitable for MCP
          if (isJwt && resBody.refresh_token) {
            logger.info(
              'AsanaProvider',
              'Detected JWT access_token. Performing immediate token refresh to get opaque token for MCP',
              {
                accessTokenIsJwt: isJwt,
                hasRefreshToken: !!resBody.refresh_token,
              },
            );

            try {
              // Prepare and execute token refresh request
              const refreshParams = new URLSearchParams({
                grant_type: 'refresh_token',
                client_id: provider.clientId as string,
                client_secret: provider.clientSecret as string,
                refresh_token: resBody.refresh_token,
              });

              // Get the token endpoint from environment or use default
              const tokenEndpoint =
                process.env.ASANA_OAUTH_TOKEN_URL ||
                'https://app.asana.com/-/oauth_token';
              logger.debug(
                'AsanaProvider',
                'Refreshing token to get opaque token',
                {
                  tokenEndpoint,
                },
              );

              const refreshResponse = await fetch(tokenEndpoint, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/x-www-form-urlencoded',
                  Accept: 'application/json',
                },
                body: refreshParams.toString(),
              });

              if (refreshResponse.ok) {
                const refreshData = await refreshResponse.json();

                // Check if the refreshed token is an opaque token (not a JWT)
                const isRefreshedTokenJwt =
                  refreshData.access_token?.includes('.') &&
                  refreshData.access_token?.split('.').length === 3;

                if (!isRefreshedTokenJwt && refreshData.access_token) {
                  logger.info(
                    'AsanaProvider',
                    'Successfully obtained opaque token via refresh',
                    {
                      tokenIsOpaque: !isRefreshedTokenJwt,
                    },
                  );

                  // Use the opaque token from refresh as our primary token for MCP compatibility
                  realAccessToken = refreshData.access_token;

                  // Update refresh token if a new one was provided
                  if (refreshData.refresh_token) {
                    resBody.refresh_token = refreshData.refresh_token;
                  }

                  // Update expires_in if provided
                  if (refreshData.expires_in) {
                    resBody.expires_in = refreshData.expires_in;
                  }
                } else {
                  logger.warn(
                    'AsanaProvider',
                    'Refresh response did not contain an opaque token',
                    {
                      hasAccessToken: !!refreshData.access_token,
                      isRefreshedTokenJwt,
                    },
                  );
                }
              } else {
                // Log error but continue with original token if refresh fails
                const errorText = await refreshResponse.text();
                logger.error(
                  'AsanaProvider',
                  'Token refresh failed, falling back to original token',
                  {
                    status: refreshResponse.status,
                    error: errorText,
                  },
                );
              }
            } catch (e) {
              logger.error('AsanaProvider', 'Error during token refresh', {
                error: e instanceof Error ? e.message : String(e),
              });
              // Continue with original token if refresh fails
            }
          } else if (isJwt) {
            // If JWT but no refresh token, log warning but continue
            logger.warn(
              'AsanaProvider',
              'Received JWT as access_token but no refresh_token to get opaque token',
            );
          }

          // Fall back to existing token extraction logic if we still have a JWT
          if (isJwtToken(realAccessToken)) {
            logger.info(
              'AsanaProvider',
              'Still working with JWT token, trying extraction methods',
            );

            // Strategy 1: Check if we have a direct token field from Asana that's not a JWT
            // Sometimes Asana returns non-JWT tokens in other fields
            const possibleTokenFields = [
              'token',
              'raw_token',
              'api_token',
              'opaque_token',
            ];

            for (const field of possibleTokenFields) {
              if (resBody[field] && !isJwtToken(resBody[field])) {
                logger.info(
                  'AsanaProvider',
                  `Found non-JWT token in ${field} field`,
                );
                realAccessToken = resBody[field];
                break;
              }
            }

            // Strategy 2: Try to extract a real token from the JWT payload
            if (isJwtToken(realAccessToken)) {
              try {
                // Try to extract data from the JWT payload
                const payload = JSON.parse(
                  Buffer.from(
                    originalAccessToken.split('.')[1],
                    'base64',
                  ).toString(),
                );

                logger.debug('AsanaProvider', 'JWT payload contents', {
                  payloadKeys: Object.keys(payload),
                });

                // Try to find a real token in various expected payload locations
                const possiblePayloadTokenFields = [
                  'real_access_token',
                  'raw_token',
                  'opaque_token',
                  'api_token',
                  'refresh_token', // Try the embedded refresh_token
                ];
                for (const field of possiblePayloadTokenFields) {
                  if (payload[field] && !isJwtToken(payload[field])) {
                    logger.info(
                      'AsanaProvider',
                      `Found non-JWT token in JWT payload.${field}`,
                    );
                    realAccessToken = payload[field];
                    break;
                  }
                }
              } catch (e) {
                logger.error(
                  'AsanaProvider',
                  'Error extracting data from JWT',
                  {
                    error: e instanceof Error ? e.message : String(e),
                  },
                );
              }
            }

            // Strategy 3: If we still have a JWT, try using the id_token instead
            // In some OAuth implementations, the id_token is actually the raw token needed
            if (
              isJwtToken(realAccessToken) &&
              resBody.id_token &&
              !isJwtToken(resBody.id_token)
            ) {
              logger.info(
                'AsanaProvider',
                'Using id_token as alternative to JWT access_token',
              );
              realAccessToken = resBody.id_token;
            }
          }

          // Log final token type diagnosis
          logger.debug('AsanaProvider', 'Final token diagnosis', {
            originalTokenIsJwt: isJwt,
            finalTokenIsJwt: isJwtToken(realAccessToken),
            tokenSource:
              realAccessToken === originalAccessToken
                ? 'original_access_token'
                : realAccessToken === resBody.id_token
                  ? 'id_token'
                  : 'extracted_or_refreshed_token',
          });

          // Log token response (safely)
          logger.debug('AsanaProvider', 'Token response received', {
            status: response.status,
            hasAccessToken: !!realAccessToken,
            hasRefreshToken: !!resBody.refresh_token,
            hasScope: !!resBody.scope,
            expiresIn: resBody.expires_in,
            tokenType: resBody.token_type,
            accessTokenIsJwt: isJwtToken(realAccessToken),
            accessTokenPreview: realAccessToken
              ? `${realAccessToken.substring(0, 5)}...${realAccessToken.substring(realAccessToken.length - 5)}`
              : 'undefined',
          });

          // Validate the token against Asana API
          try {
            const validationResponse = await fetch(
              'https://app.asana.com/api/1.0/users/me',
              {
                headers: {
                  Authorization: `Bearer ${realAccessToken}`,
                },
              },
            );
            logger.debug('AsanaProvider', 'Token validation against REST API', {
              status: validationResponse.status,
              isValid: validationResponse.ok,
            });

            if (!validationResponse.ok) {
              // If validation fails, fall back to the original token
              logger.warn(
                'AsanaProvider',
                'Extracted token validation failed, using original token',
              );
              realAccessToken = originalAccessToken;
            }
          } catch (e) {
            logger.error(
              'AsanaProvider',
              'Error validating token against API',
              {
                error: e instanceof Error ? e.message : String(e),
              },
            );
            // On error, fall back to original token
            realAccessToken = originalAccessToken;
          }

          // Return the token set without wrapping it in a JWT
          // This is critical for Asana MCP which requires the raw token
          return {
            tokens: {
              access_token: realAccessToken,
              token_type: resBody.token_type,
              expires_in: resBody.expires_in,
              refresh_token: resBody.refresh_token,
              scope: resBody.scope || process.env.ASANA_OAUTH_SCOPES || '',
              id_token: resBody.id_token,
            } as TokenSet,
          };
        } catch (error) {
          logger.error('AsanaProvider', 'Token request error', {
            error: error instanceof Error ? error.message : String(error),
            params,
          });
          throw error;
        }
      },
    },
    userinfo: {
      url: 'https://app.asana.com/api/1.0/users/me',
      async request({
        tokens,
        provider,
      }: { tokens: TokenSet; provider: OAuthConfig<P> }) {
        try {
          logger.debug('AsanaProvider', 'Requesting userinfo', {
            provider: provider.id,
            userinfoUrl: provider.userinfo?.url,
            hasAccessToken: !!tokens.access_token,
            accessTokenPreview: tokens.access_token
              ? `${tokens.access_token.substring(0, 5)}...${tokens.access_token.substring(tokens.access_token.length - 5)}`
              : 'undefined',
          });

          const res = await fetch(provider.userinfo?.url as string, {
            headers: {
              Authorization: `Bearer ${tokens.access_token}`,
            },
          });

          if (!res.ok) {
            logger.error('AsanaProvider', 'Error fetching userinfo', {
              status: res.status,
              statusText: res.statusText,
            });
            throw new Error(
              `Failed to fetch user: ${res.status} ${res.statusText}`,
            );
          }

          const userData = await res.json();

          logger.debug('AsanaProvider', 'Userinfo received', {
            hasData: !!userData.data,
            userId: userData.data?.gid,
            userName: userData.data?.name,
            userEmail: userData.data?.email,
          });

          return userData;
        } catch (error) {
          logger.error('AsanaProvider', 'Userinfo request error', {
            error: error instanceof Error ? error.message : String(error),
          });
          throw error;
        }
      },
    },
    profile(profile: AsanaProfile) {
      logger.debug('AsanaProvider', 'Processing profile data', {
        hasProfile: !!profile,
        hasProfileData: !!profile.data,
        userId: profile.data?.gid,
      });

      return {
        id: profile.data.gid,
        name: profile.data.name,
        email: profile.data.email,
        image: null,
      };
    },
    style: {
      bg: '#FC636B',
      text: '#fff',
    },
    options,
  };
}

// Helper to check if a token is a JWT
function isJwtToken(token?: string): boolean {
  if (!token) return false;
  return token.includes('.') && token.split('.').length === 3;
}
