import { compare } from 'bcrypt-ts';
import NextAuth, { type User, type Session } from 'next-auth';
import Credentials from 'next-auth/providers/credentials';

import { getUser } from '@/lib/db/queries';
import { logger } from '@/lib/logger';

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

// Extended User interface to include clientId
interface ExtendedUser extends User {
  clientId?: string;
}

// Extended Session interface to include clientId in the user object
interface ExtendedSession extends Session {
  user: {
    id: string;
    email: string;
    name?: string;
    clientId?: string;
  };
}

// Log about callback merging
logger.debug(
  'Auth',
  'About to merge callbacks - will preserve authorized callback from authConfig',
);

export const {
  handlers: { GET, POST },
  auth,
  signIn,
  signOut,
} = NextAuth({
  ...authConfig,
  secret: authSecret,
  providers: [
    Credentials({
      credentials: {},
      async authorize({ email, password }: any) {
        const users = await getUser(email);
        if (users.length === 0) return null;
        // biome-ignore lint: Forbidden non-null assertion.
        const passwordsMatch = await compare(password, users[0].password!);
        if (!passwordsMatch) return null;
        return users[0] as any;
      },
    }),
  ],
  callbacks: {
    // Preserve the authorized callback from authConfig
    authorized: authConfig.callbacks.authorized,

    // Add the JWT and session callbacks
    async jwt({ token, user }) {
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
          // You might want to fetch the clientId from the database here if not included in the user object
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
      if (session.user) {
        session.user.id = token.id as string;
        // Add clientId to the session.user object if available in token
        if (token.clientId) {
          logger.debug('Auth', `Adding clientId to session: ${token.clientId}`);
          session.user.clientId = token.clientId as string;
        }
      }

      return session;
    },
  },
});
