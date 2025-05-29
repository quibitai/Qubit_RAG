# Phase 1: Foundation & Immediate Fixes (Weeks 1-2)

## Overview
Phase 1 establishes the foundation for the hybrid refactoring approach by setting up the new project structure, fixing immediate streaming issues, and creating a robust testing infrastructure.

## Week 1: Project Structure & Immediate Fixes

### Day 1-2: Project Structure Setup

#### 1.1 Create New Directory Structure
```bash
# Create new modular directory structure
mkdir -p lib/ai/agents
mkdir -p lib/ai/memory
mkdir -p lib/ai/streaming
mkdir -p lib/ai/specialists
mkdir -p lib/brain
mkdir -p tests/unit/ai/agents
mkdir -p tests/unit/ai/memory
mkdir -p tests/unit/ai/streaming
mkdir -p tests/unit/brain
mkdir -p tests/integration
mkdir -p docs/architecture
mkdir -p docs/api
```

#### 1.2 Create Base Interfaces and Types
Create `lib/ai/types.ts`:
```typescript
// Core types for the modular AI system
export interface AgentConfig {
  model: string;
  temperature: number;
  maxTokens: number;
  specialist?: string;
}

export interface MemoryConfig {
  maxTokens: number;
  embeddingModel: string;
  similarityThreshold: number;
}

export interface StreamingConfig {
  enableArtifacts: boolean;
  enableTokenStreaming: boolean;
  bufferSize: number;
}

export interface BrainRequest {
  messages: any[];
  chatId: string;
  specialist?: string;
  context?: any;
  config?: Partial<AgentConfig>;
}

export interface BrainResponse {
  success: boolean;
  data?: any;
  error?: string;
  metadata?: any;
}
```

#### 1.3 Create Feature Flags System
Create `lib/config/feature-flags.ts`:
```typescript
// Feature flags for gradual rollout of new modules
export const FEATURE_FLAGS = {
  USE_NEW_AGENT_MANAGER: process.env.USE_NEW_AGENT_MANAGER === 'true',
  USE_NEW_MEMORY_MANAGER: process.env.USE_NEW_MEMORY_MANAGER === 'true',
  USE_NEW_STREAMING: process.env.USE_NEW_STREAMING === 'true',
  USE_NEW_BRAIN_ORCHESTRATOR: process.env.USE_NEW_BRAIN_ORCHESTRATOR === 'true',
  ENABLE_DEBUG_LOGGING: process.env.NODE_ENV !== 'production',
} as const;

export type FeatureFlag = keyof typeof FEATURE_FLAGS;

export function isFeatureEnabled(flag: FeatureFlag): boolean {
  return FEATURE_FLAGS[flag] ?? false;
}
```

### Day 3-4: Immediate Streaming Fixes

#### 1.4 Fix Document ID Consistency
Create `lib/streaming/DocumentIdManager.ts`:
```typescript
import { randomUUID } from 'node:crypto';

/**
 * Manages document ID consistency across tool calls and streaming
 */
export class DocumentIdManager {
  private static instance: DocumentIdManager;
  private documentIds = new Map<string, string>();

  static getInstance(): DocumentIdManager {
    if (!DocumentIdManager.instance) {
      DocumentIdManager.instance = new DocumentIdManager();
    }
    return DocumentIdManager.instance;
  }

  /**
   * Generate a new document ID and track it
   */
  generateDocumentId(context?: string): string {
    const id = randomUUID();
    if (context) {
      this.documentIds.set(context, id);
    }
    return id;
  }

  /**
   * Get existing document ID for context or generate new one
   */
  getOrCreateDocumentId(context: string): string {
    const existing = this.documentIds.get(context);
    if (existing) {
      return existing;
    }
    return this.generateDocumentId(context);
  }

  /**
   * Clear document ID for context
   */
  clearDocumentId(context: string): void {
    this.documentIds.delete(context);
  }

  /**
   * Clear all document IDs
   */
  clearAll(): void {
    this.documentIds.clear();
  }
}
```

