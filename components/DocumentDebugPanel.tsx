'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import {
  testAPIConnectivity,
  testDocumentStreaming,
} from '@/utils/test-document-functionality';

// Simple Badge component since the imported one might not exist
function Badge({
  children,
  variant = 'default',
}: { children: React.ReactNode; variant?: 'default' | 'destructive' }) {
  return (
    <span
      className={`px-2 py-1 text-xs rounded-full font-medium ${
        variant === 'destructive'
          ? 'bg-destructive text-destructive-foreground'
          : 'bg-primary text-primary-foreground'
      }`}
    >
      {children}
    </span>
  );
}

interface DebugLogEntry {
  timestamp: string;
  message: string;
  type: 'info' | 'warning' | 'error' | 'success';
}

export function DocumentDebugPanel({ documentId }: { documentId: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const [debugLogs, setDebugLogs] = useState<DebugLogEntry[]>([]);
  const [apiStatus, setApiStatus] = useState<'unknown' | 'online' | 'offline'>(
    'unknown',
  );
  const [documentEvents, setDocumentEvents] = useState<any[]>([]);

  // Add a debug log entry
  const addLog = useCallback(
    (
      message: string,
      type: 'info' | 'warning' | 'error' | 'success' = 'info',
    ) => {
      setDebugLogs((prev) => [
        {
          timestamp: new Date().toISOString(),
          message,
          type,
        },
        ...prev.slice(0, 49), // Keep last 50 logs
      ]);
    },
    [],
  );

  // Test API connectivity
  const checkAPI = useCallback(async () => {
    addLog('Testing API connectivity...', 'info');
    const result = await testAPIConnectivity();

    if (result.success) {
      setApiStatus('online');
      addLog('API is online', 'success');
    } else {
      setApiStatus('offline');
      addLog(`API connectivity test failed: ${result.error}`, 'error');
    }
  }, [addLog]);

  // Test document streaming
  const testStreaming = useCallback(async () => {
    if (!documentId) {
      addLog('No document ID provided for streaming test', 'error');
      return;
    }

    addLog(`Testing document streaming for ID: ${documentId}`, 'info');
    const result = await testDocumentStreaming(documentId);

    if (result.success) {
      addLog('Document streaming test successful', 'success');
    } else {
      addLog(`Document streaming test failed: ${result.error}`, 'error');
    }
  }, [documentId, addLog]);

  // Listen for document update events
  useEffect(() => {
    if (!isOpen) return;

    const handleTextDelta = (event: CustomEvent) => {
      const data = event.detail;
      setDocumentEvents((prev) => [data, ...prev.slice(0, 9)]);
      addLog(`Received ${data.type} event for document`, 'info');
    };

    window.addEventListener(
      'text-delta' as any,
      handleTextDelta as EventListener,
    );

    return () => {
      window.removeEventListener(
        'text-delta' as any,
        handleTextDelta as EventListener,
      );
    };
  }, [isOpen, addLog]);

  // Check API status on initial load
  useEffect(() => {
    if (isOpen && apiStatus === 'unknown') {
      checkAPI();
    }
  }, [isOpen, apiStatus, checkAPI]);

  if (!isOpen) {
    return (
      <div className="fixed bottom-4 right-4 z-50">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setIsOpen(true)}
          className="bg-background border-primary"
        >
          Open Debug Panel
        </Button>
      </div>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 w-96 max-h-[80vh] overflow-auto">
      <Card className="shadow-lg">
        <CardHeader className="bg-muted py-2">
          <div className="flex justify-between items-center">
            <CardTitle className="text-sm">Document Debug Panel</CardTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsOpen(false)}
              className="h-6 w-6 p-0"
            >
              ✕
            </Button>
          </div>
          <CardDescription>Troubleshoot document editor issues</CardDescription>
        </CardHeader>

        <CardContent className="p-4 space-y-4">
          <div className="flex justify-between items-center">
            <div className="text-sm">
              <span className="font-semibold">Document ID:</span>{' '}
              {documentId || 'No document loaded'}
            </div>
            <Badge variant={apiStatus === 'online' ? 'default' : 'destructive'}>
              API: {apiStatus}
            </Badge>
          </div>

          <div className="space-y-2">
            <h3 className="text-sm font-semibold">Document Events</h3>
            <div className="h-24 overflow-y-auto p-2 bg-muted rounded-md text-xs">
              {documentEvents.length === 0 ? (
                <div className="text-muted-foreground">No events captured</div>
              ) : (
                documentEvents.map((event, index) => (
                  <div
                    key={`event-${event.type}-${index}-${event.timestamp || Date.now()}`}
                    className="mb-1"
                  >
                    <span className="font-mono">{event.type}:</span>{' '}
                    {JSON.stringify(event)}
                  </div>
                ))
              )}
            </div>
          </div>

          <Separator />

          <div className="space-y-2">
            <h3 className="text-sm font-semibold">Debug Logs</h3>
            <div className="h-32 overflow-y-auto p-2 bg-muted rounded-md text-xs">
              {debugLogs.map((log, index) => (
                <div
                  key={`log-${log.timestamp}-${index}`}
                  className={`mb-1 ${
                    log.type === 'error'
                      ? 'text-destructive'
                      : log.type === 'warning'
                        ? 'text-amber-500'
                        : log.type === 'success'
                          ? 'text-green-500'
                          : ''
                  }`}
                >
                  <span className="opacity-70">
                    {new Date(log.timestamp).toLocaleTimeString()}
                  </span>{' '}
                  {log.message}
                </div>
              ))}
            </div>
          </div>
        </CardContent>

        <CardFooter className="flex justify-between bg-muted p-2">
          <Button size="sm" variant="outline" onClick={checkAPI}>
            Test API
          </Button>
          <Button size="sm" variant="outline" onClick={testStreaming}>
            Test Streaming
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
