#!/bin/bash

# Phase 1 Setup Script
# This script creates the directory structure and initial files for the hybrid refactoring approach

set -e

echo "🚀 Starting Phase 1 Setup: Foundation & Immediate Fixes"
echo "=================================================="

# Create new modular directory structure
echo "📁 Creating directory structure..."

# AI modules
mkdir -p lib/ai/agents
mkdir -p lib/ai/memory
mkdir -p lib/ai/streaming
mkdir -p lib/ai/specialists
mkdir -p lib/brain
mkdir -p lib/config
mkdir -p lib/logging

# Test directories
mkdir -p tests/unit/ai/agents
mkdir -p tests/unit/ai/memory
mkdir -p tests/unit/ai/streaming
mkdir -p tests/unit/brain
mkdir -p tests/integration
mkdir -p tests/utils

# Documentation
mkdir -p docs/architecture
mkdir -p docs/api

echo "✅ Directory structure created"

# Create base configuration files
echo "⚙️ Creating configuration files..."

# Feature flags
cat > lib/config/feature-flags.ts << 'EOF'
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
EOF

# Base types
cat > lib/ai/types.ts << 'EOF'
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
EOF

echo "✅ Configuration files created"

# Create logging system
echo "📝 Creating logging system..."

cat > lib/logging/Logger.ts << 'EOF'
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
EOF

echo "✅ Logging system created"

# Create streaming fixes
echo "🌊 Creating streaming fixes..."

cat > lib/ai/streaming/DocumentIdManager.ts << 'EOF'
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
EOF

cat > lib/ai/streaming/StreamProtocol.ts << 'EOF'
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
EOF

echo "✅ Streaming fixes created"

# Create test utilities
echo "🧪 Creating test infrastructure..."

cat > tests/utils/test-helpers.ts << 'EOF'
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
EOF

cat > tests/setup.ts << 'EOF'
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
EOF

echo "✅ Test infrastructure created"

# Create placeholder modules
echo "🏗️ Creating placeholder modules..."

cat > lib/ai/agents/AgentManager.ts << 'EOF'
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
EOF

cat > lib/ai/streaming/StreamManager.ts << 'EOF'
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
EOF

echo "✅ Placeholder modules created"

# Create environment template
echo "🔧 Creating environment template..."

cat > .env.phase1.example << 'EOF'
# Phase 1 Feature Flags
# Copy to .env.local and set to 'true' to enable new modules

# Agent Management
USE_NEW_AGENT_MANAGER=false

# Memory Management  
USE_NEW_MEMORY_MANAGER=false

# Streaming System
USE_NEW_STREAMING=false

# Brain Orchestrator
USE_NEW_BRAIN_ORCHESTRATOR=false

# Logging Level (ERROR=0, WARN=1, INFO=2, DEBUG=3)
LOG_LEVEL=2
EOF

echo "✅ Environment template created"

# Create documentation
echo "📚 Creating documentation..."

cat > docs/architecture/PHASE_1_ARCHITECTURE.md << 'EOF'
# Phase 1 Architecture

## Overview
Phase 1 establishes the foundation for modular refactoring while maintaining full backward compatibility with the existing system.

## New Module Structure

```
lib/
├── ai/
│   ├── agents/           # Agent execution logic
│   ├── memory/           # Conversational memory
│   ├── streaming/        # Streaming handlers
│   ├── specialists/      # Specialist management
│   └── types.ts          # Core type definitions
├── brain/                # Brain route modules
├── config/               # Configuration and feature flags
└── logging/              # Enhanced logging system
```

## Key Components

### Feature Flags System
- Gradual rollout of new modules
- Safe fallback to legacy system
- Environment-based configuration

### Enhanced Logging
- Structured logging with context
- Module-specific log levels
- Performance and debugging insights

### Streaming Fixes
- Document ID consistency management
- Simplified streaming protocol
- Better error handling

## Integration Strategy
- Adapter pattern for gradual migration
- Feature flags for safe rollout
- Comprehensive testing at each step
EOF

echo "✅ Documentation created"

echo ""
echo "🎉 Phase 1 Setup Complete!"
echo "=========================="
echo ""
echo "Next Steps:"
echo "1. Copy .env.phase1.example to .env.local"
echo "2. Run tests: npm test"
echo "3. Review created files and customize as needed"
echo "4. Begin Phase 2 implementation"
echo ""
echo "Files created:"
echo "- lib/config/feature-flags.ts"
echo "- lib/ai/types.ts"
echo "- lib/logging/Logger.ts"
echo "- lib/ai/streaming/DocumentIdManager.ts"
echo "- lib/ai/streaming/StreamProtocol.ts"
echo "- lib/ai/streaming/StreamManager.ts"
echo "- lib/ai/agents/AgentManager.ts"
echo "- tests/utils/test-helpers.ts"
echo "- tests/setup.ts"
echo "- .env.phase1.example"
echo "- docs/architecture/PHASE_1_ARCHITECTURE.md"
echo ""
echo "🚀 Ready to proceed with Phase 1 implementation!" 