/**
 * TimezoneService
 *
 * Comprehensive timezone detection and handling service following best practices:
 * 1. Browser's Intl.DateTimeFormat API (most reliable)
 * 2. JavaScript timezone detection libraries as fallback
 * 3. User preference storage and override capabilities
 * 4. Proper IANA timezone database support
 */

import type { RequestLogger } from './observabilityService';

export interface TimezoneInfo {
  timezone: string; // IANA timezone (e.g., "America/New_York")
  offset: number; // Current UTC offset in minutes
  isDST: boolean; // Whether currently in daylight saving time
  displayName: string; // Human-readable name (e.g., "Eastern Standard Time")
  abbreviation: string; // Timezone abbreviation (e.g., "EST", "EDT")
  detectionMethod: string; // How the timezone was detected
  confidence: number; // Confidence level (0-1)
}

export interface TimezoneDetectionOptions {
  fallbackTimezone?: string; // Default to this if detection fails
  userPreference?: string; // User's manually set timezone preference
  enableBrowserAPI?: boolean; // Use Intl.DateTimeFormat API
  enableJSLibrary?: boolean; // Use jstz library fallback
  enableGeolocation?: boolean; // Use geolocation API (future)
}

/**
 * TimezoneService class for robust timezone detection and handling
 */
export class TimezoneService {
  private logger: RequestLogger;
  private options: TimezoneDetectionOptions;

  constructor(logger: RequestLogger, options: TimezoneDetectionOptions = {}) {
    this.logger = logger;
    this.options = {
      fallbackTimezone: 'UTC',
      enableBrowserAPI: true,
      enableJSLibrary: true,
      enableGeolocation: false,
      ...options,
    };
  }

  /**
   * Detect user's timezone using multiple methods with fallbacks
   */
  public async detectTimezone(): Promise<TimezoneInfo> {
    this.logger.info('Starting timezone detection', {
      options: this.options,
    });

    // 1. Check for user preference first
    if (this.options.userPreference) {
      const userTz = await this.validateTimezone(this.options.userPreference);
      if (userTz) {
        return {
          ...userTz,
          detectionMethod: 'user_preference',
          confidence: 1.0,
        };
      }
    }

    // 2. Try browser's Intl API (most reliable)
    if (this.options.enableBrowserAPI) {
      try {
        const browserTz = await this.detectFromBrowserAPI();
        if (browserTz?.timezone) {
          return {
            timezone: browserTz.timezone,
            offset: browserTz.offset || 0,
            isDST: browserTz.isDST || false,
            displayName: browserTz.displayName || browserTz.timezone,
            abbreviation: browserTz.abbreviation || '',
            detectionMethod: 'browser_intl_api',
            confidence: 0.95,
          };
        }
      } catch (error) {
        this.logger.warn('Browser API timezone detection failed', { error });
      }
    }

    // 3. Try JavaScript library detection (jstz-style)
    if (this.options.enableJSLibrary) {
      try {
        const jstzTz = await this.detectFromJavaScript();
        if (jstzTz?.timezone) {
          return {
            timezone: jstzTz.timezone,
            offset: jstzTz.offset || 0,
            isDST: jstzTz.isDST || false,
            displayName: jstzTz.displayName || jstzTz.timezone,
            abbreviation: jstzTz.abbreviation || '',
            detectionMethod: 'javascript_library',
            confidence: 0.85,
          };
        }
      } catch (error) {
        this.logger.warn('JavaScript library timezone detection failed', {
          error,
        });
      }
    }

    // 4. Fallback to UTC
    const fallbackTz = await this.validateTimezone(
      this.options.fallbackTimezone || 'UTC',
    );

    if (fallbackTz) {
      return fallbackTz;
    }

    // Final fallback
    return {
      timezone: 'UTC',
      offset: 0,
      isDST: false,
      displayName: 'Coordinated Universal Time',
      abbreviation: 'UTC',
      detectionMethod: 'fallback',
      confidence: 0.5,
    };
  }

  /**
   * Detect timezone using browser's Intl.DateTimeFormat API
   */
  private async detectFromBrowserAPI(): Promise<Partial<TimezoneInfo> | null> {
    if (typeof window === 'undefined' || !window.Intl?.DateTimeFormat) {
      return null;
    }

    try {
      // Get timezone from browser
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

      if (!timezone) {
        return null;
      }

      // Validate and get additional info
      const timezoneInfo = await this.getTimezoneInfo(timezone);
      return timezoneInfo;
    } catch (error) {
      this.logger.warn('Browser Intl API detection failed', { error });
      return null;
    }
  }

