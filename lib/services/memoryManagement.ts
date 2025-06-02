/**
 * Memory and State Management Service
 *
 * Optimizes memory usage, manages state lifecycle, and prevents memory leaks
 * in the brain API implementation for production environments.
 */

import type { RequestLogger } from './observabilityService';

/**
 * Memory usage statistics
 */
export interface MemoryStats {
  heapUsed: number; // bytes
  heapTotal: number; // bytes
  external: number; // bytes
  rss: number; // bytes (Resident Set Size)
  arrayBuffers: number; // bytes
  timestamp: string;
}

/**
 * Memory threshold configuration
 */
export interface MemoryThresholds {
  heapUsedWarning: number; // MB
  heapUsedCritical: number; // MB
  rssWarning: number; // MB
  rssCritical: number; // MB
  gcForceThreshold: number; // MB
}

/**
 * State cache configuration
 */
export interface CacheConfig {
  maxEntries: number;
  ttlMinutes: number;
  cleanupIntervalMinutes: number;
  enableCompression: boolean;
}

/**
 * Cached entry with metadata
 */
export interface CacheEntry<T> {
  data: T;
  timestamp: number;
  accessCount: number;
  lastAccessed: number;
  size: number; // estimated bytes
}

/**
 * Resource cleanup configuration
 */
export interface CleanupConfig {
  enableAutoCleanup: boolean;
  cleanupIntervalMinutes: number;
  maxAgeMinutes: number;
  maxResourceCount: number;
}

/**
 * Memory management service
 */
export class MemoryManager {
  private thresholds: MemoryThresholds;
  private cacheConfig: CacheConfig;
  private cleanupConfig: CleanupConfig;
  private logger: RequestLogger;

  // State management
  private stateCache = new Map<string, CacheEntry<any>>();
  private resourceRegistry = new Set<{ cleanup: () => void; id: string }>();
  private cleanupInterval?: NodeJS.Timeout;
  private memoryMonitorInterval?: NodeJS.Timeout;

  // Statistics
  private lastGC = Date.now();
  private gcCount = 0;
  private memoryLeakWarnings = 0;

  constructor(
    thresholds: MemoryThresholds,
    cacheConfig: CacheConfig,
    cleanupConfig: CleanupConfig,
    logger: RequestLogger,
  ) {
    this.thresholds = thresholds;
    this.cacheConfig = cacheConfig;
    this.cleanupConfig = cleanupConfig;
    this.logger = logger;
  }

  /**
   * Start memory management
   */
  start(): void {
    this.logger.info('Starting memory management service', {
      thresholds: this.thresholds,
      cacheConfig: this.cacheConfig,
      cleanupConfig: this.cleanupConfig,
    });

    // Start memory monitoring
    this.startMemoryMonitoring();

    // Start automatic cleanup
    if (this.cleanupConfig.enableAutoCleanup) {
      this.startAutoCleanup();
    }
  }

  /**
   * Stop memory management
   */
  stop(): void {
    this.logger.info('Stopping memory management service');

    if (this.memoryMonitorInterval) {
      clearInterval(this.memoryMonitorInterval);
    }

    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }

