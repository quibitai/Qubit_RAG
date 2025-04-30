import type { NextAuthConfig } from 'next-auth';

export const authConfig = {
  pages: {
    signIn: '/login',
    newUser: '/',
  },
  providers: [
    // added later in auth.ts since it requires bcrypt which is only compatible with Node.js
    // while this file is also used in non-Node.js environments
  ],
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      // --- START DEBUG LOGGING ---
      console.log('[Auth Callback] Running authorized check...');
      console.log('[Auth Callback] Pathname:', nextUrl.pathname);
      console.log('[Auth Callback] Raw auth object:', auth); // Log the raw session object
      const isLoggedIn = !!auth?.user;
      console.log('[Auth Callback] isLoggedIn evaluated as:', isLoggedIn);
      // --- END DEBUG LOGGING ---

      const isOnChat = nextUrl.pathname.startsWith('/'); // Careful: This matches almost everything
      const isOnRegister = nextUrl.pathname.startsWith('/register');
      const isOnLogin = nextUrl.pathname.startsWith('/login');

      // --- Log evaluated conditions ---
      console.log('[Auth Callback] Conditions:', {
        isOnChat,
        isOnRegister,
        isOnLogin,
      });

      if (isLoggedIn && (isOnLogin || isOnRegister)) {
        console.log(
          '[Auth Callback] Decision: Redirecting logged-in user from auth page to /',
        );
        return Response.redirect(new URL('/', nextUrl as unknown as URL));
      }

      if (isOnRegister || isOnLogin) {
        console.log(
          '[Auth Callback] Decision: Allowing access to login/register page.',
        );
        return true; // Always allow access to register and login pages
      }

      // This rule needs careful review - should likely be more specific
      // It currently protects ALL routes starting with '/' if not logged in.
      if (isOnChat) {
        // Maybe rename isOnChat to isProtectedRoute?
        if (isLoggedIn) {
          console.log(
            '[Auth Callback] Decision: Allowing access to protected route (logged in).',
          );
          return true;
        }
        console.log(
          '[Auth Callback] Decision: Denying access to protected route (logged out) -> should redirect.',
        );
        return false; // Redirect unauthenticated users to login page
      }

      if (isLoggedIn) {
        console.log(
          '[Auth Callback] Decision: Redirecting logged-in user to / (default rule).',
        );
        return Response.redirect(new URL('/', nextUrl as unknown as URL));
      }

      // If none of the above rules explicitly returned true or a Response,
      // and the user is not logged in, deny access by default for any other path.
      if (!isLoggedIn) {
        console.log(
          '[Auth Callback] Decision: Denying access by default (unauthenticated user on non-public path).',
        );
        return false; // Deny access / trigger redirect
      }

      // Otherwise (logged in and path not specifically handled), allow access.
      console.log(
        '[Auth Callback] Decision: Allowing access by default (logged in user on path not otherwise handled).',
      );
      return true;
    },
  },
} satisfies NextAuthConfig;
