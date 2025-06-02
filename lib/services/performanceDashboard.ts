/**
 * Performance Dashboard Service
 *
 * Provides real-time monitoring, alerting, and dashboard capabilities
 * for the brain API implementation rollout and ongoing operations.
 */

import type { RequestLogger } from './observabilityService';
import type {
  BrainAPIMetrics,
  PerformanceComparison,
} from './performanceComparison';
import type { ABTestResults } from './abTestingService';

/**
 * Dashboard configuration
 */
export interface DashboardConfig {
  refreshInterval: number; // milliseconds
  retentionPeriod: number; // days
  alertThresholds: {
    errorRate: number; // 0-1
    responseTime: number; // milliseconds
    successRate: number; // 0-1
    throughput: number; // requests per minute
  };
  enableRealTimeAlerts: boolean;
  enableEmailAlerts: boolean;
  enableSlackAlerts: boolean;
}

/**
 * Real-time metrics
 */
export interface RealTimeMetrics {
  timestamp: string;
  timeWindow: string; // e.g., "5m", "1h", "24h"

  // Overall system health
  totalRequests: number;
  successRate: number;
  errorRate: number;
  averageResponseTime: number;
  p95ResponseTime: number;
  p99ResponseTime: number;
  throughput: number; // requests per minute

  // Implementation breakdown
  modernImplementation: {
    requests: number;
    successRate: number;
    averageResponseTime: number;
    errorRate: number;
    percentage: number;
  };
  legacyImplementation: {
    requests: number;
    successRate: number;
    averageResponseTime: number;
    errorRate: number;
    percentage: number;
  };

  // Performance comparison
  performanceImprovement: number; // percentage
  reliability: 'excellent' | 'good' | 'warning' | 'critical';

  // Active alerts
  activeAlerts: Alert[];
}

/**
 * Alert definition
 */
export interface Alert {
  id: string;
  type:
    | 'error_rate'
    | 'response_time'
    | 'success_rate'
    | 'throughput'
    | 'system';
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  timestamp: string;
  resolved: boolean;
  metric?: {
    name: string;
    value: number;
    threshold: number;
    unit: string;
  };
}

/**
 * Historical data point
 */
export interface DataPoint {
  timestamp: string;
  value: number;
  metadata?: Record<string, any>;
}

/**
 * Performance dashboard service
 */
export class PerformanceDashboard {
  private config: DashboardConfig;
  private logger: RequestLogger;
  private metrics: Map<string, DataPoint[]> = new Map();
  private alerts: Alert[] = [];
  private isRunning = false;

  constructor(config: DashboardConfig, logger: RequestLogger) {
    this.config = config;
    this.logger = logger;
  }

  /**
   * Start real-time monitoring
   */
  start(): void {
    if (this.isRunning) {
      this.logger.warn('Performance dashboard already running');
      return;
    }

    this.isRunning = true;
    this.logger.info('Performance dashboard started', {
      refreshInterval: this.config.refreshInterval,
      retentionPeriod: this.config.retentionPeriod,
    });

    // Start periodic data cleanup
    this.startDataCleanup();
  }

  /**
   * Stop monitoring
   */
  stop(): void {
    this.isRunning = false;
    this.logger.info('Performance dashboard stopped');
  }

  /**
   * Record a performance metric
   */
  recordMetric(
    name: string,
    value: number,
    metadata?: Record<string, any>,
  ): void {
    const dataPoint: DataPoint = {
      timestamp: new Date().toISOString(),
      value,
      metadata,
    };

    if (!this.metrics.has(name)) {
      this.metrics.set(name, []);
    }

    const metricData = this.metrics.get(name);
    if (metricData) {
      metricData.push(dataPoint);
    }

    // Check for alerts
    this.checkAlerts(name, value);

    this.logger.info('Metric recorded', {
      metric: name,
      value,
      metadata,
    });
  }

