import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Authentication and routing middleware
 *
 * This middleware handles authentication for the application:
 * - In development mode: Bypasses authentication entirely
 * - In production mode: Would integrate with a proper auth system
 */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Public paths that don't require authentication
  const isPublicPath =
    pathname === '/login' ||
    pathname === '/register' ||
    pathname.startsWith('/_next') ||
    pathname.includes('/api/auth');

  // Development mode bypass (remove this in production-ready code)
  if (process.env.NODE_ENV === 'development') {
    console.log(
      `[Middleware] Development mode: Bypassing authentication checks`,
    );
    return NextResponse.next();
  }

  // For production: implement proper authentication logic
  // This is a placeholder that would be replaced with proper auth integration
  if (!isPublicPath) {
    // Example: Redirect to login if no auth token is present
    // In a real app, you would validate the token with your auth provider
    const authToken = request.cookies.get('auth-token')?.value;

    if (!authToken) {
      const loginUrl = new URL('/login', request.url);
      return NextResponse.redirect(loginUrl);
    }

    // Add additional token validation logic here for production
  }

  return NextResponse.next();
}

// Configure middleware to run on specific paths
export const config = {
  matcher: [
    // Match all paths except static assets and API routes that handle their own auth
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
