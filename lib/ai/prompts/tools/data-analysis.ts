// lib/ai/prompts/tools/data-analysis.ts

/**
 * Instructions for using tools that query structured data (e.g., queryDocumentRows).
 */
export const dataAnalysisToolInstructions = `
- When using data query tools (like queryDocumentRows), analyze the returned raw data (e.g., calculate totals, averages, identify trends) to directly answer the user's question.
- Do not simply display the raw rows unless specifically asked.
- Show key calculations or summaries derived from the data.
- Clearly state if the data needed to answer the question is not present in the retrieved rows.`;
