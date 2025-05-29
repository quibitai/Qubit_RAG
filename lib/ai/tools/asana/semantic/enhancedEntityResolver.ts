/**
 * Enhanced Entity Resolver
 *
 * Integrates semantic entity resolution with Asana API operations
 * Provides intelligent entity matching for tasks, projects, and users
 */

import {
  semanticEntityResolver,
  type EntityResolutionResult,
} from './entityResolver';
import { listProjects } from '../api-client/operations/projects';
import { listWorkspaceUsers } from '../api-client/operations/users';
import { getWorkspaceGid } from '../config';
import type { AsanaApiClient } from '../api-client/client';
import { typeaheadSearch } from '../api-client/operations/search';

export interface EnhancedEntityResolutionOptions {
  sessionId?: string;
  includeCompleted?: boolean;
  projectContext?: string;
  maxResults?: number;
}

export interface ResolvedEntity {
  gid: string;
  name: string;
  type: 'task' | 'project' | 'user';
  confidence: number;
  metadata?: Record<string, any>;
}

export class EnhancedEntityResolver {
  constructor(private client: AsanaApiClient) {}

  /**
   * Resolve a task name to task GID with semantic matching
   */
  async resolveTask(
    query: string,
    options: EnhancedEntityResolutionOptions = {},
  ): Promise<EntityResolutionResult> {
    const workspaceGid = getWorkspaceGid();
    if (!workspaceGid) {
      throw new Error('Workspace GID not configured');
    }

    try {
      // Use typeahead search to get task candidates based on the query
      // This avoids the API constraint issue with listTasks requiring assignee+workspace
      const tasksResponse = await typeaheadSearch(
        this.client,
        {
          workspaceGid,
          query,
          resourceType: 'task',
          opt_fields: ['name', 'completed', 'projects.name', 'assignee.name'],
          count: 20, // Get more candidates for better semantic matching
        },
        'entity-resolution',
      );

      const candidates = tasksResponse.map((task: any) => ({
        gid: task.gid,
        name: task.name,
        metadata: {
          completed: task.completed,
          projectName: task.projects?.[0]?.name,
          assignee: task.assignee?.name,
        },
      }));

      return await semanticEntityResolver.resolveEntity(
        query,
        candidates,
        options.sessionId,
      );
    } catch (error) {
      console.error('[EnhancedEntityResolver] Error resolving task:', error);
      return {
        matches: [],
        isAmbiguous: false,
        needsDisambiguation: false,
        confidence: 0,
        query,
      };
    }
  }

  /**
   * Resolve a project name to project GID with semantic matching
   */
  async resolveProject(
    query: string,
    options: EnhancedEntityResolutionOptions = {},
  ): Promise<EntityResolutionResult> {
    const workspaceGid = getWorkspaceGid();
    if (!workspaceGid) {
      throw new Error('Workspace GID not configured');
    }

    try {
      // Get projects from workspace
      const projectsResponse = await listProjects(
        this.client,
        workspaceGid,
        false, // archived
        'entity-resolution',
      );

      const candidates = projectsResponse.map((project: any) => ({
        gid: project.gid,
        name: project.name,
        metadata: {
          teamName: project.team?.name,
          color: project.color,
          public: project.public,
        },
      }));

      return await semanticEntityResolver.resolveEntity(
        query,
        candidates,
        options.sessionId,
      );
    } catch (error) {
      console.error('[EnhancedEntityResolver] Error resolving project:', error);
      return {
        matches: [],
        isAmbiguous: false,
        needsDisambiguation: false,
        confidence: 0,
        query,
      };
    }
  }

  /**
   * Resolve a user name/email to user GID with semantic matching
   */
  async resolveUser(
    query: string,
    options: EnhancedEntityResolutionOptions = {},
  ): Promise<EntityResolutionResult> {
    const workspaceGid = getWorkspaceGid();
    if (!workspaceGid) {
      throw new Error('Workspace GID not configured');
    }

    try {
      // Get users from workspace
      const usersResponse = await listWorkspaceUsers(
        this.client,
        workspaceGid,
        'entity-resolution',
      );

      const candidates = usersResponse.map((user: any) => ({
        gid: user.gid,
        name: user.name,
        metadata: {
          email: user.email,
        },
      }));

      return await semanticEntityResolver.resolveEntity(
        query,
        candidates,
        options.sessionId,
      );
    } catch (error) {
      console.error('[EnhancedEntityResolver] Error resolving user:', error);
      return {
        matches: [],
        isAmbiguous: false,
        needsDisambiguation: false,
        confidence: 0,
        query,
      };
    }
  }

  /**
   * Resolve any entity type automatically based on context
   */
  async resolveAnyEntity(
    query: string,
    targetEntityType: 'task' | 'project' | 'user' | 'auto',
    options: EnhancedEntityResolutionOptions = {},
  ): Promise<{
    type: 'task' | 'project' | 'user';
    result: EntityResolutionResult;
  }> {
    // Strip @ prefix if present for processing
    const cleanQuery = query.startsWith('@') ? query.slice(1) : query;
    let entityType = targetEntityType;

    if (entityType === 'auto') {
      // Try to determine entity type from query context
      const lowerQuery = cleanQuery.toLowerCase();

      if (
        lowerQuery.includes('@') ||
        lowerQuery.includes('user') ||
        lowerQuery.includes('assignee') ||
        lowerQuery.includes('member')
      ) {
        entityType = 'user';
      } else if (
        lowerQuery.includes('project') ||
        lowerQuery.includes('team')
      ) {
        entityType = 'project';
      } else if (
        // Check if this looks like a person's name (First Last pattern)
        /^[a-z]+\s+[a-z]+$/i.test(lowerQuery) ||
        // Or contains common name patterns
        (lowerQuery.includes(' ') && lowerQuery.split(' ').length === 2)
      ) {
        entityType = 'user';
      } else if (
        // Check if this looks like a project name (single word or common project patterns)
        /^[a-z0-9\s\-_]+$/i.test(lowerQuery) &&
        lowerQuery.length > 2 &&
        !lowerQuery.includes(' ')
      ) {
        entityType = 'project';
      } else {
        entityType = 'task'; // Default to task
      }
    }

    let result: EntityResolutionResult;
    switch (entityType) {
      case 'task':
        result = await this.resolveTask(cleanQuery, options);
        break;
      case 'project':
        result = await this.resolveProject(cleanQuery, options);
        break;
      case 'user':
        result = await this.resolveUser(cleanQuery, options);
        break;
      default:
        throw new Error(`Unknown entity type: ${entityType}`);
    }

    return { type: entityType, result };
  }

  /**
   * Record user selection for learning
   */
  recordUserSelection(
    query: string,
    selectedGid: string,
    selectedName: string,
    sessionId: string,
  ): void {
    semanticEntityResolver.recordUserSelection(
      query,
      selectedGid,
      selectedName,
      sessionId,
    );
  }

  /**
   * Generate disambiguation dialog for multiple matches
   */
  generateDisambiguationDialog(
    result: EntityResolutionResult,
    entityType: string,
  ): string {
    return semanticEntityResolver.generateDisambiguationDialog(
      result,
      entityType,
    );
  }

  /**
   * Get learning statistics
   */
  getLearningStats() {
    return semanticEntityResolver.getLearningStats();
  }
}
