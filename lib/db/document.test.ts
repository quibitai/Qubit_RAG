/**
 * Test file for document.ts
 *
 * This file demonstrates how to use the createDocument function with proper error handling.
 * Note: This is not an actual test file to be run with a test runner, but rather a demonstration.
 */

import {
  createDocument,
  type Document,
  type CreateDocumentParams,
} from './document';

/**
 * Example function showing how to create a document with proper error handling
 */
async function exampleCreateDocument(): Promise<Document> {
  try {
    // Required parameters for document creation
    const params: CreateDocumentParams = {
      createdAtInput: new Date(), // Current date/time - must be provided by application
      titleInput: 'Sample Document',
      userIdInput: '12345678-1234-1234-1234-123456789012', // Valid UUID format
      clientIdInput: 'default',

      // Optional parameters
      contentInput: 'This is the content of the sample document.',
      kindInput: 'text', // One of: 'text', 'code', 'image', 'sheet'
      // idInput: '87654321-4321-4321-4321-210987654321', // If you want to specify the ID
    };

    console.log('Creating document with params:', params);

    // Create the document
    const document: Document = await createDocument(params);

    console.log('Document created successfully:', document);
    console.log(`Document ID: ${document.id}`);
    console.log(`Created At: ${document.createdAt}`);
    console.log(`Title: ${document.title}`);
    console.log(`Content: ${document.content}`);
    console.log(`Kind: ${document.kind}`);

    // Access other document properties
    console.log(`User ID: ${document.userId}`);
    console.log(`Client ID: ${document.clientId}`);

    return document;
  } catch (error) {
    // Handle specific error types
    if (error instanceof Error) {
      console.error('Failed to create document:', error.message);

      // Handle specific error cases
      if (error.message.includes('foreign key constraint')) {
        console.error(
          'The user ID or client ID does not exist in the database.',
        );
      } else if (error.message.includes('UUID')) {
        console.error('Invalid UUID format provided.');
      }
    } else {
      console.error('Unknown error occurred:', error);
    }

    throw error; // Re-throw or handle as needed
  }
}

/**
 * Example of creating a document with minimal required parameters
 */
async function createMinimalDocument(): Promise<Document> {
  try {
    // Only provide the required parameters
    const document = await createDocument({
      createdAtInput: new Date(),
      titleInput: 'Minimal Document',
      userIdInput: '12345678-1234-1234-1234-123456789012',
      clientIdInput: 'default',
    });

    console.log('Minimal document created:', document);
    return document;
  } catch (error) {
    console.error('Failed to create minimal document:', error);
    throw error;
  }
}

/**
 * Example usage in an API route or service
 *
 * This demonstrates how you might use the createDocument function in a real application.
 */
async function apiRouteExample(req: any, res: any): Promise<void> {
  try {
    const { title, content, userId, clientId, kind } = req.body;

    // Validate required fields from request
    if (!title || !userId || !clientId) {
      res.status(400).json({ error: 'Missing required fields' });
      return;
    }

    // Create document with provided parameters
    const document = await createDocument({
      createdAtInput: new Date(), // Current timestamp
      titleInput: title,
      userIdInput: userId,
      clientIdInput: clientId,
      contentInput: content,
      kindInput: kind as 'text' | 'code' | 'image' | 'sheet',
    });

    // Return success response
    res.status(201).json({
      success: true,
      message: 'Document created successfully',
      document,
    });
  } catch (error) {
    // Handle errors
    if (error instanceof Error) {
      res.status(400).json({ error: error.message });
    } else {
      res.status(500).json({ error: 'An unknown error occurred' });
    }
  }
}

// Export examples for potential use elsewhere
export { exampleCreateDocument, createMinimalDocument, apiRouteExample };
