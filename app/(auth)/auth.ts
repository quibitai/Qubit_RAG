export const runtime = 'nodejs';

import { compare } from 'bcrypt-ts';
import NextAuth, { type User, type Session } from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import Asana from '@/lib/auth/providers/asana';
import { DrizzleAdapter } from '@auth/drizzle-adapter';

import { getUser } from '@/lib/db/queries';
import { logger } from '@/lib/logger';
import { db } from '@/lib/db/client';

import { authConfig } from './auth.config';

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

// Create a custom table mapping options for DrizzleAdapter
// Using type assertion to avoid linter errors
const customTableMappings = {
  // Use lowercase names to match PostgreSQL's convention of converting unquoted identifiers to lowercase
  tablePrefix: '',
  usersTable: 'User',
  accountsTable: 'Account',
  sessionsTable: 'Session',
  verificationTokensTable: 'VerificationToken',
} as any;

// Initialize the DrizzleAdapter with custom mappings
logger.debug(
  'Auth',
  'Initializing DrizzleAdapter with custom table names',
  customTableMappings,
);

export const {
  handlers: { GET, POST },
  auth,
  signIn,
  signOut,
} = NextAuth({
  ...authConfig,
  secret: authSecret,
  adapter: DrizzleAdapter(db, customTableMappings),
  providers: [
    Credentials({
      credentials: {},
      async authorize({ email, password }: any) {
        const users = await getUser(email);
        if (users.length === 0) return null;
        const passwordsMatch = await compare(password, users[0].password ?? '');
        if (!passwordsMatch) return null;
        return users[0] as any;
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
          scope: process.env.ASANA_OAUTH_SCOPES ?? 'default',
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
      });

      if (user) {
        token.id = user.id;
        // Add clientId to the token if available
        if ('clientId' in user) {
          logger.debug(
            'Auth',
            `Adding clientId to JWT token: ${user.clientId}`,
          );
          token.clientId = user.clientId;
        } else {
          logger.debug('Auth', 'User object does not contain clientId');
          // Fetch the clientId from the database if not included in the user object
          const users = await getUser(user.email as string);
          if (users.length > 0 && 'clientId' in users[0]) {
            logger.debug(
              'Auth',
              `Retrieved clientId from database: ${users[0].clientId}`,
            );
            token.clientId = users[0].clientId;
          } else {
            logger.warn('Auth', 'No clientId found for user in database');
          }
        }

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
        // Add clientId to the session.user object if available in token
        if (token.clientId) {
          logger.debug('Auth', `Adding clientId to session: ${token.clientId}`);
          session.user.clientId = token.clientId as string;
        }
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
});
