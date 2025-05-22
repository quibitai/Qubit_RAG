export const runtime = 'nodejs';

import { compare } from 'bcrypt-ts';
import NextAuth, { type User, type Session } from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import Asana from '@/lib/auth/providers/asana';
import { DrizzleAdapter } from '@auth/drizzle-adapter';

import { getUser } from '@/lib/db/queries';
import { logger } from '@/lib/logger';
import { db } from '@/lib/db/client';
import { account } from '@/lib/db/schema';

import { authConfig } from './auth.config';
import { and, eq } from 'drizzle-orm';

// Add top-level log to check if this file is being loaded
logger.debug('Auth', 'auth.ts file is being loaded');
logger.debug('Auth', 'Checking for auth secrets');

// Check for authentication secrets
const authSecret = process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET;
if (authSecret) {
  logger.debug('Auth', 'Found authentication secret');
} else {
  logger.error(
    'Auth',
    'No authentication secret found in environment variables. This will cause auth to fail.',
  );
}

// Instantiate and modify Asana provider
const asanaProviderConfig = Asana({
  clientId: process.env.ASANA_OAUTH_CLIENT_ID ?? '',
  clientSecret: process.env.ASANA_OAUTH_CLIENT_SECRET ?? '',
  authorization: {
    params: {
      scope: 'default', // Explicitly set scope to 'default'
      response_type: 'code',
      access_type: process.env.ASANA_OAUTH_ACCESS_TYPE ?? 'offline',
    },
  },
  // We provide the token and userinfo endpoint details here, so they are part of the 'provider' object
  // passed to the custom request handlers, but we will delete the direct .url from the .token and .userinfo objects
  // that NextAuth sees at the top level.
  token:
    process.env.ASANA_OAUTH_TOKEN_URL ?? 'https://app.asana.com/-/oauth_token',
  userinfo: 'https://app.asana.com/api/1.0/users/me',
  profile(profile: any) {
    logger.debug('AsanaProvider', 'Processing profile data (v5)', {
      // Log marker v5
      profileId: profile.data?.gid,
      profileName: profile.data?.name,
      hasEmail: !!profile.data?.email,
      hasPhoto: !!profile.data?.photo,
    });

    return {
      id: profile.data.gid,
      name: profile.data.name,
      email: profile.data.email,
      image: profile.data.photo?.image_128x128,
    };
  },
});

// Attempt to force custom request handlers by modifying the provider config
if (
  typeof asanaProviderConfig.token === 'object' &&
  asanaProviderConfig.token !== null
) {
  const { url, ...tokenWithoutUrl } = asanaProviderConfig.token as {
    url?: string;
    request?: any;
  }; // Include request
  asanaProviderConfig.token = tokenWithoutUrl;
  logger.debug('Auth', 'Reconfigured asanaProviderConfig.token without url', {
    keys: Object.keys(asanaProviderConfig.token),
  });
} else if (typeof asanaProviderConfig.token === 'string') {
  // If it was a string (URL), replace it with an object containing only the request function from the original provider definition
  // This relies on the original Asana provider factory in asana.ts defining token.request
  const originalProvider = Asana({}); // Get a default instance to access its request function
  if (
    typeof originalProvider.token === 'object' &&
    originalProvider.token?.request
  ) {
    asanaProviderConfig.token = { request: originalProvider.token.request };
    logger.debug(
      'Auth',
      'Replaced asanaProviderConfig.token string with request handler object',
    );
  } else {
    logger.warn(
      'Auth',
      'Could not find original token.request handler to override string token URL',
    );
  }
}

if (
  typeof asanaProviderConfig.userinfo === 'object' &&
  asanaProviderConfig.userinfo !== null
) {
  const { url, ...userinfoWithoutUrl } = asanaProviderConfig.userinfo as {
    url?: string;
    request?: any;
  }; // Include request
  asanaProviderConfig.userinfo = userinfoWithoutUrl;
  logger.debug(
    'Auth',
    'Reconfigured asanaProviderConfig.userinfo without url',
    { keys: Object.keys(asanaProviderConfig.userinfo) },
  );
} else if (typeof asanaProviderConfig.userinfo === 'string') {
  const originalProvider = Asana({});
  if (
    typeof originalProvider.userinfo === 'object' &&
    originalProvider.userinfo?.request
  ) {
    asanaProviderConfig.userinfo = {
      request: originalProvider.userinfo.request,
    };
    logger.debug(
      'Auth',
      'Replaced asanaProviderConfig.userinfo string with request handler object',
    );
  } else {
    logger.warn(
      'Auth',
      'Could not find original userinfo.request handler to override string userinfo URL',
    );
  }
}

