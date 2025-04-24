/**
 * Tool Registry Index
 *
 * This file exports all available Langchain tools for use in the Brain orchestrator.
 * Tools are organized by function and dynamically selected based on bitId/context.
 */

import type { StructuredTool } from '@langchain/core/tools';
import { listDocumentsTool } from './listDocumentsTool';
import { getFileContentsTool } from './getFileContentsTool';

// Export individual tools
export { listDocumentsTool } from './listDocumentsTool';
export { getFileContentsTool } from './getFileContentsTool';

/**
 * Get the appropriate tools for a specific Bit
 *
 * @param bitId - The ID of the Bit requesting tools
 * @returns An array of Langchain tools that the Bit should have access to
 */
export function getToolsForBit(bitId: string): StructuredTool[] {
  // Default set of tools available to all bits
  const defaultTools: StructuredTool[] = [
    listDocumentsTool,
    getFileContentsTool,
  ];

  // Eventually we can add bit-specific tool selection logic here
  // For example:
  // if (bitId === 'calendar-assistant') {
  //   return [...defaultTools, googleCalendarTools];
  // }

  return defaultTools;
}