#### 1.5 Simplify Streaming Protocol
Create `lib/streaming/StreamProtocol.ts`:
```typescript
import type { DataStreamWriter } from 'ai';

/**
 * Simplified streaming protocol that follows Vercel AI SDK standards
 */
export class StreamProtocol {
  constructor(private dataStream: DataStreamWriter) {}

  /**
   * Stream a text token
   */
  async streamToken(token: string): Promise<void> {
    try {
      await this.dataStream.write(`0:${JSON.stringify(token)}\n`);
    } catch (error) {
      console.error('[StreamProtocol] Failed to stream token:', error);
      throw error;
    }
  }

  /**
   * Stream artifact data
   */
  async streamArtifactData(data: any): Promise<void> {
    try {
      await this.dataStream.write(`2:${JSON.stringify([data])}\n`);
    } catch (error) {
      console.error('[StreamProtocol] Failed to stream artifact data:', error);
      throw error;
    }
  }

  /**
   * Stream error
   */
  async streamError(error: string): Promise<void> {
    try {
      await this.dataStream.write(`3:${JSON.stringify({ error })}\n`);
    } catch (error) {
      console.error('[StreamProtocol] Failed to stream error:', error);
      throw error;
    }
  }

  /**
   * Close the stream
   */
  async close(): Promise<void> {
    try {
      // Let the framework handle closing
    } catch (error) {
      console.error('[StreamProtocol] Failed to close stream:', error);
    }
  }
}
```

#### 1.6 Enhanced Logging System
Create `lib/logging/Logger.ts`:
```typescript
/**
 * Enhanced logging system with structured logging and context
 */
export enum LogLevel {
  ERROR = 0,
  WARN = 1,
  INFO = 2,
  DEBUG = 3,
}

export interface LogContext {
  module: string;
  operation?: string;
  chatId?: string;
  userId?: string;
  requestId?: string;
  [key: string]: any;
}

export class Logger {
  private static instance: Logger;
  private logLevel: LogLevel;

  constructor() {
    this.logLevel = this.getLogLevelFromEnv();
  }

  static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  private getLogLevelFromEnv(): LogLevel {
    const envLevel = process.env.LOG_LEVEL;
    if (envLevel && envLevel in LogLevel) {
      return LogLevel[envLevel as keyof typeof LogLevel];
    }
    return process.env.NODE_ENV === 'production' ? LogLevel.ERROR : LogLevel.INFO;
  }

  private shouldLog(level: LogLevel): boolean {
    return level <= this.logLevel;
  }

  private formatMessage(level: string, message: string, context?: LogContext): string {
    const timestamp = new Date().toISOString();
    const contextStr = context ? ` [${JSON.stringify(context)}]` : '';
    return `[${timestamp}] ${level}${contextStr}: ${message}`;
  }

  error(message: string, context?: LogContext, ...args: any[]): void {
    if (this.shouldLog(LogLevel.ERROR)) {
      console.error(this.formatMessage('ERROR', message, context), ...args);
    }
  }

  warn(message: string, context?: LogContext, ...args: any[]): void {
    if (this.shouldLog(LogLevel.WARN)) {
      console.warn(this.formatMessage('WARN', message, context), ...args);
    }
  }

  info(message: string, context?: LogContext, ...args: any[]): void {
    if (this.shouldLog(LogLevel.INFO)) {
      console.log(this.formatMessage('INFO', message, context), ...args);
    }
  }

  debug(message: string, context?: LogContext, ...args: any[]): void {
    if (this.shouldLog(LogLevel.DEBUG)) {
      console.log(this.formatMessage('DEBUG', message, context), ...args);
    }
  }

  // Convenience methods with predefined contexts
  agent(message: string, operation?: string, ...args: any[]): void {
    this.debug(message, { module: 'agent', operation }, ...args);
  }

  memory(message: string, operation?: string, ...args: any[]): void {
    this.debug(message, { module: 'memory', operation }, ...args);
  }

  streaming(message: string, operation?: string, ...args: any[]): void {
    this.debug(message, { module: 'streaming', operation }, ...args);
  }

  brain(message: string, operation?: string, ...args: any[]): void {
    this.info(message, { module: 'brain', operation }, ...args);
  }
}

// Export singleton instance
export const logger = Logger.getInstance();
```

