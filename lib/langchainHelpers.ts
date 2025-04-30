import {
  HumanMessage,
  AIMessage,
  SystemMessage,
} from '@langchain/core/messages';
import type { BaseMessage } from '@langchain/core/messages';

// Extend this type if you persist more fields (e.g. name, role, etc.)
export type RawMessage = {
  type: 'human' | 'ai' | 'system';
  content: string;
  // Add more fields as needed
};

/**
 * Converts a RawMessage to a LangChain message instance (HumanMessage or AIMessage).
 * This function MUST return a real class instance, not a plain object or serialized form.
 * Only the minimal fields required by the constructor are used.
 *
 * @param msg - The raw message object with type and content.
 * @returns HumanMessage or AIMessage instance, or null if type is unsupported.
 */
export function rawToMessage(msg: RawMessage): HumanMessage | AIMessage | null {
  if (!msg || typeof msg !== 'object') return null;
  if (msg.type === 'human') {
    return new HumanMessage({ content: msg.content });
  }
  if (msg.type === 'ai') {
    return new AIMessage({ content: msg.content });
  }
  // Optionally handle 'system', 'tool', etc. as needed in the future
  return null;
}
