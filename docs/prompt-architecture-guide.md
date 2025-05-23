## Quibit Prompt System: Architecture and Configuration Guide

This document outlines the prompt engineering strategy for the Quibit application, designed to support multi-client deployments with tailored AI experiences while maintaining a modular and efficient codebase.

### I. Core Goals

1.  **Client-Specific Ecosystems:** Each client receives a dedicated Quibit environment, including a unique Orchestrator and a set of specialized "Bits" (AI personas/tools).
2.  **Intelligent Orchestration:** A client-specific Quibit Orchestrator understands the client's company, knowledge base, available Bits, and user interactions, eventually providing agentic guidance.
3.  **Tailored Bits:** Each Bit (e.g., Chat Bit, Workflow Bit) is customized with client-relevant knowledge and tools.
4.  **Efficiency:** Minimize token usage and latency through optimized prompt organization, avoiding redundancy.
5.  **Scalability & Maintainability:** Easily onboard new clients and introduce new Bit types with minimal code duplication.

### II. Hierarchical Prompt Configuration Strategy

The system employs a layered approach to prompt assembly, combining client-wide context from the database with function-specific instructions from the codebase.

**A. Layer 1: Client Identity & Core Context (Database)**

This foundational layer establishes the client's identity and overarching operational context. It's stored in the `Clients` table in the database, per `clientId`.

1.  **`client_name` (TEXT)**
    * **Purpose:** The official, user-facing name of the client company.
    * **Example:** "Echo Tango Creative Agency"
    * **Usage:** Injected into prompts to make the AI aware of whom it's serving.

2.  **`client_core_mission` (TEXT)**
    * **Purpose:** A concise (1-2 sentences) description of the client's primary business and purpose.
    * **Example (for Echo Tango):** "Echo Tango is a creative agency specializing in captivating brand storytelling through video, animation, and marketing campaigns."
    * **Usage:** Provides essential business context to all AI components operating for this client.

3.  **`customInstructions` (TEXT)**
    * **Purpose:** General, client-wide guidelines, ethical considerations, mandatory phrases, or desired tones that should apply to most, if not all, AI interactions for this client.
    * **Example (for Echo Tango):** "Maintain a professional, enthusiastic, and sophisticated tone. When relevant, subtly weave in Echo Tango's motto: 'Elevate your brand. Tell your story.' Avoid making definitive financial commitments without human approval."
    * **Usage:** Appended to the prompts of the Orchestrator and specific Bits to ensure consistent adherence to client-wide standards.

