# Date/Time Context Guide

## Overview

This guide ensures that ALL AI assistants, specialists, and features in the Quibit system have access to accurate, current date and time information. This is critical for providing accurate responses to time-sensitive queries.

## System Architecture

### Automatic Date/Time Injection

The Quibit system automatically injects current date/time context into ALL AI prompts through a centralized mechanism:

1. **Brain API** (`app/api/brain/route.ts`): Formats current date/time using Luxon with user timezone support
2. **Prompt Loader** (`lib/ai/prompts/loader.ts`): Passes date/time to all prompt composition functions
3. **Prompt Composers**: Automatically inject date/time into final system prompts

### Coverage

✅ **Orchestrator**: Gets date/time via `{current_date_time}` placeholder replacement  
✅ **All Specialists**: Get date/time automatically appended by `composeSpecialistPrompt()`  
✅ **Chat Model**: Gets date/time via specialist composition  
✅ **Default Assistant**: Gets date/time via specialist composition  
✅ **Future Specialists**: Will automatically inherit date/time context  

## Implementation Details

### For Orchestrator Prompts

The orchestrator prompt template includes:
```
Current date and time: {current_date_time}
```

This placeholder is replaced in `getOrchestratorPrompt()` function.

### For Specialist Prompts

All specialist prompts automatically get date/time context appended:
```
Current date and time: [formatted datetime]
```

This is handled by the `composeSpecialistPrompt()` function in `lib/ai/prompts/core/base.ts`.

### Date/Time Formatting

The system uses Luxon for robust date/time handling:
- Respects user timezone (falls back to UTC if invalid)
- Formats as: "May 10, 2025 6:04 PM (America/New_York)"
- Provides both human-readable and ISO formats

## Developer Guidelines

### Creating New Specialists

When creating new specialists:

1. **DO NOT** include date/time placeholders in your persona text
2. **DO NOT** manually add current date/time to prompts
3. **RELY** on the automatic injection system
4. **TEST** time-sensitive queries to ensure accuracy

### Creating New AI Features

For any new AI-powered features:

1. **USE** the existing prompt composition functions
2. **PASS** `currentDateTime` parameter through the chain
3. **ENSURE** your feature inherits from the base prompt system
4. **DOCUMENT** any custom time handling requirements

### Modifying Existing Components

When modifying AI components:

1. **PRESERVE** the `currentDateTime` parameter flow
2. **DO NOT** remove date/time injection mechanisms
3. **TEST** time accuracy after changes
4. **UPDATE** this documentation if changing the architecture

## Testing Date/Time Accuracy

### Manual Testing

Test these queries with each AI context:
- "What time is it?"
- "What's today's date?"
- "What day of the week is it?"
- "What time zone am I in?"

### Automated Testing

The test suite includes date/time injection verification:
- `tests/prompts/loader.test.ts`: Verifies prompt composition
- `tests/prompts/orchestrator.test.ts`: Verifies orchestrator date/time injection

## Troubleshooting

### Common Issues

1. **Specialist not getting date/time**: Check that `composeSpecialistPrompt()` is being called with `currentDateTime` parameter
2. **Wrong timezone**: Verify `userTimezone` is being passed correctly from client
3. **Outdated time**: Ensure fresh `DateTime.now()` is being used, not cached values

### Debugging

Enable debug logging to trace date/time flow:
```typescript
console.log(`[DateTime] Current time: ${currentDateTime}`);
```

## Future Considerations

### Timezone Improvements

- Consider storing user timezone preferences
- Add timezone detection from browser
- Support for multiple timezone displays

### Performance Optimizations

- Cache formatted date/time for request duration
- Optimize Luxon usage for high-frequency requests

### Enhanced Context

- Add relative time context ("It's currently morning/afternoon/evening")
- Include business hours context
- Add calendar context integration

## Maintenance

This system should be reviewed:
- When adding new AI contexts or specialists
- When modifying the prompt loading system
- When upgrading Luxon or date/time dependencies
- Quarterly to ensure continued accuracy

## Contact

For questions about date/time context implementation, consult:
- This documentation
- The prompt system architecture guide
- The development team lead 