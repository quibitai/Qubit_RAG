/**
 * Asana Tool Integration
 * Exports both legacy and modern implementations
 */

// Legacy implementation (regex-based)
export { AsanaTool } from './asanaTool';

// Modern implementation (LLM function calling)
export { ModernAsanaTool, createModernAsanaTool } from './modernAsanaTool';

// Shared types and utilities
export * from './types';
export * from './config';
