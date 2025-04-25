# Model Selection Architecture

This document explains the model selection architecture implemented in version 3.1.0, which provides a flexible way to use different OpenAI models based on the context of the request.

## Overview

The model selection architecture dynamically chooses which OpenAI model to use based on the following priority:

1. **Bit ID Mapping**: If a Bit ID is provided and there's a mapping for it, that model is used
2. **Environment Variable**: If no mapping is found, falls back to the `DEFAULT_MODEL_NAME` environment variable
3. **Default Model**: If neither of the above is available, uses the default model specified in the mapping

## Implementation Details

### Model Mapping Configuration

The model mapping is defined in `lib/ai/models.ts`:

```typescript
export const modelMapping: Record<string, string> = {
  'chat-model': 'gpt-4.1-mini',       // Echo Tango Bit uses gpt-4.1-mini
  'chat-model-reasoning': 'gpt-4.1-mini', // Orchestrator uses gpt-4.1-mini
  default: 'gpt-4.1',                 // All other Bits use gpt-4.1 by default
};
```

### Selection Logic

The model selection happens in the `initializeLLM` function in `app/api/brain/route.ts`:

```typescript
function initializeLLM(bitId?: string) {
  // Use the model mapping to determine the correct model based on bitId
  // Fall back to environment variable or default model
  let selectedModel: string;

  if (bitId && modelMapping[bitId]) {
    selectedModel = modelMapping[bitId];
  } else {
    selectedModel = process.env.DEFAULT_MODEL_NAME || modelMapping.default;
  }

  console.log(
    `[Brain API] Initializing LLM with model: ${selectedModel} for bitId: ${bitId || 'unknown'}`,
  );

  // Initialize OpenAI Chat model
  return new ChatOpenAI({
    modelName: selectedModel,
    temperature: 0.7,
    apiKey: process.env.OPENAI_API_KEY,
  });
}
```

## Configuration Options

### Environment Variables

- `DEFAULT_MODEL_NAME`: Specifies the default model to use when no mapping exists for a Bit ID

### Bit IDs and Models

Each Bit has a specific ID that corresponds to a model:

- `chat-model`: Echo Tango Bit (uses gpt-4.1-mini)
- `chat-model-reasoning`: Orchestrator (uses gpt-4.1-mini)
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

1. **Known Bit IDs**: Verifies that 'chat-model' and 'chat-model-reasoning' correctly map to 'gpt-4.1-mini'
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
[Test] Model selected for bitId "chat-model-reasoning": gpt-4.1-mini

Test Case 3: Unknown bitId (uses env var as fallback)
[Test] Model selected for bitId "unknown-bit": gpt-4-from-env

Test Case 4: No bitId provided (uses env var as fallback)
[Test] Model selected for bitId "undefined": gpt-4-from-env

Test Case 5: Without DEFAULT_MODEL_NAME env var
[Test] Model selected for bitId "unknown-bit": gpt-4.1

===== TEST SUMMARY =====
1. Known Bit IDs (chat-model, chat-model-reasoning): uses gpt-4.1-mini
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