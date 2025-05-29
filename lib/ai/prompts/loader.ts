import { defaultAssistantPrompt, composeSpecialistPrompt } from './core/base';
import { getOrchestratorPrompt } from './core/orchestrator';
import { getSpecialistPromptById, specialistRegistry } from './specialists';
import { getToolPromptInstructions } from './tools';
import {
  CHAT_BIT_CONTEXT_ID,
  GLOBAL_ORCHESTRATOR_CONTEXT_ID,
} from '@/lib/constants';
import type { ClientConfig } from '@/lib/db/queries';

interface LoadPromptParams {
  modelId: string; // e.g., 'global-orchestrator', 'gpt-4.1-mini'
  contextId: string | null; // Represents activeBitContextId or activeBitPersona
  clientConfig?: ClientConfig | null; // Client-specific overrides
  currentDateTime?: string; // Current date/time for context
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
  currentDateTime = new Date().toISOString(),
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
      return composeSpecialistPrompt(
        `# Role: General Assistant
You are a helpful general assistant within the Quibit system. Address user queries directly or use available tools as needed.`,
        `Standard tools for search and document interaction may be available.`,
        currentDateTime,
      );
    }

    // Inject client-specific context into the specialist persona
    let personaWithClientContext = specialistBasePersona;

    // Inject client_display_name
    if (clientConfig?.client_display_name) {
      personaWithClientContext = personaWithClientContext.replace(
        /{client_display_name}/g,
        clientConfig.client_display_name,
      );
    }

    // Create and inject client_core_mission_statement
    const missionStatement =
      clientConfig?.client_core_mission && clientConfig.client_display_name
        ? `\nAs a specialist for ${clientConfig.client_display_name}, be guided by their core mission: ${clientConfig.client_core_mission}\n`
        : '';
    personaWithClientContext = personaWithClientContext.replace(
      /{client_core_mission_statement}/g,
      missionStatement,
    );

    let finalPersonaContent = personaWithClientContext;

    // Append general client-specific instructions if they exist
    const generalClientInstructions = clientConfig?.customInstructions?.trim();
    if (generalClientInstructions) {
      // Create header that includes client name if available
      const customInstructionsHeader = clientConfig?.client_display_name
        ? `\n\n# Client-Specific Guidelines for ${clientConfig.client_display_name} (General)\n`
        : `\n\n# Client-Specific Guidelines (General)\n`;

      // Check if the general instructions are already in the specialist prompt to avoid duplication
      if (!finalPersonaContent.includes(generalClientInstructions)) {
        finalPersonaContent += `${customInstructionsHeader}${generalClientInstructions}`;
      }
    }

    const toolInstructions = getToolPromptInstructions(
      specialistConfig.defaultTools,
    );

    console.log(
      `[PromptLoader] Successfully composed prompt for specialist: ${contextId}`,
    );
    return composeSpecialistPrompt(
      finalPersonaContent,
      toolInstructions,
      currentDateTime,
    );
  }

  // 2. Check if this is the global orchestrator context
  if (
    contextId === GLOBAL_ORCHESTRATOR_CONTEXT_ID ||
    modelId === 'global-orchestrator'
  ) {
    console.log(
      `[PromptLoader] Loading Orchestrator prompt for global context or modelId.`,
    );
    // Call the updated orchestrator function with client-specific context
    return getOrchestratorPrompt(
      currentDateTime,
      clientConfig?.client_display_name || 'Quibit',
      clientConfig?.client_core_mission || null,
      clientConfig?.configJson?.orchestrator_client_context || null,
      clientConfig?.configJson?.available_bit_ids || null,
      clientConfig?.customInstructions || null,
    );
  }

  // 3. Check if this is the chat model context (general chat)
  if (contextId === CHAT_BIT_CONTEXT_ID) {
    console.log(
      `[PromptLoader] Loading Chat Model specialist prompt for general chat context.`,
    );

    // The chat model specialist should be registered in specialistRegistry
    const chatModelPrompt = getSpecialistPromptById(CHAT_BIT_CONTEXT_ID);

    if (!chatModelPrompt || chatModelPrompt.trim() === '') {
      console.warn(
        `[PromptLoader] Chat Model specialist prompt not found. Falling back to default assistant prompt.`,
      );
      return composeSpecialistPrompt(
        `# Role: General Assistant
You are a helpful general assistant within the Quibit system. Address user queries directly or use available tools as needed.`,
        `Standard tools for search and document interaction may be available.`,
        currentDateTime,
      );
    }

    // Inject client-specific context into the chat model persona
    let personaWithClientContext = chatModelPrompt;

    // Inject client_display_name
    if (clientConfig?.client_display_name) {
      personaWithClientContext = personaWithClientContext.replace(
        /{client_display_name}/g,
        clientConfig.client_display_name,
      );
    }

    // Create and inject client_core_mission_statement
    const missionStatement =
      clientConfig?.client_core_mission && clientConfig.client_display_name
        ? `\nAs a specialist for ${clientConfig.client_display_name}, be guided by their core mission: ${clientConfig.client_core_mission}\n`
        : '';
    personaWithClientContext = personaWithClientContext.replace(
      /{client_core_mission_statement}/g,
      missionStatement,
    );

    let finalPersonaContent = personaWithClientContext;

    // Append general client-specific instructions if they exist
    const generalClientInstructions = clientConfig?.customInstructions?.trim();
    if (generalClientInstructions) {
      // Create header that includes client name if available
      const customInstructionsHeader = clientConfig?.client_display_name
        ? `\n\n# Client-Specific Guidelines for ${clientConfig.client_display_name} (General)\n`
        : `\n\n# Client-Specific Guidelines (General)\n`;

      // Check if the general instructions are already in the specialist prompt to avoid duplication
      if (!finalPersonaContent.includes(generalClientInstructions)) {
        finalPersonaContent += `${customInstructionsHeader}${generalClientInstructions}`;
      }
    }

    // Get tool instructions for the chat model specialist
    const chatModelConfig = specialistRegistry[CHAT_BIT_CONTEXT_ID];
    const toolInstructions = chatModelConfig
      ? getToolPromptInstructions(chatModelConfig.defaultTools)
      : '';

    console.log(
      `[PromptLoader] Successfully composed prompt for Chat Model specialist`,
    );
    return composeSpecialistPrompt(
      finalPersonaContent,
      toolInstructions,
      currentDateTime,
    );
  }

  // 4. Fallback if not a known specialist and not the orchestrator modelId
  console.log(
    `[PromptLoader] No specific specialist context and modelId ('${modelId}') is not orchestrator. Loading default assistant prompt.`,
  );
  return composeSpecialistPrompt(
    `# Role: General Assistant
You are a helpful general assistant within the Quibit system. Address user queries directly or use available tools as needed.`,
    `Standard tools for search and document interaction may be available.`,
    currentDateTime,
  );
}
