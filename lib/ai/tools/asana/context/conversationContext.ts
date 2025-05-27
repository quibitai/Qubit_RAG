/**
 * Enhanced Conversation Context Management for Phase 2
 * Provides persistent conversational memory and intelligent context tracking
 */

import { z } from 'zod';

// Enhanced context item types
export interface TaskContextItem {
  gid: string;
  name: string;
  projectGid?: string;
  projectName?: string;
  assigneeGid?: string;
  assigneeName?: string;
  dueDate?: string;
  completed?: boolean;
  createdAt: number;
  lastMentioned: number;
  operation: 'CREATE' | 'UPDATE' | 'VIEW' | 'COMPLETE' | 'DELETE';
  confidence: number; // How confident we are in this context item
}

export interface ProjectContextItem {
  gid: string;
  name: string;
  teamGid?: string;
  teamName?: string;
  lastUsed: number;
  lastMentioned: number;
  accessLevel?: 'owner' | 'member' | 'viewer';
  confidence: number;
}

export interface UserContextItem {
  gid: string;
  name: string;
  email?: string;
  lastMentioned: number;
  relationship: 'self' | 'teammate' | 'collaborator';
  confidence: number;
}

export interface OperationContextItem {
  type: string;
  parameters: Record<string, any>;
  result: string;
  timestamp: number;
  success: boolean;
}

export interface ConversationMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  metadata?: {
    functionCall?: string;
    parameters?: Record<string, any>;
    entities?: {
      tasks?: string[];
      projects?: string[];
      users?: string[];
    };
  };
}

export interface SessionPreferences {
  defaultProject?: { gid: string; name: string };
  timezone?: string;
  workingHours?: { start: string; end: string };
  notificationPreferences?: Record<string, boolean>;
}

export interface ConversationSession {
  sessionId: string;
  userId?: string;
  startTime: number;
  lastActivity: number;
  messageCount: number;
  messages: ConversationMessage[];
  tasks: Map<string, TaskContextItem>;
  projects: Map<string, ProjectContextItem>;
  users: Map<string, UserContextItem>;
  operations: OperationContextItem[];
  preferences: SessionPreferences;
  contextSummary?: string; // AI-generated summary of the conversation
}

// Context resolution types
export interface ContextResolutionResult {
  resolved: boolean;
  confidence: number;
  resolvedValue?: any;
  reasoning: string;
  alternatives?: Array<{ value: any; confidence: number; reasoning: string }>;
}

export interface ContextReference {
  type: 'task' | 'project' | 'user' | 'operation';
  reference: string; // "that project", "the task I just created", etc.
  context: string; // surrounding context
}

/**
 * Enhanced Conversation Context Manager
 * Provides persistent memory and intelligent context resolution
 */
export class ConversationContextManager {
  private sessions: Map<string, ConversationSession> = new Map();
  private readonly MAX_SESSIONS = 100;
  private readonly SESSION_TTL = 24 * 60 * 60 * 1000; // 24 hours
  private readonly MAX_MESSAGES_PER_SESSION = 200;
  private readonly MAX_CONTEXT_ITEMS = 50;

  /**
   * Get or create a conversation session
   */
  getSession(sessionId: string, userId?: string): ConversationSession {
    let session = this.sessions.get(sessionId);

    if (!session) {
      session = this.createNewSession(sessionId, userId);
      this.sessions.set(sessionId, session);
    } else {
      session.lastActivity = Date.now();
    }

    this.cleanupExpiredSessions();
    return session;
  }

  /**
   * Add a message to the conversation
   */
  addMessage(
    sessionId: string,
    role: 'user' | 'assistant' | 'system',
    content: string,
    metadata?: ConversationMessage['metadata'],
  ): void {
    const session = this.getSession(sessionId);

    const message: ConversationMessage = {
      role,
      content,
      timestamp: Date.now(),
      metadata,
    };

    session.messages.push(message);
    session.messageCount++;
    session.lastActivity = Date.now();

    // Extract entities from the message
    if (role === 'user') {
      this.extractAndUpdateEntities(session, content);
    }

    // Keep messages within limit
    if (session.messages.length > this.MAX_MESSAGES_PER_SESSION) {
      session.messages = session.messages.slice(-this.MAX_MESSAGES_PER_SESSION);
    }

    // Update context summary periodically
    if (session.messageCount % 10 === 0) {
      this.updateContextSummary(session);
    }
  }

