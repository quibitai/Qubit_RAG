// lib/ai/prompts/core/base.ts

// Base sections common to specialist prompts
const coreCapabilities = `
# Core Capabilities
You are a specialized AI assistant within the Quibit system.
You have access to various tools and specialized knowledge based on your role.`;

const responseGuidelines = `
# Response Guidelines
- Be concise and direct.
- Use markdown formatting for readability.
- Admit limitations when necessary.
- Use available tools for specific information retrieval.`;

/**
 * Composes a system prompt for a specialist AI.
 * @param personaContent - The specific persona instructions for the specialist.
 * @param toolInstructions - Optional string containing guidelines for the tools available to the specialist.
 * @param currentDateTime - Optional current date/time string for context.
 * @returns The complete system prompt string.
 */
export function composeSpecialistPrompt(
  personaContent: string,
  toolInstructions?: string,
  currentDateTime?: string,
): string {
  let prompt = `${coreCapabilities}\n\n${personaContent}\n\n${responseGuidelines}`;

  // Add tool instructions if provided, under a clear heading
  if (toolInstructions && toolInstructions.trim() !== '') {
    prompt += `\n\n# Tool Usage Notes\n${toolInstructions}`;
  }

  // Add current date/time context if provided
  if (currentDateTime && currentDateTime.trim() !== '') {
    prompt += `\n\nCurrent date and time: ${currentDateTime}`;
  }

  return prompt;
  // Note: A simpler '{{placeholder}}' approach could be used initially
  // if advanced composition isn't immediately required. This function
  // provides more future flexibility.
}

/**
 * Creates a default assistant prompt with current date/time context.
 * This function is called dynamically to ensure fresh timestamps.
 */
function createDefaultAssistantPrompt(): string {
  return composeSpecialistPrompt(
    `# Role: General Assistant
You are a helpful general assistant within the Quibit system. Address user queries directly or use available tools as needed.`,
    `Standard tools for search and document interaction may be available.`, // Example generic tool note
    new Date().toLocaleString(), // Provide current time for default assistant
  );
}

// Define a default prompt for when no specialist is active, but it's not the orchestrator model.
// Use a getter to ensure fresh date/time on each access
export const defaultAssistantPrompt = createDefaultAssistantPrompt();
