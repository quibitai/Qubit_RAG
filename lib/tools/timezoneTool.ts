/**
 * Timezone and Time Tool
 *
 * Handles time-related queries including:
 * - Current time in any timezone
 * - Time conversions between timezones
 * - Timezone information and offsets
 * - User's local time detection
 */

import { z } from 'zod';

// Comprehensive timezone mapping for major cities and regions
const TIMEZONE_MAPPINGS: Record<string, string> = {
  // Major US Cities
  'new york': 'America/New_York',
  nyc: 'America/New_York',
  chicago: 'America/Chicago',
  'los angeles': 'America/Los_Angeles',
  la: 'America/Los_Angeles',
  'san francisco': 'America/Los_Angeles',
  seattle: 'America/Los_Angeles',
  denver: 'America/Denver',
  phoenix: 'America/Phoenix',
  miami: 'America/New_York',
  boston: 'America/New_York',
  washington: 'America/New_York',
  dc: 'America/New_York',
  atlanta: 'America/New_York',
  dallas: 'America/Chicago',
  houston: 'America/Chicago',
  philadelphia: 'America/New_York',
  detroit: 'America/New_York',
  minneapolis: 'America/Chicago',
  'las vegas': 'America/Los_Angeles',
  portland: 'America/Los_Angeles',
  'san diego': 'America/Los_Angeles',

  // International Cities
  london: 'Europe/London',
  paris: 'Europe/Paris',
  berlin: 'Europe/Berlin',
  rome: 'Europe/Rome',
  madrid: 'Europe/Madrid',
  amsterdam: 'Europe/Amsterdam',
  tokyo: 'Asia/Tokyo',
  beijing: 'Asia/Shanghai',
  shanghai: 'Asia/Shanghai',
  'hong kong': 'Asia/Hong_Kong',
  singapore: 'Asia/Singapore',
  sydney: 'Australia/Sydney',
  melbourne: 'Australia/Melbourne',
  toronto: 'America/Toronto',
  vancouver: 'America/Vancouver',
  montreal: 'America/Montreal',
  mumbai: 'Asia/Kolkata',
  delhi: 'Asia/Kolkata',
  dubai: 'Asia/Dubai',
  moscow: 'Europe/Moscow',
  istanbul: 'Europe/Istanbul',
  cairo: 'Africa/Cairo',
  johannesburg: 'Africa/Johannesburg',
  'sao paulo': 'America/Sao_Paulo',
  rio: 'America/Sao_Paulo',
  'mexico city': 'America/Mexico_City',
  'buenos aires': 'America/Argentina/Buenos_Aires',

  // Regions/Countries
  eastern: 'America/New_York',
  central: 'America/Chicago',
  mountain: 'America/Denver',
  pacific: 'America/Los_Angeles',
  alaska: 'America/Anchorage',
  hawaii: 'Pacific/Honolulu',
  uk: 'Europe/London',
  england: 'Europe/London',
  france: 'Europe/Paris',
  germany: 'Europe/Berlin',
  italy: 'Europe/Rome',
  spain: 'Europe/Madrid',
  japan: 'Asia/Tokyo',
  china: 'Asia/Shanghai',
  india: 'Asia/Kolkata',
  australia: 'Australia/Sydney',
  canada: 'America/Toronto',
  brazil: 'America/Sao_Paulo',
  russia: 'Europe/Moscow',
};

// Common timezone abbreviations
const TIMEZONE_ABBREVIATIONS: Record<string, string> = {
  est: 'America/New_York',
  edt: 'America/New_York',
  cst: 'America/Chicago',
  cdt: 'America/Chicago',
  mst: 'America/Denver',
  mdt: 'America/Denver',
  pst: 'America/Los_Angeles',
  pdt: 'America/Los_Angeles',
  gmt: 'UTC',
  utc: 'UTC',
  bst: 'Europe/London',
  cet: 'Europe/Berlin',
  jst: 'Asia/Tokyo',
  ist: 'Asia/Kolkata',
  aest: 'Australia/Sydney',
};

/**
 * Parse location string to IANA timezone
 */
function parseLocationToTimezone(location: string): string {
  const normalized = location.toLowerCase().trim();

  // Check direct mappings first
  if (TIMEZONE_MAPPINGS[normalized]) {
    return TIMEZONE_MAPPINGS[normalized];
  }

  // Check abbreviations
  if (TIMEZONE_ABBREVIATIONS[normalized]) {
    return TIMEZONE_ABBREVIATIONS[normalized];
  }

  // Try partial matches
  for (const [key, timezone] of Object.entries(TIMEZONE_MAPPINGS)) {
    if (normalized.includes(key) || key.includes(normalized)) {
      return timezone;
    }
  }

  // Try to use the input as an IANA timezone directly
  try {
    new Date().toLocaleString('en-US', { timeZone: location });
    return location;
  } catch {
    // If all else fails, default to UTC
    return 'UTC';
  }
}

