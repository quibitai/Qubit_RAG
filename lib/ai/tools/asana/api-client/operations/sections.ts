/**
 * Asana API Section operations
 */

import type { AsanaApiClient } from '../client';

/**
 * Simplified type representing a section response from Asana API
 */
export interface SectionResponseData {
  gid: string;
  name: string;
  resource_type?: string;
  project?: {
    gid: string;
    name: string;
    resource_type?: string;
  };
  created_at?: string;
}

/**
 * Parameters for creating a section
 */
export interface CreateSectionParams {
  /** Section name (required) */
  name: string;
  /** Project GID where the section will be created (required) */
  projectGid: string;
}

/**
 * Get sections for a project
 *
 * @param apiClient Asana API client
 * @param projectGid GID of the project
 * @param opt_fields Optional array of fields to include in the response
 * @param requestId Request ID for tracking
 * @returns Array of section data
 */
export async function getProjectSections(
  apiClient: AsanaApiClient,
  projectGid: string,
  opt_fields?: string[],
  requestId?: string,
): Promise<SectionResponseData[]> {
  if (!projectGid) {
    throw new Error('Project GID is required to get sections.');
  }

  const default_opt_fields = [
    'name',
    'gid',
    'project.name',
    'project.gid',
    'created_at',
  ];

  const queryParams: Record<string, string | string[]> = {
    opt_fields: opt_fields || default_opt_fields,
  };

  try {
    return await apiClient.request<SectionResponseData[]>(
      `projects/${projectGid}/sections`,
      'GET',
      undefined,
      queryParams,
      requestId,
    );
  } catch (error) {
    console.error(
      `[SectionOperations] Error getting sections for project GID ${projectGid}: ${error}`,
    );
    throw error;
  }
}

/**
 * Create a new section in a project
 *
 * @param apiClient Asana API client
 * @param params Section creation parameters
 * @param requestId Request ID for tracking
 * @returns Created section data
 */
export async function createSectionInProject(
  apiClient: AsanaApiClient,
  params: CreateSectionParams,
  requestId?: string,
): Promise<SectionResponseData> {
  if (!params.name) {
    throw new Error('Section name is required');
  }

  if (!params.projectGid) {
    throw new Error('Project GID is required');
  }

  // Prepare section data
  const sectionData = {
    name: params.name,
  };

  try {
    return await apiClient.request<SectionResponseData>(
      `projects/${params.projectGid}/sections`,
      'POST',
      { data: sectionData },
      undefined,
      requestId,
    );
  } catch (error) {
    console.error(
      `[SectionOperations] Error creating section "${params.name}" in project ${params.projectGid}: ${error}`,
    );
    throw error;
  }
}

/**
 * Add a task to a section
 *
 * @param apiClient Asana API client
 * @param sectionGid GID of the section
 * @param taskGid GID of the task to add
 * @param requestId Request ID for tracking
 * @returns Updated task data (minimal response)
 */
export async function addTaskToSection(
  apiClient: AsanaApiClient,
  sectionGid: string,
  taskGid: string,
  requestId?: string,
): Promise<any> {
  if (!sectionGid) {
    throw new Error('Section GID is required to add task to section.');
  }
  if (!taskGid) {
    throw new Error('Task GID is required to add to section.');
  }

  try {
    return await apiClient.request<any>(
      `sections/${sectionGid}/addTask`,
      'POST',
      { data: { task: taskGid } },
      undefined,
      requestId,
    );
  } catch (error) {
    console.error(
      `[SectionOperations] Error adding task ${taskGid} to section ${sectionGid}: ${error}`,
    );
    throw error;
  }
}

/**
 * Find a section GID by name within a project
 *
 * @param apiClient Asana API client
 * @param sectionName Name of the section to find
 * @param projectGid GID of the project to search within
 * @param requestId Optional request ID for tracking
 * @returns Section GID if found, undefined if not found, 'ambiguous' if multiple matches
 */
export async function findSectionGidByName(
  apiClient: AsanaApiClient,
  sectionName: string,
  projectGid: string,
  requestId?: string,
): Promise<string | undefined | 'ambiguous'> {
  if (!sectionName) {
    throw new Error('Section name is required to find by name.');
  }
  if (!projectGid) {
    throw new Error('Project GID is required to find section by name.');
  }

  try {
    const sections = await getProjectSections(
      apiClient,
      projectGid,
      ['name', 'gid'],
      requestId,
    );

    const matchingSections = sections.filter(
      (section) => section.name.toLowerCase() === sectionName.toLowerCase(),
    );

    if (matchingSections.length === 1) {
      return matchingSections[0].gid;
    } else if (matchingSections.length > 1) {
      return 'ambiguous';
    } else {
      return undefined;
    }
  } catch (error) {
    console.error(
      `[SectionOperations] Error finding section "${sectionName}" in project ${projectGid}: ${error}`,
    );
    throw error;
  }
}
