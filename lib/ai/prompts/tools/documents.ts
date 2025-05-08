// lib/ai/prompts/tools/documents.ts

/**
 * Instructions for using tools that create or modify documents (e.g., createDocument, updateDocument).
 */
export const documentToolInstructions = `
- When using document creation or update tools, simply confirm the action requested has been initiated.
- The document artifact itself will update visually for the user via the streaming mechanism; do not include generated document content directly in your chat response after using these tools.
- Example confirmation: "Okay, I've started creating the document..." or "I've applied the requested changes to the document."`;