    // Final cleanup
    this.performCleanup();
  }

  /**
   * Get current memory statistics
   */
  getMemoryStats(): MemoryStats {
    const memUsage = process.memoryUsage();

    return {
      heapUsed: memUsage.heapUsed,
      heapTotal: memUsage.heapTotal,
      external: memUsage.external,
      rss: memUsage.rss,
      arrayBuffers: memUsage.arrayBuffers,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Cache state with automatic cleanup
   */
  cacheState<T>(key: string, data: T, customTTL?: number): void {
    const now = Date.now();
    const estimatedSize = this.estimateObjectSize(data);

    // Check if we need to evict entries
    if (this.stateCache.size >= this.cacheConfig.maxEntries) {
      this.evictOldestEntries(1);
    }

    const entry: CacheEntry<T> = {
      data,
      timestamp: now,
      accessCount: 0,
      lastAccessed: now,
      size: estimatedSize,
    };

    this.stateCache.set(key, entry);

    this.logger.info('State cached', {
      key: key.substring(0, 32), // Truncate for privacy
      size: estimatedSize,
      cacheSize: this.stateCache.size,
    });
  }

  /**
   * Retrieve cached state
   */
  getCachedState<T>(key: string): T | null {
    const entry = this.stateCache.get(key);

    if (!entry) {
      return null;
    }

    const now = Date.now();
    const ageMinutes = (now - entry.timestamp) / (1000 * 60);
    const ttl = this.cacheConfig.ttlMinutes;

    // Check if expired
    if (ageMinutes > ttl) {
      this.stateCache.delete(key);
      this.logger.info('Cache entry expired', { key: key.substring(0, 32) });
      return null;
    }

    // Update access statistics
    entry.accessCount++;
    entry.lastAccessed = now;

    this.logger.info('Cache hit', {
      key: key.substring(0, 32),
      accessCount: entry.accessCount,
      ageMinutes: ageMinutes.toFixed(2),
    });

    return entry.data as T;
  }

  /**
   * Register a resource for cleanup
   */
  registerResource(resource: { cleanup: () => void; id: string }): void {
    this.resourceRegistry.add(resource);

    this.logger.info('Resource registered', {
      resourceId: resource.id,
      totalResources: this.resourceRegistry.size,
    });

    // Check if we have too many resources
    if (this.resourceRegistry.size > this.cleanupConfig.maxResourceCount) {
      this.logger.warn('Resource count exceeds threshold', {
        current: this.resourceRegistry.size,
        threshold: this.cleanupConfig.maxResourceCount,
      });

      this.performResourceCleanup();
    }
  }

  /**
   * Unregister a resource
   */
  unregisterResource(resourceId: string): void {
    for (const resource of this.resourceRegistry) {
      if (resource.id === resourceId) {
        this.resourceRegistry.delete(resource);
        this.logger.info('Resource unregistered', { resourceId });
        return;
      }
    }
  }

  /**
   * Force garbage collection if available
   */
  forceGarbageCollection(): boolean {
    if (global.gc) {
      const beforeStats = this.getMemoryStats();

      global.gc();
      this.gcCount++;
      this.lastGC = Date.now();

      const afterStats = this.getMemoryStats();
      const freedMemory = beforeStats.heapUsed - afterStats.heapUsed;

      this.logger.info('Forced garbage collection', {
        freedMemory: `${(freedMemory / 1024 / 1024).toFixed(2)}MB`,
        heapBefore: `${(beforeStats.heapUsed / 1024 / 1024).toFixed(2)}MB`,
        heapAfter: `${(afterStats.heapUsed / 1024 / 1024).toFixed(2)}MB`,
        gcCount: this.gcCount,
      });

      return true;
    }

    this.logger.warn('Garbage collection not available');
    return false;
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    let totalSize = 0;
    let totalAccesses = 0;
    let oldestTimestamp = Date.now();
    let newestTimestamp = 0;

    for (const entry of this.stateCache.values()) {
      totalSize += entry.size;
      totalAccesses += entry.accessCount;
      oldestTimestamp = Math.min(oldestTimestamp, entry.timestamp);
      newestTimestamp = Math.max(newestTimestamp, entry.timestamp);
    }

    return {
      entries: this.stateCache.size,
      maxEntries: this.cacheConfig.maxEntries,
      totalSize: `${(totalSize / 1024 / 1024).toFixed(2)}MB`,
      totalAccesses,
      hitRate:
        totalAccesses > 0
          ? (totalAccesses / this.stateCache.size).toFixed(2)
          : '0',
      oldestEntry:
        oldestTimestamp < Date.now()
          ? new Date(oldestTimestamp).toISOString()
          : null,
      newestEntry:
        newestTimestamp > 0 ? new Date(newestTimestamp).toISOString() : null,
    };
  }

  /**
   * Get resource statistics
   */
  getResourceStats() {
    return {
      registeredResources: this.resourceRegistry.size,
      maxResources: this.cleanupConfig.maxResourceCount,
      gcCount: this.gcCount,
      lastGC: new Date(this.lastGC).toISOString(),
      memoryLeakWarnings: this.memoryLeakWarnings,
    };
  }

  /**
   * Perform manual cleanup
   */
  performCleanup(): void {
    this.logger.info('Performing manual cleanup');

    // Clean up cache
    this.cleanupExpiredCache();

    // Clean up resources
    this.performResourceCleanup();

    // Force GC if memory usage is high
    const stats = this.getMemoryStats();
    const heapUsedMB = stats.heapUsed / 1024 / 1024;

    if (heapUsedMB > this.thresholds.gcForceThreshold) {
      this.forceGarbageCollection();
    }
  }

  /**
   * Start memory monitoring
   */
  private startMemoryMonitoring(): void {
    this.memoryMonitorInterval = setInterval(() => {
      const stats = this.getMemoryStats();
      const heapUsedMB = stats.heapUsed / 1024 / 1024;
      const rssMB = stats.rss / 1024 / 1024;

      // Check thresholds
      if (heapUsedMB > this.thresholds.heapUsedCritical) {
        this.logger.error('Critical memory usage detected', {
          heapUsed: `${heapUsedMB.toFixed(2)}MB`,
          threshold: `${this.thresholds.heapUsedCritical}MB`,
        });

        this.handleMemoryPressure('critical');
      } else if (heapUsedMB > this.thresholds.heapUsedWarning) {
        this.logger.warn('High memory usage detected', {
          heapUsed: `${heapUsedMB.toFixed(2)}MB`,
          threshold: `${this.thresholds.heapUsedWarning}MB`,
        });

        this.handleMemoryPressure('warning');
      }

      if (rssMB > this.thresholds.rssCritical) {
        this.logger.error('Critical RSS memory usage detected', {
          rss: `${rssMB.toFixed(2)}MB`,
          threshold: `${this.thresholds.rssCritical}MB`,
        });
      }

      // Log regular stats
      this.logger.info('Memory stats', {
        heapUsed: `${heapUsedMB.toFixed(2)}MB`,
        heapTotal: `${(stats.heapTotal / 1024 / 1024).toFixed(2)}MB`,
        rss: `${rssMB.toFixed(2)}MB`,
        external: `${(stats.external / 1024 / 1024).toFixed(2)}MB`,
        cacheEntries: this.stateCache.size,
        registeredResources: this.resourceRegistry.size,
      });
    }, 30000); // Check every 30 seconds
  }

  /**
   * Start automatic cleanup
   */
  private startAutoCleanup(): void {
    const intervalMs = this.cleanupConfig.cleanupIntervalMinutes * 60 * 1000;

    this.cleanupInterval = setInterval(() => {
      this.logger.info('Running automatic cleanup');
      this.performCleanup();
    }, intervalMs);
  }

  /**
   * Handle memory pressure situations
   */
  private handleMemoryPressure(level: 'warning' | 'critical'): void {
    this.memoryLeakWarnings++;

    if (level === 'critical') {
      // Aggressive cleanup
      this.evictOldestEntries(Math.floor(this.stateCache.size * 0.5)); // Remove 50% of cache
      this.performResourceCleanup();
      this.forceGarbageCollection();
    } else {
      // Conservative cleanup
      this.evictOldestEntries(Math.floor(this.stateCache.size * 0.2)); // Remove 20% of cache
      this.cleanupExpiredCache();
    }
  }

  /**
   * Clean up expired cache entries
   */
  private cleanupExpiredCache(): void {
    const now = Date.now();
    const ttlMs = this.cacheConfig.ttlMinutes * 60 * 1000;
    let removedCount = 0;

    for (const [key, entry] of this.stateCache.entries()) {
      if (now - entry.timestamp > ttlMs) {
        this.stateCache.delete(key);
        removedCount++;
      }
    }

    if (removedCount > 0) {
      this.logger.info('Cleaned up expired cache entries', {
        removedCount,
        remainingEntries: this.stateCache.size,
      });
    }
  }

  /**
   * Evict oldest cache entries
   */
  private evictOldestEntries(count: number): void {
    const entries = Array.from(this.stateCache.entries())
      .sort(([, a], [, b]) => a.lastAccessed - b.lastAccessed)
      .slice(0, count);

    for (const [key] of entries) {
      this.stateCache.delete(key);
    }

    if (count > 0) {
      this.logger.info('Evicted oldest cache entries', {
        evictedCount: entries.length,
        remainingEntries: this.stateCache.size,
      });
    }
  }

  /**
   * Clean up registered resources
   */
  private performResourceCleanup(): void {
    const now = Date.now();
    const maxAgeMs = this.cleanupConfig.maxAgeMinutes * 60 * 1000;
    const resourcesToCleanup: Array<{ cleanup: () => void; id: string }> = [];

    // Find resources that are too old (would need timestamps on resources)
    // For now, just clean up excess resources
    if (this.resourceRegistry.size > this.cleanupConfig.maxResourceCount) {
      const excess =
        this.resourceRegistry.size - this.cleanupConfig.maxResourceCount;
      let count = 0;

      for (const resource of this.resourceRegistry) {
        if (count >= excess) break;
        resourcesToCleanup.push(resource);
        count++;
      }
    }

    // Execute cleanup
    for (const resource of resourcesToCleanup) {
      try {
        resource.cleanup();
        this.resourceRegistry.delete(resource);
      } catch (error) {
        this.logger.error('Resource cleanup failed', {
          resourceId: resource.id,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    if (resourcesToCleanup.length > 0) {
      this.logger.info('Cleaned up resources', {
        cleanedCount: resourcesToCleanup.length,
        remainingResources: this.resourceRegistry.size,
      });
    }
  }

  /**
   * Estimate object size in bytes (rough estimation)
   */
  private estimateObjectSize(obj: any): number {
    const jsonString = JSON.stringify(obj);
    return new Blob([jsonString]).size;
  }
}

/**
 * Default configurations for different environments
 */
export const defaultMemoryConfigs = {
  development: {
    thresholds: {
      heapUsedWarning: 512, // MB
      heapUsedCritical: 1024, // MB
      rssWarning: 1024, // MB
      rssCritical: 2048, // MB
      gcForceThreshold: 256, // MB
    },
    cache: {
      maxEntries: 1000,
      ttlMinutes: 30,
      cleanupIntervalMinutes: 10,
      enableCompression: false,
    },
    cleanup: {
      enableAutoCleanup: true,
      cleanupIntervalMinutes: 15,
      maxAgeMinutes: 60,
      maxResourceCount: 100,
    },
  },
  production: {
    thresholds: {
      heapUsedWarning: 256, // MB
      heapUsedCritical: 512, // MB
      rssWarning: 512, // MB
      rssCritical: 1024, // MB
      gcForceThreshold: 128, // MB
    },
    cache: {
      maxEntries: 500,
      ttlMinutes: 15,
      cleanupIntervalMinutes: 5,
      enableCompression: true,
    },
    cleanup: {
      enableAutoCleanup: true,
      cleanupIntervalMinutes: 10,
      maxAgeMinutes: 30,
      maxResourceCount: 50,
    },
  },
};

/**
 * Convenience function to create memory manager
 */
export function createMemoryManager(
  environment: 'development' | 'production',
  logger: RequestLogger,
): MemoryManager {
  const config = defaultMemoryConfigs[environment];

  return new MemoryManager(
    config.thresholds,
    config.cache,
    config.cleanup,
    logger,
  );
}
