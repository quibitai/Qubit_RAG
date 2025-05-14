/**
 * Document Data Structure and Operations
 *
 * This module defines the Document data structure and provides functions for
 * document operations such as creation, retrieval, update, and deletion.
 */

import { db } from './client';
import { document } from './schema';
import { randomUUID } from 'node:crypto';

/**
 * Document interface that accurately reflects the database schema
 * Includes all columns: id, createdAt, title, content, userId, text, client_id
 */
export interface Document {
  id: string;
  createdAt: Date;
  title: string;
  content: string | null;
  userId: string;
  kind: 'text' | 'code' | 'image' | 'sheet';
  clientId: string;
}

/**
 * Input parameters for document creation
 */
export interface CreateDocumentParams {
  // Required parameters
  createdAtInput: Date;
  titleInput: string;
  userIdInput: string;
  clientIdInput: string;

  // Optional parameters
  contentInput?: string | null;
  kindInput?: 'text' | 'code' | 'image' | 'sheet';
  idInput?: string;
}

/**
 * Creates a new document in the database
 *
 * @param params - Document creation parameters
 * @returns The newly created document
 * @throws Error if validation fails or database operation fails
 */
export async function createDocument(
  params: CreateDocumentParams,
): Promise<Document> {
  const {
    createdAtInput,
    titleInput,
    userIdInput,
    clientIdInput,
    contentInput = null,
    kindInput = 'text',
    idInput,
  } = params;

  // Input validation
  if (!createdAtInput || !(createdAtInput instanceof Date)) {
    throw new Error('createdAtInput must be a valid Date object');
  }

  if (
    !titleInput ||
    typeof titleInput !== 'string' ||
    titleInput.trim() === ''
  ) {
    throw new Error('titleInput must be a non-empty string');
  }

  if (
    !userIdInput ||
    typeof userIdInput !== 'string' ||
    userIdInput.trim() === ''
  ) {
    throw new Error('userIdInput must be a non-empty string');
  }

  // Validate UUID format for userIdInput
  const uuidPattern =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidPattern.test(userIdInput)) {
    throw new Error('userIdInput must be a valid UUID');
  }

  if (
    !clientIdInput ||
    typeof clientIdInput !== 'string' ||
    clientIdInput.trim() === ''
  ) {
    throw new Error('clientIdInput must be a non-empty string');
  }

  // Validate idInput if provided
  if (idInput !== undefined && !uuidPattern.test(idInput)) {
    throw new Error('idInput must be a valid UUID');
  }

  // Prepare document values
  const documentValues = {
    id: idInput || randomUUID(), // Use provided ID or generate one
    createdAt: createdAtInput,
    title: titleInput,
    content: contentInput,
    userId: userIdInput,
    kind: kindInput,
    clientId: clientIdInput,
  };

  try {
    console.log(`[DB] Creating document with ID: ${documentValues.id}`);

    // Insert document and return the created document
    const result = await db.insert(document).values(documentValues).returning();

    if (!result || result.length === 0) {
      throw new Error(
        'Failed to create document: No result returned from database',
      );
    }

    // Return the newly created document
    const createdDoc = result[0];

    // Map to our Document interface
    return {
      id: createdDoc.id,
      createdAt: createdDoc.createdAt,
      title: createdDoc.title,
      content: createdDoc.content,
      userId: createdDoc.userId,
      kind: createdDoc.kind,
      clientId: createdDoc.clientId,
    };
  } catch (error) {
    console.error('Failed to create document in database:', error);
    throw error;
  }
}
