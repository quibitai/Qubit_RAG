# Quibit RAG Development Checklist

This checklist tracks our progress implementing the modular, enterprise-grade RAG system with enhanced features as outlined in the development roadmap.

## Phase 0: Configuration & Context Refinement
- [x] **Task 0.1: Update Model Definitions & Mapping**
  - [x] Update model mappings in `lib/ai/models.ts`
    - [x] Ensure `'chat-model'` maps to `'gpt-4.1-mini'`
    - [x] Ensure `'chat-model-reasoning'` maps to `'gpt-4.1'` (consider renaming to `'quibit-orchestrator'`)
    - [x] Ensure `'document-editor'` maps to `'gpt-4.1'`
    - [x] Review default model mapping
  - [x] Update `chatModels` array
    - [x] Verify "Chat Bit" and "Document Editor" definitions
    - [x] Remove or comment out the "Quibit" entry to hide it from dashboard

- [ ] **Task 0.2: Refine System Prompts & Context Handling**
  - [ ] Enhance `orchestratorSystemPrompt` in `lib/ai/prompts.ts`
  - [ ] Modify prompt selection logic to ensure Quibit panel uses `orchestratorSystemPrompt`
  - [ ] Define context passing mechanism (`activeBitContextId`, `activeDocId`) from client to API

- [x] **Task 0.3: Update Global Context Management**
  - [x] Add context state variables in `context/ChatPaneContext.tsx`:
    - [x] `activeBitContextId: string | null`
    - [x] `activeDocId: string | null`
  - [x] Update card click handlers to set `activeBitContextId`
  - [x] Modify `handleSubmit` function to:
    - [x] Always identify requests as coming from Quibit
    - [x] Include current context variables in API requests

- [x] **Task 0.4: Modify Brain API for Context Injection**
  - [x] Update `/api/brain/route.ts` to initialize with Quibit model
  - [x] Ensure consistent use of `orchestratorSystemPrompt`
  - [x] Extract and use context information from requests
  - [x] Inject context into input for LangChain agent
  - [x] Fix template parsing error by escaping literal curly braces in `orchestratorSystemPrompt`
  - [x] Fix missing input variable error in LangChain agent prompt template
  - [x] Fix variable name collision between request messages and prompt template messages
  - [x] Test agent with empty tools array to isolate source of input variable error
  - [ ] Fix missing input variables error related to Google Calendar tool (summary, startDateTime, endDateTime)

## Phase 1: Implement Global Collapsible/Resizable Chat Pane
- [x] **Task 1.1: Modify Root Layout for Resizable Panels**
  - [x] Import components from `react-resizable-panels`
  - [x] Wrap main content and chat pane in `<ResizablePanelGroup direction="horizontal">`
  - [x] Define two `<ResizablePanel>` instances with appropriate sizes
  - [x] Add `<ResizableHandle withHandle />` between panels
  - [x] Configure right panel with collapsible behavior and size constraints

- [x] **Task 1.2: Create Reusable Chat Component**
  - [x] Create `components/GlobalChatPane.tsx`
  - [x] Refactor existing chat UI elements from chat pages
  - [x] Move core chat interface logic and JSX into the component

- [x] **Task 1.3: Set Up Global Chat State Management**
  - [x] Create `context/ChatPaneContext.tsx`
  - [x] Initialize the `useChat` hook from `@ai-sdk/react` in the context provider
  - [x] Expose chat properties and functions via context
  - [x] Add state for pane visibility management
  - [x] Wrap application with the `ChatPaneProvider`

- [x] **Task 1.4: Integrate Chat Pane into Layout**
  - [x] Render `<GlobalChatPane />` inside the right-hand `<ResizablePanel>`
  - [x] Ensure component consumes `ChatPaneContext`
  - [x] Add UI controls to toggle the pane visibility

- [x] **Task 1.5: Styling and Testing**
  - [x] Adjust styles for clean layout and functionality
  - [x] Test resizing, collapsing, and expanding the chat pane
  - [x] Verify chat history and pane state persistence across navigation

## Phase 2: Create User Dashboard Page
- [x] **Task 2.1: Create Dashboard Route**
  - [x] Set up directory `app/(chat)/dashboard/`
  - [x] Create basic page component structure in `app/(chat)/dashboard/page.tsx`
  - [x] Ensure dashboard uses the same sidebar layout as chat pages

- [x] **Task 2.2: Fetch and Display Bit Information**
  - [x] Import and use `chatModels` array from `lib/ai/models.ts`
  - [x] Create cards for each bit using Shadcn UI
  - [x] Display bit name and description on cards
  - [x] Prepare for future API integration for user permissions

