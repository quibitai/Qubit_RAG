/**
 * Asana API operations for users
 */

import type { AsanaApiClient } from '../client';

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
