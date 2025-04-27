/**
 * Simple structured logging utility
 *
 * Provides consistent logging across the application with timestamps and log levels.
 * Allows for future integration with more sophisticated logging systems.
 */

type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

/**
 * Format current timestamp for logging
 *
 * @returns Formatted timestamp string
 */
function getTimestamp(): string {
  return new Date().toISOString();
}

/**
 * Log a message with specified level and context
 *
 * @param level Log level
 * @param context Module or component name
 * @param message Primary message to log
 * @param data Optional additional data to log
 */
function log(
  level: LogLevel,
  context: string,
  message: string,
  data?: any,
): void {
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
   * Log debug message (only shows in development)
   */
  debug: (context: string, message: string, data?: any): void => {
    if (process.env.NODE_ENV === 'development') {
      log('DEBUG', context, message, data);
    }
  },

  /**
   * Log informational message
   */
  info: (context: string, message: string, data?: any): void => {
    log('INFO', context, message, data);
  },

  /**
   * Log warning message
   */
  warn: (context: string, message: string, data?: any): void => {
    log('WARN', context, message, data);
  },

  /**
   * Log error message
   */
  error: (context: string, message: string, data?: any): void => {
    log('ERROR', context, message, data);
  },
};

export default logger;
