/**
 * Test utilities for the document editor
 * These functions help verify functionality and diagnose issues
 */

/**
 * Test API connectivity by calling the ping endpoint
 */
export async function testAPIConnectivity(): Promise<{
  success: boolean;
  data?: any;
  error?: string;
}> {
  try {
    const response = await fetch('/api/ping');

    if (!response.ok) {
      return {
        success: false,
        error: `API responded with status: ${response.status}`,
      };
    }

    const data = await response.json();
    return {
      success: true,
      data,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    };
  }
}

/**
 * Test document streaming by sending a test message
 */
export async function testDocumentStreaming(documentId: string): Promise<{
  success: boolean;
  data?: any;
  error?: string;
}> {
  try {
    const response = await fetch('/api/documents/stream-test', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        documentId,
        testType: 'simple-update',
        testContent: 'This is a test update from the streaming test utility.',
      }),
    });

    if (!response.ok) {
      return {
        success: false,
        error: `Streaming test API responded with status: ${response.status}`,
      };
    }

    const data = await response.json();
    return {
      success: true,
      data,
    };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : 'Unknown error during document streaming test',
    };
  }
}

/**
 * Check if an element is mounted in the document
 * Useful for debugging state update errors
 */
export function isElementMounted(elementId: string): boolean {
  return document.getElementById(elementId) !== null;
}

/**
 * Log React component lifecycle for debugging
 * @param componentName - Name of the component for logging
 * @param event - Lifecycle event (mount, update, unmount)
 * @param details - Additional details to log
 */
export function logComponentLifecycle(
  componentName: string,
  event: 'mount' | 'update' | 'unmount',
  details?: Record<string, any>,
): void {
  console.log(`[DEBUG] ${componentName} - ${event}`, details ? details : '');
}

/**
 * Verify document content is correctly synchronized
 * @param editorContent - Content from the editor
 * @param databaseContent - Content from the database
 */
export function verifyContentSync(
  editorContent: string,
  databaseContent: string,
): {
  inSync: boolean;
  diffLength?: number;
} {
  const inSync = editorContent === databaseContent;

  return {
    inSync,
    diffLength: inSync
      ? undefined
      : Math.abs(editorContent.length - databaseContent.length),
  };
}

/**
 * Monitor document updates with a simple event listener
 * @param callback - Function to call when a document update occurs
 * @returns Function to remove the event listener
 */
export function monitorDocumentUpdates(
  callback: (eventData: any) => void,
): () => void {
  const handler = (event: CustomEvent) => {
    callback(event.detail);
  };

  window.addEventListener('text-delta' as any, handler as EventListener);

  return () => {
    window.removeEventListener('text-delta' as any, handler as EventListener);
  };
}
