# Model Selection Architecture (v2.1.0)

This document describes the model selection logic for Quibit RAG as of v2.1.0.

## Overview

Model selection is dynamic and context-aware. The system chooses the OpenAI model based on:
1. **Bit/Persona Context**: If a Bit or persona is specified and mapped, use its model.
2. **Environment Variable**: If no mapping, use `DEFAULT_MODEL_NAME` from environment.
3. **Default Fallback**: If neither, use the default model in `lib/ai/models.ts`.

## Implementation

- Model mapping is defined in `lib/ai/models.ts`:
  ```typescript
  export const modelMapping: Record<string, string> = {
    'chat-model': 'gpt-4.1-mini',
    'global-orchestrator': 'gpt-4.1',
    'echo-tango-specialist': 'gpt-4.1-mini',
    'document-editor': 'gpt-4.1',
    default: 'gpt-4.1',
  };
  ```
- The Brain API (`/api/brain/route.ts`) uses this mapping to select the model for each request.
- Bit/persona context is passed in the API payload and determines the model.
- If no mapping is found, the environment variable is used.

## Extensibility
- Add new Bit/persona IDs and models to `modelMapping` as needed.
- Update the UI and tests to support new models.

## Best Practices
- Keep model mapping centralized in `lib/ai/models.ts`.
- Use environment variables for deployment-specific defaults.
- Test model selection logic for all Bit/persona scenarios.

## References
- See `ARCHITECTURE.md` for system overview.
- See `lib/ai/models.ts` and `/api/brain/route.ts` for implementation.

## Configuration Options

### Environment Variables

- `DEFAULT_MODEL_NAME`: Specifies the default model to use when no mapping exists for a Bit ID

### Bit IDs and Models

Each Bit has a specific ID that corresponds to a model:

- `chat-model`: Echo Tango Bit (uses gpt-4.1-mini)
- `global-orchestrator`: Orchestrator (uses gpt-4.1)
- `echo-tango-specialist`: Echo Tango Specialist (uses gpt-4.1-mini)
- `document-editor`: Document Editor (uses gpt-4.1)
- Any other Bit ID: Uses the default model (gpt-4.1) or the environment variable if set

## Testing

A dedicated test script (`test-model-selection.js`) verifies the model selection logic works correctly. This script simulates the model selection logic used in the API routes and ensures that each selection path works as expected.

### Running the Tests

```bash
# Run the test script
node test-model-selection.js
```

### Test Scenarios

The test script checks the following scenarios:

1. **Known Bit IDs**: Verifies that 'chat-model', 'global-orchestrator', 'echo-tango-specialist', and 'document-editor' correctly map to 'gpt-4.1-mini', 'gpt-4.1', 'gpt-4.1-mini', and 'gpt-4.1' respectively
2. **Unknown Bit ID with Environment Variable**: Verifies that when an unknown Bit ID is provided, it falls back to the `DEFAULT_MODEL_NAME` environment variable ('gpt-4-from-env' in the test)
3. **Missing Bit ID with Environment Variable**: Verifies that when no Bit ID is provided, it falls back to the environment variable
4. **Unknown Bit ID without Environment Variable**: Verifies that when an unknown Bit ID is provided and no environment variable is set, it uses the default model ('gpt-4.1' in the mapping)

### Test Output

The test script produces detailed output showing which model was selected for each scenario:

```
===== MODEL SELECTION LOGIC TEST =====

Test Case 1: Known bitId with explicit mapping
[Test] Model selected for bitId "chat-model": gpt-4.1-mini

Test Case 2: Another known bitId with explicit mapping
[Test] Model selected for bitId "global-orchestrator": gpt-4.1

Test Case 3: Unknown bitId (uses env var as fallback)
[Test] Model selected for bitId "unknown-bit": gpt-4-from-env

Test Case 4: No bitId provided (uses env var as fallback)
[Test] Model selected for bitId "undefined": gpt-4-from-env

Test Case 5: Without DEFAULT_MODEL_NAME env var
[Test] Model selected for bitId "unknown-bit": gpt-4.1

===== TEST SUMMARY =====
1. Known Bit IDs (chat-model, global-orchestrator, echo-tango-specialist, document-editor): uses gpt-4.1-mini, gpt-4.1, gpt-4.1-mini, gpt-4.1
2. Unknown Bit ID with env var set: uses env var value (gpt-4-from-env)
3. No Bit ID with env var set: uses env var value (gpt-4-from-env)
4. Unknown Bit ID without env var: falls back to default from mapping (gpt-4.1)
5. When no mapping and no env var: would throw an error (not tested)
```

### Extending the Tests

To test additional model mappings:

1. Add new entries to the `modelMapping` object in the test file
2. Create additional test cases to verify the selection logic for those mappings
3. Run the test script to validate the behavior

## Adding New Models

To add support for a new model:

1. Add the Bit ID and corresponding model name to `modelMapping` in `lib/ai/models.ts`
2. If needed, add a new entry to the `chatModels` array in the same file for UI selection
3. Update tests to verify the new mappings work correctly

## Benefits

This architecture provides several advantages:

- **Flexibility**: Easily change models for specific use cases
- **Centralized Configuration**: All model mappings are defined in one place
- **Fallback Mechanism**: Ensures a model is always selected even if configurations are missing
- **Environment Control**: Allows for different models in development vs. production via environment variables 