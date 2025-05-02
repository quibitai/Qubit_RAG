import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/app/(auth)/auth';
import { db } from '@/lib/db';
import { document } from '@/lib/db/schema';
import { eq, desc } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';

// Valid document kinds
type ValidDocKind = 'text' | 'code' | 'image' | 'sheet';

// Function to validate if a string is a valid UUID
function isValidUUID(uuid: string): boolean {
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
}

export async function POST(req: NextRequest) {
  try {
    // Get the session
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 },
      );
    }

    const userId = session.user.id;

    // Parse request body
    let body: { id: string; content: string; title?: string };
    try {
      body = await req.json();
    } catch (e) {
      console.error('Failed to parse request body:', e);
      return NextResponse.json(
        { error: 'Invalid request body' },
        { status: 400 },
      );
    }

    let { id, content, title = 'Untitled Document' } = body;

    // Generate a proper UUID if id is 'new' or invalid
    if (id === 'new' || !isValidUUID(id)) {
      console.log(`Replacing invalid ID "${id}" with a proper UUID`);
      id = randomUUID();
      console.log(`Generated new UUID for document: ${id}`);
    }

    if (!id || !content) {
      return NextResponse.json(
        { error: 'Document ID and content are required' },
        { status: 400 },
      );
    }

    const now = new Date();

    // Check if document exists
    const existingDocs = await db
      .select()
      .from(document)
      .where(eq(document.id, id));

    // Sort by createdAt to find the most recent one
    const existingDoc =
      existingDocs.length > 0
        ? existingDocs.sort(
            (a, b) =>
              new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
          )[0]
        : null;

    if (existingDoc) {
      // Make sure user owns the document
      if (existingDoc.userId !== userId) {
        return NextResponse.json(
          { error: 'You do not have permission to modify this document' },
          { status: 403 },
        );
      }

      // Using type assertion to bypass type system constraints
      // Note: This is a workaround for the TypeScript error
      const documentValues = {
        id,
        title,
        content,
        userId,
        createdAt: now,
        kind: (existingDoc.kind || 'text') as string,
      };

      // Insert with type assertion
      const savedDoc = await db
        .insert(document)
        .values(documentValues as any)
        .returning();

      console.log(`Document updated successfully: ${id}`);

      return NextResponse.json({
        ...savedDoc[0],
        success: true,
        message: 'Document saved successfully',
      });
    } else {
      // Create new document with default type as 'text'
      // Using type assertion to bypass type system constraints
      const documentValues = {
        id,
        title,
        content,
        userId,
        createdAt: now,
        kind: 'text' as string,
      };

      // Insert with type assertion
      const savedDoc = await db
        .insert(document)
        .values(documentValues as any)
        .returning();

      console.log(`Document created successfully: ${id}`);

      return NextResponse.json({
        ...savedDoc[0],
        success: true,
        message: 'Document created successfully',
      });
    }
  } catch (error: any) {
    console.error('Error saving document:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to save document' },
      { status: 500 },
    );
  }
}
