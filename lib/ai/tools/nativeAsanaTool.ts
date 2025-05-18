import { Tool } from '@langchain/core/tools';
import { z } from 'zod';

// Define the input schema for the Native Asana tool
const NativeAsanaToolInputSchema = z.object({
  action_description: z
    .string()
    .describe(
      'A clear, natural language description of the Asana operation to be performed directly via the Asana API. ' +
        'Example: \'Create a new task in Asana titled "Review Q4 budget" and assign it to me in the "Finance Team" project.\' ' +
        "Or: 'List all my incomplete tasks in the Marketing project on Asana.' " +
        'Or: \'Mark my "Update website content" task as complete in Asana.\'',
    ),
  input: z
    .string()
    .optional()
    .describe(
      'Alternative way to provide the action description, for compatibility with some LLM formats.',
    ),
  toolInput: z
    .object({
      action_description: z.string(),
    })
    .optional()
    .describe('Tool-specific input format for some LLM integrations.'),
});

class NativeAsanaTool extends Tool {
  name = 'nativeAsana';
  description =
    'A tool that connects DIRECTLY to the Asana API to perform operations. ' +
    'Use this for ALL Asana-related tasks such as creating, listing, updating, or completing Asana tasks and projects. ' +
    'This is the preferred tool for any Asana-related operations, providing a native integration. ' +
    "The input must be an object containing an 'action_description' field with a clear natural language description of the Asana operation.";

  zodSchema = NativeAsanaToolInputSchema;
  private asanaApiBaseUrl = 'https://app.asana.com/api/1.0';
  private apiKey: string | undefined;
  private timeoutMs = Number.parseInt(
    process.env.NATIVE_ASANA_TIMEOUT_MS || '30000',
    10,
  );

