/**
 * Caching layer for Asana API operations
 * Reduces API calls by caching expensive lookups and user data
 */

export interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number; // Time to live in milliseconds
}

export interface CacheOptions {
  ttl: number; // Default TTL in milliseconds
  maxSize?: number; // Maximum number of entries
  cleanupInterval?: number; // Cleanup interval in milliseconds
}

/**
 * Simple in-memory cache with TTL support
 */
export class AsanaCache {
  private cache = new Map<string, CacheEntry<any>>();
  private cleanupTimer?: NodeJS.Timeout;
  private readonly defaultTtl: number;
  private readonly maxSize: number;

  constructor(options: CacheOptions = { ttl: 5 * 60 * 1000 }) {
    // Default 5 minutes
    this.defaultTtl = options.ttl;
    this.maxSize = options.maxSize || 1000;

    // Set up periodic cleanup
    const cleanupInterval = options.cleanupInterval || 60 * 1000; // 1 minute
    this.cleanupTimer = setInterval(() => this.cleanup(), cleanupInterval);
  }

  /**
   * Get an item from the cache
   */
  get<T>(key: string): T | null {
    const entry = this.cache.get(key);

    if (!entry) {
      return null;
    }

    // Check if entry has expired
    if (Date.now() - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      return null;
    }

    return entry.data as T;
  }

  /**
   * Set an item in the cache
   */
  set<T>(key: string, data: T, ttl?: number): void {
    // Enforce size limit
    if (this.cache.size >= this.maxSize) {
      // Remove oldest entries
      const entriesToRemove = Math.floor(this.maxSize * 0.1); // Remove 10%
      const sortedEntries = Array.from(this.cache.entries()).sort(
        ([, a], [, b]) => a.timestamp - b.timestamp,
      );

      for (let i = 0; i < entriesToRemove; i++) {
        this.cache.delete(sortedEntries[i][0]);
      }
    }

    const entry: CacheEntry<T> = {
      data,
      timestamp: Date.now(),
      ttl: ttl || this.defaultTtl,
    };

    this.cache.set(key, entry);
  }

  /**
   * Delete an item from the cache
   */
  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get cache statistics
   */
  getStats() {
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      hitRate: 0, // Could be implemented with counters if needed
    };
  }

  /**
   * Clean up expired entries
   */
  private cleanup(): void {
    const now = Date.now();
    const expiredKeys: string[] = [];

    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > entry.ttl) {
        expiredKeys.push(key);
      }
    }

    for (const key of expiredKeys) {
      this.cache.delete(key);
    }

    if (expiredKeys.length > 0) {
      console.log(
        `[AsanaCache] Cleaned up ${expiredKeys.length} expired entries`,
      );
    }
  }

  /**
   * Dispose of the cache and cleanup timers
   */
  dispose(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }
    this.clear();
  }
}

/**
 * Cache key generators for common operations
 */
export const CacheKeys = {
  userMe: () => 'user:me',

  projectByName: (projectName: string, workspaceGid: string) =>
    `project:name:${workspaceGid}:${projectName.toLowerCase()}`,

  taskByName: (taskName: string, workspaceGid: string, projectGid?: string) =>
    `task:name:${workspaceGid}:${projectGid || 'any'}:${taskName.toLowerCase()}`,

  sectionByName: (sectionName: string, projectGid: string) =>
    `section:name:${projectGid}:${sectionName.toLowerCase()}`,

  userByEmail: (email: string, workspaceGid: string) =>
    `user:email:${workspaceGid}:${email.toLowerCase()}`,

  userByName: (name: string, workspaceGid: string) =>
    `user:name:${workspaceGid}:${name.toLowerCase()}`,

  projectsList: (workspaceGid: string, archived: boolean) =>
    `projects:list:${workspaceGid}:${archived}`,

  projectSections: (projectGid: string) => `sections:list:${projectGid}`,

  taskDetails: (taskGid: string, fields?: string[]) =>
    `task:details:${taskGid}:${fields?.join(',') || 'default'}`,
};

/**
 * Singleton cache instance
 */
export const asanaCache = new AsanaCache({
  ttl: 5 * 60 * 1000, // 5 minutes default
  maxSize: 2000,
  cleanupInterval: 2 * 60 * 1000, // 2 minutes cleanup
});

/**
 * Helper function to get or set cached data
 */
export async function getOrSetCache<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttl?: number,
): Promise<T> {
  // Try to get from cache first
  const cached = asanaCache.get<T>(key);
  if (cached !== null) {
    return cached;
  }

  // Not in cache, fetch the data
  const data = await fetcher();

  // Cache the result
  asanaCache.set(key, data, ttl);

  return data;
}

/**
 * Helper function to invalidate related cache entries
 */
export function invalidateCache(patterns: string[]): void {
  for (const pattern of patterns) {
    // Simple pattern matching - could be enhanced with regex
    const keysToDelete: string[] = [];

    // Access the cache entries through the public interface
    const cacheEntries = asanaCache.getStats();

    // Since we can't iterate over private cache, we'll use a different approach
    // This is a limitation - in a real implementation, we'd expose an iterator
    // or make this method part of the AsanaCache class

    console.log(
      `[AsanaCache] Cache invalidation requested for pattern: ${pattern}`,
    );
    console.log(`[AsanaCache] Current cache size: ${cacheEntries.size}`);

    // For now, we'll clear the entire cache for any invalidation
    // This could be optimized by making the cache map public or adding iterator methods
    asanaCache.clear();
  }
}
