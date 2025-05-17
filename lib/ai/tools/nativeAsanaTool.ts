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
  // Optional: Add 'input' for compatibility with some LLM formats, similar to other tools.
  input: z
    .string()
    .optional()
    .describe(
      'Alternative way to provide the action description, for compatibility with some LLM formats.',
    ),
});

class NativeAsanaTool extends Tool {
  // Tool Name:
  // IMPORTANT: Choose a distinct name to avoid conflicts with the existing 'asanaTool'.
  // Using "nativeAsana" is a good option.
  name = 'nativeAsana';

  // Tool Description:
  // This should clearly state that it interacts DIRECTLY with the Asana API
  // and is intended to replace the N8N-based Asana tool.
  description =
    'A tool that connects DIRECTLY to the Asana API to perform operations. ' +
    'Use this for ALL Asana-related tasks such as creating, listing, updating, or completing Asana tasks and projects. ' +
    'This is the preferred tool for any Asana-related operations, providing a native integration. ' +
    "The input must be an object containing an 'action_description' field with a clear natural language description of the Asana operation.";

  // Input Schema:
  // Assign the Zod schema defined above.
  zodSchema = NativeAsanaToolInputSchema;

  // Asana API Base URL (from OpenAPI spec)
  private asanaApiBaseUrl = 'https://app.asana.com/api/1.0';

  // Placeholder for API key - will be retrieved from config in a later step
  private apiKey: string | undefined;

  // Timeout configuration (similar to other tools)
  private timeoutMs = Number.parseInt(
    process.env.NATIVE_ASANA_TIMEOUT_MS || '30000', // Consider adding a new env variable
    10,
  );