4.  **`config_json` (JSONB - Structured Configuration)**
    * **`orchestrator_client_context` (TEXT key within JSON):**
        * **Purpose:** Specific high-level instructions, facts, or operational guidelines exclusively for the *client's Orchestrator*.
        * **Example (for Echo Tango):** "Echo Tango primarily serves clients in the entertainment, technology, and non-profit sectors. Key internal contacts are Sarah (CEO) and Mike (Head of Production). Current focus is on Q3 project deliverables. The client's knowledge base (KB ID: ET_KB_001) is the primary source for company-specific information."
        * **Usage:** Injected into the Orchestrator's prompt to provide detailed client-specific operational awareness.
    * **`available_bit_ids` (ARRAY of TEXT key within JSON):**
        * **Purpose:** An explicit list of `contextId`s for all Bits (Specialists, tools, or functional modules) that are active and available for this client.
        * **Example:** `["echo-tango-specialist", "production-planning-bit", "chat-model", "document-editor-bit"]`
        * **Usage:** Informs the Orchestrator about the resources it can delegate tasks to or guide users towards.
    * **`specialist_personas` (OBJECT key within JSON):**
        * **Purpose:** Maps a `specialist_id` (which is a `contextId`) to a client-specific persona string. This string *overrides or significantly augments* the default persona defined in the specialist's code.
        * **Example (for Echo Tango's generalist specialist):**
            ```json
            {
              "echo-tango-specialist": "You are 'Echo,' Echo Tango's lead creative AI strategist. Your voice is witty, insightful, and always focused on innovative storytelling solutions. You have deep knowledge of Echo Tango's past projects, brand guidelines, and preferred communication style with clients like 'ReelCovey' and 'InnovateNow'. Refer to the Echo Tango style guide (Doc ID: ET_Style_Guide_v3) for tone."
            }
            ```
        * **Usage:** Allows deep customization of specialist behavior and voice for each client without altering the base code of the specialist type.
    * **`tool_configs` (OBJECT key within JSON - Optional but Recommended):**
        * **Purpose:** Stores client-specific configurations for tools, such as API keys, webhook URLs, or specific resource identifiers (e.g., client-specific database IDs for a knowledge base tool if not derivable from `clientId`).
        * **Example:**
            ```json
            {
              "n8nMcpGateway": {
                "webhook_url": "https://client-echo-tango.n8n.quibit.app/webhook/mcp",
                "api_key": "client_specific_n8n_api_key"
              },
              "internalKnowledgeBase": {
                "database_id": "kb_echo_tango_main"
              }
            }
            ```
        * **Usage:** Enables tools to connect to client-specific external services or data sources.

**B. Code-Defined Prompts (Application Level)**

These prompts define the core, reusable logic and default behaviors of the Orchestrator and different Bit types.

1.  **Global Quibit Orchestrator (`lib/ai/prompts/core/orchestrator.ts`)**
    * **Core Functional Prompt (Static):** A comprehensive, client-agnostic prompt detailing the Orchestrator's fundamental responsibilities:
        * Understanding user intent and conversation history.
        * Strategic selection of appropriate tools or Bits from the `{available_bits_summary}`.
        * Managing multi-turn conversation flow and context.
        * Delegation logic and providing necessary context to Bits.
        * Error handling and clarification strategies.
        * Summarizing information and presenting it clearly.
    * **Placeholders for Dynamic Injection:** Includes placeholders like `{client_name}`, `{client_core_mission}`, `{orchestrator_client_context}` (from `config_json`), and `{available_bits_summary}` (derived from `config_json.available_bit_ids`).

2.  **Specialized Bits / Specialists (e.g., `lib/ai/prompts/specialists/echo-tango.ts`, `production-planning-bit.ts`)**
    * **Default Persona & Function (Static):** Each Bit type has a default, detailed persona string and functional description defined within its specific configuration file (e.g., `echoTangoConfig.persona`). This outlines its core expertise, capabilities, and interaction style if no client-specific persona override is provided in `config_json.specialist_personas`.
    * **Placeholders:** Includes basic placeholders like `{client_name}` and `{client_core_mission}` to ensure fundamental client awareness.
    * **Associated Tools:** Defines its `defaultTools` array, listing the tools it is designed to work with.

3.  **Common Prompt Components (`lib/ai/prompts/core/base.ts`)**
    * **`# Core Capabilities`:** Standard introduction defining the AI as part of the Quibit system with access to tools and knowledge.
    * **`# Response Guidelines`:** General rules for AI communication (conciseness, markdown, admitting limitations).

4.  **Tool Usage Instructions (`lib/ai/prompts/tools/`)**
    * **`getToolPromptInstructions(toolNames: string[])`:** Generates a consolidated block of text describing how to use the tools available to the current AI (Orchestrator or Specialist). This can include generic instructions per tool type and specific instructions for individual tools.

**C. Prompt Assembly Process (Conceptual Flow handled by `PromptLoader` and other logic)**

1.  **Context Identification:** Determine `clientId` and `effectiveContextId` (Orchestrator or a specific Bit).
2.  **Fetch Client Data:** Retrieve `client_name`, `client_core_mission`, `customInstructions`, and relevant parts of `config_json` from the database.

3.  **If Orchestrator Context:**
    * Load the Orchestrator's static core functional prompt.
    * Inject fetched `client_name`, `client_core_mission`, and `config_json.orchestrator_client_context`.
    * Create a summary/list of available Bits from `config_json.available_bit_ids` and inject it.
    * Append `customInstructions`.
    * Append tool instructions for tools accessible to the Orchestrator.
    * Inject current date/time.

4.  **If Specialist/Bit Context:**
    * **Determine Base Persona:**
        * Use `config_json.specialist_personas[specialist_id]` if provided by the client.
        * Else, use the static default persona from the specialist's code file.
    * Inject fetched `client_name` and `client_core_mission` into this persona.
    * Append `customInstructions`.
    * **Compose Final Prompt:** Use `composeSpecialistPrompt` (from `lib/ai/prompts/core/base.ts`) to combine:
        * Static `# Core Capabilities`.
        * The fully resolved and client-contextualized persona.
        * Static `# Response Guidelines`.
        * Dynamically generated `# Tool Usage Notes` for the specialist's assigned tools.
    * Inject current date/time.

5.  **Final Delivery to LLM:** The assembled system prompt is combined with chat history and the current user query.

### IV. Onboarding a New Client (e.g., "Innovate Solutions Inc.")

1.  **Database Entry:**
    * Add a new row to the `Clients` table with `clientId = 'innovate-solutions'`.
    * Set `client_name = "Innovate Solutions Inc."`.
    * Set `client_core_mission = "Innovate Solutions Inc. develops cutting-edge AI software for enterprise automation."`.
    * Add relevant `customInstructions`.
    * In `config_json`:
        * Define `orchestrator_client_context`: "Innovate Solutions is heavily focused on R&D and has a strict IP protection policy. Key projects are 'Phoenix' and 'Hydra'."
        * List `available_bit_ids`: e.g., `["chat-model", "code-generator-bit", "technical-documentation-specialist"]`.
        * Optionally, provide `specialist_personas` overrides if the default personas for "chat-model" or the new "code-generator-bit" need specific tailoring for Innovate Solutions.
        * Add any necessary `tool_configs` (e.g., API key for a specialized code analysis tool).
2.  **Code (Minimal if using existing Bit types):**
    * If "code-generator-bit" or "technical-documentation-specialist" are new Bit *types*, their default prompts and logic would need to be created in new files within `lib/ai/prompts/specialists/` and registered.
    * If Innovate Solutions is using existing Bit types (like a general "chat-model"), no new Bit code is needed beyond the DB configuration. 