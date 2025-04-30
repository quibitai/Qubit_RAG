console.log('[Middleware File Execution] Middleware file top-level log.');

export { auth as middleware } from '@/app/(auth)/auth';

// TEMPORARILY SIMPLIFIED MATCHER FOR TESTING:
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/ (Next.js internals)
     * - favicon.ico (favicon file)
     * We are intentionally *including* /api routes for now to see if auth runs there.
     */
    '/((?!_next|favicon.ico).*)',
  ],
};
