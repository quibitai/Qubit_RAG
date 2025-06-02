/**
 * Admin Dashboard Utilities
 *
 * Helper functions for data formatting, status management, and dashboard operations
 */

export interface DashboardStatusType {
  status:
    | 'operational'
    | 'warning'
    | 'critical'
    | 'healthy'
    | 'optimal'
    | 'error'
    | 'unknown';
  color: string;
  background: string;
}

/**
 * Get status styling based on status string
 */
export function getStatusStyling(status: string): DashboardStatusType {
  const normalizedStatus =
    status.toLowerCase() as DashboardStatusType['status'];

  switch (normalizedStatus) {
    case 'operational':
    case 'healthy':
    case 'optimal':
      return {
        status: normalizedStatus,
        color: 'text-green-600',
        background: 'bg-green-100',
      };
    case 'warning':
      return {
        status: normalizedStatus,
        color: 'text-yellow-600',
        background: 'bg-yellow-100',
      };
    case 'critical':
    case 'error':
      return {
        status: normalizedStatus,
        color: 'text-red-600',
        background: 'bg-red-100',
      };
    default:
      return {
        status: 'unknown',
        color: 'text-gray-600',
        background: 'bg-gray-100',
      };
  }
}

/**
 * Format bytes to human readable format
 */
export function formatBytes(bytes: number, decimals = 2): string {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];

  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${Number.parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

/**
 * Format milliseconds to human readable time
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms < 3600000) return `${(ms / 60000).toFixed(1)}m`;
  return `${(ms / 3600000).toFixed(1)}h`;
}

/**
 * Format percentage with proper decimal places
 */
export function formatPercentage(value: number, decimals = 1): string {
  return `${(value * 100).toFixed(decimals)}%`;
}

/**
 * Calculate percentage change between two values
 */
export function calculatePercentageChange(
  current: number,
  previous: number,
): {
  change: number;
  isPositive: boolean;
  formatted: string;
} {
  const change = ((current - previous) / previous) * 100;
  const isPositive = change >= 0;
  const formatted = `${isPositive ? '+' : ''}${change.toFixed(1)}%`;

  return { change, isPositive, formatted };
}

/**
 * Get relative time string (e.g., "2 minutes ago")
 */
export function getRelativeTime(date: Date): string {
  const now = new Date();
  const diff = now.getTime() - date.getTime();

  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days} day${days > 1 ? 's' : ''} ago`;
  if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
  if (minutes > 0) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
  return `${seconds} second${seconds > 1 ? 's' : ''} ago`;
}

/**
 * Determine system health based on multiple metrics
 */
export function calculateSystemHealth(metrics: {
  successRate: number;
  errorRate: number;
  responseTime: number;
  uptime: number;
}): DashboardStatusType {
  const { successRate, errorRate, responseTime, uptime } = metrics;

  // Critical conditions
  if (
    successRate < 0.85 ||
    errorRate > 0.15 ||
    responseTime > 30000 ||
    uptime < 0.95
  ) {
    return getStatusStyling('critical');
  }

  // Warning conditions
  if (
    successRate < 0.95 ||
    errorRate > 0.05 ||
    responseTime > 15000 ||
    uptime < 0.99
  ) {
    return getStatusStyling('warning');
  }

  // Healthy conditions
  return getStatusStyling('operational');
}

/**
 * Generate mock performance data for demonstration
 */
export function generateMockMetrics() {
  const baseSuccessRate = 0.97;
  const baseResponseTime = 8300;
  const baseErrorRate = 0.03;

  return {
    successRate: baseSuccessRate + (Math.random() - 0.5) * 0.02,
    responseTime: baseResponseTime + (Math.random() - 0.5) * 2000,
    errorRate: baseErrorRate + (Math.random() - 0.5) * 0.01,
    throughput: 25 + Math.random() * 10,
    totalRequests: Math.floor(120 + Math.random() * 40),
  };
}

/**
 * Validate admin permissions (placeholder for future role-based access)
 */
export function hasAdminPermissions(user: any): boolean {
  // For now, all authenticated users have admin access
  // In the future, this could check specific roles or permissions
  return !!user;
}

/**
 * Format API endpoint status for display
 */
export function formatEndpointStatus(
  endpoint: string,
  status: boolean,
): {
  name: string;
  status: string;
  styling: DashboardStatusType;
} {
  const name = endpoint
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (str) => str.toUpperCase())
    .trim();

  const statusString = status ? 'operational' : 'error';
  const styling = getStatusStyling(statusString);

  return { name, status: statusString, styling };
}
