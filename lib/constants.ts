export const isProductionEnvironment = process.env.NODE_ENV === 'production';

export const isTestEnvironment = Boolean(
  process.env.PLAYWRIGHT_TEST_BASE_URL ||
    process.env.PLAYWRIGHT ||
    process.env.CI_PLAYWRIGHT,
);

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

// If you plan to have distinct, separate chat history lists for individual specialists
// in the sidebar, you could add them here too, e.g.:
// export const SPECIALIST_CODER_CONTEXT_ID = 'specialist-coder';
// export const SPECIALIST_RESEARCHER_CONTEXT_ID = 'specialist-researcher';
// For now, we'll assume specialists operate within the CHAT_BIT_CONTEXT_ID.
