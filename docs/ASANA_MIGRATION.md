# Asana Tool Migration Guide (v2.1.0)

## Overview

This document outlines the migration of Asana integration from n8n-based implementation to a native tool implementation in v2.1.0.

## Migration Status

The migration is currently in progress, with both implementations available during the transition period:
- Legacy n8n implementation (via MCP)
- New native implementation (`lib/ai/tools/asanaTool.ts`)

## New Implementation

### Location
- Main tool implementation: `lib/ai/tools/asanaTool.ts`
- Testing scripts: `scripts/` directory
  - `direct-asana-fetch.js`: Direct API testing
  - `test-asana-tool.js`: Tool integration testing
  - `test-direct-asana.js`: End-to-end testing
  - `debug-asana-direct.sh`: Debugging script

### Features
- Direct Asana API integration
- Improved error handling
- Better type safety
- Enhanced logging
- Comprehensive testing suite

### Configuration
The tool uses the following environment variables:
- `ASANA_WEBHOOK_URL`: Base URL for Asana API
- `ASANA_AUTH_TOKEN`: Authentication token
- `ASANA_AUTH_HEADER`: Optional custom auth header

## Testing

### Running Tests
1. Direct API testing:
   ```bash
   node scripts/direct-asana-fetch.js
   ```

2. Tool integration testing:
   ```bash
   node scripts/test-asana-tool.js
   ```

3. End-to-end testing:
   ```bash
   node scripts/test-direct-asana.js
   ```

### Debugging
Use the debug script for detailed logging:
```bash
./debug-asana-direct.sh
```

## Migration Timeline

### Phase 1 (v2.1.0) - Current
- [x] Implement native Asana tool
- [x] Add testing infrastructure
- [x] Maintain backward compatibility
- [ ] Complete test coverage

### Phase 2 (Future)
- [ ] Remove n8n implementation
- [ ] Update all documentation
- [ ] Clean up legacy code
- [ ] Finalize migration

## Best Practices

1. **Testing**
   - Always run the test suite before deploying changes
   - Use the debug script for troubleshooting
   - Verify both implementations during transition

2. **Error Handling**
   - Use the new error handling system
   - Log all errors with appropriate context
   - Implement proper fallbacks

3. **Configuration**
   - Keep sensitive data in environment variables
   - Document all configuration options
   - Use type-safe configuration

## References

- [Asana API Documentation](https://developers.asana.com/docs)
- [Tool Implementation Guide](../docs/TOOL_IMPLEMENTATION.md)
- [Testing Guidelines](../docs/TESTING.md)

## Support

For issues or questions during the migration:
1. Check the test output and logs
2. Review the Asana API documentation
3. Contact the development team 