// Add a console.log inside the custom Asana provider token.request and userinfo.request to confirm execution (v5)
// This will be done in the asana.ts file directly as it's cleaner.

// Inspect authConfig for debugging
logger.debug(
  'Auth',
  'Inspecting authConfig before passing to NextAuth',
  // We stringify selectively to avoid logging sensitive provider details or complex functions
  {
    pages: authConfig.pages,
    // Check if providers array exists in the imported config
    hasProvidersDefinedInAuthConfig: Array.isArray(authConfig.providers),
    // Check if callbacks object exists
    hasCallbacks:
      typeof authConfig.callbacks === 'object' && authConfig.callbacks !== null,
    // Check if the specific authorized callback function exists
    hasAuthorizedCallback:
      typeof authConfig.callbacks?.authorized === 'function',
  },
);

// Extended User interface to include clientId and Asana info
interface ExtendedUser extends User {
  clientId?: string;
  asanaProviderAccountId?: string;
}

// Extended Session interface to include clientId and Asana info
interface ExtendedSession extends Session {
  user: {
    id: string;
    email: string;
    name?: string | null;
    clientId?: string;
    asanaProviderAccountId?: string;
  };
}

// Log about callback merging
logger.debug(
  'Auth',
  'About to merge callbacks - will preserve authorized callback from authConfig',
);

// Initialize the DrizzleAdapter with default schema
logger.debug('Auth', 'Initializing DrizzleAdapter with schema tables');

// Create a custom debug logger to monitor adapter operations
function logAdapterOperation(
  operation: string,
  params?: any,
  result?: any,
  error?: any,
) {
  if (error) {
    logger.error('AuthAdapter', `${operation} failed`, { params, error });
    return;
  }

  if (result !== undefined) {
    logger.debug('AuthAdapter', `${operation} completed`, {
      params,
      resultType: typeof result,
      resultIsArray: Array.isArray(result),
      resultLength: Array.isArray(result) ? result.length : null,
    });
  } else {
    logger.debug('AuthAdapter', `${operation} called`, { params });
  }
}

