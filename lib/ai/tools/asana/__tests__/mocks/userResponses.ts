/**
 * Mock responses for Asana API user endpoints
 */

export const mockUserMe = {
  gid: 'user123',
  name: 'Test User',
  email: 'test@example.com',
  workspaces: [
    {
      gid: 'workspace123',
      name: 'Primary Workspace',
    },
    {
      gid: 'workspace456',
      name: 'Secondary Workspace',
    },
  ],
};

export const mockUserWithoutWorkspaces = {
  gid: 'user456',
  name: 'No Workspace User',
  email: 'noworkspace@example.com',
  workspaces: [],
};

export const mockErrorResponses = {
  unauthorized: {
    errors: [
      {
        message: 'Not authorized',
        help: 'Please check your API key and permissions',
      },
    ],
  },
  notFound: {
    errors: [
      {
        message: 'Not found',
        help: 'The resource you requested could not be found',
      },
    ],
  },
  rateLimited: {
    errors: [
      {
        message: 'Rate limit exceeded',
        help: 'Please try again later',
      },
    ],
  },
  serverError: {
    errors: [
      {
        message: 'Internal server error',
        help: 'Please try again later or contact Asana support',
      },
    ],
  },
};
