/**
 * Enhanced date/time parsing utilities for Asana integration
 * Provides robust natural language date/time parsing with user-friendly feedback
 */

import * as chrono from 'chrono-node';

export interface ParsedDateTime {
  success: boolean;
  date?: Date;
  hasTime: boolean;
  originalExpression: string;
  formattedForAsana: {
    due_on?: string; // YYYY-MM-DD format for date-only
    due_at?: string; // ISO string for date+time
  };
  userFriendlyFormat: string;
  confidence: 'high' | 'medium' | 'low';
  suggestions?: string[];
  errorMessage?: string;
}

/**
 * Parse natural language date/time expressions with enhanced feedback
 *
 * @param expression The natural language date/time expression
 * @param referenceDate Optional reference date (defaults to now)
 * @param timezone Optional timezone (defaults to system timezone)
 * @returns Parsed date/time result with metadata
 */
export function parseDateTime(
  expression: string,
  referenceDate?: Date,
  timezone?: string,
): ParsedDateTime {
  if (!expression || expression.trim().length === 0) {
    return {
      success: false,
      hasTime: false,
      originalExpression: expression,
      formattedForAsana: {},
      userFriendlyFormat: '',
      confidence: 'low',
      errorMessage: 'No date/time expression provided',
    };
  }

  const normalizedExpression = expression.trim().toLowerCase();
  const reference = referenceDate || new Date();

  // Use chrono-node with forwardDate option for future dates
  const parsedResults = chrono.parse(expression, reference, {
    forwardDate: true,
  });

  if (parsedResults.length === 0) {
    return {
      success: false,
      hasTime: false,
      originalExpression: expression,
      formattedForAsana: {},
      userFriendlyFormat: '',
      confidence: 'low',
      errorMessage: `Could not understand "${expression}" as a date/time`,
      suggestions: generateDateTimeSuggestions(normalizedExpression),
    };
  }

  // Use the first (most confident) result
  const result = parsedResults[0];
  const parsedDate = result.start.date();

  // Determine if time components are specified
  const knownValues = (result.start as any).knownValues || {};
  const hasTime = knownValues.hour !== undefined;

  // Calculate confidence based on known components and expression clarity
  const confidence = calculateConfidence(result, normalizedExpression);

  // Format for Asana API
  const formattedForAsana: { due_on?: string; due_at?: string } = {};

  if (hasTime) {
    // Include time - use ISO string for due_at
    formattedForAsana.due_at = parsedDate.toISOString();
  } else {
    // Date only - use YYYY-MM-DD format for due_on
    const year = parsedDate.getFullYear();
    const month = (parsedDate.getMonth() + 1).toString().padStart(2, '0');
    const day = parsedDate.getDate().toString().padStart(2, '0');
    formattedForAsana.due_on = `${year}-${month}-${day}`;
  }

  // Create user-friendly format
  const userFriendlyFormat = formatForUser(parsedDate, hasTime);

  return {
    success: true,
    date: parsedDate,
    hasTime,
    originalExpression: expression,
    formattedForAsana,
    userFriendlyFormat,
    confidence,
    suggestions:
      confidence === 'low'
        ? generateDateTimeSuggestions(normalizedExpression)
        : undefined,
  };
}

/**
 * Calculate confidence level based on parsing result and expression
 */
function calculateConfidence(
  result: any,
  normalizedExpression: string,
): 'high' | 'medium' | 'low' {
  const knownValues = result.start.knownValues || {};
  const hasYear = knownValues.year !== undefined;
  const hasMonth = knownValues.month !== undefined;
  const hasDay = knownValues.day !== undefined;

  // High confidence patterns
  const highConfidencePatterns = [
    /^(today|tomorrow|yesterday)$/,
    /^next (monday|tuesday|wednesday|thursday|friday|saturday|sunday)$/,
    /^\d{4}-\d{2}-\d{2}$/, // ISO date format
    /^\d{1,2}\/\d{1,2}\/\d{4}$/, // MM/DD/YYYY format
    /^(january|february|march|april|may|june|july|august|september|october|november|december) \d{1,2}(, \d{4})?$/,
  ];

  // Medium confidence patterns
  const mediumConfidencePatterns = [
    /^in \d+ (day|days|week|weeks|month|months)$/,
    /^next (week|month|year)$/,
    /^(this|next) (monday|tuesday|wednesday|thursday|friday|saturday|sunday)$/,
    /^\d{1,2}(st|nd|rd|th)?( of)? (january|february|march|april|may|june|july|august|september|october|november|december)$/,
  ];

  // Check pattern matches
  for (const pattern of highConfidencePatterns) {
    if (pattern.test(normalizedExpression)) {
      return 'high';
    }
  }

  for (const pattern of mediumConfidencePatterns) {
    if (pattern.test(normalizedExpression)) {
      return 'medium';
    }
  }

  // Check component completeness
  if (hasYear && hasMonth && hasDay) {
    return 'high';
  }

  if (hasMonth && hasDay) {
    return 'medium';
  }

  return 'low';
}

/**
 * Format parsed date for user-friendly display
 */
