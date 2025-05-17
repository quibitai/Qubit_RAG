import { Tool } from '@langchain/core/tools';
import { z } from 'zod';

// Define the input schema for the Asana tool
const AsanaToolInputSchema = z.object({
  task_description: z
    .string()
    .describe(
      'A clear, natural language description of the task for the Asana integration. ' +
        'This description will be interpreted by an AI agent in n8n to perform Asana-related operations. ' +
        'Example: \'Create a new task in Asana titled "Review Q3 metrics" and assign it to me.\' ' +
        "Or: 'List all my incomplete tasks in the Marketing project on Asana.' " +
        'Or: \'Mark my "Update website content" task as complete in Asana.\'',
    ),
  // Add input as an alternative field for compatibility
  input: z
    .string()
    .optional()
    .describe(
      'Alternative way to provide the task description, for compatibility with some LLM formats',
    ),
});

class AsanaTool extends Tool {
  name = 'asana';
  description =
    'An Asana integration tool that connects to Asana via an n8n workflow. ' +
    'IMPORTANT: This is the PRIMARY and PREFERRED tool for ALL Asana-related operations. Do NOT use n8nMcpGateway for Asana. ' +
    'Use this tool for tasks such as creating, listing, updating, or completing Asana tasks. ' +
    'This is the preferred tool for any Asana-related operations including task management, ' +
    'project updates, and retrieving Asana information. ' +
    "The input must be an object containing a 'task_description' field with a clear description of the Asana operation.";

  zodSchema = AsanaToolInputSchema;

  // Configure timeout for fetch requests (30 seconds default)
  private timeoutMs = Number.parseInt(
    process.env.ASANA_TIMEOUT_MS || '30000',
    10,
  );

