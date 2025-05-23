/**
 * Ambiguity resolution utilities for Asana integration
 * Handles cases where multiple matches are found for user queries
 */

export interface AmbiguityContext {
  query: string;
  resourceType: 'task' | 'project' | 'section' | 'user';
  matches: Array<{
    gid: string;
    name: string;
    context?: string; // Additional context like project name for tasks
    permalink_url?: string;
  }>;
  searchContext?: {
    projectName?: string;
    workspaceName?: string;
  };
}

export interface ResolvedAmbiguity {
  type: 'single' | 'multiple' | 'none';
  gid?: string;
  message: string;
  suggestions?: Array<{
    gid: string;
    displayText: string;
    contextInfo?: string;
  }>;
}

/**
 * Generate user-friendly suggestions when multiple matches are found
 *
 * @param context The ambiguity context with matches and search details
 * @returns Formatted message with suggestions for disambiguation
 */
export function generateAmbiguityMessage(
  context: AmbiguityContext,
): ResolvedAmbiguity {
  if (context.matches.length === 0) {
    return {
      type: 'none',
      message: `No ${context.resourceType} found matching "${context.query}".${
        context.searchContext?.projectName
          ? ` Searched in project "${context.searchContext.projectName}".`
          : ''
      } Please check the spelling or try a more specific search.`,
    };
  }

  if (context.matches.length === 1) {
    return {
      type: 'single',
      gid: context.matches[0].gid,
      message: `Found ${context.resourceType}: "${context.matches[0].name}"${
        context.matches[0].context ? ` (${context.matches[0].context})` : ''
      }`,
    };
  }

  // Multiple matches - generate suggestions
  const suggestions = context.matches.slice(0, 5).map((match) => ({
    gid: match.gid,
    displayText: match.name,
    contextInfo:
      match.context || (match.permalink_url ? 'Click to view' : undefined),
  }));

  const baseMessage = `Found ${context.matches.length} ${context.resourceType}s matching "${context.query}".`;
  const contextMessage = context.searchContext?.projectName
    ? ` Searched in project "${context.searchContext.projectName}".`
    : '';

  const suggestionList = suggestions
    .map(
      (suggestion, index) =>
        `${index + 1}. "${suggestion.displayText}" (GID: ${suggestion.gid})${
          suggestion.contextInfo ? ` - ${suggestion.contextInfo}` : ''
        }`,
    )
    .join('\n');

  const instructionMessage = `\nPlease specify which ${context.resourceType} you meant by using:\n- The exact GID (e.g., "${suggestions[0].gid}")\n- A more specific name that includes distinguishing details\n- Additional context like project name for tasks`;

  return {
    type: 'multiple',
    message: `${baseMessage}${contextMessage}\n\nOptions:\n${suggestionList}${instructionMessage}`,
    suggestions,
  };
}

/**
 * Resolve ambiguity for tasks with enhanced context
 *
 * @param taskName The task name being searched for
 * @param matches Array of matching tasks
 * @param searchContext Optional search context
 * @returns Resolved ambiguity result
 */
export function resolveTaskAmbiguity(
  taskName: string,
  matches: Array<{
    gid: string;
    name: string;
    projects?: Array<{ name: string; gid: string }>;
    permalink_url?: string;
    completed?: boolean;
  }>,
  searchContext?: {
    projectName?: string;
    workspaceName?: string;
  },
): ResolvedAmbiguity {
  const enrichedMatches = matches.map((task) => ({
    gid: task.gid,
    name: task.name,
    context:
      task.projects && task.projects.length > 0
        ? `in ${task.projects[0].name}${task.completed ? ', completed' : ''}`
        : task.completed
          ? 'completed'
          : undefined,
    permalink_url: task.permalink_url,
  }));

  return generateAmbiguityMessage({
    query: taskName,
    resourceType: 'task',
    matches: enrichedMatches,
    searchContext,
  });
}

/**
 * Resolve ambiguity for projects with enhanced context
 *
 * @param projectName The project name being searched for
 * @param matches Array of matching projects
 * @param searchContext Optional search context
 * @returns Resolved ambiguity result
 */
export function resolveProjectAmbiguity(
  projectName: string,
  matches: Array<{
    gid: string;
    name: string;
    team?: { name: string; gid: string };
    archived?: boolean;
    permalink_url?: string;
  }>,
  searchContext?: {
    workspaceName?: string;
  },
): ResolvedAmbiguity {
  const enrichedMatches = matches.map((project) => ({
    gid: project.gid,
    name: project.name,
    context: project.team
      ? `in team ${project.team.name}${project.archived ? ', archived' : ''}`
      : project.archived
        ? 'archived'
        : undefined,
    permalink_url: project.permalink_url,
  }));

  return generateAmbiguityMessage({
    query: projectName,
    resourceType: 'project',
    matches: enrichedMatches,
    searchContext,
  });
}

/**
 * Resolve ambiguity for sections with enhanced context
 *
 * @param sectionName The section name being searched for
 * @param matches Array of matching sections
 * @param searchContext Optional search context
 * @returns Resolved ambiguity result
 */
export function resolveSectionAmbiguity(
  sectionName: string,
  matches: Array<{
    gid: string;
    name: string;
    project?: { name: string; gid: string };
  }>,
  searchContext?: {
    projectName?: string;
    workspaceName?: string;
  },
): ResolvedAmbiguity {
  const enrichedMatches = matches.map((section) => ({
    gid: section.gid,
    name: section.name,
    context: section.project?.name
      ? `in project ${section.project.name}`
      : undefined,
  }));

  return generateAmbiguityMessage({
    query: sectionName,
    resourceType: 'section',
    matches: enrichedMatches,
    searchContext,
  });
}