  protected async _call(
    args: z.infer<typeof NativeAsanaToolInputSchema>,
  ): Promise<string> {
    const requestId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    console.log(
      `NativeAsanaTool [${requestId}]: Starting execution with args:`,
      JSON.stringify(args),
    );

    let actionDescription: string;

    if (args === null || args === undefined) {
      const errorMsg = `NativeAsanaTool [${requestId}]: Error: Received null or undefined input`;
      console.error(errorMsg);
      return errorMsg.replace(`NativeAsanaTool [${requestId}]: `, ''); // Return cleaner message
    }

    if (typeof args === 'string') {
      actionDescription = args;
    } else if (typeof args === 'object') {
      if (args.action_description) {
        actionDescription = args.action_description;
      } else if (args.input) {
        actionDescription = args.input;
      } else if (
        args.toolInput &&
        typeof args.toolInput === 'object' &&
        (args.toolInput as { action_description?: string }).action_description
      ) {
        actionDescription = (args.toolInput as { action_description: string })
          .action_description;
      } else {
        const errorMsg = `NativeAsanaTool [${requestId}]: Invalid input: Missing 'action_description', 'input', or valid 'toolInput' field`;
        console.error(errorMsg, JSON.stringify(args));
        return errorMsg.replace(`NativeAsanaTool [${requestId}]: `, '');
      }
    } else {
      const errorMsg = `NativeAsanaTool [${requestId}]: Invalid input: Expected string or object, but received ${typeof args}`;
      console.error(errorMsg);
      return errorMsg.replace(`NativeAsanaTool [${requestId}]: `, '');
    }

    if (!actionDescription) {
      const errorMsg = `NativeAsanaTool [${requestId}]: Error: No action description provided. Cannot determine the Asana request.`;
      console.error(errorMsg);
      return errorMsg.replace(`NativeAsanaTool [${requestId}]: `, '');
    }

    console.log(
      `NativeAsanaTool [${requestId}]: Using action_description: "${actionDescription}"`,
    );

    // API Key Retrieval
    const defaultApiKeyEnvVar = 'NATIVE_ASANA_PAT';
    const fallbackApiKeyEnvVar = 'ASANA_PAT';
    if (global.CURRENT_TOOL_CONFIGS?.nativeAsana?.apiKey) {
      this.apiKey = global.CURRENT_TOOL_CONFIGS.nativeAsana.apiKey;
      console.log(
        `NativeAsanaTool [${requestId}]: Using client-specific API key.`,
      );
    } else {
      this.apiKey =
        process.env[defaultApiKeyEnvVar] || process.env[fallbackApiKeyEnvVar];
      if (this.apiKey) {
        console.log(
          `NativeAsanaTool [${requestId}]: Using API key from environment variable (${process.env[defaultApiKeyEnvVar] ? defaultApiKeyEnvVar : fallbackApiKeyEnvVar}).`,
        );
      }
    }
    if (!this.apiKey) {
      const errorMsg = `NativeAsanaTool [${requestId}]: Error: Asana API key not found. Configure client-specific 'nativeAsana.apiKey' or env vars '${defaultApiKeyEnvVar}'/'${fallbackApiKeyEnvVar}'.`;
      console.error(errorMsg);
      return errorMsg.replace(`NativeAsanaTool [${requestId}]: `, '');
    }

    // Initialize variables for intent parsing
    let operationType = 'unknown';
    let taskNameForCreation: string | undefined;
    let taskNotes: string | undefined;
    let projectName: string | undefined;
    let workspaceGid: string | undefined;
    let defaultTeamGid: string | undefined;
    let responseStringForListTasksPrefix = ''; // Must be 'let'

    const lowerActionDescription = actionDescription.toLowerCase();

    // Intent Parsing Logic
    if (
      lowerActionDescription.includes('create project') ||
      lowerActionDescription.includes('create a new project') ||
      lowerActionDescription.includes('make a project') ||
      lowerActionDescription.includes('new project')
    ) {
      operationType = 'createProject';
      console.log(
        `NativeAsanaTool [${requestId}]: Detected operation: createProject.`,
      );
      const projectNameMatch = actionDescription.match(
        /(?:create|make)\s+(?:a\s+new\s+)?project(?:\s+in\s+[\w\s]+)?\s+(?:called|named|titled)\s*["']([^"']+)["']/i,
      );
      if (projectNameMatch?.[1]) {
        projectName = projectNameMatch[1];
      } else {
        const simpleMatch = actionDescription.match(
          /project\s*.*?["']([^"']+)["']/i,
        );
        if (simpleMatch?.[1]) projectName = simpleMatch[1];
      }
      console.log(
        `NativeAsanaTool [${requestId}]: Extracted projectName for createProject: "${projectName}"`,
      );
    } else if (
      lowerActionDescription.match(
        /(create|add|new) (an |a |new )?(asana )?task/,
      )
    ) {
      operationType = 'createTask';
      // (Your existing detailed task creation parameter extraction logic - appears largely okay for now)
      // For brevity, assuming your existing task name/notes/project name extraction for createTask
      // ... (ensure taskNameForCreation, taskNotes, projectName are populated if applicable) ...
      console.log(
        `NativeAsanaTool [${requestId}]: Detected operation: createTask.`,
      );
      // Placeholder for your detailed extraction:
      const titleNotesMatch = lowerActionDescription.match(
        /(?:titled|called|named)\s*['"]([^'"]+)['"][^'"]*(?:with\s+(?:notes|description)[^'"]*['"]([^'"]+)['"])?/i,
      );
      if (titleNotesMatch) {
        taskNameForCreation = titleNotesMatch[1];
        if (titleNotesMatch[2]) taskNotes = titleNotesMatch[2];
      } else {
        /* ... your other fallbacks ... */
      }
      const projectPatternMatch = lowerActionDescription.match(
        /(?:in|for)\s+(?:project|the project)\s*["']([^"']+)["']/i,
      );
      if (projectPatternMatch?.[1]) projectName = projectPatternMatch[1];
    } else if (
      (lowerActionDescription.includes('update') ||
        lowerActionDescription.includes('edit')) /*...etc...*/ &&
      (lowerActionDescription.includes('task') ||
        lowerActionDescription.includes('asana'))
    ) {
      operationType = 'updateTaskDescription';
      // (Your existing updateTaskDescription parameter extraction)
      console.log(
        `NativeAsanaTool [${requestId}]: Detected operation: updateTaskDescription.`,
      );
      // Placeholder:
      const taskNamePatternMatch = lowerActionDescription.match(
        /(?:task\s+(?:called|named|titled|is|:|that\s+is)?\s*["']([^"']+)["'])|(?:(?:the|a)\s+task\s*["']([^"']+)["'])/i,
      );
      if (taskNamePatternMatch)
        taskNameForCreation =
          taskNamePatternMatch[1] || taskNamePatternMatch[2]; // using taskNameForCreation for the target task name
      const descPatternMatch = lowerActionDescription.match(
        /(?:description|desc|notes?)\s*(?:to|that says|:)?\s*["']([^"']+)["']/i,
      );
      if (descPatternMatch?.[1]) taskNotes = descPatternMatch[1]; // using taskNotes for new description
      const projectContextMatch = lowerActionDescription.match(
        /(?:in|for)\s+(?:project|the project|the)\s*["']([^"']+)["']/i,
      );
      if (projectContextMatch?.[1]) projectName = projectContextMatch[1];
    } else if (
      lowerActionDescription.includes('user info') ||
      lowerActionDescription.includes('who am i') /*...etc...*/
    ) {
      if (operationType !== 'createTask' && operationType !== 'createProject') {
        // Avoid conflict
        operationType = 'getUsersMe';
        console.log(
          `NativeAsanaTool [${requestId}]: Detected operation: getUsersMe.`,
        );
      }
    } else if (
      (lowerActionDescription.includes('list') ||
        lowerActionDescription.includes('show') ||
        lowerActionDescription.includes('get') ||
        lowerActionDescription.includes('view')) &&
      lowerActionDescription.includes('project') && // "project" or "projects"
      !lowerActionDescription.includes('task') &&
      !lowerActionDescription.includes('create') &&
      !lowerActionDescription.includes('update')
    ) {
      if (
        lowerActionDescription.match(
          /\b(list|show|get|view)\s+(all\s+)?(my\s+)?projects?\b/i,
        )
      ) {
        operationType = 'listProjects';
        console.log(
          `NativeAsanaTool [${requestId}]: Detected operation: listProjects.`,
        );
      }
    } else if (
      lowerActionDescription.includes('list tasks') ||
      lowerActionDescription.includes('show tasks') /*...etc...*/ ||
      (lowerActionDescription.includes('list') &&
        lowerActionDescription.includes('tasks'))
    ) {
      operationType = 'listTasks';
      const projectListMatch =
        lowerActionDescription.match(
          /(?:in|for)\s+(?:project|the project)\s*["']([^"']+)["']/i,
        ) || lowerActionDescription.match(/project\s*["']([^"']+)["']/i);
      if (projectListMatch?.[1]) {
        projectName = projectListMatch[1];
        console.log(
          `NativeAsanaTool [${requestId}]: Detected operation: listTasks in project: "${projectName}"`,
        );
      } else {
        console.log(
          `NativeAsanaTool [${requestId}]: Detected operation: listTasks (general).`,
        );
      }
    } else if (
      lowerActionDescription.includes('show details') ||
      lowerActionDescription.includes('get details') ||
      lowerActionDescription.includes('task details') ||
      lowerActionDescription.includes('task info')
    ) {
      operationType = 'getTaskDetails';
      console.log(
        `NativeAsanaTool [${requestId}]: Detected operation: getTaskDetails.`,
      );
      // Try to extract GID from input
      const directTaskGid = this.extractTaskGidFromInput(actionDescription);
      if (directTaskGid) {
        taskNameForCreation = undefined;
        (args as any).directTaskGid = directTaskGid;
        console.log(
          `NativeAsanaTool [${requestId}]: Extracted direct task GID: ${directTaskGid}`,
        );
      } else {
        // Fallback to extracting names
        const {
          taskName,
          projectName: pName,
          workspaceName: wName,
        } = this.extractNamesFromInput(actionDescription);
        taskNameForCreation = taskName;
        projectName = pName;
        (args as any).workspaceName = wName;
        console.log(
          `NativeAsanaTool [${requestId}]: Extracted taskName: "${taskName}", projectName: "${pName}", workspaceName: "${wName}"`,
        );
      }
    }

    // Workspace GID Retrieval (centralized)
    if (
      [
        'createTask',
        'listTasks',
        'updateTaskDescription',
        'createProject',
        'listProjects',
        'getTaskDetails',
      ].includes(operationType)
    ) {
      workspaceGid =
        global.CURRENT_TOOL_CONFIGS?.nativeAsana?.defaultWorkspaceGid ||
        process.env.ASANA_DEFAULT_WORKSPACE_GID ||
        '1208105180296349'; // Known workspace ID for LWCC tasks

      console.log(
        `NativeAsanaTool [${requestId}]: Using workspaceGid: ${workspaceGid} (from config, env, or known ID).`,
      );

      if (
        !workspaceGid &&
        [
          'createTask',
          'listTasks',
          'createProject',
          'listProjects',
          'getTaskDetails',
        ].includes(operationType)
      ) {
        const errorMsg = `NativeAsanaTool [${requestId}]: Error: Asana Workspace GID is not available for operation '${operationType}'.`;
        console.error(errorMsg);
        return errorMsg.replace(`NativeAsanaTool [${requestId}]: `, '');
      }
    }

    // Team GID Retrieval (specifically for createProject)
    if (operationType === 'createProject') {
      defaultTeamGid =
        global.CURRENT_TOOL_CONFIGS?.nativeAsana?.defaultTeamGid ||
        process.env.ASANA_DEFAULT_TEAM_GID;
      if (defaultTeamGid) {
        console.log(
          `NativeAsanaTool [${requestId}]: Using defaultTeamGid: ${defaultTeamGid} (from config or env).`,
        );
      } else {
        // DO NOT FALLBACK TO WORKSPACE GID. Error out if not configured.
        const errorMsg = `NativeAsanaTool [${requestId}]: Error: Default Team GID for project creation is not configured (client config or ASANA_DEFAULT_TEAM_GID env var).`;
        console.error(errorMsg);
        return errorMsg.replace(`NativeAsanaTool [${requestId}]: `, '');
      }
    }

    // API Call and Response Handling
    try {
      let endpoint = '';
      let method = 'GET';
      let bodyPayload: object | null = null;
      let queryParams = new URLSearchParams(); // Initialize for potential use

      // Build endpoint, method, bodyPayload, queryParams based on operationType
      if (operationType === 'createProject') {
        if (!projectName)
          return `Error: Project name is required to create a project. Request ID: ${requestId}`;
        if (!workspaceGid)
          return `Error: Workspace GID is required to create a project. Request ID: ${requestId}`; // Should be caught earlier
        if (!defaultTeamGid)
          return `Error: Team GID is required to create a project for this configuration. Request ID: ${requestId}`; // Should be caught earlier

        method = 'POST';
        endpoint = `${this.asanaApiBaseUrl}/projects`;
        bodyPayload = {
          data: {
            name: projectName,
            workspace: workspaceGid,
            team: defaultTeamGid,
          },
        };
        console.log(
          `NativeAsanaTool [${requestId}]: createProject - Payload: ${JSON.stringify(bodyPayload)}`,
        );
      } else if (operationType === 'createTask') {
        if (!taskNameForCreation)
          return `Error: Task name is required to create a task. Request ID: ${requestId}`;
        if (!workspaceGid)
          return `Error: Workspace GID is required for task creation. Request ID: ${requestId}`;

        method = 'POST';
        endpoint = `${this.asanaApiBaseUrl}/tasks`;
        const taskData: {
          name: string;
          notes?: string;
          workspace: string;
          projects?: string[];
        } = {
          name: taskNameForCreation,
          workspace: workspaceGid,
        };
        if (taskNotes) taskData.notes = taskNotes;
        if (projectName && workspaceGid) {
          // workspaceGid check is redundant here but good for clarity
          const projectGid = await this._findProjectGidByName(
            projectName,
            workspaceGid,
            this.apiKey,
            requestId,
          );
          if (projectGid) {
            taskData.projects = [projectGid];
          } else {
            console.warn(
              `NativeAsanaTool [${requestId}]: createTask - Project "${projectName}" not found. Creating task without project assignment.`,
            );
            taskData.notes = `${taskData.notes || ''}\n(Intended for project: ${projectName} - GID not found)`;
          }
        }
        bodyPayload = { data: taskData };
        console.log(
          `NativeAsanaTool [${requestId}]: createTask - Payload: ${JSON.stringify(bodyPayload)}`,
        );
      } else if (operationType === 'updateTaskDescription') {
        if (!taskNameForCreation)
          return `Error: Target task name is required for update. Request ID: ${requestId}`;
        if (!taskNotes)
          return `Error: New description/notes are required for update. Request ID: ${requestId}`;
        if (!workspaceGid)
          return `Error: Workspace GID is required for task update. Request ID: ${requestId}`;

        const targetTaskGid = await this._findTaskGidByName(
          taskNameForCreation,
          workspaceGid,
          this.apiKey,
          requestId,
          projectName,
        );
        if (!targetTaskGid)
          return `Error: Could not find task "${taskNameForCreation}" ${projectName ? `in project "${projectName}"` : ''} to update. Request ID: ${requestId}`;

        method = 'PUT';
        endpoint = `${this.asanaApiBaseUrl}/tasks/${targetTaskGid}`;
        bodyPayload = { data: { notes: taskNotes } };
        console.log(
          `NativeAsanaTool [${requestId}]: updateTaskDescription - Payload: ${JSON.stringify(bodyPayload)} for GID ${targetTaskGid}`,
        );
      } else if (operationType === 'getUsersMe') {
        method = 'GET';
        endpoint = `${this.asanaApiBaseUrl}/users/me`;
      } else if (operationType === 'listProjects') {
        if (!workspaceGid)
          return `Error: Workspace GID is required to list projects. Request ID: ${requestId}`;
        method = 'GET';
        queryParams = new URLSearchParams(); // Reset for clarity
        queryParams.append('workspace', workspaceGid);
        queryParams.append(
          'opt_fields',
          'name,gid,permalink_url,archived,color,team.name,created_at,current_status.title,current_status.color,due_date',
        );
        queryParams.append('archived', 'false');
        endpoint = `${this.asanaApiBaseUrl}/projects?${queryParams.toString()}`;
        console.log(
          `NativeAsanaTool [${requestId}]: listProjects - Endpoint: ${endpoint}`,
        );
      } else if (operationType === 'listTasks') {
        if (!workspaceGid)
          return `Error: Workspace GID is required to list tasks. Request ID: ${requestId}`;
        method = 'GET';
        queryParams = new URLSearchParams(); // Reset for clarity for this operation's logic flow

        const isMyTasksIntent =
          lowerActionDescription.includes('my tasks') ||
          lowerActionDescription.includes('assigned to me');
        console.log(
          `NativeAsanaTool [${requestId}]: listTasks - isMyTasksIntent: ${isMyTasksIntent}, For project: "${projectName || 'N/A'}"`,
        );

        if (projectName) {
          console.log(
            `NativeAsanaTool [${requestId}]: listTasks - Looking for project GID: "${projectName}"`,
          );
          const projectGidToList = await this._findProjectGidByName(
            projectName,
            workspaceGid,
            this.apiKey,
            requestId,
          );

          if (projectGidToList) {
            console.log(
              `NativeAsanaTool [${requestId}]: listTasks - Project GID FOUND: ${projectGidToList}. Querying with 'project' parameter.`,
            );
            queryParams.append('project', projectGidToList);
            if (isMyTasksIntent) {
              queryParams.append('assignee', 'me');
              console.log(
                `NativeAsanaTool [${requestId}]: listTasks (Project Found) - Added 'assignee=me'.`,
              );
            }
            // Workspace GID is not added if project GID is present
          } else {
            console.warn(
              `NativeAsanaTool [${requestId}]: listTasks - Project GID for "${projectName}" NOT FOUND. Fallback to workspace tasks for user.`,
            );
            responseStringForListTasksPrefix = `Note: Could not find project "${projectName}". Showing ${isMyTasksIntent ? 'your' : 'all accessible'} tasks in the workspace instead.\n\n`;
            console.log(
              `NativeAsanaTool [${requestId}]: listTasks - Set responseStringForListTasksPrefix: "${responseStringForListTasksPrefix}"`,
            );
            if (isMyTasksIntent) queryParams.append('assignee', 'me');
            queryParams.append('workspace', workspaceGid);
          }
        } else {
          // No project specified, list tasks for user in workspace
          console.log(
            `NativeAsanaTool [${requestId}]: listTasks - No project specified. Defaulting to tasks in workspace ${workspaceGid}.`,
          );
          if (isMyTasksIntent) queryParams.append('assignee', 'me');
          queryParams.append('workspace', workspaceGid);
        }
        queryParams.append(
          'opt_fields',
          'name,due_on,completed,assignee.name,projects.name,permalink_url',
        );
        queryParams.append('completed_since', 'now');
        endpoint = `${this.asanaApiBaseUrl}/tasks?${queryParams.toString()}`;
        console.log(
          `NativeAsanaTool [${requestId}]: listTasks - Final Query Params: ${queryParams.toString()}`,
        );
      } else if (operationType === 'getTaskDetails') {
        // 1. If direct GID is present, fetch directly
        const directTaskGid = (args as any).directTaskGid;
        if (directTaskGid) {
          method = 'GET';
          endpoint = `${this.asanaApiBaseUrl}/tasks/${directTaskGid}`;
          queryParams.append(
            'opt_fields',
            'name,notes,due_on,completed,assignee.name,projects.name,permalink_url,created_at,modified_at,parent.name',
          );
          endpoint = `${endpoint}?${queryParams.toString()}`;
          console.log(
            `NativeAsanaTool [${requestId}]: getTaskDetails - Using direct GID: ${directTaskGid}`,
          );
        } else if (taskNameForCreation && projectName) {
          // 2. If task name + project name, lookup project GID, then search tasks in project
          if (!projectName) {
            return `Error: Project name is required to look up a task by name in a project. Request ID: ${requestId}`;
          }
          if (!workspaceGid) {
            return `Error: Workspace GID is required to look up a task by name in a project. Request ID: ${requestId}`;
          }
          const projectGid = await this._findProjectGidByName(
            projectName,
            workspaceGid,
            this.apiKey,
            requestId,
          );
          if (!projectGid) {
            return `Error: Could not find project "${projectName}". Please check the project name or provide a direct Asana link to the task. Request ID: ${requestId}`;
          }
          // List tasks in project, filter by name
          const tasksEndpoint = `${this.asanaApiBaseUrl}/projects/${projectGid}/tasks?opt_fields=name,gid`;
          const tasksResp = await fetch(tasksEndpoint, {
            headers: { Authorization: `Bearer ${this.apiKey}` },
          });
          if (!tasksResp.ok) {
            return `Error: Could not list tasks in project "${projectName}". Request ID: ${requestId}`;
          }
          const tasksData = await tasksResp.json();
          const foundTask = (tasksData.data || []).find(
            (t: any) =>
              t.name &&
              taskNameForCreation &&
              t.name.toLowerCase() === taskNameForCreation.toLowerCase(),
          );
          if (!foundTask || !foundTask.gid) {
            return `Error: Could not find task "${taskNameForCreation}" in project "${projectName}". Please check the task name or provide a direct Asana link. Request ID: ${requestId}`;
          }
          // Fetch details by GID
          method = 'GET';
          endpoint = `${this.asanaApiBaseUrl}/tasks/${foundTask.gid}`;
          queryParams.append(
            'opt_fields',
            'name,notes,due_on,completed,assignee.name,projects.name,permalink_url,created_at,modified_at,parent.name',
          );
          endpoint = `${endpoint}?${queryParams.toString()}`;
          console.log(
            `NativeAsanaTool [${requestId}]: getTaskDetails - Found task in project: ${foundTask.gid}`,
          );
        } else if (
          taskNameForCreation &&
          ((args as any).workspaceName || workspaceGid)
        ) {
          // 3. If task name + workspace, use typeahead or list all tasks, filter by name
          const wsGid = (args as any).workspaceName
            ? await this._findWorkspaceGidByName(
                (args as any).workspaceName as string,
                this.apiKey,
                requestId,
              )
            : workspaceGid;
          if (!wsGid) {
            return `Error: Could not resolve workspace. Please provide a valid workspace name or direct Asana link. Request ID: ${requestId}`;
          }
          // Use typeahead for tasks
          const typeaheadEndpoint = `${this.asanaApiBaseUrl}/workspaces/${wsGid}/typeahead?resource_type=task&query=${encodeURIComponent(taskNameForCreation)}&opt_fields=name,gid`;
          const typeaheadResp = await fetch(typeaheadEndpoint, {
            headers: { Authorization: `Bearer ${this.apiKey}` },
          });
          if (!typeaheadResp.ok) {
            return `Error: Could not search for task "${taskNameForCreation}" in workspace. Request ID: ${requestId}`;
          }
          const typeaheadData = await typeaheadResp.json();
          const foundTask = (typeaheadData.data || []).find(
            (t: any) =>
              t.name &&
              taskNameForCreation &&
              t.name.toLowerCase() === taskNameForCreation.toLowerCase(),
          );
          if (!foundTask || !foundTask.gid) {
            return `Error: Could not find task "${taskNameForCreation}" in workspace. Please check the task name or provide a direct Asana link. Request ID: ${requestId}`;
          }
          // Fetch details by GID
          method = 'GET';
          endpoint = `${this.asanaApiBaseUrl}/tasks/${foundTask.gid}`;
          queryParams.append(
            'opt_fields',
            'name,notes,due_on,completed,assignee.name,projects.name,permalink_url,created_at,modified_at,parent.name',
          );
          endpoint = `${endpoint}?${queryParams.toString()}`;
          console.log(
            `NativeAsanaTool [${requestId}]: getTaskDetails - Found task in workspace: ${foundTask.gid}`,
          );
        } else {
          // 4. Not enough info
          return `To retrieve details for a specific task, please provide either:
- The direct Asana link to the task
- The task name AND project name
- The task name AND workspace name

Example: "Show details for the task named 'My Task' in project 'My Project'" or "Show details for https://app.asana.com/0/123456789/987654321"`;
        }
      }

      console.log(
        `NativeAsanaTool [${requestId}]: Making API request - Method: ${method}, Endpoint: ${endpoint}`,
      );
      if (bodyPayload)
        console.log(
          `NativeAsanaTool [${requestId}]: Body: ${JSON.stringify(bodyPayload)}`,
        );

      const timeoutPromise = new Promise<Response>((_, reject) => {
        setTimeout(
          () =>
            reject(
              new Error(
                `Request to Asana API timed out after ${this.timeoutMs}ms`,
              ),
            ),
          this.timeoutMs,
        );
      });

      const fetchOptions: RequestInit = {
        method: method,
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'Asana-Enable': 'new_user_task_lists,new_project_templates',
        },
      };
      if (bodyPayload) {
        fetchOptions.body = JSON.stringify(bodyPayload);
      }

      const apiResponse = (await Promise.race([
        fetch(endpoint, fetchOptions),
        timeoutPromise,
      ])) as Response;
      console.log(
        `NativeAsanaTool [${requestId}]: Received API response status: ${apiResponse.status}`,
      );

      let responseBody: any;
      const responseText = await apiResponse.text(); // Read text first for better error diagnosis
      try {
        responseBody = JSON.parse(responseText);
        console.log(
          `NativeAsanaTool [${requestId}]: Parsed API response for ${operationType}: ${JSON.stringify(responseBody).substring(0, 500)}...`,
        );
      } catch (e) {
        console.error(
          `NativeAsanaTool [${requestId}]: Error parsing Asana JSON response. Status: ${apiResponse.status}. Response Text: ${responseText}`,
          e,
        );
        return `Error: Failed to parse Asana API response (Status: ${apiResponse.status}). Try again or check Asana status. Request ID: ${requestId}`;
      }

      if (!apiResponse.ok) {
        const asanaError = responseBody?.errors?.[0];
        let errorDetail =
          asanaError?.message ||
          apiResponse.statusText ||
          'Unknown Asana API error';
        if (asanaError?.help) errorDetail += ` Help: ${asanaError.help}`;
        console.error(
          `NativeAsanaTool [${requestId}]: Asana API Error (${method} ${endpoint}): ${apiResponse.status} ${errorDetail}. Full Response: ${JSON.stringify(responseBody)}`,
        );
        return `Asana API Error: ${apiResponse.status} - ${errorDetail}. Request ID: ${requestId}`;
      }

      if (!responseBody || !responseBody.data) {
        console.error(
          `NativeAsanaTool [${requestId}]: Received empty or invalid 'data' field in Asana response for ${operationType}:`,
          JSON.stringify(responseBody),
        );
        return `Error: Received an empty or invalid data response from Asana API for ${operationType}. Request ID: ${requestId}`;
      }

      // Handle successful responses
      if (operationType === 'createProject') {
        const createdProject = responseBody.data;
        return `Successfully created Asana project: "${createdProject.name}" (GID: ${createdProject.gid}). Permalink: ${createdProject.permalink_url}. Request ID: ${requestId}`;
      } else if (operationType === 'createTask') {
        const createdTask = responseBody.data;
        return `Successfully created Asana task: "${createdTask.name}" (GID: ${createdTask.gid}). View at: https://app.asana.com/0/${workspaceGid}/${createdTask.gid}. Request ID: ${requestId}`;
      } else if (operationType === 'updateTaskDescription') {
        const updatedTask = responseBody.data;
        return `Successfully updated description for task "${updatedTask.name}" (GID: ${updatedTask.gid}). View task at: https://app.asana.com/0/${workspaceGid}/${updatedTask.gid}. Request ID: ${requestId}`;
      } else if (operationType === 'getUsersMe') {
        return `Successfully connected to Asana. Current user: ${responseBody.data.name}. Details (partial): ${JSON.stringify(responseBody.data).substring(0, 200)}... Request ID: ${requestId}`;
      } else if (operationType === 'listProjects') {
        const projectsData = responseBody.data;
        if (!Array.isArray(projectsData))
          return `Error: Project data not an array. Request ID: ${requestId}`;
        if (projectsData.length === 0)
          return `No active projects found in workspace ${workspaceGid}. Request ID: ${requestId}`;
        let resStr = `Found ${projectsData.length} active project(s) in workspace ${workspaceGid}:\n`;
        projectsData.forEach((p: any, i: number) => {
          resStr += `${i + 1}. ${p.name} (GID: ${p.gid})${p.team?.name ? ` (Team: ${p.team.name})` : ''}${p.permalink_url ? ` (Link: ${p.permalink_url})` : ''}\n`;
        });
        return `${resStr.trim()} Request ID: ${requestId}`;
      } else if (operationType === 'listTasks') {
        const tasksData = responseBody.data;
        console.log(
          `NativeAsanaTool [${requestId}]: listTasks SUCCESS - responseStringForListTasksPrefix: "${responseStringForListTasksPrefix}"`,
        );
        let resStr = responseStringForListTasksPrefix; // Start with the prefix note
        if (!Array.isArray(tasksData))
          return `Error: Task data not an array. Request ID: ${requestId}`;

        if (tasksData.length > 0) {
          resStr += `Found ${tasksData.length} task(s):\n`;
          tasksData.forEach((task: any, index: number) => {
            resStr += `${index + 1}. ${task.name}`;
            if (task.due_on) resStr += ` (Due: ${task.due_on})`;
            if (task.assignee?.name)
              resStr += ` (Assignee: ${task.assignee.name})`;
            if (task.projects && task.projects.length > 0)
              resStr += ` (In Project: ${task.projects.map((p: any) => p.name).join(', ')})`;
            if (task.permalink_url) resStr += ` (Link: ${task.permalink_url})`;
            resStr += '\n';
          });
        } else {
          // If prefix is set (project not found), it will be "Note... No tasks found..."
          // If prefix is empty (project found but was empty), it will be "No tasks found..."
          if (projectName) {
            resStr += `No tasks found matching your criteria in project "${projectName}".`;
          } else {
            resStr += `No tasks found matching your criteria.`;
          }
        }
        const finalResponse = `${resStr.trim()} Request ID: ${requestId}`;
        console.log(
          `NativeAsanaTool [${requestId}]: listTasks - Final response string for LLM: "${finalResponse.substring(0, 300)}..."`,
        );
        return finalResponse;
      } else if (operationType === 'getTaskDetails') {
        const taskData = responseBody.data;
        let resStr = `Task Details for "${taskData.name}":\n`;
        resStr += `- Status: ${taskData.completed ? 'Completed' : 'In Progress'}\n`;
        if (taskData.assignee?.name)
          resStr += `- Assignee: ${taskData.assignee.name}\n`;
        if (taskData.due_on) resStr += `- Due Date: ${taskData.due_on}\n`;
        if (taskData.notes) resStr += `- Description: ${taskData.notes}\n`;
        if (taskData.projects?.length > 0) {
          resStr += `- Projects: ${taskData.projects.map((p: any) => p.name).join(', ')}\n`;
        }
        if (taskData.parent?.name)
          resStr += `- Parent Task: ${taskData.parent.name}\n`;
        resStr += `- Created: ${taskData.created_at}\n`;
        resStr += `- Last Modified: ${taskData.modified_at}\n`;
        if (taskData.permalink_url)
          resStr += `- Link: ${taskData.permalink_url}\n`;

        return `${resStr.trim()} Request ID: ${requestId}`;
      }

      return `Asana operation "${operationType}" completed, but no specific response formatter for it. Data: ${JSON.stringify(responseBody.data).substring(0, 300)}... Request ID: ${requestId}`;
    } catch (error: any) {
      console.error(
        `NativeAsanaTool [${requestId}]: Exception during Asana API call or processing:`,
        error,
      );
      if (error.message?.includes('timed out')) {
        return `Error: Request to Asana API timed out. Request ID: ${requestId}`;
      }
      return `Error processing Asana request: ${error.message || 'Unknown error'}. Request ID: ${requestId}`;
    }
  }

  private async _findProjectGidByName(
    projectName: string,
    workspaceGid: string,
    apiKey: string,
    requestId: string,
  ): Promise<string | undefined> {
    const searchName = projectName.toLowerCase();
    const typeaheadEndpoint = `${this.asanaApiBaseUrl}/workspaces/${workspaceGid}/typeahead?resource_type=project&query=${encodeURIComponent(searchName)}&opt_fields=name,gid`;
    console.log(
      `NativeAsanaTool [${requestId}]: Searching for project GID for "${projectName}" in workspace ${workspaceGid} via ${typeaheadEndpoint}`,
    );

    try {
      const timeoutPromise = new Promise<Response>((_, reject) => {
        setTimeout(() => reject(new Error('Project lookup timed out')), 7000); // Increased timeout
      });
      const fetchPromise = fetch(typeaheadEndpoint, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: 'application/json',
        },
      });
      const response = (await Promise.race([
        fetchPromise,
        timeoutPromise,
      ])) as Response;

      if (!response.ok) {
        // Check response.ok first
        const errorText = await response.text();
        console.warn(
          `NativeAsanaTool [${requestId}]: API error during project lookup for "${projectName}". Status: ${response.status}. Response: ${errorText}`,
        );
        return undefined;
      }

      const results = await response.json();
      if (!results.data) {
        console.warn(
          `NativeAsanaTool [${requestId}]: No 'data' field in project lookup response for "${projectName}". Results:`,
          results,
        );
        return undefined;
      }

      const projects = results.data;
      const foundProject = projects.find(
        (p: any) => p.name.toLowerCase() === searchName,
      );

      if (foundProject) {
        console.log(
          `NativeAsanaTool [${requestId}]: Found exact project GID: ${foundProject.gid} for name "${projectName}"`,
        );
        return foundProject.gid;
      }
      // Consider removing the "take first result" fallback for more accuracy,
      // or make it more explicit to the user if an exact match isn't found.
      // For now, retaining original fallback:
      else if (projects.length > 0) {
        console.warn(
          `NativeAsanaTool [${requestId}]: No exact project match for "${projectName}". Found: ${projects.map((p: any) => p.name).join(', ')}. Using first result GID: ${projects[0].gid}`,
        );
        return projects[0].gid;
      } else {
        console.warn(
          `NativeAsanaTool [${requestId}]: No project found matching name "${projectName}" in workspace ${workspaceGid}`,
        );
        return undefined;
      }
    } catch (error: any) {
      console.error(
        `NativeAsanaTool [${requestId}]: Exception looking up project GID for "${projectName}":`,
        error,
      );
      return undefined;
    }
  }

  // Placeholder for _findTaskGidByName - to be implemented based on updateTaskDescription logic
  private async _findTaskGidByName(
    taskName: string,
    workspaceGid: string,
    apiKey: string,
    requestId: string,
    projectName?: string,
  ): Promise<string | undefined> {
    console.log(
      `NativeAsanaTool [${requestId}]: _findTaskGidByName - Searching for task "${taskName}" ${projectName ? `in project "${projectName}"` : `in workspace "${workspaceGid}"`}`,
    );
    const queryParams = new URLSearchParams();
    queryParams.append('workspace', workspaceGid);
    queryParams.append('opt_fields', 'name,gid,projects.name'); // Add projects.name to verify

    if (projectName) {
      const projectGid = await this._findProjectGidByName(
        projectName,
        workspaceGid,
        apiKey,
        requestId,
      );
      if (projectGid) {
        queryParams.append('project', projectGid);
      } else {
        console.warn(
          `NativeAsanaTool [${requestId}]: _findTaskGidByName - Project "${projectName}" not found. Searching task in workspace only.`,
        );
        // If project not found, proceed to search in workspace, task might exist without being in the (misspelled/non-existent) project
      }
    }

    const searchEndpoint = `${this.asanaApiBaseUrl}/tasks?${queryParams.toString()}`;
    console.log(
      `NativeAsanaTool [${requestId}]: _findTaskGidByName - Searching tasks via ${searchEndpoint}`,
    );

    try {
      const response = await fetch(searchEndpoint, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: 'application/json',
        },
      });
      if (!response.ok) {
        const errorText = await response.text();
        console.warn(
          `NativeAsanaTool [${requestId}]: _findTaskGidByName - API error searching tasks. Status: ${response.status}. Response: ${errorText}`,
        );
        return undefined;
      }
      const tasksData = await response.json();
      if (!tasksData.data || !Array.isArray(tasksData.data)) {
        console.warn(
          `NativeAsanaTool [${requestId}]: _findTaskGidByName - Invalid task data format.`,
        );
        return undefined;
      }

      const lowerTaskName = taskName.toLowerCase();
      const matchingTask = tasksData.data.find(
        (task: any) => task.name.toLowerCase() === lowerTaskName,
      );

      if (matchingTask) {
        console.log(
          `NativeAsanaTool [${requestId}]: _findTaskGidByName - Found task "${taskName}" with GID: ${matchingTask.gid}.`,
        );
        return matchingTask.gid;
      } else {
        console.log(
          `NativeAsanaTool [${requestId}]: _findTaskGidByName - No task found with exact name "${taskName}".`,
        );
        return undefined;
      }
    } catch (error: any) {
      console.error(
        `NativeAsanaTool [${requestId}]: _findTaskGidByName - Exception searching for task GID:`,
        error,
      );
      return undefined;
    }
  }

  // --- Helper: Extract Task GID from Asana link or explicit GID ---
  private extractTaskGidFromInput(input: string): string | undefined {
    // Match Asana task URLs or explicit GIDs
    const urlMatch = input.match(/asana\.com\/0\/\d+\/(\d+)/i);
    if (urlMatch) return urlMatch[1];
    const gidMatch = input.match(/\b(\d{10,})\b/); // GIDs are long numbers
    if (gidMatch) return gidMatch[1];
    return undefined;
  }

  // --- Helper: Extract names from input ---
  private extractNamesFromInput(input: string): {
    taskName?: string;
    projectName?: string;
    workspaceName?: string;
  } {
    // Try to extract quoted names for task, project, workspace
    const taskMatch = input.match(
      /(?:task|task named|task called|task titled)\s*["']([^"']+)["']/i,
    );
    const projectMatch = input.match(
      /(?:in|for)\s+(?:project|the project)\s*["']([^"']+)["']/i,
    );
    const workspaceMatch = input.match(
      /(?:in|for)\s+(?:workspace|the workspace)\s*["']([^"']+)["']/i,
    );
    return {
      taskName: taskMatch?.[1],
      projectName: projectMatch?.[1],
      workspaceName: workspaceMatch?.[1],
    };
  }

  // --- Helper: Find workspace GID by name (using typeahead) ---
  private async _findWorkspaceGidByName(
    workspaceName: string,
    apiKey: string,
    requestId: string,
  ): Promise<string | undefined> {
    const typeaheadEndpoint = `${this.asanaApiBaseUrl}/workspaces?opt_fields=name,gid`;
    try {
      const resp = await fetch(typeaheadEndpoint, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (!resp.ok) return undefined;
      const data = await resp.json();
      const found = (data.data || []).find(
        (w: any) => w.name.toLowerCase() === workspaceName.toLowerCase(),
      );
      return found?.gid;
    } catch {
      return undefined;
    }
  }
}

export const nativeAsanaTool = new NativeAsanaTool();
