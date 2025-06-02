/**
 * A/B Testing Service
 *
 * Manages A/B testing between modern and legacy brain API implementations
 * with real-time monitoring, traffic splitting, and automatic rollback capabilities.
 */

import type { RequestLogger } from './observabilityService';
import type {
  BrainAPIMetrics,
  PerformanceComparison,
} from './performanceComparison';

/**
 * A/B Test configuration
 */
export interface ABTestConfig {
  testId: string;
  name: string;
  description: string;
  rolloutPercentage: number; // 0-100
  startDate: Date;
  endDate?: Date;
  enabled: boolean;

  // Success criteria
  maxErrorRate: number; // 0-1 (e.g., 0.05 = 5%)
  minSuccessRate: number; // 0-1 (e.g., 0.95 = 95%)
  maxResponseTime: number; // milliseconds

  // Automatic rollback triggers
  enableAutoRollback: boolean;
  errorThreshold: number; // errors per minute
  performanceThreshold: number; // response time degradation %
}

/**
 * A/B Test results and metrics
 */
export interface ABTestResults {
  testId: string;
  startTime: string;
  duration: number; // minutes

  // Traffic split
  totalRequests: number;
  modernRequests: number;
  legacyRequests: number;
  actualRolloutPercentage: number;

  // Performance metrics
  modern: {
    successRate: number;
    averageResponseTime: number;
    errorRate: number;
    throughput: number; // requests per minute
  };
  legacy: {
    successRate: number;
    averageResponseTime: number;
    errorRate: number;
    throughput: number;
  };

  // Comparison
  performanceImprovement: number; // percentage
  recommendation: 'continue' | 'rollback' | 'increase' | 'maintain';
  confidence: number; // 0-1

  // Status
  status: 'running' | 'stopped' | 'completed' | 'rolled_back';
  alerts: string[];
}

/**
 * User bucketing for consistent A/B testing
 */
export interface UserBucket {
  userId?: string;
  sessionId?: string;
  ipAddress?: string;
  bucket: 'modern' | 'legacy';
  timestamp: Date;
}

/**
 * A/B Testing service class
 */
export class ABTestingService {
  private testConfig: ABTestConfig;
  private results: ABTestResults;
  private buckets: Map<string, UserBucket> = new Map();
  private logger: RequestLogger;

  constructor(config: ABTestConfig, logger: RequestLogger) {
    this.testConfig = config;
    this.logger = logger;
    this.results = this.initializeResults();
  }

  /**
   * Initialize test results
   */
  private initializeResults(): ABTestResults {
    return {
      testId: this.testConfig.testId,
      startTime: new Date().toISOString(),
      duration: 0,
      totalRequests: 0,
      modernRequests: 0,
      legacyRequests: 0,
      actualRolloutPercentage: 0,
      modern: {
        successRate: 0,
        averageResponseTime: 0,
        errorRate: 0,
        throughput: 0,
      },
      legacy: {
        successRate: 0,
        averageResponseTime: 0,
        errorRate: 0,
        throughput: 0,
      },
      performanceImprovement: 0,
      recommendation: 'maintain',
      confidence: 0.5,
      status: 'running',
      alerts: [],
    };
  }

  /**
   * Determine which implementation a user should get
   */
  assignUserToBucket(
    userId?: string,
    sessionId?: string,
    ipAddress?: string,
  ): 'modern' | 'legacy' {
    if (!this.testConfig.enabled) {
      this.logger.info('A/B testing disabled, using legacy implementation');
      return 'legacy';
    }

    // Create identifier for consistent bucketing
    const identifier = userId || sessionId || ipAddress || 'anonymous';

    // Check if user is already bucketed
    const existingBucket = this.buckets.get(identifier);
    if (existingBucket) {
      return existingBucket.bucket;
    }

    // Assign new bucket based on rollout percentage
    const hash = this.hashString(identifier);
    const bucket =
      hash % 100 < this.testConfig.rolloutPercentage ? 'modern' : 'legacy';

    // Store bucket assignment
    const userBucket: UserBucket = {
      userId,
      sessionId,
      ipAddress,
      bucket,
      timestamp: new Date(),
    };
    this.buckets.set(identifier, userBucket);

    this.logger.info('User assigned to A/B test bucket', {
      identifier: identifier.substring(0, 8), // Partial for privacy
      bucket,
      rolloutPercentage: this.testConfig.rolloutPercentage,
      testId: this.testConfig.testId,
    });

    return bucket;
  }

