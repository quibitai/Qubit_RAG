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
    Asana({
      clientId: process.env.ASANA_OAUTH_CLIENT_ID ?? '',
      clientSecret: process.env.ASANA_OAUTH_CLIENT_SECRET ?? '',
      authorization: {
        url:
          process.env.ASANA_OAUTH_AUTHORIZATION_URL ??
          'https://app.asana.com/-/oauth_authorize',
        params: {
          scope: 'projects:read tasks:read users:read openid', // Simplified scopes
          response_type: 'code',
          access_type: process.env.ASANA_OAUTH_ACCESS_TYPE ?? 'offline',
        },
      },
      token:
        process.env.ASANA_OAUTH_TOKEN_URL ??
        'https://app.asana.com/-/oauth_token',
      userinfo: 'https://app.asana.com/api/1.0/users/me',
      profile(profile: any) {
        logger.debug('AsanaProvider', 'Processing profile data', {
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
    }),
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
        // Temporarily comment out clientId handling
        // if (token.clientId) {
        //   logger.debug('Auth', `Adding clientId to session: ${token.clientId}`);
        //   session.user.clientId = token.clientId as string;
        // }

        // If this is an Asana OAuth sign-in, store the provider account ID
        if (account?.provider === 'asana') {
          logger.debug(
            'Auth',
            `Adding Asana provider account ID to token: ${account.providerAccountId}`,
          );
          token.asanaProviderAccountId = account.providerAccountId;
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
          scopeValue = 'projects:read tasks:read users:read openid';
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
