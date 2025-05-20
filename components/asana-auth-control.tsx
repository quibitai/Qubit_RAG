'use client';

import { useSession, signIn, signOut } from 'next-auth/react';
import { Button } from '@/components/ui/button';
import { logger } from '@/lib/logger';

export function AsanaAuthControl() {
  const { data: session, status } = useSession();

  // Handle connecting to Asana
  const handleConnectAsana = async () => {
    try {
      logger.debug('AsanaAuthControl', 'Initiating Asana connection');
      await signIn('asana', { callbackUrl: '/(chat)/dashboard' });
    } catch (error) {
      logger.error('AsanaAuthControl', 'Failed to connect to Asana', { error });
    }
  };

  // Handle disconnecting from Asana
  const handleDisconnectAsana = async () => {
    try {
      logger.debug('AsanaAuthControl', 'Initiating Asana disconnection');
      // TODO: Implement server-side disconnect logic
      logger.info(
        'AsanaAuthControl',
        'Disconnect functionality to be fully implemented server-side',
      );
    } catch (error) {
      logger.error('AsanaAuthControl', 'Failed to disconnect from Asana', {
        error,
      });
    }
  };

  // Show loading state
  if (status === 'loading') {
    return (
      <div className="flex items-center space-x-2">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        <span className="text-sm text-muted-foreground">
          Loading session...
        </span>
      </div>
    );
  }

  // Don't show anything if not authenticated
  if (status === 'unauthenticated') {
    return null;
  }

  // Show connection status and actions
  const isAsanaConnected = Boolean(session?.user?.asanaProviderAccountId);

  return (
    <div className="flex flex-col space-y-2 rounded-lg border p-4">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h3 className="text-sm font-medium">Asana Integration</h3>
          <p className="text-sm text-muted-foreground">
            {isAsanaConnected ? 'Connected to Asana' : 'Not connected to Asana'}
          </p>
        </div>
        {isAsanaConnected ? (
          <Button variant="outline" size="sm" onClick={handleDisconnectAsana}>
            Disconnect
          </Button>
        ) : (
          <Button variant="default" size="sm" onClick={handleConnectAsana}>
            Connect
          </Button>
        )}
      </div>
    </div>
  );
}
