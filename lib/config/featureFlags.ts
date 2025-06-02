/**
 * Feature Flags Configuration
 *
 * Controls which implementation of the brain API to use during the migration
 */

export interface FeatureFlags {
  useModernBrainAPI: boolean;
  enableDetailedLogging: boolean;
  enablePerformanceMetrics: boolean;
  enableA11yTesting: boolean;
}

/**
 * Get feature flags from environment variables with sensible defaults
 */
export function getFeatureFlags(): FeatureFlags {
  return {
    // Use modern brain API implementation
    useModernBrainAPI: process.env.USE_MODERN_BRAIN_API === 'true',

    // Enable detailed request/response logging
    enableDetailedLogging:
      process.env.ENABLE_DETAILED_LOGGING === 'true' ||
      process.env.NODE_ENV === 'development',

    // Enable performance metrics collection
    enablePerformanceMetrics:
      process.env.ENABLE_PERFORMANCE_METRICS === 'true' ||
      process.env.NODE_ENV === 'development',

    // Enable A/B testing capabilities
    enableA11yTesting: process.env.ENABLE_AB_TESTING === 'true',
  };
}

/**
 * Check if a specific feature flag is enabled
 */
export function isFeatureEnabled(flag: keyof FeatureFlags): boolean {
  const flags = getFeatureFlags();
  return flags[flag];
}

/**
 * Feature flag for gradual rollout based on user ID or chat ID
 */
export function shouldUseModernAPI(userId?: string, chatId?: string): boolean {
  // If explicitly enabled via environment variable, use it
  if (isFeatureEnabled('useModernBrainAPI')) {
    return true;
  }

  // 🚀 FULL ROLLOUT ACTIVE - 100% of traffic uses modern API
  // This can be reverted to gradual rollout if needed
  return true;

  // Previous gradual rollout logic (preserved for potential rollback)
  /*
  // Gradual rollout based on hash of user/chat ID (10% rollout)
  if (userId || chatId) {
    const identifier = userId || chatId;
    const hash = hashString(identifier || '');
    return hash % 100 < 10; // 10% rollout
  }

  return false;
  */
}

/**
 * Simple hash function for consistent user bucketing
 */
function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash);
}

/**
 * Log feature flag decisions for debugging
 */
export function logFeatureFlagDecision(
  decision: boolean,
  reason: string,
  context?: Record<string, any>,
): void {
  if (isFeatureEnabled('enableDetailedLogging')) {
    console.log('[FeatureFlags]', {
      useModernAPI: decision,
      reason,
      context,
      timestamp: new Date().toISOString(),
    });
  }
}