  /**
   * The main method that will be called by the LangChain agent.
   * It will take the validated input, interact with the Asana API,
   * and return a string result.
   *
   * For this initial step, this method will be a placeholder.
   * Actual implementation will follow in later steps.
   */
  protected async _call(
    args: z.infer<typeof NativeAsanaToolInputSchema>,
  ): Promise<string> {
    const requestId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    console.log(
      `NativeAsanaTool [${requestId}]: Starting execution with args:`,
      JSON.stringify(args),
    );

    let actionDescription: string;

    // Enhanced input validation to deal with potential serialization differences
    // between different callers (orchestrator vs specialist bits)
    if (args === null || args === undefined) {
      const errorMsg = 'Error: Received null or undefined input';
      console.error(`NativeAsanaTool [${requestId}]: ${errorMsg}`);
      return errorMsg;
    }

    // Handle different input formats for maximum compatibility
    if (typeof args === 'string') {
      // Direct string input
      actionDescription = args;
      console.log(
        `NativeAsanaTool [${requestId}]: Received direct string input as action_description`,
      );
    } else if (typeof args === 'object') {
      // Normal object input - could be direct or from tool call
      if ('action_description' in args && args.action_description) {
        actionDescription = args.action_description;
        console.log(
          `NativeAsanaTool [${requestId}]: Using action_description from direct object input`,
        );
      } else if ('input' in args && args.input) {
        actionDescription = args.input;
        console.log(
          `NativeAsanaTool [${requestId}]: Using input property as fallback`,
        );
      } else if (
        'toolInput' in args &&
        typeof args.toolInput === 'object' &&
        args.toolInput
      ) {
        // Handle toolInput structure sometimes used by orchestrator
        const toolInput = args.toolInput as { action_description?: string };
        if (toolInput.action_description) {
          actionDescription = toolInput.action_description;
          console.log(
            `NativeAsanaTool [${requestId}]: Using action_description from nested toolInput object`,
          );
        } else {
          const errorMsg =
            "Nested toolInput object missing 'action_description' field";
          console.error(`NativeAsanaTool [${requestId}]: ${errorMsg}`, args);
          return `Error: ${errorMsg}`;
        }
      } else {
        // Log the exact structure received for debugging
        const errorMsg =
          "Invalid input: Missing 'action_description', 'input', or valid 'toolInput' field";
        console.error(
          `NativeAsanaTool [${requestId}]: ${errorMsg}`,
          JSON.stringify(args),
        );
        return `Error: ${errorMsg}`;
      }
    } else {
      // Neither string nor object
      const errorMsg = `Invalid input: Expected string or object, but received ${typeof args}`;
      console.error(`NativeAsanaTool [${requestId}]: ${errorMsg}`);
      return `Error: ${errorMsg}`;
    }

    if (!actionDescription) {
      const errorMsg =
        'Error: No action description provided. Cannot determine the Asana request.';
      console.error(`NativeAsanaTool [${requestId}]: ${errorMsg}`);
      return errorMsg;
    }

    console.log(
      `NativeAsanaTool [${requestId}]: Using action_description: "${actionDescription}"`,
    );
    console.log(
      `NativeAsanaTool [${requestId}]: Asana API Base URL: ${this.asanaApiBaseUrl}`,
    );

    // Retrieve API key from configuration
    console.log(
      `NativeAsanaTool [${requestId}]: Attempting to retrieve Asana API key.`,
    );

    let resolvedApiKey: string | undefined;
    const defaultApiKeyEnvVar = 'NATIVE_ASANA_PAT'; // Or use a general 'ASANA_PAT'
    const fallbackApiKeyEnvVar = 'ASANA_PAT'; // A secondary fallback if the primary is not set

    // Check for client-specific configuration first
    // global.CURRENT_TOOL_CONFIGS is set in app/api/brain/route.ts
    if (global.CURRENT_TOOL_CONFIGS?.nativeAsana?.apiKey) {
      resolvedApiKey = global.CURRENT_TOOL_CONFIGS.nativeAsana.apiKey;
      console.log(
        `NativeAsanaTool [${requestId}]: Using client-specific API key for 'nativeAsana' tool.`,
      );
    } else {
      // Fallback to environment variables
      resolvedApiKey = process.env[defaultApiKeyEnvVar];
      if (resolvedApiKey) {
        console.log(
          `NativeAsanaTool [${requestId}]: Using API key from environment variable '${defaultApiKeyEnvVar}'.`,
        );
      } else {
        // Try secondary fallback
        resolvedApiKey = process.env[fallbackApiKeyEnvVar];
        if (resolvedApiKey) {
          console.log(
            `NativeAsanaTool [${requestId}]: Using API key from fallback environment variable '${fallbackApiKeyEnvVar}'.`,
          );
        }
      }
    }

    if (!resolvedApiKey) {
      const errorMsg = `Error: Asana API key not found. Please ensure it's configured either in the client-specific tool settings for 'nativeAsana' or as an environment variable ('${defaultApiKeyEnvVar}' or '${fallbackApiKeyEnvVar}').`;
      console.error(`NativeAsanaTool [${requestId}]: ${errorMsg}`);
      return errorMsg;
    }

    // Store the API key in the class property
    this.apiKey = resolvedApiKey;

    let operationType = 'unknown'; // To store the detected operation
    let taskNameForCreation: string | undefined = undefined;
    let taskNotes: string | undefined = undefined;
    let projectName: string | undefined = undefined;
    let workspaceGid: string | undefined;
    let responseStringForListTasksPrefix = '';

    // Basic intent parsing
    const lowerActionDescription = actionDescription.toLowerCase();

    if (
      lowerActionDescription.includes('create task') ||
      lowerActionDescription.includes('create a new task') ||
      lowerActionDescription.includes('create a task')
    ) {
      operationType = 'createTask';
      console.log(
        `NativeAsanaTool [${requestId}]: Tentatively detected operation: createTask.`,
      );

      let tempDescription = actionDescription;

      // NEW PATTERN: "Create a task in the [Project] project called [TaskName] with a note that says [Note]"
      const complexPatternMatch = tempDescription.match(
        /create\s+a\s+task\s+in\s+(?:the\s+)?(?:project\s+)?["']?([^"'\s]+(?:\s+[^"'\s]+)*)["']?\s+project\s+called\s+["']([^"']+)["']/i,
      );

