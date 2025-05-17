import { Tool } from '@langchain/core/tools';
import { z } from 'zod';

// This schema defines the expected input structure for the tool.
const N8nMcpGatewayToolInputSchema = z.object({
  task_description: z
    .string()
    .describe(
      'A clear, natural language description of the task for the n8n Multi-Capability Processor gateway. ' +
        'This description will be interpreted by an AI agent in n8n to route to the correct capability ' +
        '(e.g., Google Calendar, Asana, or other future services) and perform the action. ' +
        "Example: 'Schedule a team review for next Friday at 3 PM about the Q3 roadmap.' " +
        "Or: 'Find all tasks assigned to me in Asana under the SkyNet project.'",
    ),
  // Add input as an alternative field for compatibility
  input: z
    .string()
    .optional()
    .describe(
      'Alternative way to provide the task description, for compatibility with some LLM formats',
    ),
});

class N8nMcpGatewayTool extends Tool {
  name = 'n8nMcpGateway';
  description =
    'A multi-capability gateway that connects to external services via an n8n workflow. ' +
    'IMPORTANT: This tool should now ONLY be used for Google Calendar operations. For Asana tasks, use the dedicated "asana" tool instead. ' +
    'Use this for tasks such as managing calendar events (creating, searching, updating, deleting), ' +
    'but NOT for Asana tasks or project management. ' +
    "The input must be an object containing a 'task_description' field with a clear, natural language description of the task.";

  zodSchema = N8nMcpGatewayToolInputSchema;

  // Configure timeout for fetch requests (30 seconds default)
  private timeoutMs = Number.parseInt(
    process.env.N8N_MCP_TIMEOUT_MS || '30000',
    10,
  );

  protected async _call(args: any): Promise<string> {
    const requestId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    console.log(
      `N8nMcpGatewayTool [${requestId}]: Starting execution with args:`,
      JSON.stringify(args),
    );

    // Handle different input formats
    let task_description: string;

    if (typeof args === 'string') {
      // Direct string input
      task_description = args;
      console.log(
        `N8nMcpGatewayTool [${requestId}]: Using direct string input as task_description`,
      );
    } else if (typeof args === 'object' && args !== null) {
      // Object with properties
      if (args.task_description) {
        task_description = args.task_description;
        console.log(
          `N8nMcpGatewayTool [${requestId}]: Using task_description property from args`,
        );
      } else if (args.input) {
        task_description = args.input;
        console.log(
          `N8nMcpGatewayTool [${requestId}]: Using input property from args`,
        );
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
              `N8nMcpGatewayTool [${requestId}]: Using task_description from arguments property`,
            );
          } else if (argsContent.input) {
            task_description = argsContent.input;
            console.log(
              `N8nMcpGatewayTool [${requestId}]: Using input from arguments property`,
            );
          } else {
            throw new Error(
              'No valid task description found in arguments property',
            );
          }
        } catch (e) {
          console.error(
            `N8nMcpGatewayTool [${requestId}]: Error extracting task from arguments:`,
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
        'Error: No task description provided. Cannot determine the request.';
      console.error(`N8nMcpGatewayTool [${requestId}]: ${errorMsg}`);
      return errorMsg;
    }

    console.log(
      `N8nMcpGatewayTool [${requestId}]: Using task_description: "${task_description}"`,
    );

    const webhookUrl = process.env.N8N_MCP_WEBHOOK_URL;
    const authToken = process.env.N8N_MCP_AUTH_TOKEN;
    const authHeaderName = process.env.N8N_MCP_AUTH_HEADER;

    if (!webhookUrl || !authToken || !authHeaderName) {
      const errorMessage = `Error: The N8N MCP Gateway tool is not properly configured. Essential environment variables (webhook URL, auth token, or auth header name) are missing. Please contact your administrator.`;
      console.error(
        `N8nMcpGatewayTool [${requestId}]: Configuration error - ${errorMessage}`,
      );
      return errorMessage;
    }

    const requestPayload = {
      query: task_description,
    };

    try {
      console.log(
        `N8nMcpGatewayTool [${requestId}]: Calling n8n webhook at ${webhookUrl} with payload:`,
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
          `N8nMcpGatewayTool [${requestId}]: n8n webhook call failed with status ${response.status}. Response: ${errorText}`,
        );
        return `Error interacting with the N8N MCP Gateway: ${response.status} ${response.statusText}. The gateway responded with: "${errorText.substring(0, 200)}${errorText.length > 200 ? '...' : ''}"`;
      }

      const responseText = await response.text();
      console.log(
        `N8nMcpGatewayTool [${requestId}]: Raw response text:`,
        responseText,
      );

      // Check for empty response
      if (!responseText || responseText.trim() === '') {
        console.error(
          `N8nMcpGatewayTool [${requestId}]: Received empty response from webhook`,
        );
        return `The N8N MCP Gateway returned an empty response. This might indicate a configuration issue or that the service is not properly processing the request. Please try again with a more specific query or contact your administrator.`;
      }

      let jsonResponse: any;
      try {
        jsonResponse = JSON.parse(responseText);
        console.log(
          `N8nMcpGatewayTool [${requestId}]: Parsed JSON response:`,
          JSON.stringify(jsonResponse, null, 2),
        );

        // Check for completely empty JSON object or array
        if (
          (typeof jsonResponse === 'object' &&
            Object.keys(jsonResponse).length === 0) ||
          (Array.isArray(jsonResponse) && jsonResponse.length === 0)
        ) {
          console.error(
            `N8nMcpGatewayTool [${requestId}]: Received empty JSON object/array from webhook`,
          );
          return `The N8N MCP Gateway returned an empty result. This might indicate that no matching data was found or the service couldn't process your request. Please try with different parameters or a more specific query.`;
        }
      } catch (jsonError: any) {
        const errorMsg = `Error parsing response from N8N MCP Gateway: ${jsonError.message}`;
        console.error(`N8nMcpGatewayTool [${requestId}]: ${errorMsg}`);
        console.error(
          `N8nMcpGatewayTool [${requestId}]: Problematic response text: "${responseText}"`,
        );
        return errorMsg;
      }

      // Handle array response with output property (LangChain wrapper format)
      if (
        Array.isArray(jsonResponse) &&
        jsonResponse.length > 0 &&
        jsonResponse[0]?.output
      ) {
        console.log(
          `N8nMcpGatewayTool [${requestId}]: Detected array with output property format`,
        );

        // Additional check to ensure we're not getting an empty output object
        const output = jsonResponse[0]?.output;
        if (
          output &&
          typeof output === 'object' &&
          JSON.stringify(output) === '{}'
        ) {
          console.error(
            `N8nMcpGatewayTool [${requestId}]: Received empty output object in array wrapper`,
          );
          return `The N8N MCP Gateway processed your request but returned an empty result. Please try with different parameters or a more specific query.`;
        }

        jsonResponse = jsonResponse[0]?.output;
      }

      // Ensure jsonResponse exists before accessing properties
      if (!jsonResponse) {
        console.error(
          `N8nMcpGatewayTool [${requestId}]: jsonResponse is null or undefined after processing`,
        );
        return `The N8N MCP Gateway returned a response that couldn't be processed. Please try again with a different query.`;
      }

      // Process error cases
      if (
        typeof jsonResponse === 'object' &&
        jsonResponse?.error &&
        String(jsonResponse?.error).trim() !== ''
      ) {
        console.error(
          `N8nMcpGatewayTool [${requestId}]: n8n reported an error: ${jsonResponse?.error}`,
        );
        return `The N8N MCP Gateway reported an error: ${jsonResponse?.error}`;
      }

      if (jsonResponse?.success === false && jsonResponse?.summary) {
        console.error(
          `N8nMcpGatewayTool [${requestId}]: n8n reported task unsuccessful: ${jsonResponse?.summary}`,
        );
        return `The N8N MCP Gateway task could not be completed successfully: ${jsonResponse?.summary}`;
      }

      // For calendar events, format them nicely
      if (jsonResponse?.events && Array.isArray(jsonResponse?.events)) {
        const events = jsonResponse?.events;
        console.log(
          `N8nMcpGatewayTool [${requestId}]: Processing ${events.length} calendar events`,
        );

        if (events.length === 0) {
          return `You have no events scheduled for the requested date.`;
        }

        // Format the events in a readable way
        let result = `You have ${events.length} event${events.length !== 1 ? 's' : ''} scheduled:\n\n`;

        events.forEach((event: any, index: number) => {
          // Format date to be more readable
          const startDate = event?.startDateTime
            ? new Date(event?.startDateTime).toLocaleDateString([], {
                weekday: 'long',
                month: 'long',
                day: 'numeric',
                year: 'numeric',
              })
            : 'No start date';

          // Format time to be more readable
          const startTime = event?.startDateTime
            ? new Date(event?.startDateTime).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              })
            : 'No start time';

          const endTime = event?.endDateTime
            ? new Date(event?.endDateTime).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              })
            : 'No end time';

