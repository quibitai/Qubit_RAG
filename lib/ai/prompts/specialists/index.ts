import type { SpecialistConfig } from './template';
import { echoTangoConfig, echoTangoPrompt } from './echo-tango';
// --- Import future specialists here ---
// Example: import { dataAnalystConfig, dataAnalystPrompt } from './data-analyst';

/**
 * Registry mapping specialist IDs to their full configuration objects.
 * This is the single source of truth for specialist definitions.
 */
export const specialistRegistry: Record<string, SpecialistConfig> = {
  [echoTangoConfig.id]: echoTangoConfig,
  // --- Register future specialists here ---
  // [dataAnalystConfig.id]: dataAnalystConfig,
};

/**
 * Registry mapping specialist IDs directly to their persona prompt strings.
 * Used for quick lookup by the prompt loader.
 */
const promptRegistry: Record<string, string> = {
  [echoTangoConfig.id]: echoTangoPrompt,
  // --- Register future specialist prompts here ---
  // [dataAnalystConfig.id]: dataAnalystPrompt,
};

/**
 * Retrieves the persona prompt string for a given specialist ID.
 * Returns an empty string if the specialist ID is not found.
 * @param specialistId - The unique ID of the specialist.
 * @returns The specialist's persona prompt string or an empty string.
 */
export function getSpecialistPromptById(specialistId: string): string {
  const prompt = promptRegistry[specialistId];
  if (!prompt) {
    console.warn(
      `[SpecialistRegistry] Prompt not found for specialistId: ${specialistId}`,
    );
    return '';
  }
  return prompt;
}

/**
 * Retrieves a list of available specialists (ID, name, description)
 * suitable for populating UI elements like dropdowns.
 * @returns An array of specialist info objects.
 */
export function getAvailableSpecialists(): Array<{
  id: string;
  name: string;
  description: string;
}> {
  return Object.values(specialistRegistry).map((config) => ({
    id: config.id,
    name: config.name,
    description: config.description,
  }));
}
