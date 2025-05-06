# Bit and Persona Selection Implementation

This document outlines the implementation of the Bit selection and persona-specific prompt handling in the Quibit RAG system.

## Overview

The system supports two key concepts:
1. **Bits**: Major functional components (e.g., Chat Bit, Document Editor Bit)
2. **Personas**: Specialist variations within a Bit (e.g., Echo Tango Specialist within Chat Bit)

## Implementation Components

### 1. State Management in ChatPaneContext

The `ChatPaneContext` maintains two separate state variables:
- `activeBitContextId`: Identifies which Bit is currently active (e.g., 'chat-model')
- `activeBitPersona`: Identifies which specific persona is active within the Bit (e.g., 'echo-tango-specialist')

Both state variables are:
- Stored in React state
- Persisted to localStorage for session continuity
- Included in all API requests to the Brain endpoint

```typescript
// Key state in ChatPaneContext
const [activeBitContextId, setActiveBitContextId] = useState<string | null>(null);
const [activeBitPersona, setActiveBitPersona] = useState<string | null>(null);

// API request payload includes both
const bodyPayload = {
  selectedChatModel: 'global-orchestrator',
  activeBitContextId,
  activeBitPersona,
  activeDocId,
  // ... other fields
};
```

### 2. UI Components for Selection

The selection interface is implemented in the `ChatHeader` component:

- The Dashboard shows cards for selecting different Bits
- When in the Chat Bit UI, a dropdown allows selection of specific personas
- The dropdown dynamically updates based on the active Bit context

```tsx
// In chat-header.tsx - Persona selection dropdown
{!isReadonly && activeBitContextId === 'chat-model' && (
  <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <Button variant="outline" size="sm" className="h-8 gap-1">
        {activeBitPersona ? 
          chatBitPersonas.find(p => p.id === activeBitPersona)?.name || 'Select Persona' : 
          'Select Persona'}
        <ChevronDown className="h-3 w-3" />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="start" className="w-[200px]">
      {chatBitPersonas.map(persona => (
        <DropdownMenuItem
          key={persona.id}
          onClick={() => setActiveBitPersona(persona.id)}
          className="flex items-center justify-between"
        >
          {/* Persona details */}
        </DropdownMenuItem>
      ))}
    </DropdownMenuContent>
  </DropdownMenu>
)}
```

### 3. Backend Integration

In the `app/api/brain/route.ts` file:

- Both `activeBitContextId` and `activeBitPersona` are extracted from the request
- The specialist prompt is determined using `activeBitPersona || activeBitContextId`
- This prioritizes persona-specific prompts over general Bit prompts

```typescript
// In app/api/brain/route.ts
const {
  activeBitContextId = null,
  activeBitPersona = null,
  // ...other fields
} = reqBody;

// Prioritize persona-specific prompts
const specialistPromptKey = activeBitPersona || activeBitContextId;
let specialistPromptText: string | null | undefined = null;

if (specialistPromptKey && clientConfig?.configJson?.specialistPrompts) {
  specialistPromptText = clientConfig.configJson.specialistPrompts[specialistPromptKey];
  // Use client-specific prompts if available
}

// Fallback to generic specialist prompt if not found in client config
if (!specialistPromptText && specialistPromptKey) {
  specialistPromptText = getSpecialistPrompt(specialistPromptKey);
}
```

### 4. Specialist Prompts

Specific persona prompts are defined in `lib/ai/prompts.ts`:

```typescript
// In prompts.ts - getSpecialistPrompt function
const specialistPrompts: Record<string, string> = {
  'chat-model': `
    // General Chat Bit prompt
  `,
  'echo-tango-specialist': `
    // Echo Tango Specialist prompt with more specific instructions
  `,
  // Other specialist prompts...
};
```

### 5. Client Configuration

The implementation supports client-specific specialist prompts through:

- The `config_json` column in the Clients table
- A `specialistPrompts` property that maps IDs to custom prompt text
- The Brain API checking client config before falling back to default prompts

## Flow of Persona Selection

1. User selects "Chat Bit" from the dashboard:
   - `activeBitContextId` = "chat-model"
   - Router navigates to the chat interface

2. User selects "Echo Tango Bit" from the persona dropdown:
   - `activeBitPersona` = "echo-tango-specialist"
   - This selection is persisted to localStorage

3. When sending a message to the API:
   - Both `activeBitContextId` and `activeBitPersona` are included in the request
   - The Brain API prioritizes `activeBitPersona` for prompt selection

4. For prompt resolution, the API:
   - First checks for a client-specific specialist prompt matching `activeBitPersona`
   - If not found, falls back to the default specialist prompt for that persona
   - If no persona prompt exists, uses the general Bit context prompt

## Testing

The implementation has been tested with the `test-specialist-prompt.ts` script, which verifies:

1. Correct prompt selection for different bit/persona combinations
2. Null handling for unknown or missing values
3. The full API request flow simulation

## Future Enhancements

1. Support for multiple personas within each Bit
2. More granular customization of persona behavior beyond system prompts
3. UI indicators showing which persona is currently active
4. User preference persistence for preferred personas per Bit 