  /**
   * Add task context to the session
   */
  addTaskContext(
    sessionId: string,
    task: Omit<TaskContextItem, 'createdAt' | 'lastMentioned' | 'confidence'>,
  ): void {
    const session = this.getSession(sessionId);
    const now = Date.now();

    const taskContext: TaskContextItem = {
      ...task,
      createdAt: now,
      lastMentioned: now,
      confidence: 1.0, // High confidence for explicitly added tasks
    };

    session.tasks.set(task.gid, taskContext);
    this.trimContextItems(session.tasks);
  }

  /**
   * Add project context to the session
   */
  addProjectContext(
    sessionId: string,
    project: Omit<
      ProjectContextItem,
      'lastUsed' | 'lastMentioned' | 'confidence'
    >,
  ): void {
    const session = this.getSession(sessionId);
    const now = Date.now();

    const projectContext: ProjectContextItem = {
      ...project,
      lastUsed: now,
      lastMentioned: now,
      confidence: 1.0,
    };

    session.projects.set(project.gid, projectContext);
    this.trimContextItems(session.projects);
  }

  /**
   * Add user context to the session
   */
  addUserContext(
    sessionId: string,
    user: Omit<UserContextItem, 'lastMentioned' | 'confidence'>,
  ): void {
    const session = this.getSession(sessionId);
    const now = Date.now();

    const userContext: UserContextItem = {
      ...user,
      lastMentioned: now,
      confidence: 1.0,
    };

    session.users.set(user.gid, userContext);
    this.trimContextItems(session.users);
  }

  /**
   * Record an operation in the session
   */
  addOperation(
    sessionId: string,
    operation: Omit<OperationContextItem, 'timestamp'>,
  ): void {
    const session = this.getSession(sessionId);

    const operationContext: OperationContextItem = {
      ...operation,
      timestamp: Date.now(),
    };

    session.operations.push(operationContext);

    // Keep only recent operations
    if (session.operations.length > 20) {
      session.operations = session.operations.slice(-20);
    }
  }

  /**
   * Resolve contextual references intelligently
   */
  resolveContextualReference(
    sessionId: string,
    reference: ContextReference,
    currentMessage: string,
  ): ContextResolutionResult {
    const session = this.getSession(sessionId);

    switch (reference.type) {
      case 'task':
        return this.resolveTaskReference(session, reference, currentMessage);
      case 'project':
        return this.resolveProjectReference(session, reference, currentMessage);
      case 'user':
        return this.resolveUserReference(session, reference, currentMessage);
      case 'operation':
        return this.resolveOperationReference(
          session,
          reference,
          currentMessage,
        );
      default:
        return {
          resolved: false,
          confidence: 0,
          reasoning: `Unknown reference type: ${reference.type}`,
        };
    }
  }

  /**
   * Get conversation context for LLM function extraction
   */
  getConversationContext(sessionId: string): {
    recentMessages: Array<{ role: string; content: string }>;
    lastMentionedProject?: { gid: string; name: string };
    lastCreatedTask?: { gid: string; name: string };
    recentTasks: TaskContextItem[];
    recentProjects: ProjectContextItem[];
    recentUsers: UserContextItem[];
    userPreferences?: SessionPreferences;
    contextSummary?: string;
  } {
    const session = this.getSession(sessionId);

    // Get recent messages (last 5)
    const recentMessages = session.messages
      .slice(-5)
      .map((m) => ({ role: m.role, content: m.content }));

    // Get most recently mentioned project
    const lastMentionedProject = this.getMostRecentProject(session);

    // Get most recently created task
    const lastCreatedTask = this.getMostRecentTask(session, 'CREATE');

    // Get recent context items
    const recentTasks = Array.from(session.tasks.values())
      .sort((a, b) => b.lastMentioned - a.lastMentioned)
      .slice(0, 5);

    const recentProjects = Array.from(session.projects.values())
      .sort((a, b) => b.lastMentioned - a.lastMentioned)
      .slice(0, 3);

    const recentUsers = Array.from(session.users.values())
      .sort((a, b) => b.lastMentioned - a.lastMentioned)
      .slice(0, 3);

    return {
      recentMessages,
      lastMentionedProject: lastMentionedProject
        ? { gid: lastMentionedProject.gid, name: lastMentionedProject.name }
        : undefined,
      lastCreatedTask: lastCreatedTask
        ? { gid: lastCreatedTask.gid, name: lastCreatedTask.name }
        : undefined,
      recentTasks,
      recentProjects,
      recentUsers,
      userPreferences: session.preferences,
      contextSummary: session.contextSummary,
    };
  }

