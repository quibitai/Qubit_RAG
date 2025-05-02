// Utility functions for document management

/**
 * Validate if a string is a properly formatted UUID
 */
export function isValidDocumentId(id: string): boolean {
  // Special case - 'new' is a reserved ID for creating new documents
  if (id === 'new') return false;

  // UUID regex pattern
  const uuidPattern =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidPattern.test(id);
}

/**
 * Generate a new UUID for documents
 */
export function generateDocumentId(): string {
  // Use crypto.randomUUID() for secure UUID generation
  return crypto.randomUUID();
}

/**
 * Check if we should allow saving for this document ID
 */
export function canSaveDocument(id: string | null): boolean {
  if (!id) return false;
  return isValidDocumentId(id);
}

/**
 * Create a safe document redirect URL
 */
export function createDocumentUrl(id: string): string {
  return `/editor/${encodeURIComponent(id)}`;
}

/**
 * Reset document-related local storage for a clean state
 */
export function clearDocumentStorage(id: string): void {
  try {
    localStorage.removeItem(`doc-${id}-lastUpdate`);
  } catch (error) {
    console.error('Error clearing document storage:', error);
  }
}
