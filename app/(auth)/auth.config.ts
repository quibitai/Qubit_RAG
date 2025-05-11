import type { NextAuthConfig } from 'next-auth';
import { logger } from '@/lib/logger';

// Flag to control auth logging - should be controlled via environment variable
const AUTH_DEBUG = process.env.AUTH_DEBUG === 'true' || false;

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
      // Only log if AUTH_DEBUG is enabled or using the logger at debug level
      logger.debug('AuthCallback', 'Running authorized check...');
      logger.debug('AuthCallback', `Pathname: ${nextUrl.pathname}`);
      logger.debug('AuthCallback', 'Raw auth object:', auth);

      const isLoggedIn = !!auth?.user;
      logger.debug('AuthCallback', `isLoggedIn evaluated as: ${isLoggedIn}`);

      const isOnChat = nextUrl.pathname.startsWith('/'); // Careful: This matches almost everything
      const isOnRegister = nextUrl.pathname.startsWith('/register');
      const isOnLogin = nextUrl.pathname.startsWith('/login');

      // Log evaluated conditions
      logger.debug('AuthCallback', 'Conditions:', {
        isOnChat,
        isOnRegister,
        isOnLogin,
      });

      if (isLoggedIn && (isOnLogin || isOnRegister)) {
        logger.debug(
          'AuthCallback',
          'Decision: Redirecting logged-in user from auth page to /',
        );
        return Response.redirect(new URL('/', nextUrl as unknown as URL));
      }

      if (isOnRegister || isOnLogin) {
        logger.debug(
          'AuthCallback',
          'Decision: Allowing access to login/register page.',
        );
        return true; // Always allow access to register and login pages
      }

      // This rule needs careful review - should likely be more specific
      // It currently protects ALL routes starting with '/' if not logged in.
      if (isOnChat) {
        // Maybe rename isOnChat to isProtectedRoute?
        if (isLoggedIn) {
          logger.debug(
            'AuthCallback',
            'Decision: Allowing access to protected route (logged in).',
          );
          return true;
        }
        logger.debug(
          'AuthCallback',
          'Decision: Denying access to protected route (logged out) -> should redirect.',
        );
        return false; // Redirect unauthenticated users to login page
      }

      if (isLoggedIn) {
        logger.debug(
          'AuthCallback',
          'Decision: Redirecting logged-in user to / (default rule).',
        );
        return Response.redirect(new URL('/', nextUrl as unknown as URL));
      }

      // If none of the above rules explicitly returned true or a Response,
      // and the user is not logged in, deny access by default for any other path.
      if (!isLoggedIn) {
        logger.debug(
          'AuthCallback',
          'Decision: Denying access by default (unauthenticated user on non-public path).',
        );
        return false; // Deny access / trigger redirect
      }

      // Otherwise (logged in and path not specifically handled), allow access.
      logger.debug(
        'AuthCallback',
        'Decision: Allowing access by default (logged in user on path not otherwise handled).',
      );
      return true;
    },
  },
} satisfies NextAuthConfig;
