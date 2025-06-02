'use client';

import Link from 'next/link';
import { Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useSession } from 'next-auth/react';

/**
 * Admin Navigation Link Component
 *
 * Provides a link to the admin dashboard for authenticated users.
 * Can be integrated into the main navigation or sidebar.
 */
export function AdminNavLink() {
  const { data: session } = useSession();

  // Only show for authenticated users
  if (!session?.user) {
    return null;
  }

  return (
    <Link href="/admin">
      <Button
        variant="ghost"
        size="sm"
        className="text-sm font-medium transition-colors hover:text-primary"
      >
        <Shield className="w-4 h-4 mr-2" />
        Admin
      </Button>
    </Link>
  );
}

/**
 * Admin Quick Status Component
 *
 * Shows a quick status indicator in the navigation
 */
export function AdminQuickStatus() {
  const { data: session } = useSession();

  if (!session?.user) {
    return null;
  }

  return (
    <Link href="/admin">
      <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-green-100 text-green-700 text-xs font-medium hover:bg-green-200 transition-colors">
        <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
        System Operational
      </div>
    </Link>
  );
}
