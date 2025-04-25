import { z } from 'zod';
import { DynamicStructuredTool } from '@langchain/core/tools';

// Keep the existing Zod schema definition
const googleCalendarSchema = z.object({
  action: z
    .enum(['search', 'create', 'update', 'delete'])
    .describe(
      'The action to perform on Google Calendar: search events, create an event, update an event, or delete an event.',
    ),
  query: z
    .string()
    .optional()
    .describe(
      'For search action: The search query to find events, can include date ranges, keywords, or specific event details.',
    ),
  eventId: z
    .string()
    .optional()
    .describe(
      'For update/delete actions: The unique ID of the Google Calendar event to modify or remove.',
    ),
  eventDetails: z
    .object({
      summary: z.string().describe('The title/summary of the event'),
      description: z
        .string()
        .optional()
        .describe('The description of the event'),
      location: z.string().optional().describe('The location of the event'),
      startDateTime: z
        .string()
        .describe(
          'The start date and time in ISO format (e.g., "2024-05-15T09:00:00")',
        ),
      endDateTime: z
        .string()
        .describe(
          'The end date and time in ISO format (e.g., "2024-05-15T10:00:00")',
        ),
      attendees: z
        .array(z.string())
        .optional()
        .describe('Email addresses of attendees'),
      reminders: z
        .array(
          z.object({
            method: z.enum(['email', 'popup']),
            minutes: z.number(),
          }),
        )
        .optional()
        .describe('Reminder settings for the event'),
      recurrence: z
        .string()
        .optional()
        .describe(
          'Recurrence rule for repeating events (e.g., "RRULE:FREQ=WEEKLY;COUNT=10;BYDAY=MO")',
        ),
    })
    .optional()
    .describe(
      'For create/update actions: The details of the event to create or update.',
    ),
});

export const googleCalendarTool = new DynamicStructuredTool({
  name: 'googleCalendar',
  description:
    'Interact with Google Calendar to manage events and appointments. This tool supports searching for events, creating new events, updating existing events, and deleting events. It can be used for scheduling, finding available time slots, checking upcoming events, and managing user calendars.',
  schema: googleCalendarSchema,
  func: async ({ action, query, eventId, eventDetails }) => {
    console.log(`[googleCalendarTool] Called with action: ${action}`);

    // Get environment variables for n8n integration
    const webhookUrl = process.env.N8N_GOOGLE_CALENDAR_WEBHOOK_URL;
    const authHeader = process.env.N8N_GOOGLE_CALENDAR_AUTH_HEADER;
    const authToken = process.env.N8N_GOOGLE_CALENDAR_AUTH_TOKEN;

    if (!webhookUrl || !authHeader || !authToken) {
      console.error(
        '[googleCalendarTool] Missing Google Calendar n8n configuration environment variables',
      );
      return {
        success: false,
        error: 'Google Calendar service is not configured correctly.',
      };
    }

    console.log(
      `[googleCalendarTool] Sending Google Calendar ${action} request to n8n webhook.`,
    );

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      headers[authHeader] = authToken;

      const payload = {
        action,
        query,
        eventId,
        eventDetails,
      };

      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        let errorBody: string;
        try {
          errorBody = await response.text();
        } catch (e) {
          errorBody = `HTTP error ${response.status}`;
        }

        console.error(
          `[googleCalendarTool] Google Calendar ${action} failed with status ${response.status}: ${errorBody}`,
        );

        // Provide user-friendly error messages based on status code and action
        if (
          response.status === 404 &&
          (action === 'update' || action === 'delete')
        ) {
          return {
            success: false,
            error: `The calendar event with ID "${eventId}" could not be found. Please check if the event ID is correct.`,
          };
        } else if (response.status === 403) {
          return {
            success: false,
            error: `Access denied to the Google Calendar. Please check calendar permissions.`,
          };
        } else if (response.status === 400) {
          return {
            success: false,
            error: `Invalid request parameters for ${action} action. Please provide all required information.`,
          };
        }

        return {
          success: false,
          error: `Google Calendar ${action} failed: ${response.statusText}`,
        };
      }

      const resultJson = await response.json();
      console.log(
        `[googleCalendarTool] Successfully received response from N8N webhook.`,
      );

      // Format the response in a more readable way based on action type
      switch (action) {
        case 'search':
          if (resultJson.events && resultJson.events.length > 0) {
            return {
              success: true,
              events: resultJson.events,
              summary: `Found ${resultJson.events.length} events matching your query.`,
            };
          }
          return {
            success: true,
            events: [],
            summary: 'No events found matching your query.',
          };

        case 'create':
          return {
            success: true,
            event: resultJson.event,
            summary: 'Event created successfully.',
            eventId: resultJson.event?.id || null,
          };

        case 'update':
          return {
            success: true,
            event: resultJson.event,
            summary: 'Event updated successfully.',
          };

        case 'delete':
          return {
            success: true,
            summary: 'Event deleted successfully.',
          };

        default:
          return resultJson;
      }
    } catch (error) {
      console.error(
        '[googleCalendarTool] Error executing Google Calendar tool:',
        error,
      );
      return {
        success: false,
        error: `Failed to perform ${action} operation on Google Calendar: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  },
});