  /**
   * Record test result for analysis
   */
  recordTestResult(
    bucket: 'modern' | 'legacy',
    metrics: BrainAPIMetrics,
  ): void {
    this.results.totalRequests++;

    if (bucket === 'modern') {
      this.results.modernRequests++;
      this.updateBucketMetrics(this.results.modern, metrics);
    } else {
      this.results.legacyRequests++;
      this.updateBucketMetrics(this.results.legacy, metrics);
    }

    // Update overall test metrics
    this.updateTestResults();

    // Check for automatic rollback conditions
    if (this.testConfig.enableAutoRollback) {
      this.checkRollbackConditions();
    }

    this.logger.info('A/B test result recorded', {
      bucket,
      success: metrics.success,
      duration: metrics.totalDuration,
      testId: this.testConfig.testId,
      totalRequests: this.results.totalRequests,
    });
  }

  /**
   * Update bucket-specific metrics
   */
  private updateBucketMetrics(
    bucketResults: any,
    metrics: BrainAPIMetrics,
  ): void {
    // Calculate running averages
    const total =
      bucketResults === this.results.modern
        ? this.results.modernRequests
        : this.results.legacyRequests;

    bucketResults.averageResponseTime =
      (bucketResults.averageResponseTime * (total - 1) +
        metrics.totalDuration) /
      total;

    bucketResults.successRate =
      (bucketResults.successRate * (total - 1) + (metrics.success ? 1 : 0)) /
      total;

    bucketResults.errorRate = 1 - bucketResults.successRate;
  }

  /**
   * Update overall test results and generate recommendations
   */
  private updateTestResults(): void {
    // Calculate actual rollout percentage
    this.results.actualRolloutPercentage =
      this.results.totalRequests > 0
        ? (this.results.modernRequests / this.results.totalRequests) * 100
        : 0;

    // Calculate performance improvement
    if (this.results.legacy.averageResponseTime > 0) {
      this.results.performanceImprovement =
        ((this.results.legacy.averageResponseTime -
          this.results.modern.averageResponseTime) /
          this.results.legacy.averageResponseTime) *
        100;
    }

    // Generate recommendation
    this.generateRecommendation();

    // Calculate test duration
    const startTime = new Date(this.results.startTime);
    this.results.duration = (Date.now() - startTime.getTime()) / (1000 * 60); // minutes
  }

  /**
   * Generate recommendation based on current results
   */
  private generateRecommendation(): void {
    const { modern, legacy } = this.results;

    // Check minimum data requirements
    if (this.results.totalRequests < 100) {
      this.results.recommendation = 'maintain';
      this.results.confidence = 0.3;
      return;
    }

    // Check for obvious problems
    if (modern.errorRate > this.testConfig.maxErrorRate) {
      this.results.recommendation = 'rollback';
      this.results.confidence = 0.9;
      this.results.alerts.push(
        `Modern error rate (${(modern.errorRate * 100).toFixed(1)}%) exceeds threshold`,
      );
      return;
    }

    if (modern.successRate < this.testConfig.minSuccessRate) {
      this.results.recommendation = 'rollback';
      this.results.confidence = 0.9;
      this.results.alerts.push(
        `Modern success rate (${(modern.successRate * 100).toFixed(1)}%) below threshold`,
      );
      return;
    }

    // Check for performance improvements
    if (
      this.results.performanceImprovement > 20 &&
      modern.successRate >= legacy.successRate
    ) {
      this.results.recommendation = 'increase';
      this.results.confidence = 0.8;
    } else if (
      this.results.performanceImprovement > 0 &&
      modern.successRate >= legacy.successRate
    ) {
      this.results.recommendation = 'continue';
      this.results.confidence = 0.7;
    } else if (modern.successRate >= legacy.successRate) {
      this.results.recommendation = 'maintain';
      this.results.confidence = 0.6;
    } else {
      this.results.recommendation = 'rollback';
      this.results.confidence = 0.8;
      this.results.alerts.push('Modern implementation underperforming legacy');
    }
  }

