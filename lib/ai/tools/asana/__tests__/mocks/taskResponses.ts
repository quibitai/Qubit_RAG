/**
 * Mock responses for Asana API task endpoints
 */

// Single task response (for task creation or retrieval)
export const mockTask = {
  gid: 'task123',
  name: 'Test Task',
  notes: 'Task description',
  permalink_url: 'https://app.asana.com/0/workspace123/task123',
  assignee: {
    gid: 'user123',
    name: 'Test User',
  },
  projects: [
    {
      gid: 'project123',
      name: 'Test Project',
    },
  ],
  due_on: '2023-12-31',
  completed: false,
  created_at: '2023-01-01T12:00:00.000Z',
  modified_at: '2023-01-02T14:30:00.000Z',
};

// Task without optional fields
export const mockMinimalTask = {
  gid: 'task456',
  name: 'Minimal Task',
  completed: false,
};

// Task with assignee but no project
export const mockTaskWithAssignee = {
  gid: 'task789',
  name: 'Task with Assignee',
  notes: 'This task is assigned but not in a project',
  permalink_url: 'https://app.asana.com/0/workspace123/task789',
  assignee: {
    gid: 'user123',
    name: 'Test User',
  },
  completed: false,
};

// Task with project but no assignee
export const mockTaskWithProject = {
  gid: 'task321',
  name: 'Task with Project',
  notes: 'This task is in a project but not assigned',
  permalink_url: 'https://app.asana.com/0/workspace123/task321',
  projects: [
    {
      gid: 'project123',
      name: 'Test Project',
    },
  ],
  completed: false,
};

// Completed task
export const mockCompletedTask = {
  gid: 'task654',
  name: 'Completed Task',
  completed: true,
  completed_at: '2023-02-15T09:45:00.000Z',
};

// List of tasks
export const mockTasksList = [
  mockTask,
  mockTaskWithAssignee,
  mockTaskWithProject,
  mockCompletedTask,
];

// Empty task list
export const mockEmptyTasksList = [];

// Mock task creation response (minimal fields typically returned)
export const mockTaskCreationResponse = {
  gid: 'newtask123',
  name: 'Newly Created Task',
  permalink_url: 'https://app.asana.com/0/workspace123/newtask123',
};

// Typeahead ambiguous task response
export const mockTaskTypeaheadAmbiguous = [
  {
    gid: 'task111',
    name: 'Marketing Plan',
    resource_type: 'task',
  },
  {
    gid: 'task222',
    name: 'Marketing Plan Review',
    resource_type: 'task',
  },
];
