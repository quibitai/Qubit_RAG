# Quibit RAG Development Checklist

This checklist tracks our progress implementing the modular, enterprise-grade RAG system with enhanced features as outlined in the development roadmap.

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

- [x] **Task 2.3: Implement Navigation from Cards**
  - [x] Make each card clickable with Next.js `<Link>` or `useRouter`
  - [x] Navigate to appropriate interface on click
  - [x] Update `ChatPaneContext` to set `selectedChatModel` based on clicked bit
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

- [x] **Task 3.5: Integrate Editor with Global Chat Context**
  - [x] Update `ChatPaneContext` when editor page mounts
  - [x] Set `selectedChatModel` to `'document-editor'`
  - [x] Store current `docId` in context
  - [x] Modify `handleSubmit` to include document context in requests
  - [x] Update system prompt generation for editor mode

- [x] **Task 3.6: Handle AI-Generated Edits in Editor**
  - [x] Ensure `updateDocument` tool streams changes correctly
  - [x] Set up frontend stream handling for content updates
  - [x] Pass content updates from stream to editor component
  - [x] Apply updates to editor using ProseMirror transactions
  - [x] Maintain user focus and cursor position during updates

## Phase 4: Testing and Refinement
- [ ] **Task 4.1: Component Testing**
  - [x] Test resizable layout components
  - [x] Test dashboard card components
  - [x] Test editor component in isolation

- [ ] **Task 4.2: Integration Testing**
  - [x] Test navigation between dashboard, editor, and other pages
  - [x] Verify chat pane functionality across navigation
  - [x] Test initiating chats with different bits
  - [x] Test editor functionality (load, edit, save)
  - [ ] Test AI-assisted edits via chat
  - [ ] Test real-time updates in editor
  - [ ] Test edge cases (empty documents, large documents, errors)

- [ ] **Task 4.3: UI/UX Refinement**
  - [x] Adjust layout and styling based on testing
  - [x] Improve loading states and user feedback
  - [x] Add responsive design tweaks for mobile/tablet
  - [ ] Optimize performance for large documents

## Current Focus (v1.3.0)
- [x] Deploy global chat pane functionality
- [x] Create basic dashboard page
- [x] Implement consistent navigation with sidebar on all pages
- [x] Define document editor bit
- [x] Implement simple editor route and component
- [x] Connect editor to chat pane for AI assistance
- [x] Implement robust document auto-save system

## Planned for v1.4.0
- [ ] Add collaboration features
- [ ] Implement document version history UI
- [ ] Add document sharing and permissions
- [ ] Enhance AI assistance for document editing
- [ ] Implement keyword extraction and tagging
- [ ] Add document thumbnails and previews
- [ ] Optimize performance and responsiveness 