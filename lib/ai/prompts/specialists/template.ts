/**
 * Defines the structure for configuring an AI specialist persona.
 */
export interface SpecialistConfig {
  /** Unique identifier for the specialist (e.g., 'echo-tango-specialist') */
  id: string;

  /** User-facing display name (e.g., 'Echo Tango') */
  name: string;

  /** Brief description shown in UI selectors */
  description: string;

  /** The detailed system prompt text defining the specialist's persona, capabilities, and guidelines */
  persona: string;

  /** Array of tool names available to this specialist by default */
  defaultTools: string[];
}
