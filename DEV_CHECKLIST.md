Okay, here is a detailed checklist based on the revised roadmap. You can use this to guide your AI code assistant, ensuring each specific task and verification point is addressed sequentially.

**Phase 0: Stabilize Core Functionality & Confirm Schema**
*Goal: Fix chat saving, ensure `client_id` schema is correct.*

* **Step 0.1: Fix Chat/Message Saving (`client_id` Integration)**
    * `[x]` **Auth Update:** Modify `app/(auth)/auth.ts` JWT/session callbacks to include the user's `clientId` in the token/session object returned after login/registration.
    * `[x]` **Action Update (Create Chat):** In `app/(chat)/actions.ts`, modify `createNewChatAndSaveFirstMessages` to retrieve `clientId` from the authenticated session.
    * `[x]` **Action Update (Create Chat):** Ensure `createNewChatAndSaveFirstMessages` includes the retrieved `clientId` when inserting into the `Chat` table.
    * `[x]` **Action Update (Create Chat):** Ensure `createNewChatAndSaveFirstMessages` includes the retrieved `clientId` when inserting the initial user message into the `Message_v2` table.
    * `[x]` **Action Update (Save Subsequent):** In `app/(chat)/actions.ts`, modify `saveSubsequentMessages` to retrieve `clientId` from the authenticated session.
    * `[x]` **Action Update (Save Subsequent):** Ensure `saveSubsequentMessages` includes the retrieved `clientId` when inserting subsequent user and assistant messages into the `Message_v2` table.
    * `[x]` **DB Function Update (If needed):** If actions use `lib/db/queries.ts` or `lib/db/repositories/chatRepository.ts`, update the relevant functions (`saveChat`, `saveMessages`, `createChat`, `addMessages`) to accept and use `client_id`.
    * `[ ]` **Verification:** Log in, start a new chat, send messages. Check Supabase `Chat` and `Message_v2` tables: confirm new records exist and have the correct `client_id` populated.

* **Step 0.2: Confirm/Apply Multi-Tenancy Schema**
    * `[x]` **Schema Review:** Check `lib/db/schema.ts`. Verify `client_id TEXT NOT NULL` (or appropriate type/constraints) exists in tables: `Chat`, `Message_v2`, `Document`, `Suggestion`, `Vote_v2`, `User`.
    * `[x]` **Schema Review:** Check `lib/db/schema.ts`. Verify the `Clients` table schema is defined.
    * `[x]` **Schema Correction (If needed):** Update `lib/db/schema.ts` if definitions are missing or incorrect.
    * `[x]` **Migration Generation (If needed):** Run `pnpm drizzle-kit generate`.
    * `[x]` **Migration Review (If needed):** Examine the generated SQL migration file for correctness.
    * `[x]` **Verification:** Confirm the Drizzle schema file (`lib/db/schema.ts`) accurately reflects the desired multi-tenant structure.

* **Step 0.3: Apply Migrations (if needed)**
    * `[x]` **DB Migration:** Run `pnpm db:migrate`.
    * `[x]` **Verification:** Use Supabase UI or a SQL client to inspect the database tables and confirm the `client_id` columns and `Clients` table exist as defined.

* **Commit Point 0:** _Chat saving functional, multi-tenancy schema correct & migrated._

---

**Phase 1: Implement RLS & RAG Multi-Tenancy**
*Goal: Secure client data with RLS, make RAG multi-tenant aware.*

