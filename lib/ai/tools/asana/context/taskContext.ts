/**
 * Task Context Memory System
 * Tracks recent tasks and projects to provide context when user inputs are incomplete
 */

interface TaskContextItem {
  taskGid: string;
  taskName: string;
  projectGid?: string;
  projectName?: string;
  createdAt: number;
  operation: 'CREATE' | 'UPDATE' | 'VIEW';
}

interface ProjectContextItem {
  projectGid: string;
  projectName: string;
  lastUsedAt: number;
}

class TaskContextManager {
  private recentTasks: Map<string, TaskContextItem> = new Map(); // keyed by requestId or sessionId
  private recentProjects: Map<string, ProjectContextItem> = new Map(); // keyed by projectGid
  private readonly MAX_RECENT_TASKS = 10;
  private readonly MAX_RECENT_PROJECTS = 5;
  private readonly CONTEXT_TTL = 30 * 60 * 1000; // 30 minutes

  /**
   * Add a task to the recent context
   */
  addTaskContext(
    sessionId: string,
    taskGid: string,
    taskName: string,
    operation: 'CREATE' | 'UPDATE' | 'VIEW',
    projectGid?: string,
    projectName?: string,
  ): void {
    const contextItem: TaskContextItem = {
      taskGid,
      taskName,
      projectGid,
      projectName,
      createdAt: Date.now(),
      operation,
    };

    this.recentTasks.set(`${sessionId}_${taskGid}`, contextItem);

    // Add project context if provided
    if (projectGid && projectName) {
      this.addProjectContext(projectGid, projectName);
    }

    // Clean up old entries
    this.cleanupExpiredEntries();
  }

  /**
   * Add a project to the recent context
   */
  addProjectContext(projectGid: string, projectName: string): void {
    this.recentProjects.set(projectGid, {
      projectGid,
      projectName,
      lastUsedAt: Date.now(),
    });

    // Keep only the most recent projects
    if (this.recentProjects.size > this.MAX_RECENT_PROJECTS) {
      const sortedProjects = Array.from(this.recentProjects.values()).sort(
        (a, b) => b.lastUsedAt - a.lastUsedAt,
      );

      this.recentProjects.clear();
      sortedProjects.slice(0, this.MAX_RECENT_PROJECTS).forEach((project) => {
        this.recentProjects.set(project.projectGid, project);
      });
    }
  }

  /**
   * Get the most recent task for a session (for subtask context)
   */
  getMostRecentTask(sessionId: string): TaskContextItem | null {
    const sessionTasks = Array.from(this.recentTasks.entries())
      .filter(([key]) => key.startsWith(`${sessionId}_`))
      .map(([, value]) => value)
      .sort((a, b) => b.createdAt - a.createdAt);

    return sessionTasks.length > 0 ? sessionTasks[0] : null;
  }

  /**
   * Get the most recent project used
   */
  getMostRecentProject(): ProjectContextItem | null {
    const projects = Array.from(this.recentProjects.values()).sort(
      (a, b) => b.lastUsedAt - a.lastUsedAt,
    );

    return projects.length > 0 ? projects[0] : null;
  }

  /**
   * Find a recent task by name
   */
  findRecentTaskByName(
    sessionId: string,
    taskName: string,
  ): TaskContextItem | null {
    const sessionTasks = Array.from(this.recentTasks.entries())
      .filter(([key]) => key.startsWith(`${sessionId}_`))
      .map(([, value]) => value)
      .filter((task) =>
        task.taskName.toLowerCase().includes(taskName.toLowerCase()),
      )
      .sort((a, b) => b.createdAt - a.createdAt);

    return sessionTasks.length > 0 ? sessionTasks[0] : null;
  }

  /**
   * Find a recent project by name
   */
  findRecentProjectByName(projectName: string): ProjectContextItem | null {
    const projects = Array.from(this.recentProjects.values())
      .filter((project) =>
        project.projectName.toLowerCase().includes(projectName.toLowerCase()),
      )
      .sort((a, b) => b.lastUsedAt - a.lastUsedAt);

    return projects.length > 0 ? projects[0] : null;
  }

  /**
   * Clean up expired entries
   */
  private cleanupExpiredEntries(): void {
    const now = Date.now();

    // Clean up old tasks
    for (const [key, task] of this.recentTasks.entries()) {
      if (now - task.createdAt > this.CONTEXT_TTL) {
        this.recentTasks.delete(key);
      }
    }

    // Keep only most recent tasks if we have too many
    if (this.recentTasks.size > this.MAX_RECENT_TASKS) {
      const sortedTasks = Array.from(this.recentTasks.entries()).sort(
        ([, a], [, b]) => b.createdAt - a.createdAt,
      );

      this.recentTasks.clear();
      sortedTasks.slice(0, this.MAX_RECENT_TASKS).forEach(([key, task]) => {
        this.recentTasks.set(key, task);
      });
    }

    // Clean up old projects
    for (const [key, project] of this.recentProjects.entries()) {
      if (now - project.lastUsedAt > this.CONTEXT_TTL) {
        this.recentProjects.delete(key);
      }
    }
  }

  /**
   * Get session ID from request context
   * For now, we'll use a simple approach based on time windows
   * In a real implementation, this could be based on chat session IDs
   */
  getSessionId(requestId: string): string {
    // Simple time-based session: group requests within 1 hour
    const sessionWindow = 60 * 60 * 1000; // 1 hour
    const sessionTimestamp = Math.floor(Date.now() / sessionWindow);
    return `session_${sessionTimestamp}`;
  }

  /**
   * Clear all context (for testing or reset)
   */
  clear(): void {
    this.recentTasks.clear();
    this.recentProjects.clear();
  }
}

// Export a singleton instance
export const taskContextManager = new TaskContextManager();

export type { TaskContextItem, ProjectContextItem };