### Day 5: Testing Infrastructure Setup

#### 1.7 Create Test Configuration
Create `tests/setup.ts`:
```typescript
import { beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { Logger } from '../lib/logging/Logger';

// Set test environment
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'ERROR'; // Reduce noise in tests

// Global test setup
beforeAll(async () => {
  // Initialize test database if needed
  // Set up test fixtures
});

afterAll(async () => {
  // Clean up test resources
});

beforeEach(() => {
  // Reset state before each test
  Logger.getInstance().debug('Test starting');
});

afterEach(() => {
  // Clean up after each test
  Logger.getInstance().debug('Test completed');
});
```

#### 1.8 Create Base Test Utilities
Create `tests/utils/test-helpers.ts`:
```typescript
import { vi } from 'vitest';
import type { DataStreamWriter } from 'ai';

/**
 * Mock DataStreamWriter for testing
 */
export function createMockDataStreamWriter(): DataStreamWriter {
  return {
    write: vi.fn().mockResolvedValue(undefined),
    writeData: vi.fn().mockResolvedValue(undefined),
  } as any;
}

/**
 * Create mock chat messages
 */
export function createMockMessages(count: number = 3) {
  return Array.from({ length: count }, (_, i) => ({
    id: `msg-${i}`,
    role: i % 2 === 0 ? 'user' : 'assistant',
    content: `Message ${i}`,
    createdAt: new Date(),
  }));
}

/**
 * Create mock brain request
 */
export function createMockBrainRequest(overrides = {}) {
  return {
    messages: createMockMessages(),
    chatId: 'test-chat-id',
    specialist: 'echo-tango',
    context: {},
    ...overrides,
  };
}

/**
 * Wait for async operations to complete
 */
export function waitForAsync(ms: number = 0): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
```

## Week 2: Integration and Validation

### Day 6-7: Create First Module Implementations

#### 1.9 Basic Agent Manager
Create `lib/ai/agents/AgentManager.ts`:
```typescript
import { logger } from '../../logging/Logger';
import { isFeatureEnabled } from '../../config/feature-flags';
import type { AgentConfig, BrainRequest } from '../types';

/**
 * Manages agent lifecycle and execution
 * This is a simplified version that will be expanded in Phase 2
 */
export class AgentManager {
  private static instance: AgentManager;

  static getInstance(): AgentManager {
    if (!AgentManager.instance) {
      AgentManager.instance = new AgentManager();
    }
    return AgentManager.instance;
  }

  /**
   * Execute agent request (placeholder for Phase 2 implementation)
   */
  async execute(request: BrainRequest): Promise<any> {
    logger.agent('Agent execution starting', 'execute');
    
    if (!isFeatureEnabled('USE_NEW_AGENT_MANAGER')) {
      throw new Error('New agent manager not enabled');
    }

    // Placeholder implementation
    logger.agent('Agent execution completed', 'execute');
    return { success: true, message: 'Agent manager placeholder' };
  }

  /**
   * Validate agent configuration
   */
  validateConfig(config: AgentConfig): boolean {
    logger.agent('Validating agent config', 'validateConfig');
    
    if (!config.model || !config.temperature || !config.maxTokens) {
      return false;
    }
    
    return true;
  }
}
```

