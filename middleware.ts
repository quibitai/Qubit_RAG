console.log('[Middleware File Execution] Middleware file top-level log.');
console.log('[Middleware] Checking environment variables...');

// Debug: Check for NEXTAUTH_SECRET/AUTH_SECRET
if (process.env.NEXTAUTH_SECRET) {
  console.log('[Middleware] NEXTAUTH_SECRET is defined');
} else if (process.env.AUTH_SECRET) {
  console.log(
    '[Middleware] AUTH_SECRET is defined, but NEXTAUTH_SECRET is missing',
  );
  // NextAuth v5 looks for NEXTAUTH_SECRET, so let's report this issue
  console.log(
    '[Middleware] Note: NextAuth v5 specifically requires NEXTAUTH_SECRET. AUTH_SECRET might not be recognized.',
  );
} else {
  console.log(
    '[Middleware] WARNING: Neither NEXTAUTH_SECRET nor AUTH_SECRET environment variables are defined',
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
    '/((?!_next|favicon.ico|api/brain|api/chat-actions|api/ping).*)',
  ],
};