- [ ] **Task 2.3: Implement Context Setting from Cards**
  - [x] Make each card clickable with Next.js `<Link>` or `useRouter`
  - [x] Navigate to appropriate interface on click
  - [ ] Update to set `activeBitContextId` instead of `selectedChatModel`
  - [x] Clear current messages for fresh chat experience

- [x] **Task 2.4: Implement Consistent Navigation**
  - [x] Add dashboard link in sidebar for global access
  - [x] Style active state for dashboard navigation
  - [x] Move dashboard to `app/(chat)/dashboard` to use the chat layout with sidebar
  - [x] Ensure redirect from old dashboard path to new location

## Phase 3: Create Rich Document Editor Bit
- [x] **Task 3.1: Define "Document Editor" Bit**
  - [x] Add new "Document Editor" entry to `chatModels` array in `lib/ai/models.ts`
  - [x] Configure appropriate LLM mapping if needed

- [x] **Task 3.2: Create Editor Route and Component**
  - [x] Set up dynamic route at `app/(chat)/editor/[docId]/page.tsx`
  - [x] Implement `RichTextEditor` component using ProseMirror
  - [x] Configure editor with schema from `lib/editor/config.ts`
  - [x] Add props for content handling and save callback

- [x] **Task 3.3: Implement Document Data Flow**
  - [x] Use `docId` parameter to fetch document in page component
  - [x] Pass fetched content to `<RichTextEditor>` component
  - [x] Implement saving mechanism (debounced and manual)
  - [x] Connect to server action or API route for persistence
  - [x] Create versioning for document edits

- [x] **Task 3.4: Implement Robust Auto-Save System**
  - [x] Create DocumentState interface for tracking document versions
  - [x] Implement save queue with proper sequencing
  - [x] Create separate paths for auto-save vs. manual save
  - [x] Add progressive debounce based on typing frequency
  - [x] Implement specialized title-only save endpoint
  - [x] Add local storage backup for recovery
  - [x] Add visual indicators for save status (saving, saved, failed, conflict)

- [ ] **Task 3.5: Integrate Editor with Global Chat Context**
  - [x] Update `ChatPaneContext` when editor page mounts
  - [ ] Update to set `activeBitContextId` to `'document-editor'` and `activeDocId` to `params.docId`
  - [x] Modify `handleSubmit` to include document context in requests
  - [x] Update system prompt generation for editor mode

- [x] **Task 3.6: Handle AI-Generated Edits in Editor**
  - [x] Ensure `updateDocument` tool streams changes correctly
  - [x] Set up frontend stream handling for content updates
  - [x] Pass content updates from stream to editor component
  - [x] Apply updates to editor using ProseMirror transactions
  - [x] Maintain user focus and cursor position during updates

## Phase 4: Testing and Refinement
- [ ] **Task 4.1: Configuration Testing**
  - [ ] Verify correct model mapping (`chat-model` → mini, Quibit → 4.1, `document-editor` → 4o)
  - [ ] Confirm Quibit panel consistently uses `gpt-4.1` & `orchestratorSystemPrompt`
  - [ ] Test `activeBitContextId`/`activeDocId` passing to `/api/brain`
  - [ ] Verify fixed template parsing with escaped curly braces in examples works correctly

- [ ] **Task 4.2: Integration Testing**
  - [x] Test navigation between dashboard, editor, and other pages
  - [x] Verify chat pane functionality across navigation
  - [ ] Test context switching (selecting different Bits)
  - [x] Test editor functionality (load, edit, save)
  - [ ] Test document versioning (multiple edits creating new versions)
  - [ ] Test Quibit contextual interactions:
    - [ ] With Chat Bit context active
    - [ ] With Document Editor context active
  - [ ] Test edge cases (empty documents, large documents, errors)

- [ ] **Task 4.3: UI/UX Refinement**
  - [x] Adjust layout and styling based on testing
  - [x] Improve loading states and user feedback
  - [x] Add responsive design tweaks for mobile/tablet
  - [ ] Optimize performance for large documents

## Current Focus (v1.5.5)
- [x] Implement Quibit as central orchestrator architecture 
- [x] Complete Phase 0 configuration and context refinement
- [x] Update context management to use `activeBitContextId` and `activeDocId`
- [x] Enhance brain API to use context information from requests
- [ ] Test Quibit's context-aware assistance capabilities

## Planned for v1.6.0
- [ ] Add collaboration features
- [ ] Implement document version history UI
- [ ] Add document sharing and permissions
- [ ] Enhance AI assistance for document editing
- [ ] Implement keyword extraction and tagging
- [ ] Add document thumbnails and previews
- [ ] Optimize performance and responsiveness 