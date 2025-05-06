# Development Checklist: Quibit RAG

**Overall Goal:** Stabilize message persistence, ensure robust multi-tenancy, correctly implement the new streaming architecture, and then expand features before final testing and documentation.

---

**Phase 1: Critical Bug Fixes & Core System Stabilization**

* **Goal:** Resolve the duplicate message bug and ensure all foundational multi-tenancy schema and `client_id` integrations are correct and verified.

    * **[ ] Step 1.1: Eliminate Duplicate Message Persistence**
        * **[ ] Sub-Step 1.1.1: Resolve Double Agent Execution in Brain API**
            * **Action:** Refactor `app/api/brain/route.ts`: Ensure `agentExecutor.stream` is invoked only ONCE per user request.
            * **Action:** Ensure the single stream result is used for both SSE data transmission AND triggers the `onCompletion` handler (for saving assistant messages) exactly once.
            * **Verification:** Add distinct logging to confirm single `agentExecutor.stream` invocation and single `onCompletion` trigger. Test chat; verify assistant messages are no longer duplicated in the database.
        * **[ ] Sub-Step 1.1.2: Consolidate User Message Saving Logic**
            * **Action:** Designate `app/api/brain/route.ts` (the `// --- BEGIN USER MESSAGE SAVE ---` block) as the SOLE point for saving the *initial user message* in a new chat.
            * **Action:** Modify `app/(chat)/actions.ts` -> `createChatAndSaveFirstMessages`: Remove its logic for inserting the user message into `Message_v2`. This function should now ONLY handle chat metadata creation.
            * **Verification:** Create new chats. Verify the first user message appears only once in `Message_v2`, saved by the Brain API.
        * **[ ] Sub-Step 1.1.3: Decommission/Neutralize Redundant Message Saving Pathways**
            * **Action:** Evaluate `app/api/chat-actions/route.ts`. Remove if possible, or ensure its message-saving capabilities are inert (log only, no DB write).
            * **Action:** Remove `saveSubsequentMessages` function from `app/(chat)/actions.ts`.
            * **Action:** Audit frontend components (`Chat.tsx`, `GlobalChatPane.tsx`) to remove `Workspace` calls to `/api/chat-actions` or invocations of redundant server actions for message saving.
            * **Verification:** Confirm messages are saved correctly (and singly) *only* through `app/api/brain/route.ts`.

    * **[ ] Step 1.2: Final Verification of `client_id` Integration & Multi-Tenancy Schema**
        * **Action:** Confirm `clientId` from auth session is correctly used in `app/api/brain/route.ts` for all message/chat creations.
        * **Action:** Re-verify schema in `lib/db/schema.ts` and live DB for correct `client_id` setup (NOT NULL, FKs) in all relevant tables (`User`, `Chat`, `Message_v2`, `Document`, `Suggestion`, `Vote_v2`) and `Clients` table correctness.
        * **Action:** Perform your checklist's "Step 0.1 -> Verification": Log in with users from different clients, send messages, check `Chat` & `Message_v2` tables for correct `client_id` and no duplicates.

    * **[ ] Commit Point 1 (Stabilization):** Duplicate message bug fixed. Core message saving is robust and centralized in Brain API. `client_id` integration verified. Multi-tenancy schema confirmed.

---

**Phase 2: Implement Multi-Tenant Echo Tango**
*Goal: Secure proper data segregation, ensure Brain API client-awareness, implement stable stream handling.*

* **Commit Point 1: ✅ Schema & Base Auth Updates**

* **Step 2.1: Build Client-Aware Streaming Pipeline (✅ COMPLETED)**
    * `[x]` **Action:** Ensure all database interactions use clientId from session.
    * `[x]` **Action:** Update Brain API route to save assistant messages with client_id.
    * `[x]` **Action:** Implement authentication with client-awareness in `auth.ts`.
    * `[x]` **Action:** Ensure Brain context API uses client_id filter for specialistPrompts from Clients table.
    * `[x]` **Verification:** Manual tests to confirm Brain API includes client_id in all requests.

