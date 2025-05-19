/**
 * Mock responses for Asana API project endpoints
 */

// Single project response
export const mockProject = {
  gid: 'project123',
  name: 'Test Project',
  permalink_url: 'https://app.asana.com/0/project123/list',
  archived: false,
  color: 'light-green',
  team: {
    gid: 'team123',
    name: 'Development Team',
  },
  created_at: '2023-01-01T10:00:00.000Z',
  modified_at: '2023-01-15T14:30:00.000Z',
  current_status: {
    title: 'On Track',
    color: 'green',
  },
  due_date: '2023-12-31',
};

// Project with minimal fields
export const mockMinimalProject = {
  gid: 'project456',
  name: 'Minimal Project',
  archived: false,
};

// Archived project
export const mockArchivedProject = {
  gid: 'project789',
  name: 'Archived Project',
  permalink_url: 'https://app.asana.com/0/project789/list',
  archived: true,
  color: 'light-red',
};

// Project without team
export const mockProjectWithoutTeam = {
  gid: 'project321',
  name: 'No Team Project',
  permalink_url: 'https://app.asana.com/0/project321/list',
  archived: false,
};

// List of projects
export const mockProjectsList = [
  mockProject,
  mockMinimalProject,
  mockProjectWithoutTeam,
];

// List including archived projects
export const mockProjectsListWithArchived = [
  mockProject,
  mockMinimalProject,
  mockProjectWithoutTeam,
  mockArchivedProject,
];

// Empty project list
export const mockEmptyProjectsList = [];

// Mock typeahead project responses for different scenarios
export const mockTypeaheadExactMatch = [
  {
    gid: 'project123',
    name: 'Marketing',
    resource_type: 'project',
  },
];

export const mockTypeaheadNoMatch = [];

export const mockTypeaheadAmbiguous = [
  {
    gid: 'project111',
    name: 'Marketing',
    resource_type: 'project',
  },
  {
    gid: 'project222',
    name: 'Marketing Campaigns',
    resource_type: 'project',
  },
  {
    gid: 'project333',
    name: 'Digital Marketing',
    resource_type: 'project',
  },
];

export const mockTypeaheadSingleNoExactMatch = [
  {
    gid: 'project444',
    name: 'Marketing Plan',
    resource_type: 'project',
  },
];
