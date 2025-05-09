export const isProductionEnvironment = process.env.NODE_ENV === 'production';

export const isTestEnvironment = Boolean(
  process.env.PLAYWRIGHT_TEST_BASE_URL ||
    process.env.PLAYWRIGHT ||
    process.env.CI_PLAYWRIGHT,
);

// --- Bit Context IDs ---
// Used to differentiate chat histories and contexts across the application.

/**
 * Represents chats specifically handled by the global Quibit orchestrator.
 * These chats will appear in the GlobalChatHistoryDropdown.
 */
export const GLOBAL_ORCHESTRATOR_CONTEXT_ID = 'global-orchestrator';

/**
 * Represents chats handled within the general Chat Bit.
 * This includes interactions when a specialist might be active but the history
 * is still tied to the main Chat Bit context.
 * These chats will appear in the sidebar history.
 */
export const CHAT_BIT_CONTEXT_ID = 'chat-model';

/**
 * The Echo Tango specialist ID.
 * This is used for identifying conversations with the Echo Tango specialist.
 */
export const ECHO_TANGO_SPECIALIST_ID = 'echo-tango-specialist';

// --- Add more specialist context IDs here as they are created ---
// export const SPECIALIST_CODER_CONTEXT_ID = 'specialist-coder';
// export const SPECIALIST_RESEARCHER_CONTEXT_ID = 'specialist-researcher';

/**
 * Alias for CHAT_BIT_CONTEXT_ID for backward compatibility and clarity.
 * Represents the default context for the main Chat Bit UI when no specific specialist is active.
 */
export const CHAT_BIT_GENERAL_CONTEXT_ID = CHAT_BIT_CONTEXT_ID;

// --- Add IDs for new "Bits" (major feature areas) if they have their own distinct chat histories ---
// export const NEW_BIT_ABC_CONTEXT_ID = 'new-bit-abc';