* **Step 2.2: Fix Streaming and Message Persistence (✅ COMPLETED)**
    * `[x]` **Fix Brain API:** Eliminate double `agentExecutor.stream` call in `app/api/brain/route.ts`.
    * `[x]` **Remove Legacy Save Pathways:** Delete redundant API routes in `app/api/chat-actions/route.ts`.
    * `[x]` **Action:** Remove `saveSubsequentMessages` function from `app/(chat)/actions.ts`.
    * `[x]` **Update Components:** Remove references from `GlobalChatPane.tsx`, `Chat.tsx`, and `ChatPaneContext.tsx`.
    * `[x]` **Verification:** Confirm messages are saved once by checking console logs: "[Brain API] SINGLE AGENT EXECUTION STARTING" appears once per request; "[Brain API] ON_COMPLETION_HANDLER TRIGGERED" appears once per completion.

* **Step 2.3: Verify & Finalize Row-Level Security (RLS)**
    * **Action:** Ensure RLS policies (checking `client_id`) are active and correctly implemented in Supabase for ALL client-data tables, including RAG tables (`document_metadata`, `documents`, `document_rows`).
    * **Action:** Confirm DB queries in `lib/db/queries.ts`, `lib/db/repositories/chatRepository.ts`, and AI tools (`lib/ai/tools/*`) rely on RLS for client data filtering and do not contain redundant `WHERE client_id` clauses for RLS-protected operations.
    * **Verification:** Rigorous manual/SQL testing for data isolation with different client users.

* **Step 2.4: Complete Multi-Tenant RAG Ingestion & Schema**
    * **Action (Schema):** If RAG tables (`document_metadata`, `documents`, `document_rows`) are Drizzle-managed, define them in `lib/db/schema.ts` with `client_id` columns. Generate/apply migrations.
    * **Action (Ingestion):** Update RAG ingestion scripts to tag all ingested data with the correct `client_id`.
    * **Verification:** Ingest data for different clients. Verify `client_id` in RAG tables. Test RAG queries (e.g., `searchInternalKnowledgeBase` tool) as different clients to confirm data isolation.

    * **[ ] Commit Point 2 (Multi-Tenancy Complete):** RLS active and verified for all client-specific data. RAG ingestion is multi-tenant. Queries correctly leverage RLS.

---

**Phase 3: Finalize AI Core & Streaming Implementation**

* **Goal:** Fully implement and test the custom server-side and client-side streaming architecture, making the AI client/context-aware.

    * **[ ] Step 3.1: Confirm Brain API Client & Context Awareness**
        * **Verification:** Review that `global-orchestrator` uses the correct model and is not user-selectable. Confirm `getClientConfig` output correctly influences the final system prompt in `app/api/brain/route.ts`.

    * **[ ] Step 3.2: Robust Server-Side Custom Streaming (Brain API)**
        * **Action (Refine Handler):** Ensure custom streaming handler in `app/api/brain/route.ts` is robust, handles errors gracefully, and manages stream lifecycle correctly.
        * **Action (SSE Structure):** Finalize, document, and consistently implement the JSON structure for all SSE event types.
        * **Action (Tool Scoping & Message Saving):** Confirm tool execution respects `client_id` (via RLS or explicit passing). Confirm final assistant messages/errors are reliably saved *once*.
        * **Verification:** Inspect `/api/brain` SSE stream (dev tools, curl) for correct structure and content flow.

    * **[ ] Step 3.3: Implement Frontend Custom Stream Handling**
        * **Action (Refactor Frontend):** Update `components/GlobalChatPane.tsx` (and context/hooks) to use `EventSource` for `/api/brain` interactions.
        * **Action (Parse SSE):** Implement client-side parsing for incoming SSE messages.
        * **Action (UI Updates):** Connect parsed data to UI state updates (text appending, tool status, errors, navigation).
        * **Action (Context Sending):** Ensure `activeBitContextId`, `activeBitPersona`, `activeDocId` are included in POST requests to `/api/brain`.
        * **Verification:** Test chat UI for smooth streaming, correct status displays, navigation, and error handling.

    * **[ ] Step 3.4: Deprecate/Cleanup Old Logic (Final Pass)**
        * **Action (Vercel AI SDK for Brain):** Remove `useChat`, `streamText`, `streamObject` if no longer used for `/api/brain` interactions. (Note: May still be used for artifact streaming).
        * **Action (Document SSE Listener):** Evaluate if `/api/documents/[docId]/listen/route.ts` is redundant if `/api/brain` now handles `doc_update_delta` events for direct editor updates.
        * **Action (Redundant Message Saving):** Confirm fixes from Phase 1 (Step 1.1.3) are complete.

    * **[ ] Commit Point 3 (Streaming Refactor Complete):** AI Core fully client/context-aware. Custom SSE streaming for Brain API is standard. Old/redundant logic verifiably decommissioned or correctly isolated.