* **Step 1.1: Implement & Test Row-Level Security (RLS)**
    * `[x]` **Enable RLS:** In Supabase, enable RLS for tables: `Chat`, `Message_v2`, `Document`, `Suggestion`, `Vote_v2`, `User`, `document_metadata`, `documents`, `document_rows`.
    * `[x]` **Create RLS Policies:** For each table above, create SELECT, INSERT, UPDATE, DELETE policies checking `client_id = (auth.jwt() ->> 'clientId')::text`. Use `WITH CHECK` for INSERT/UPDATE.
    * `[x]` **Verification (Manual/SQL):**
        * Create test users/data for at least two different `client_id`s.
        * Authenticate as User A (Client A). Run SQL queries (SELECT, INSERT, UPDATE, DELETE) - confirm only Client A data is affected/visible.
        * Authenticate as User B (Client B). Repeat SQL tests - confirm only Client B data is affected/visible.
        * Attempt cross-client operations (e.g., User A tries to SELECT/UPDATE Client B's data) - confirm failure/no results.

* **Step 1.2: Refactor Database Queries to Rely on RLS**
    * `[x]` **Code Review (`queries.ts`):** Examine functions in `lib/db/queries.ts`. Remove any `WHERE client_id = ?` clauses in SELECT, UPDATE, DELETE operations for RLS-protected tables.
    * `[x]` **Code Review (`chatRepository.ts`):** Examine methods in `lib/db/repositories/chatRepository.ts`. Remove any `WHERE client_id = ?` clauses.
    * `[x]` **Code Review (API Routes):** Check any API routes performing direct DB access. Remove any `WHERE client_id = ?` clauses.
    * `[x]` **Verification (Application):** Log in as different client users. Test application features that read/write data (viewing chat history, loading documents, editing profiles etc.). Confirm data isolation is maintained via RLS, not explicit code filters.

* **Step 1.3: Update RAG Ingestion for Multi-Tenancy**
    * `[ ]` **Schema Update (RAG Tables):** If not done in Phase 0, add `client_id` column to `document_metadata`, `documents`, `document_rows` in `lib/db/schema.ts`. Generate/apply migrations.
    * `[ ]` **Ingestion Script Update:** Modify RAG ingestion script(s) to accept or determine the correct `client_id` for the data being processed.
    * `[ ]` **Ingestion Script Update:** Ensure the script inserts the `client_id` into `document_metadata`, `documents`, and `document_rows` during ingestion.
    * `[ ]` **Verification (Data):** Ingest data for Client A and Client B. Check Supabase tables to confirm data is tagged with the correct `client_id`.
    * `[ ]` **Verification (RAG Queries):** Use the application (logged in as Client A) to perform RAG searches/queries. Confirm only Client A's RAG documents are returned/used by tools (e.g., `searchInternalKnowledgeBase`). Repeat for Client B.

* **Commit Point 1:** _RLS active & tested, queries rely on RLS, RAG process is multi-tenant._

---

**Phase 2: Refactor AI Core & Implement Robust Streaming**
*Goal: Make AI client-aware, implement stable custom streaming.*

* **Step 2.1: Standardize Orchestrator Identity & Model**
    * `[x]` **Model Mapping:** Update IDs in `lib/ai/models.ts` (`modelMapping`) for clarity (e.g., `'global-orchestrator'`).
    * `[x]` **Dashboard Models:** Ensure the orchestrator model ID is *not* in the `chatModels` array in `lib/ai/models.ts`.
    * `[x]` **LLM Initialization:** Review `initializeLLM` in `app/api/brain/route.ts`.
    * `[x]` **Ensure the orchestrator is not user-selectable in dropdown menus:**

* **Step 2.2: Make Brain API Client-Aware**
    * `[x]` **Fetch Client ID:** In `app/api/brain/route.ts`, get `clientId` from the session/JWT.
    * `[x]` **Define DB Function:** Define `getClientConfig(clientId: string)` signature in `lib/db/queries.ts`.
    * `[x]` **Implement DB Function:** Write the implementation for `getClientConfig` to query the `Clients` table based on `clientId`.
    * `[x]` **Call DB Function:** In `app/api/brain/route.ts`, call `getClientConfig`.
    * `[x]` **Prompt Construction:** Update prompt logic in `/api/brain` to combine base orchestrator prompt, specialist prompt (from `activeBitContextId`), and client-specific instructions (from `clientConfig`).
    * `[x]` **Verification:** Add temporary logging in `/api/brain` to output the final combined system prompt. Send requests with different `activeBitContextId` values and for different (test) clients. Confirm the prompt includes the correct base, specialist (if applicable), and client instructions.

* **Step 2.3: Implement Server-Side Langchain Streaming**
    * `[ ]` **Refine Handler:** Review/complete the custom streaming handler in `app/api/brain/route.ts` (`ReadableStream`, Langchain callbacks). Ensure robustness.
    * `[ ]` **Define SSE Structure:** Document and standardize the JSON structure for different SSE event types (`token`, `tool_start`, `tool_end`, `error`, `doc_update_delta`, `final_output`, `Maps` etc.).
    * `[ ]` **Implement SSE Sending:** Ensure `/api/brain` uses `controller.enqueue` to send data formatted according to the defined SSE structure.
    * `[ ]` **Tool Scoping:** Verify tool execution logic handles `clientId` correctly (implicit via RLS or explicit passing).
    * `[ ]` **Message Saving:** Confirm final assistant messages/errors are saved to DB (using logic fixed in Phase 0) within the stream completion logic.
    * `[ ]` **Verification:** Use browser dev tools (Network tab) or `curl` to inspect the `/api/brain` SSE stream. Confirm messages follow the defined structure and content streams correctly.

* **Step 2.4: Implement Frontend Stream Handling**
    * `[ ]` **Refactor Frontend:** Update `components/GlobalChatPane.tsx` (and context/hooks) to use `EventSource` instead of `useChat` for `/api/brain`.
    * `[ ]` **Implement Frontend Parsing:** Write logic to parse incoming SSE messages based on `type`.
    * `[ ]` **Implement UI Updates:** Connect parsed data to UI state updates (append text, show tool status, display errors, handle navigation events).
    * `[ ]` **Send Context:** Ensure `activeBitContextId` and `activeDocId` from context are included in the POST request payload to `/api/brain`.
    * `[ ]` **Verification:** Interact with the chat UI. Confirm responses stream smoothly, tool statuses appear, errors are displayed, and navigation triggers work.

* **Step 2.5: Cleanup Old Streaming Logic**
    * `[ ]` **Remove Vercel AI SDK:** Delete code related to `useChat`, `streamText`, `streamObject` specifically for the `/api/brain` endpoint interactions.
    * `[ ]` **Evaluate SSE Listener:** Determine if `/api/documents/[docId]/listen/route.ts` is redundant now. If yes, remove the route and related frontend code.
    * `[x]` **Remove Redundant Message Saving:** Delete redundant message saving in client-side code now that /api/brain handles message saving:
        * Remove /api/chat-actions route
        * Remove saveSubsequentMessages function
        * Modify createChatAndSaveFirstMessages to only handle chat creation
        * Update the onCompletion handler in /api/brain/route.ts to prevent duplicate message saves
        * Remove fetch calls to /api/chat-actions in Chat.tsx and GlobalChatPane.tsx

* **Commit Point 2:** _AI Core client-aware, custom streaming implemented, old logic removed._

---

**Phase 3: Implement Client Use Cases & Editor Integration**
*Goal: Validate multi-tenancy with Echo Tango, integrate editor via streaming, build Video Form Bit.*

* **Step 3.1: Configure & Test Echo Tango Client**
    * `[ ]` **DB Setup:** Add Echo Tango record to `Clients` table.
    * `[ ]` **RAG Ingestion:** Sync Echo Tango data via ingestion script, tagging with its `client_id`.
    * `[ ]` **Bit UI:** Implement/refine Echo Tango specialist Bit UI.
    * `[ ]` **Context Setting:** Ensure Bit UI sets `activeBitContextId` to `'echo-tango-specialist'`.
    * `[ ]` **Verification:** Full E2E test: Log in as Echo Tango user -> Use specialist Bit -> Perform RAG queries -> Verify results are isolated and correct. Check RLS prevents access to other client data.

* **Step 3.2: Decouple Editor & Refine Workflow**
    * `[ ]` **Remove Dashboard Link:** Delete "Document Editor" from `chatModels` in `lib/ai/models.ts`.
    * `[ ]` **Update Tool:** Modify `createDocument` tool to return the created document's ID (`new_doc_id`).
    * `[ ]` **Signal Navigation:** Update `/api/brain` to send a specific SSE message (`type: 'navigate', path: '/editor/...'`) upon successful document creation via the tool.
    * `[ ]` **Handle Navigation:** Update frontend chat handler to recognize the navigation message and perform client-side routing using `useRouter`.

* **Step 3.3: Implement Direct Editor Updates via Streaming**
    * `[ ]` **Editor Listener:** In `app/(chat)/editor/[docId]/page.tsx`, add `EventSource` logic listening to `/api/brain`.
    * `[ ]` **Filter Deltas:** Filter incoming SSE messages for `type: 'doc_update_delta'` where `data.docId` matches the current editor's `docId`.
    * `[ ]` **Emit Deltas:** Modify `onUpdateDocument` in artifact handlers (`artifacts/*/server.ts`) to emit `doc_update_delta` messages via the `dataStream`.
    * `[ ]` **Apply Deltas:** In the editor component, use ProseMirror/CodeMirror APIs to apply the received content deltas via transactions.
    * `[ ]` **Verification:** Use the `updateDocument` tool via chat while the editor page is open. Confirm changes stream directly into the editor interface without a full page reload.

* **Step 3.4: Deprecate Artifact Side Panel**
    * `[ ]` **Remove UI:** Delete components related to the old artifact side panel.
    * `[ ]` **Remove Hook:** Delete `hooks/use-artifact.ts`.

* **Step 3.5: Build Video Production Form Bit**
    * `[ ]` **Create Route/Page:** Set up `app/(chat)/bits/video-production/page.tsx`.
    * `[ ]` **Define Bit ID:** Choose and document a unique ID (e.g., `'video-production-form'`).
    * `[ ]` **Implement Form UI:** Build the form using relevant components.
    * `[ ]` **Implement State:** Manage form state appropriately.
    * `[ ]` **Implement Submission:** Add logic for final submission (e.g., calling `createDocument` tool with form data).
    * `[ ]` **Implement Navigation:** Ensure successful submission navigates to the new document editor.
    * `[ ]` **Verification:** Test the complete workflow: open the Bit, fill the form, submit, verify document creation, and confirm navigation to the editor.

* **Commit Point 3:** _Echo Tango functional & validated, Editor uses direct streaming, Video Form Bit complete._

---

**Phase 4: Final Testing, Cleanup & Documentation**
*Goal: Ensure production readiness through testing, optimization, and documentation.*

* **Step 4.1: Comprehensive Testing**
    * `[ ]` **E2E Tests:** Manually test all major user flows for different client types.
    * `[ ]` **Isolation Tests:** Design specific tests to attempt cross-client data access/modification and verify RLS blocks them.
    * `[ ]` **Edge Case Tests:** Test stream interruptions, tool errors, invalid inputs, empty states.
    * `[ ]` **Automated Tests:** Run `pnpm test`. Update/add Playwright tests for new features (multi-tenancy logins, streaming validation, new Bits). Fix all failures.

* **Step 4.2: Performance Review & Optimization**
    * `[ ]` **DB Performance:** Use `EXPLAIN ANALYZE` on key Supabase queries (especially those involving RLS or large tables). Add/optimize indexes as needed (e.g., on `client_id`).
    * `[ ]` **Frontend Performance:** Profile rendering, state updates, and stream handling in the browser. Optimize where necessary.
    * `[ ]` **Bundle Size:** Check Next.js build output. Consider code splitting or dependency analysis if sizes are excessive.

* **Step 4.3: Code Cleanup & Refinement**
    * `[ ]` **Remove Logs:** Delete all temporary `console.log` statements.
    * `[ ]` **Address TODOs:** Resolve any remaining `// TODO:` comments.
    * `[ ]` **Lint & Format:** Run `pnpm lint:fix` and `pnpm format`.
    * `[ ]` **Refactor:** Review complex code sections for potential simplification or improved clarity.

* **Step 4.4: Dependency Audit & Update**
    * `[ ]` **Audit:** Run `pnpm audit` and address reported vulnerabilities.
    * `[ ]` **Update (Optional):** Consider updating major dependencies (Next.js, Langchain, etc.) to latest stable versions and re-test thoroughly.

* **Step 4.5: Documentation Update**
    * `[ ]` **Core Docs:** Update `README.md`, `ARCHITECTURE.md` to reflect the final state.
    * `[ ]` **Guide: New Client:** Create `docs/ONBOARDING_CLIENT.md` (or similar).
    * `[ ]` **Guide: New Bit:** Create `docs/CREATING_BITS.md` (or similar).

* **Commit Point 4:** _Application stable, tested, optimized, cleaned, documented._

### Bug Fixes & Improvements

- ✅ Fix chat saving (critical)
  - ✅ Add clientId column to schema  
  - ✅ Update auth session to include clientId
  - ✅ Update chat actions to include clientId
  - ✅ Apply migration to database
  - ✅ Implement deleteChat server action to fix 404 error when deleting chats

### Phase 2: Refactor AI Core & Implement Robust Streaming

- ✅ Step 2.1: Standardize Orchestrator Identity & Model
  - ✅ Update modelMapping in lib/ai/models.ts to use 'global-orchestrator' instead of 'chat-model-reasoning'
  - ✅ Update languageModels in lib/ai/providers.ts to use the new ID
  - ✅ Update systemPrompt function in lib/ai/prompts.ts to check for 'global-orchestrator'
  - ✅ Update components referencing the old ID (GlobalChatPane, chat-header, etc.)
  - ✅ Ensure the orchestrator is not user-selectable in dropdown menus
  
- ✅ Step 2.2: Make Brain API Client-Aware
  - ✅ Updated schema to add customInstructions and enabledBits to Clients table
  - ✅ Created getClientConfig function in queries.ts to fetch client configuration
  - ✅ Added getSpecialistPrompt to prompts.ts to get specialist-specific instructions
  - ✅ Updated brain API to combine base prompt with specialist and client-specific instructions
  - ✅ Added logging to verify correct prompt construction

### Features

// ... rest of file unchanged ...