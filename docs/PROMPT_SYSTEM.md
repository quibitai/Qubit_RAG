# Quibit Prompt System Documentation (v2)

## Overview

The Quibit RAG system utilizes a modular prompt architecture designed for clarity, maintainability, and precise control over AI behavior. It clearly separates the functionality and identity of:
1.  **The Quibit Orchestrator:** The central AI that manages conversations, utilizes tools, and coordinates with specialists.
2.  **Specialist Personas:** Specialized AIs with distinct roles, knowledge, voices, and default toolsets (e.g., Echo Tango).
3.  **Tool-Specific Instructions:** Concise guidelines on how the AI should use specific tools or interpret their outputs.

This modularity allows for easier updates, additions of new specialists, and consistent AI behavior.

## System Architecture & Key Components

The core of the prompt system resides in `lib/ai/prompts/`:

* **`loader.ts`**: This is the primary entry point for obtaining a system prompt. The `loadPrompt()` function dynamically determines and composes the correct prompt based on:
    * `modelId`: Identifies if the request is for the 'global-orchestrator'.
    * `contextId`: The ID of the active specialist persona (e.g., 'echo-tango-specialist') or `null`.
    * `clientConfig`: Allows for client-specific overrides or additions to prompts.

* **`core/base.ts`**: Defines base prompt sections (like core capabilities, response guidelines) and the `composeSpecialistPrompt()` function which combines these base elements with a specialist's specific persona. It also defines `defaultAssistantPrompt` for general interactions when no specialist is active and it's not the orchestrator.

* **`core/orchestrator.ts`**: Contains the detailed system prompt for the Quibit Orchestrator (`orchestratorPrompt`) and the `getOrchestratorPrompt()` function. This prompt heavily emphasizes identity preservation.

* **`specialists/`**: This directory houses individual specialist definitions.
    * `template.ts`: Defines the `SpecialistConfig` interface (id, name, description, persona, defaultTools).
    * `[specialist-name].ts` (e.g., `echo-tango.ts`): Implements `SpecialistConfig` for a specific specialist, including their detailed persona prompt.
    * `index.ts`: Contains the `specialistRegistry` (mapping IDs to `SpecialistConfig` objects) and `promptRegistry` (mapping IDs to persona strings). It also provides helper functions like `getSpecialistPromptById()` and `getAvailableSpecialists()`.

* **`tools/`**: This directory contains tool-specific usage instructions.
    * `[tool-category].ts` (e.g., `knowledge.ts`, `web-search.ts`): Defines instruction strings for categories of tools.
    * `index.ts`: Contains the `toolInstructionMap` (mapping tool names to instruction strings) and the `getToolPromptInstructions()` function, which compiles relevant instructions based on the tools available to the current agent (Orchestrator or Specialist).

## Prompt Composition Flow

1.  The `app/api/brain/route.ts` (or relevant agent initialization logic) calls `loadPrompt()`.
2.  `loadPrompt()` determines if it's an Orchestrator, a specific Specialist, or a Default Assistant context.
3.  If Specialist:
    * It retrieves the specialist's persona string (via `getSpecialistPromptById`) and default tools (via `specialistRegistry`).
    * It fetches relevant tool instructions (via `getToolPromptInstructions`).
    * It composes the final prompt using `composeSpecialistPrompt(persona, toolInstructions)`.
4.  The resulting system prompt is then used to initialize the AI agent.

## Adding a New Specialist

To add a new specialist (e.g., "Data Analyst"):

1.  **Define Configuration & Persona:**
    * Create a new file: `lib/ai/prompts/specialists/data-analyst.ts`.
    * Implement the `SpecialistConfig` interface:
        ```typescript
        // lib/ai/prompts/specialists/data-analyst.ts
        import { SpecialistConfig } from './template';

        const dataAnalystPersona = `
        # ROLE: Data Analyst Specialist
        You are a meticulous Data Analyst AI...
        // ... (detailed persona, capabilities, guidelines) ...
        `;

        export const dataAnalystConfig: SpecialistConfig = {
          id: 'data-analyst-specialist',
          name: 'Data Analyst',
          description: 'Specializes in advanced data analysis and insights.',
          persona: dataAnalystPersona,
          defaultTools: ['queryDocumentRows', 'searchInternalKnowledgeBase', /* other relevant tools */]
        };

        export const dataAnalystPrompt = dataAnalystConfig.persona;
        ```

2.  **Register the Specialist:**
    * Open `lib/ai/prompts/specialists/index.ts`.
    * Import the new config and prompt:
        ```typescript
        import { dataAnalystConfig, dataAnalystPrompt } from './data-analyst';
        ```
    * Add to `specialistRegistry`:
        ```typescript
        export const specialistRegistry: Record<string, SpecialistConfig> = {
          // ... existing specialists ...
          [dataAnalystConfig.id]: dataAnalystConfig,
        };
        ```
    * Add to `promptRegistry`:
        ```typescript
        const promptRegistry: Record<string, string> = {
          // ... existing specialist prompts ...
          [dataAnalystConfig.id]: dataAnalystPrompt,
        };
        ```

3.  **Test:** Add relevant tests to `tests/prompts/system.test.ts` and perform manual testing.

## Tool Instructions
Tool instructions are designed to be concise guidelines on *how the AI should use a tool or interpret its output*, not a replacement for the tool's description (which LangChain uses for tool selection). They are added to the system prompt under a "Tool Usage Notes" section when relevant tools are active.

To add instructions for a new tool or tool category:
1. Create or update a file in `lib/ai/prompts/tools/`.
2. Export the instruction string.
3. Map the tool name(s) to this instruction string in `lib/ai/prompts/tools/index.ts` within the `toolInstructionMap`.

## Future Specialists Roadmap

### Planned Specialists

1. **Research Specialist**
   - **ID:** `research-specialist`
   - **Role:** Specializes in comprehensive research tasks, literature reviews, and knowledge synthesis
   - **Default Tools:** `tavilySearch`, `searchInternalKnowledgeBase`, `getFileContents`, `createDocument`
   - **Key Capabilities:**
     - Systematic research methodology
     - Summarizing and comparing multiple sources
     - Citation management
     - Research report generation

2. **Data Analyst Specialist**
   - **ID:** `data-analyst-specialist`
   - **Role:** Focuses on advanced data analysis, interpretation, and visualization
   - **Default Tools:** `queryDocumentRows`, `searchInternalKnowledgeBase`, `createDocument`
   - **Key Capabilities:**
     - Statistical analysis
     - Data pattern recognition
     - Insights generation from complex datasets
     - Chart and visualization recommendations

3. **Content Writer Specialist**
   - **ID:** `content-writer-specialist`
   - **Role:** Creates polished, audience-targeted content across various formats
   - **Default Tools:** `createDocument`, `updateDocument`, `tavilySearch`
   - **Key Capabilities:**
     - Adaptable writing styles (technical, marketing, educational)
     - SEO optimization
     - Content structuring
     - Tone adjustment based on audience

### Implementation Priority

The planned implementation order is:
1. Data Analyst Specialist (highest demand)
2. Content Writer Specialist
3. Research Specialist

### Design Considerations

When implementing new specialists, pay particular attention to:
- Clearly defining tool usage patterns unique to each specialist
- Ensuring no identity overlap with existing specialists
- Thorough testing of tool filtering to prevent unavailable tool usage attempts
- Documentation of each specialist's distinctive capabilities and limitations 