'use client';

import { useEffect, useState } from 'react';

export interface ClientTimezoneInfo {
  timezone: string; // IANA timezone (e.g., "America/Chicago")
  offset: number; // Current UTC offset in minutes
  isDST: boolean; // Whether currently in daylight saving time
  displayName: string; // Human-readable name
  abbreviation: string; // Timezone abbreviation
  detectionMethod: string;
  confidence: number;
}

interface TimezoneDetectorProps {
  onTimezoneDetected?: (timezone: ClientTimezoneInfo) => void;
  children?: React.ReactNode;
}

/**
 * Client-side timezone detection component using browser APIs
 */
export default function TimezoneDetector({
  onTimezoneDetected,
  children,
}: TimezoneDetectorProps) {
  const [timezone, setTimezone] = useState<ClientTimezoneInfo | null>(null);
  const [isDetecting, setIsDetecting] = useState(true);

  useEffect(() => {
    const detectTimezone = () => {
      try {
        // Use browser's Intl API for most reliable detection
        if (
          typeof window !== 'undefined' &&
          'Intl' in window &&
          'DateTimeFormat' in window.Intl
        ) {
          const resolvedOptions = Intl.DateTimeFormat().resolvedOptions();
          const detectedTimezone = resolvedOptions.timeZone;

          if (detectedTimezone) {
            // Get additional timezone information
            const now = new Date();

            // Get display name
            let displayName = detectedTimezone;
            let abbreviation = '';

            try {
              const formatter = new Intl.DateTimeFormat('en', {
                timeZone: detectedTimezone,
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
                timeZone: detectedTimezone,
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
              displayName = detectedTimezone.replace(/_/g, ' ');
            }

            // Calculate current offset
            const offset = -now.getTimezoneOffset(); // Convert to positive offset

            // Determine DST status
            const summer = new Date(now.getFullYear(), 5, 15); // June 15
            const winter = new Date(now.getFullYear(), 11, 15); // December 15
            const isDST =
              now.getTimezoneOffset() !== winter.getTimezoneOffset();

            const timezoneInfo: ClientTimezoneInfo = {
              timezone: detectedTimezone,
              offset,
              isDST,
              displayName,
              abbreviation,
              detectionMethod: 'browser_intl_api',
              confidence: 0.95,
            };

            setTimezone(timezoneInfo);

            // Store in localStorage for persistence
            localStorage.setItem(
              'detectedTimezone',
              JSON.stringify(timezoneInfo),
            );

            // Notify parent component
            onTimezoneDetected?.(timezoneInfo);

            console.log('Timezone detected:', timezoneInfo);
            return;
          }
        }

        // Fallback: JavaScript-based detection
        const now = new Date();
        const offset = -now.getTimezoneOffset();

        // Simple timezone mapping based on offset
        const getTimezoneFromOffset = (offsetMinutes: number): string => {
          const offsetHours = offsetMinutes / 60;
          const timezoneMap: Record<number, string> = {
            [-12]: 'Pacific/Baker_Island',
            [-11]: 'Pacific/Pago_Pago',
            [-10]: 'Pacific/Honolulu',
            [-9]: 'America/Anchorage',
            [-8]: 'America/Los_Angeles',
            [-7]: 'America/Denver',
            [-6]: 'America/Chicago',
            [-5]: 'America/New_York',
            [-4]: 'America/Halifax',
            [-3]: 'America/Sao_Paulo',
            [-2]: 'Atlantic/South_Georgia',
            [-1]: 'Atlantic/Azores',
            [0]: 'UTC',
            [1]: 'Europe/Berlin',
            [2]: 'Europe/Helsinki',
            [3]: 'Europe/Moscow',
            [4]: 'Asia/Dubai',
            [5]: 'Asia/Karachi',
            [6]: 'Asia/Dhaka',
            [7]: 'Asia/Bangkok',
            [8]: 'Asia/Shanghai',
            [9]: 'Asia/Tokyo',
            [10]: 'Australia/Sydney',
            [11]: 'Pacific/Norfolk',
            [12]: 'Pacific/Auckland',
          };
          return timezoneMap[offsetHours] || 'UTC';
        };

        const fallbackTimezone = getTimezoneFromOffset(offset);
        const summer = new Date(now.getFullYear(), 5, 15);
        const winter = new Date(now.getFullYear(), 11, 15);
        const isDST = now.getTimezoneOffset() !== winter.getTimezoneOffset();

        const fallbackInfo: ClientTimezoneInfo = {
          timezone: fallbackTimezone,
          offset,
          isDST,
          displayName: fallbackTimezone.replace(/_/g, ' '),
          abbreviation: '',
          detectionMethod: 'javascript_fallback',
          confidence: 0.7,
        };

        setTimezone(fallbackInfo);
        localStorage.setItem('detectedTimezone', JSON.stringify(fallbackInfo));
        onTimezoneDetected?.(fallbackInfo);
      } catch (error) {
        console.warn('Timezone detection failed:', error);

        // Final fallback to UTC
        const utcInfo: ClientTimezoneInfo = {
          timezone: 'UTC',
          offset: 0,
          isDST: false,
          displayName: 'Coordinated Universal Time',
          abbreviation: 'UTC',
          detectionMethod: 'fallback',
          confidence: 0.5,
        };

        setTimezone(utcInfo);
        localStorage.setItem('detectedTimezone', JSON.stringify(utcInfo));
        onTimezoneDetected?.(utcInfo);
      } finally {
        setIsDetecting(false);
      }
    };

    // Check if we already have a stored timezone
    const stored = localStorage.getItem('detectedTimezone');
    if (stored) {
      try {
        const parsedTimezone = JSON.parse(stored) as ClientTimezoneInfo;
        setTimezone(parsedTimezone);
        onTimezoneDetected?.(parsedTimezone);
        setIsDetecting(false);
        return;
      } catch (error) {
        console.warn('Failed to parse stored timezone:', error);
      }
    }

    // Detect timezone
    detectTimezone();
  }, [onTimezoneDetected]);

  // Helper function to get current time in detected timezone
  const getCurrentTime = (targetTimezone?: string): string => {
    if (!timezone && !targetTimezone) return new Date().toLocaleString();

    const tz = targetTimezone || timezone?.timezone || 'UTC';

    try {
      return new Date().toLocaleString('en-US', {
        timeZone: tz,
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        second: '2-digit',
        timeZoneName: 'short',
      });
    } catch (error) {
      return new Date().toLocaleString();
    }
  };

  // Helper function to convert time between timezones
  const convertTime = (fromTimezone: string, toTimezone: string): string => {
    try {
      const now = new Date();
      return now.toLocaleString('en-US', {
        timeZone: toTimezone,
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        second: '2-digit',
        timeZoneName: 'short',
      });
    } catch (error) {
      return new Date().toLocaleString();
    }
  };

  // Expose timezone utilities globally
  useEffect(() => {
    if (typeof window !== 'undefined' && timezone) {
      (window as any).timezoneUtils = {
        detected: timezone,
        getCurrentTime,
        convertTime,
        getTimeInTimezone: (tz: string) => getCurrentTime(tz),
      };
    }
  }, [timezone]);

  if (isDetecting) {
    return <div className="text-sm text-gray-500">Detecting timezone...</div>;
  }

  return (
    <>
      {children}
      {/* Optionally display timezone info */}
      {timezone && (
        <div
          className="hidden"
          data-timezone={timezone.timezone}
          data-offset={timezone.offset}
        >
          {/* Hidden timezone data for debugging */}
        </div>
      )}
    </>
  );
}

/**
 * Hook to use timezone detection in other components
 */
export function useTimezone() {
  const [timezone, setTimezone] = useState<ClientTimezoneInfo | null>(null);

  useEffect(() => {
    // Check localStorage for detected timezone
    const stored = localStorage.getItem('detectedTimezone');
    if (stored) {
      try {
        const parsedTimezone = JSON.parse(stored) as ClientTimezoneInfo;
        setTimezone(parsedTimezone);
      } catch (error) {
        console.warn('Failed to parse stored timezone:', error);
      }
    }

    // Listen for timezone detection events
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'detectedTimezone' && e.newValue) {
        try {
          const parsedTimezone = JSON.parse(e.newValue) as ClientTimezoneInfo;
          setTimezone(parsedTimezone);
        } catch (error) {
          console.warn('Failed to parse timezone from storage event:', error);
        }
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  const getCurrentTime = (targetTimezone?: string): string => {
    const tz = targetTimezone || timezone?.timezone || 'UTC';

    try {
      return new Date().toLocaleString('en-US', {
        timeZone: tz,
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        second: '2-digit',
        timeZoneName: 'short',
      });
    } catch (error) {
      return new Date().toLocaleString();
    }
  };

  return {
    timezone,
    getCurrentTime,
    isReady: !!timezone,
  };
}