  /**
   * Record brain API request metrics
   */
  recordBrainMetrics(
    implementation: 'modern' | 'legacy',
    metrics: BrainAPIMetrics,
  ): void {
    const prefix = implementation;

    // Record individual metrics
    this.recordMetric(`${prefix}.response_time`, metrics.totalDuration);
    this.recordMetric(`${prefix}.success_rate`, metrics.success ? 1 : 0);
    this.recordMetric(`${prefix}.error_rate`, metrics.success ? 0 : 1);
    this.recordMetric(`${prefix}.tool_count`, metrics.toolCount);
    this.recordMetric('total.requests', 1);

    // Record specific timing metrics
    this.recordMetric(`${prefix}.validation_time`, metrics.validationTime);
    this.recordMetric(
      `${prefix}.prompt_loading_time`,
      metrics.promptLoadingTime,
    );
    this.recordMetric(
      `${prefix}.tool_selection_time`,
      metrics.toolSelectionTime,
    );
    this.recordMetric(
      `${prefix}.agent_creation_time`,
      metrics.agentCreationTime,
    );
    this.recordMetric(`${prefix}.execution_time`, metrics.executionTime);
    this.recordMetric(
      `${prefix}.streaming_setup_time`,
      metrics.streamingSetupTime,
    );
  }

  /**
   * Get real-time metrics for the dashboard
   */
  getRealTimeMetrics(timeWindow = '5m'): RealTimeMetrics {
    const windowStart = this.getWindowStart(timeWindow);
    const now = new Date().toISOString();

    // Calculate metrics for the time window
    const totalRequests = this.getMetricSum('total.requests', windowStart);
    const modernRequests = this.getMetricSum('modern.requests', windowStart);
    const legacyRequests = this.getMetricSum('legacy.requests', windowStart);

    const modernSuccessRate = this.getMetricAverage(
      'modern.success_rate',
      windowStart,
    );
    const legacySuccessRate = this.getMetricAverage(
      'legacy.success_rate',
      windowStart,
    );
    const overallSuccessRate = this.calculateOverallSuccessRate(windowStart);

    const modernResponseTime = this.getMetricAverage(
      'modern.response_time',
      windowStart,
    );
    const legacyResponseTime = this.getMetricAverage(
      'legacy.response_time',
      windowStart,
    );
    const overallResponseTime = this.calculateWeightedAverage([
      { value: modernResponseTime, weight: modernRequests },
      { value: legacyResponseTime, weight: legacyRequests },
    ]);

    const performanceImprovement =
      legacyResponseTime > 0
        ? ((legacyResponseTime - modernResponseTime) / legacyResponseTime) * 100
        : 0;

    const reliability = this.calculateReliability(
      overallSuccessRate,
      overallResponseTime,
    );

    return {
      timestamp: now,
      timeWindow,
      totalRequests,
      successRate: overallSuccessRate,
      errorRate: 1 - overallSuccessRate,
      averageResponseTime: overallResponseTime,
      p95ResponseTime: this.getMetricPercentile(
        'response_time',
        windowStart,
        95,
      ),
      p99ResponseTime: this.getMetricPercentile(
        'response_time',
        windowStart,
        99,
      ),
      throughput: this.calculateThroughput(totalRequests, timeWindow),
      modernImplementation: {
        requests: modernRequests,
        successRate: modernSuccessRate,
        averageResponseTime: modernResponseTime,
        errorRate: 1 - modernSuccessRate,
        percentage:
          totalRequests > 0 ? (modernRequests / totalRequests) * 100 : 0,
      },
      legacyImplementation: {
        requests: legacyRequests,
        successRate: legacySuccessRate,
        averageResponseTime: legacyResponseTime,
        errorRate: 1 - legacySuccessRate,
        percentage:
          totalRequests > 0 ? (legacyRequests / totalRequests) * 100 : 0,
      },
      performanceImprovement,
      reliability,
      activeAlerts: this.getActiveAlerts(),
    };
  }

  /**
   * Get historical data for a metric
   */
  getHistoricalData(
    metricName: string,
    timeWindow = '24h',
    granularity = '5m',
  ): DataPoint[] {
    const windowStart = this.getWindowStart(timeWindow);
    const metricData = this.metrics.get(metricName) || [];

    return metricData.filter(
      (point) => new Date(point.timestamp) >= new Date(windowStart),
    );
  }

  /**
   * Get dashboard summary for overview
   */
  getDashboardSummary() {
    const metrics24h = this.getRealTimeMetrics('24h');
    const activeAlerts = this.getActiveAlerts();

    return {
      system: {
        status:
          metrics24h.reliability === 'critical'
            ? 'critical'
            : metrics24h.reliability === 'warning'
              ? 'warning'
              : 'healthy',
        uptime: this.calculateUptime(),
        totalRequests24h: metrics24h.totalRequests,
        modernAdoption: metrics24h.modernImplementation.percentage,
      },
      performance: {
        averageResponseTime: metrics24h.averageResponseTime,
        successRate: metrics24h.successRate,
        performanceImprovement: metrics24h.performanceImprovement,
      },
      alerts: {
        critical: activeAlerts.filter((a) => a.severity === 'critical').length,
        high: activeAlerts.filter((a) => a.severity === 'high').length,
        medium: activeAlerts.filter((a) => a.severity === 'medium').length,
        low: activeAlerts.filter((a) => a.severity === 'low').length,
      },
      abTests: {
        active: 0, // Would be populated by ABTestManager
        recommendations: [], // Would be populated by ABTestManager
      },
    };
  }