  /**
   * Detect timezone using JavaScript date manipulation (jstz-style)
   */
  private async detectFromJavaScript(): Promise<Partial<TimezoneInfo> | null> {
    try {
      // Get current date and summer date to determine DST
      const now = new Date();
      const summer = new Date(now.getFullYear(), 5, 15); // June 15
      const winter = new Date(now.getFullYear(), 11, 15); // December 15

      const nowOffset = now.getTimezoneOffset();
      const summerOffset = summer.getTimezoneOffset();
      const winterOffset = winter.getTimezoneOffset();

      // Determine if currently in DST
      const isDST = nowOffset !== winterOffset;
      const standardOffset = Math.max(summerOffset, winterOffset);

      // Map offset to timezone (simplified mapping)
      const timezone = this.mapOffsetToTimezone(standardOffset, isDST);

      if (!timezone) {
        return null;
      }

      const timezoneInfo = await this.getTimezoneInfo(timezone);
      return {
        ...timezoneInfo,
        isDST,
        offset: -nowOffset, // Convert to positive for consistency
      };
    } catch (error) {
      this.logger.warn('JavaScript timezone detection failed', { error });
      return null;
    }
  }

  /**
   * Get comprehensive timezone information
   */
  private async getTimezoneInfo(
    timezone: string,
  ): Promise<Partial<TimezoneInfo>> {
    try {
      const now = new Date();

      // Get display information using Intl API if available
      let displayName = timezone;
      let abbreviation = '';

      if (typeof window !== 'undefined' && window.Intl?.DateTimeFormat) {
        try {
          const formatter = new Intl.DateTimeFormat('en', {
            timeZone: timezone,
            timeZoneName: 'long',
          });

          const parts = formatter.formatToParts(now);
          const timeZonePart = parts.find(
            (part) => part.type === 'timeZoneName',
          );
          if (timeZonePart) {
            displayName = timeZonePart.value;
          }

          // Get abbreviation
          const shortFormatter = new Intl.DateTimeFormat('en', {
            timeZone: timezone,
            timeZoneName: 'short',
          });
          const shortParts = shortFormatter.formatToParts(now);
          const shortTimeZonePart = shortParts.find(
            (part) => part.type === 'timeZoneName',
          );
          if (shortTimeZonePart) {
            abbreviation = shortTimeZonePart.value;
          }
        } catch (error) {
          // Fallback to timezone string if Intl formatting fails
          displayName = timezone.replace(/_/g, ' ');
        }
      }

      // Calculate current offset
      const offset = this.calculateTimezoneOffset(timezone);

      // Determine DST status
      const isDST = this.isDaylightSavingTime(timezone);

      return {
        timezone,
        offset,
        isDST,
        displayName,
        abbreviation,
      };
    } catch (error) {
      this.logger.warn('Failed to get timezone info', { timezone, error });
      return {
        timezone,
        offset: 0,
        isDST: false,
        displayName: timezone,
        abbreviation: '',
      };
    }
  }

  /**
   * Validate timezone string and return info if valid
   */
  private async validateTimezone(
    timezone: string,
  ): Promise<TimezoneInfo | null> {
    try {
      // Test if timezone is valid by creating a date with it
      if (typeof window !== 'undefined' && window.Intl?.DateTimeFormat) {
        new Intl.DateTimeFormat('en', { timeZone: timezone });
      }

      const info = await this.getTimezoneInfo(timezone);
      if (
        info.timezone &&
        info.offset !== undefined &&
        info.isDST !== undefined &&
        info.displayName &&
        info.abbreviation !== undefined
      ) {
        return {
          timezone: info.timezone,
          offset: info.offset,
          isDST: info.isDST,
          displayName: info.displayName,
          abbreviation: info.abbreviation,
          detectionMethod: 'validation',
          confidence: 0.9,
        };
      }
      return null;
    } catch (error) {
      this.logger.warn('Invalid timezone', { timezone, error });
      return null;
    }
  }

