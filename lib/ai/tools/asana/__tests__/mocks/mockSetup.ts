/**
 * Mock setup utilities for Asana API tests
 */

import { vi, expect, beforeEach } from 'vitest';

/**
 * Mock Asana API response for testing
 *
 * @param mockData The mock data to return
 * @param statusCode HTTP status code for the mock response
 * @param throwError Whether to throw an error instead of returning a response
 * @returns A mock fetch function
 */
export function mockAsanaResponse(
  mockData: any,
  statusCode = 200,
  throwError = false,
): void {
  if (throwError) {
    vi.spyOn(global, 'fetch').mockRejectedValueOnce(new Error('Network error'));
    return;
  }

  // Create a mock Response object
  const mockResponse = {
    ok: statusCode >= 200 && statusCode < 300,
    status: statusCode,
    statusText: statusCode === 200 ? 'OK' : 'Error',
    json: vi.fn().mockResolvedValue({ data: mockData }),
    text: vi.fn().mockResolvedValue(JSON.stringify({ data: mockData })),
  };

  // Mock the fetch function
  vi.spyOn(global, 'fetch').mockResolvedValueOnce(mockResponse as any);
}

/**
 * Mock Asana API error response
 *
 * @param errorMessage Error message
 * @param statusCode HTTP status code for the error
 * @param helpText Optional help text for the error
 */
export function mockAsanaErrorResponse(
  errorMessage: string,
  statusCode = 400,
  helpText?: string,
): void {
  const errorData = {
    errors: [
      {
        message: errorMessage,
        ...(helpText ? { help: helpText } : {}),
      },
    ],
  };

  const mockResponse = {
    ok: false,
    status: statusCode,
    statusText: 'Error',
    json: vi.fn().mockResolvedValue(errorData),
    text: vi.fn().mockResolvedValue(JSON.stringify(errorData)),
  };

  vi.spyOn(global, 'fetch').mockResolvedValueOnce(mockResponse as any);
}

// Store original env values at the module level
const originalEnv = { ...process.env };

/**
 * Set up environment variables for testing
 *
 * Also resets modules to ensure fresh imports with updated env vars
 */
export function setupAsanaTestEnv(): void {
  // Reset modules to ensure fresh env var imports
  vi.resetModules();

  // Define workspace and team GIDs explicitly
  const WORKSPACE_GID = 'workspace123';
  const TEAM_GID = 'team123';
  const API_KEY = 'mock-api-key';

  // Set up mock environment variables with consistent test values
  process.env.ASANA_PAT = API_KEY;
  process.env.NATIVE_ASANA_PAT = API_KEY;
  process.env.ASANA_DEFAULT_WORKSPACE_GID = WORKSPACE_GID;
  process.env.ASANA_DEFAULT_TEAM_GID = TEAM_GID;

  // Ensure global tool configs are also set
  if (!global.CURRENT_TOOL_CONFIGS) {
    global.CURRENT_TOOL_CONFIGS = {};
  }

  global.CURRENT_TOOL_CONFIGS = {
    ...global.CURRENT_TOOL_CONFIGS,
    nativeAsana: {
      apiKey: API_KEY,
      defaultWorkspaceGid: WORKSPACE_GID,
      defaultTeamGid: TEAM_GID,
    },
  };

  // Mock the AsanaApiClient
  vi.mock('../api-client', () => {
    return {
      createAsanaClient: vi.fn().mockImplementation(() => ({
        request: vi.fn().mockResolvedValue([]),
        createResource: vi.fn().mockResolvedValue({}),
      })),
    };
  });
}

/**
 * Clear environment variables after testing
 */
export function clearAsanaTestEnv(): void {
  // Restore original environment variables
  process.env = { ...originalEnv };

  // Clear global configs
  if (global.CURRENT_TOOL_CONFIGS?.nativeAsana) {
    global.CURRENT_TOOL_CONFIGS = {
      ...global.CURRENT_TOOL_CONFIGS,
      nativeAsana: undefined,
    };
  }

  // Clear mocks
  vi.clearAllMocks();
}

/**
 * Verify that fetch was called with the expected parameters
 *
 * @param url Expected URL or URL pattern
 * @param options Expected fetch options
 */
export function verifyFetchCall(
  url: string | RegExp,
  options?: RequestInit,
): void {
  expect(global.fetch).toHaveBeenCalledWith(
    expect.stringMatching(url),
    options ? expect.objectContaining(options) : expect.anything(),
  );
}

/**
 * Verify that fetch was called with the expected body
 *
 * @param expectedBody Expected request body
 */
export function verifyFetchBody(expectedBody: any): void {
  expect(global.fetch).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({
      body: expect.stringContaining(JSON.stringify(expectedBody)),
    }),
  );
}
