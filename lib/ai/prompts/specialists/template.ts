/**
 * Configuration interface for defining specialist AI personas.
 */
export interface SpecialistConfig {
  /** Unique identifier (e.g., 'echo-tango-specialist') */
  id: string;

  /** User-facing name (e.g., 'Echo Tango') */
  name: string;

  /** Brief description for UI display */
  description: string;

  /** The detailed system prompt text for this specialist */
  persona: string;

  /** List of tool names available by default to this specialist */
  defaultTools: string[];
}
