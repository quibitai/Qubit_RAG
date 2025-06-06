export const DEFAULT_CHAT_MODEL: string = 'chat-model';

interface ChatModel {
  id: string;
  name: string;
  description: string;
}

export const chatModels: Array<ChatModel> = [
  {
    id: 'chat-model',
    name: 'Chat Bit',
    description: 'Versatile AI assistant for chat and reasoning',
  },
  {
    id: 'document-editor',
    name: 'Document Bit',
    description: 'AI-assisted document writing and editing.',
  },
  // Note: The Quibit orchestrator (global-orchestrator) is intentionally not listed here
  // as it's not meant to be a user-selectable Bit on the dashboard
];

/**
 * Maps Bit IDs to specific model names
 * Used to ensure each Bit uses the appropriate model
 */
export const modelMapping: Record<string, string> = {
  'chat-model': 'gpt-4.1-mini', // Chat Bit uses gpt-4.1-mini
  'global-orchestrator': 'gpt-4.1', // Quibit Orchestrator uses gpt-4.1 (previously chat-model-reasoning)
  'text-model': 'gpt-4o', // Text operations Bit
  'summary-model': 'gpt-4o', // Summary Bit uses gpt-4o for summarization
  'echo-tango-specialist': 'gpt-4.1-mini', // Echo Tango specialist Bit
  'document-editor': 'gpt-4.1', // Document Bit uses gpt-4.1
  default: 'gpt-4.1', // All other Bits use gpt-4.1 by default
};