  /**
   * Check if automatic rollback conditions are met
   */
  private checkRollbackConditions(): void {
    const { modern } = this.results;

    // Check error rate threshold
    if (modern.errorRate > this.testConfig.maxErrorRate) {
      this.triggerAutoRollback(
        `Error rate ${(modern.errorRate * 100).toFixed(1)}% exceeds threshold`,
      );
      return;
    }

    // Check response time threshold
    if (modern.averageResponseTime > this.testConfig.maxResponseTime) {
      this.triggerAutoRollback(
        `Response time ${modern.averageResponseTime.toFixed(0)}ms exceeds threshold`,
      );
      return;
    }

    // Check performance degradation
    if (
      this.results.performanceImprovement <
      -this.testConfig.performanceThreshold
    ) {
      this.triggerAutoRollback(
        `Performance degraded by ${Math.abs(this.results.performanceImprovement).toFixed(1)}%`,
      );
      return;
    }
  }

  /**
   * Trigger automatic rollback
   */
  private triggerAutoRollback(reason: string): void {
    this.logger.error('A/B test auto-rollback triggered', {
      reason,
      testId: this.testConfig.testId,
      modernErrorRate: this.results.modern.errorRate,
      modernResponseTime: this.results.modern.averageResponseTime,
      performanceChange: this.results.performanceImprovement,
    });

    this.testConfig.enabled = false;
    this.testConfig.rolloutPercentage = 0;
    this.results.status = 'rolled_back';
    this.results.alerts.push(`AUTO-ROLLBACK: ${reason}`);
  }

  /**
   * Get current test status and results
   */
  getTestResults(): ABTestResults {
    this.updateTestResults();
    return { ...this.results };
  }

  /**
   * Stop the A/B test
   */
  stopTest(): void {
    this.testConfig.enabled = false;
    this.results.status = 'stopped';

    this.logger.info('A/B test stopped', {
      testId: this.testConfig.testId,
      totalRequests: this.results.totalRequests,
      duration: this.results.duration,
      recommendation: this.results.recommendation,
    });
  }

  /**
   * Simple hash function for consistent user bucketing
   */
  private hashString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }
}

/**
 * Global A/B testing manager
 */
export class ABTestManager {
  private static instance: ABTestManager;
  private activeTests: Map<string, ABTestingService> = new Map();
  private logger: RequestLogger;

  private constructor(logger: RequestLogger) {
    this.logger = logger;
  }

  static getInstance(logger: RequestLogger): ABTestManager {
    if (!ABTestManager.instance) {
      ABTestManager.instance = new ABTestManager(logger);
    }
    return ABTestManager.instance;
  }

  /**
   * Create and start a new A/B test
   */
  createTest(config: ABTestConfig): ABTestingService {
    const testService = new ABTestingService(config, this.logger);
    this.activeTests.set(config.testId, testService);

    this.logger.info('A/B test created', {
      testId: config.testId,
      name: config.name,
      rolloutPercentage: config.rolloutPercentage,
      enabled: config.enabled,
    });

    return testService;
  }

  /**
   * Get an active test by ID
   */
  getTest(testId: string): ABTestingService | undefined {
    return this.activeTests.get(testId);
  }

  /**
   * Get all active tests
   */
  getAllTests(): ABTestingService[] {
    return Array.from(this.activeTests.values());
  }

  /**
   * Stop and remove a test
   */
  stopTest(testId: string): void {
    const test = this.activeTests.get(testId);
    if (test) {
      test.stopTest();
      this.activeTests.delete(testId);
    }
  }

  /**
   * Get summary of all test results
   */
  getTestSummary(): any {
    const tests = this.getAllTests();
    return {
      totalTests: tests.length,
      runningTests: tests.filter((t) => t.getTestResults().status === 'running')
        .length,
      completedTests: tests.filter(
        (t) => t.getTestResults().status === 'completed',
      ).length,
      rolledBackTests: tests.filter(
        (t) => t.getTestResults().status === 'rolled_back',
      ).length,
      tests: tests.map((t) => t.getTestResults()),
    };
  }
}
