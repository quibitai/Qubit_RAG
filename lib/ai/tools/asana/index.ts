/**
 * Asana Tool Integration
 * Modern implementation with LLM function calling and advanced AI capabilities
 */

// Modern implementation with all advanced features
export {
  createModernAsanaTool,
  type ModernAsanaTool,
  type ToolExecutionContext,
  type ToolResult,
} from './modern-asana-tool';

// LLM Function Calling Tools (replaces regex-based parsing)
export { createAsanaFunctionCallingTools } from './function-calling-tools';

// Legacy wrapper (deprecated - use function calling tools instead)
export { createModernAsanaToolWrapper } from './modern-asana-tool-wrapper';

// Shared types and utilities
export * from './types';
export * from './config';