/**
 * Get current time in specified timezone
 */
function getCurrentTimeInTimezone(timezone: string): string {
  try {
    const now = new Date();

    // Get formatted time
    const timeString = now.toLocaleString('en-US', {
      timeZone: timezone,
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
      timeZoneName: 'short',
    });

    // Get timezone offset info
    const offsetMinutes = getTimezoneOffset(timezone);
    const offsetHours = Math.floor(Math.abs(offsetMinutes) / 60);
    const offsetMins = Math.abs(offsetMinutes) % 60;
    const offsetSign = offsetMinutes >= 0 ? '+' : '-';
    const offsetString = `UTC${offsetSign}${offsetHours.toString().padStart(2, '0')}:${offsetMins.toString().padStart(2, '0')}`;

    return `${timeString} (${offsetString})`;
  } catch (error) {
    return `Unable to get time for timezone: ${timezone}`;
  }
}

/**
 * Get timezone offset in minutes
 */
function getTimezoneOffset(timezone: string): number {
  try {
    const now = new Date();
    const utc = new Date(now.getTime() + now.getTimezoneOffset() * 60000);

    // Create a date in the target timezone
    const targetTime = new Date(
      utc.toLocaleString('en-US', {
        timeZone: timezone,
      }),
    );

    // Calculate offset in minutes
    const offset = (targetTime.getTime() - utc.getTime()) / 60000;
    return Math.round(offset);
  } catch {
    return 0;
  }
}

/**
 * Check if timezone is currently in daylight saving time
 */
function isDaylightSavingTime(timezone: string): boolean {
  try {
    const now = new Date();
    const summer = new Date(now.getFullYear(), 5, 15); // June 15
    const winter = new Date(now.getFullYear(), 11, 15); // December 15

    const summerOffset = getTimezoneOffset(timezone);
    const winterOffset = getTimezoneOffset(timezone);

    return summerOffset !== winterOffset;
  } catch {
    return false;
  }
}

/**
 * Convert time between timezones
 */
function convertTimeBetweenTimezones(
  fromTimezone: string,
  toTimezone: string,
  timeString?: string,
): string {
  try {
    // Use current time if no specific time provided
    const baseTime = timeString ? new Date(timeString) : new Date();

    // Get time in source timezone
    const sourceTime = baseTime.toLocaleString('en-US', {
      timeZone: fromTimezone,
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZoneName: 'short',
    });

    // Get time in target timezone
    const targetTime = baseTime.toLocaleString('en-US', {
      timeZone: toTimezone,
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZoneName: 'short',
    });

    return `${sourceTime} → ${targetTime}`;
  } catch (error) {
    return `Unable to convert time between ${fromTimezone} and ${toTimezone}`;
  }
}

/**
 * Get timezone information
 */
function getTimezoneInfo(timezone: string): string {
  try {
    const now = new Date();
    const offset = getTimezoneOffset(timezone);
    const isDST = isDaylightSavingTime(timezone);

    // Get timezone name
    const formatter = new Intl.DateTimeFormat('en', {
      timeZone: timezone,
      timeZoneName: 'long',
    });

    const parts = formatter.formatToParts(now);
    const timeZonePart = parts.find((part) => part.type === 'timeZoneName');
    const displayName = timeZonePart?.value || timezone;

    // Get abbreviation
    const shortFormatter = new Intl.DateTimeFormat('en', {
      timeZone: timezone,
      timeZoneName: 'short',
    });
    const shortParts = shortFormatter.formatToParts(now);
    const shortTimeZonePart = shortParts.find(
      (part) => part.type === 'timeZoneName',
    );
    const abbreviation = shortTimeZonePart?.value || '';

    const offsetHours = Math.floor(Math.abs(offset) / 60);
    const offsetMins = Math.abs(offset) % 60;
    const offsetSign = offset >= 0 ? '+' : '-';
    const offsetString = `UTC${offsetSign}${offsetHours.toString().padStart(2, '0')}:${offsetMins.toString().padStart(2, '0')}`;

    return `${displayName} (${abbreviation}) - ${offsetString}${isDST ? ' - Currently in Daylight Saving Time' : ''}`;
  } catch (error) {
    return `Unable to get information for timezone: ${timezone}`;
  }
}

