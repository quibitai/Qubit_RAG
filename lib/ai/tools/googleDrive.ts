/**
 * Google Drive Integration Tools
 *
 * This module provides direct integration with Google Drive API
 * for document listing and content retrieval.
 */

import { google } from 'googleapis';

// Default folder ID for knowledge base documents
const DEFAULT_KNOWLEDGE_BASE_FOLDER = '1AxSBHUSU86qRoU6QsiXbAc1UDmz-kWSO';

/**
 * Initialize Google Drive client with authentication
 */
function getDriveClient() {
  // Initialize the Google Auth client
  const auth = new google.auth.GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/drive.readonly'],
    // Using service account credentials from environment variables
    credentials: process.env.GOOGLE_APPLICATION_CREDENTIALS
      ? JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS)
      : undefined,
    keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS_FILE,
  });

  // Create and return the Google Drive client
  return google.drive({ version: 'v3', auth });
}

/**
 * List documents in a Google Drive folder
 *
 * @param folderId - The ID of the Google Drive folder to list documents from
 * @returns Promise with the list of documents (id, name)
 */
export async function listDocumentsLogic(
  folderId: string = DEFAULT_KNOWLEDGE_BASE_FOLDER,
): Promise<{ documents: Array<{ id: string; name: string }> }> {
  try {
    // Get the Drive client
    const drive = getDriveClient();

    // Query parameters
    const query = `'${folderId}' in parents and trashed = false`;

    // Fetch files list from Google Drive
    const response = await drive.files.list({
      q: query,
      fields: 'files(id, name)',
      pageSize: 1000,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });

    // Extract and format the documents list
    const documents =
      response.data.files?.map((file) => ({
        id: file.id || '',
        name: file.name || '',
      })) || [];

    return { documents };
  } catch (error) {
    console.error(
      '[listDocumentsLogic] Error fetching documents from Google Drive:',
      error,
    );
    throw new Error(
      `Failed to list documents: ${error instanceof Error ? error.message : 'Unknown error'}`,
    );
  }
}

/**
 * Get file contents from Google Drive
 *
 * @param fileId - The ID of the Google Drive file
 * @returns Promise with the file contents
 */
export async function getFileContentsLogic(
  fileId: string,
): Promise<{ text: string }> {
  // This is a placeholder for future implementation
  // Will be implemented in subsequent phases
  throw new Error('getFileContentsLogic not yet implemented');
}