      if (complexPatternMatch?.[1] && complexPatternMatch?.[2]) {
        projectName = complexPatternMatch?.[1];
        taskNameForCreation = complexPatternMatch?.[2];
        console.log(
          `NativeAsanaTool [${requestId}]: Extracted from complex pattern - Project: "${projectName}", Task: "${taskNameForCreation}"`,
        );

        // Remove the matched part from tempDescription to extract notes
        tempDescription = tempDescription
          .replace(complexPatternMatch[0], '')
          .trim();

        // Look for notes in the remainder
        const notesMatchComplex = tempDescription.match(
          /with\s+(?:a\s+)?notes?\s+(?:that\s+says?)?(?:\s*:|,?\s*)\s*["']([^"']+)["']/i,
        );
        if (notesMatchComplex?.[1]) {
          taskNotes = notesMatchComplex?.[1];
          console.log(
            `NativeAsanaTool [${requestId}]: Extracted notes from remainder: "${taskNotes}"`,
          );
        }
      } else {
        // Continue with existing extraction logic

        // 1. Extract Project Name first
        const projectPattern =
          /(?:in|for)\s+(?:project|the project)\s*["']([^"']+)["']/i;
        const projectMatch = tempDescription.match(projectPattern);
        if (projectMatch?.[1]) {
          projectName = projectMatch?.[1];
          tempDescription = tempDescription.replace(projectMatch[0], '').trim(); // Remove matched part
          console.log(
            `NativeAsanaTool [${requestId}]: Extracted project name: "${projectName}"`,
          );
        }

        // 2. Extract Notes next
        const notesPattern =
          /(?:with|having)\s+(?:notes?|a note that says?|description)\s*["']([^"']+)["']/i;
        const notesMatch = tempDescription.match(notesPattern);
        if (notesMatch?.[1]) {
          taskNotes = notesMatch?.[1];
          tempDescription = tempDescription.replace(notesMatch[0], '').trim(); // Remove matched part
          console.log(
            `NativeAsanaTool [${requestId}]: Extracted task notes: "${taskNotes}"`,
          );
        }

        // 3. Pattern to capture: called "Task Name" or named "Task Name" or titled "Task Name"
        const explicitNamePattern =
          /(?:called|named|titled)\s*["']([^"']+)["']/i;
        const explicitNameMatch = tempDescription.match(explicitNamePattern);
        if (explicitNameMatch?.[1]) {
          taskNameForCreation = explicitNameMatch?.[1];
          tempDescription = tempDescription
            .replace(explicitNameMatch[0], '')
            .trim(); // Remove matched part
          console.log(
            `NativeAsanaTool [${requestId}]: Extracted explicit task name: "${taskNameForCreation}"`,
          );
        }

        // What's left in tempDescription is potentially the task name or parts of it
        // Clean up "create task" type phrases from the beginning of what's left.
        if (!taskNameForCreation) {
          let generalExtract = tempDescription
            .replace(/^(create\s+(a\s+new\s+)?task\s+)/i, '')
            .trim();
          // Further clean common prepositions if they are leading the remainder
          generalExtract = generalExtract
            .replace(/^(for|in|to|about|with)\s+/i, '')
            .trim();

          if (generalExtract.length > 0 && generalExtract.length < 150) {
            // Avoid overly long task names
            taskNameForCreation = generalExtract
              .split(/[\r\n|\r|\n]/)[0]
              .trim(); // Take first line
            console.log(
              `NativeAsanaTool [${requestId}]: Derived task name from remaining description: "${taskNameForCreation}"`,
            );
          }
        }
      }

