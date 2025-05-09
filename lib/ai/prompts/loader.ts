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
  console.log(
    `[PromptLoader] Attempting to load prompt with modelId: '${modelId}', contextId: '${contextId}'`,
  );

  // 1. PRIORITIZE Specialist context based on contextId
  if (contextId && specialistRegistry[contextId]) {
    console.log(
      `[PromptLoader] Valid specialist contextId '${contextId}' found. Loading specialist prompt.`,
    );

    const specialistConfig = specialistRegistry[contextId];
    // Check for client-specific override for this specialist's persona
    const specialistBasePersona =
      clientConfig?.configJson?.specialistPrompts?.[contextId] ||
      getSpecialistPromptById(contextId); // Fallback to default specialist prompt

    if (!specialistBasePersona || specialistBasePersona.trim() === '') {
      console.warn(
        `[PromptLoader] Specialist persona for '${contextId}' is empty or not found (checked default and client config). Falling back to default assistant prompt.`,
      );
      return defaultAssistantPrompt;
    }

    const toolInstructions = getToolPromptInstructions(
      specialistConfig.defaultTools,
    );

    let finalPersonaContent = specialistBasePersona;
    // Append general client-specific instructions if they exist
    const generalClientInstructions = clientConfig?.customInstructions?.trim();
    if (generalClientInstructions) {
      // Check if the general instructions are already in the specialist prompt to avoid duplication
      // This is a simple check; more sophisticated checks might be needed if prompts are complex.
      if (!finalPersonaContent.includes(generalClientInstructions)) {
        finalPersonaContent += `\n\n# Client-Specific Guidelines (General)\n${generalClientInstructions}`;
      }
    }

    console.log(
      `[PromptLoader] Successfully composed prompt for specialist: ${contextId}`,
    );
    return composeSpecialistPrompt(finalPersonaContent, toolInstructions);
  }

  // 2. If no specialist context, THEN check if the modelId indicates the orchestrator
  //    (The 'modelId' here refers to the role, not necessarily the LLM model name like 'gpt-4')
  if (modelId === 'global-orchestrator') {
    console.log(
      `[PromptLoader] No specialist context active, and modelId is 'global-orchestrator'. Loading Orchestrator prompt.`,
    );
    return getOrchestratorPrompt();
  }

  // 3. Fallback if not a known specialist and not the orchestrator modelId
  console.log(
    `[PromptLoader] No specific specialist context and modelId ('${modelId}') is not orchestrator. Loading default assistant prompt.`,
  );
  return defaultAssistantPrompt;
}