  /**
   * Update session preferences
   */
  updatePreferences(
    sessionId: string,
    preferences: Partial<SessionPreferences>,
  ): void {
    const session = this.getSession(sessionId);
    session.preferences = { ...session.preferences, ...preferences };
  }

  /**
   * Clear session context (for testing or reset)
   */
  clearSession(sessionId: string): void {
    this.sessions.delete(sessionId);
  }

  /**
   * Get session statistics
   */
  getSessionStats(sessionId: string): {
    messageCount: number;
    taskCount: number;
    projectCount: number;
    userCount: number;
    operationCount: number;
    sessionAge: number;
  } {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return {
        messageCount: 0,
        taskCount: 0,
        projectCount: 0,
        userCount: 0,
        operationCount: 0,
        sessionAge: 0,
      };
    }

    return {
      messageCount: session.messageCount,
      taskCount: session.tasks.size,
      projectCount: session.projects.size,
      userCount: session.users.size,
      operationCount: session.operations.length,
      sessionAge: Date.now() - session.startTime,
    };
  }

  // Private helper methods

  private createNewSession(
    sessionId: string,
    userId?: string,
  ): ConversationSession {
    const now = Date.now();
    return {
      sessionId,
      userId,
      startTime: now,
      lastActivity: now,
      messageCount: 0,
      messages: [],
      tasks: new Map(),
      projects: new Map(),
      users: new Map(),
      operations: [],
      preferences: {},
    };
  }

  private extractAndUpdateEntities(
    session: ConversationSession,
    content: string,
  ): void {
    // Simple entity extraction - could be enhanced with NLP
    const taskPatterns = [
      /task[s]?\s+(?:called|named)\s+"([^"]+)"/gi,
      /create[d]?\s+(?:a\s+)?task[s]?\s+"([^"]+)"/gi,
      /"([^"]+)"\s+task/gi,
    ];

    const projectPatterns = [
      /project[s]?\s+(?:called|named)\s+"([^"]+)"/gi,
      /in\s+(?:the\s+)?project\s+"([^"]+)"/gi,
      /"([^"]+)"\s+project/gi,
    ];

    // Extract and update mention timestamps
    for (const pattern of taskPatterns) {
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(content)) !== null) {
        const taskName = match[1];
        // Find matching task in context and update lastMentioned
        for (const task of session.tasks.values()) {
          if (task.name.toLowerCase().includes(taskName.toLowerCase())) {
            task.lastMentioned = Date.now();
            task.confidence = Math.min(task.confidence + 0.1, 1.0);
          }
        }
      }
    }

    for (const pattern of projectPatterns) {
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(content)) !== null) {
        const projectName = match[1];
        // Find matching project in context and update lastMentioned
        for (const project of session.projects.values()) {
          if (project.name.toLowerCase().includes(projectName.toLowerCase())) {
            project.lastMentioned = Date.now();
            project.confidence = Math.min(project.confidence + 0.1, 1.0);
          }
        }
      }
    }
  }

  private resolveTaskReference(
    session: ConversationSession,
    reference: ContextReference,
    currentMessage: string,
  ): ContextResolutionResult {
    const ref = reference.reference.toLowerCase();

    if (ref.includes('just created') || ref.includes('last created')) {
      const recentTask = this.getMostRecentTask(session, 'CREATE');
      if (recentTask) {
        return {
          resolved: true,
          confidence: 0.9,
          resolvedValue: { gid: recentTask.gid, name: recentTask.name },
          reasoning: `Resolved to most recently created task: "${recentTask.name}"`,
        };
      }
    }

    if (ref.includes('that task') || ref.includes('this task')) {
      const recentTask = this.getMostRecentTask(session);
      if (recentTask) {
        return {
          resolved: true,
          confidence: 0.8,
          resolvedValue: { gid: recentTask.gid, name: recentTask.name },
          reasoning: `Resolved to most recently mentioned task: "${recentTask.name}"`,
        };
      }
    }

    return {
      resolved: false,
      confidence: 0,
      reasoning: 'No matching task found in conversation context',
    };
  }

  private resolveProjectReference(
    session: ConversationSession,
    reference: ContextReference,
    currentMessage: string,
  ): ContextResolutionResult {
    const ref = reference.reference.toLowerCase();

    if (ref.includes('that project') || ref.includes('this project')) {
      const recentProject = this.getMostRecentProject(session);
      if (recentProject) {
        return {
          resolved: true,
          confidence: 0.8,
          resolvedValue: { gid: recentProject.gid, name: recentProject.name },
          reasoning: `Resolved to most recently mentioned project: "${recentProject.name}"`,
        };
      }
    }

    if (ref.includes('same project') || ref.includes('current project')) {
      const recentProject = this.getMostRecentProject(session);
      if (recentProject) {
        return {
          resolved: true,
          confidence: 0.9,
          resolvedValue: { gid: recentProject.gid, name: recentProject.name },
          reasoning: `Resolved to current project context: "${recentProject.name}"`,
        };
      }
    }

    return {
      resolved: false,
      confidence: 0,
      reasoning: 'No matching project found in conversation context',
    };
  }

  private resolveUserReference(
    session: ConversationSession,
    reference: ContextReference,
    currentMessage: string,
  ): ContextResolutionResult {
    const ref = reference.reference.toLowerCase();

    if (ref.includes('me') || ref.includes('myself')) {
      const selfUser = Array.from(session.users.values()).find(
        (u) => u.relationship === 'self',
      );

      if (selfUser) {
        return {
          resolved: true,
          confidence: 1.0,
          resolvedValue: { gid: selfUser.gid, name: selfUser.name },
          reasoning: 'Resolved to current user',
        };
      }
    }

    return {
      resolved: false,
      confidence: 0,
      reasoning: 'No matching user found in conversation context',
    };
  }

  private resolveOperationReference(
    session: ConversationSession,
    reference: ContextReference,
    currentMessage: string,
  ): ContextResolutionResult {
    const recentOperation = session.operations
      .filter((op) => op.success)
      .sort((a, b) => b.timestamp - a.timestamp)[0];

    if (recentOperation) {
      return {
        resolved: true,
        confidence: 0.7,
        resolvedValue: recentOperation,
        reasoning: `Resolved to most recent operation: ${recentOperation.type}`,
      };
    }

    return {
      resolved: false,
      confidence: 0,
      reasoning: 'No recent operations found',
    };
  }

  private getMostRecentTask(
    session: ConversationSession,
    operation?: string,
  ): TaskContextItem | null {
    const tasks = Array.from(session.tasks.values());

    if (operation) {
      return (
        tasks
          .filter((t) => t.operation === operation)
          .sort((a, b) => b.lastMentioned - a.lastMentioned)[0] || null
      );
    }

    return tasks.sort((a, b) => b.lastMentioned - a.lastMentioned)[0] || null;
  }

  private getMostRecentProject(
    session: ConversationSession,
  ): ProjectContextItem | null {
    return (
      Array.from(session.projects.values()).sort(
        (a, b) => b.lastMentioned - a.lastMentioned,
      )[0] || null
    );
  }

  private trimContextItems<T>(contextMap: Map<string, T>): void {
    if (contextMap.size > this.MAX_CONTEXT_ITEMS) {
      const entries = Array.from(contextMap.entries());
      const sortedEntries = entries.sort((a, b) => {
        const aTime =
          (a[1] as any).lastMentioned || (a[1] as any).lastUsed || 0;
        const bTime =
          (b[1] as any).lastMentioned || (b[1] as any).lastUsed || 0;
        return bTime - aTime;
      });

      contextMap.clear();
      sortedEntries.slice(0, this.MAX_CONTEXT_ITEMS).forEach(([key, value]) => {
        contextMap.set(key, value);
      });
    }
  }

  private updateContextSummary(session: ConversationSession): void {
    // Simple summary generation - could be enhanced with AI
    const taskCount = session.tasks.size;
    const projectCount = session.projects.size;
    const messageCount = session.messageCount;

    session.contextSummary = `Conversation with ${messageCount} messages, discussing ${taskCount} tasks across ${projectCount} projects.`;
  }

  private cleanupExpiredSessions(): void {
    const now = Date.now();

    for (const [sessionId, session] of this.sessions.entries()) {
      if (now - session.lastActivity > this.SESSION_TTL) {
        this.sessions.delete(sessionId);
      }
    }

    // Keep only most recent sessions if we have too many
    if (this.sessions.size > this.MAX_SESSIONS) {
      const sortedSessions = Array.from(this.sessions.entries()).sort(
        ([, a], [, b]) => b.lastActivity - a.lastActivity,
      );

      this.sessions.clear();
      sortedSessions.slice(0, this.MAX_SESSIONS).forEach(([id, session]) => {
        this.sessions.set(id, session);
      });
    }
  }
}

// Export singleton instance
export const conversationContextManager = new ConversationContextManager();

// Types are already exported above as interfaces
