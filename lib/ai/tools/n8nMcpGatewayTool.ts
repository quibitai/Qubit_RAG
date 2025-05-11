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
});

class N8nMcpGatewayTool extends Tool {
  name = 'n8nMcpGateway';
  description =
    'A multi-capability gateway that connects to external services like Google Calendar, Asana, and other business applications via an n8n workflow. ' +
    'Use this for tasks such as managing calendar events (creating, searching, updating, deleting), ' +
    'handling Asana tasks (creating, listing, updating projects/tasks), or other operational tasks supported by the connected n8n workflow. ' +
    "The input must be an object containing a 'task_description' field with a clear, natural language description of the task.";

  zodSchema = N8nMcpGatewayToolInputSchema;

  protected async _call(args: { task_description: string }): Promise<string> {
    const { task_description } = args;

    const webhookUrl = process.env.N8N_MCP_GATEWAY_WEBHOOK_URL;
    const authToken = process.env.N8N_MCP_GATEWAY_AUTH_TOKEN;
    const authHeaderName = process.env.N8N_MCP_GATEWAY_AUTH_HEADER;

    if (!webhookUrl || !authToken || !authHeaderName) {
      const errorMessage = `Error: The N8N MCP Gateway tool is not properly configured. Essential environment variables (webhook URL, auth token, or auth header name) are missing. Please contact your administrator.`;
      console.error(`N8nMcpGatewayTool: Configuration error - ${errorMessage}`);
      return errorMessage;
    }

    const requestPayload = {
      query: task_description,
    };

    try {
      console.log(
        `N8nMcpGatewayTool: Calling n8n webhook at ${webhookUrl} with payload:`,
        JSON.stringify(requestPayload),
      );
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          [authHeaderName]: authToken,
        },
        body: JSON.stringify(requestPayload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(
          `N8nMcpGatewayTool: n8n webhook call failed with status ${response.status}. Response: ${errorText}`,
        );
        return `Error interacting with the N8N MCP Gateway: ${response.status} ${response.statusText}. The gateway responded with: "${errorText.substring(0, 200)}${errorText.length > 200 ? '...' : ''}"`;
      }

      const jsonResponse = await response.json();
      console.log(
        'N8nMcpGatewayTool: Received response from n8n webhook:',
        JSON.stringify(jsonResponse, null, 2),
      );

      if (jsonResponse.error && String(jsonResponse.error).trim() !== '') {
        return `The N8N MCP Gateway reported an error: ${jsonResponse.error}`;
      }
      if (jsonResponse.success === false && jsonResponse.summary) {
        return `The N8N MCP Gateway task could not be completed successfully: ${jsonResponse.summary}`;
      }
      if (jsonResponse.summary) {
        return jsonResponse.summary;
      }
      if (
        jsonResponse.event ||
        jsonResponse.events ||
        jsonResponse.data ||
        typeof jsonResponse.success === 'boolean'
      ) {
        return `N8N MCP Gateway processed the task. Result: ${JSON.stringify(jsonResponse)}`;
      }
      return 'N8N MCP Gateway processed the request, but the response format was unexpected or no specific summary was provided.';
    } catch (error: any) {
      console.error(
        'N8nMcpGatewayTool: Exception occurred during the call to the n8n webhook:',
        error,
      );
      return `An exception occurred while trying to communicate with the N8N MCP Gateway: ${error.message}`;
    }
  }
}

// Export an instance of the tool for use in the application.
export const n8nMcpGatewayTool = new N8nMcpGatewayTool();
