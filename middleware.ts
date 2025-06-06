import { logger } from './lib/logger';

logger.debug('Middleware', 'Middleware file execution');
logger.debug('Middleware', 'Checking environment variables');

// Debug: Check for NEXTAUTH_SECRET/AUTH_SECRET
if (process.env.NEXTAUTH_SECRET) {
  logger.debug('Middleware', 'NEXTAUTH_SECRET is defined');
} else if (process.env.AUTH_SECRET) {
  logger.debug(
    'Middleware',
    'AUTH_SECRET is defined, but NEXTAUTH_SECRET is missing',
  );
  // NextAuth v5 looks for NEXTAUTH_SECRET, so let's report this issue
  logger.warn(
    'Middleware',
    'NextAuth v5 specifically requires NEXTAUTH_SECRET. AUTH_SECRET might not be recognized.',
  );
} else {
  logger.warn(
    'Middleware',
    'Neither NEXTAUTH_SECRET nor AUTH_SECRET environment variables are defined',
  );
}

// Export directly from auth module
export { auth as middleware } from '@/app/(auth)/auth';

// TEMPORARILY SIMPLIFIED MATCHER FOR TESTING:
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/ (Next.js internals)
     * - favicon.ico (favicon file)
     * - public files (images, etc.)
     * - api routes that need to bypass auth
     */
    '/((?!_next|favicon.ico|api/brain|api/chat-actions|api/ping|api/test-artifact-fix|api/test-artifact-streaming|api/test-tool-binding|api/test-direct-openai|api/test-minimal-tool-forcing).*)',
  ],
};
