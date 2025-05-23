/**
 * Asana API operations for users
 */

import type { AsanaApiClient } from '../client';
import type { AsanaNamedResource, TypeaheadSearchParams } from './search'; // Assuming search operations are in 'search.ts'
import { getOrSetCache, CacheKeys } from '../cache';

/**
 * Get information about the currently authenticated user
 *
 * @param apiClient The Asana API client
 * @param requestId Optional request ID for tracking
 * @returns User information
 */
export async function getUsersMe(
  apiClient: AsanaApiClient,
  requestId?: string,
): Promise<any> {
  const cacheKey = CacheKeys.userMe();

  return getOrSetCache(
    cacheKey,
    () =>
      apiClient.request<any>(
        'users/me',
        'GET',
        undefined,
        { opt_fields: 'gid,name,email,photo,workspaces.name,workspaces.gid' },
        requestId,
      ),
    10 * 60 * 1000, // Cache for 10 minutes since user info rarely changes
  );
}

/**
 * Finds a user GID by their email or name using typeahead search.
 *
 * @param apiClient Asana API client
 * @param workspaceGid GID of the workspace to search within
 * @param emailOrName The email or name of the user to find
 * @param requestId Optional request ID for tracking
 * @returns A promise that resolves to the user's GID if found and unambiguous,
 *          'ambiguous' if multiple users match, or undefined if not found.
 */
export async function findUserGidByEmailOrName(
  apiClient: AsanaApiClient,
  workspaceGid: string,
  emailOrName: string,
  requestId?: string,
): Promise<string | 'ambiguous' | undefined> {
  if (!workspaceGid) {
    throw new Error('Workspace GID is required to find user by email or name.');
  }
  if (!emailOrName) {
    throw new Error('Email or name is required to find user.');
  }

  const normalizedIdentifier = emailOrName.toLowerCase();

  // Try email cache first
  const emailCacheKey = CacheKeys.userByEmail(
    normalizedIdentifier,
    workspaceGid,
  );
  const cachedByEmail = await getOrSetCache(
    emailCacheKey,
    async () => {
      // Search by email using typeahead
      const results = await apiClient.request<any[]>(
        `workspaces/${workspaceGid}/typeahead`,
        'GET',
        undefined,
        {
          resource_type: 'user',
          query: emailOrName,
          opt_fields: 'gid,name,email',
        },
        requestId,
      );

      // Look for exact email match
      const exactEmailMatch = results.find(
        (user) => user.email?.toLowerCase() === normalizedIdentifier,
      );

      return exactEmailMatch?.gid || null;
    },
    5 * 60 * 1000, // Cache for 5 minutes
  );

  if (cachedByEmail) {
    return cachedByEmail;
  }

  // Try name cache
  const nameCacheKey = CacheKeys.userByName(normalizedIdentifier, workspaceGid);

  return getOrSetCache(
    nameCacheKey,
    async () => {
      // Search by name using typeahead
      const results = await apiClient.request<AsanaNamedResource[]>(
        `workspaces/${workspaceGid}/typeahead`,
        'GET',
        undefined,
        {
          resource_type: 'user',
          query: emailOrName,
          opt_fields: ['gid', 'name', 'email'],
          count: '5',
        } as Record<string, string | string[]>,
        requestId,
      );

      if (results.length === 0) {
        return undefined;
      }

      // Look for exact name matches
      const exactMatches = results.filter(
        (user) => user.name?.toLowerCase() === normalizedIdentifier,
      );

      if (exactMatches.length === 1) {
        return exactMatches[0].gid;
      }

      if (exactMatches.length > 1) {
        return 'ambiguous';
      }

      // Look for partial name matches
      const partialMatches = results.filter((user) =>
        user.name?.toLowerCase().includes(normalizedIdentifier),
      );

      if (partialMatches.length === 1) {
        return partialMatches[0].gid;
      }

      if (partialMatches.length > 1) {
        return 'ambiguous';
      }

      return undefined;
    },
    5 * 60 * 1000, // Cache for 5 minutes
  );
}