  /**
   * Calculate current UTC offset for a timezone in minutes
   */
  private calculateTimezoneOffset(timezone: string): number {
    try {
      const now = new Date();
      const utc = new Date(now.getTime() + now.getTimezoneOffset() * 60000);

      if (typeof window !== 'undefined' && window.Intl?.DateTimeFormat) {
        const formatter = new Intl.DateTimeFormat('en', {
          timeZone: timezone,
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        });

        const localTime = new Date(formatter.format(utc));
        const offset = (localTime.getTime() - utc.getTime()) / 60000;
        return offset;
      }

      return 0; // Fallback
    } catch (error) {
      return 0;
    }
  }

  /**
   * Check if timezone is currently in daylight saving time
   */
  private isDaylightSavingTime(timezone: string): boolean {
    try {
      const now = new Date();
      const summer = new Date(now.getFullYear(), 5, 15); // June 15
      const winter = new Date(now.getFullYear(), 11, 15); // December 15

      const summerOffset = this.calculateTimezoneOffset(timezone);
      const winterOffset = this.calculateTimezoneOffset(timezone);

      const currentOffset = this.calculateTimezoneOffset(timezone);

      return currentOffset !== winterOffset;
    } catch (error) {
      return false;
    }
  }

  /**
   * Map UTC offset to likely timezone (simplified mapping for fallback)
   */
  private mapOffsetToTimezone(
    offsetMinutes: number,
    isDST: boolean,
  ): string | null {
    // Simplified mapping - in production, use a comprehensive database
    const offsetHours = offsetMinutes / 60;

    // Common timezone mappings
    const timezoneMap: Record<number, string[]> = {
      [-12]: ['Pacific/Baker_Island'],
      [-11]: ['Pacific/Pago_Pago'],
      [-10]: ['Pacific/Honolulu'],
      [-9]: ['America/Anchorage'],
      [-8]: ['America/Los_Angeles'],
      [-7]: ['America/Denver'],
      [-6]: ['America/Chicago'],
      [-5]: ['America/New_York'],
      [-4]: ['America/Halifax'],
      [-3]: ['America/Sao_Paulo'],
      [-2]: ['Atlantic/South_Georgia'],
      [-1]: ['Atlantic/Azores'],
      [0]: ['UTC', 'Europe/London'],
      [1]: ['Europe/Berlin'],
      [2]: ['Europe/Helsinki'],
      [3]: ['Europe/Moscow'],
      [4]: ['Asia/Dubai'],
      [5]: ['Asia/Karachi'],
      [6]: ['Asia/Dhaka'],
      [7]: ['Asia/Bangkok'],
      [8]: ['Asia/Shanghai'],
      [9]: ['Asia/Tokyo'],
      [10]: ['Australia/Sydney'],
      [11]: ['Pacific/Norfolk'],
      [12]: ['Pacific/Auckland'],
    };

    const possibleTimezones = timezoneMap[offsetHours];
    return possibleTimezones ? possibleTimezones[0] : null;
  }

  /**
   * Get user-friendly timezone display string
   */
  public formatTimezone(timezoneInfo: TimezoneInfo): string {
    const offsetHours = Math.floor(Math.abs(timezoneInfo.offset) / 60);
    const offsetMinutes = Math.abs(timezoneInfo.offset) % 60;
    const offsetSign = timezoneInfo.offset >= 0 ? '+' : '-';

    const offsetString = `UTC${offsetSign}${offsetHours.toString().padStart(2, '0')}:${offsetMinutes.toString().padStart(2, '0')}`;

    return `${timezoneInfo.displayName} (${offsetString})`;
  }

  /**
   * Convert time from one timezone to another
   */
  public convertTime(
    date: Date,
    fromTimezone: string,
    toTimezone: string,
  ): Date {
    try {
      if (typeof window !== 'undefined' && window.Intl?.DateTimeFormat) {
        // Use Intl API for accurate conversion
        const formatter = new Intl.DateTimeFormat('en', {
          timeZone: toTimezone,
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false,
        });

        return new Date(formatter.format(date));
      }

      return date; // Fallback - return original date
    } catch (error) {
      this.logger.warn('Time conversion failed', {
        fromTimezone,
        toTimezone,
        error,
      });
      return date;
    }
  }
}

/**
 * Create a TimezoneService instance
 */
export function createTimezoneService(
  logger: RequestLogger,
  options?: TimezoneDetectionOptions,
): TimezoneService {
  return new TimezoneService(logger, options);
}

/**
 * Quick timezone detection utility
 */
export async function detectUserTimezone(
  logger: RequestLogger,
  options?: TimezoneDetectionOptions,
): Promise<TimezoneInfo> {
  const service = createTimezoneService(logger, options);
  return service.detectTimezone();
}
