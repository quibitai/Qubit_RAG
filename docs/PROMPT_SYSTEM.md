# Quibit Prompt System Documentation (v1.7.9)

## Overview

The Quibit RAG prompt system is modular, extensible, and context-aware. It supports:
- **Orchestrator Persona**: The central AI agent that manages conversations and coordinates tools and specialists.
- **Specialist Personas**: Configurable AIs with distinct roles, voices, and toolsets (e.g., Echo Tango).
- **Tool-Specific Instructions**: Concise, context-driven guidelines for tool usage.

## System Architecture & Key Components

Located in `lib/ai/prompts/`:
- `loader.ts`: Main entry point. `loadPrompt()` dynamically composes the system prompt based on orchestrator/specialist context, client config, and active tools.
- `core/`: Base prompt sections and orchestrator persona.
- `specialists/`: Specialist persona definitions, registry, and template interface.
- `tools/`: Tool usage instructions, mapped to tool names.

## Prompt Composition Flow

1. The Brain API calls `loadPrompt()` with context (orchestrator, specialist, client config).
2. The loader selects the correct persona and toolset.
3. Tool usage notes are included for all active tools.
4. The composed prompt is used to initialize the LangChain agent.

## Extensibility
- Add new specialists by creating a config in `specialists/` and registering it.
- Add new tool instructions in `tools/` and map them in `tools/index.ts`.
- Client-specific prompt overrides are supported via config.

## Best Practices
- Keep persona and tool instructions modular and under 200 lines per file.
- Use clear docstrings and rationale for each persona/tool.
- Test new prompts and tool instructions in isolation before production use.

## References
- See `ARCHITECTURE.md` for system overview.
- See `lib/ai/prompts/` for implementation details.

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