/**
 * Edge-compatible adapter for NextAuth.js that uses JWT-based sessions
 * instead of database sessions, avoiding Edge Runtime compatibility issues.
 */

import type { Adapter } from 'next-auth/adapters';
import { logger } from '@/lib/logger';

/**
 * This adapter doesn't use database sessions, relying on JWTs instead
 * It implements the minimum required functions for NextAuth to work
 * without using features incompatible with Edge Runtime
 */
export function EdgeCompatibleAdapter(): Adapter {
  logger.debug('Auth', 'Initializing EdgeCompatibleAdapter');

  return {
    // These functions are required by the adapter interface but will not
    // be called when using JWT sessions (as configured in auth.config.ts)
    createUser: async (userData) => {
      logger.debug(
        'EdgeCompatibleAdapter',
        'createUser called - using JWT strategy, this should not be used',
      );
      // Create a default user without overwriting properties
      const defaultUser = {
        id: '',
        email: '',
        emailVerified: null,
      };

      // Return user data with defaults for missing fields
      return { ...defaultUser, ...userData };
    },
    getUser: async (id) => {
      logger.debug(
        'EdgeCompatibleAdapter',
        'getUser called - using JWT strategy, this should not be used',
      );
      return null;
    },
    getUserByEmail: async (email) => {
      logger.debug(
        'EdgeCompatibleAdapter',
        'getUserByEmail called - using JWT strategy, this should not be used',
      );
      return null;
    },
    getUserByAccount: async ({ provider, providerAccountId }) => {
      logger.debug(
        'EdgeCompatibleAdapter',
        'getUserByAccount called - using JWT strategy, this should not be used',
      );
      return null;
    },
    updateUser: async (user) => {
      logger.debug(
        'EdgeCompatibleAdapter',
        'updateUser called - using JWT strategy, this should not be used',
      );
      // Create a default user without overwriting properties
      const defaultUser = {
        id: '',
        email: '',
        emailVerified: null,
      };

      // Return updated user with defaults for missing fields
      return { ...defaultUser, ...user };
    },
    linkAccount: async (account) => {
      logger.debug(
        'EdgeCompatibleAdapter',
        'linkAccount called - using JWT strategy, this should not be used',
      );
    },
    createSession: async (session) => {
      logger.debug(
        'EdgeCompatibleAdapter',
        'createSession called - using JWT strategy, this should not be used',
      );
      return {
        sessionToken: '',
        userId: '',
        expires: new Date(),
      };
    },
    getSessionAndUser: async (sessionToken) => {
      logger.debug(
        'EdgeCompatibleAdapter',
        'getSessionAndUser called - using JWT strategy, this should not be used',
      );
      return null;
    },
    updateSession: async (session) => {
      logger.debug(
        'EdgeCompatibleAdapter',
        'updateSession called - using JWT strategy, this should not be used',
      );
      return null;
    },
    deleteSession: async (sessionToken) => {
      logger.debug(
        'EdgeCompatibleAdapter',
        'deleteSession called - using JWT strategy, this should not be used',
      );
    },
  };
}