  protected async _call(args: any): Promise<string> {
    const requestId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    console.log(
      `AsanaTool [${requestId}]: Starting execution with args:`,
      JSON.stringify(args),
    );

    // Handle different input formats
    let task_description: string;

    if (typeof args === 'string') {
      // Direct string input
      task_description = args;
      console.log(
        `AsanaTool [${requestId}]: Using direct string input as task_description`,
      );
    } else if (typeof args === 'object' && args !== null) {
      // Object with properties
      if (args.task_description) {
        task_description = args.task_description;
        console.log(
          `AsanaTool [${requestId}]: Using task_description property from args`,
        );
      } else if (args.input) {
        task_description = args.input;
        console.log(`AsanaTool [${requestId}]: Using input property from args`);
      } else if (args.arguments) {
        // Handle OpenAI tools format
        try {
          const argsContent =
            typeof args.arguments === 'string'
              ? JSON.parse(args.arguments)
              : args.arguments;

          if (argsContent.task_description) {
            task_description = argsContent.task_description;
            console.log(
              `AsanaTool [${requestId}]: Using task_description from arguments property`,
            );
          } else if (argsContent.input) {
            task_description = argsContent.input;
            console.log(
              `AsanaTool [${requestId}]: Using input from arguments property`,
            );
          } else {
            throw new Error(
              'No valid task description found in arguments property',
            );
          }
        } catch (e) {
          console.error(
            `AsanaTool [${requestId}]: Error extracting task from arguments:`,
            e,
          );
          throw new Error(
            'Could not extract task description from arguments property',
          );
        }
      } else {
        throw new Error(
          'No task_description or input property found in args object',
        );
      }
    } else {
      throw new Error(
        'Args must be either a string or an object containing task_description or input',
      );
    }

    // Verify we have a task_description
    if (!task_description) {
      const errorMsg =
        'Error: No task description provided. Cannot determine the Asana request.';
      console.error(`AsanaTool [${requestId}]: ${errorMsg}`);
      return errorMsg;
    }

    console.log(
      `AsanaTool [${requestId}]: Using task_description: "${task_description}"`,
    );

    // Check for client-specific configuration, fallback to environment variables
    let webhookUrl = 'https://quibit.app.n8n.cloud/webhook/asana';
    let authToken = process.env.ASANA_AUTH_TOKEN || 'YOUR_TOKEN_HERE'; // Replace with actual token
    let authHeaderName = 'asana'; // Hardcoded header name

    // Check if we have client-specific configurations
    if (global.CURRENT_TOOL_CONFIGS?.asana) {
      const config = global.CURRENT_TOOL_CONFIGS.asana;
      webhookUrl = config.webhookUrl || webhookUrl;
      authToken = config.apiKey || authToken;
      authHeaderName = config.authHeader || authHeaderName;

      console.log(
        `AsanaTool [${requestId}]: Using client-specific Asana configuration`,
      );
    } else {
      // Use new env variable names for Asana integration
      webhookUrl = process.env.N8N_ASANA_WEBHOOK_URL || webhookUrl;
      authToken = process.env.N8N_ASANA_AUTH_TOKEN || authToken;
      authHeaderName = process.env.N8N_ASANA_AUTH_HEADER || authHeaderName;

      // Fallback to old names with a warning (for migration)
      if (!process.env.N8N_ASANA_WEBHOOK_URL && process.env.ASANA_WEBHOOK_URL) {
        console.warn(
          '[AsanaTool] Using deprecated ASANA_WEBHOOK_URL. Please migrate to N8N_ASANA_WEBHOOK_URL.',
        );
        webhookUrl = process.env.ASANA_WEBHOOK_URL;
      }
      if (!process.env.N8N_ASANA_AUTH_TOKEN && process.env.ASANA_AUTH_TOKEN) {
        console.warn(
          '[AsanaTool] Using deprecated ASANA_AUTH_TOKEN. Please migrate to N8N_ASANA_AUTH_TOKEN.',
        );
        authToken = process.env.ASANA_AUTH_TOKEN;
      }
      if (!process.env.N8N_ASANA_AUTH_HEADER && process.env.ASANA_AUTH_HEADER) {
        console.warn(
          '[AsanaTool] Using deprecated ASANA_AUTH_HEADER. Please migrate to N8N_ASANA_AUTH_HEADER.',
        );
        authHeaderName = process.env.ASANA_AUTH_HEADER;
      }

      console.log(
        `AsanaTool [${requestId}]: Using fallback or environment variables for Asana configuration`,
      );
    }

    // Just log a warning but proceed with available info
    if (authToken === 'YOUR_TOKEN_HERE') {
      console.warn(
        `AsanaTool [${requestId}]: Warning - Using placeholder auth token. Authentication will likely fail.`,
      );
    }

    const requestPayload = {
      query: task_description,
    };

    try {
      console.log(
        `AsanaTool [${requestId}]: Calling Asana webhook at ${webhookUrl} with payload:`,
        JSON.stringify(requestPayload),
      );

      // Create timeout promise
      const timeoutPromise = new Promise<Response>((_, reject) => {
        setTimeout(() => {
          reject(new Error(`Request timed out after ${this.timeoutMs}ms`));
        }, this.timeoutMs);
      });

      // Create fetch promise
      const fetchPromise = fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          [authHeaderName]: authToken,
        },
        body: JSON.stringify(requestPayload),
      });

      // Race the promises to implement timeout
      const response = (await Promise.race([
        fetchPromise,
        timeoutPromise,
      ])) as Response;

      if (!response.ok) {
        const errorText = await response.text();
        console.error(
          `AsanaTool [${requestId}]: Asana webhook call failed with status ${response.status}. Response: ${errorText}`,
        );
        return `Error interacting with Asana: ${response.status} ${response.statusText}. The service responded with: "${errorText.substring(0, 200)}${errorText.length > 200 ? '...' : ''}"`;
      }

      const responseText = await response.text();
      console.log(`AsanaTool [${requestId}]: Raw response text:`, responseText);

      // Check for empty response
      if (!responseText || responseText.trim() === '') {
        console.error(
          `AsanaTool [${requestId}]: Received empty response from webhook`,
        );
        return `The Asana integration returned an empty response. This might indicate a configuration issue or that the service is not properly processing the request. Please try again with a more specific query or contact your administrator.`;
      }

      let jsonResponse: any;
      try {
        jsonResponse = JSON.parse(responseText);
        console.log(
          `AsanaTool [${requestId}]: Parsed JSON response:`,
          JSON.stringify(jsonResponse, null, 2),
        );

        // Check for completely empty JSON object or array
        if (
          (typeof jsonResponse === 'object' &&
            jsonResponse !== null &&
            Object.keys(jsonResponse).length === 0) ||
          (Array.isArray(jsonResponse) && jsonResponse.length === 0)
        ) {
          console.warn(
            `AsanaTool [${requestId}]: Received empty JSON object/array response`,
          );
          return `No results found in Asana based on your query. Please try again with different or more specific parameters.`;
        }

        // Handle standard result format
        if (jsonResponse.result) {
          const resultText = jsonResponse.result;
          console.log(
            `AsanaTool [${requestId}]: Returning result text: ${resultText.substring(0, 200)}${resultText.length > 200 ? '...' : ''}`,
          );
          return resultText;
        }

        // If there's no standard format, stringify the result
        const stringResult = JSON.stringify(jsonResponse, null, 2);
        console.log(
          `AsanaTool [${requestId}]: Returning stringified result: ${stringResult.substring(0, 200)}${stringResult.length > 200 ? '...' : ''}`,
        );
        return `Asana response: ${stringResult}`;
      } catch (e) {
        console.warn(
          `AsanaTool [${requestId}]: Response was not valid JSON, returning as text: ${responseText.substring(0, 200)}${responseText.length > 200 ? '...' : ''}`,
        );
        // If not JSON, return the text response directly
        return `Asana response: ${responseText}`;
      }
    } catch (error: any) {
      console.error(`AsanaTool [${requestId}]: Error:`, error);
      return `Error accessing Asana: ${error?.message || 'Unknown error'}. Please try again or contact your administrator if the issue persists.`;
    }
  }
}

// Export an instance of the tool for use in the application
export const asanaTool = new AsanaTool();