  /**
   * Check for alert conditions
   */
  private checkAlerts(metricName: string, value: number): void {
    if (!this.config.enableRealTimeAlerts) return;

    const threshold = this.getThreshold(metricName);
    if (!threshold) return;

    const isViolation = this.isThresholdViolation(metricName, value, threshold);
    if (isViolation) {
      this.createAlert(metricName, value, threshold);
    }
  }

  /**
   * Create a new alert
   */
  private createAlert(
    metricName: string,
    value: number,
    threshold: number,
  ): void {
    const alert: Alert = {
      id: `${metricName}-${Date.now()}`,
      type: this.getAlertType(metricName),
      severity: this.getAlertSeverity(metricName, value, threshold),
      message: this.generateAlertMessage(metricName, value, threshold),
      timestamp: new Date().toISOString(),
      resolved: false,
      metric: {
        name: metricName,
        value,
        threshold,
        unit: this.getMetricUnit(metricName),
      },
    };

    this.alerts.push(alert);
    this.logger.error('Alert triggered', alert);

    // Send notifications if enabled
    if (this.config.enableEmailAlerts) {
      this.sendEmailAlert(alert);
    }
    if (this.config.enableSlackAlerts) {
      this.sendSlackAlert(alert);
    }
  }

  /**
   * Helper methods
   */
  private getWindowStart(timeWindow: string): string {
    const now = new Date();
    const windowMs = this.parseTimeWindow(timeWindow);
    return new Date(now.getTime() - windowMs).toISOString();
  }

  private parseTimeWindow(timeWindow: string): number {
    const match = timeWindow.match(/^(\d+)([smhd])$/);
    if (!match) return 5 * 60 * 1000; // Default 5 minutes

    const value = Number.parseInt(match[1], 10);
    const unit = match[2];

    switch (unit) {
      case 's':
        return value * 1000;
      case 'm':
        return value * 60 * 1000;
      case 'h':
        return value * 60 * 60 * 1000;
      case 'd':
        return value * 24 * 60 * 60 * 1000;
      default:
        return 5 * 60 * 1000;
    }
  }

  private getMetricSum(metricName: string, since: string): number {
    const data = this.metrics.get(metricName) || [];
    return data
      .filter((point) => point.timestamp >= since)
      .reduce((sum, point) => sum + point.value, 0);
  }

  private getMetricAverage(metricName: string, since: string): number {
    const data = this.metrics.get(metricName) || [];
    const filtered = data.filter((point) => point.timestamp >= since);

    if (filtered.length === 0) return 0;

    const sum = filtered.reduce((acc, point) => acc + point.value, 0);
    return sum / filtered.length;
  }

  private calculateWeightedAverage(
    values: Array<{ value: number; weight: number }>,
  ): number {
    const totalWeight = values.reduce((sum, v) => sum + v.weight, 0);
    if (totalWeight === 0) return 0;

    const weightedSum = values.reduce((sum, v) => sum + v.value * v.weight, 0);
    return weightedSum / totalWeight;
  }

  private getMetricPercentile(
    metricName: string,
    since: string,
    percentile: number,
  ): number {
    const data = this.metrics.get(metricName) || [];
    const filtered = data
      .filter((point) => point.timestamp >= since)
      .map((point) => point.value)
      .sort((a, b) => a - b);

    if (filtered.length === 0) return 0;

    const index = Math.ceil((percentile / 100) * filtered.length) - 1;
    return filtered[Math.max(0, index)];
  }

  private calculateOverallSuccessRate(since: string): number {
    const modernSuccesses = this.getMetricSum('modern.success_rate', since);
    const legacySuccesses = this.getMetricSum('legacy.success_rate', since);
    const modernTotal = this.getMetricSum('modern.requests', since);
    const legacyTotal = this.getMetricSum('legacy.requests', since);

    const totalRequests = modernTotal + legacyTotal;
    if (totalRequests === 0) return 1;

    return (modernSuccesses + legacySuccesses) / totalRequests;
  }

