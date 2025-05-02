# Debugging the Document Editor

This guide outlines tools and procedures for debugging and fixing issues with the document editor.

## Common Issues

1. **Multiple Document Creation**: Each user interaction causes duplicate documents to be created
2. **Document Retrieval Failure**: Selected documents from sidebar not properly loading
3. **Chat-Document Interaction Broken**: AI assistant unable to modify documents when requested
4. **React Lifecycle Violations**: Console errors about updating components during render
5. **Excessive Console Logging**: Numerous `[CLIENT]` messages flooding the console

## Debug Tools

### 1. Debug Panel

The document editor includes a debug panel that can be activated in two ways:

1. Add `?debug=true` to the URL of any document editor page:
   ```
   https://your-app-url.com/editor/document-id?debug=true
   ```

2. The panel is automatically enabled in development environment

The debug panel provides:
- API connectivity testing
- Document streaming test functions
- Event monitoring for document update events
- Debug logs for troubleshooting

### 2. API Test Endpoints

Two helpful API endpoints are available for testing:

#### Ping Endpoint
```
GET /api/ping
```
Returns a simple response to verify API connectivity:
```json
{
  "ok": true,
  "timestamp": "2023-06-15T12:34:56.789Z",
  "message": "Server is operational"
}
```

#### Document Stream Test Endpoint
```
POST /api/documents/stream-test
```
Request body:
```json
{
  "documentId": "your-document-id",
  "testType": "simple-update",
  "testContent": "This is a test update"
}
```

Available test types:
- `simple-update`: Sends a text update
- `clear-document`: Simulates clearing the document
- `finish-update`: Simulates a completion event

### 3. Utility Functions

Several debugging utilities are available in `utils/test-document-functionality.ts`:

```typescript
// Test API connectivity
const result = await testAPIConnectivity();

// Test document streaming
const streamResult = await testDocumentStreaming(documentId);

// Check if element is mounted
const isMounted = isElementMounted('editor-container');

// Log component lifecycle events
logComponentLifecycle('DocumentEditor', 'mount', { docId: '123' });

// Verify content synchronization
const syncResult = verifyContentSync(editorContent, databaseContent);

// Monitor document updates
const cleanup = monitorDocumentUpdates((data) => {
  console.log('Document update received:', data);
});
// Later: cleanup(); // Remove event listener
```

## Troubleshooting Steps

### For React Lifecycle Violations

1. Check browser console for errors like:
   ```
   Cannot update a component (`ForwardRef`) while rendering a different component (`ForwardRef`)
   ```

2. Use React DevTools to identify which components are updating during render

3. Fix by deferring state updates:
   ```js
   // BAD:
   setMyState(newValue);

   // GOOD:
   requestAnimationFrame(() => {
     if (isMountedRef.current) {
       setMyState(newValue);
     }
   });
   ```

### For Multiple Document Creation

1. Enable debugging panel with `?debug=true`
2. Check network tab for duplicate POST requests to `/api/documents`
3. Use console logging to track document creation flow

### For Document Retrieval Issues

1. Test API connectivity with the ping endpoint
2. Check browser console for network errors
3. Verify document IDs match between UI and database
4. Check permissions and access controls

### For Chat Integration Issues

1. Use the debug panel to monitor document events
2. Test document streaming with the test endpoint
3. Check event listeners and handlers

## Applying Fixes

For more details on the fixes we've already applied and other best practices, see: 
- `docs/document-editor-issues.md` 