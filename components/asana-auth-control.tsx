'use client';

import { useSession, signIn, signOut } from 'next-auth/react';
import { Button } from '@/components/ui/button';
import { logger } from '@/lib/logger';
import { useState, useEffect } from 'react';
import { toast } from '@/components/toast';

export function AsanaAuthControl() {
  const { data: session, status, update } = useSession();
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [isAsanaConnected, setIsAsanaConnected] = useState(false);

  // Update local state when session changes
  useEffect(() => {
    if (session?.user) {
      setIsAsanaConnected(
        Boolean(
          session.user.asanaProviderAccountId &&
            session.user.asanaProviderAccountId.length > 0,
        ),
      );
    } else {
      setIsAsanaConnected(false);
    }
  }, [session]);

  // Handle connecting to Asana
  const handleConnectAsana = async () => {
    try {
      logger.debug('AsanaAuthControl', 'Initiating Asana connection');
      await signIn('asana', { callbackUrl: '/dashboard' });
    } catch (error) {
      logger.error('AsanaAuthControl', 'Failed to connect to Asana', { error });
      toast({
        type: 'error',
        description: 'Could not connect to Asana. Please try again.',
      });
    }
  };

  // Handle disconnecting from Asana
  const handleDisconnectAsana = async () => {
    try {
      setIsDisconnecting(true);
      logger.debug('AsanaAuthControl', 'Initiating Asana disconnection');

      const response = await fetch('/api/auth/disconnect', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ provider: 'asana' }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(
          errorData.error || 'Failed to disconnect Asana account',
        );
      }

      logger.info('AsanaAuthControl', 'Successfully disconnected from Asana');
      toast({
        type: 'success',
        description: 'Your Asana account has been disconnected.',
      });

      // Force a sign out and redirect to refresh the session cookie
      await signOut({ callbackUrl: '/dashboard' });
    } catch (error) {
      logger.error('AsanaAuthControl', 'Failed to disconnect from Asana', {
        error,
      });
      toast({
        type: 'error',
        description: 'Could not disconnect from Asana. Please try again.',
      });
    } finally {
      setIsDisconnecting(false);
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
          <Button
            variant="outline"
            size="sm"
            onClick={handleDisconnectAsana}
            disabled={isDisconnecting}
          >
            {isDisconnecting ? (
              <>
                <span className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                Disconnecting...
              </>
            ) : (
              'Disconnect'
            )}
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
