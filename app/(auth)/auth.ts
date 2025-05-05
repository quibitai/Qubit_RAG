import { compare } from 'bcrypt-ts';
import NextAuth, { type User, type Session } from 'next-auth';
import Credentials from 'next-auth/providers/credentials';

import { getUser } from '@/lib/db/queries';

import { authConfig } from './auth.config';

// Add top-level log to check if this file is being loaded
console.log('[Auth Module] auth.ts file is being loaded');
console.log('[Auth Module] Checking for auth secrets...');

// Check for authentication secrets
const authSecret = process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET;
if (authSecret) {
  console.log('[Auth Module] Found authentication secret');
} else {
  console.error(
    '[Auth Module] WARNING: No authentication secret found in environment variables. This will cause auth to fail.',
  );
}

// --- START ADDED DEBUG LOG ---
console.log(
  '[Auth Module] Inspecting authConfig before passing to NextAuth:',
  // We stringify selectively to avoid logging sensitive provider details or complex functions
  JSON.stringify(
    {
      pages: authConfig.pages,
      // Check if providers array exists in the imported config
      hasProvidersDefinedInAuthConfig: Array.isArray(authConfig.providers),
      // Check if callbacks object exists
      hasCallbacks:
        typeof authConfig.callbacks === 'object' &&
        authConfig.callbacks !== null,
      // Check if the specific authorized callback function exists
      hasAuthorizedCallback:
        typeof authConfig.callbacks?.authorized === 'function',
    },
    null,
    2,
  ),
);
// --- END ADDED DEBUG LOG ---

// Extended User interface to include clientId
interface ExtendedUser extends User {
  clientId?: string;
}

interface ExtendedSession extends Session {
  user: ExtendedUser;
}

// --- ADD LOGGING ABOUT CALLBACK MERGING ---
console.log(
  '[Auth Module] About to merge callbacks - will preserve authorized callback from authConfig',
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
          console.log(
            `[Auth Module] Adding clientId to JWT token: ${user.clientId}`,
          );
          token.clientId = user.clientId;
        } else {
          console.log('[Auth Module] User object does not contain clientId');
          // You might want to fetch the clientId from the database here if not included in the user object
          const users = await getUser(user.email as string);
          if (users.length > 0 && 'clientId' in users[0]) {
            console.log(
              `[Auth Module] Retrieved clientId from database: ${users[0].clientId}`,
            );
            token.clientId = users[0].clientId;
          } else {
            console.warn(
              '[Auth Module] No clientId found for user in database',
            );
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
          console.log(
            `[Auth Module] Adding clientId to session: ${token.clientId}`,
          );
          session.user.clientId = token.clientId as string;
        }
      }

      return session;
    },
  },
});
