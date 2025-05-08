import type { SpecialistConfig } from './template';
import { echoTangoConfig, echoTangoPrompt } from './echo-tango';

// Registry of all specialists
export const specialistRegistry: Record<string, SpecialistConfig> = {
  [echoTangoConfig.id]: echoTangoConfig,
  // Add future specialists here
};

// Registry mapping ID to just the persona prompt string
const promptRegistry: Record<string, string> = {
  [echoTangoConfig.id]: echoTangoPrompt,
  // Add future specialist prompts here
};

/**
 * Retrieves the persona prompt string for a given specialist ID.
 * @param specialistId - ID of the specialist to retrieve
 * @returns The specialist's persona prompt string or empty string if not found
 */
export function getSpecialistPromptById(specialistId: string): string {
  return promptRegistry[specialistId] || '';
}

/**
 * Retrieves a list of available specialists for UI population.
 * @returns Array of specialist data objects with id, name, and description
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
