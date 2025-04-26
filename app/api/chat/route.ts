/**
 * DEPRECATED: This route is deprecated in favor of using the Brain API.
 * This file is maintained temporarily for backwards compatibility.
 *
 * Re-exports the chat functionality from the core implementation.
 */

// Import implementation from the shared location
import { POST, DELETE } from '@/lib/api/chat';

// Re-export the functionality
export { POST, DELETE };

// Runtime configuration for the route
export const config = {
  runtime: 'edge',
  unstable_allowDynamic: ['**/node_modules/**'],
};

// Set maximum duration for edge function
export const maxDuration = 60; // 60 seconds timeout
