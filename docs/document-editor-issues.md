# Document Editor Issues & Solutions

## Overview of Issues

The document editor component is experiencing multiple critical issues:

1. **Multiple Document Creation**: Each user interaction causes duplicate documents to be created
2. **Document Retrieval Failure**: Selected documents from sidebar not properly loading
3. **Chat-Document Interaction Broken**: AI assistant unable to modify documents when requested
4. **React Lifecycle Violations**: Console errors showing "Cannot update a component while rendering a different component"
5. **Excessive Console Logging**: Numerous `[CLIENT]` messages flooding the console

## Root Causes

### 1. React Lifecycle Violations

The primary issue stems from updating state during render cycles, which violates React's rendering rules. This occurs in:

- `RichTextEditor.tsx`: State updates during ProseMirror integration
- `DocumentContext.tsx`: Updates during document streaming
- `ChatPaneContext.tsx`: Updates during message processing
- `GlobalChatPane.tsx`: Message handling during render

### 2. State Management Problems

- **Race Conditions**: Asynchronous updates causing state to be out of sync
- **Missing Mount Tracking**: Components updating state after unmounting
- **Improper Cleanup**: Pending operations not canceled on unmount

### 3. Document Streaming Issues

- **Stream Handling**: Improper application of streamed content from AI
- **Missing Safeguards**: No protection against applying invalid/incomplete updates
- **Lifecycle Problems**: Stream updates happening during render cycles

## Applied Fixes

### React Lifecycle Fixes

1. Added `requestAnimationFrame` to defer state updates:
   ```js
   requestAnimationFrame(() => {
     setDocumentState((prev) => ({
       ...prev,
       isLoading: false,
       errors: null,
     }));
   });
   ```

2. Added component mount tracking via refs:
   ```js
   const isMountedRef = useRef<boolean>(true);
   
   useEffect(() => {
     return () => {
       isMountedRef.current = false;
     };
   }, []);
   
   // Check before updating state
   if (isMountedRef.current) {
     // safe to update state
   }
   ```

3. Used `setTimeout` to split up synchronous state updates:
   ```js
   setTimeout(() => {
     if (isMountedRef.current) {
       applyStreamedUpdate(data.content, targetDocId);
     }
   }, 0);
   ```

### Document Streaming Improvements

1. Enhanced error handling for streamed content:
   ```js
   try {
     // Parse and apply streamed content
   } catch (parseError) {
     console.error('[RichTextEditor] Error parsing streamed content:', parseError);
     setTimeout(() => {
       setStreamingError(docId, `Failed to parse AI update: ${parseError instanceof Error ? parseError.message : String(parseError)}`);
     }, 0);
   }
   ```

2. Added debouncing for content changes:
   ```js
   const debouncedSave = useCallback(
     debounce((content: string) => {
       // Logic to save content
     }, 3000),
     [onSaveContent, docId, isNewDoc],
   );
   ```

### Console Log Reduction

1. Limited server action verification logging:
   ```js
   const hasLoggedServerActionCheck = useRef(false);
   
   useEffect(() => {
     if (!hasLoggedServerActionCheck.current) {
       console.log('[CLIENT] Server action check');
       hasLoggedServerActionCheck.current = true;
     }
   }, []);
   ```

## Current Setup

The document editor architecture consists of:

1. **DocumentContext**: Manages document state, loading, saving, and streaming
2. **RichTextEditor**: Handles ProseMirror integration and UI
3. **ChatPaneContext**: Manages side chat and document interactions
4. **GlobalChatPane**: Provides chat interface for document editing

## Remaining Issues

1. **Document Selection**: Need to fix document loading when selected from sidebar
2. **Chat-Document Integration**: Fix AI assistant's ability to modify documents
3. **ProseMirror Integration**: Stabilize editor state during AI updates
4. **Performance**: Reduce unnecessary rerenders and state updates

## Next Steps

1. Create a simple API endpoint to verify connectivity
2. Add proper error boundaries around document components
3. Implement a more robust streaming protocol for document updates
4. Add thorough logging for document lifecycle events
5. Improve cleanup of resources when switching documents 