---

**Phase 4: Client Use Cases, Editor Integration & New Bits**

* **Goal:** Validate system with Echo Tango client, integrate document editor with direct streaming, build Video Production Form Bit.

    * **[ ] Step 4.1: Configure & Test Echo Tango Client Use Case**
        * **Action (DB Setup):** Configure Echo Tango client in `Clients` table (ID, name, `customInstructions`, `config_json`).
        * **Action (RAG Ingestion):** Sync Echo Tango specific data with its `client_id`.
        * **Action (Bit UI & Context):** Implement/refine Echo Tango specialist Bit UI, ensuring correct `activeBitContextId`/`activeBitPersona` setting.
        * **Verification:** Full E2E test for Echo Tango user (login, RAG queries, specialist chat, data isolation, prompt verification).

    * **[ ] Step 4.2: Implement Direct Editor Updates via Streaming & Decouple Workflow**
        * **Action (Editor Workflow):**
            * Remove "Document Editor" from user-selectable `chatModels` if contextual access is preferred.
            * Modify `createDocument` tool to return the created document's ID.
            * Update `/api/brain` to send a specific SSE message (e.g., `type: 'navigate', data: { path: '/editor/[docId]' }`) on document creation.
            * Implement frontend logic to handle this navigation event.
        * **Action (Direct Editor Updates):**
            * In editor page/component, add `EventSource` to listen to `/api/brain` stream for `doc_update_delta` events matching current `docId`.
            * Ensure artifact handlers (e.g., `artifacts/text/server.ts -> onUpdateDocument`) emit `doc_update_delta` SSEs via the `dataStream` from `/api/brain`.
            * Apply received content deltas to the editor instance (ProseMirror/CodeMirror).
        * **Verification:** Use `updateDocument` tool via chat with editor open; confirm changes stream directly. Test document creation and navigation.

    * **[ ] Step 4.3: Deprecate Old Artifact Side Panel (If Applicable)**
        * **Action:** If old artifact side panel UI and `hooks/use-artifact.ts` are superseded, remove them.

    * **[ ] Step 4.4: Build Video Production Form Bit**
        * **Action:** Create UI route (e.g., `app/(chat)/bits/video-production/page.tsx`). Define Bit ID.
        * **Action:** Implement form UI and state management.
        * **Action:** Implement submission logic (e.g., using `createDocument` tool), followed by navigation.
        * **Verification:** Test complete workflow: open Bit, fill form, submit, verify document creation, confirm navigation.

    * **[ ] Commit Point 4 (Feature Implementation):** Echo Tango validated. Editor uses direct streaming. Video Production Form Bit functional.

---

**Phase 5: Final Testing, Optimization, Cleanup & Documentation**

* **Goal:** Ensure production-readiness through exhaustive testing, performance tuning, code refinement, and comprehensive documentation.

    * **[ ] Step 5.1: Comprehensive Testing**
        * **Action:** E2E testing for all major user flows, multi-client data isolation, stream interruptions, tool errors, invalid inputs, empty states.
        * **Action:** Run and update Playwright tests (`pnpm test`). Fix all failures.

    * **[ ] Step 5.2: Performance Review & Optimization**
        * **Action:** Analyze DB query performance (RLS, large tables) with `EXPLAIN ANALYZE`. Optimize indexes.
        * **Action:** Profile frontend rendering, state updates, stream handling. Optimize as needed.
        * **Action:** Check Next.js build output for bundle sizes.

    * **[ ] Step 5.3: Code Cleanup & Refinement**
        * **Action:** Remove temporary logs. Address TODOs.
        * **Action:** Lint & format (`pnpm lint:fix`, `pnpm format`).
        * **Action:** Review/refactor complex code sections for clarity and maintainability.

    * **[ ] Step 5.4: Dependency Audit & Update**
        * **Action:** Run `pnpm audit`; address vulnerabilities.
        * **Action:** Consider updating key dependencies (Next.js, Langchain, etc.) and re-test.

    * **[ ] Step 5.5: Documentation Update**
        * **Action:** Revise `README.md`, `ARCHITECTURE.md`, `docs/` to reflect final architecture.
        * **Action:** Create guides: "Onboarding a New Client", "Creating New Bits".

    * **[ ] Final Commit Point (Production Ready):** Application stable, performant, secure, tested, documented.