import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import type { DynamicStructuredToolInput } from '@langchain/core/tools';

// This schema defines the expected input structure for the tool.
const GoogleCalendarToolInputSchema = z.object({
  task_description: z
    .string()
    .describe(
      'A clear, natural language description of the Google Calendar task you want to perform. ' +
        'This description will be interpreted by an AI agent to manage your Google Calendar events. ' +
        "Example: 'Schedule a team review for next Friday at 3 PM about the Q3 roadmap.' " +
        "Or: 'Show me my calendar events for tomorrow.' " +
        "Or: 'Find all meetings with John this week.'",
    ),
  // Add input as an alternative field for compatibility
  input: z
    .string()
    .optional()
    .describe(
      'Alternative way to provide the task description, for compatibility with some LLM formats',
    ),
});

// Define the input type based on the schema for clarity
interface GoogleCalendarToolArgs extends DynamicStructuredToolInput {
  task_description: string;
  input?: string;
}

export const googleCalendarTool = new DynamicStructuredTool({
  name: 'googleCalendar',
  description:
    'A tool for managing Google Calendar events and schedules. ' +
    'Use this tool for all calendar-related operations such as: ' +
    '- Creating, searching, updating, or deleting calendar events ' +
    '- Checking availability and scheduling conflicts ' +
    '- Managing meeting invitations and attendees ' +
    '- Viewing calendar events for specific dates or time ranges ' +
    "The input must be an object containing a 'task_description' field with a clear, natural language description of the calendar task.",
  schema: GoogleCalendarToolInputSchema,
  func: async (args: GoogleCalendarToolArgs): Promise<string> => {
    const requestId = `gcal_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    console.log(
      `GoogleCalendarTool [${requestId}]: Starting execution with validated args:`,
      JSON.stringify(args),
    );

    const task_description = args.task_description || args.input;

    if (!task_description) {
      const errorMsg =
        'Error: No task description provided. Cannot determine the calendar request.';
      console.error(`GoogleCalendarTool [${requestId}]: ${errorMsg}`);
      return errorMsg;
    }

    console.log(
      `GoogleCalendarTool [${requestId}]: Using task_description: "${task_description}"`,
    );

    const webhookUrl = process.env.GOOGLE_CALENDAR_WEBHOOK_URL;
    const authToken = process.env.GOOGLE_CALENDAR_AUTH_TOKEN;
    const authHeaderName = process.env.GOOGLE_CALENDAR_AUTH_HEADER;
    const timeoutMs = Number.parseInt(
      process.env.GOOGLE_CALENDAR_TIMEOUT_MS || '30000',
      10,
    );

    if (!webhookUrl || !authToken || !authHeaderName) {
      const errorMessage = `Error: The Google Calendar tool is not properly configured. Essential environment variables (webhook URL, auth token, or auth header name) are missing. Please contact your administrator.`;
      console.error(
        `GoogleCalendarTool [${requestId}]: Configuration error - ${errorMessage}`,
      );
      return errorMessage;
    }

    const requestPayload = {
      query: task_description,
    };

    try {
      console.log(
        `GoogleCalendarTool [${requestId}]: Calling Google Calendar webhook at ${webhookUrl} with payload:`,
        JSON.stringify(requestPayload),
      );

      const timeoutPromise = new Promise<Response>((_, reject) => {
        setTimeout(() => {
          reject(new Error(`Request timed out after ${timeoutMs}ms`));
        }, timeoutMs);
      });

      const fetchPromise = fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          [authHeaderName]: authToken,
        },
        body: JSON.stringify(requestPayload),
      });

      const response = (await Promise.race([
        fetchPromise,
        timeoutPromise,
      ])) as Response;

      if (!response.ok) {
        const errorText = await response.text();
        console.error(
          `GoogleCalendarTool [${requestId}]: Google Calendar webhook call failed with status ${response.status}. Response: ${errorText}`,
        );
        return `Error interacting with Google Calendar: ${response.status} ${response.statusText}. The service responded with: "${errorText.substring(0, 200)}${errorText.length > 200 ? '...' : ''}"`;
      }

      const responseText = await response.text();
      console.log(
        `GoogleCalendarTool [${requestId}]: Raw response text:`,
        responseText,
      );

      // Check for empty response
      if (!responseText || responseText.trim() === '') {
        console.error(
          `GoogleCalendarTool [${requestId}]: Received empty response from webhook`,
        );
        return `Google Calendar returned an empty response. This might indicate a configuration issue or that the service is not properly processing the request. Please try again with a more specific query or contact your administrator.`;
      }

      let jsonResponse: any;
      try {
        jsonResponse = JSON.parse(responseText);
        console.log(
          `GoogleCalendarTool [${requestId}]: Parsed JSON response:`,
          JSON.stringify(jsonResponse, null, 2),
        );

        // Check for completely empty JSON object or array
        if (
          (typeof jsonResponse === 'object' &&
            Object.keys(jsonResponse).length === 0) ||
          (Array.isArray(jsonResponse) && jsonResponse.length === 0)
        ) {
          console.error(
            `GoogleCalendarTool [${requestId}]: Received empty JSON object/array from webhook`,
          );
          return `Google Calendar returned an empty result. This might indicate that no matching events were found or the service couldn't process your request. Please try with different parameters or a more specific query.`;
        }
      } catch (jsonError: any) {
        const errorMsg = `Error parsing response from Google Calendar: ${jsonError.message}`;
        console.error(`GoogleCalendarTool [${requestId}]: ${errorMsg}`);
        console.error(
          `GoogleCalendarTool [${requestId}]: Problematic response text: "${responseText}"`,
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
          `GoogleCalendarTool [${requestId}]: Detected array with output property format`,
        );

        // Additional check to ensure we're not getting an empty output object
        const output = jsonResponse[0]?.output;
        if (
          output &&
          typeof output === 'object' &&
          JSON.stringify(output) === '{}'
        ) {
          console.error(
            `GoogleCalendarTool [${requestId}]: Received empty output object in array wrapper`,
          );
          return `Google Calendar processed your request but returned an empty result. Please try with different parameters or a more specific query.`;
        }

        jsonResponse = jsonResponse[0]?.output;
      }

      // Ensure jsonResponse exists before accessing properties
      if (!jsonResponse) {
        console.error(
          `GoogleCalendarTool [${requestId}]: jsonResponse is null or undefined after processing`,
        );
        return `Google Calendar returned a response that couldn't be processed. Please try again with a different query.`;
      }

      // Process error cases
      if (
        typeof jsonResponse === 'object' &&
        jsonResponse?.error &&
        String(jsonResponse?.error).trim() !== ''
      ) {
        console.error(
          `GoogleCalendarTool [${requestId}]: Google Calendar reported an error: ${jsonResponse?.error}`,
        );
        return `Google Calendar reported an error: ${jsonResponse?.error}`;
      }

      if (jsonResponse?.success === false && jsonResponse?.summary) {
        console.error(
          `GoogleCalendarTool [${requestId}]: Google Calendar reported task unsuccessful: ${jsonResponse?.summary}`,
        );
        return `The Google Calendar task could not be completed successfully: ${jsonResponse?.summary}`;
      }

      // For calendar events, format them nicely
      if (jsonResponse?.events && Array.isArray(jsonResponse?.events)) {
        const events = jsonResponse?.events;
        console.log(
          `GoogleCalendarTool [${requestId}]: Processing ${events.length} calendar events`,
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

          result += `${index + 1}. ${event?.summary || 'Untitled Event'} - ${startDate}, ${startTime} to ${endTime}`;
          // Add hyperlink if available
          if (event?.htmlLink) {
            result += ` (Link: ${event.htmlLink})`;
          }
          result += '\n';

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
          `GoogleCalendarTool [${requestId}]: Successfully processed calendar events`,
        );
        return result;
      }

      // General response handling
      if (jsonResponse?.summary) {
        console.log(
          `GoogleCalendarTool [${requestId}]: Returning summary from response`,
        );
        return jsonResponse?.summary;
      }

      // Fallback for other response formats
      console.log(
        `GoogleCalendarTool [${requestId}]: Using fallback response format`,
      );
      return `Google Calendar processed the request successfully. ${JSON.stringify(jsonResponse)}`;
    } catch (error: any) {
      console.error(
        `GoogleCalendarTool [${requestId}]: Exception occurred during the call to Google Calendar webhook:`,
        error,
      );

      // Handle timeout specifically
      if (error?.message?.includes('timed out')) {
        return `The request to Google Calendar timed out after ${timeoutMs / 1000} seconds. This might indicate that the service is overloaded or experiencing issues. Please try again later or with a simpler query.`;
      }

      return `An exception occurred while trying to communicate with Google Calendar: ${error?.message}`;
    }
  },
});