          result += `${index + 1}. ${event?.summary || 'Untitled Event'} - ${startDate}, ${startTime} to ${endTime}\n`;

          if (event?.description && event?.description.trim() !== '') {
            result += `   Description: ${event?.description}\n`;
          }

          if (event?.location && event?.location.trim() !== '') {
            result += `   Location: ${event?.location}\n`;
          }

          if (
            event?.attendees &&
            Array.isArray(event?.attendees) &&
            event?.attendees.length > 0
          ) {
            result += `   Attendees: ${event?.attendees.join(', ')}\n`;
          }

          result += '\n';
        });

        console.log(
          `N8nMcpGatewayTool [${requestId}]: Successfully processed calendar events`,
        );
        return result;
      }

      // General response handling
      if (jsonResponse?.summary) {
        console.log(
          `N8nMcpGatewayTool [${requestId}]: Returning summary from response`,
        );
        return jsonResponse?.summary;
      }

      // Fallback for other response formats
      console.log(
        `N8nMcpGatewayTool [${requestId}]: Using fallback response format`,
      );
      return `N8N MCP Gateway processed the request successfully. ${JSON.stringify(jsonResponse)}`;
    } catch (error: any) {
      console.error(
        `N8nMcpGatewayTool [${requestId}]: Exception occurred during the call to the n8n webhook:`,
        error,
      );

      // Handle timeout specifically
      if (error?.message?.includes('timed out')) {
        return `The request to the N8N MCP Gateway timed out after ${this.timeoutMs / 1000} seconds. This might indicate that the service is overloaded or experiencing issues. Please try again later or with a simpler query.`;
      }

      return `An exception occurred while trying to communicate with the N8N MCP Gateway: ${error?.message}`;
    }
  }
}

// Export an instance of the tool for use in the application.
export const n8nMcpGatewayTool = new N8nMcpGatewayTool();