#### 1.10 Basic Stream Manager
Create `lib/ai/streaming/StreamManager.ts`:
```typescript
import type { DataStreamWriter } from 'ai';
import { StreamProtocol } from './StreamProtocol';
import { DocumentIdManager } from './DocumentIdManager';
import { logger } from '../../logging/Logger';
import { isFeatureEnabled } from '../../config/feature-flags';

/**
 * Manages streaming operations
 * This is a simplified version that will be expanded in Phase 2
 */
export class StreamManager {
  private protocol: StreamProtocol;
  private documentIdManager: DocumentIdManager;

  constructor(dataStream: DataStreamWriter) {
    this.protocol = new StreamProtocol(dataStream);
    this.documentIdManager = DocumentIdManager.getInstance();
  }

  /**
   * Start streaming session
   */
  async startStreaming(context: string): Promise<string> {
    logger.streaming('Starting streaming session', 'startStreaming');
    
    if (!isFeatureEnabled('USE_NEW_STREAMING')) {
      throw new Error('New streaming not enabled');
    }

    const documentId = this.documentIdManager.generateDocumentId(context);
    
    await this.protocol.streamArtifactData({
      type: 'streaming-start',
      documentId,
      timestamp: new Date().toISOString(),
    });

    return documentId;
  }

  /**
   * Stream content
   */
  async streamContent(content: string): Promise<void> {
    logger.streaming('Streaming content', 'streamContent');
    await this.protocol.streamToken(content);
  }

  /**
   * End streaming session
   */
  async endStreaming(documentId: string): Promise<void> {
    logger.streaming('Ending streaming session', 'endStreaming');
    
    await this.protocol.streamArtifactData({
      type: 'streaming-end',
      documentId,
      timestamp: new Date().toISOString(),
    });

    this.documentIdManager.clearDocumentId(documentId);
  }
}
```

### Day 8-9: Integration with Existing System

#### 1.11 Create Brain Route Adapter
Create `lib/brain/BrainAdapter.ts`:
```typescript
import type { NextRequest } from 'next/server';
import type { DataStreamWriter } from 'ai';
import { AgentManager } from '../ai/agents/AgentManager';
import { StreamManager } from '../ai/streaming/StreamManager';
import { logger } from '../logging/Logger';
import { isFeatureEnabled } from '../config/feature-flags';
import type { BrainRequest, BrainResponse } from '../ai/types';

/**
 * Adapter that bridges new modular system with existing brain route
 * Allows gradual migration without breaking existing functionality
 */
export class BrainAdapter {
  private agentManager: AgentManager;

  constructor() {
    this.agentManager = AgentManager.getInstance();
  }

  /**
   * Process brain request using new or legacy system based on feature flags
   */
  async processRequest(
    request: BrainRequest,
    dataStream: DataStreamWriter
  ): Promise<BrainResponse> {
    logger.brain('Processing brain request', 'processRequest');

    try {
      // Use new system if enabled, otherwise fall back to legacy
      if (this.shouldUseNewSystem()) {
        return await this.processWithNewSystem(request, dataStream);
      } else {
        return await this.processWithLegacySystem(request, dataStream);
      }
    } catch (error) {
      logger.error('Brain request processing failed', { 
        module: 'brain', 
        operation: 'processRequest' 
      }, error);
      
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  private shouldUseNewSystem(): boolean {
    return (
      isFeatureEnabled('USE_NEW_AGENT_MANAGER') &&
      isFeatureEnabled('USE_NEW_STREAMING')
    );
  }

  private async processWithNewSystem(
    request: BrainRequest,
    dataStream: DataStreamWriter
  ): Promise<BrainResponse> {
    logger.brain('Using new modular system', 'processWithNewSystem');

    const streamManager = new StreamManager(dataStream);
    const documentId = await streamManager.startStreaming(request.chatId);

    // Placeholder for actual agent execution
    await streamManager.streamContent('Hello from new system!');
    await streamManager.endStreaming(documentId);

    return {
      success: true,
      data: { documentId },
      metadata: { system: 'new' },
    };
  }

  private async processWithLegacySystem(
    request: BrainRequest,
    dataStream: DataStreamWriter
  ): Promise<BrainResponse> {
    logger.brain('Using legacy system', 'processWithLegacySystem');

    // This will delegate to the existing brain route logic
    throw new Error('Legacy system delegation not implemented yet');
  }
}
```

