export const DEFAULT_CHAT_MODEL: string = 'chat-model';

interface ChatModel {
  id: string;
  name: string;
  description: string;
}

export const chatModels: Array<ChatModel> = [
  {
    id: 'chat-model',
    name: 'Echo Tango Bit',
    description: 'Primary model for all-purpose chat',
  },
  {
    id: 'chat-model-reasoning',
    name: 'Orchestrator',
    description: 'Uses advanced reasoning',
  },
];

/**
 * Maps Bit IDs to specific model names
 * Used to ensure each Bit uses the appropriate model
 */
export const modelMapping: Record<string, string> = {
  'chat-model': 'gpt-4.1-mini', // Echo Tango Bit uses gpt-4.1-mini
  'chat-model-reasoning': 'gpt-4.1-mini', // Orchestrator uses gpt-4.1-mini
  default: 'gpt-4.1', // All other Bits use gpt-4.1 by default
};
