# Bit and Persona Selection Implementation (v1.7.9)

This document describes how Bit and persona selection works in the current Quibit RAG system.

## Overview

- **Bits**: Major functional components (e.g., Chat Bit, Document Editor Bit)
- **Personas**: Specialist variations within a Bit (e.g., Echo Tango Specialist)
- **Context-Aware**: Both Bit and persona context are passed to the Brain API and used for prompt and tool selection.

## Implementation

### 1. State Management
- `ChatPaneContext` manages `activeBitContextId` and `activeBitPersona` in React state and localStorage.
- Both are included in API requests to `/api/brain`.

### 2. UI Components
- The dashboard and chat header allow users to select Bits and personas.
- Persona selection is context-sensitive and updates the state accordingly.

### 3. Backend Integration
- The Brain API extracts `activeBitContextId` and `activeBitPersona` from the request body.
- The prompt system uses `activeBitPersona || activeBitContextId` to select the correct persona and toolset.
- Client-specific prompt overrides are supported.

### 4. Prompt System
- Modular, context-aware prompt loader in `lib/ai/prompts/`.
- Specialist registry and persona definitions in `specialists/`.
- Toolset and instructions are dynamically composed based on context.

## Best Practices
- Always include both Bit and persona context in API requests.
- Keep persona and Bit logic modular and under 200 lines per file.
- Use clear docstrings and rationale for each persona.
- Test new Bits and personas in isolation before production use.

## Extensibility
- Add new Bits by defining their context and UI entry points.
- Add new personas by creating a config in `specialists/` and registering it.
- Update the prompt loader and registry as needed.

## References
- See `ARCHITECTURE.md` and `PROMPT_SYSTEM.md` for system overview. 