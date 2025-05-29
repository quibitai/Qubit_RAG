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

  /**
   * The detailed system prompt text defining the specialist's persona, capabilities, and guidelines.
   *
   * IMPORTANT: All specialist persona strings MUST include the following client context placeholders:
   * - {client_display_name} - Used for client's display name (e.g., in title, opening paragraph)
   * - {client_core_mission_statement} - Reserved for the client's mission statement
   *
   * Example usage in persona text:
   * ```
   * # ROLE: Specialist Name for {client_display_name}
   * You are {client_display_name}'s AI Assistant specialized in [area].
   * {client_core_mission_statement}
   * ```
   *
   * These placeholders will be automatically replaced with client-specific values
   * by the PromptLoader when assembling the final prompt.
   *
   * NOTE: Current date/time context is automatically injected into ALL specialist prompts
   * by the composeSpecialistPrompt() function. You do NOT need to include date/time
   * placeholders in your persona text - the system will automatically append:
   * "Current date and time: [formatted datetime]" to every specialist prompt.
   * This ensures all specialists have accurate temporal context for time-sensitive queries.
   */
  persona: string;

  /**
   * Array of tool names available to this specialist by default.
   * IMPORTANT: Ensure these tool names exactly match the names defined in lib/ai/tools/index.ts
   * and correspond to the actual functionality needed by this specialist.
   */
  defaultTools: string[];
}