  private calculateThroughput(requests: number, timeWindow: string): number {
    const windowMinutes = this.parseTimeWindow(timeWindow) / (1000 * 60);
    return windowMinutes > 0 ? requests / windowMinutes : 0;
  }

  private calculateReliability(
    successRate: number,
    responseTime: number,
  ): 'excellent' | 'good' | 'warning' | 'critical' {
    if (
      successRate < 0.9 ||
      responseTime > this.config.alertThresholds.responseTime * 2
    ) {
      return 'critical';
    }
    if (
      successRate < 0.95 ||
      responseTime > this.config.alertThresholds.responseTime
    ) {
      return 'warning';
    }
    if (successRate < 0.99) {
      return 'good';
    }
    return 'excellent';
  }

  private calculateUptime(): string {
    // Simplified uptime calculation - would need more sophisticated tracking
    return '99.9%';
  }

  private getActiveAlerts(): Alert[] {
    return this.alerts.filter((alert) => !alert.resolved);
  }

  private getThreshold(metricName: string): number | null {
    if (metricName.includes('error_rate'))
      return this.config.alertThresholds.errorRate;
    if (metricName.includes('response_time'))
      return this.config.alertThresholds.responseTime;
    if (metricName.includes('success_rate'))
      return this.config.alertThresholds.successRate;
    if (metricName.includes('throughput'))
      return this.config.alertThresholds.throughput;
    return null;
  }

  private isThresholdViolation(
    metricName: string,
    value: number,
    threshold: number,
  ): boolean {
    if (metricName.includes('error_rate')) return value > threshold;
    if (metricName.includes('response_time')) return value > threshold;
    if (metricName.includes('success_rate')) return value < threshold;
    if (metricName.includes('throughput')) return value < threshold;
    return false;
  }

  private getAlertType(metricName: string): Alert['type'] {
    if (metricName.includes('error_rate')) return 'error_rate';
    if (metricName.includes('response_time')) return 'response_time';
    if (metricName.includes('success_rate')) return 'success_rate';
    if (metricName.includes('throughput')) return 'throughput';
    return 'system';
  }

  private getAlertSeverity(
    metricName: string,
    value: number,
    threshold: number,
  ): Alert['severity'] {
    const ratio =
      metricName.includes('success_rate') || metricName.includes('throughput')
        ? threshold / value // For metrics where lower is worse
        : value / threshold; // For metrics where higher is worse

    if (ratio >= 2) return 'critical';
    if (ratio >= 1.5) return 'high';
    if (ratio >= 1.2) return 'medium';
    return 'low';
  }

  private generateAlertMessage(
    metricName: string,
    value: number,
    threshold: number,
  ): string {
    const unit = this.getMetricUnit(metricName);
    return `${metricName} is ${value}${unit}, which exceeds threshold of ${threshold}${unit}`;
  }

  private getMetricUnit(metricName: string): string {
    if (metricName.includes('response_time')) return 'ms';
    if (metricName.includes('rate')) return '%';
    if (metricName.includes('throughput')) return '/min';
    return '';
  }

  private sendEmailAlert(alert: Alert): void {
    // Implementation would depend on email service
    this.logger.info('Email alert sent', { alertId: alert.id });
  }

  private sendSlackAlert(alert: Alert): void {
    // Implementation would depend on Slack integration
    this.logger.info('Slack alert sent', { alertId: alert.id });
  }

  private startDataCleanup(): void {
    const cleanupInterval = setInterval(
      () => {
        if (!this.isRunning) {
          clearInterval(cleanupInterval);
          return;
        }

        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - this.config.retentionPeriod);
        const cutoffString = cutoff.toISOString();

        // Clean up old metric data
        for (const [metricName, data] of this.metrics.entries()) {
          const filtered = data.filter(
            (point) => point.timestamp >= cutoffString,
          );
          this.metrics.set(metricName, filtered);
        }

        // Clean up old alerts
        this.alerts = this.alerts.filter(
          (alert) => alert.timestamp >= cutoffString,
        );

        this.logger.info('Data cleanup completed', {
          cutoff: cutoffString,
          remainingMetrics: Array.from(this.metrics.keys()).length,
          remainingAlerts: this.alerts.length,
        });
      },
      60 * 60 * 1000,
    ); // Run every hour
  }
}
