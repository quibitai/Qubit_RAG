/**
 * Asana integration constants
 */

// Asana API base URL
export const ASANA_API_BASE_URL = 'https://app.asana.com/api/1.0';

// API request headers
export const DEFAULT_HEADERS = {
  'Content-Type': 'application/json',
  Accept: 'application/json',
  'Asana-Enable': 'new_user_task_lists,new_project_templates',
};
