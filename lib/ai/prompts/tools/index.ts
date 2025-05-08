// lib/ai/prompts/tools/index.ts
import { knowledgeToolInstructions } from './knowledge';
import { webSearchToolInstructions } from './web-search';
import { dataAnalysisToolInstructions } from './data-analysis';
import { documentToolInstructions } from './documents';

// Map tool names to their instruction sets
const toolInstructionMap: Record<string, string> = {
  // Knowledge tools
  searchInternalKnowledgeBase: knowledgeToolInstructions,
  getFileContents: knowledgeToolInstructions,
  listDocuments: knowledgeToolInstructions,

  // Web search tools
  tavilySearch: webSearchToolInstructions,

  // Data analysis tools
  queryDocumentRows: dataAnalysisToolInstructions,

  // Document tools
  createDocument: documentToolInstructions,
  updateDocument: documentToolInstructions,

  // Add other tools as needed
};

/**
 * Gathers unique instruction snippets for a list of tool IDs.
 * @param toolIds - Array of tool names (e.g., from SpecialistConfig.defaultTools)
 * @returns A single string containing relevant, unique instructions.
 */
export function getToolPromptInstructions(toolIds: string[] = []): string {
  if (toolIds.length === 0) {
    return '';
  }

  // Collect unique instruction texts
  const relevantInstructions = new Set<string>();

  for (const toolId of toolIds) {
    const instruction = toolInstructionMap[toolId];
    if (instruction) {
      relevantInstructions.add(instruction.trim());
    }
  }

  return Array.from(relevantInstructions).join('\n\n');
}