function formatForUser(date: Date, hasTime: boolean): string {
  const options: Intl.DateTimeFormatOptions = {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  };

  if (hasTime) {
    options.hour = 'numeric';
    options.minute = '2-digit';
    options.timeZoneName = 'short';
  }

  return date.toLocaleDateString('en-US', options);
}

/**
 * Generate helpful suggestions when parsing fails or confidence is low
 */
function generateDateTimeSuggestions(expression: string): string[] {
  const suggestions: string[] = [];

  // Common format suggestions
  suggestions.push(
    'Try formats like:',
    '• "tomorrow" or "next Friday"',
    '• "in 2 weeks" or "in 3 days"',
    '• "March 15" or "March 15, 2024"',
    '• "2024-03-15" (ISO format)',
    '• "next Monday at 3pm"',
  );

  // Specific suggestions based on input
  if (expression.includes('week') && !expression.includes('next')) {
    suggestions.push('• Try "next week" or "in 1 week"');
  }

  if (expression.includes('month') && !expression.includes('next')) {
    suggestions.push('• Try "next month" or "in 1 month"');
  }

  if (/\d+/.test(expression) && !expression.includes('day')) {
    suggestions.push('• If specifying days, try "in X days"');
  }

  return suggestions;
}

/**
 * Specialized parsing for start dates (similar to due dates but with different context)
 */
export function parseStartDateTime(
  expression: string,
  referenceDate?: Date,
): ParsedDateTime {
  // Start dates often use different language patterns
  const normalizedForStart = expression
    .replace(/^start(s|ing)?(\s+(on|at))?/i, '')
    .replace(/^begin(s|ning)?(\s+(on|at))?/i, '')
    .trim();

  return parseDateTime(normalizedForStart, referenceDate);
}

/**
 * Parse relative date expressions (in X days, X weeks ago, etc.)
 */
export function parseRelativeDateTime(
  expression: string,
  referenceDate?: Date,
): ParsedDateTime {
  const reference = referenceDate || new Date();

  // Handle common relative date expressions
  const tomorrow = new Date(referenceDate || new Date());
  tomorrow.setDate(tomorrow.getDate() + 1);

  const today = new Date(referenceDate || new Date());

  const relativePatterns = [
    {
      pattern: /^tomorrow$/i,
      date: tomorrow,
      confidence: 'high' as const,
    },
    {
      pattern: /^today$/i,
      date: today,
      confidence: 'high' as const,
    },
    {
      pattern: /^due\s+tomorrow$/i,
      date: tomorrow,
      confidence: 'high' as const,
    },
    {
      pattern: /^make\s+the\s+due\s+date\s+tomorrow$/i,
      date: tomorrow,
      confidence: 'high' as const,
    },
  ];

  for (const { pattern, date, confidence } of relativePatterns) {
    if (pattern.test(expression)) {
      return {
        success: true,
        date,
        hasTime: false,
        originalExpression: expression,
        formattedForAsana: {
          due_on: date.toISOString().split('T')[0], // YYYY-MM-DD format
        },
        userFriendlyFormat: formatForUser(date, false),
        confidence,
      };
    }
  }

  // Handle special relative expressions that chrono might miss
  const relativePatternsChrono = [
    {
      pattern: /^end of (this )?week$/i,
      handler: () => getEndOfWeek(reference),
    },
    {
      pattern: /^end of (this )?month$/i,
      handler: () => getEndOfMonth(reference),
    },
    {
      pattern: /^beginning of next week$/i,
      handler: () => getBeginningOfNextWeek(reference),
    },
    {
      pattern: /^end of next week$/i,
      handler: () => getEndOfNextWeek(reference),
    },
  ];

  for (const { pattern, handler } of relativePatternsChrono) {
    if (pattern.test(expression)) {
      const date = handler();
      return {
        success: true,
        date,
        hasTime: false,
        originalExpression: expression,
        formattedForAsana: {
          due_on: `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')}`,
        },
        userFriendlyFormat: formatForUser(date, false),
        confidence: 'high',
      };
    }
  }

  // Fall back to regular parsing
  return parseDateTime(expression, referenceDate);
}

// Helper functions for relative date calculations
function getEndOfWeek(date: Date): Date {
  const result = new Date(date);
  const dayOfWeek = result.getDay();
  const daysToAdd = 6 - dayOfWeek; // Saturday is end of week
  result.setDate(result.getDate() + daysToAdd);
  return result;
}

function getEndOfMonth(date: Date): Date {
  const result = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  return result;
}

function getBeginningOfNextWeek(date: Date): Date {
  const result = new Date(date);
  const dayOfWeek = result.getDay();
  const daysToAdd = 7 - dayOfWeek; // Next Sunday
  result.setDate(result.getDate() + daysToAdd);
  return result;
}

function getEndOfNextWeek(date: Date): Date {
  const result = new Date(date);
  const dayOfWeek = result.getDay();
  const daysToAdd = 13 - dayOfWeek; // Next Saturday
  result.setDate(result.getDate() + daysToAdd);
  return result;
}