// Define the tool schema
const timezoneToolSchema = z.object({
  query: z
    .string()
    .describe(
      'The time-related query (e.g., "what time is it in Chicago?", "current time", "convert 3pm EST to PST")',
    ),
  location: z
    .string()
    .optional()
    .describe(
      'Specific location/timezone (e.g., "Chicago", "EST", "America/New_York")',
    ),
  fromTimezone: z
    .string()
    .optional()
    .describe('Source timezone for conversion'),
  toTimezone: z.string().optional().describe('Target timezone for conversion'),
  timeString: z
    .string()
    .optional()
    .describe('Specific time to convert (ISO format or natural language)'),
});

export type TimezoneToolInput = z.infer<typeof timezoneToolSchema>;

/**
 * Timezone Tool Function
 */
export async function timezoneTool(input: TimezoneToolInput): Promise<string> {
  const { query, location, fromTimezone, toTimezone, timeString } = input;
  const queryLower = query.toLowerCase();

  try {
    // Handle timezone conversion queries
    if ((fromTimezone && toTimezone) || queryLower.includes('convert')) {
      if (fromTimezone && toTimezone) {
        const fromTz = parseLocationToTimezone(fromTimezone);
        const toTz = parseLocationToTimezone(toTimezone);
        return convertTimeBetweenTimezones(fromTz, toTz, timeString);
      }

      // Parse conversion from query
      const conversionMatch = queryLower.match(/convert.*?(\w+).*?to.*?(\w+)/);
      if (conversionMatch) {
        const fromTz = parseLocationToTimezone(conversionMatch[1]);
        const toTz = parseLocationToTimezone(conversionMatch[2]);
        return convertTimeBetweenTimezones(fromTz, toTz, timeString);
      }
    }

    // Handle "what time is it in [location]" queries
    if (
      queryLower.includes('what time') ||
      queryLower.includes('current time')
    ) {
      if (location) {
        const timezone = parseLocationToTimezone(location);
        return `The current time in ${location} is: ${getCurrentTimeInTimezone(timezone)}`;
      }

      // Extract location from query
      const locationMatch = queryLower.match(
        /(?:time.*?in|in)\s+([a-zA-Z\s]+?)(?:\?|$)/,
      );
      if (locationMatch) {
        const extractedLocation = locationMatch[1].trim();
        const timezone = parseLocationToTimezone(extractedLocation);
        return `The current time in ${extractedLocation} is: ${getCurrentTimeInTimezone(timezone)}`;
      }

      // Default to user's current time (UTC for server-side)
      return `The current time is: ${getCurrentTimeInTimezone('UTC')}`;
    }

    // Handle timezone information queries
    if (queryLower.includes('timezone') || queryLower.includes('time zone')) {
      if (location) {
        const timezone = parseLocationToTimezone(location);
        return `Timezone information for ${location}: ${getTimezoneInfo(timezone)}`;
      }
    }

    // Handle offset queries
    if (queryLower.includes('offset') || queryLower.includes('utc')) {
      if (location) {
        const timezone = parseLocationToTimezone(location);
        const offset = getTimezoneOffset(timezone);
        const offsetHours = Math.floor(Math.abs(offset) / 60);
        const offsetMins = Math.abs(offset) % 60;
        const offsetSign = offset >= 0 ? '+' : '-';
        const offsetString = `UTC${offsetSign}${offsetHours.toString().padStart(2, '0')}:${offsetMins.toString().padStart(2, '0')}`;
        return `The UTC offset for ${location} is: ${offsetString}`;
      }
    }

    // Default: try to extract location and show current time
    const words = query.split(/\s+/);
    for (const word of words) {
      const timezone = parseLocationToTimezone(word);
      if (timezone !== 'UTC' || word.toLowerCase() === 'utc') {
        return `The current time in ${word} is: ${getCurrentTimeInTimezone(timezone)}`;
      }
    }

    // Final fallback
    return `I can help you with time-related queries. Try asking "What time is it in [city]?" or "Convert time from [timezone] to [timezone]". The current UTC time is: ${getCurrentTimeInTimezone('UTC')}`;
  } catch (error) {
    console.error('Timezone tool error:', error);
    return `I encountered an error processing your time query. Please try rephrasing your question or be more specific about the location/timezone you're interested in.`;
  }
}

// Export the tool definition for use in the modern tool service
export const timezoneToolDefinition = {
  name: 'timezoneTool',
  description:
    'Get current time in any timezone, convert times between timezones, and get timezone information. Handles queries like "what time is it in Chicago?", "convert 3pm EST to PST", "timezone info for Tokyo".',
  schema: timezoneToolSchema,
  execute: timezoneTool,
  func: timezoneTool, // Support both interfaces
  category: 'utility',
  priority: 5,
};
