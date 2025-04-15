// Forwards requests to the actual route implementation
// in /app/api/chat/route.ts

import { POST, DELETE } from '@/app/api/chat/route';

export { POST, DELETE };

// Ensure any other necessary exports (like runtime config) are also added if needed.
export const maxDuration = 60; // Example: Keep runtime config if it was present
