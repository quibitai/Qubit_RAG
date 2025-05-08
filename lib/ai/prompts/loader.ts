import { defaultAssistantPrompt, composeSpecialistPrompt } from './core/base';
import { getOrchestratorPrompt } from './core/orchestrator';
import { getSpecialistPromptById, specialistRegistry } from './specialists';
import { getToolPromptInstructions } from './tools';

// Define an interface for ClientConfig if not already available globally
// Placeholder - replace with actual import or definition
interface ClientConfig {
  id: string;
  name: string;
  customInstructions?: string | null;
  configJson?: {
    specialistPrompts?: Record<string, string>;
    // other config...
  } | null;
}

interface LoadPromptParams {
  modelId: string; // e.g., 'global-orchestrator', 'gpt-4.1-mini'
  contextId: string | null; // Represents activeBitContextId or activeBitPersona
  clientConfig?: ClientConfig | null; // Client-specific overrides
}

/**
 * Loads the appropriate system prompt based on the provided context.
 * @param params - Object containing modelId, contextId, and clientConfig.
 * @returns The system prompt string.
 */
export function loadPrompt({
  modelId,
  contextId,
  clientConfig,
}: LoadPromptParams): string {
  // 1. Always return Orchestrator prompt if that model is explicitly selected
  if (modelId === 'global-orchestrator') {
    console.log('[PromptLoader] Loading Orchestrator prompt.');
    return getOrchestratorPrompt();
  }

  // 2. Check for a specific Specialist context based on contextId
  if (contextId && specialistRegistry[contextId]) {
    console.log(
      `[PromptLoader] Loading Specialist prompt for contextId: ${contextId}`,
    );

    // Allow client config to override the specialist's base persona prompt
    const specialistPersona =
      clientConfig?.configJson?.specialistPrompts?.[contextId] || // Check client override
      getSpecialistPromptById(contextId); // Fallback to default specialist prompt

    if (!specialistPersona || specialistPersona.trim() === '') {
      console.warn(
        `[PromptLoader] Specialist persona text for '${contextId}' is empty or not found. Falling back to default assistant prompt.`,
      );
      return defaultAssistantPrompt;
    }

    // Get relevant tool instructions based on the specialist's default tools
    const specialistConfig = specialistRegistry[contextId];
    // Combine base tool instructions with potential client-specific instructions (if applicable later)
    const toolInstructions = getToolPromptInstructions(
      specialistConfig.defaultTools,
    );

    // Add client-specific general instructions if they exist
    const clientInstructions = clientConfig?.customInstructions || '';
    let finalPersonaContent = specialistPersona;
    if (clientInstructions.trim() !== '') {
      finalPersonaContent += `\n\n# Client-Specific Guidelines\n${clientInstructions}`;
    }

    return composeSpecialistPrompt(finalPersonaContent, toolInstructions);
  }

  // 3. Fallback to the default assistant prompt if not Orchestrator or a known Specialist
  console.log(
    `[PromptLoader] No specific specialist context found for model '${modelId}' and contextId '${contextId}'. Loading default assistant prompt.`,
  );
  return defaultAssistantPrompt;
}
