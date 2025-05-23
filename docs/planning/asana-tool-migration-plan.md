**Epic 2.5: Implement Task Details Retrieval**

  * **Story 2.5.1:** Add "Get Task Details" functionality.
      * **Task 2.5.1.1 (C):** Define `GET_TASK_DETAILS` intent. Entity extractor should look for task GIDs (from URLs) or task name + project name.
      * **Task 2.5.1.2 (C):** In `tasks.ts`, add `getTaskDetails(taskGid, opt_fields)`.
      * **Task 2.5.1.2a (C, Enhancement):** Enhance the `TaskResponseData` interface in `lib/ai/tools/asana/api-client/operations/tasks.ts`. Make it more comprehensive to include more fields available from the Asana Task object that can be fetched by default (e.g., `html_notes`, `resource_subtype`, `num_subtasks`, `due_at`, `start_on`, `start_at`, `workspace.name`, `assignee.resource_type`, `parent.resource_type`, `parent.permalink_url`, `followers.resource_type`, `tags.resource_type`, `projects.resource_type`).
          *   *Rationale:* The Asana API ([Tasks - Asana API Reference](https://developers.asana.com/reference/tasks)) provides a rich task object. Capturing more of these fields in our type definition will make the tool more capable.
      * **Task 2.5.1.2b (C, Refinement):** Review and expand the `default_opt_fields` list within the `getTaskDetails` function in `lib/ai/tools/asana/api-client/operations/tasks.ts`. Include more high-value fields based on the Asana Task API documentation and the enhanced `TaskResponseData` from Task 2.5.1.2a. For example:
          *   `num_subtasks` (very useful for context)
          *   `due_at` (for tasks with specific times, complementing `due_on`)
          *   `start_on`, `start_at`
          *   `resource_subtype` (e.g., 'default_task', 'milestone')
          *   `workspace.name` (for better context in responses)
          *   Ensure sub-object fields like `assignee.email`, `parent.permalink_url` are included if not already.
          *   *Rationale:* Fetching a more comprehensive set of default fields will reduce the need for follow-up calls or more complex `opt_fields` management from the LLM in many common scenarios. Balance detail with response size.
      * **Task 2.5.1.3 (C):** Add `findTaskGidByName(taskName, projectGid?, workspaceGid?)` to `tasks.ts`.
          * If `projectGid` is provided, search within that project (`GET /projects/{project_gid}/tasks`).
          * If not, use typeahead (`GET /workspaces/{workspace_gid}/typeahead` with `resource_type=task`).
          * Implement ambiguity handling similar to project GID lookup.
      * **Task 2.5.1.4 (C):** Integrate into `asanaTool.ts`.
      * **Task 2.5.1.5 (C, UX):** Implement/Enhance `formatTaskDetails` in `lib/ai/tools/asana/formatters/responseFormatter.ts`.
      * **Task 2.5.1.5a (C, UX, Enhancement):** Ensure `formatTaskDetails` can gracefully display the newly available fields from the enhanced `TaskResponseData` (from Task 2.5.1.2a) and the expanded `default_opt_fields` (from Task 2.5.1.2b). This includes fields like:
            *   Number of subtasks
            *   Followers (names)
            *   Tags (names)
            *   Due date and time (if `due_at` is present)
            *   Start date and time (if `start_on` or `start_at` are present)
            *   Task type (`resource_subtype`)
            *   Workspace name
            *   Clear link to parent task, if applicable.
          *   *Rationale:* A more informative formatted response improves the user experience and provides more context directly.
      * **Task 2.5.1.6 (T):** Test task detail retrieval by GID and by name.

**Epic 2.6: Implement Task Update (Description)**

  * **Contextual Note (No Action Required):** This Epic implements the *first concrete update functionality* for the broader `UPDATE_TASK` intent (defined in `AsanaOperationType.UPDATE_TASK` and `ParsedUpdateTaskIntent`). This specific epic focuses on updating the task's `notes` field. Future epics (like 3.1) will expand `updateTask` to modify other fields like `completed`, `due_on`, etc., reusing the same `UPDATE_TASK` intent.
  * **Story 2.6.1:** Add "Update Task Description" functionality.
      * **Task 2.6.1.1 (C):** Define intent patterns for updating a task description within the existing `UPDATE_TASK` intent in `intent.classifier.ts`. The entity extractor should reliably pull out the task identifier (name/GID, optional project context) and the new description text.
          *   *Rationale:* The API uses the `notes` field for the main textual description of a task.
      * **Task 2.6.1.2 (C):** In `tasks.ts`, implement or enhance `updateTask(taskGid, dataToUpdate)`. For this epic, `dataToUpdate` will specifically be ` { notes: newDescription }`. Ensure `dataToUpdate` is appropriately typed (e.g., `Partial<Pick<TaskResponseData, 'notes'>>` initially, expanding as more update capabilities are added). The underlying API call `PUT /tasks/{task_gid}` expects a body like `{ "data": { "notes": "new notes..." } }`.
          *   *Reference:* The Asana Task API documentation ([Tasks - Asana API Reference](https://developers.asana.com/reference/tasks)) shows `notes` as a field in the task object, which is updated via the `PUT` endpoint.
      * **Task 2.6.1.3 (C):** Integrate into `asanaTool.ts`, including `findTaskGidByName`.
      * **Task 2.6.1.4 (C, UX):** Format success/failure response (e.g., "Successfully updated description for task 'X'.").
      * **Task 2.6.1.5 (T):** Test task description updates. 