#### 1.12 Update Brain Route to Use Adapter
Create `lib/brain/route-integration.ts`:
```typescript
import type { NextRequest } from 'next/server';
import { createDataStreamResponse } from 'ai';
import { BrainAdapter } from './BrainAdapter';
import { logger } from '../logging/Logger';
import type { BrainRequest } from '../ai/types';

/**
 * Integration point for the brain route
 * This function can be called from the existing route to gradually adopt new system
 */
export async function processBrainRequestWithAdapter(
  req: NextRequest,
  requestBody: any
) {
  logger.brain('Processing request with adapter', 'processBrainRequestWithAdapter');

  const brainRequest: BrainRequest = {
    messages: requestBody.messages || [],
    chatId: requestBody.id || 'unknown',
    specialist: requestBody.activeBitContextId || requestBody.currentActiveSpecialistId,
    context: {
      fileContext: requestBody.fileContext,
      artifactContext: requestBody.artifactContext,
      userTimezone: requestBody.userTimezone,
    },
  };

  const adapter = new BrainAdapter();

  return createDataStreamResponse({
    async execute(dataStream) {
      const response = await adapter.processRequest(brainRequest, dataStream);
      
      if (!response.success) {
        logger.error('Brain adapter processing failed', {
          module: 'brain',
          operation: 'processBrainRequestWithAdapter'
        }, response.error);
        
        // Stream error to client
        await dataStream.write(`3:${JSON.stringify({ error: response.error })}\n`);
      }
    },
  });
}
```

### Day 10: Testing and Validation

#### 1.13 Create Unit Tests
Create `tests/unit/ai/agents/AgentManager.test.ts`:
```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { AgentManager } from '../../../../lib/ai/agents/AgentManager';
import { createMockBrainRequest } from '../../../utils/test-helpers';

describe('AgentManager', () => {
  let agentManager: AgentManager;

  beforeEach(() => {
    agentManager = AgentManager.getInstance();
  });

  describe('validateConfig', () => {
    it('should validate valid config', () => {
      const config = {
        model: 'gpt-4',
        temperature: 0.7,
        maxTokens: 1000,
      };

      expect(agentManager.validateConfig(config)).toBe(true);
    });

    it('should reject invalid config', () => {
      const config = {
        model: '',
        temperature: 0.7,
        maxTokens: 1000,
      };

      expect(agentManager.validateConfig(config)).toBe(false);
    });
  });

  describe('execute', () => {
    it('should throw when feature flag is disabled', async () => {
      const request = createMockBrainRequest();
      
      await expect(agentManager.execute(request)).rejects.toThrow(
        'New agent manager not enabled'
      );
    });
  });
});
```

#### 1.14 Create Integration Tests
Create `tests/integration/brain-adapter.test.ts`:
```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { BrainAdapter } from '../../lib/brain/BrainAdapter';
import { createMockBrainRequest, createMockDataStreamWriter } from '../utils/test-helpers';

describe('BrainAdapter Integration', () => {
  let adapter: BrainAdapter;

  beforeEach(() => {
    adapter = new BrainAdapter();
  });

  it('should process request with legacy system by default', async () => {
    const request = createMockBrainRequest();
    const dataStream = createMockDataStreamWriter();

    const response = await adapter.processRequest(request, dataStream);

    expect(response.success).toBe(false);
    expect(response.error).toContain('Legacy system delegation not implemented');
  });
});
```

## Phase 1 Deliverables

### ✅ Completed Items
1. **Project Structure**: New modular directory structure
2. **Feature Flags**: Gradual rollout system
3. **Logging System**: Enhanced structured logging
4. **Streaming Fixes**: Document ID consistency and simplified protocol
5. **Base Modules**: Placeholder implementations for core modules
6. **Integration Layer**: Adapter pattern for gradual migration
7. **Testing Infrastructure**: Unit and integration test setup

### 📋 Validation Checklist
- [ ] All new modules compile without errors
- [ ] Feature flags work correctly
- [ ] Logging system produces structured output
- [ ] Document ID consistency is maintained
- [ ] Tests pass and provide good coverage
- [ ] Integration with existing system doesn't break functionality
- [ ] Performance baseline is established

### 🚀 Next Steps
Phase 1 establishes the foundation for the modular refactoring. In Phase 2, we'll extract the core logic from the monolithic brain route into the new modules while maintaining full backward compatibility.

## Risk Mitigation

### Rollback Plan
- Feature flags allow instant rollback to legacy system
- New modules are isolated and don't affect existing functionality
- All changes are additive, not destructive

### Quality Gates
- All tests must pass before proceeding to Phase 2
- Performance must not regress
- Existing functionality must remain intact
- Code review required for all changes 