export const {
  handlers: { GET, POST },
  auth,
  signIn,
  signOut,
} = NextAuth({
  ...authConfig,
  secret: authSecret,
  debug: true, // Enable full NextAuth debugging
  adapter: DrizzleAdapter(db),
  providers: [
    Credentials({
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize({ email, password }: any) {
        logger.debug('Auth', 'Credentials authorize called', { email });
        const users = await getUser(email);
        if (users.length === 0) {
          logger.debug('Auth', 'No user found for email', { email });
          return null;
        }
        const user = users[0];
        if (!user.password) {
          logger.debug('Auth', 'User has no password set', { email });
          return null;
        }
        const passwordsMatch = await compare(password, user.password);
        if (!passwordsMatch) {
          logger.debug('Auth', 'Password does not match', { email });
          return null;
        }
        logger.debug('Auth', 'User authenticated successfully', { email });
        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.image,
        };
      },
    }),
    // Pass the modified Asana provider
    asanaProviderConfig,
  ],
  callbacks: {
    // Preserve the authorized callback from authConfig
    authorized: authConfig.callbacks.authorized,

    // Add the JWT and session callbacks
    async jwt({ token, user, account }) {
      logger.debug('Auth', 'JWT callback called', {
        userId: token.id || user?.id,
        hasUserObject: !!user,
        hasAccountObject: !!account,
        accountProvider: account?.provider,
        tokenKeys: Object.keys(token),
      });

      if (user) {
        token.id = user.id;

        // If this is an Asana OAuth sign-in, handle the tokens and provider account ID
        if (account?.provider === 'asana') {
          // Debug logging for Asana token inspection
          console.log(
            'ASANA_DEBUG: account.access_token:',
            account.access_token,
          );
          console.log(
            'ASANA_DEBUG: account.refresh_token:',
            account.refresh_token,
          );
          console.log(
            'ASANA_DEBUG: account.expires_at (from provider):',
            account.expires_at,
          );
          console.log(
            'ASANA_DEBUG: typeof account.access_token:',
            typeof account.access_token,
          );

          // Store the Asana provider account ID
          logger.debug(
            'Auth',
            `Adding Asana provider account ID to token: ${account.providerAccountId}`,
          );
          token.asanaProviderAccountId = account.providerAccountId;

          // Store the access token
          token.accessToken = account.access_token;

          // Store the refresh token if provided
          if (account.refresh_token) {
            token.refreshToken = account.refresh_token;
          }

          // Convert expires_at to milliseconds timestamp and store
          if (account.expires_at) {
            // account.expires_at is already an absolute timestamp in seconds from Asana
            token.accessTokenExpires = (account.expires_at as number) * 1000;
            console.log(
              'ASANA_DEBUG: token.accessTokenExpires (calculated):',
              token.accessTokenExpires,
            );
          }

          logger.debug('Auth', 'Asana token details stored in JWT', {
            hasAccessToken: !!token.accessToken,
            hasRefreshToken: !!token.refreshToken,
            accessTokenExpires: token.accessTokenExpires,
          });
        }
      }

      return token;
    },

    async session({
      session,
      token,
    }: {
      session: ExtendedSession;
      token: any;
    }) {
      logger.debug('Auth', 'Session callback called', {
        hasSessionUser: !!session?.user,
        hasTokenId: !!token?.id,
        tokenKeys: Object.keys(token || {}),
      });

      if (session.user) {
        session.user.id = token.id as string;
        // Temporarily comment out clientId handling
        // if (token.clientId) {
        //   logger.debug('Auth', `Adding clientId to session: ${token.clientId}`);
        //   session.user.clientId = token.clientId as string;
        // }
        // Add Asana provider account ID if available
        if (token.asanaProviderAccountId) {
          logger.debug(
            'Auth',
            `Adding Asana provider account ID to session: ${token.asanaProviderAccountId}`,
          );
          session.user.asanaProviderAccountId = token.asanaProviderAccountId;
        }
      }

      return session;
    },
  },
  events: {
    async linkAccount(message) {
      console.log(
        '[AUTH_EVENT_DEBUG] linkAccount - message.account received by event:',
        JSON.stringify(message.account, null, 2),
      );

      // Check if this is an Asana account
      if (message.account?.provider === 'asana') {
        let scopeValue = message.account.scope;

        // First try to use the scope from the message if it exists
        if (scopeValue) {
          logger.debug('Auth', 'Using scope from OAuth flow:', {
            scope: scopeValue,
          });
        }
        // If no scope in the message, try to extract from JWT
        else if (message.account?.access_token) {
          try {
            const jwt = message.account.access_token.split('.')[1];
            const padded = jwt.padEnd(
              jwt.length + ((4 - (jwt.length % 4)) % 4),
              '=',
            );
            const payload = Buffer.from(padded, 'base64').toString('utf-8');
            const data = JSON.parse(payload);

            if (data?.scope) {
              scopeValue = data.scope;
              logger.debug('Auth', 'Extracted scope from JWT:', {
                scope: scopeValue,
              });
            }
          } catch (e) {
            logger.error('Auth', 'Failed to extract scope from JWT', {
              error: e,
            });
          }
        }

        // If we still don't have a scope, use the simplified scope
        if (!scopeValue) {
          scopeValue = 'projects:read tasks:read users:read';
          logger.debug('Auth', 'Using simplified scope:', {
            scope: scopeValue,
          });
        }

        // Now update the account with the scope value (if we have one)
        if (scopeValue) {
          try {
            logger.info('Auth', 'Updating Asana account with scope:', {
              provider: message.account.provider,
              providerAccountId: message.account.providerAccountId,
              scope: scopeValue,
            });

            // Use Drizzle ORM to update the account record
            const updateResult = await db
              .update(account)
              .set({ scope: scopeValue })
              .where(
                and(
                  eq(account.provider, message.account.provider),
                  eq(
                    account.providerAccountId,
                    message.account.providerAccountId,
                  ),
                ),
              )
              .returning();

            logger.debug('Auth', 'Scope update result:', { updateResult });
          } catch (e) {
            logger.error(
              'Auth',
              'Failed to update account with scope in database',
              { error: e },
            );
          }
        } else {
          logger.warn('Auth', 'No scope found to update for Asana account', {
            provider: message.account.provider,
            providerAccountId: message.account.providerAccountId,
          });
        }
      }
    },
  },
});