      if (taskNameForCreation) {
        console.log(
          `NativeAsanaTool [${requestId}]: Final parameters for task creation - Name: "${taskNameForCreation}", Notes: "${taskNotes || 'None'}", Project Name: "${projectName || 'None'}"`,
        );
      } else {
        console.warn(
          `NativeAsanaTool [${requestId}]: createTask operation detected, but failed to extract task name. Action: "${actionDescription}"`,
        );
        // Important: Set operationType to a special state to prevent falling into createTask API call with no name
        operationType = 'unknown_missing_task_name';
      }
    } else if (
      // Update task pattern detection
      (lowerActionDescription.includes('update') ||
        lowerActionDescription.includes('edit') ||
        lowerActionDescription.includes('modify') ||
        lowerActionDescription.includes('change') ||
        lowerActionDescription.includes('add description') ||
        lowerActionDescription.includes('set description')) &&
      (lowerActionDescription.includes('task') ||
        lowerActionDescription.includes('asana'))
    ) {
      operationType = 'updateTaskDescription';
      console.log(
        `NativeAsanaTool [${requestId}]: Tentatively detected operation: updateTaskDescription.`,
      );

      let tempDescription = actionDescription;
      let taskNameForUpdate: string | undefined = undefined;
      let descriptionToAdd: string | undefined = undefined;

      // Extract task name
      // Pattern: "task (called/named) 'X'" or "the task 'X'"
      const taskNamePattern =
        /(?:task\s+(?:called|named|titled|is|:|that\s+is)?\s*["']([^"']+)["'])|(?:(?:the|a)\s+task\s*["']([^"']+)["'])/i;
      const taskNameMatch = tempDescription.match(taskNamePattern);
      if (taskNameMatch) {
        taskNameForUpdate = taskNameMatch[1] || taskNameMatch[2];
        tempDescription = tempDescription.replace(taskNameMatch[0], '').trim();
        console.log(
          `NativeAsanaTool [${requestId}]: Extracted task name for update: "${taskNameForUpdate}"`,
        );
      }

      // Extract project name (similar pattern as in createTask)
      const projectPattern =
        /(?:in|for)\s+(?:project|the project|the)\s*["']([^"']+)["']/i;
      const projectMatch = tempDescription.match(projectPattern);
      if (projectMatch?.[1]) {
        projectName = projectMatch?.[1];
        tempDescription = tempDescription.replace(projectMatch[0], '').trim();
        console.log(
          `NativeAsanaTool [${requestId}]: Extracted project name for task update: "${projectName}"`,
        );
      }

      // Extract description to add
      const descPattern =
        /(?:description|desc|notes?)\s*(?:to|that says|:)?\s*["']([^"']+)["']/i;
      const descMatch = tempDescription.match(descPattern);
      if (descMatch?.[1]) {
        descriptionToAdd = descMatch?.[1];
        console.log(
          `NativeAsanaTool [${requestId}]: Extracted description to add: "${descriptionToAdd}"`,
        );
      }

      // Store for later use in API call
      taskNameForCreation = taskNameForUpdate; // Reuse existing variable
      taskNotes = descriptionToAdd; // Reuse existing variable

      if (!taskNameForUpdate) {
        console.warn(
          `NativeAsanaTool [${requestId}]: Failed to extract task name for update. Action: "${actionDescription}"`,
        );
        operationType = 'unknown_missing_task_name';
      } else if (!descriptionToAdd) {
        console.warn(
          `NativeAsanaTool [${requestId}]: Failed to extract description to add. Action: "${actionDescription}"`,
        );
        operationType = 'unknown_missing_description';
      }
    } else if (
      // Expanded conditions for getUsersMe operation
      lowerActionDescription.includes('user info') ||
      lowerActionDescription.includes('who am i') ||
      lowerActionDescription.includes('my profile') ||
      lowerActionDescription.includes('my asana profile') ||
      lowerActionDescription.includes('show my profile') ||
      lowerActionDescription.includes('get my profile') ||
      lowerActionDescription.includes('my account details') ||
      lowerActionDescription.includes('profile information') ||
      lowerActionDescription.includes('my details') ||
      lowerActionDescription.includes('my asana details') ||
      (lowerActionDescription.includes('show') &&
        lowerActionDescription.includes('profile')) ||
      (lowerActionDescription.includes('get') &&
        lowerActionDescription.includes('profile')) ||
      (lowerActionDescription.includes('display') &&
        lowerActionDescription.includes('profile')) ||
      (lowerActionDescription.includes('view') &&
        lowerActionDescription.includes('profile')) ||
      (lowerActionDescription.includes('my') &&
        lowerActionDescription.includes('information')) ||
      (lowerActionDescription.includes('my') &&
        lowerActionDescription.includes('details')) ||
      (lowerActionDescription.includes('my') &&
        lowerActionDescription.includes('account'))
    ) {
      // Check if it's NOT a task creation despite some keywords
      if (operationType !== 'createTask') {
        operationType = 'getUsersMe';
        console.log(
          `NativeAsanaTool [${requestId}]: Detected operation: getUsersMe based on keywords in "${lowerActionDescription}"`,
        );
      }
    } else if (
      lowerActionDescription.includes('list tasks') ||
      lowerActionDescription.includes('show tasks') ||
      lowerActionDescription.includes('get tasks') ||
      lowerActionDescription.includes('my tasks') ||
      lowerActionDescription.includes('view tasks') ||
      lowerActionDescription.includes('what are my tasks') ||
      (lowerActionDescription.includes('list') &&
        lowerActionDescription.includes('tasks')) ||
      (lowerActionDescription.includes('show') &&
        lowerActionDescription.includes('tasks')) ||
      (lowerActionDescription.includes('find') &&
        lowerActionDescription.includes('tasks'))
    ) {
      operationType = 'listTasks';

      // Extract project name for listing tasks
      const projectListMatch =
        actionDescription.match(
          /(?:in|for)\s+(?:project|the project)\s*["']([^"']+)["']/i,
        ) || actionDescription.match(/project\s*["']([^"']+)["']/i);
      if (projectListMatch?.[1]) {
        projectName = projectListMatch?.[1];
        console.log(
          `NativeAsanaTool [${requestId}]: Detected operation: listTasks in project: "${projectName}"`,
        );
      } else {
        console.log(
          `NativeAsanaTool [${requestId}]: Detected operation: listTasks (listing my tasks)`,
        );
      }
    }

    // Workspace GID retrieval - moved before API call logic to ensure it's done for all operations that need it
    if (
      operationType === 'createTask' ||
      operationType === 'listTasks' ||
      operationType === 'unknown_missing_task_name' ||
      operationType === 'updateTaskDescription'
    ) {
      if (global?.CURRENT_TOOL_CONFIGS?.nativeAsana?.defaultWorkspaceGid) {
        workspaceGid =
          global.CURRENT_TOOL_CONFIGS.nativeAsana.defaultWorkspaceGid;
        console.log(
          `NativeAsanaTool [${requestId}]: Using defaultWorkspaceGid from client config: ${workspaceGid}`,
        );
      } else if (process.env.ASANA_DEFAULT_WORKSPACE_GID) {
        workspaceGid = process.env.ASANA_DEFAULT_WORKSPACE_GID;
        console.log(
          `NativeAsanaTool [${requestId}]: Using defaultWorkspaceGid from environment variable: ${workspaceGid}`,
        );
      } else {
        // Using the GID you provided as a development fallback
        workspaceGid = '1208105180296349';
        console.log(
          `NativeAsanaTool [${requestId}]: Using developer-provided defaultWorkspaceGid: ${workspaceGid}. Consider making this configurable.`,
        );
      }
    }

    // Ensure workspaceGid is set if creating a task or listing tasks
    if (
      (operationType === 'createTask' || operationType === 'listTasks') &&
      !workspaceGid
    ) {
      return `Error: Asana Workspace GID is not available. Cannot ${operationType === 'createTask' ? 'create task' : 'list tasks'}. Request ID: ${requestId}`;
    }

    try {
      let endpoint = '';
      let method = 'GET'; // Default to GET
      let bodyPayload: object | null = null;
      const queryParams = new URLSearchParams();

      if (
        operationType === 'createTask' &&
        taskNameForCreation &&
        workspaceGid
      ) {
        endpoint = `${this.asanaApiBaseUrl}/tasks`;
        method = 'POST';

        const taskData: {
          name: string;
          notes?: string;
          workspace: string;
          projects?: string[];
        } = {
          name: taskNameForCreation,
          workspace: workspaceGid,
        };

        let notesToSet = taskNotes;

        // Handle project name if specified
        if (projectName) {
          console.log(
            `NativeAsanaTool [${requestId}]: Project name "${projectName}" provided for task creation. Attempting to find Project GID.`,
          );
          const projectGid = await this._findProjectGidByName(
            projectName,
            workspaceGid,
            this.apiKey as string,
            requestId,
          );

          if (projectGid) {
            taskData.projects = [projectGid];
            console.log(
              `NativeAsanaTool [${requestId}]: Found Project GID "${projectGid}" for name "${projectName}". Will assign task to this project.`,
            );
          } else {
            console.warn(
              `NativeAsanaTool [${requestId}]: Could not find Project GID for name "${projectName}". Task will be created without project assignment. Intended project added to notes.`,
            );
            const projectNote = `(Intended for Project: ${projectName} - GID not found)`;
            notesToSet = notesToSet
              ? `${notesToSet}\n\n${projectNote}`
              : projectNote;
          }
        }

        if (notesToSet) {
          taskData.notes = notesToSet;
        }

        bodyPayload = {
          data: taskData,
        };
        console.log(
          `NativeAsanaTool [${requestId}]: Preparing to ${method} to ${endpoint} with payload: ${JSON.stringify(bodyPayload)}`,
        );
      } else if (
        operationType === 'updateTaskDescription' &&
        taskNameForCreation &&
        taskNotes &&
        workspaceGid
      ) {
        // First search for task by name in the specified project
        console.log(
          `NativeAsanaTool [${requestId}]: Searching for task "${taskNameForCreation}" to update its description.`,
        );

        // Build search query params
        queryParams.append('workspace', workspaceGid);
        queryParams.append('opt_fields', 'name,gid');

        if (projectName) {
          console.log(
            `NativeAsanaTool [${requestId}]: Project name "${projectName}" specified for task lookup.`,
          );
          const projectGid = await this._findProjectGidByName(
            projectName,
            workspaceGid,
            this.apiKey as string,
            requestId,
          );

          if (projectGid) {
            queryParams.append('project', projectGid);
            console.log(
              `NativeAsanaTool [${requestId}]: Found Project GID "${projectGid}" for name "${projectName}". Will filter tasks by this project.`,
            );
          } else {
            console.warn(
              `NativeAsanaTool [${requestId}]: Could not find project GID for "${projectName}". Will search for task by name only.`,
            );
          }
        }

        // Search for task by name
        endpoint = `${this.asanaApiBaseUrl}/tasks?${queryParams.toString()}`;
        method = 'GET';

        console.log(
          `NativeAsanaTool [${requestId}]: Searching for task named "${taskNameForCreation}" via ${endpoint}`,
        );

        const taskSearchResponse = await fetch(endpoint, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${resolvedApiKey}`,
            Accept: 'application/json',
          },
        });

        if (!taskSearchResponse.ok) {
          return `Error searching for task "${taskNameForCreation}": ${taskSearchResponse.status} ${taskSearchResponse.statusText}. Request ID: ${requestId}`;
        }

        const tasksData = await taskSearchResponse.json();

        // Find matching task by name
        const matchingTask = tasksData.data?.find(
          (task: any) =>
            task.name.toLowerCase() === taskNameForCreation?.toLowerCase(),
        );

        if (!matchingTask) {
          return `Error: Could not find a task named "${taskNameForCreation}" in the specified context. Please check the task name or provide more details. Request ID: ${requestId}`;
        }

        // Found the task, now update it
        const taskGid = matchingTask.gid;
        console.log(
          `NativeAsanaTool [${requestId}]: Found task "${taskNameForCreation}" with GID: ${taskGid}. Updating description.`,
        );

        // Update task description
        endpoint = `${this.asanaApiBaseUrl}/tasks/${taskGid}`;
        method = 'PUT';

        bodyPayload = {
          data: {
            notes: taskNotes,
          },
        };

        console.log(
          `NativeAsanaTool [${requestId}]: Preparing to ${method} to ${endpoint} with payload: ${JSON.stringify(bodyPayload)}`,
        );
      } else if (operationType === 'getUsersMe') {
        endpoint = `${this.asanaApiBaseUrl}/users/me`;
        method = 'GET';
        console.log(
          `NativeAsanaTool [${requestId}]: Preparing to ${method} to ${endpoint}`,
        );
      } else if (operationType === 'listTasks' && workspaceGid) {
        endpoint = `${this.asanaApiBaseUrl}/tasks`;
        method = 'GET';

        // Add query parameters
        queryParams.append('workspace', workspaceGid);
        queryParams.append(
          'opt_fields',
          'name,due_on,completed,assignee.name,projects.name,permalink_url',
        );

        if (projectName) {
          console.log(
            `NativeAsanaTool [${requestId}]: Project name "${projectName}" provided for listing tasks. Attempting to find Project GID.`,
          );
          const projectGidToList = await this._findProjectGidByName(
            projectName,
            workspaceGid,
            this.apiKey as string,
            requestId,
          );

          if (projectGidToList) {
            queryParams.append('project', projectGidToList);
            console.log(
              `NativeAsanaTool [${requestId}]: Found Project GID "${projectGidToList}" for name "${projectName}". Filtering tasks by this project.`,
            );
            // Still include assignee=me to show only user's tasks within the project
            queryParams.append('assignee', 'me');
          } else {
            console.warn(
              `NativeAsanaTool [${requestId}]: Could not find Project GID for name "${projectName}" for listing. Defaulting to 'my tasks'.`,
            );
            responseStringForListTasksPrefix = `Note: Could not find project "${projectName}". Showing your general tasks instead.\n\n`;
            queryParams.append('assignee', 'me');
          }
        } else {
          queryParams.append('assignee', 'me'); // Default to "my tasks"
        }

        // By default, show incomplete tasks (and recently completed)
        queryParams.append('completed_since', 'now');

        endpoint += `?${queryParams.toString()}`;
        console.log(
          `NativeAsanaTool [${requestId}]: Preparing to ${method} to ${endpoint}`,
        );
      } else if (operationType === 'unknown_missing_task_name') {
        return `Error: Could not determine the task name from your request. Please specify the task name more clearly (e.g., "update the task called 'My Task'"). Request ID: ${requestId}`;
      } else if (operationType === 'unknown_missing_description') {
        return `Error: Could not determine what description to add. Please specify the description more clearly (e.g., "add description 'This is my description'"). Request ID: ${requestId}`;
      } else {
        // This is the "Operation Unknown" catch-all
        console.error(
          `NativeAsanaTool [${requestId}]: Reached final else. Operation type is still "${operationType}". Action Description: "${actionDescription}"`,
        );
        return `Error: Operation "${operationType}" is not recognized or supported yet, or required parameters are missing. Request ID: ${requestId}`;
      }

      // Create timeout promise
      const timeoutPromise = new Promise<Response>((_, reject) => {
        setTimeout(() => {
          reject(
            new Error(
              `Request to Asana API (${method} ${endpoint}) timed out after ${this.timeoutMs}ms`,
            ),
          );
        }, this.timeoutMs);
      });

      // Create fetch promise with query params if needed
      console.log(
        `NativeAsanaTool [${requestId}]: Making API request to ${endpoint} with method ${method}`,
      );

      // Detailed logging for debugging the orchestrator issue
      const headers = {
        Authorization: `Bearer ${resolvedApiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'Asana-Enable': 'new_user_task_lists,new_project_templates',
      };

      console.log(
        `NativeAsanaTool [${requestId}]: Request headers:`,
        JSON.stringify(headers),
      );

      if (bodyPayload) {
        console.log(
          `NativeAsanaTool [${requestId}]: Request body:`,
          JSON.stringify(bodyPayload),
        );
      }

      const fetchPromise = fetch(endpoint, {
        method: method,
        headers,
        body: bodyPayload ? JSON.stringify(bodyPayload) : null,
      });

      // Initialize for logging
      console.log(
        `NativeAsanaTool [${requestId}]: Action context - operationType: "${operationType}", workspace: "${workspaceGid || 'unknown'}", project: "${projectName || 'none'}"`,
      );

      // Race the promises
      console.log(
        `NativeAsanaTool [${requestId}]: Waiting for API response...`,
      );

      const response = (await Promise.race([
        fetchPromise,
        timeoutPromise,
      ])) as Response;

      console.log(
        `NativeAsanaTool [${requestId}]: Received API response with status ${response.status}`,
      );

      let responseBody: {
        data?: any;
        errors?: Array<{ message: string; help?: string }>;
      };
      try {
        responseBody = await response.json();
        console.log(
          `NativeAsanaTool [${requestId}]: Received Asana API response for ${operationType}:`,
          `${JSON.stringify(responseBody).substring(0, 300)}...`,
        );
      } catch (e) {
        console.error(
          `NativeAsanaTool [${requestId}]: Error parsing response JSON:`,
          e,
        );
        return `Error: Failed to parse Asana API response. Request ID: ${requestId}`;
      }

      if (!response.ok) {
        // Attempt to get a more detailed error message from Asana's response
        const asanaError = responseBody?.errors?.[0];
        let errorDetail = response.statusText;
        if (asanaError?.message) {
          errorDetail = asanaError.message;
          if (asanaError.help) {
            errorDetail += ` Help: ${asanaError.help}`;
          }
        }

        const errorMsg = `Error calling Asana API (${method} ${endpoint}): ${response.status} ${errorDetail}`;
        console.error(
          `NativeAsanaTool [${requestId}]: ${errorMsg}. Full Response:`,
          JSON.stringify(responseBody),
        );
        return `Asana API Error: ${response.status} - ${errorDetail}. Request ID: ${requestId}`;
      }

      // Check for empty or unexpected responses
      if (!responseBody || !responseBody.data) {
        console.error(
          `NativeAsanaTool [${requestId}]: Received empty or invalid response for operation ${operationType}:`,
          JSON.stringify(responseBody),
        );
        return `Error: Received an empty or invalid response from Asana API for ${operationType} operation. Request ID: ${requestId}`;
      }

      // Handle response based on operation
      if (operationType === 'createTask') {
        const createdTask = responseBody.data;
        if (!createdTask?.gid) {
          return `Error: Task creation response missing task GID. Request ID: ${requestId}`;
        }
        console.log(
          `NativeAsanaTool [${requestId}]: Successfully created task. Name: ${createdTask?.name}, GID: ${createdTask?.gid}`,
        );
        const taskLink = `https://app.asana.com/0/${workspaceGid}/${createdTask?.gid}`;
        let responseMessage = `Successfully created Asana task: "${createdTask?.name}" (ID: ${createdTask?.gid}).`;

        if (projectName) {
          responseMessage += ` Note: Your requested project "${projectName}" was noted, but direct project assignment requires a future enhancement (project GID lookup).`;
        }

        responseMessage += ` View at: ${taskLink} Request ID: ${requestId}`;
        return responseMessage;
      } else if (operationType === 'updateTaskDescription') {
        const updatedTask = responseBody.data;
        if (!updatedTask?.gid) {
          return `Error: Task update response missing task GID. Request ID: ${requestId}`;
        }
        console.log(
          `NativeAsanaTool [${requestId}]: Successfully updated task description. Name: ${updatedTask?.name}, GID: ${updatedTask?.gid}`,
        );
        const taskLink = `https://app.asana.com/0/${workspaceGid}/${updatedTask?.gid}`;
        return `Successfully updated description for task "${updatedTask?.name}" (ID: ${updatedTask?.gid}). View task at: ${taskLink} Request ID: ${requestId}`;
      } else if (operationType === 'getUsersMe') {
        if (!responseBody?.data?.name) {
          return `Error: User profile response missing required data. Request ID: ${requestId}`;
        }
        console.log(
          `NativeAsanaTool [${requestId}]: Successfully fetched data from /users/me. User: ${responseBody?.data?.name}`,
        );
        return `Successfully connected to Asana. Current user: ${responseBody?.data?.name}. Details: ${JSON.stringify(responseBody.data, null, 2).substring(0, 500)}... Request ID: ${requestId}`;
      } else if (operationType === 'listTasks') {
        const tasksData = responseBody.data;
        if (!Array.isArray(tasksData)) {
          console.error(
            `NativeAsanaTool [${requestId}]: Tasks list response is not in expected format:`,
            JSON.stringify(responseBody),
          );
          return `Error: Tasks list response is not in expected format. Request ID: ${requestId}`;
        }

        console.log(
          `NativeAsanaTool [${requestId}]: Retrieved ${tasksData.length} tasks from Asana API.`,
          tasksData.map((t: any) => t.name).join(', '),
        );

        let responseString = responseStringForListTasksPrefix;

        if (tasksData.length > 0) {
          responseString += `Found ${tasksData.length} task(s):\n`;

          tasksData.forEach((task: any, index: number) => {
            responseString += `${index + 1}. ${task.name}`;
            if (task.due_on) responseString += ` (Due: ${task.due_on})`;
            if (task.completed) responseString += ` (Completed)`;
            if (task.assignee?.name)
              responseString += ` (Assignee: ${task.assignee.name})`;
            if (task.projects && task.projects.length > 0)
              responseString += ` (Project: ${task.projects.map((p: any) => p.name).join(', ')})`;
            if (task.permalink_url)
              responseString += ` (Link: ${task.permalink_url})`;
            responseString += '\n';
          });
        } else {
          responseString += `No tasks found matching your criteria.`;
        }

        const finalResponse = `${responseString.trim()} Request ID: ${requestId}`;
        console.log(
          `NativeAsanaTool [${requestId}]: Returning response: ${finalResponse.substring(0, 100)}...`,
        );
        return finalResponse;
      }

      // Fallback for unhandled successful operations
      const defaultResponse = `Asana operation "${operationType}" completed. Response: ${JSON.stringify(responseBody.data).substring(0, 500)}... Request ID: ${requestId}`;
      console.log(
        `NativeAsanaTool [${requestId}]: Returning default response for unhandled operation: ${defaultResponse.substring(0, 100)}...`,
      );
      return defaultResponse;
    } catch (error: any) {
      console.error(
        `NativeAsanaTool [${requestId}]: Exception during Asana API call:`,
        error,
      );
      // Check if the error is from the timeout
      if (error?.message?.includes('timed out')) {
        return `Error: Request to Asana API timed out after ${this.timeoutMs / 1000} seconds. Request ID: ${requestId}`;
      }
      return `Error connecting to Asana or processing request: ${error?.message || 'Unknown error'}. Request ID: ${requestId}`;
    }
  }

  /**
   * Find a project's GID by its name within a workspace
   * @param projectName The name of the project to find
   * @param workspaceGid The workspace GID to search in
   * @param apiKey The Asana API key to use
   * @param requestId Request ID for logging
   * @returns The project GID if found, undefined otherwise
   */
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
        setTimeout(() => reject(new Error('Project lookup timed out')), 5000); // Shorter timeout for internal lookups
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
      const results = await response.json();

      if (!response.ok || !results.data) {
        console.warn(
          `NativeAsanaTool [${requestId}]: API error or no data during project lookup for "${projectName}". Status: ${response.status}`,
          results,
        );
        return undefined;
      }

      const projects = results.data;
      // Find an exact match (case-insensitive) or a close one
      const foundProject = projects.find(
        (p: any) => p.name.toLowerCase() === searchName,
      );

      if (foundProject) {
        console.log(
          `NativeAsanaTool [${requestId}]: Found project GID: ${foundProject.gid} for name "${projectName}"`,
        );
        return foundProject.gid;
      } else if (projects.length > 0) {
        // If no exact match but results exist, take the first one with a warning
        console.warn(
          `NativeAsanaTool [${requestId}]: No exact project match for "${projectName}". Found: ${projects.map((p: any) => p.name).join(', ')}. Using first result: ${projects[0].gid}`,
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
        `NativeAsanaTool [${requestId}]: Error looking up project GID for "${projectName}":`,
        error.message,
      );
      return undefined;
    }
  }
}

// Export an instance of the tool
export const nativeAsanaTool = new NativeAsanaTool();
