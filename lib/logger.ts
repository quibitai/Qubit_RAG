/**
 * Centralized logging utility for the application
 *
 * Controls log verbosity via LOG_LEVEL environment variable:
 * - 0: Error only
 * - 1: Errors and warnings
 * - 2: Errors, warnings, and info
 * - 3: All logs including debug
 *
 * Also supports disabling specific log categories via DISABLE_LOGS env var
 * Example: DISABLE_LOGS=Auth,DB,Middleware
 */

type LogLevel = 'ERROR' | 'WARN' | 'INFO' | 'DEBUG';

// Log level numerical values (higher = more verbose)
const LOG_LEVEL_VALUES: Record<LogLevel, number> = {
  ERROR: 0,
  WARN: 1,
  INFO: 2,
  DEBUG: 3,
};

// Get the current log level from environment
function getCurrentLogLevel(): number {
  // First check for numerical LOG_LEVEL (0-3)
  const numericLevel = process.env.LOG_LEVEL
    ? Number.parseInt(process.env.LOG_LEVEL, 10)
    : undefined;

  if (
    numericLevel !== undefined &&
    !Number.isNaN(numericLevel) &&
    numericLevel >= 0 &&
    numericLevel <= 3
  ) {
    return numericLevel;
  }

  // Default based on environment: INFO in dev, ERROR in prod
  return process.env.NODE_ENV === 'production' ? 0 : 2;
}

// Get timestamp in ISO format
function getTimestamp(): string {
  return new Date().toISOString();
}

// Parse disabled log categories from environment
function getDisabledCategories(): string[] {
  const disabledLogs = process.env.DISABLE_LOGS;
  if (!disabledLogs) return [];

  return disabledLogs.split(',').map((category) => category.trim());
}

// Check if a specific context/category is disabled
function isContextDisabled(context: string): boolean {
  const disabledCategories = getDisabledCategories();
  return disabledCategories.some((category) =>
    context.toLowerCase().includes(category.toLowerCase()),
  );
}

/**
 * Log a message with specified level and context
 */
function log(
  level: LogLevel,
  context: string,
  message: string,
  data?: any,
): void {
  // Skip if context is in disabled categories
  if (isContextDisabled(context)) return;

  // Skip if log level is higher than current configuration
  const currentLogLevel = getCurrentLogLevel();
  if (LOG_LEVEL_VALUES[level] > currentLogLevel) return;

  const timestamp = getTimestamp();
  const prefix = `[${timestamp}][${level}][${context}]`;

  if (data !== undefined) {
    try {
      const dataString =
        typeof data === 'object'
          ? JSON.stringify(
              data,
              null,
              process.env.NODE_ENV === 'development' ? 2 : 0,
            )
          : String(data);
      console.log(`${prefix} ${message}`, dataString);
    } catch (err) {
      console.log(`${prefix} ${message} (data could not be stringified)`);
    }
  } else {
    console.log(`${prefix} ${message}`);
  }
}

/**
 * Logger utility instance with methods for different log levels
 */
export const logger = {
  /**
   * Log debug message (detailed information for debugging)
   */
  debug: (context: string, message: string, data?: any): void => {
    log('DEBUG', context, message, data);
  },

  /**
   * Log informational message (general information about system operation)
   */
  info: (context: string, message: string, data?: any): void => {
    log('INFO', context, message, data);
  },

  /**
   * Log warning message (potential issues that aren't errors)
   */
  warn: (context: string, message: string, data?: any): void => {
    log('WARN', context, message, data);
  },

  /**
   * Log error message (error conditions)
   */
  error: (context: string, message: string, data?: any): void => {
    log('ERROR', context, message, data);
  },
};

export default logger;
