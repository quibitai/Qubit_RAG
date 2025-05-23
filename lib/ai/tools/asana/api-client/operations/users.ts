/**
 * Asana API operations for users
 */

import type { AsanaApiClient } from '../client';
import type { AsanaNamedResource, TypeaheadSearchParams } from './search'; // Assuming search operations are in 'search.ts'

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
  const queryParams = {
    opt_fields: 'gid,name,email,photo,workspaces.name,workspaces.gid',
  };

  return apiClient.request<any>(
    'users/me',
    'GET',
    undefined,
    queryParams,
    requestId,
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

  try {
    // Directly use the typeaheadSearch function from search.ts
    // We need to import it or ensure AsanaApiClient has a way to call it.
    // For this example, assume direct import or apiClient has such a method.
    // If typeaheadSearch is not directly available, this part needs adjustment.

    const searchParams: TypeaheadSearchParams = {
      workspaceGid,
      query: emailOrName,
      resourceType: 'user',
      opt_fields: ['gid', 'name', 'email'], // Ensure email is fetched for matching
      count: 5, // Limit results
    };

    // This assumes typeaheadSearch is a standalone function or method we can call.
    // If it's not structured this way, the call needs to be adapted.
    // This part of the code is calling a function from another module.
    // We need to make sure that `typeaheadSearch` is imported or accessible.
    // For the sake of this example, I'm writing it as if `apiClient.typeaheadSearch` exists
    // or `typeaheadSearch` is imported and used directly.

    // Correct approach: Use the imported typeaheadSearch function if it's designed for standalone use.
    // Let's assume `typeaheadSearch` from './search' is the correct function to call.
    // And it is structured as: typeaheadSearch(apiClient, params, requestId)

    // Since this function is in users.ts and typeaheadSearch is in search.ts,
    // we'd typically import typeaheadSearch at the top of users.ts.
    // For now, I'm demonstrating the logic. The actual call might look like:
    // const results = await typeaheadSearch(apiClient, searchParams, requestId);

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
      return undefined; // Not found
    }

    // Check for exact email match first (most reliable)
    const emailMatches = results.filter(
      (user) =>
        (user as any).email?.toLowerCase() === emailOrName.toLowerCase(),
    );
    if (emailMatches.length === 1) {
      return emailMatches[0].gid;
    }
    if (emailMatches.length > 1) {
      // This case should be rare for unique emails but handle it.
      return 'ambiguous';
    }

    // If no exact email match, check for exact name match
    const nameMatches = results.filter(
      (user) => user.name?.toLowerCase() === emailOrName.toLowerCase(),
    );
    if (nameMatches.length === 1) {
      return nameMatches[0].gid;
    }
    if (nameMatches.length > 1) {
      return 'ambiguous';
    }

    // If still no exact match but results exist, it's ambiguous for names, or not found for emails if it wasn't an email
    if (results.length > 0 && !emailOrName.includes('@')) {
      // If it was a name search and we got multiple partial matches
      return 'ambiguous';
    }

    return undefined; // Not found or not specific enough
  } catch (error) {
    console.error(
      `[UserOperations] Error finding user GID for "${emailOrName}" in workspace ${workspaceGid}: ${error}`,
    );
    // Depending on the error, might rethrow or return undefined/ambiguous
    throw error; // Or return undefined to indicate failure to find
  }
}
