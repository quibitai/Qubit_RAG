// Using Web Crypto API compatible functions (works in Edge Runtime)
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
 * Generate a cryptographically secure random string for PKCE using Web Crypto API
 * This works in both Edge Runtime and Node.js environments
 */
async function generateVerifier() {
  // Generate random bytes
  const randomValues = new Uint8Array(32);

  if (typeof crypto !== 'undefined') {
    // Browser or Edge environment
    crypto.getRandomValues(randomValues);
  } else {
    // Fallback for other environments
    for (let i = 0; i < randomValues.length; i++) {
      randomValues[i] = Math.floor(Math.random() * 256);
    }
  }

  // Convert to base64url
  return btoa(String.fromCharCode.apply(null, [...randomValues]))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Generate a code challenge using the S256 method with Web Crypto API
 * This works in both Edge Runtime and Node.js environments
 */
async function generateChallenge(verifier: string) {
  // Convert string to Uint8Array
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);

  // Hash using SHA-256
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);

  // Convert to base64url
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashString = String.fromCharCode.apply(null, hashArray);
  return btoa(hashString)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
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

// Store as a module-level variable to preserve across imports
let codeVerifier = '';
let codeChallenge = '';

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

  // Initialize the PKCE values if not already set
  if (!codeVerifier || !codeChallenge) {
    generateVerifier().then((verifier) => {
      codeVerifier = verifier;
      generateChallenge(verifier).then((challenge) => {
        codeChallenge = challenge;
        logger.debug('AsanaProvider', 'Generated PKCE values', {
          verifierLength: codeVerifier.length,
          challengeLength: codeChallenge.length,
        });
      });
    });
  }

  return {
    id: 'asana',
    name: 'Asana',
    type: 'oauth',
    // Override Asana provider to use MCP-specific endpoints
    issuer: 'https://mcp.asana.com',
    authorization: {
      url: 'https://mcp.asana.com/authorize',
      params: {
        scope: 'projects:read tasks:read users:read openid',
        response_type: 'code',
        code_challenge: codeChallenge || 'generating', // Use placeholder if not ready yet
        code_challenge_method: 'S256',
      },
    },
    token: {
      url: 'https://mcp.asana.com/token',
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
            codeVerifierLength: codeVerifier?.length || 0,
          });

          // Add PKCE code_verifier to the request
          const requestParams = {
            ...params,
            code_verifier: codeVerifier || '',
          };

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
              ...requestParams,
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

          // Log token details but don't attempt to validate or refresh
          logger.debug('AsanaProvider', 'Token received', {
            hasAccessToken: !!resBody.access_token,
            hasRefreshToken: !!resBody.refresh_token,
            expiresIn: resBody.expires_in,
            tokenType: resBody.token_type,
            accessTokenPreview: resBody.access_token
              ? `${resBody.access_token.substring(0, 5)}...${resBody.access_token.substring(resBody.access_token.length - 5)}`
              : 'undefined',
          });

          // Return the token set without any JWT checking or transformation
          return {
            tokens: {
              access_token: resBody.access_token,
              token_type: resBody.token_type,
              expires_in: resBody.expires_in,
              refresh_token: resBody.refresh_token,
              scope:
                resBody.scope || 'projects:read tasks:read users:read openid',
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
