/**
 * Asana API Search operations (primarily Typeahead)
 */

import type { AsanaApiClient } from '../client';
import type { AsanaSearchableResourceType } from '../../intent-parser/entity.extractor'; // Re-using this type

/**
 * Represents a generic named resource from Asana, common in typeahead results.
 * Based on Asana API documentation for Typeahead.
 * @see https://developers.asana.com/reference/typeahead
 */
export interface AsanaNamedResource {
  gid: string;
  name: string;
  resource_type: string; // e.g., "task", "project", "user", "portfolio", "tag"
  permalink_url?: string; // Often useful, not always present in minimal typeahead response
  // Add other common optional fields if frequently needed, e.g., for tasks: completed, assignee.name
  completed?: boolean;
  assignee?: { gid: string; name: string };
  parent?: { gid: string; name: string; resource_type?: string }; // For subtasks
  workspace?: { gid: string; name: string }; // For context
}

/**
 * Parameters for typeahead search.
 */
export interface TypeaheadSearchParams {
  workspaceGid: string;
  query: string;
  resourceType?: AsanaSearchableResourceType;
  opt_fields?: string[];
  count?: number; // Number of results to return
}

/**
 * Performs a typeahead search in Asana.
 *
 * @param apiClient Asana API client
 * @param params Typeahead search parameters
 * @param requestId Optional request ID for tracking
 * @returns Array of AsanaNamedResource matching the typeahead query.
 */
export async function typeaheadSearch(
  apiClient: AsanaApiClient,
  params: TypeaheadSearchParams,
  requestId?: string,
): Promise<AsanaNamedResource[]> {
  if (!params.workspaceGid) {
    throw new Error('Workspace GID is required for typeahead search.');
  }
  if (!params.query) {
    // Asana API might allow empty query for some resource types, but for general search it's not useful.
    // Depending on behavior, might return empty array or throw.
    console.warn(
      `[SearchOperations] Typeahead search called with empty query for workspace ${params.workspaceGid}.`,
    );
    return [];
  }

  // queryParams now strictly string or string[] for values
  const queryParams: Record<string, string | string[]> = {
    query: params.query,
  };

  if (params.resourceType) {
    queryParams.resource_type = params.resourceType;
  }

  // Default opt_fields, can be overridden by params
  const defaultOptFields = [
    'gid',
    'name',
    'resource_type',
    'permalink_url',
    // Task specific common fields for richer results
    'completed',
    'assignee.name',
    'parent.name',
    'parent.resource_type',
    'projects.name', // For task results
    // Project specific common fields
    'workspace.name', // For project results, shows its workspace (should match input but good for consistency)
  ];
  queryParams.opt_fields = params.opt_fields || defaultOptFields;

  if (params.count) {
    queryParams.count = String(params.count);
  }

  try {
    return await apiClient.request<AsanaNamedResource[]>(
      `workspaces/${params.workspaceGid}/typeahead`,
      'GET',
      undefined,
      queryParams, // No cast needed now
      requestId,
    );
  } catch (error) {
    console.error(
      `[SearchOperations] Error performing typeahead search in workspace ${params.workspaceGid} for query "${params.query}": ${error}`,
    );
    throw error;
  }
}
