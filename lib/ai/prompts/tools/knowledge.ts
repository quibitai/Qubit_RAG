// lib/ai/prompts/tools/knowledge.ts

/**
 * Instructions for using tools that interact with the internal knowledge base
 * (e.g., searchInternalKnowledgeBase, getFileContents, listDocuments).
 */
export const knowledgeToolInstructions = `
- When using internal knowledge tools, cite the document title or ID if known.
- Base answers strictly on the retrieved document content unless explicitly asked to supplement.
- If retrieved content is insufficient, state that clearly.`;
