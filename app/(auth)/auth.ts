import { compare } from 'bcrypt-ts';
import NextAuth, { type User, type Session } from 'next-auth';
import Credentials from 'next-auth/providers/credentials';

import { getUser } from '@/lib/db/queries';

import { authConfig } from './auth.config';

// Add top-level log to check if this file is being loaded
console.log('[Auth Module] auth.ts file is being loaded');

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

interface ExtendedSession extends Session {
  user: User;
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
      }

      return session;
    },
  },
});
